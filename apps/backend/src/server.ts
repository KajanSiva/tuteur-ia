import { randomUUID } from "node:crypto";
import "dotenv/config";
import { Readable } from "node:stream";

import { toBaseMessages, toUIMessageStream } from "@ai-sdk/langchain";
import cookie from "@fastify/cookie";
import { INTENTS, type TutorUIMessage } from "@tuteur/shared";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  validateUIMessages,
} from "ai";
import { Command } from "@langchain/langgraph";
import Fastify from "fastify";
import { z } from "zod";

import { authRoutes, sessionOf } from "./auth/routes.js";
import { resolveAuthSecret } from "./auth/secret.js";
import { userFacingError } from "./chat/errors.js";
import { chatThreadId, ConversationIdSchema } from "./chat/thread.js";
import { createCheckpointer } from "./checkpoint/index.js";
import { prisma } from "./db/client.js";
import type { RoutingPhase } from "./graphs/phase.js";
import { buildRouterGraph, type RouterState } from "./graphs/router.graph.js";
import { withoutInternalNodes } from "./graphs/ui-stream.js";
import { createReadinessRoutes } from "./health/readiness.js";
import {
  createTraceHandler,
  flushObservability,
  startObservability,
} from "./observability/langfuse.js";

// Lesson photos arrive inline as base64 file parts; the client downscales them,
// but a multi-page lesson still needs headroom over Fastify's 1 MB default.
const BODY_LIMIT_BYTES = 25 * 1024 * 1024;

// Hard ceiling on a single turn. Nothing else bounds one: Fastify's request and
// connection timeouts default to 0, and the LLM SDK arms its own timeout only
// until the response headers arrive — a stream that goes silent afterwards is
// never cut. The client gives up sooner; this is the backstop for a run whose
// client is already gone.
const TURN_TIMEOUT_MS = 3 * 60 * 1000;

const app = Fastify({ logger: true, bodyLimit: BODY_LIMIT_BYTES });

const authSecret = resolveAuthSecret((message) => app.log.warn(message));
await app.register(cookie);
await app.register(authRoutes, { secret: authSecret });

// Start OpenTelemetry → Langfuse before serving (no-op without keys).
if (startObservability()) {
  app.log.info("langfuse observability enabled");
}

const router = buildRouterGraph(createCheckpointer());

// A structured command the front dispatches (sent in the request body, not as
// free text). add_lesson is handled on the front; the others round-trip here.
const CommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("revise_lesson"), lessonId: z.string() }),
  z.object({ kind: z.literal("add_lesson") }),
  z.object({ kind: z.literal("retry_turn") }),
  z.object({
    kind: z.literal("resume_overwrite"),
    choice: z.enum(["replace", "keep_both", "cancel"]),
  }),
]);

// Envelope of a useChat request. The messages array is validated deeply by
// validateUIMessages below; here we only assert the transport shape. `id` is the
// client's conversation id and is required: it carries the thread identity.
const ChatBodySchema = z.object({
  id: ConversationIdSchema,
  messages: z.array(z.unknown()),
  command: CommandSchema.optional(),
});

app.get("/health", async () => ({ status: "ok", intents: INTENTS }));
await app.register(
  createReadinessRoutes({ probe: () => prisma.$queryRaw`SELECT 1` }),
);

