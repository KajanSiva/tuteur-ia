import {
  Annotation,
  END,
  MemorySaver,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";

// The retry contract the chat route relies on: when a node throws, the run's
// input is already committed to the thread, so a retry must replay the pending
// task rather than re-send the turn. These tests pin that LangGraph behaviour —
// the whole retry path is wrong if it does not hold.

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  attempts: Annotation<number>({
    reducer: (previous, next) => previous + next,
    default: () => 0,
  }),
});

// A graph whose single node fails the first `failures` times it runs.
function flakyGraph(failures: number) {
  let seen = 0;
  return new StateGraph(State)
    .addNode("answer", () => {
      seen += 1;
      if (seen <= failures) {
        throw new Error("upstream overloaded");
      }
      return { messages: [new AIMessage("ok")], attempts: 1 };
    })
    .addEdge(START, "answer")
    .addEdge("answer", END)
    .compile({ checkpointer: new MemorySaver() });
}

// A graph whose node hangs until the run's signal fires — a model call whose
// stream went silent, which is what the turn deadline and the client hanging up
// both have to cut through. `reached` resolves once the node is running, so the
// abort lands mid-turn rather than before the run has started.
function hangingGraph() {
  let calls = 0;
  let enter: () => void = () => {};
  const reached = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const graph = new StateGraph(State)
    .addNode("answer", async (_state, runConfig) => {
      calls += 1;
      if (calls === 1) {
        enter();
        await new Promise((_resolve, reject) => {
          runConfig.signal?.addEventListener(
            "abort",
            () => reject(new Error("Aborted")),
            { once: true },
          );
        });
      }
      return { messages: [new AIMessage("ok")], attempts: 1 };
    })
    .addEdge(START, "answer")
    .addEdge("answer", END)
    .compile({ checkpointer: new MemorySaver() });
  return { graph, reached };
}

const config = { configurable: { thread_id: "retry-thread" } };

describe("retrying a failed turn", () => {
  it("commits the turn's input even though the node threw", async () => {
    const graph = flakyGraph(1);
    await expect(
      graph.invoke({ messages: [new HumanMessage("salut")] }, config),
    ).rejects.toThrow("upstream overloaded");

    const state = await graph.getState(config);
    const values = state.values as typeof State.State;
    expect(values.messages).toHaveLength(1);
    expect(state.next).toEqual(["answer"]);
  });

  it("replays the failed node on a null input, without duplicating the input", async () => {
    const graph = flakyGraph(1);
    await expect(
      graph.invoke({ messages: [new HumanMessage("salut")] }, config),
    ).rejects.toThrow("upstream overloaded");

    const resumed = await graph.invoke(null, config);

    expect(resumed.attempts).toBe(1);
    expect(resumed.messages.map((message) => message.content)).toEqual([
      "salut",
      "ok",
    ]);
  });

  it("appends a second turn when the retry re-sends the message instead", async () => {
    const graph = flakyGraph(1);
    await expect(
      graph.invoke({ messages: [new HumanMessage("salut")] }, config),
    ).rejects.toThrow("upstream overloaded");

    const resent = await graph.invoke(
      { messages: [new HumanMessage("salut")] },
      config,
    );

    expect(resent.messages.map((message) => message.content)).toEqual([
      "salut",
      "salut",
      "ok",
    ]);
  });

  it("leaves an aborted turn resumable, so giving up costs nothing", async () => {
    const { graph, reached } = hangingGraph();
    const controller = new AbortController();
    const run = graph.invoke(
      { messages: [new HumanMessage("salut")] },
      { ...config, signal: controller.signal },
    );
    await reached;
    controller.abort();
    await expect(run).rejects.toThrow();

    expect((await graph.getState(config)).next).toEqual(["answer"]);

    const resumed = await graph.invoke(null, config);
    expect(resumed.messages.map((message) => message.content)).toEqual([
      "salut",
      "ok",
    ]);
  });

  it("leaves nothing pending once a turn has completed", async () => {
    const graph = flakyGraph(0);
    await graph.invoke({ messages: [new HumanMessage("salut")] }, config);

    expect((await graph.getState(config)).next).toEqual([]);
  });
});
