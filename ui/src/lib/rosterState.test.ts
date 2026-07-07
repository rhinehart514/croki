import { describe, it, expect } from "vitest";
import { rosterState } from "./rosterState";
import type { GTMNode, GTMNodeResult, GTMRunResult } from "@/types";

// The plan roster is only honest if a row advances on REAL streamed events, never on fabricated
// progress — it must strike off in lockstep with the canvas node the same run lights. These pin the
// binding: proposed → ghost, the currently-running node → working, a landed result → done, a gate that
// wants the founder → gate, a step that ran and errored → stuck (never dressed up as done), and a step
// with no result yet → pending.

const node = (id: string): GTMNode => ({
  id, label: id, category: "generate", position: { x: 0, y: 0 }, config: {},
});

const nodeResult = (over: Partial<GTMNodeResult> = {}): GTMNodeResult => ({
  category: "generate", ok: true, items: [], ...over,
});

const runWith = (nodes: Record<string, GTMNodeResult>): GTMRunResult => ({
  runId: "r1", graphId: "g1", ok: false, nodes, executionOrder: [], pendingGates: [],
});

describe("rosterState — plan row bound to the streamed run", () => {
  const n = node("draft");

  it("a proposed step reads ghost, even if it happens to be the running node", () => {
    expect(rosterState(n, null, null, true)).toBe("ghost");
    expect(rosterState(n, "draft", runWith({ draft: nodeResult() }), true)).toBe("ghost");
  });

  it("the node running right now reads working (the same id the canvas lights)", () => {
    expect(rosterState(n, "draft", null, false)).toBe("working");
  });

  it("a step with no result yet and not running reads pending", () => {
    expect(rosterState(n, "other", null, false)).toBe("pending");
    expect(rosterState(n, null, runWith({ other: nodeResult() }), false)).toBe("pending");
  });

  it("a landed successful result reads done", () => {
    expect(rosterState(n, null, runWith({ draft: nodeResult({ ok: true }) }), false)).toBe("done");
  });

  it("a step that ran and errored reads stuck — never dressed up as done", () => {
    expect(rosterState(n, null, runWith({ draft: nodeResult({ ok: false }) }), false)).toBe("stuck");
  });

  it("a blocked step is not stuck (it's waiting on something, not errored)", () => {
    expect(rosterState(n, null, runWith({ draft: nodeResult({ ok: false, blocked: true }) }), false)).toBe("done");
  });

  it("a gate awaiting the founder reads gate — from pendingReview", () => {
    expect(rosterState(n, null, runWith({ draft: nodeResult({ ok: true, pendingReview: true }) }), false)).toBe("gate");
  });

  it("a gate awaiting the founder reads gate — from a positive awaitingReview meta count", () => {
    const r = runWith({ draft: nodeResult({ ok: true, meta: { awaitingReview: 3 } }) });
    expect(rosterState(n, null, r, false)).toBe("gate");
  });

  it("awaitingReview of 0 is NOT a gate (no fake pending)", () => {
    const r = runWith({ draft: nodeResult({ ok: true, meta: { awaitingReview: 0 } }) });
    expect(rosterState(n, null, r, false)).toBe("done");
  });

  it("the running node wins over a stale prior result for the same id (re-run in place)", () => {
    const r = runWith({ draft: nodeResult({ ok: true }) });
    expect(rosterState(n, "draft", r, false)).toBe("working");
  });
});
