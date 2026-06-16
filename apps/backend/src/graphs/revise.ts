import {
  AIMessage,
  type BaseMessage,
  SystemMessage,
} from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";

import { prisma } from "../db/client.js";
import type { PrecisionBar } from "../generated/prisma/enums.js";
import { getModel } from "../llm/models.js";
import {
  hydrateForRevision,
  type HydratedConcept,
  type HydrationBundle,
} from "../memory/hydration.js";
import { applyMasteryOps } from "../memory/mastery-applier.js";
import type { MasteryOp } from "../memory/ops.js";
import { isSecureDue, secureIntervalsDays } from "../memory/srs.js";
import type { RoutingPhase } from "./phase.js";
import {
  appendSessionTraceEntry,
  endSessionTrace,
  startSessionTrace,
} from "../memory/session-trace.js";

// How many concepts a single revision session covers (the rest carries over to a
// later session — the compounding). A flat cap for now; per-subject/configurable
// tuning is a later concern.
const MAX_CONCEPTS_PER_SESSION = 5;

// Safety cap on socratic exchanges per concept. Several back-and-forths per
// concept are the normal mode; this only stops the inner loop from running
// forever when the student keeps missing — it forces resolution and moves on.
export const MAX_TURNS = 4;

// The mastery signal the evaluate node emits — a NEW schema internal to revise,
// deliberately distinct from MasteryOp (memory/ops.ts). It only says whether the
// concept is treated for this turn; mapping to a MasteryOp happens at resolution
// (a later slice). zod validates the shape, never the truth of the content.
export const MasterySignalSchema = z.object({
  status: z.enum(["continue", "resolved"]),
  level: z.enum(["emerging", "developing", "secure"]).optional(),
  rationale: z.string().nullable().optional(),
});

export type MasterySignal = z.infer<typeof MasterySignalSchema>;

// The slice of graph state the revise flow reads and writes. The parent graph's
// RouterState supplies these channels; nodes are typed against this subset.
export type ReviseState = {
  messages: BaseMessage[];
  studentId: string | null;
  lessonId: string | null;
  sessionConceptIds: string[] | null;
  conceptCursor: number;
  turnsOnConcept: number;
  phase: RoutingPhase;
  masterySignal: MasterySignal | null;
  sessionTraceId: string | null;
};

// Provenance tag stamped on every mastery row this flow writes.
export const REVISE_CHANGED_BY = "revise";

// Maps the evaluate node's mastery signal to a MasteryOp at resolution. Absent
// fields are OMITTED (not nulled) so the applier's per-field merge keeps earlier
// nuance (brief §4.5). The op is a plain "update" — the applier derives
// insert-vs-update from whether a current row exists, so it is correct whether
// this is the first assessment or a later one.
export function masterySignalToOp(
  signal: MasterySignal,
  conceptId: string,
): MasteryOp {
  const forced = signal.status !== "resolved";
  return {
    op: "update",
    conceptId,
    reason: `Révision socratique (${forced ? "forcé" : "résolu"})`,
    ...(signal.level !== undefined ? { level: signal.level } : {}),
    ...(signal.rationale != null ? { rationale: signal.rationale } : {}),
  };
}

// Deterministic, gaps-first concept selection. Three tiers, in priority order:
// unknown (never assessed), weak (emerging/developing — always eligible), then
// stale-secure (mastered but past its spaced-repetition interval, derived
// against `now`). Fresh-secure concepts are left out. Lesson order is preserved
// within each tier (the bundle is lesson-ordered).
export function selectConcepts(
  concepts: HydratedConcept[],
  now: Date,
  max: number = MAX_CONCEPTS_PER_SESSION,
  intervalsDays: number[] = secureIntervalsDays(),
): HydratedConcept[] {
  const unknown = concepts.filter((c) => c.mastery === null);
  const weak = concepts.filter(
    (c) =>
      c.mastery !== null &&
      (c.mastery.level === "emerging" || c.mastery.level === "developing"),
  );
  const staleSecure = concepts.filter(
    (c) =>
      c.mastery !== null &&
      c.mastery.level === "secure" &&
      isSecureDue(c.mastery.lastReviewedAt, c.mastery.reviewStep, now, intervalsDays),
  );
  return [...unknown, ...weak, ...staleSecure].slice(0, max);
}

