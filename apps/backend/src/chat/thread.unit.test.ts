import { describe, expect, it } from "vitest";

import { chatThreadId, ConversationIdSchema } from "./thread.js";

const STUDENT_A = "11111111-1111-4111-8111-111111111111";
const STUDENT_B = "22222222-2222-4222-8222-222222222222";

describe("ConversationIdSchema", () => {
  it("accepts the url-safe ids a chat client generates", () => {
    for (const id of ["8f4b1c2d3e", "aitxt-9aZ_0", crypto.randomUUID()]) {
      expect(ConversationIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("rejects an empty, over-long, or out-of-charset id", () => {
    for (const id of ["", "a".repeat(65), "conv id", "conv/../other"]) {
      expect(ConversationIdSchema.safeParse(id).success).toBe(false);
    }
  });
});

describe("chatThreadId", () => {
  it("gives each conversation of a student its own thread", () => {
    expect(chatThreadId(STUDENT_A, "first")).not.toBe(
      chatThreadId(STUDENT_A, "second"),
    );
  });

  it("keeps a conversation on one thread across turns", () => {
    expect(chatThreadId(STUDENT_A, "same")).toBe(chatThreadId(STUDENT_A, "same"));
  });

  it("never lets one student's conversation id reach another's thread", () => {
    expect(chatThreadId(STUDENT_A, "shared")).not.toBe(
      chatThreadId(STUDENT_B, "shared"),
    );
    // Student ids are fixed-length uuids, so no conversation id (which may
    // itself contain "-") can make two students collide on one thread key.
    expect(chatThreadId(STUDENT_A, `x-${STUDENT_B}-y`)).not.toBe(
      chatThreadId(STUDENT_B, "y"),
    );
  });
});
