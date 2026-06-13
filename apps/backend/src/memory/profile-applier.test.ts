import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "../db/client.js";
import { applyProfileOp } from "./profile-applier.js";

const STUDENT = "10000000-0000-4000-8000-000000000001";
const META = { studentId: STUDENT, changedBy: "test" };

afterEach(async () => {
  await prisma.studentProfileHistory.deleteMany();
  await prisma.studentProfile.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function profileRow() {
  return prisma.studentProfile.findUnique({ where: { studentId: STUDENT } });
}

function history() {
  return prisma.studentProfileHistory.findMany({
    where: { studentId: STUDENT },
    orderBy: { version: "asc" },
  });
}

describe("applyProfileOp", () => {
  it("does not write the profile without force, even on the first write", async () => {
    const result = await applyProfileOp(META, {
      op: "update",
      learningStyle: "questions courtes",
      reason: "observed",
    });

    expect(result).toMatchObject({ applied: "noop", reason: "locked" });
    expect(await profileRow()).toBeNull();
    expect(await history()).toHaveLength(0);
  });

  it("does not change an existing profile on a non-forced update", async () => {
    await applyProfileOp(META, {
      op: "update",
      learningStyle: "questions courtes",
      reason: "session 1",
      force: true,
    });

    const blocked = await applyProfileOp(META, {
      op: "update",
      learningStyle: "longues lectures",
      reason: "routine, low confidence",
    });

    expect(blocked).toMatchObject({ applied: "noop", reason: "locked" });
    const row = await profileRow();
    expect(row?.learningStyle).toBe("questions courtes");
    expect(row?.version).toBe(1);
    expect(await history()).toHaveLength(1); // only the initial create
  });

  it("creates the profile (locked) on a forced first write", async () => {
    await applyProfileOp(META, {
      op: "update",
      learningStyle: "questions courtes",
      reason: "session 1",
      force: true,
    });

    const row = await profileRow();
    expect(row?.learningStyle).toBe("questions courtes");
    expect(row?.isLocked).toBe(true);
    expect(row?.version).toBe(1);
    expect((await history()).map((h) => [h.version, h.op])).toEqual([[1, "add"]]);
  });

  it("merges per field across forced writes, keeping omitted dimensions", async () => {
    await applyProfileOp(META, {
      op: "update",
      learningStyle: "questions courtes",
      frictionToAvoid: "trop de questions d'affilée",
      reason: "session 1",
      force: true,
    });
    await applyProfileOp(META, {
      op: "update",
      motivationLevers: "félicitations sur une série",
      reason: "session 2",
      force: true,
    });

    const row = await profileRow();
    expect(row?.learningStyle).toBe("questions courtes");
    expect(row?.frictionToAvoid).toBe("trop de questions d'affilée"); // kept
    expect(row?.motivationLevers).toBe("félicitations sur une série");
    expect(row?.version).toBe(2);

    const log = await history();
    expect(log.map((h) => h.op)).toEqual(["add", "update"]);
  });

  it("records provenance on the history row", async () => {
    await applyProfileOp(
      { studentId: STUDENT, changedBy: "session_analysis", runId: "run-7" },
      { op: "update", learningStyle: "exemples concrets", reason: "préfère le concret", force: true },
    );

    const [row] = await history();
    expect(row).toMatchObject({
      op: "add",
      reason: "préfère le concret",
      changedBy: "session_analysis",
      runId: "run-7",
      learningStyle: "exemples concrets",
    });
    expect(row?.recordedAt).toBeInstanceOf(Date);
  });
});
