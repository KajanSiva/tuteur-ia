import { AIMessage, SystemMessage } from "@langchain/core/messages";
import {
  Annotation,
  type BaseCheckpointSaver,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import type { Intent } from "@tuteur/shared";

import { getModel } from "../llm/models.js";
import { IntentSchema, routeOnIntent } from "./intent.js";
import { reviseNode } from "./revise.js";

// Parent graph state: the shared transcript plus the router's own scalars.
// MessagesAnnotation supplies the append reducer for `messages`; scalars use the
// default last-value reducer.
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
});

const CLASSIFY_SYSTEM = `Tu es le routeur d'intention d'un tuteur scolaire (CM2, Histoire).
Classe le DERNIER message de l'élève dans exactement une intention :
- "revise" : elle veut réviser / être interrogée sur une leçon.
- "ingest" : elle veut ajouter ou transmettre une nouvelle leçon.
- "qa" : elle pose une question ponctuelle sur une leçon.
- "out_of_scope" : message hors du cadre scolaire des leçons.
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

function flowPlaceholder(flow: string) {
  return async () => ({
    messages: [new AIMessage(`Flux « ${flow} » bientôt disponible.`)],
  });
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

// Router workflow: classify (the only LLM call) → deterministic conditional
// edge → one terminal node per intent. revise/qa/ingest are placeholders until
// their subgraphs land; out_of_scope and clarify are their final behaviour.
export function buildRouterGraph(checkpointer?: BaseCheckpointSaver) {
  return new StateGraph(RouterState)
    .addNode("classify", classify)
    .addNode("revise", reviseNode)
    .addNode("qa", flowPlaceholder("qa"))
    .addNode("ingest", flowPlaceholder("ingest"))
    .addNode("out_of_scope", outOfScope)
    .addNode("clarify", clarify)
    .addEdge(START, "classify")
    .addConditionalEdges("classify", routeOnIntent, {
      revise: "revise",
      qa: "qa",
      ingest: "ingest",
      out_of_scope: "out_of_scope",
      clarify: "clarify",
    })
    .addEdge("revise", END)
    .addEdge("qa", END)
    .addEdge("ingest", END)
    .addEdge("out_of_scope", END)
    .addEdge("clarify", END)
    .compile({ checkpointer });
}
