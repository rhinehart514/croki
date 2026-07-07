import { describe, it, expect } from "vitest";
import { describeOperations, describeGraphDiff } from "./canvasHistory";
import type { GTMGraph, GTMNode, GTMEdge, GraphOperation } from "@/types";

// The receipts are the load-bearing UX here — an undo trail is only trustworthy if each line reads as a
// plain-English record of what happened. These lock the labels to founder language, never opcodes.

const node = (id: string, label: string, extra: Partial<GTMNode> = {}): GTMNode => ({
  id, label, category: "generate", position: { x: 0, y: 0 }, config: {}, ...extra,
});

const edge = (id: string, source: string, target: string): GTMEdge => ({
  id, source, target, edgeType: "data",
});

const graph = (nodes: GTMNode[], edges: GTMEdge[] = []): GTMGraph => ({
  id: "g1", name: "Test", version: "0", nodes, edges,
});

describe("describeOperations", () => {
  const base = graph(
    [node("buyer", "Buyer"), node("draft", "Draft outreach")],
    [edge("e1", "buyer", "draft")],
  );

  it("names a connection by its endpoints", () => {
    const ops: GraphOperation[] = [{ type: "connect_nodes", edge: edge("e2", "buyer", "draft") }];
    expect(describeOperations(ops, base)).toBe("Connected Buyer to Draft outreach");
  });

  it("names an added node", () => {
    const ops: GraphOperation[] = [{ type: "add_node", node: node("gate", "Founder gate", { category: "gate" }) }];
    expect(describeOperations(ops, base)).toBe("Added Founder gate");
  });

  it("resolves a removed node's name from the pre-edit board", () => {
    const ops: GraphOperation[] = [{ type: "remove_node", nodeId: "draft" }];
    expect(describeOperations(ops, base)).toBe("Removed Draft outreach");
  });

  it("resolves a disconnect from the pre-edit edge", () => {
    const ops: GraphOperation[] = [{ type: "disconnect_nodes", edgeId: "e1" }];
    expect(describeOperations(ops, base)).toBe("Disconnected Buyer from Draft outreach");
  });

  it("reads a ghost-accept (add + connect) as the add", () => {
    const ops: GraphOperation[] = [
      { type: "add_node", node: node("scout", "Signal Scout", { category: "source" }) },
      { type: "connect_nodes", edge: edge("e3", "scout", "buyer") },
    ];
    expect(describeOperations(ops, base)).toBe("Added Signal Scout");
  });
});

describe("describeGraphDiff", () => {
  const a = node("a", "Buyer");
  const b = node("b", "Draft");

  it("returns null when nothing structural changed (a pure run/store refresh)", () => {
    const before = graph([a, b], [edge("e1", "a", "b")]);
    const after: GTMGraph = { ...before, store: { path: "/x", runs: 3 } };
    expect(describeGraphDiff(before, after)).toBeNull();
  });

  it("labels a single node move", () => {
    const before = graph([a, b]);
    const after = graph([a, { ...b, position: { x: 300, y: 0 } }]);
    expect(describeGraphDiff(before, after)).toBe("Moved Draft");
  });

  it("labels a multi-node rearrange", () => {
    const before = graph([a, b]);
    const after = graph([
      { ...a, position: { x: 100, y: 0 } },
      { ...b, position: { x: 300, y: 0 } },
    ]);
    expect(describeGraphDiff(before, after)).toBe("Rearranged the board");
  });

  it("labels an added node", () => {
    const before = graph([a]);
    const after = graph([a, b]);
    expect(describeGraphDiff(before, after)).toBe("Added Draft");
  });

  it("labels a new connection by endpoints", () => {
    const before = graph([a, b]);
    const after = graph([a, b], [edge("e1", "a", "b")]);
    expect(describeGraphDiff(before, after)).toBe("Connected Buyer to Draft");
  });
});
