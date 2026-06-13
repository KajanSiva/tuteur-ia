import { INTENTS, type Intent } from "@tuteur/shared";
import { z } from "zod";

// Structured output of the classify node. The only intelligence in the router:
// the LLM fills intent + a self-reported confidence; deterministic code routes.
export const IntentSchema = z.object({
  intent: z.enum(INTENTS).describe("L'intention de l'élève pour ce message."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confiance, de 0 à 1, dans cette classification."),
});

export type Classification = z.infer<typeof IntentSchema>;

// Below this confidence the router asks rather than guesses (no implicit choice).
export const CONFIDENCE_THRESHOLD = 0.5;

export type RouteTarget =
  | "revise"
  | "qa"
  | "ingest"
  | "out_of_scope"
  | "clarify";

// Pure routing decision: a classification → the next node. Low confidence or an
// absent/unknown intent routes to `clarify` (ask), never to a guessed flow.
export function routeOnIntent(state: {
  intent?: Intent | null;
  confidence?: number | null;
}): RouteTarget {
  if (state.confidence != null && state.confidence < CONFIDENCE_THRESHOLD) {
    return "clarify";
  }
  switch (state.intent) {
    case "revise":
      return "revise";
    case "qa":
      return "qa";
    case "ingest":
      return "ingest";
    case "out_of_scope":
      return "out_of_scope";
    default:
      return "clarify";
  }
}
