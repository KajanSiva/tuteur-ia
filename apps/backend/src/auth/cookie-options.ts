import type { CookieSerializeOptions } from "@fastify/cookie";

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieOptions(
  environment: string | undefined,
): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: environment === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
