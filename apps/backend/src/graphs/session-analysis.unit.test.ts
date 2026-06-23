import { describe, expect, it } from "vitest";

import {
  type AnalysisContext,
  buildSessionAnalysisSystem,
  type ProfileSignal,
  profileSignalToOp,
} from "./session-analysis.js";

function signal(over: Partial<ProfileSignal> = {}): ProfileSignal {
  return { op: "update", rationale: "observé en séance", ...over };
}

describe("profileSignalToOp", () => {
  it("always forces — the profile is locked and this node is its only writer", () => {
    expect(profileSignalToOp(signal({ learningStyle: "x" })).force).toBe(true);
  });

  it("carries the reported dimensions through, mapping rationale to reason", () => {
    const op = profileSignalToOp(
      signal({
        learningStyle: "questions courtes",
        motivationLevers: "félicitations sur une série",
        rationale: "elle accroche aux exemples concrets",
      }),
    );
    expect(op).toMatchObject({
      op: "update",
      learningStyle: "questions courtes",
      motivationLevers: "félicitations sur une série",
      reason: "elle accroche aux exemples concrets",
    });
  });

  it("omits a dimension the session was silent about (merge keeps prior nuance)", () => {
    const op = profileSignalToOp(signal({ learningStyle: "questions courtes" }));
    expect(op).not.toHaveProperty("motivationLevers");
    expect(op).not.toHaveProperty("frictionToAvoid");
  });

  it("passes an explicit null through (clears that dimension)", () => {
    const op = profileSignalToOp(signal({ frictionToAvoid: null }));
    expect(op).toHaveProperty("frictionToAvoid", null);
  });

  it("maps a noop signal to a noop op (the applier then writes nothing)", () => {
    expect(profileSignalToOp(signal({ op: "noop" })).op).toBe("noop");
  });
});

describe("buildSessionAnalysisSystem", () => {
  const base: AnalysisContext = {
    displayName: "Camille",
    gradeLevel: "CM2",
    current: null,
  };

  it("addresses the student and names the three procedural dimensions", () => {
    const prompt = buildSessionAnalysisSystem(base);
    expect(prompt).toContain("Camille");
    expect(prompt).toContain("learningStyle");
    expect(prompt).toContain("motivationLevers");
    expect(prompt).toContain("frictionToAvoid");
  });

  it("states nothing is known yet when there is no profile row", () => {
    expect(buildSessionAnalysisSystem(base)).toContain("première observation");
  });

  it("surfaces the known dimensions so the model refines rather than restates", () => {
    const prompt = buildSessionAnalysisSystem({
      ...base,
      current: {
        learningStyle: "questions courtes",
        motivationLevers: null,
        frictionToAvoid: "longues lectures",
      },
    });
    expect(prompt).toContain("questions courtes");
    expect(prompt).toContain("longues lectures");
  });

  it("instructs a conservative noop-by-default so silence never erases", () => {
    expect(buildSessionAnalysisSystem(base)).toContain("noop");
  });
});
