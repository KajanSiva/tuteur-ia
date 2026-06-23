import { type BaseMessage, SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";

import { getModel } from "../llm/models.js";
import type { ProfileOp } from "../memory/ops.js";
import { applyProfileOp } from "../memory/profile-applier.js";
import { getStudent, getStudentProfile } from "../memory/repositories.js";

// End-of-session analysis: it distils the just-finished revision dialogue into a
// refinement of the student's pedagogical profile (procedural memory — the three
// dimensions injected back into the socratic prompt). It runs once per session,
// after the concept loop completes, so it has the whole-session view a style
// inference needs (brief §4.3/§4.8: the profile is refined by the analysis node).

// Provenance tag stamped on every profile row this node writes.
export const SESSION_ANALYSIS_CHANGED_BY = "session_analysis";

// The signal the analysis node emits — internal to this flow, deliberately
// distinct from ProfileOp (memory/ops.ts): the model proposes refinements to the
// three dimensions; the mapper turns the signal into a ProfileOp. The model never
// sets `force` (a code decision). zod validates the shape, never the content.
export const ProfileSignalSchema = z.object({
  op: z.enum(["update", "noop"]),
  learningStyle: z.string().nullable().optional(),
  motivationLevers: z.string().nullable().optional(),
  frictionToAvoid: z.string().nullable().optional(),
  rationale: z.string().min(1),
});

export type ProfileSignal = z.infer<typeof ProfileSignalSchema>;

// Maps the analysis signal to a ProfileOp. Absent fields are OMITTED (not nulled)
// so the applier's per-field merge keeps a dimension the session said nothing
// about — silence is never a delete (brief §4.5). `force` is always set: the
// profile is locked by default and this node is its only writer, so without force
// every write would NOOP. (Confidence-gated forcing is a later refinement.)
export function profileSignalToOp(signal: ProfileSignal): ProfileOp {
  return {
    op: signal.op,
    reason: signal.rationale,
    force: true,
    ...(signal.learningStyle !== undefined
      ? { learningStyle: signal.learningStyle }
      : {}),
    ...(signal.motivationLevers !== undefined
      ? { motivationLevers: signal.motivationLevers }
      : {}),
    ...(signal.frictionToAvoid !== undefined
      ? { frictionToAvoid: signal.frictionToAvoid }
      : {}),
  };
}

export type ProfileContext = {
  learningStyle: string | null;
  motivationLevers: string | null;
  frictionToAvoid: string | null;
};

export type AnalysisContext = {
  displayName: string;
  gradeLevel: string;
  // null = no profile row yet (the dimensions are still all unknown).
  current: ProfileContext | null;
};

// Assembles the analysis node's system prompt: the three procedural dimensions,
// what is already known (so the model refines rather than restates), and a
// conservative "noop unless the session shows it" policy (silence never erases).
export function buildSessionAnalysisSystem(ctx: AnalysisContext): string {
  const known = ctx.current
    ? [
        "Ce que l'on sait déjà de son profil :",
        `- learningStyle : ${ctx.current.learningStyle ?? "(rien encore)"}`,
        `- motivationLevers : ${ctx.current.motivationLevers ?? "(rien encore)"}`,
        `- frictionToAvoid : ${ctx.current.frictionToAvoid ?? "(rien encore)"}`,
      ].join("\n")
    : "On ne sait encore rien de son profil — cette séance peut en être la première observation.";

  return [
    `Tu es l'analyste pédagogique d'un tuteur d'histoire pour ${ctx.displayName} (${ctx.gradeLevel}). Une séance de révision vient de se terminer ; à partir du dialogue, tu raffines — si c'est justifié — le PROFIL D'APPRENTISSAGE de l'élève. Tu n'écris jamais à l'élève ; tu produis un signal structuré.`,
    "",
    "Le profil a trois dimensions, qui pilotent COMMENT le tuteur l'accompagne (pas ce qu'elle sait) :",
    "- learningStyle : le format, le rythme, les modalités qui marchent pour elle (ex. « questions courtes, une à la fois ; aime les exemples concrets »).",
    "- motivationLevers : ce qui l'encourage (ex. « réagit bien aux félicitations sur une série de bonnes réponses »).",
    "- frictionToAvoid : ce qui la fait décrocher, à éviter (ex. « trop de questions d'affilée ; longues lectures »).",
    "",
    known,
    "",
    "Règles :",
    "- Ne renseigne une dimension QUE si CETTE séance la met clairement en évidence. Dans le doute, ne la renvoie pas — une dimension non renvoyée est conservée telle quelle (ne jamais effacer un acquis par simple silence).",
    "- Tu peux affiner ou compléter une dimension déjà connue, en restant fidèle à ce que la séance démontre. N'invente rien.",
    "- op = « update » si tu as au moins une observation utile et étayée ; sinon op = « noop ».",
    "- rationale = une courte justification ancrée dans la séance.",
  ].join("\n");
}

export type AnalyzeState = {
  messages: BaseMessage[];
  studentId: string | null;
};

// The node (imperative shell). Same bindTools pattern as the other structured
// nodes (a tool_use block, not visible text) so it stays internal under
// streamMode messages — it emits no user-facing message (finish closes the
// session). A malformed signal or a noop writes nothing.
export async function analyzeSessionNode(
  state: AnalyzeState,
  config: LangGraphRunnableConfig,
): Promise<Partial<AnalyzeState>> {
  if (!state.studentId) {
    return {};
  }
  const [student, profile] = await Promise.all([
    getStudent(state.studentId),
    getStudentProfile(state.studentId),
  ]);
  if (!student) {
    return {};
  }

  const ctx: AnalysisContext = {
    displayName: student.displayName,
    gradeLevel: student.gradeLevel,
    current: profile
      ? {
          learningStyle: profile.learningStyle,
          motivationLevers: profile.motivationLevers,
          frictionToAvoid: profile.frictionToAvoid,
        }
      : null,
  };

  const base = await getModel("session_analysis");
  if (!base.bindTools) {
    throw new Error("session_analysis model does not support tool calling");
  }
  const model = base.bindTools(
    [
      {
        name: "rapporter_profil",
        description:
          "Rapporte le raffinement du profil d'apprentissage de l'élève.",
        schema: ProfileSignalSchema,
      },
    ],
    { tool_choice: "rapporter_profil" },
  );
  const response = await model.invoke([
    new SystemMessage(buildSessionAnalysisSystem(ctx)),
    ...state.messages,
  ]);

  // A malformed signal writes nothing — never fabricate a profile change.
  const parsed = ProfileSignalSchema.safeParse(response.tool_calls?.[0]?.args);
  if (!parsed.success || parsed.data.op === "noop") {
    return {};
  }

  const runId =
    typeof config.configurable?.thread_id === "string"
      ? config.configurable.thread_id
      : null;
  await applyProfileOp(
    {
      studentId: state.studentId,
      changedBy: SESSION_ANALYSIS_CHANGED_BY,
      runId,
    },
    profileSignalToOp(parsed.data),
  );
  return {};
}
