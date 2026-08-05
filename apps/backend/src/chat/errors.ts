// What the child reads when a turn fails. The transcript is a tutoring space, so
// the text stays plain and blameless; the technical error goes to the logs. The
// distinction that matters to the reader is whether waiting will help.
const TRANSIENT =
  "Le service est un peu surchargé en ce moment. Réessaie dans un instant — ta leçon n'est pas perdue.";
const GENERIC =
  "Je n'ai pas réussi à répondre à ce message. Ce n'est pas de ta faute — tu peux réessayer.";
const ABORTED =
  "Ça a pris trop de temps et j'ai arrêté d'attendre. Réessaie — ta leçon n'est pas perdue.";

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

// A turn cut by the deadline or by the client hanging up. Whoever still reads
// this is waiting on a turn that was given up on, not on a broken one.
export function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("name" in error && error.name === "AbortError") {
    return true;
  }
  return error instanceof Error && /\baborted\b/i.test(error.message);
}

export function userFacingError(error: unknown): string {
  if (isAbortError(error)) {
    return ABORTED;
  }
  return isTransientError(error) ? TRANSIENT : GENERIC;
}
