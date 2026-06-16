import { describe, expect, it } from "vitest";

import { withoutInternalNodes } from "./ui-stream.js";

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

function msg(node: string, content: string) {
  return ["messages", [{ content }, { langgraph_node: node }]];
}

describe("withoutInternalNodes", () => {
  it("drops message chunks from internal nodes (classify, evaluate)", async () => {
    const result = await collect(
      withoutInternalNodes(
        (async function* () {
          yield msg("classify", "intent");
          yield msg("evaluate", "signal");
        })(),
      ),
    );
    expect(result).toEqual([]);
  });

  it("keeps message chunks from user-facing nodes", async () => {
    const socratic = msg("socratic", "question");
    const result = await collect(
      withoutInternalNodes(
        (async function* () {
          yield msg("classify", "intent");
          yield socratic;
        })(),
      ),
    );
    expect(result).toEqual([socratic]);
  });

  it("passes non-message tuples (values) through untouched", async () => {
    const values = ["values", { messages: [], phase: "revising" }];
    const result = await collect(
      withoutInternalNodes(
        (async function* () {
          yield values;
        })(),
      ),
    );
    expect(result).toEqual([values]);
  });
});
