import { describe, expect, it } from "vitest";

import { EVAL_CASES, caseToBundle } from "./cases.js";
import {
  buildFactualJudgeSystem,
  buildSocraticJudgeSystem,
  scoreFactual,
  scoreSocratic,
  type JudgeContext,
} from "./judges.js";

const ctx = (over: Partial<JudgeContext> = {}): JudgeContext => ({
  conceptLabel: "L'année du début de la Révolution",
  precisionBar: "exact",
  lessonExcerpt: "La Révolution commence en 1789.",
  expectedAnswer: "1789",
  ...over,
});

describe("scoreSocratic — 1 = good = did not reveal", () => {
  it("scores 1 when the tutor withheld the answer", () => {
    expect(scoreSocratic({ revealedAnswer: false, rationale: "guide" }).value).toBe(1);
  });
  it("scores 0 when the tutor revealed the answer", () => {
    expect(scoreSocratic({ revealedAnswer: true, rationale: "donné" }).value).toBe(0);
  });
  it("scores 0 (flag) on a malformed verdict", () => {
    expect(scoreSocratic(null).value).toBe(0);
  });
});

describe("scoreFactual — 1 = correct", () => {
  it("scores 1 when factually correct", () => {
    expect(scoreFactual({ correct: true, rationale: "ok" }).value).toBe(1);
  });
  it("scores 0 on a factual error", () => {
    expect(scoreFactual({ correct: false, rationale: "faux" }).value).toBe(0);
  });
  it("scores 0 (flag) on a malformed verdict", () => {
    expect(scoreFactual(null).value).toBe(0);
  });
});

describe("factual judge prompt is calibrated by precision bar", () => {
  it("demands exact facts on an 'exact' concept", () => {
    expect(buildFactualJudgeSystem(ctx({ precisionBar: "exact" }))).toContain(
      "PRÉCIS",
    );
  });
  it("tolerates imprecision on a 'global' concept", () => {
    const system = buildFactualJudgeSystem(ctx({ precisionBar: "global" }));
    expect(system).toContain("idée générale");
    expect(system).not.toContain("PRÉCIS");
  });
  it("injects the expected answer and lesson excerpt", () => {
    const system = buildFactualJudgeSystem(ctx());
    expect(system).toContain("1789");
    expect(system).toContain("La Révolution commence en 1789.");
  });
});

describe("socratic judge prompt names the answer to withhold", () => {
  it("injects the expected answer", () => {
    expect(buildSocraticJudgeSystem(ctx({ expectedAnswer: "Waterloo" }))).toContain(
      "Waterloo",
    );
  });
});

describe("golden dataset integrity", () => {
  it("uses unique case ids", () => {
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("gives every control case a planted output", () => {
    for (const c of EVAL_CASES.filter((x) => x.kind === "control")) {
      expect(c.controlOutput?.length ?? 0).toBeGreaterThan(0);
    }
  });
  it("plants exactly one judge fault per control case", () => {
    // A control must trip exactly one judge (factual XOR socratic), so the run
    // demonstrates each judge discriminating without confounding the other.
    for (const c of EVAL_CASES.filter((x) => x.kind === "control")) {
      const faults = Number(!c.gold.factualCorrect) + Number(!c.gold.withheldAnswer);
      expect(faults).toBe(1);
    }
  });
  it("builds a synthetic bundle whose concept carries the case precision bar", () => {
    const sample = EVAL_CASES[0];
    if (!sample) throw new Error("no eval cases");
    const { bundle, concept } = caseToBundle(sample);
    expect(concept.precisionBar).toBe(sample.concept.precisionBar);
    expect(bundle.lesson.contentMd).toBe(sample.lesson.contentMd);
    expect(bundle.concepts).toHaveLength(1);
  });
});
