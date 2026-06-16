import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import type { PrecisionBar } from "../generated/prisma/enums.js";

// Two LLM-as-judge over a socratic tutor turn (brief §11):
//   1. factual  — is the tutor's message factually sound, at the concept's
//                 required precision (calibrated by precision_bar)?
//   2. socratic — did the tutor reveal the expected answer instead of guiding?
//
// Functional core / imperative shell: the prompt assembly and the verdict →
// score mapping are pure and unit-tested; the model call is the thin shell.

// What each judge needs about the case to render its verdict.
export type JudgeContext = {
  conceptLabel: string;
  precisionBar: PrecisionBar;
  lessonExcerpt: string;
  expectedAnswer: string;
};

export const FactualVerdictSchema = z.object({
  correct: z.boolean(),
  rationale: z.string(),
});
export type FactualVerdict = z.infer<typeof FactualVerdictSchema>;

export const SocraticVerdictSchema = z.object({
  revealedAnswer: z.boolean(),
  rationale: z.string(),
});
export type SocraticVerdict = z.infer<typeof SocraticVerdictSchema>;

// How strict the factual judge is, per precision bar — the same calibration the
// tutor works under (brief §4.4): a date/name must be exact, a global idea need
// only be roughly right.
const FACTUAL_PRECISION_GUIDANCE: Record<PrecisionBar, string> = {
  exact:
    "Le concept exige un fait PRÉCIS (date, nom) : signale toute date ou tout nom inexact.",
  intermediate:
    "Le concept exige une explication correcte : signale les contresens, tolère une formulation libre.",
  global:
    "Le concept n'exige que l'idée générale : ne signale qu'une erreur manifeste, pas un détail imprécis.",
};

export function buildFactualJudgeSystem(ctx: JudgeContext): string {
  return [
    "Tu évalues la JUSTESSE FACTUELLE du message d'un tuteur d'histoire (CM2). Tu ne parles pas à l'élève ; tu produis un verdict structuré.",
    `Concept travaillé : « ${ctx.conceptLabel} ».`,
    `Réponse de référence attendue de l'élève : « ${ctx.expectedAnswer} ».`,
    FACTUAL_PRECISION_GUIDANCE[ctx.precisionBar],
    "",
    "Extrait de la leçon (source de vérité) :",
    ctx.lessonExcerpt,
    "",
    "Le message du tuteur est souvent une QUESTION : une simple question qui n'affirme rien de faux est correcte. Mets correct=false UNIQUEMENT si le message contient une affirmation fausse au regard de la leçon et du niveau d'exigence ci-dessus. Donne une courte justification.",
  ].join("\n");
}

export function buildSocraticJudgeSystem(ctx: JudgeContext): string {
  return [
    "Tu évalues la MÉTHODE SOCRATIQUE du message d'un tuteur d'histoire (CM2). Tu ne parles pas à l'élève ; tu produis un verdict structuré.",
    `La réponse que l'élève doit trouver par elle-même est : « ${ctx.expectedAnswer} ».`,
    "",
    "Mets revealedAnswer=true si le message DONNE cette réponse à l'élève (il l'énonce, la confirme, ou la rend évidente). Mets revealedAnswer=false si le tuteur GUIDE par une question sans livrer la réponse. Donne une courte justification.",
  ].join("\n");
}

// Forces a single structured tool call and reads its args (the bindTools pattern
// the codebase uses for every structured output — brief §16.4 §1). Returns null
// on a malformed call so the caller can apply a conservative score.
async function judge<T>(
  model: BaseChatModel,
  schema: z.ZodType<T>,
  toolName: string,
  system: string,
  tutorOutput: string,
): Promise<T | null> {
  if (!model.bindTools) {
    throw new Error("judge model does not support tool calling");
  }
  const bound = model.bindTools(
    [{ name: toolName, description: "Rends ton verdict structuré.", schema }],
    { tool_choice: toolName },
  );
  const response = await bound.invoke([
    new SystemMessage(system),
    new HumanMessage(`Message du tuteur à évaluer :\n${tutorOutput}`),
  ]);
  const parsed = schema.safeParse(response.tool_calls?.[0]?.args);
  return parsed.success ? parsed.data : null;
}

export function runFactualJudge(
  model: BaseChatModel,
  ctx: JudgeContext,
  tutorOutput: string,
): Promise<FactualVerdict | null> {
  return judge(
    model,
    FactualVerdictSchema,
    "report_factual",
    buildFactualJudgeSystem(ctx),
    tutorOutput,
  );
}

export function runSocraticJudge(
  model: BaseChatModel,
  ctx: JudgeContext,
  tutorOutput: string,
): Promise<SocraticVerdict | null> {
  return judge(
    model,
    SocraticVerdictSchema,
    "report_socratic",
    buildSocraticJudgeSystem(ctx),
    tutorOutput,
  );
}

// Verdict → Langfuse score (1 = good). The polarity matters: a socratic turn is
// good when it does NOT reveal the answer. A malformed verdict scores 0 so it
// surfaces for review rather than passing silently.
export function scoreFactual(verdict: FactualVerdict | null): {
  value: number;
  comment: string;
} {
  if (!verdict) return { value: 0, comment: "verdict factuel malformé" };
  return { value: verdict.correct ? 1 : 0, comment: verdict.rationale };
}

export function scoreSocratic(verdict: SocraticVerdict | null): {
  value: number;
  comment: string;
} {
  if (!verdict) return { value: 0, comment: "verdict socratique malformé" };
  return { value: verdict.revealedAnswer ? 0 : 1, comment: verdict.rationale };
}