const PRECISION_GUIDANCE: Record<PrecisionBar, string> = {
  exact:
    "elle doit retrouver un fait précis (une date, un nom) — guide-la vers la réponse exacte.",
  intermediate:
    "elle doit expliquer l'idée avec ses propres mots — vise la compréhension, pas le par-cœur.",
  global:
    "elle doit saisir l'idée générale — l'essentiel suffit, n'exige pas de détail précis.",
};

const PRECISION_BAR_FOR_EVAL: Record<PrecisionBar, string> = {
  exact: "il faut le fait précis (date, nom) exact.",
  intermediate: "une explication correcte avec ses propres mots suffit.",
  global: "l'idée générale suffit, n'exige pas de détail précis.",
};

// Assembles the socratic node's system prompt from the hydration bundle and the
// concept under work. This is where the tutor's competence lives (brief §4.8):
// lesson content + the concept's precision bar + current mastery + profile.
export function buildSocraticSystem(
  bundle: HydrationBundle,
  concept: HydratedConcept,
): string {
  const name = bundle.student.displayName;
  const lines = [
    `Tu es un tuteur d'histoire bienveillant et patient pour ${name}, une élève de ${bundle.student.gradeLevel}.`,
    "Tu l'aides à RÉVISER par la méthode socratique : tu poses UNE seule question à la fois pour la faire réfléchir par elle-même. Tu ne donnes JAMAIS la réponse directement ; tu l'amènes à la trouver. Tu l'encourages, tu restes bref et tu t'adresses à elle par son prénom.",
    "",
    `Leçon « ${bundle.lesson.title} » :`,
    bundle.lesson.contentMd,
    "",
    `Concept à travailler maintenant : « ${concept.label} ».`,
    concept.precisionNote ? `À retenir : ${concept.precisionNote}` : null,
    `Niveau d'exigence : ${PRECISION_GUIDANCE[concept.precisionBar]}`,
    concept.mastery
      ? `Ce que tu sais d'elle sur ce point : niveau « ${concept.mastery.level} »${concept.mastery.rationale ? ` (${concept.mastery.rationale})` : ""}.`
      : "Tu ne sais pas encore où elle en est sur ce point — c'est l'occasion de le découvrir.",
    bundle.profile?.learningStyle
      ? `Comment elle apprend le mieux : ${bundle.profile.learningStyle}.`
      : null,
    bundle.profile?.frictionToAvoid
      ? `À éviter : ${bundle.profile.frictionToAvoid}.`
      : null,
    "",
    "Si l'élève vient de répondre, réagis brièvement à sa réponse (encourage, recadre sans donner la solution) puis relance avec UNE question pour creuser. Sinon, pose-lui UNE première question, simple et ouverte, pour l'amener à réfléchir sur ce concept.",
  ];
  return lines.filter((line) => line !== null).join("\n");
}

// System prompt for the evaluate node: judge whether the student's last answer
// shows mastery of the current concept, calibrated by its precision bar. The
// node forces a single structured tool call carrying the mastery signal.
export function buildEvaluateSystem(
  bundle: HydrationBundle,
  concept: HydratedConcept,
): string {
  const lines = [
    `Tu es l'évaluateur de maîtrise d'un tuteur d'histoire pour ${bundle.student.displayName} (CM2). Tu n'écris jamais à l'élève ; tu produis un signal structuré.`,
    `Concept évalué : « ${concept.label} ».`,
    concept.precisionNote ? `Référence : ${concept.precisionNote}` : null,
    `Niveau d'exigence : ${PRECISION_BAR_FOR_EVAL[concept.precisionBar]}`,
    "",
    "À partir du DERNIER échange (ta question, sa réponse), juge si elle maîtrise CE concept au niveau d'exigence requis :",
    "- status = \"resolved\" si sa dernière réponse montre qu'elle a compris ou retrouvé l'attendu ; sinon \"continue\" (il faut encore l'aider).",
    "- level = son niveau actuel estimé (emerging | developing | secure).",
    "- rationale = une courte justification.",
    "En cas de doute, choisis \"continue\" : ne déclare jamais un concept acquis sur une réponse floue.",
  ];
  return lines.filter((line) => line !== null).join("\n");
}

