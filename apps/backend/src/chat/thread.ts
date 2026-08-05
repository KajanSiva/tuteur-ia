import { z } from "zod";

// The conversation id the chat client generates per discussion. Bounded to a
// url-safe charset so an arbitrary client string never lands in a thread key.
export const ConversationIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "invalid conversation id");

// The checkpointer's thread key. A conversation is the unit of persistence: the
// transcript and the routing phase live on the thread, so a new discussion
// starts from a clean state while long-term memory (mastery, profile, lessons)
// stays in Postgres. The student id prefixes the key, so a client can only ever
// address threads of the student it is authenticated as.
export function chatThreadId(studentId: string, conversationId: string): string {
  return `student-${studentId}-${conversationId}`;
}
