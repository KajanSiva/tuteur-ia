import { prisma } from "../db/client.js";
import type { MasteryLevel } from "../generated/prisma/enums.js";

// One episodic record appended to a session's trace when a concept is resolved.
// "forced" marks a resolution reached at the turn cap rather than by mastery.
export type SessionTraceEntry = {
  conceptId: string;
  conceptLabel: string;
  status: "resolved" | "forced";
  level: MasteryLevel | null;
  rationale: string | null;
  turns: number;
};

// Opens a session trace at the start of a revision session. The row exists even
// if nothing ends up resolved — it records that the session happened, and
// endedAt later gives its span.
export async function startSessionTrace(
  studentId: string,
  lessonId: string,
): Promise<string> {
  const trace = await prisma.sessionTrace.create({
    data: { studentId, lessonId },
    select: { id: true },
  });
  return trace.id;
}

// Appends one entry to the trace's transcript with an atomic jsonb concat — no
// read-modify-write, so each resolved concept is durably recorded the moment it
// happens (incremental distillation that survives an abrupt quit, brief §4.6).
export async function appendSessionTraceEntry(
  traceId: string,
  entry: SessionTraceEntry,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE session_trace
    SET transcript = transcript || ${JSON.stringify([entry])}::jsonb
    WHERE id = ${traceId}::uuid
  `;
}

// Closes the session trace.
export async function endSessionTrace(traceId: string): Promise<void> {
  await prisma.sessionTrace.update({
    where: { id: traceId },
    data: { endedAt: new Date() },
  });
}
