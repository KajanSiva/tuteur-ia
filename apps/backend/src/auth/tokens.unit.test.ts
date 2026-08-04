import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { type SessionClaims, signSession, verifySession } from "./tokens.js";

const SECRET = "test-secret";
const NOW = new Date("2026-07-23T10:00:00Z");

function claims(over: Partial<SessionClaims> = {}): SessionClaims {
  return {
    role: "child",
    sub: "10000000-0000-4000-8000-000000000001",
    exp: Math.floor(NOW.getTime() / 1000) + 3600,
    ...over,
  };
}

describe("signSession / verifySession", () => {
  it("round-trips valid claims", () => {
    const token = signSession(claims(), SECRET);
    expect(verifySession(token, SECRET, NOW)).toEqual(claims());
  });

  it("rejects a token signed with another secret", () => {
    const token = signSession(claims(), "other-secret");
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  it("rejects a tampered payload even with an intact structure", () => {
    const token = signSession(claims(), SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify(claims({ role: "parent" })),
    ).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signSession(
      claims({ exp: Math.floor(NOW.getTime() / 1000) - 1 }),
      SECRET,
    );
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  it("rejects garbage instead of throwing", () => {
    expect(verifySession("", SECRET, NOW)).toBeNull();
    expect(verifySession("abc", SECRET, NOW)).toBeNull();
    expect(verifySession("a.b.c", SECRET, NOW)).toBeNull();
    expect(verifySession("%%%.###", SECRET, NOW)).toBeNull();
  });

  it("rejects a well-signed payload that is not session claims", () => {
    const payload = Buffer.from(JSON.stringify({ foo: 1 })).toString(
      "base64url",
    );
    const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(verifySession(`${payload}.${sig}`, SECRET, NOW)).toBeNull();
  });
});
