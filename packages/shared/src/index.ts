// Shared contracts between backend & frontend.

// Closed intent enum — the router's classification target.
// out_of_scope is the guardrail against generic-ChatGPT drift.
export const INTENTS = ["ingest", "revise", "qa", "out_of_scope"] as const;
export type Intent = (typeof INTENTS)[number];
