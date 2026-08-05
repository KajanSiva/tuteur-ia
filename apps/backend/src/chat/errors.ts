// What the child reads when a turn fails. The transcript is a tutoring space, so
// the text stays plain and blameless; the technical error goes to the logs. The
// distinction that matters to the reader is whether waiting will help.
const TRANSIENT =
  "Le service est un peu surchargé en ce moment. Réessaie dans un instant — ta leçon n'est pas perdue.";
const GENERIC =
  "Je n'ai pas réussi à répondre à ce message. Ce n'est pas de ta faute — tu peux réessayer.";

// Upstream statuses that mean "come back later": rate limited, overloaded, or a
// gateway hiccup.
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

// Provider error codes carried in the body rather than the status — an overload
// surfacing mid-stream arrives this way, with no status to read.
const TRANSIENT_CODES = ["overloaded_error", "rate_limit_error", "api_error"];

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }
  return undefined;
}

export function isTransientError(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined && TRANSIENT_STATUS.has(status)) {
    return true;
  }
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return TRANSIENT_CODES.some((code) => message.includes(code));
}

export function userFacingError(error: unknown): string {
  return isTransientError(error) ? TRANSIENT : GENERIC;
}
