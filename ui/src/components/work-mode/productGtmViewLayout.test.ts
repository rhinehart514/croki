import { describe, expect, it } from "vitest";
import type { ProductGtmViewEdge, ProductGtmViewNode } from "./productGtmView";
import { productGtmTopologyLayout } from "./productGtmViewLayout";

const node = (id: string): ProductGtmViewNode => ({
  id, label: id, detail: "", kind: "truth", state: "current", sourceRef: null,
});
const edge = (from: string, to: string): ProductGtmViewEdge => ({ from, to, label: `${from} to ${to}`, kind: "dependency" });

describe("productGtmTopologyLayout", () => {
  it("lays an architecture map by dependency depth instead of semantic kind", () => {
    const nodes = ["product", "clients", "desktop", "runtime", "transport", "server", "providers", "unknown", "action", "relay", "remote", "foundation", "doc-drift", "doc-action"].map(node);
    const edges = [
      edge("product", "clients"), edge("clients", "desktop"), edge("clients", "runtime"),
      edge("runtime", "transport"), edge("transport", "server"), edge("desktop", "server"),
      edge("server", "providers"), edge("providers", "unknown"), edge("unknown", "action"),
      edge("relay", "remote"), edge("remote", "server"), edge("foundation", "clients"),
      edge("doc-drift", "doc-action"),
    ];
    const positions = productGtmTopologyLayout(nodes, edges);

    expect(positions.get("product")!.x).toBeLessThan(positions.get("clients")!.x);
    expect(positions.get("clients")!.x).toBeLessThan(positions.get("server")!.x);
    expect(positions.get("server")!.x).toBeLessThan(positions.get("action")!.x);
    expect(positions.get("doc-drift")!.x).toBe(positions.get("unknown")!.x);
    expect(positions.get("doc-action")!.x).toBe(positions.get("action")!.x);
    expect(new Set([...positions.values()].map((point) => point.x)).size).toBeGreaterThanOrEqual(6);
    for (const x of new Set([...positions.values()].map((point) => point.x))) {
      const ys = [...positions.values()].filter((point) => point.x === x).map((point) => point.y);
      expect(new Set(ys).size).toBe(ys.length);
    }
  });

  it("reserves in-place detail room below a selected node", () => {
    const nodes = ["root", "first", "second"].map(node);
    const edges = [edge("root", "first"), edge("root", "second")];
    const resting = productGtmTopologyLayout(nodes, edges);
    const selected = productGtmTopologyLayout(nodes, edges, "first");

    expect(selected.get("second")!.y - selected.get("first")!.y)
      .toBeGreaterThan(resting.get("second")!.y - resting.get("first")!.y);
  });
});
