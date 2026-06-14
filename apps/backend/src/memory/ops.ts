import { z } from "zod";

// Structured operation a node proposes for a single concept's mastery.
// zod validates the shape, never the truth of the content.
export const MasteryOpSchema = z.object({
  op: z.enum(["add", "update", "delete", "noop"]),
  conceptId: z.string(),
  level: z.enum(["emerging", "developing", "secure"]).optional(),
  rationale: z.string().nullable().optional(),
  reason: z.string().min(1),
  // Explicit override required to write a locked row.
  force: z.boolean().optional(),
});

export type MasteryOp = z.infer<typeof MasteryOpSchema>;

// Structured operation for the student profile (state form). Op-set reduces to
// UPDATE-merge / NOOP per field; the row is created lazily on the first write.
export const ProfileOpSchema = z.object({
  op: z.enum(["update", "noop"]),
  learningStyle: z.string().nullable().optional(),
  motivationLevers: z.string().nullable().optional(),
  frictionToAvoid: z.string().nullable().optional(),
  reason: z.string().min(1),
  // The profile is procedural memory (locked by default) — every write needs it.
  force: z.boolean().optional(),
});

export type ProfileOp = z.infer<typeof ProfileOpSchema>;
