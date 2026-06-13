import { describe, expect, it } from "vitest";

import type { ProfileOp } from "./ops.js";
import { decideProfileAction, type ProfileState } from "./profile-policy.js";

function op(over: Partial<ProfileOp> & Pick<ProfileOp, "op">): ProfileOp {
  return { reason: "because", ...over };
}

function state(over: Partial<ProfileState> = {}): ProfileState {
  return {
    learningStyle: null,
    motivationLevers: null,
    frictionToAvoid: null,
    isLocked: true,
    ...over,
  };
}

describe("decideProfileAction", () => {
  it("does nothing for an explicit noop", () => {
    expect(decideProfileAction(state(), op({ op: "noop" }))).toEqual({
      kind: "noop",
      reason: "because",
    });
  });

  describe("lock (procedural memory)", () => {
    it("blocks a non-forced write on an existing profile", () => {
      const action = decideProfileAction(
        state({ learningStyle: "x" }),
        op({ op: "update", learningStyle: "y" }),
      );
      expect(action).toEqual({ kind: "noop", reason: "locked" });
    });

    it("blocks even the first write when not forced (a missing row counts as locked)", () => {
      const action = decideProfileAction(
        null,
        op({ op: "update", learningStyle: "questions courtes" }),
      );
      expect(action).toEqual({ kind: "noop", reason: "locked" });
    });
  });

  describe("forced writes", () => {
    it("inserts the first profile from the provided fields", () => {
      const action = decideProfileAction(
        null,
        op({ op: "update", learningStyle: "questions courtes", force: true }),
      );
      expect(action).toEqual({
        kind: "insert",
        values: {
          learningStyle: "questions courtes",
          motivationLevers: null,
          frictionToAvoid: null,
        },
      });
    });

    it("merges per field, keeping the dimensions the op omits", () => {
      const current = state({
        learningStyle: "questions courtes",
        frictionToAvoid: "trop de questions d'affilée",
      });
      const action = decideProfileAction(
        current,
        op({ op: "update", motivationLevers: "félicitations sur une série", force: true }),
      );
      expect(action).toEqual({
        kind: "update",
        values: {
          learningStyle: "questions courtes",
          motivationLevers: "félicitations sur une série",
          frictionToAvoid: "trop de questions d'affilée",
        },
      });
    });

    it("clears a dimension only when the op passes null", () => {
      const action = decideProfileAction(
        state({ motivationLevers: "ancienne note" }),
        op({ op: "update", motivationLevers: null, force: true }),
      );
      expect(
        (action as { values: { motivationLevers: string | null } }).values
          .motivationLevers,
      ).toBeNull();
    });

    it("is a noop when the merge changes nothing", () => {
      const current = state({ learningStyle: "x" });
      const action = decideProfileAction(
        current,
        op({ op: "update", learningStyle: "x", force: true }),
      );
      expect(action).toEqual({ kind: "noop", reason: "no change" });
    });

    it("is a noop when a first write carries no field", () => {
      const action = decideProfileAction(null, op({ op: "update", force: true }));
      expect(action.kind).toBe("noop");
    });
  });
});
