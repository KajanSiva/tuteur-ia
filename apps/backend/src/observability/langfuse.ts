import { CallbackHandler } from "@langfuse/langchain";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

// Langfuse observability. The span processor reads LANGFUSE_PUBLIC_KEY /
// LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL from the environment; if the keys are
// absent the whole integration stays off so the app (and tests) run unchanged.
//
// The CallbackHandler (v5) is a pure OpenTelemetry span emitter: passing it via
// the graph's `callbacks` makes every node and every model call underneath a
// nested span/generation. Token usage on each generation lets Langfuse compute
// cost; grouping by sessionId (= thread_id) gives cost per séance.

let enabled = false;
let sdk: NodeSDK | undefined;
let spanProcessor: LangfuseSpanProcessor | undefined;

// Starts the OpenTelemetry pipeline once at boot. No-ops when keys are missing
// or when already started. Long-running server → "batched" export; we force a
// flush after each turn so traces show up promptly.
export function startObservability(): boolean {
  if (sdk) return enabled;
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return false;
  }
  spanProcessor = new LangfuseSpanProcessor();
  sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
  sdk.start();
  enabled = true;
  return true;
}

export function isObservabilityEnabled(): boolean {
  return enabled;
}

// One handler per request. sessionId ties every turn of a thread into one
// Langfuse session; tags label the entry flow.
export function createTraceHandler(
  sessionId: string,
): CallbackHandler | undefined {
  if (!enabled) return undefined;
  return new CallbackHandler({ sessionId, tags: ["chat"] });
}

// Flush the turn's spans to Langfuse. Safe to call when disabled.
export async function flushObservability(): Promise<void> {
  await spanProcessor?.forceFlush();
}

export async function shutdownObservability(): Promise<void> {
  await sdk?.shutdown();
}
