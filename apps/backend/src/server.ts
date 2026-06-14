import { randomUUID } from "node:crypto";
import "dotenv/config";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { toBaseMessages, toUIMessageStream } from "@ai-sdk/langchain";
import cors from "@fastify/cors";
import { INTENTS, type TutorUIMessage } from "@tuteur/shared";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  validateUIMessages,
} from "ai";
import Fastify from "fastify";
import { z } from "zod";

import { createCheckpointer } from "./checkpoint/index.js";
import { buildRouterGraph, type RouterState } from "./graphs/router.graph.js";

const app = Fastify({ logger: true });

// Permissive CORS for local dev (Vite frontend on a different port).
await app.register(cors, { origin: true });

const router = buildRouterGraph(await createCheckpointer());

// Envelope of a useChat request. The messages array is validated deeply by
// validateUIMessages below; here we only assert the transport shape.
const ChatBodySchema = z.object({
  id: z.string().optional(),
  messages: z.array(z.unknown()),
});

app.get("/health", async () => ({ status: "ok", intents: INTENTS }));

app.post("/api/chat", async (request, reply) => {
  const parsed = ChatBodySchema.safeParse(request.body);
  if (!parsed.success) {
    reply.code(400);
    return { error: "invalid chat request body" };
  }
  const threadId = parsed.data.id ?? "default";

  const uiMessages = await validateUIMessages<TutorUIMessage>({
    messages: parsed.data.messages,
  });
  // The checkpointer holds the thread's transcript; we feed only the newest user
  // message and let MessagesAnnotation's append reducer extend the history.
  // Sending the whole list each turn would duplicate the persisted messages.
  const latest = uiMessages.at(-1);
  if (!latest) {
    reply.code(400);
    return { error: "chat request has no messages" };
  }
  const messages = await toBaseMessages([latest]);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const graphStream = await router.stream(
        { messages },
        {
          streamMode: ["messages", "values"],
          configurable: { thread_id: threadId },
        },
      );

      // The socratic node streams its tokens (surfaced here as text parts);
      // deterministic nodes emit a static message the adapter does not surface,
      // so we fall back to writing their final text once the stream is drained.
      let finalState: typeof RouterState.State | undefined;
      const ui = toUIMessageStream<typeof RouterState.State>(graphStream, {
        onFinish: (state) => {
          finalState = state ?? undefined;
        },
      });

      const reader = ui.getReader();
      let streamedText = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "text-delta") streamedText = true;
        writer.write(value);
      }

      if (!streamedText && finalState) {
        const last = finalState.messages.at(-1);
        const replyText =
          last && typeof last.content === "string" ? last.content : "";
        if (replyText) {
          const id = randomUUID();
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: replyText });
          writer.write({ type: "text-end", id });
        }
      }
    },
  });

  const response = createUIMessageStreamResponse({ stream });
  if (!response.body) {
    throw new Error("UI message stream produced no body");
  }

  reply.code(response.status);
  response.headers.forEach((value, key) => reply.header(key, value));
  // The web ReadableStream and node:stream/web's are structurally identical but
  // nominally distinct under our lib config; bridge the gap for Readable.fromWeb.
  return Readable.fromWeb(response.body as unknown as NodeReadableStream);
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
