import { describe, expect, it } from "vitest";

import { sessionCookieOptions } from "./cookie-options.js";

describe("sessionCookieOptions", () => {
  it("protects production sessions in transit", () => {
    expect(sessionCookieOptions("production")).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  });

  it.each(["development", "test", undefined])(
    "keeps HTTP sessions usable outside production (%s)",
    (environment) => {
      expect(sessionCookieOptions(environment).secure).toBe(false);
    },
  );
});
