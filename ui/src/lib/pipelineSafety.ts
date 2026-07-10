// pipelineSafety — the authoritative safety classification for a focused pipeline's gate (fix 1). Lives in
// its own module (not the component file) so it is unit-testable and doesn't break Fast Refresh.
//
// Safety is derived from AUTHORITATIVE signals, never from label/text substrings:
//   1. When staged gate items exist, the backend's own item nature (gateItemNature: send / ship / approve —
//      the same rule GateReview + gateDelta use) decides it. That reads files/deployTarget/body, not words.
//   2. Pre-run, the real connector CAPABILITY rule over each execute node: resolve its connector against the
//      connector inventory and read the wall metadata — `explicit_deploy_confirmation` in approvalRequired
//      means deploy, `send` in allowed means an external send, otherwise it stages locally. Plus the
//      product-change node signal (outputKind / config.kind === "product-change") that gateDelta keys on.

import { gateItemNature } from "@/lib/gateItem";
import type { ConnectorMeta, GTMGraph, GTMItem, GTMNode, GTMRunResult } from "@/types";

export type SafetyClass = "local" | "external" | "deploy";

// The product-change node signal — the exact one gateDelta reads (never a substring guess).
function isProductChangeNode(n: GTMNode): boolean {
  return n.outputKind === "product-change" || (n.config as { kind?: unknown } | undefined)?.kind === "product-change";
}

// Classify one execute node's connector by its real wall capabilities (ConnectorMeta.allowed /
// approvalRequired), resolved from the connector inventory. Null when it carries no outward capability.
function connectorSafety(n: GTMNode, byId: Map<string, ConnectorMeta>): SafetyClass | null {
  if (isProductChangeNode(n)) return "deploy";
  const meta = n.connector ? byId.get(n.connector) : undefined;
  if (!meta) return null;
  if ((meta.approvalRequired ?? []).includes("explicit_deploy_confirmation")) return "deploy";
  if ((meta.allowed ?? []).includes("send")) return "external";
  return "local";
}

const SAFETY_RANK: Record<SafetyClass, number> = { local: 0, external: 1, deploy: 2 };
function strongest(a: SafetyClass | null, b: SafetyClass | null): SafetyClass | null {
  if (!a) return b;
  if (!b) return a;
  return SAFETY_RANK[a] >= SAFETY_RANK[b] ? a : b;
}

// The gate node's staged items, when the run produced them — the backend-authoritative shape.
export function stagedGateItems(graph: GTMGraph, result: GTMRunResult | null): GTMItem[] {
  const gate = graph.nodes.find((n) => n.category === "gate");
  if (!gate || !result?.nodes) return [];
  return result.nodes[gate.id]?.items ?? [];
}

// Safety from staged items via the backend's own gateItemNature (ship = deploy, send = external,
// approve = local). Null when nothing is staged yet.
export function safetyFromItems(items: GTMItem[]): SafetyClass | null {
  let acc: SafetyClass | null = null;
  for (const item of items) {
    const nature = gateItemNature(item);
    acc = strongest(acc, nature === "ship" ? "deploy" : nature === "send" ? "external" : "local");
  }
  return acc;
}

// Pre-run fallback: the connector-capability rule over the graph's execute nodes.
export function safetyFromConnectors(graph: GTMGraph, connectors: ConnectorMeta[]): SafetyClass {
  const byId = new Map(connectors.map((c) => [c.id, c]));
  const executes = graph.nodes.filter((n) => n.category === "execute");
  if (!executes.length) return "local";
  let acc: SafetyClass | null = null;
  for (const n of executes) acc = strongest(acc, connectorSafety(n, byId));
  return acc ?? "local";
}
