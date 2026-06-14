import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { END } from "@langchain/langgraph";

import { getLessonsForResolution } from "../memory/repositories.js";

// Deterministic lesson resolution: a free-text reference (a theme number, a
// title fragment, or a subject the child names) → a concrete lesson, or a
// clarification when it is absent or ambiguous. The LLM only extracts the
// reference string (in classify); the mapping to a lesson is pure code — never
// a guess. No "default lesson" (brief §6): the only silent resolution is the
// single-unique-candidate case.

// The minimal lesson shape the resolver matches against. conceptLabels lets a
// child name a lesson by its subject ("Napoléon") even when the title does not
// contain that word.
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
  // A reference was given but matched nothing ("la 13" when only 11/12 exist).
  | { kind: "not_found"; lessons: LessonRef[] }
  // No reference, or a vague one, with several lessons in reach.
  | { kind: "ambiguous"; lessons: LessonRef[] };

const STOPWORDS = new Set([
  "la", "le", "les", "un", "une", "des", "du", "de", "sur", "et", "ou", "ce",
  "cette", "celle", "celui", "ceux", "lecon", "lecons", "theme", "themes",
  "reviser", "revise", "fais", "moi", "ma", "mon", "mes", "veux", "pour",
  "avec", "que", "qui", "quoi", "est", "dans",
]);

// Lowercase + strip diacritics, so "Napoléon" and "napoleon" match.
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// A standalone 1–2 digit number in the reference is read as a theme number
// (themes are 11, 12, …). A 4-digit year like "1870" is not a theme.
function extractThemeNumber(reference: string): number | null {
  const match = normalize(reference).match(/\b(\d{1,2})\b/);
  return match ? Number(match[1]) : null;
}

// Lessons the reference plausibly designates. A theme number is an unambiguous
// signal and is used exclusively when present; otherwise content tokens of the
// reference are matched against the title and the concept labels.
function matchLessons(reference: string, lessons: LessonRef[]): LessonRef[] {
  const theme = extractThemeNumber(reference);
  if (theme !== null) {
    return lessons.filter((lesson) => lesson.theme === theme);
  }
  const tokens = normalize(reference)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  if (tokens.length === 0) {
    return [];
  }
  return lessons.filter((lesson) => {
    const haystack = normalize([lesson.title, ...lesson.conceptLabels].join(" "));
    return tokens.some((token) => haystack.includes(token));
  });
}

// The pure resolution decision. reference is null/empty when the child named no
// lesson (then every lesson is a candidate, so a single-lesson base resolves and
// a multi-lesson base asks).
export function resolveLesson(
  reference: string | null,
  lessons: LessonRef[],
): LessonResolution {
  if (lessons.length === 0) {
    return { kind: "empty" };
  }
  const ref = reference?.trim() ?? "";
  const candidates = ref === "" ? lessons : matchLessons(ref, lessons);

  const [first] = candidates;
  if (candidates.length === 1 && first) {
    return { kind: "resolved", lessonId: first.id };
  }
  if (ref !== "" && candidates.length === 0) {
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

// Deterministic clarification message — the lesson list is read from the DB,
// the LLM never guesses it (brief §6). The lead-in differs between "I don't
// have that one" and "which one do you want?".
export function buildLessonClarification(
  resolution: { kind: "not_found" | "ambiguous"; lessons: LessonRef[] },
): string {
  const list = resolution.lessons.map(lessonLine).join("\n");
  if (resolution.kind === "not_found") {
    return `Je n'ai pas trouvé cette leçon. Voici celles que je connais :\n${list}\nLaquelle veux-tu réviser ?`;
  }
  return `Tu veux réviser quelle leçon ? Voici celles que je connais :\n${list}`;
}

// --- Imperative shell: the resolver node and its routing ----------------------

type LessonRow = Awaited<ReturnType<typeof getLessonsForResolution>>[number];

function themeOf(metadata: unknown): number | null {
  if (metadata && typeof metadata === "object" && "theme" in metadata) {
    const value = (metadata as { theme: unknown }).theme;
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

function lastUserText(messages: BaseMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message && message.getType() === "human") {
      return typeof message.content === "string" ? message.content : null;
    }
  }
  return null;
}

export type LessonResolveState = {
  messages: BaseMessage[];
  lessonHint: string | null;
  lessonId: string | null;
  pendingLessonChoice: boolean;
};

// On a pending-choice turn the router bypassed classify, so the raw answer
// ("la 12") is the reference; otherwise use the hint classify extracted.
function lessonReferenceFor(state: LessonResolveState): string | null {
  return state.pendingLessonChoice
    ? lastUserText(state.messages)
    : state.lessonHint;
}

// Deterministic resolver node: resolve the lesson into state, or emit a
// clarification / ingest-orientation message and arm pendingLessonChoice so the
// next turn re-enters here with the student's answer (brief §6). lessonId is
// cleared on every non-resolved outcome so a stale value can't leak through.
export async function resolveLessonNode(state: LessonResolveState) {
  const reference = lessonReferenceFor(state);
  const lessons = toLessonRefs(await getLessonsForResolution());
  const resolution = resolveLesson(reference, lessons);

  switch (resolution.kind) {
    case "resolved":
      return { lessonId: resolution.lessonId, pendingLessonChoice: false };
    case "empty":
      return {
        lessonId: null,
        messages: [new AIMessage(EMPTY_BASE_MESSAGE)],
        pendingLessonChoice: false,
      };
    default:
      return {
        lessonId: null,
        messages: [new AIMessage(buildLessonClarification(resolution))],
        pendingLessonChoice: true,
      };
  }
}

// A resolved lesson proceeds to the revise flow; every other outcome has already
// emitted its message and ends the turn.
export function afterResolveLesson(state: {
  lessonId: string | null;
}): "revise" | typeof END {
  return state.lessonId ? "revise" : END;
}
