import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./passwords.js";

describe("hashPassword / verifyPassword", () => {
  it("round-trips: the original password verifies against its hash", () => {
    const stored = hashPassword("libellule");
    expect(verifyPassword("libellule", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("libellule");
    expect(verifyPassword("libelule", stored)).toBe(false);
  });

  it("never stores the password itself and salts each hash", () => {
    const a = hashPassword("libellule");
    const b = hashPassword("libellule");
    expect(a).not.toContain("libellule");
    // Same password, different salt → different stored value.
    expect(a).not.toBe(b);
    expect(verifyPassword("libellule", b)).toBe(true);
  });

  it("rejects a malformed stored value instead of throwing", () => {
    expect(verifyPassword("libellule", "not-a-hash")).toBe(false);
    expect(verifyPassword("libellule", "scrypt:onlysalt")).toBe(false);
    expect(verifyPassword("libellule", "")).toBe(false);
  });
});
