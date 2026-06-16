import { AIMessage, SystemMessage } from "@langchain/core/messages";
import {
  Annotation,
  type BaseCheckpointSaver,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import type { Intent, OverwriteChoice } from "@tuteur/shared";

import type { ExtractedLesson } from "../memory/lesson-ingest.js";
import { getModel } from "../llm/models.js";
import {
  afterConfirm,
  afterDetect,
  afterParse,
  cancelOverwriteNode,
  confirmOverwriteNode,
  detectCollisionNode,
  type IngestCollision,
  parseLessonNode,
  persistDraftNode,
  recapNode,
} from "./ingest.js";
import { IntentSchema, routeOnIntent } from "./intent.js";
import { afterResolveLesson, resolveLessonNode } from "./lesson-resolver.js";
import type { RoutingPhase } from "./phase.js";
import {
  advanceNode,
  afterHydrate,
  decideAfterAdvance,
  decideAfterEvaluate,
  evaluateNode,
  finishNode,
  hydrateNode,
  type MasterySignal,
  routeStart,
  socraticNode,
} from "./revise.js";

// Parent graph state: the shared transcript, the router's own scalars, and the
// revise flow's session channels (the concept loop, carried across turns by the
// checkpointer). MessagesAnnotation supplies the append reducer for `messages`;
// every scalar uses the default last-value reducer.
export const RouterState = Annotation.Root({
  ...MessagesAnnotation.spec,
  intent: Annotation<Intent | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  confidence: Annotation<number | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  studentId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  lessonId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  sessionConceptIds: Annotation<string[] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  conceptCursor: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  turnsOnConcept: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  // The single routing discriminant read at START (replaces the old
  // reviseActive / pendingLessonChoice / enterReviseLessonId booleans).
  phase: Annotation<RoutingPhase>({
    reducer: (_, next) => next,
    default: () => "idle",
  }),
  masterySignal: Annotation<MasterySignal | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  sessionTraceId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  pendingIngestion: Annotation<ExtractedLesson | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  ingestedLessonId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  collision: Annotation<IngestCollision | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  overwriteChoice: Annotation<OverwriteChoice | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

const CLASSIFY_SYSTEM = `Tu es le routeur d'intention d'un tuteur scolaire (CM2, Histoire).
Classe le DERNIER message de l'élève dans exactement une intention :
- "revise" : elle veut réviser / être interrogée sur une leçon.
- "ingest" : elle veut ajouter ou transmettre une nouvelle leçon.
- "out_of_scope" : tout le reste (question hors leçon, bavardage, hors cadre scolaire).
Donne aussi une confidence entre 0 et 1.`;

// We bind the schema as a forced tool and read the parsed tool-call args, rather
// than withStructuredOutput. Two failure modes are avoided at once under the
// graph's `streamMode: messages`: the default tool-calling parser throws
// (OUTPUT_PARSING_FAILURE on empty text), and native output (method: jsonSchema)
// streams the schema JSON as visible UI text. A tool_use block is neither — the
// classifier stays internal.
async function classify(state: typeof RouterState.State) {
  const base = await getModel("classifier");
  if (!base.bindTools) {
    throw new Error("classifier model does not support tool calling");
  }
  const model = base.bindTools(
    [
      {
        name: "classify_intent",
        description: "Classe l'intention de l'élève.",
        schema: IntentSchema,
      },
    ],
    { tool_choice: "classify_intent" },
  );
  const response = await model.invoke([
    new SystemMessage(CLASSIFY_SYSTEM),
    ...state.messages,
  ]);

  // A malformed or missing classification routes to clarify (ask), never a guess.
  const parsed = IntentSchema.safeParse(response.tool_calls?.[0]?.args);
  if (!parsed.success) {
    return { intent: null, confidence: 0 };
  }
  return { intent: parsed.data.intent, confidence: parsed.data.confidence };
}

async function outOfScope() {
  return {
    messages: [
      new AIMessage(
        "Je t'aide à réviser tes leçons d'histoire. On reprend ? Dis-moi quelle leçon tu veux travailler.",
      ),
    ],
  };
}

async function clarify() {
  return {
    messages: [
      new AIMessage(
        "Je n'ai pas bien saisi. Tu veux réviser une leçon, en ajouter une nouvelle, ou poser une question dessus ?",
      ),
    ],
  };
}

// Router workflow with the revise state machine. routeStart switches on the
// single routing phase, skipping classify when a flow is in progress. classify
// (the only router LLM call) routes by intent. The revise loop is run-to-END +
// re-invoke per message: one POST = one dialogue turn.
//   START ─ phase ─ revising        → evaluate ─ decide ─ advance ─ socratic/finish
//          ├ choosing_lesson → resolveLesson (the student's lesson answer)
//          ├ entering_revise → revise (a chip set the lesson)
//          └ idle           → classify → { revise → resolveLesson | ingest | … }
// resolveLesson maps the lesson hint to a lesson (→ revise/hydrate) or asks which
// one. ingest parses lesson images (vision), persists a draft, and streams a
// recap. out_of_scope and clarify are final behaviour.
export function buildRouterGraph(checkpointer?: BaseCheckpointSaver) {
  return new StateGraph(RouterState)
    .addNode("classify", classify)
    .addNode("resolveLesson", resolveLessonNode)
    .addNode("revise", hydrateNode)
    .addNode("socratic", socraticNode)
    .addNode("evaluate", evaluateNode)
    .addNode("advance", advanceNode)
    .addNode("finish", finishNode)
    .addNode("ingestParse", parseLessonNode)
    .addNode("ingestDetect", detectCollisionNode)
    .addNode("ingestConfirm", confirmOverwriteNode)
    .addNode("ingestCancel", cancelOverwriteNode)
    .addNode("ingestPersist", persistDraftNode)
    .addNode("ingestRecap", recapNode)
    .addNode("out_of_scope", outOfScope)
    .addNode("clarify", clarify)
    .addConditionalEdges(START, routeStart, {
      classify: "classify",
      evaluate: "evaluate",
      resolveLesson: "resolveLesson",
      revise: "revise",
    })
    .addConditionalEdges("classify", routeOnIntent, {
      revise: "resolveLesson",
      ingest: "ingestParse",
      out_of_scope: "out_of_scope",
      clarify: "clarify",
    })
    .addConditionalEdges("resolveLesson", afterResolveLesson, {
      revise: "revise",
      [END]: END,
    })
    .addConditionalEdges("revise", afterHydrate, {
      socratic: "socratic",
      finish: "finish",
    })
    .addConditionalEdges("evaluate", decideAfterEvaluate, {
      advance: "advance",
      socratic: "socratic",
    })
    .addConditionalEdges("advance", decideAfterAdvance, {
      socratic: "socratic",
      finish: "finish",
    })
    .addConditionalEdges("ingestParse", afterParse, {
      ingestDetect: "ingestDetect",
      [END]: END,
    })
    .addConditionalEdges("ingestDetect", afterDetect, {
      ingestConfirm: "ingestConfirm",
      ingestPersist: "ingestPersist",
    })
    .addConditionalEdges("ingestConfirm", afterConfirm, {
      ingestCancel: "ingestCancel",
      ingestPersist: "ingestPersist",
    })
    .addEdge("ingestPersist", "ingestRecap")
    .addEdge("ingestRecap", END)
    .addEdge("ingestCancel", END)
    .addEdge("socratic", END)
    .addEdge("finish", END)
    .addEdge("out_of_scope", END)
    .addEdge("clarify", END)
    .compile({ checkpointer });
}
