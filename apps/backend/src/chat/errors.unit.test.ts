import { describe, expect, it } from "vitest";

import { isAbortError, isTransientError, userFacingError } from "./errors.js";

describe("isTransientError", () => {
  it("reads an overload arriving mid-stream, where there is no status", () => {
    // The shape the provider emits inside an already-open 200 response.
    const error = new Error(
      '{"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"},"request_id":"req_x"}',
    );
    expect(isTransientError(error)).toBe(true);
  });

  it("reads a retryable http status", () => {
    expect(isTransientError(Object.assign(new Error("rate limited"), { status: 429 }))).toBe(true);
    expect(isTransientError(Object.assign(new Error("overloaded"), { status: 529 }))).toBe(true);
  });

  it("treats a client error as permanent", () => {
    expect(
      isTransientError(Object.assign(new Error("bad request"), { status: 400 })),
    ).toBe(false);
  });

  it("treats a plain bug as permanent", () => {
    expect(isTransientError(new TypeError("x is not a function"))).toBe(false);
  });

  it("never throws on a non-error value", () => {
    expect(isTransientError(undefined)).toBe(false);
    expect(isTransientError("overloaded_error")).toBe(true);
  });
});

describe("isAbortError", () => {
  it("reads the deadline or the client hanging up", () => {
    expect(isAbortError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(
      true,
    );
    expect(isAbortError(new Error("Aborted"))).toBe(true);
  });

  it("does not mistake an unrelated failure for a give-up", () => {
    expect(isAbortError(new Error("connection reset"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe("userFacingError", () => {
  it("says the wait was given up on, not that something broke", () => {
    const message = userFacingError(
      Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
      }),
    );
    expect(message).toContain("trop de temps");
  });


  it("tells the child to wait only when waiting helps", () => {
    const transient = userFacingError(
      Object.assign(new Error("overloaded"), { status: 529 }),
    );
    const permanent = userFacingError(new TypeError("boom"));

    expect(transient).toContain("Réessaie dans un instant");
    expect(permanent).not.toContain("Réessaie dans un instant");
    expect(permanent).toContain("réessayer");
  });

  it("never leaks the technical error to the child", () => {
    expect(userFacingError(new Error("connect ECONNREFUSED 10.0.0.4:5432"))).not.toContain(
      "ECONNREFUSED",
    );
  });
});
