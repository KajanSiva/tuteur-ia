import { randomBytes } from "node:crypto";

// The HMAC secret behind every session token. Without AUTH_SECRET a random
// per-boot secret is used: everything works, but sessions do not survive a
// server restart — fine for dev, set it on a real deployment.
export function resolveAuthSecret(warn: (message: string) => void): string {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length > 0) {
    return configured;
  }
  warn(
    "AUTH_SECRET is not set — using a random per-boot secret (sessions reset on restart)",
  );
  return randomBytes(32).toString("hex");
}
