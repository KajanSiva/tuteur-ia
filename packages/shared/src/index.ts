// Shared contracts between backend & frontend.
import type { UIMessage } from "ai";

// Closed intent enum — the router's classification target.
// out_of_scope is the guardrail against generic-ChatGPT drift (it also absorbs
// stray off-lesson questions).
export const INTENTS = ["ingest", "revise", "out_of_scope"] as const;
export type Intent = (typeof INTENTS)[number];

// Central app message type for useChat and the streaming seam. Custom data parts
// (HIL confirm, future structured previews) are added to this alias here.
export type TutorUIMessage = UIMessage;
