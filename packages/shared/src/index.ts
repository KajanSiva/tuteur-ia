// Shared contracts between backend & frontend.
import type { UIMessage } from "ai";

// Closed intent enum — the router's classification target.
// out_of_scope is the guardrail against generic-ChatGPT drift (it also absorbs
// stray off-lesson questions).
export const INTENTS = ["ingest", "revise", "out_of_scope"] as const;
export type Intent = (typeof INTENTS)[number];

// Custom (non-prose) data parts the backend streams alongside text. Each key K
// surfaces as a `data-K` UI part whose `.data` is the value type here. Emitted
// from graph nodes via the LangGraph custom stream; the adapter maps them to
// `data-<type>` parts. Centralised so the front and back share one contract.
export type TutorDataParts = {
  // Transient progress signal (e.g. the slow vision parse). No id → not persisted.
  progress: { message: string };
};

// Central app message type for useChat and the streaming seam.
export type TutorUIMessage = UIMessage<unknown, TutorDataParts>;
