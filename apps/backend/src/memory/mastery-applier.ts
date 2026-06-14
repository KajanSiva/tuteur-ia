import { prisma } from "../db/client.js";
import { decideMasteryAction, type MasteryState } from "./mastery-policy.js";
import type { MasteryOp } from "./ops.js";

export type ApplyMeta = {
  studentId: string;
  changedBy: string;
  runId?: string | null;
};

export type MasteryOpResult = {
  conceptId: string;
  applied: "insert" | "update" | "delete" | "noop";
  reason?: string;
};

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Applies the mastery operations of one app event (e.g. one answered question)
// in a single transaction: all-or-nothing for that event. Per-concept
// independence across a session (brief §4.7) comes from the call granularity —
// the revise loop calls this once per resolved concept. Within one op, the
// current row and its history row are always written together.
export async function applyMasteryOps(
  meta: ApplyMeta,
  ops: MasteryOp[],
): Promise<MasteryOpResult[]> {
  return prisma.$transaction(async (tx) => {
    const results: MasteryOpResult[] = [];
    for (const op of ops) {
      results.push(await applyOne(tx, meta, op));
    }
    return results;
  });
}

async function applyOne(
  tx: Tx,
  meta: ApplyMeta,
  op: MasteryOp,
): Promise<MasteryOpResult> {
  const { studentId, changedBy, runId = null } = meta;

  const current = await tx.mastery.findUnique({
    where: { studentId_conceptId: { studentId, conceptId: op.conceptId } },
  });

  const currentState: MasteryState | null = current
    ? {
        level: current.level,
        rationale: current.rationale,
        isLocked: current.isLocked,
      }
    : null;

  const action = decideMasteryAction(currentState, op);

  if (action.kind === "noop") {
    return { conceptId: op.conceptId, applied: "noop", reason: action.reason };
  }

  const agg = await tx.masteryHistory.aggregate({
    where: { studentId, conceptId: op.conceptId },
    _max: { version: true },
  });
  const version = (agg._max.version ?? 0) + 1;

  if (action.kind === "delete") {
    await tx.masteryHistory.create({
      data: {
        studentId,
        conceptId: op.conceptId,
        level: action.snapshot.level,
        rationale: action.snapshot.rationale,
        isLocked: action.snapshot.isLocked,
        version,
        changedBy,
        runId,
        op: "delete",
        reason: op.reason,
      },
    });
    await tx.mastery.delete({
      where: { studentId_conceptId: { studentId, conceptId: op.conceptId } },
    });
    return { conceptId: op.conceptId, applied: "delete" };
  }

  const isLocked = current?.isLocked ?? false;
  const memoryOp = action.kind === "insert" ? "add" : "update";

  await tx.mastery.upsert({
    where: { studentId_conceptId: { studentId, conceptId: op.conceptId } },
    create: {
      studentId,
      conceptId: op.conceptId,
      ...action.values,
      isLocked,
      version,
      changedBy,
      runId,
    },
    update: {
      ...action.values,
      version,
      changedBy,
      runId,
      validFrom: new Date(),
    },
  });

  await tx.masteryHistory.create({
    data: {
      studentId,
      conceptId: op.conceptId,
      ...action.values,
      isLocked,
      version,
      changedBy,
      runId,
      op: memoryOp,
      reason: op.reason,
    },
  });

  return { conceptId: op.conceptId, applied: action.kind };
}
