import { prisma } from "../db/client.js";
import type { ProfileOp } from "./ops.js";
import { decideProfileAction, type ProfileState } from "./profile-policy.js";

export type ApplyMeta = {
  studentId: string;
  changedBy: string;
  runId?: string | null;
};

export type ProfileOpResult = {
  applied: "insert" | "update" | "noop";
  reason?: string;
};

// Applies one profile operation: the pure policy decides, then the current row
// and its history row are written together in a transaction. The profile is a
// single row per student, so this takes one op (not a batch).
export async function applyProfileOp(
  meta: ApplyMeta,
  op: ProfileOp,
): Promise<ProfileOpResult> {
  const { studentId, changedBy, runId = null } = meta;

  return prisma.$transaction(async (tx) => {
    const current = await tx.studentProfile.findUnique({ where: { studentId } });

    const currentState: ProfileState | null = current
      ? {
          learningStyle: current.learningStyle,
          motivationLevers: current.motivationLevers,
          frictionToAvoid: current.frictionToAvoid,
          isLocked: current.isLocked,
        }
      : null;

    const action = decideProfileAction(currentState, op);

    if (action.kind === "noop") {
      return { applied: "noop", reason: action.reason };
    }

    const agg = await tx.studentProfileHistory.aggregate({
      where: { studentId },
      _max: { version: true },
    });
    const version = (agg._max.version ?? 0) + 1;

    const isLocked = current?.isLocked ?? true;
    const memoryOp = action.kind === "insert" ? "add" : "update";

    await tx.studentProfile.upsert({
      where: { studentId },
      create: {
        studentId,
        ...action.values,
        isLocked,
        version,
        changedBy,
        runId,
      },
      update: { ...action.values, version, changedBy, runId },
    });

    await tx.studentProfileHistory.create({
      data: {
        studentId,
        ...action.values,
        version,
        changedBy,
        runId,
        op: memoryOp,
        reason: op.reason,
      },
    });

    return { applied: action.kind };
  });
}
