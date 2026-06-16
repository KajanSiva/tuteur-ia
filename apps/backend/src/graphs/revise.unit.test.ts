import { describe, expect, it } from "vitest";

import type {
  ConceptMastery,
  HydratedConcept,
  HydrationBundle,
} from "../memory/hydration.js";
import {
  afterHydrate,
  buildSocraticSystem,
  decideAfterAdvance,
  decideAfterEvaluate,
  masterySignalToOp,
  MAX_TURNS,
  type ReviseState,
  routeStart,
  selectConcepts,
} from "./revise.js";

function reviseState(over: Partial<ReviseState> = {}): ReviseState {
  return {
    messages: [],
    studentId: "s",
    lessonId: "l",
    sessionConceptIds: ["c1", "c2"],
    conceptCursor: 0,
    turnsOnConcept: 0,
    phase: "revising",
    masterySignal: null,
    sessionTraceId: "trace-1",
    ...over,
  };
}

function concept(
  id: string,
  mastery: ConceptMastery | null,
  over: Partial<HydratedConcept> = {},
): HydratedConcept {
  return {
    id,
    label: `concept ${id}`,
    precisionBar: "intermediate",
    precisionNote: null,
    mastery,
    ...over,
  };
}

const NOW = new Date("2026-06-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function mastery(
  level: ConceptMastery["level"],
  over: Partial<ConceptMastery> = {},
): ConceptMastery {
  return {
    level,
    rationale: null,
    isLocked: false,
    version: 1,
    lastReviewedAt: null,
    reviewStep: 0,
    ...over,
  };
}

