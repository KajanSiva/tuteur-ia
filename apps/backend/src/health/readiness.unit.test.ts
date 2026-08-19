import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createReadinessRoutes } from "./readiness.js";

const apps: FastifyInstance[] = [];

async function appWith(
  probe: () => Promise<unknown>,
  timeoutMs?: number,
) {
  const app = Fastify();
  apps.push(app);
  await app.register(createReadinessRoutes({ probe, timeoutMs }));
  await app.ready();
  return app;
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("readiness route", () => {
  it("reports ready when the database probe succeeds", async () => {
    const app = await appWith(async () => [{ one: 1 }]);

    const response = await app.inject("/ready");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
  });

  it("hides database errors behind a generic unavailable response", async () => {
    const app = await appWith(async () => {
      throw new Error("database connection failed");
    });

    const response = await app.inject("/ready");

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "not_ready" });
    expect(response.body).not.toContain("database connection failed");
  });

  it("bounds a database probe that never settles", async () => {
    vi.useFakeTimers();
    const app = await appWith(
      () => new Promise(() => undefined),
      3_000,
    );

    const responsePromise = app.inject("/ready");
    await vi.advanceTimersByTimeAsync(3_000);
    const response = await responsePromise;

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "not_ready" });
  });
});
