import { describe, expect, it } from "vitest";

import {
  buildLessonClarification,
  interpretChoice,
  type LessonRef,
} from "./lesson-resolver.js";

const EMPIRE: LessonRef = {
  id: "lesson-11",
  title: "Du Premier Empire à la Troisième République",
  theme: 11,
  conceptLabels: ["La chute de Napoléon Ier et la défaite de Waterloo"],
};

const ECOLE: LessonRef = {
  id: "lesson-12",
  title: "L'école primaire gratuite, laïque et obligatoire",
  theme: 12,
  conceptLabels: ["La loi de 1881 : l'école gratuite (Jules Ferry)"],
};

const LESSONS = [EMPIRE, ECOLE];

describe("interpretChoice", () => {
  it("resolves a valid lesson key to its id", () => {
    expect(interpretChoice("L2", LESSONS)).toEqual({
      kind: "resolved",
      lessonId: "lesson-12",
    });
  });

  it("treats 'none' as a named-but-absent lesson", () => {
    expect(interpretChoice("none", LESSONS)).toEqual({
      kind: "not_found",
      lessons: LESSONS,
    });
  });

  it("treats 'ambiguous' as needing clarification", () => {
    expect(interpretChoice("ambiguous", LESSONS)).toEqual({
      kind: "ambiguous",
      lessons: LESSONS,
    });
  });

  it("falls back to ambiguous on an out-of-range key (never guesses)", () => {
    expect(interpretChoice("L9", LESSONS).kind).toBe("ambiguous");
  });

  it("falls back to ambiguous on an unparseable key", () => {
    expect(interpretChoice("garbage", LESSONS).kind).toBe("ambiguous");
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
