import Fastify from "fastify";
import cors from "@fastify/cors";
import { INTENTS } from "@tuteur/shared";

const app = Fastify({ logger: true });

// Permissive CORS for local dev (Vite frontend on a different port).
await app.register(cors, { origin: true });

app.get("/health", async () => ({ status: "ok", intents: INTENTS }));

app.post("/api/chat", async (request) => {
  request.log.info({ body: request.body }, "chat request received");
  return { reply: "stub" };
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
