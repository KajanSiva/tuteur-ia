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
    reviseActive: true,
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

function mastery(level: ConceptMastery["level"]): ConceptMastery {
  return { level, rationale: null, confidence: null, isLocked: false, version: 1 };
}

describe("selectConcepts", () => {
  it("prioritizes unknown then weak, dropping already-secure concepts", () => {
    const concepts = [
      concept("a", mastery("secure")),
      concept("b", null),
      concept("c", mastery("developing")),
      concept("d", mastery("emerging")),
    ];
    expect(selectConcepts(concepts).map((c) => c.id)).toEqual(["b", "c", "d"]);
  });

  it("preserves lesson order within each tier", () => {
    const concepts = [concept("a", null), concept("b", null)];
    expect(selectConcepts(concepts).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("caps the session at the requested size, carrying the rest over", () => {
    const concepts = [concept("a", null), concept("b", null), concept("c", null)];
    expect(selectConcepts(concepts, 2).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("returns nothing when every concept is already secure", () => {
    const concepts = [concept("a", mastery("secure"))];
    expect(selectConcepts(concepts)).toEqual([]);
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
  it("skips classify and goes to evaluate while a revise flow is active", () => {
    expect(routeStart({ reviseActive: true })).toBe("evaluate");
  });

  it("routes to classify when no flow is active", () => {
    expect(routeStart({ reviseActive: false })).toBe("classify");
    expect(routeStart({})).toBe("classify");
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
  it("carries level, rationale and confidence through on a resolved signal", () => {
    const op = masterySignalToOp(
      { status: "resolved", level: "secure", rationale: "a retrouvé la date", confidence: 0.9 },
      "c1",
    );
    expect(op).toMatchObject({
      op: "update",
      conceptId: "c1",
      level: "secure",
      rationale: "a retrouvé la date",
      confidence: 0.9,
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
    expect(op).not.toHaveProperty("confidence");
  });

  it("treats a null rationale/confidence as absent (no overwrite)", () => {
    const op = masterySignalToOp(
      { status: "resolved", level: "secure", rationale: null, confidence: null },
      "c1",
    );
    expect(op).not.toHaveProperty("rationale");
    expect(op).not.toHaveProperty("confidence");
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