describe("selectConcepts", () => {
  it("orders unknown, then weak, then stale-secure; drops fresh-secure", () => {
    const concepts = [
      concept("a", mastery("secure", { lastReviewedAt: daysAgo(0.1) })), // fresh → out
      concept("b", null), // unknown
      concept("c", mastery("developing")), // weak
      concept("d", mastery("emerging")), // weak
      concept("e", mastery("secure", { lastReviewedAt: daysAgo(30), reviewStep: 3 })), // stale → in
    ];
    expect(selectConcepts(concepts, NOW).map((c) => c.id)).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("preserves lesson order within each tier", () => {
    const concepts = [concept("a", null), concept("b", null)];
    expect(selectConcepts(concepts, NOW).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("caps the session at the requested size, carrying the rest over", () => {
    const concepts = [concept("a", null), concept("b", null), concept("c", null)];
    expect(selectConcepts(concepts, NOW, 2).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("leaves out a secure concept still within its interval", () => {
    const concepts = [
      concept("a", mastery("secure", { lastReviewedAt: daysAgo(0), reviewStep: 0 })),
    ];
    expect(selectConcepts(concepts, NOW)).toEqual([]);
  });

  it("re-includes a secure concept once its interval has elapsed", () => {
    const concepts = [
      concept("a", mastery("secure", { lastReviewedAt: daysAgo(2), reviewStep: 0 })),
    ];
    expect(selectConcepts(concepts, NOW).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("buildSocraticSystem", () => {
  const bundle: HydrationBundle = {
    student: { id: "s", displayName: "Camille", gradeLevel: "CM2", age: null },
    profile: null,
    lesson: {
      id: "l",
      title: "Les Trois Glorieuses",
      subject: "Histoire",
      contentMd: "Trois journées de juillet 1830.",
      metadata: null,
    },
    concepts: [],
    unassessedConceptIds: [],
  };

  it("injects the student, lesson content and the concept under work", () => {
    const c = concept("x", null, {
      label: "Les Trois Glorieoses",
      precisionBar: "exact",
      precisionNote: "27–29 juillet 1830.",
    });
    const prompt = buildSocraticSystem(bundle, c);
    expect(prompt).toContain("Camille");
    expect(prompt).toContain("Trois journées de juillet 1830.");
    expect(prompt).toContain("Les Trois Glorieoses");
    expect(prompt).toContain("27–29 juillet 1830.");
  });

  it("states the mastery is unknown when there is no current row", () => {
    const prompt = buildSocraticSystem(bundle, concept("x", null));
    expect(prompt).toContain("Tu ne sais pas encore");
  });

  it("surfaces a known mastery level when there is one", () => {
    const prompt = buildSocraticSystem(bundle, concept("x", mastery("developing")));
    expect(prompt).toContain("developing");
  });
});

describe("routeStart", () => {
  // One phase → one destination. Phases are mutually exclusive, so the old
  // "which flag wins" precedence checks are gone by construction.
  it("sends an active revise session straight to evaluate, skipping classify", () => {
    expect(routeStart({ phase: "revising" })).toBe("evaluate");
  });

  it("routes a pending lesson answer back to the resolver, skipping classify", () => {
    expect(routeStart({ phase: "choosing_lesson" })).toBe("resolveLesson");
  });

  it("enters revise directly when a chip command set the lesson", () => {
    expect(routeStart({ phase: "entering_revise" })).toBe("revise");
  });

  it("classifies when idle", () => {
    expect(routeStart({ phase: "idle" })).toBe("classify");
  });
});

describe("afterHydrate", () => {
  it("starts the dialogue when concepts were selected", () => {
    expect(afterHydrate(reviseState({ sessionConceptIds: ["c1"] }))).toBe(
      "socratic",
    );
  });

  it("closes immediately when nothing needs revising", () => {
    expect(afterHydrate(reviseState({ sessionConceptIds: [] }))).toBe("finish");
    expect(afterHydrate(reviseState({ sessionConceptIds: null }))).toBe("finish");
  });
});

describe("decideAfterEvaluate", () => {
  it("advances on a resolved signal", () => {
    const state = reviseState({ masterySignal: { status: "resolved" } });
    expect(decideAfterEvaluate(state)).toBe("advance");
  });

  it("keeps working the concept on a continue signal under the cap", () => {
    const state = reviseState({
      masterySignal: { status: "continue" },
      turnsOnConcept: 1,
    });
    expect(decideAfterEvaluate(state)).toBe("socratic");
  });

  it("forces resolution once the safety cap is reached, despite continue", () => {
    const state = reviseState({
      masterySignal: { status: "continue" },
      turnsOnConcept: MAX_TURNS,
    });
    expect(decideAfterEvaluate(state)).toBe("advance");
  });

  it("keeps working when there is no signal yet and the cap is not reached", () => {
    expect(decideAfterEvaluate(reviseState({ masterySignal: null }))).toBe(
      "socratic",
    );
  });
});

describe("masterySignalToOp", () => {
  it("carries level and rationale through on a resolved signal", () => {
    const op = masterySignalToOp(
      { status: "resolved", level: "secure", rationale: "a retrouvé la date" },
      "c1",
    );
    expect(op).toMatchObject({
      op: "update",
      conceptId: "c1",
      level: "secure",
      rationale: "a retrouvé la date",
    });
    expect(op.reason).toContain("résolu");
  });

  it("marks a forced resolution (continue at the cap) in the reason", () => {
    const op = masterySignalToOp({ status: "continue", level: "emerging" }, "c1");
    expect(op.reason).toContain("forcé");
    expect(op.level).toBe("emerging");
  });

  it("omits absent fields so the applier's per-field merge keeps earlier nuance", () => {
    const op = masterySignalToOp({ status: "resolved" }, "c1");
    expect(op).not.toHaveProperty("level");
    expect(op).not.toHaveProperty("rationale");
  });

  it("treats a null rationale as absent (no overwrite)", () => {
    const op = masterySignalToOp(
      { status: "resolved", level: "secure", rationale: null },
      "c1",
    );
    expect(op).not.toHaveProperty("rationale");
    expect(op.level).toBe("secure");
  });
});

describe("decideAfterAdvance", () => {
  it("continues to the next concept when the cursor is in range", () => {
    const state = reviseState({
      sessionConceptIds: ["c1", "c2"],
      conceptCursor: 1,
    });
    expect(decideAfterAdvance(state)).toBe("socratic");
  });

  it("finishes once the cursor passes the last concept", () => {
    const state = reviseState({
      sessionConceptIds: ["c1", "c2"],
      conceptCursor: 2,
    });
    expect(decideAfterAdvance(state)).toBe("finish");
  });
});
