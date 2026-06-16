// Nodes whose LLM output is structured plumbing (a tool_use carrying an intent,
// a lesson choice, or a mastery signal), never something the student should see.
// Their token chunks must not reach the UI stream.
const INTERNAL_NODES = new Set([
  "classify",
  "evaluate",
  "resolveLesson",
  "ingestParse",
  "ingestDetect",
]);

// Drops `["messages", [chunk, metadata]]` tuples emitted by internal nodes from
// the graph's multi-mode stream, before it is handed to toUIMessageStream. Only
// the "messages" mode is filtered; "values" tuples (used for onFinish) pass
// through untouched. Internal nodes never write to `messages`, so their tool_use
// only surfaces here under streamMode "messages" — dropping it keeps them
// internal without affecting routing or final state.
export async function* withoutInternalNodes<T>(
  stream: AsyncIterable<T>,
): AsyncGenerator<T> {
  for await (const chunk of stream) {
    if (Array.isArray(chunk) && chunk[0] === "messages") {
      const payload: unknown = chunk[1];
      const metadata = Array.isArray(payload)
        ? (payload[1] as { langgraph_node?: string } | undefined)
        : undefined;
      if (metadata?.langgraph_node && INTERNAL_NODES.has(metadata.langgraph_node)) {
        continue;
      }
    }
    yield chunk;
  }
}