// The single POC student. Multi-student is out of scope (brief §0: "une élève");
// the lesson, in contrast, is chosen by the deterministic resolver.
async function resolveStudent() {
  return prisma.student.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
}

// Re-hydrates the session and resolves the concept under the cursor. Hydration
// is cheap indexed reads and keeps the DB authoritative across turns (mastery
// written mid-session is reflected); the queue/cursor in state fix the order.
async function loadCurrentConcept(state: ReviseState) {
  if (!state.studentId || !state.lessonId) {
    throw new Error("revise: missing student/lesson in session state");
  }
  const bundle = await hydrateForRevision(state.studentId, state.lessonId);
  const ids = state.sessionConceptIds ?? [];
  const currentId = ids[state.conceptCursor];
  const concept = currentId
    ? bundle.concepts.find((c) => c.id === currentId)
    : undefined;
  return { bundle, concept };
}

// Revise entry (first turn of a session): the lesson is already resolved into
// state by the resolver; hydrate it, pick the deterministic concept queue, and
// arm the session state. Routing then goes to socratic (ask the first question)
// or, if nothing needs revising, finish.
export async function hydrateNode(
  state: ReviseState,
): Promise<Partial<ReviseState>> {
  if (!state.lessonId) {
    throw new Error("revise: hydrate reached without a resolved lesson");
  }
  const student = await resolveStudent();
  const bundle = await hydrateForRevision(student.id, state.lessonId);
  const selected = selectConcepts(bundle.concepts, new Date());
  const sessionTraceId = await startSessionTrace(student.id, state.lessonId);
  return {
    studentId: student.id,
    sessionConceptIds: selected.map((c) => c.id),
    conceptCursor: 0,
    turnsOnConcept: 0,
    phase: "revising",
    masterySignal: null,
    sessionTraceId,
  };
}

// Entry dispatch at START: the single switch on the routing phase. While a
// revise flow is active the turn bypasses classify and goes straight to evaluate
// (a short answer like "1789" must not be re-classified as a new intent each
// turn, brief §5.1); a pending lesson choice or a chip-driven entry likewise
// skip classify. Idle classifies. Exhaustive over RoutingPhase.
export function routeStart(state: {
  phase: RoutingPhase;
}): "classify" | "evaluate" | "resolveLesson" | "revise" {
  switch (state.phase) {
    case "revising":
      return "evaluate";
    case "entering_revise":
      return "revise";
    case "choosing_lesson":
      return "resolveLesson";
    case "idle":
      return "classify";
  }
}

// Routes out of hydrate: nothing selected (everything already secure) goes
// straight to the closing message; otherwise the socratic dialogue starts.
export function afterHydrate(state: ReviseState): "socratic" | "finish" {
  const queue = state.sessionConceptIds ?? [];
  return queue.length === 0 ? "finish" : "socratic";
}

// The agentic node: streams a socratic question (or a relance after an answer)
// for the current concept. Counts the exchange so the safety cap can fire.
export async function socraticNode(
  state: ReviseState,
): Promise<Partial<ReviseState>> {
  const { bundle, concept } = await loadCurrentConcept(state);
  if (!concept) {
    throw new Error("revise: socratic reached with no current concept");
  }
  const model = await getModel("socratic");
  const response = await model.invoke([
    new SystemMessage(buildSocraticSystem(bundle, concept)),
    ...state.messages,
  ]);
  return {
    messages: [response],
    turnsOnConcept: state.turnsOnConcept + 1,
  };
}

