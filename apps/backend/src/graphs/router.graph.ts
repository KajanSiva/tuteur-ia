import { AIMessage, SystemMessage } from "@langchain/core/messages";
import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import type { Intent } from "@tuteur/shared";

import { getModel } from "../llm/models.js";
import { IntentSchema, routeOnIntent } from "./intent.js";

// Parent graph state: the shared transcript plus the router's own scalars.
// MessagesAnnotation supplies the append reducer for `messages`; scalars use the
// default last-value reducer.
export const RouterState = Annotation.Root({
  ...MessagesAnnotation.spec,
  intent: Annotation<Intent | null>(),
  confidence: Annotation<number | null>(),
});

const CLASSIFY_SYSTEM = `Tu es le routeur d'intention d'un tuteur scolaire (CM2, Histoire).
Classe le DERNIER message de l'élève dans exactement une intention :
- "revise" : elle veut réviser / être interrogée sur une leçon.
- "ingest" : elle veut ajouter ou transmettre une nouvelle leçon.
- "qa" : elle pose une question ponctuelle sur une leçon.
- "out_of_scope" : message hors du cadre scolaire des leçons.
Donne aussi une confidence entre 0 et 1.`;

async function classify(state: typeof RouterState.State) {
  const model = getModel("classifier").withStructuredOutput(IntentSchema, {
    name: "classify_intent",
  });
  const result = await model.invoke([
    new SystemMessage(CLASSIFY_SYSTEM),
    ...state.messages,
  ]);
  return { intent: result.intent, confidence: result.confidence };
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
export function buildRouterGraph() {
  return new StateGraph(RouterState)
    .addNode("classify", classify)
    .addNode("revise", flowPlaceholder("revise"))
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
    .compile();
}
