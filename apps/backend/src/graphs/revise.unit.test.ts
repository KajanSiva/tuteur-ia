import { describe, expect, it } from "vitest";

import type {
  ConceptMastery,
  HydratedConcept,
  HydrationBundle,
} from "../memory/hydration.js";
import { buildSocraticSystem, selectConcepts } from "./revise.js";

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
