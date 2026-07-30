import { describe, expect, it } from "vite-plus/test";

import { recoverCrokiContext } from "./crokiContextRecovery.ts";

describe("recoverCrokiContext", () => {
  it("keeps valid canon when a proposed node and its relationship are invalid", () => {
    const recovered = recoverCrokiContext(
      JSON.stringify({
        version: 1,
        product: "Croki",
        updatedAt: "2026-07-30T00:00:00.000Z",
        nodes: [
          {
            id: "intent-1",
            kind: "intent",
            status: "current",
            title: "Keep durable context",
            body: "",
            updatedAt: "2026-07-30T00:00:00.000Z",
          },
          {
            id: "proposal-1",
            kind: "guess",
            status: "provisional",
            title: "Malformed proposal",
            body: "",
            updatedAt: "2026-07-30T00:00:00.000Z",
          },
        ],
        edges: [
          {
            from: "proposal-1",
            to: "intent-1",
            relation: "challenges",
          },
        ],
      }),
    );

    expect(recovered.context.nodes.map((node) => node.id)).toEqual(["intent-1"]);
    expect(recovered.context.edges).toEqual([]);
    expect(recovered.issues).toMatchObject([
      { code: "malformed", path: "nodes[1]" },
      { code: "invalid-edge", path: "edges[0]" },
    ]);
  });

  it("rejects a malformed envelope instead of inventing project context", () => {
    expect(() => recoverCrokiContext("{")).toThrow(/valid JSON/);
    expect(() =>
      recoverCrokiContext(
        JSON.stringify({
          version: 1,
          product: "Croki",
          updatedAt: "not-a-time",
          nodes: [],
          edges: [],
        }),
      ),
    ).toThrow(/invalid updatedAt/);
  });
});