// The constrained-reasoning node: reads the latest exchange and emits a
// structured mastery signal. Same bindTools pattern as classify (a tool_use
// block, not visible text) so it stays internal under streamMode: messages.
export async function evaluateNode(
  state: ReviseState,
): Promise<Partial<ReviseState>> {
  const { bundle, concept } = await loadCurrentConcept(state);
  if (!concept) {
    // No concept to assess — treat as continue; decide will move on if needed.
    return { masterySignal: { status: "continue" } };
  }
  const base = await getModel("evaluate");
  if (!base.bindTools) {
    throw new Error("evaluate model does not support tool calling");
  }
  const model = base.bindTools(
    [
      {
        name: "report_mastery",
        description: "Rapporte le signal de maîtrise de l'élève sur ce concept.",
        schema: MasterySignalSchema,
      },
    ],
    { tool_choice: "report_mastery" },
  );
  const response = await model.invoke([
    new SystemMessage(buildEvaluateSystem(bundle, concept)),
    ...state.messages,
  ]);

  // A malformed signal is treated as "continue": never falsely resolve a concept.
  const parsed = MasterySignalSchema.safeParse(response.tool_calls?.[0]?.args);
  return { masterySignal: parsed.success ? parsed.data : { status: "continue" } };
}

// Deterministic decision after an evaluation: resolve (advance) on a positive
// signal or once the safety cap is hit; otherwise keep working the concept.
export function decideAfterEvaluate(
  state: ReviseState,
): "advance" | "socratic" {
  if (state.masterySignal?.status === "resolved") {
    return "advance";
  }
  if (state.turnsOnConcept >= MAX_TURNS) {
    return "advance";
  }
  return "socratic";
}

// Concept resolution: the only place memory is written. It maps the mastery
// signal to a MasteryOp (applied in a transaction with its history row) and
// appends one session_trace entry, then moves the cursor on. A plain "continue"
// never reaches here — this node runs only when decide resolves the concept (on
// a positive signal or the forced turn cap), enforcing distillation per concept
// assessed (brief §4.7).
export async function advanceNode(
  state: ReviseState,
  config: LangGraphRunnableConfig,
): Promise<Partial<ReviseState>> {
  const { concept } = await loadCurrentConcept(state);
  if (concept && state.masterySignal && state.studentId) {
    const runId =
      typeof config.configurable?.thread_id === "string"
        ? config.configurable.thread_id
        : null;
    await applyMasteryOps(
      {
        studentId: state.studentId,
        changedBy: REVISE_CHANGED_BY,
        runId,
        reviewedAt: new Date(),
      },
      [masterySignalToOp(state.masterySignal, concept.id)],
    );
    if (state.sessionTraceId) {
      await appendSessionTraceEntry(state.sessionTraceId, {
        conceptId: concept.id,
        conceptLabel: concept.label,
        status: state.masterySignal.status === "resolved" ? "resolved" : "forced",
        level: state.masterySignal.level ?? null,
        rationale: state.masterySignal.rationale ?? null,
        turns: state.turnsOnConcept,
      });
    }
  }
  return {
    conceptCursor: state.conceptCursor + 1,
    turnsOnConcept: 0,
    masterySignal: null,
  };
}

// Deterministic decision after advancing: more concepts left → keep going,
// otherwise the session is done.
export function decideAfterAdvance(state: ReviseState): "socratic" | "finish" {
  const queue = state.sessionConceptIds ?? [];
  return state.conceptCursor >= queue.length ? "finish" : "socratic";
}

// Closes the session: a final encouragement and a reset of the session state so
// the next turn re-enters through the router (classify) rather than the loop.
export async function finishNode(
  state: ReviseState,
): Promise<Partial<ReviseState>> {
  const { bundle } = await loadCurrentConcept(state);
  if (state.sessionTraceId) {
    await endSessionTrace(state.sessionTraceId);
  }
  return {
    messages: [
      new AIMessage(
        `Bravo ${bundle.student.displayName}, on a fait le tour pour aujourd'hui ! Tu peux revenir réviser quand tu veux. 😊`,
      ),
    ],
    phase: "idle",
    sessionConceptIds: null,
    conceptCursor: 0,
    turnsOnConcept: 0,
    masterySignal: null,
    sessionTraceId: null,
  };
}
