import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FocusedPipelineReadout } from "@/components/canvas/FocusedPipelineReadout";
import { safetyFromConnectors, safetyFromItems } from "@/lib/pipelineSafety";
import type { ChannelMeta, ConnectorMeta, GTMGraph, GTMItem, GTMNode, GTMRunResult } from "@/types";

function node(over: Partial<GTMNode> & { id: string; category: GTMNode["category"] }): GTMNode {
  return { label: over.id, position: { x: 0, y: 0 }, config: {}, ...over } as GTMNode;
}
function graph(nodes: GTMNode[]): GTMGraph {
  return { id: "g", name: "g", version: "0", nodes, edges: [] };
}
// The real connector inventory shapes (brain/src/connectors/execute/*): capability sets, never labels.
const CONNECTORS: ConnectorMeta[] = [
  { id: "artifact", name: "Artifact", category: "execute", description: "", envKey: null, configured: true, allowed: ["stage_artifact"], blocked: ["deploy"], approvalRequired: ["continue_from_gate"] },
  { id: "gmail", name: "Gmail", category: "execute", description: "", envKey: null, configured: true, allowed: ["send"], blocked: ["send_without_approval"], approvalRequired: ["continue_from_gate"] },
  { id: "deploy", name: "Deploy", category: "execute", description: "", envKey: null, configured: true, allowed: ["deploy_standalone_microproduct_after_two_authorizations"], blocked: [], approvalRequired: ["continue_from_gate", "explicit_deploy_confirmation"] },
];

// ── Fix 1 — safety is the real connector-capability / item-nature rule, never a label substring ──
describe("FocusedPipelineReadout safety (fix 1)", () => {
  it("classifies by connector capability, not label text", () => {
    expect(safetyFromConnectors(graph([node({ id: "e", category: "execute", connector: "gmail" })]), CONNECTORS)).toBe("external");
    expect(safetyFromConnectors(graph([node({ id: "e", category: "execute", connector: "deploy" })]), CONNECTORS)).toBe("deploy");
    expect(safetyFromConnectors(graph([node({ id: "e", category: "execute", connector: "artifact" })]), CONNECTORS)).toBe("local");
    // A step LABELLED "deploy" but wired to the local artifact connector is still local — no substring win.
    expect(safetyFromConnectors(graph([node({ id: "deploy the microproduct", category: "execute", connector: "artifact" })]), CONNECTORS)).toBe("local");
    // No execute node at all → local.
    expect(safetyFromConnectors(graph([node({ id: "gen", category: "generate" })]), CONNECTORS)).toBe("local");
  });

  it("treats a product-change node as deploy via the real gateDelta signal", () => {
    expect(safetyFromConnectors(graph([node({ id: "e", category: "execute", outputKind: "product-change" })]), CONNECTORS)).toBe("deploy");
  });

  it("prefers the backend item nature (gateItemNature) when items are staged", () => {
    const send: GTMItem = { type: "draft", draft: "Hi there, quick question about your workflow." };
    const ship: GTMItem = { type: "draft", files: [{ path: "x.html" }], deployTarget: "vercel" } as unknown as GTMItem;
    const approve: GTMItem = { type: "prospect", name: "Acme" };
    expect(safetyFromItems([approve])).toBe("local");
    expect(safetyFromItems([send])).toBe("external");
    expect(safetyFromItems([approve, ship, send])).toBe("deploy"); // strongest wins
    expect(safetyFromItems([])).toBeNull();
  });
});

// ── Fix 2 — surface the canonical whatYourYesDoes, not a second invented sentence ──
describe("FocusedPipelineReadout gate consequence (fix 2)", () => {
  const channel: ChannelMeta = { id: "ch1", name: "Outbound", kind: "outbound", objective: "Book 3 calls", graphId: "g", enabled: true, status: "idle", lastRunAt: null, lastRunOk: null, pendingGates: 0, nodeCount: 2, runCount: 0, graphRevision: 1, lastRunResult: null };
  const g = graph([node({ id: "gate1", category: "gate" }), node({ id: "send1", category: "execute", connector: "gmail" })]);

  it("shows the exact whatYourYesDoes from the staged items", () => {
    const result = { runId: "r", graphId: "g", ok: true, executionOrder: [], pendingGates: ["gate1"], nodes: { gate1: { nodeId: "gate1", category: "gate", ok: true, items: [{ type: "draft", draft: "Hey", whatYourYesDoes: "Approving sends 3 emails to real recipients." }] } } } as unknown as GTMRunResult;
    render(<FocusedPipelineReadout channel={channel} graph={g} connectors={CONNECTORS} result={result} lane={null} runSummary={null} />);
    expect(screen.getByText("Approving sends 3 emails to real recipients.")).toBeTruthy();
  });

  it("falls back to the honest shape-derived line only when no canonical consequence is staged", () => {
    render(<FocusedPipelineReadout channel={channel} graph={g} connectors={CONNECTORS} result={null} lane={null} runSummary={null} transportConnected={false} />);
    // External send, no transport connected → the honest staged line; no invented "sends to real recipients".
    expect(screen.getByText(/Nothing sends until you connect a sender/)).toBeTruthy();
  });
});
