import { randomUUID } from "node:crypto";
import "dotenv/config";
import { Readable } from "node:stream";

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
import { withoutInternalNodes } from "./graphs/ui-stream.js";

// Lesson photos arrive inline as base64 file parts; the client downscales them,
// but a multi-page lesson still needs headroom over Fastify's 1 MB default.
const BODY_LIMIT_BYTES = 25 * 1024 * 1024;

const app = Fastify({ logger: true, bodyLimit: BODY_LIMIT_BYTES });

// Permissive CORS for local dev (Vite frontend on a different port).
await app.register(cors, { origin: true });

const router = buildRouterGraph(await createCheckpointer());

// A structured command a chip dispatches (sent in the request body, not as free
// text). Only revise_lesson round-trips here; add_lesson is handled on the front.
const CommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("revise_lesson"), lessonId: z.string() }),
  z.object({ kind: z.literal("add_lesson") }),
]);

// Envelope of a useChat request. The messages array is validated deeply by
// validateUIMessages below; here we only assert the transport shape.
const ChatBodySchema = z.object({
  id: z.string().optional(),
  messages: z.array(z.unknown()),
  command: CommandSchema.optional(),
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

  // A revise_lesson chip command seeds the revise session directly: the lesson is
  // already known, so we set it and the entry flag — routeStart sends the turn
  // straight to revise (hydrate), bypassing classify and the resolver (brief §17).
  const command = parsed.data.command;
  const input: {
    messages: typeof messages;
    lessonId?: string;
    enterReviseLessonId?: string;
  } = { messages };
  if (command?.kind === "revise_lesson") {
    input.lessonId = command.lessonId;
    input.enterReviseLessonId = command.lessonId;
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const graphStream = await router.stream(input, {
          // "custom" carries non-prose data parts (progress, …) emitted by nodes
          // via config.writer; the adapter maps them to `data-*` UI parts.
          streamMode: ["messages", "values", "custom"],
          configurable: { thread_id: threadId },
        },
      );

      // The socratic node streams its tokens (surfaced here as text parts);
      // deterministic nodes emit a static message the adapter does not surface,
      // so we fall back to writing their final text once the stream is drained.
      // Strip internal nodes (classify, evaluate) from the stream so their
      // tool_use never surfaces as UI parts. An async generator satisfies
      // toUIMessageStream's AsyncIterable input; cast to its parameter type.
      const filtered = withoutInternalNodes(graphStream) as Parameters<
        typeof toUIMessageStream<typeof RouterState.State>
      >[0];
      let finalState: typeof RouterState.State | undefined;
      const ui = toUIMessageStream<typeof RouterState.State>(filtered, {
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
  return Readable.fromWeb(response.body);
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
