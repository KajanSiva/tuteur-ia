import { describe, expect, it } from "vitest";

import { CONFIDENCE_THRESHOLD, routeOnIntent } from "./intent.js";

describe("routeOnIntent", () => {
  const confident = 0.9;

  it("routes each intent to its own node when confident", () => {
    expect(routeOnIntent({ intent: "revise", confidence: confident })).toBe(
      "revise",
    );
    expect(routeOnIntent({ intent: "qa", confidence: confident })).toBe("qa");
    expect(routeOnIntent({ intent: "ingest", confidence: confident })).toBe(
      "ingest",
    );
    expect(
      routeOnIntent({ intent: "out_of_scope", confidence: confident }),
    ).toBe("out_of_scope");
  });

  it("asks (clarify) instead of guessing below the confidence threshold", () => {
    expect(routeOnIntent({ intent: "revise", confidence: 0.2 })).toBe("clarify");
  });

  it("proceeds at exactly the threshold (strictly-below is the gate)", () => {
    expect(
      routeOnIntent({ intent: "revise", confidence: CONFIDENCE_THRESHOLD }),
    ).toBe("revise");
  });

  it("clarifies when the intent is absent", () => {
    expect(routeOnIntent({ intent: null, confidence: confident })).toBe(
      "clarify",
    );
  });

  it("proceeds on a known intent when no confidence is reported", () => {
    expect(routeOnIntent({ intent: "qa" })).toBe("qa");
  });
});
