import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

// Stateless session tokens: an HMAC-SHA256-signed JSON payload
// ("<payload-b64url>.<signature-b64url>"), carried in an httpOnly cookie.
// No server-side session store — a token is valid until its expiry, and all
// tokens are invalidated together by rotating the secret.

export const SessionClaimsSchema = z.object({
  role: z.enum(["parent", "child"]),
  // Parent id or student id, depending on role.
  sub: z.uuid(),
  // Expiry as a unix timestamp in seconds.
  exp: z.number().int(),
});

export type SessionClaims = z.infer<typeof SessionClaimsSchema>;

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function signSession(claims: SessionClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

// Returns the claims of a well-signed, unexpired token, or null for anything
// else (malformed, tampered, wrong secret, expired). Never throws.
export function verifySession(
  token: string,
  secret: string,
  now: Date,
): SessionClaims | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) {
    return null;
  }
  const expected = signature(payload, secret);
  const given = Buffer.from(sig, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const claims = SessionClaimsSchema.safeParse(parsed);
  if (!claims.success || claims.data.exp * 1000 <= now.getTime()) {
    return null;
  }
  return claims.data;
}
