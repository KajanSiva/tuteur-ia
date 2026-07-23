import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Password storage: scrypt with a per-password random salt, serialized as
// "scrypt:<salt-hex>:<hash-hex>". Node's built-in scrypt keeps the dependency
// surface at zero for a self-hosted family install.

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
