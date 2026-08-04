import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  CONCEPT_MONARCHIE,
  CONCEPT_WATERLOO,
  provisionLesson,
  TEST_LESSON_ID,
  TEST_STUDENT_ID,
} from "../../test/fixtures.js";
import { prisma } from "../db/client.js";
import {
  appendSessionTraceEntry,
  endSessionTrace,
  type SessionTraceEntry,
  startSessionTrace,
} from "./session-trace.js";

const STUDENT = TEST_STUDENT_ID;
const LESSON = TEST_LESSON_ID;
const WATERLOO = CONCEPT_WATERLOO;
const MONARCHIE = CONCEPT_MONARCHIE;

beforeAll(async () => {
  await provisionLesson();
});

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
