import "dotenv/config";

import { LangfuseClient } from "@langfuse/client";
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

import { buildSocraticSystem } from "../graphs/revise.js";
import { getModel } from "../llm/models.js";
import {
  flushObservability,
  startObservability,
} from "../observability/langfuse.js";
import { EVAL_CASES, caseToBundle, type EvalInput } from "./cases.js";
import {
  type JudgeContext,
  runFactualJudge,
  runSocraticJudge,
  scoreFactual,
  scoreSocratic,
} from "./judges.js";

// LLM-as-judge eval over a curated golden set, surfaced as a Langfuse Dataset
// Run (brief §11). The dataset is upserted by stable id; the experiment runs the
// real socratic tutor on each case (or a planted control output) and the two
// judges attach scores. Re-run any time: `pnpm --filter @tuteur/backend eval`.

const DATASET_NAME = "socratic-eval-v1";

function judgeContext(input: EvalInput, expectedAnswer: string): JudgeContext {
  return {
    conceptLabel: input.concept.label,
    precisionBar: input.concept.precisionBar,
    lessonExcerpt: input.lesson.contentMd,
    expectedAnswer,
  };
}

function priorTurnsToMessages(input: EvalInput): BaseMessage[] {
  const turns = input.priorTurns.map((turn) =>
    turn.role === "student"
      ? new HumanMessage(turn.text)
      : new AIMessage(turn.text),
  );
  // The real flow always carries the student's opening message; Anthropic also
  // rejects a system-only request. Seed a neutral opener for first-question cases.
  if (turns.length === 0) {
    turns.push(new HumanMessage("Je suis prête à réviser ce point."));
  }
  return turns;
}

async function main(): Promise<void> {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    throw new Error(
      "Set LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY to run the eval.",
    );
  }

  // Start OTEL so the experiment's tutor + judge calls export as Langfuse traces
  // (the scores/dataset run go via the API regardless).
  startObservability();

  const langfuse = new LangfuseClient();

  // 1. Upsert the curated dataset (stable ids → idempotent re-runs). Called via
  // the api namespace: the client's top-level createDataset/createDatasetItem
  // are assigned without binding `this` (SDK bug in 5.4.1), so they throw.
  await langfuse.api.datasets.create({
    name: DATASET_NAME,
    description:
      "Tuteur socratique CM2/Histoire — cas dorés pour les juges factuel + socratique.",
  });
  for (const c of EVAL_CASES) {
    const { id, expectedAnswer, gold, ...input } = c;
    await langfuse.api.datasetItems.create({
      datasetName: DATASET_NAME,
      id,
      input,
      expectedOutput: { expectedAnswer, gold },
      metadata: { precisionBar: c.concept.precisionBar, kind: c.kind },
    });
  }

  // langfuse.getDataset is likewise an unbound alias; use the manager instance.
  const dataset = await langfuse.dataset.get(DATASET_NAME);

  const socraticModel = await getModel("socratic");
  const judgeModel = await getModel("judge");

  // 2. The system under test: the real socratic tutor (or a planted control).
  const task = async (params: { input?: unknown }): Promise<string> => {
    const input = params.input as EvalInput;
    if (input.kind === "control") return input.controlOutput ?? "";
    const { bundle, concept } = caseToBundle(input);
    const response = await socraticModel.invoke([
      new SystemMessage(buildSocraticSystem(bundle, concept)),
      ...priorTurnsToMessages(input),
    ]);
    return typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  };

  // 3. The two judges, as per-item evaluators returning Langfuse scores.
  const evaluators = [
    async (params: { input?: unknown; output?: unknown; expectedOutput?: unknown }) => {
      const input = params.input as EvalInput;
      const expected = params.expectedOutput as { expectedAnswer: string };
      const verdict = await runFactualJudge(
        judgeModel,
        judgeContext(input, expected.expectedAnswer),
        String(params.output),
      );
      return { name: "factual_accuracy", ...scoreFactual(verdict) };
    },
    async (params: { input?: unknown; output?: unknown; expectedOutput?: unknown }) => {
      const input = params.input as EvalInput;
      const expected = params.expectedOutput as { expectedAnswer: string };
      const verdict = await runSocraticJudge(
        judgeModel,
        judgeContext(input, expected.expectedAnswer),
        String(params.output),
      );
      return { name: "socratic_method", ...scoreSocratic(verdict) };
    },
  ];

  const result = await dataset.runExperiment({
    name: "socratic-judges",
    description: "Juges factuel (calibré precision_bar) + socratique.",
    task,
    evaluators,
    maxConcurrency: 4,
  });

  await flushObservability();
  await langfuse.flush();

  // Summary to the console; per-item inputs, outputs, scores and judge
  // rationales are in the Langfuse dataset run UI (link below).
  console.log(await result.format());
  if (result.datasetRunUrl) {
    console.log(`\nDataset run: ${result.datasetRunUrl}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
