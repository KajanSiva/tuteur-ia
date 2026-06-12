import { z } from "zod";

// Structured operation a node proposes for a single concept's mastery.
// zod validates the shape, never the truth of the content.
export const MasteryOpSchema = z.object({
  op: z.enum(["add", "update", "delete", "noop"]),
  conceptId: z.string(),
  level: z.enum(["emerging", "developing", "secure"]).optional(),
  rationale: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  reason: z.string().min(1),
  // Explicit override required to write a locked row.
  force: z.boolean().optional(),
});

export type MasteryOp = z.infer<typeof MasteryOpSchema>;
