import { AIMessage, type BaseMessage, SystemMessage } from "@langchain/core/messages";

import { prisma } from "../db/client.js";
import type { PrecisionBar } from "../generated/prisma/enums.js";
import { getModel } from "../llm/models.js";
import {
  hydrateForRevision,
  type HydratedConcept,
  type HydrationBundle,
} from "../memory/hydration.js";

// How many concepts a single revision session covers (the rest carries over to a
// later session — the compounding). A flat cap for now; per-subject/configurable
// tuning is a later concern.
const MAX_CONCEPTS_PER_SESSION = 5;

// Deterministic, gaps-first concept selection: unknown concepts (never assessed)
// first, then weak ones (emerging/developing); already-secure concepts are left
// out. Lesson order is preserved within each tier (the bundle is lesson-ordered).
// The stale-secure tier (spaced repetition) is a later slice.
export function selectConcepts(
  concepts: HydratedConcept[],
  max: number = MAX_CONCEPTS_PER_SESSION,
): HydratedConcept[] {
  const unknown = concepts.filter((c) => c.mastery === null);
  const weak = concepts.filter(
    (c) =>
      c.mastery !== null &&
      (c.mastery.level === "emerging" || c.mastery.level === "developing"),
  );
  return [...unknown, ...weak].slice(0, max);
}

const PRECISION_GUIDANCE: Record<PrecisionBar, string> = {
  exact:
    "elle doit retrouver un fait précis (une date, un nom) — guide-la vers la réponse exacte.",
  intermediate:
    "elle doit expliquer l'idée avec ses propres mots — vise la compréhension, pas le par-cœur.",
  global:
    "elle doit saisir l'idée générale — l'essentiel suffit, n'exige pas de détail précis.",
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
    "Commence : pose-lui UNE première question, simple et ouverte, pour l'amener à réfléchir sur ce concept.",
  ];
  return lines.filter((line) => line !== null).join("\n");
}

// Scaffolding until the lesson resolver (later slice): the single POC student
// and the lesson revised by default.
async function resolveStudentAndLesson() {
  const [student, lesson] = await Promise.all([
    prisma.student.findFirstOrThrow({ orderBy: { createdAt: "asc" } }),
    prisma.lesson.findFirstOrThrow({ orderBy: { createdAt: "asc" } }),
  ]);
  return { studentId: student.id, lessonId: lesson.id };
}

// Revise entry (first turn): hydrate the student's state for the lesson, pick the
// concept to work on, and stream the opening socratic question. The hydration and
// selection are deterministic; only the question is the LLM.
export async function reviseNode(state: { messages: BaseMessage[] }) {
  const { studentId, lessonId } = await resolveStudentAndLesson();
  const bundle = await hydrateForRevision(studentId, lessonId);

  const concept = selectConcepts(bundle.concepts)[0];
  if (!concept) {
    return {
      messages: [
        new AIMessage(
          `Bravo ${bundle.student.displayName}, tu maîtrises déjà tout dans cette leçon ! On pourra en revoir une autre quand tu veux.`,
        ),
      ],
    };
  }

  const model = await getModel("socratic");
  const response = await model.invoke([
    new SystemMessage(buildSocraticSystem(bundle, concept)),
    ...state.messages,
  ]);
  return { messages: [response] };
}
