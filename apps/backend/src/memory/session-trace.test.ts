import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "../db/client.js";
import {
  appendSessionTraceEntry,
  endSessionTrace,
  type SessionTraceEntry,
  startSessionTrace,
} from "./session-trace.js";

const STUDENT = "10000000-0000-4000-8000-000000000001";
const LESSON = "11111111-1111-4111-8111-111111111111";
const WATERLOO = "11111111-1111-4111-8111-000000000101";
const MONARCHIE = "11111111-1111-4111-8111-000000000102";

afterEach(async () => {
  await prisma.sessionTrace.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function entry(over: Partial<SessionTraceEntry> = {}): SessionTraceEntry {
  return {
    conceptId: WATERLOO,
    conceptLabel: "Waterloo",
    status: "resolved",
    level: "secure",
    rationale: null,
    confidence: null,
    turns: 1,
    ...over,
  };
}

function trace(id: string) {
  return prisma.sessionTrace.findUniqueOrThrow({ where: { id } });
}

describe("session trace", () => {
  it("opens with an empty transcript and no end", async () => {
    const id = await startSessionTrace(STUDENT, LESSON);
    const row = await trace(id);
    expect(row.transcript).toEqual([]);
    expect(row.endedAt).toBeNull();
  });

  it("accumulates appended entries in order rather than overwriting", async () => {
    const id = await startSessionTrace(STUDENT, LESSON);
    await appendSessionTraceEntry(id, entry({ conceptId: WATERLOO, turns: 2 }));
    await appendSessionTraceEntry(
      id,
      entry({ conceptId: MONARCHIE, status: "forced", level: "emerging", turns: 4 }),
    );

    const row = await trace(id);
    const recorded = row.transcript as SessionTraceEntry[];
    expect(recorded.map((e) => [e.conceptId, e.status, e.turns])).toEqual([
      [WATERLOO, "resolved", 2],
      [MONARCHIE, "forced", 4],
    ]);
  });

  it("stamps endedAt when the session closes", async () => {
    const id = await startSessionTrace(STUDENT, LESSON);
    await endSessionTrace(id);
    expect((await trace(id)).endedAt).toBeInstanceOf(Date);
  });
});
