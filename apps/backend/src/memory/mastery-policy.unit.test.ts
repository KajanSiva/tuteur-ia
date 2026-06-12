import { describe, expect, it } from "vitest";

import {
  decideMasteryAction,
  type MasteryState,
} from "./mastery-policy.js";
import type { MasteryOp } from "./ops.js";

const CONCEPT = "concept-1";

function op(over: Partial<MasteryOp> & Pick<MasteryOp, "op">): MasteryOp {
  return { conceptId: CONCEPT, reason: "because", ...over };
}

function state(over: Partial<MasteryState> = {}): MasteryState {
  return {
    level: "developing",
    rationale: null,
    confidence: null,
    isLocked: false,
    ...over,
  };
}

describe("decideMasteryAction", () => {
  it("does nothing for an explicit noop", () => {
    expect(decideMasteryAction(state(), op({ op: "noop" }))).toEqual({
      kind: "noop",
      reason: "because",
    });
  });

  describe("add", () => {
    it("inserts when the concept is unknown", () => {
      const action = decideMasteryAction(
        null,
        op({ op: "add", level: "emerging", rationale: "début" }),
      );
      expect(action).toEqual({
        kind: "insert",
        values: { level: "emerging", rationale: "début", confidence: null },
      });
    });

    it("refuses to create a row without a level", () => {
      const action = decideMasteryAction(null, op({ op: "add" }));
      expect(action.kind).toBe("noop");
    });

    it("folds an add onto an existing row into a merge", () => {
      const action = decideMasteryAction(
        state({ level: "emerging" }),
        op({ op: "add", level: "secure" }),
      );
      expect(action.kind).toBe("update");
    });
  });

  describe("update merge (brief §4.5)", () => {
    it("keeps fields the op does not mention", () => {
      const current = state({
        level: "developing",
        rationale: "comprend les causes, confond les dates",
      });
      const action = decideMasteryAction(
        current,
        op({ op: "update", level: "secure" }),
      );
      expect(action).toEqual({
        kind: "update",
        values: {
          level: "secure",
          rationale: "comprend les causes, confond les dates",
          confidence: null,
        },
      });
    });

    it("clears a field only when the op explicitly passes null", () => {
      const action = decideMasteryAction(
        state({ rationale: "ancienne note" }),
        op({ op: "update", rationale: null }),
      );
      expect((action as { values: { rationale: string | null } }).values.rationale).toBeNull();
    });

    it("is a noop when the merge changes nothing", () => {
      const current = state({ level: "secure", rationale: "ok" });
      const action = decideMasteryAction(
        current,
        op({ op: "update", level: "secure" }),
      );
      expect(action).toEqual({ kind: "noop", reason: "no change" });
    });

    it("treats an update on an unknown concept as an insert", () => {
      const action = decideMasteryAction(
        null,
        op({ op: "update", level: "developing" }),
      );
      expect(action.kind).toBe("insert");
    });
  });

  describe("delete", () => {
    it("deletes an existing row on an explicit delete", () => {
      expect(decideMasteryAction(state(), op({ op: "delete" }))).toEqual({
        kind: "delete",
      });
    });

    it("is a noop when there is nothing to delete", () => {
      expect(decideMasteryAction(null, op({ op: "delete" })).kind).toBe("noop");
    });
  });

  describe("lock guard", () => {
    it("blocks an update on a locked row", () => {
      const action = decideMasteryAction(
        state({ isLocked: true }),
        op({ op: "update", level: "secure" }),
      );
      expect(action).toEqual({ kind: "noop", reason: "locked" });
    });

    it("blocks a delete on a locked row", () => {
      expect(
        decideMasteryAction(state({ isLocked: true }), op({ op: "delete" })).kind,
      ).toBe("noop");
    });

    it("allows a forced op to write a locked row", () => {
      const action = decideMasteryAction(
        state({ isLocked: true, level: "emerging" }),
        op({ op: "update", level: "secure", force: true }),
      );
      expect(action.kind).toBe("update");
    });
  });
});
