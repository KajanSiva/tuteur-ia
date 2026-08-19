import type { FastifyPluginAsync } from "fastify";

const DEFAULT_READINESS_TIMEOUT_MS = 3_000;

type ReadinessRoutesOptions = {
  probe: () => Promise<unknown>;
  timeoutMs?: number;
};

async function withTimeout(
  probe: () => Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("readiness probe timed out")),
      timeoutMs,
    );
    timeout.unref();
  });

  try {
    await Promise.race([Promise.resolve().then(probe), timedOut]);
  } finally {
    clearTimeout(timeout);
  }
}

export function createReadinessRoutes({
  probe,
  timeoutMs = DEFAULT_READINESS_TIMEOUT_MS,
}: ReadinessRoutesOptions): FastifyPluginAsync {
  return async (app) => {
    app.get("/ready", async (request, reply) => {
      try {
        await withTimeout(probe, timeoutMs);
        return { status: "ready" };
      } catch (error) {
        request.log.warn({ err: error }, "readiness check failed");
        reply.code(503);
        return { status: "not_ready" };
      }
    });
  };
}
