import { describe, it, expect } from "vitest";
import {
  structuralWarnings,
  warningsByNode,
  weakEdgeIds,
  worthALookCount,
} from "./structuralWarnings";
import type { GTMGraph, GTMNode, GTMEdge } from "@/types";

const node = (id: string, label: string, extra: Partial<GTMNode> = {}): GTMNode => ({
  id, label, category: "generate", position: { x: 0, y: 0 }, config: {}, ...extra,
});
const edge = (id: string, source: string, target: string, extra: Partial<GTMEdge> = {}): GTMEdge => ({
  id, source, target, edgeType: "data", ...extra,
});
const graph = (nodes: GTMNode[], edges: GTMEdge[]): GTMGraph => ({
  id: "g", name: "g", version: "1", nodes, edges,
});

describe("structuralWarnings", () => {
  it("flags two agent teammates with the same role as duplicates", () => {
    const g = graph(
      [
        node("w1", "Outreach Writer", { kind: "agent" }),
        node("w2", "outreach  writer", { kind: "agent" }), // same role, different casing/spacing
        node("gate", "Gate", { category: "gate" }),
      ],
      [edge("e1", "w1", "gate"), edge("e2", "w2", "gate")],
    );
    const ws = structuralWarnings(g);
    const dups = ws.filter((w) => w.kind === "duplicate-role");
    expect(dups.map((w) => w.nodeId).sort()).toEqual(["w1", "w2"]);
    expect(dups[0].peerId).toBeDefined();
  });

  it("does not flag a single teammate as a duplicate", () => {
    const g = graph(
      [node("w1", "Outreach Writer", { kind: "agent" }), node("gate", "Gate", { category: "gate" })],
      [edge("e1", "w1", "gate")],
    );
    expect(structuralWarnings(g).some((w) => w.kind === "duplicate-role")).toBe(false);
  });

  it("flags a context node that nothing reads", () => {
    const g = graph(
      [
        node("c1", "Watchlist", { category: "context" }),
        node("c2", "Product grounding", { category: "context" }),
        node("w1", "Writer", { kind: "agent" }),
      ],
      [edge("e1", "c2", "w1", { edgeType: "context" })], // c2 feeds w1; c1 feeds nobody
    );
    const orphans = structuralWarnings(g).filter((w) => w.kind === "orphan-context");
    expect(orphans.map((w) => w.nodeId)).toEqual(["c1"]);
  });

  it("flags a producing step whose output feeds nothing", () => {
    const g = graph(
      [node("s1", "Find prospects", { category: "source" }), node("gen", "Draft", { category: "generate" })],
      [], // s1 leads nowhere, gen leads nowhere
    );
    const deadEnds = structuralWarnings(g).filter((w) => w.kind === "dead-end");
    expect(deadEnds.map((w) => w.nodeId).sort()).toEqual(["gen", "s1"]);
  });

  it("does not call the gate or measure a dead end", () => {
    const g = graph(
      [node("gate", "Gate", { category: "gate" }), node("m", "Measure", { category: "measure" })],
      [],
    );
    expect(structuralWarnings(g).some((w) => w.kind === "dead-end")).toBe(false);
  });

  it("marks the edge from a duplicated step into the gate as a weak feed", () => {
    const g = graph(
      [
        node("w1", "Outreach Writer", { kind: "agent" }),
        node("w2", "Outreach Writer", { kind: "agent" }),
        node("gate", "Gate", { category: "gate" }),
      ],
      [edge("e1", "w1", "gate"), edge("e2", "w2", "gate")],
    );
    const ws = structuralWarnings(g);
    expect(weakEdgeIds(ws)).toEqual(new Set(["e1", "e2"]));
  });

  it("indexes one primary warning per node and counts distinct marks", () => {
    const g = graph(
      [
        node("w1", "Outreach Writer", { kind: "agent" }),
        node("w2", "Outreach Writer", { kind: "agent" }),
        node("c1", "Watchlist", { category: "context" }),
        node("gate", "Gate", { category: "gate" }),
      ],
      [edge("e1", "w1", "gate"), edge("e2", "w2", "gate")],
    );
    const ws = structuralWarnings(g);
    const byNode = warningsByNode(ws);
    expect(byNode.get("w1")?.kind).toBe("duplicate-role");
    expect(byNode.get("c1")?.kind).toBe("orphan-context");
    // 2 duplicate writers + 1 orphan context (nodes) + 2 weak edges = 5
    expect(worthALookCount(ws)).toBe(5);
  });

  it("returns nothing for an empty or missing graph", () => {
    expect(structuralWarnings(null)).toEqual([]);
    expect(structuralWarnings(graph([], []))).toEqual([]);
  });
});
