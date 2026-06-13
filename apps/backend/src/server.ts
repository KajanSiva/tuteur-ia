import { randomUUID } from "node:crypto";
import "dotenv/config";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { toBaseMessages } from "@ai-sdk/langchain";
import cors from "@fastify/cors";
import { INTENTS, type TutorUIMessage } from "@tuteur/shared";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import Fastify from "fastify";

import { buildRouterGraph } from "./graphs/router.graph.js";

const app = Fastify({ logger: true });

// Permissive CORS for local dev (Vite frontend on a different port).
await app.register(cors, { origin: true });

const router = buildRouterGraph();

app.get("/health", async () => ({ status: "ok", intents: INTENTS }));

app.post("/api/chat", async (request, reply) => {
  const body = request.body as { messages: TutorUIMessage[]; id?: string };
  const threadId = body.id ?? "default";

  const messages = await toBaseMessages(body.messages);
  const state = await router.invoke(
    { messages },
    { configurable: { thread_id: threadId } },
  );

  const last = state.messages.at(-1);
  const replyText =
    last && typeof last.content === "string" ? last.content : "";

  // Deterministic node replies are fixed text: emit them as a single UI text
  // part. Token-by-token streaming of a model arrives with the socratic node.
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = randomUUID();
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: replyText });
      writer.write({ type: "text-end", id });
    },
  });

  const response = createUIMessageStreamResponse({ stream });
  if (!response.body) {
    throw new Error("UI message stream produced no body");
  }

  reply.code(response.status);
  response.headers.forEach((value, key) => reply.header(key, value));
  return Readable.fromWeb(response.body as unknown as NodeReadableStream);
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
