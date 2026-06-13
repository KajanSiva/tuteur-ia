import type { MasteryLevel } from "../generated/prisma/enums.js";
import type { MasteryOp } from "./ops.js";

export type MasteryState = {
  level: MasteryLevel;
  rationale: string | null;
  confidence: number | null;
  isLocked: boolean;
};

export type MasteryValues = {
  level: MasteryLevel;
  rationale: string | null;
  confidence: number | null;
};

export type MasteryAction =
  | { kind: "insert"; values: MasteryValues }
  | { kind: "update"; values: MasteryValues }
  // The snapshot is the state being removed — the shell records it in history
  // without re-reading the row.
  | { kind: "delete"; snapshot: MasteryState }
  | { kind: "noop"; reason: string };

// Pure write policy: given the current mastery state (null = unknown) and one
// proposed operation, decide the concrete action. No database access.
//
// Rules (brief §4.5): UPDATE merges (omitted fields are kept, never nulled);
// DELETE only acts on an existing row; a locked row changes only on an explicit
// forced op. The applier processes only the ops it is given, so a concept that
// is simply not mentioned is never touched — silence is never a delete.
export function decideMasteryAction(
  current: MasteryState | null,
  op: MasteryOp,
): MasteryAction {
  if (op.op === "noop") {
    return { kind: "noop", reason: op.reason };
  }

  if (current?.isLocked && !op.force) {
    return { kind: "noop", reason: "locked" };
  }

  if (op.op === "delete") {
    return current
      ? { kind: "delete", snapshot: current }
      : { kind: "noop", reason: "nothing to delete" };
  }

  // add/update against an existing row → merge per field.
  if (current) {
    const values: MasteryValues = {
      level: op.level ?? current.level,
      rationale: op.rationale !== undefined ? op.rationale : current.rationale,
      confidence:
        op.confidence !== undefined ? op.confidence : current.confidence,
    };

    if (
      values.level === current.level &&
      values.rationale === current.rationale &&
      values.confidence === current.confidence
    ) {
      return { kind: "noop", reason: "no change" };
    }
    return { kind: "update", values };
  }

  // No current row → first assessment. A level is required to create one.
  if (op.level === undefined) {
    return { kind: "noop", reason: "cannot add a concept without a level" };
  }

  return {
    kind: "insert",
    values: {
      level: op.level,
      rationale: op.rationale ?? null,
      confidence: op.confidence ?? null,
    },
  };
}