app.post("/api/chat", async (request, reply) => {
  // The chat is the child's space: a valid child session identifies the student,
  // and the thread key namespaces the client's conversation id under that
  // student, so a child can only ever address their own conversations.
  const claims = sessionOf(request, authSecret);
  if (!claims || claims.role !== "child") {
    reply.code(401);
    return { error: "child session required" };
  }
  const student = await prisma.student.findUnique({
    where: { id: claims.sub },
  });
  if (!student) {
    reply.code(401);
    return { error: "child session required" };
  }

  const parsed = ChatBodySchema.safeParse(request.body);
  if (!parsed.success) {
    reply.code(400);
    return { error: "invalid chat request body" };
  }
  const threadId = chatThreadId(student.id, parsed.data.id);

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
    studentId: string;
    lessonId?: string;
    phase?: RoutingPhase;
  } = { messages, studentId: student.id };
  if (command?.kind === "revise_lesson") {
    input.lessonId = command.lessonId;
    input.phase = "entering_revise";
  }

  // Guard resume-vs-new-message (brief §6): if the thread is paused on a HIL
  // interrupt, this POST is the answer to it — resume the graph with the chosen
  // value instead of feeding a new message (which would be re-classified).
  const config = { configurable: { thread_id: threadId } };
  const before = await router.getState(config);
  const wasInterrupted = (before.tasks ?? []).some(
    (task) => (task.interrupts?.length ?? 0) > 0,
  );
  const resumeChoice =
    command?.kind === "resume_overwrite" ? command.choice : "cancel";

  // Retrying a turn that failed mid-flight replays the checkpoint's pending task
  // instead of feeding the message again: the failed run already committed the
  // student's message to the thread, so re-sending it would append a duplicate.
  // With nothing pending (the turn did complete) the message is fed as usual.
  const retrying =
    command?.kind === "retry_turn" && (before.next ?? []).length > 0;

  type GraphInput = Parameters<typeof router.stream>[0];
  let graphInput: GraphInput = input;
  if (wasInterrupted) {
    graphInput = new Command({ resume: resumeChoice });
  } else if (retrying) {
    graphInput = null;
  }

  // One Langfuse trace per turn; sessionId = thread_id ties a séance together.
  // Passed via callbacks, it traces every node and model call underneath.
  const traceHandler = createTraceHandler(threadId);

  // Bounds the run at both ends. LangGraph passes the signal down to the model
  // call, which aborts the HTTP request even mid-stream, so this is what stops a
  // silent upstream from pinning a turn forever. Aborting leaves the turn
  // pending on the thread, which is exactly what a retry resumes.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
  let settled = false;
  // The client hung up (tab closed, network gone, or the child pressed stop):
  // finish nothing on their behalf and stop spending tokens on a reply no one
  // will read.
  request.raw.on("close", () => {
    if (!settled) {
      controller.abort();
    }
  });

  const stream = createUIMessageStream({
    onError: (error) => {
      app.log.error({ err: error, threadId }, "ui stream execute failed");
      return userFacingError(error);
    },
    execute: async ({ writer }) => {
      try {
        const graphStream = await router.stream(graphInput, {
          // "custom" carries non-prose data parts (progress, …) emitted by nodes
          // via config.writer; the adapter maps them to `data-*` UI parts.
          streamMode: ["messages", "values", "custom"],
          ...config,
          signal: controller.signal,
          ...(traceHandler ? { callbacks: [traceHandler] } : {}),
        });

        // The socratic node streams its tokens (surfaced here as text parts);
        // deterministic nodes emit a static message the adapter does not
        // surface, so we fall back to writing their final text once the stream
        // is drained. Strip internal nodes (classify, evaluate) from the stream
        // so their tool_use never surfaces as UI parts. An async generator
        // satisfies toUIMessageStream's AsyncIterable input; cast to its type.
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
          // On an interrupt the paused state carries no messages — guard it.
          const last = finalState.messages?.at(-1);
          const replyText =
            last && typeof last.content === "string" ? last.content : "";
          if (replyText) {
            const id = randomUUID();
            writer.write({ type: "text-start", id });
            writer.write({ type: "text-delta", id, delta: replyText });
            writer.write({ type: "text-end", id });
          }
        }

        // If the graph paused on a HIL interrupt, surface its payload as a
        // data-confirm part (the back↔front contract): the front renders the
        // matching card and disables input until the choice resumes the graph.
        const after = await router.getState(config);
        const pending = (after.tasks ?? []).flatMap(
          (task) => task.interrupts ?? [],
        );
        const confirm: unknown = pending[0]?.value;
        if (
          confirm &&
          typeof confirm === "object" &&
          "kind" in confirm &&
          confirm.kind === "confirm_overwrite"
        ) {
          writer.write({
            type: "data-confirm",
            id: "confirm-overwrite",
            data: confirm,
          });
        }
      } finally {
        settled = true;
        clearTimeout(deadline);
        // Flush this turn's spans to Langfuse (no-op when disabled).
        await flushObservability();
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
