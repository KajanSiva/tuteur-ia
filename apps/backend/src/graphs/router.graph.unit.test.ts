import { describe, expect, it } from "vitest";

import { buildRouterGraph } from "./router.graph.js";

describe("buildRouterGraph", () => {
  it("compiles the router with every routed node wired", () => {
    const graph = buildRouterGraph();
    const nodes = graph.getGraph().nodes;
    const ids = Object.values(nodes).map((n) => n.id);
    for (const node of [
      "classify",
      "revise",
      "qa",
      "ingest",
      "out_of_scope",
      "clarify",
    ]) {
      expect(ids).toContain(node);
    }
  });
});
