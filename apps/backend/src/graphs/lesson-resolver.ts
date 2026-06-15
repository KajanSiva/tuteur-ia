import { AIMessage, type BaseMessage, SystemMessage } from "@langchain/core/messages";
import { END } from "@langchain/langgraph";
import { z } from "zod";

import { getModel } from "../llm/models.js";
import { getLessonsForResolution } from "../memory/repositories.js";

// Lesson resolution maps a natural-language reference ("la leçon sur Napoléon",
// "la 12", "celle sur les rois") to one of the known lessons. The matching is a
// closed-set classification done by a cheap LLM over a catalogue injected from
// the DB; the deterministic code keeps control of the consequence: the model can
// only return a real lesson key or "none"/"ambiguous", never invent a lesson,
// and there is no silent default (brief §6 — the single-lesson case aside).

export type LessonRef = {
  id: string;
  title: string;
  theme: number | null;
  conceptLabels: string[];
};

export type LessonResolution =
  | { kind: "resolved"; lessonId: string }
  // No lesson exists yet — orient toward adding one (ingest, a later step).
  | { kind: "empty" }
  // A named lesson we do not have ("la 13").
  | { kind: "not_found"; lessons: LessonRef[] }
  // No lesson named, or too vague to tell which.
  | { kind: "ambiguous"; lessons: LessonRef[] };

// The outcomes the model's choice can produce (empty is decided before the call).
export type LessonChoice = Exclude<LessonResolution, { kind: "empty" }>;

// Stable per-call key for a catalogue entry — the model returns one of these,
// not an opaque UUID.
function lessonKey(index: number): string {
  return `L${index + 1}`;
}

// Maps the model's chosen key back to a resolution. Pure: an unknown or
// out-of-range key is treated as ambiguous (ask, never guess).
export function interpretChoice(
  key: string,
  lessons: LessonRef[],
): LessonChoice {
  const match = /^L(\d+)$/.exec(key);
  if (match) {
    const lesson = lessons[Number(match[1]) - 1];
    if (lesson) {
      return { kind: "resolved", lessonId: lesson.id };
    }
  }
  if (key === "none") {
    return { kind: "not_found", lessons };
  }
  return { kind: "ambiguous", lessons };
}

export const EMPTY_BASE_MESSAGE =
  "Tu n'as pas encore de leçon enregistrée. Quand tu auras une nouvelle leçon, tu pourras me l'ajouter et on la prendra en photo.";

function lessonLine(lesson: LessonRef): string {
  return lesson.theme !== null
    ? `- Thème ${lesson.theme} — ${lesson.title}`
    : `- ${lesson.title}`;
}

// Deterministic clarification — the lesson list is read from the DB, never
// produced by the model. The lead-in differs between "I don't have that one"
// and "which one do you want?".
export function buildLessonClarification(
  resolution: { kind: "not_found" | "ambiguous"; lessons: LessonRef[] },
): string {
  const list = resolution.lessons.map(lessonLine).join("\n");
  if (resolution.kind === "not_found") {
    return `Je n'ai pas trouvé cette leçon. Voici celles que je connais :\n${list}\nLaquelle veux-tu réviser ?`;
  }
  return `Tu veux réviser quelle leçon ? Voici celles que je connais :\n${list}`;
}

// --- Imperative shell: the catalogue, the LLM pick, and the node --------------

type LessonRow = Awaited<ReturnType<typeof getLessonsForResolution>>[number];

function themeOf(metadata: unknown): number | null {
  if (metadata && typeof metadata === "object" && "theme" in metadata) {
    const value: unknown = metadata.theme;
    return typeof value === "number" ? value : null;
  }
  return null;
}

function toLessonRefs(rows: LessonRow[]): LessonRef[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    theme: themeOf(row.metadata),
    conceptLabels: row.concepts.map((concept) => concept.label),
  }));
}

function buildCatalogue(lessons: LessonRef[]): string {
  return lessons
    .map((lesson, index) => {
      const theme = lesson.theme !== null ? ` (thème ${lesson.theme})` : "";
      const subjects = lesson.conceptLabels.join(" ; ");
      return `${lessonKey(index)} — ${lesson.title}${theme}. Sujets : ${subjects}`;
    })
    .join("\n");
}

function buildResolverSystem(catalogue: string): string {
  return [
    "Tu aides à identifier de quelle leçon d'histoire une élève de CM2 veut parler.",
    "Voici les leçons disponibles :",
    catalogue,
    "",
    "À partir de ses messages, choisis la clé de la leçon qu'elle désigne :",
    "- une leçon clairement désignée (numéro de thème, titre, ou sujet abordé) → sa clé (ex. « L1 »).",
    "- une leçon qu'elle nomme mais qui n'est pas dans la liste → « none ».",
    "- aucune leçon désignée, ou trop vague pour trancher → « ambiguous ».",
    "Ne devine jamais au hasard : dans le doute, « ambiguous ».",
  ].join("\n");
}

// Closed-set LLM pick: a forced tool call whose schema is an enum of the real
// lesson keys plus "none"/"ambiguous". Same bindTools pattern as classify, so it
// stays internal under streamMode:messages. Malformed → ambiguous (ask).
async function pickLesson(
  messages: BaseMessage[],
  lessons: LessonRef[],
): Promise<string> {
  const choices = [...lessons.map((_, i) => lessonKey(i)), "none", "ambiguous"];
  const schema = z.object({
    lessonKey: z
      .enum(choices as [string, ...string[]])
      .describe("La clé de la leçon désignée, ou « none » / « ambiguous »."),
  });
  const base = await getModel("classifier");
  if (!base.bindTools) {
    throw new Error("lesson resolver model does not support tool calling");
  }
  const model = base.bindTools(
    [
      {
        name: "choisir_lecon",
        description: "Identifie la leçon que l'élève désigne.",
        schema,
      },
    ],
    { tool_choice: "choisir_lecon" },
  );
  const response = await model.invoke([
    new SystemMessage(buildResolverSystem(buildCatalogue(lessons))),
    ...messages,
  ]);
  const parsed = schema.safeParse(response.tool_calls?.[0]?.args);
  return parsed.success ? parsed.data.lessonKey : "ambiguous";
}

export type LessonResolveState = {
  messages: BaseMessage[];
};

// Resolver node: resolve the lesson into state, or emit a clarification /
// ingest-orientation message and arm pendingLessonChoice so the next turn
// re-enters here with the student's answer. A single lesson resolves without an
// LLM call; lessonId is cleared on every non-resolved outcome.
export async function resolveLessonNode(state: LessonResolveState) {
  const lessons = toLessonRefs(await getLessonsForResolution());
  if (lessons.length === 0) {
    return {
      lessonId: null,
      messages: [new AIMessage(EMPTY_BASE_MESSAGE)],
      pendingLessonChoice: false,
    };
  }
  const [only] = lessons;
  if (lessons.length === 1 && only) {
    return { lessonId: only.id, pendingLessonChoice: false };
  }

  const resolution = interpretChoice(
    await pickLesson(state.messages, lessons),
    lessons,
  );
  if (resolution.kind === "resolved") {
    return { lessonId: resolution.lessonId, pendingLessonChoice: false };
  }
  return {
    lessonId: null,
    messages: [new AIMessage(buildLessonClarification(resolution))],
    pendingLessonChoice: true,
  };
}

// A resolved lesson proceeds to the revise flow; every other outcome has already
// emitted its message and ends the turn.
export function afterResolveLesson(state: {
  lessonId: string | null;
}): "revise" | typeof END {
  return state.lessonId ? "revise" : END;
}
