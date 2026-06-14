import { describe, expect, it } from "vitest";

import {
  buildLessonClarification,
  type LessonRef,
  resolveLesson,
} from "./lesson-resolver.js";

const EMPIRE: LessonRef = {
  id: "lesson-11",
  title: "Du Premier Empire à la Troisième République",
  theme: 11,
  conceptLabels: [
    "La chute de Napoléon Ier et la défaite de Waterloo",
    "Les symboles de la République",
  ],
};

const ECOLE: LessonRef = {
  id: "lesson-12",
  title: "L'école primaire gratuite, laïque et obligatoire",
  theme: 12,
  conceptLabels: ["La loi de 1881 : l'école gratuite (Jules Ferry)"],
};

const LESSONS = [EMPIRE, ECOLE];

describe("resolveLesson", () => {
  it("orients to ingest when no lesson exists", () => {
    expect(resolveLesson("Napoléon", [])).toEqual({ kind: "empty" });
  });

  it("resolves the only lesson even without a reference", () => {
    expect(resolveLesson(null, [EMPIRE])).toEqual({
      kind: "resolved",
      lessonId: "lesson-11",
    });
  });

  it("asks which one when no reference is given and several exist", () => {
    expect(resolveLesson(null, LESSONS)).toEqual({
      kind: "ambiguous",
      lessons: LESSONS,
    });
  });

  it("resolves by theme number", () => {
    expect(resolveLesson("la 12", LESSONS)).toEqual({
      kind: "resolved",
      lessonId: "lesson-12",
    });
  });

  it("resolves by a title fragment, accent- and case-insensitively", () => {
    expect(resolveLesson("premier EMPIRE", LESSONS)).toEqual({
      kind: "resolved",
      lessonId: "lesson-11",
    });
  });

  it("resolves by a concept subject absent from the title", () => {
    // "Napoléon" is in no title, only in a concept of the Empire lesson.
    expect(resolveLesson("Napoléon", LESSONS)).toEqual({
      kind: "resolved",
      lessonId: "lesson-11",
    });
  });

  it("does not read a 4-digit year as a theme number", () => {
    // "1870" is not theme 18 or 70 — and matches no title/concept label here.
    expect(resolveLesson("1870", LESSONS)).toEqual({
      kind: "not_found",
      lessons: LESSONS,
    });
  });

  it("reports not_found when a reference matches no lesson", () => {
    expect(resolveLesson("la 13", LESSONS)).toEqual({
      kind: "not_found",
      lessons: LESSONS,
    });
  });

  it("is ambiguous when a token matches several lessons", () => {
    // "école" is in the title of one lesson and a concept of the other.
    const both = resolveLesson("école", [
      ECOLE,
      { ...EMPIRE, conceptLabels: ["Aller à l'école sous l'Empire"] },
    ]);
    expect(both.kind).toBe("ambiguous");
  });
});

describe("buildLessonClarification", () => {
  it("leads with 'not found' and lists the lessons by theme", () => {
    const message = buildLessonClarification({ kind: "not_found", lessons: LESSONS });
    expect(message).toContain("Je n'ai pas trouvé cette leçon");
    expect(message).toContain("Thème 11 — Du Premier Empire à la Troisième République");
    expect(message).toContain("Thème 12 — L'école primaire gratuite, laïque et obligatoire");
  });

  it("asks which one for an ambiguous reference", () => {
    const message = buildLessonClarification({ kind: "ambiguous", lessons: LESSONS });
    expect(message).toContain("Tu veux réviser quelle leçon");
    expect(message).toContain("Thème 11");
  });
});
