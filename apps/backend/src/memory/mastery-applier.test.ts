import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "../db/client.js";
import { applyMasteryOps } from "./mastery-applier.js";

const STUDENT = "10000000-0000-4000-8000-000000000001";
const WATERLOO = "11111111-1111-4111-8111-000000000101";
const MONARCHIE = "11111111-1111-4111-8111-000000000102";
const META = { studentId: STUDENT, changedBy: "test" };

afterEach(async () => {
  await prisma.masteryHistory.deleteMany();
  await prisma.mastery.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function masteryRow(conceptId: string) {
  return prisma.mastery.findUnique({
    where: { studentId_conceptId: { studentId: STUDENT, conceptId } },
  });
}

function history(conceptId: string) {
  return prisma.masteryHistory.findMany({
    where: { studentId: STUDENT, conceptId },
    orderBy: { version: "asc" },
  });
}

describe("applyMasteryOps", () => {
  it("writes the current row and an append-only history with rising versions", async () => {
    await applyMasteryOps(META, [
      { op: "add", conceptId: WATERLOO, level: "emerging", rationale: "début", reason: "first pass" },
    ]);
    await applyMasteryOps(META, [
      { op: "update", conceptId: WATERLOO, level: "secure", reason: "got the date" },
    ]);

    const row = await masteryRow(WATERLOO);
    expect(row?.level).toBe("secure");
    expect(row?.version).toBe(2);

    const log = await history(WATERLOO);
    expect(log.map((h) => [h.version, h.op])).toEqual([
      [1, "add"],
      [2, "update"],
    ]);
  });

  it("preserves earlier nuance when a later op is silent about it (§4.5)", async () => {
    await applyMasteryOps(META, [
      {
        op: "add",
        conceptId: WATERLOO,
        level: "developing",
        rationale: "comprend les causes, confond les dates",
        reason: "session 1",
      },
    ]);
    await applyMasteryOps(META, [
      { op: "update", conceptId: WATERLOO, level: "secure", reason: "session 5, dates not revisited" },
    ]);

    const row = await masteryRow(WATERLOO);
    expect(row?.level).toBe("secure");
    expect(row?.rationale).toBe("comprend les causes, confond les dates");

    // the preserved nuance is carried into the v2 snapshot, not just the live row
    const log = await history(WATERLOO);
    expect(log[1]).toMatchObject({
      version: 2,
      level: "secure",
      rationale: "comprend les causes, confond les dates",
    });
  });

  it("records provenance on each history row", async () => {
    await applyMasteryOps(
      { studentId: STUDENT, changedBy: "session_analysis", runId: "run-42" },
      [
        {
          op: "add",
          conceptId: WATERLOO,
          level: "developing",
          reason: "hésitation observée sur les dates",
        },
      ],
    );

    const [row] = await history(WATERLOO);
    expect(row).toMatchObject({
      op: "add",
      reason: "hésitation observée sur les dates",
      changedBy: "session_analysis",
      runId: "run-42",
      level: "developing",
    });
    expect(row?.recordedAt).toBeInstanceOf(Date);
  });

  it("applies a call atomically — a mid-batch failure rolls back the whole call", async () => {
    const GHOST = "11111111-1111-4111-8111-0000000009ff"; // no matching concept row

    await expect(
      applyMasteryOps(META, [
        { op: "add", conceptId: WATERLOO, level: "emerging", reason: "valid" },
        { op: "add", conceptId: GHOST, level: "secure", reason: "fk violation" },
      ]),
    ).rejects.toThrow();

    // one call = one unit of work: the earlier op is rolled back too
    expect(await masteryRow(WATERLOO)).toBeNull();
    expect(await history(WATERLOO)).toHaveLength(0);
  });

  it("removes the current row and records a delete in history", async () => {
    await applyMasteryOps(META, [
      { op: "add", conceptId: WATERLOO, level: "secure", reason: "first" },
    ]);
    await applyMasteryOps(META, [
      { op: "delete", conceptId: WATERLOO, reason: "concept retired" },
    ]);

    expect(await masteryRow(WATERLOO)).toBeNull();
    const log = await history(WATERLOO);
    expect(log.map((h) => h.op)).toEqual(["add", "delete"]);
  });

  it("leaves concepts it is not told about untouched", async () => {
    await applyMasteryOps(META, [
      { op: "add", conceptId: WATERLOO, level: "emerging", reason: "only this one" },
    ]);

    expect(await masteryRow(MONARCHIE)).toBeNull();
    expect(await history(MONARCHIE)).toHaveLength(0);
  });

  it("does not write a locked row without force", async () => {
    await prisma.mastery.create({
      data: {
        studentId: STUDENT,
        conceptId: WATERLOO,
        level: "emerging",
        isLocked: true,
        changedBy: "seed",
      },
    });

    const blocked = await applyMasteryOps(META, [
      { op: "update", conceptId: WATERLOO, level: "secure", reason: "try" },
    ]);
    expect(blocked[0]).toMatchObject({ applied: "noop", reason: "locked" });
    expect((await masteryRow(WATERLOO))?.level).toBe("emerging");
    expect(await history(WATERLOO)).toHaveLength(0);

    await applyMasteryOps(META, [
      { op: "update", conceptId: WATERLOO, level: "secure", reason: "forced", force: true },
    ]);
    expect((await masteryRow(WATERLOO))?.level).toBe("secure");
  });

  it("stamps the review touch and starts the ladder when a concept becomes secure", async () => {
    const at = new Date("2026-06-15T10:00:00Z");
    await applyMasteryOps({ ...META, reviewedAt: at }, [
      { op: "update", conceptId: WATERLOO, level: "secure", reason: "résolu" },
    ]);

    const row = await masteryRow(WATERLOO);
    expect(row?.level).toBe("secure");
    expect(row?.reviewStep).toBe(0);
    expect(row?.lastReviewedAt).toEqual(at);
  });

  it("climbs the ladder on a confirming re-review, decoupled from the audit history", async () => {
    const t1 = new Date("2026-06-15T10:00:00Z");
    const t2 = new Date("2026-06-17T10:00:00Z");
    await applyMasteryOps({ ...META, reviewedAt: t1 }, [
      { op: "update", conceptId: WATERLOO, level: "secure", reason: "1er passage" },
    ]);
    // Same level again → a NOOP for the state policy, but a real review touch.
    const result = await applyMasteryOps({ ...META, reviewedAt: t2 }, [
      { op: "update", conceptId: WATERLOO, level: "secure", reason: "confirmé" },
    ]);

    expect(result[0]).toMatchObject({ applied: "noop" });
    const row = await masteryRow(WATERLOO);
    expect(row?.reviewStep).toBe(1); // interval grows
    expect(row?.lastReviewedAt).toEqual(t2); // re-stamped
    // The unchanged state writes no history — the touch is not an audit event.
    expect(await history(WATERLOO)).toHaveLength(1);
  });

  it("resets the ladder when the concept drops below secure", async () => {
    const t1 = new Date("2026-06-15T10:00:00Z");
    const t2 = new Date("2026-06-17T10:00:00Z");
    const t3 = new Date("2026-06-20T10:00:00Z");
    await applyMasteryOps({ ...META, reviewedAt: t1 }, [
      { op: "update", conceptId: WATERLOO, level: "secure", reason: "a" },
    ]);
    await applyMasteryOps({ ...META, reviewedAt: t2 }, [
      { op: "update", conceptId: WATERLOO, level: "secure", reason: "b" },
    ]);
    await applyMasteryOps({ ...META, reviewedAt: t3 }, [
      { op: "update", conceptId: WATERLOO, level: "developing", reason: "oubli" },
    ]);

    const row = await masteryRow(WATERLOO);
    expect(row?.level).toBe("developing");
    expect(row?.reviewStep).toBe(0);
  });

  it("keeps versions monotonic across delete and re-add", async () => {
    await applyMasteryOps(META, [
      { op: "add", conceptId: WATERLOO, level: "emerging", reason: "v1" },
    ]);
    await applyMasteryOps(META, [
      { op: "delete", conceptId: WATERLOO, reason: "v2" },
    ]);
    await applyMasteryOps(META, [
      { op: "add", conceptId: WATERLOO, level: "developing", reason: "v3" },
    ]);

    expect((await masteryRow(WATERLOO))?.version).toBe(3);
    expect((await history(WATERLOO)).map((h) => h.version)).toEqual([1, 2, 3]);
  });
});
