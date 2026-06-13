import type { ProfileOp } from "./ops.js";

export type ProfileState = {
  learningStyle: string | null;
  motivationLevers: string | null;
  frictionToAvoid: string | null;
  isLocked: boolean;
};

export type ProfileValues = {
  learningStyle: string | null;
  motivationLevers: string | null;
  frictionToAvoid: string | null;
};

export type ProfileAction =
  | { kind: "insert"; values: ProfileValues }
  | { kind: "update"; values: ProfileValues }
  | { kind: "noop"; reason: string };

// Pure write policy for the profile (state form). No database access.
//
// The profile is procedural memory: locked by default (a missing row counts as
// locked too), so EVERY write needs an explicit `force` — that is the brief
// §4.5 "they only change on an explicit, logged op". UPDATE merges per field:
// an omitted field is kept, an explicit null clears it.
export function decideProfileAction(
  current: ProfileState | null,
  op: ProfileOp,
): ProfileAction {
  if (op.op === "noop") {
    return { kind: "noop", reason: op.reason };
  }

  if ((current?.isLocked ?? true) && !op.force) {
    return { kind: "noop", reason: "locked" };
  }

  if (current) {
    const values: ProfileValues = {
      learningStyle:
        op.learningStyle !== undefined ? op.learningStyle : current.learningStyle,
      motivationLevers:
        op.motivationLevers !== undefined
          ? op.motivationLevers
          : current.motivationLevers,
      frictionToAvoid:
        op.frictionToAvoid !== undefined
          ? op.frictionToAvoid
          : current.frictionToAvoid,
    };

    if (
      values.learningStyle === current.learningStyle &&
      values.motivationLevers === current.motivationLevers &&
      values.frictionToAvoid === current.frictionToAvoid
    ) {
      return { kind: "noop", reason: "no change" };
    }
    return { kind: "update", values };
  }

  // No row yet → first write (insert), with the provided fields only.
  const values: ProfileValues = {
    learningStyle: op.learningStyle ?? null,
    motivationLevers: op.motivationLevers ?? null,
    frictionToAvoid: op.frictionToAvoid ?? null,
  };

  if (
    values.learningStyle === null &&
    values.motivationLevers === null &&
    values.frictionToAvoid === null
  ) {
    return { kind: "noop", reason: "nothing to write" };
  }
  return { kind: "insert", values };
}
