import { describe, expect, it } from "vitest";

import { isSecureDue, nextReviewStep, secureIntervalsDays } from "./srs.js";

const LADDER = [1, 2, 4, 8];

describe("secureIntervalsDays", () => {
  it("defaults to the Leitner ladder when unset", () => {
    expect(secureIntervalsDays({})).toEqual([1, 2, 4, 8]);
  });

  it("parses a per-deployment override", () => {
    expect(secureIntervalsDays({ SRS_SECURE_INTERVALS_DAYS: "1, 3, 7, 16" })).toEqual([
      1, 3, 7, 16,
    ]);
  });

  it("rejects a malformed or non-positive override", () => {
    expect(() => secureIntervalsDays({ SRS_SECURE_INTERVALS_DAYS: "1,x" })).toThrow();
    expect(() => secureIntervalsDays({ SRS_SECURE_INTERVALS_DAYS: "0,2" })).toThrow();
  });
});

describe("nextReviewStep", () => {
  it("climbs one rung when a secure concept stays secure", () => {
    expect(nextReviewStep("secure", "secure", 1, LADDER.length)).toBe(2);
  });

  it("clamps at the top rung", () => {
    expect(nextReviewStep("secure", "secure", 3, LADDER.length)).toBe(3);
  });

  it("starts at the bottom when a concept becomes secure", () => {
    expect(nextReviewStep("developing", "secure", 0, LADDER.length)).toBe(0);
    expect(nextReviewStep(null, "secure", 0, LADDER.length)).toBe(0);
  });

  it("resets when a concept drops below secure", () => {
    expect(nextReviewStep("secure", "developing", 3, LADDER.length)).toBe(0);
  });
});

describe("isSecureDue", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it("treats a never-stamped concept as due", () => {
    expect(isSecureDue(null, 0, now, LADDER)).toBe(true);
  });

  it("is not due before the step's interval has elapsed", () => {
    // step 0 → 1 day; reviewed 12h ago → not due yet.
    expect(isSecureDue(daysAgo(0.5), 0, now, LADDER)).toBe(false);
  });

  it("is due once the step's interval has elapsed", () => {
    expect(isSecureDue(daysAgo(1), 0, now, LADDER)).toBe(true);
  });

  it("uses a longer interval at a higher step", () => {
    // step 3 → 8 days; reviewed 4 days ago → still not due.
    expect(isSecureDue(daysAgo(4), 3, now, LADDER)).toBe(false);
    expect(isSecureDue(daysAgo(8), 3, now, LADDER)).toBe(true);
  });

  it("clamps an out-of-range step to the top interval", () => {
    expect(isSecureDue(daysAgo(7), 9, now, LADDER)).toBe(false);
    expect(isSecureDue(daysAgo(8), 9, now, LADDER)).toBe(true);
  });
});
