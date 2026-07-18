import { describe, expect, it } from "vitest";
import { clusterCollapse } from "./clusterCollapse";
import type { RankedNode } from "./rankAtlasNodes";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

// A node whose kind resolves to a known territory via canvasTerritory: capability → product, channel → gtm.
function node(id: string, kind: string): AtlasNode {
  return { id, position: { x: 0, y: 0 }, data: { kind, title: id } } as unknown as AtlasNode;
}
function ranked(id: string, surfaced: boolean): RankedNode {
  return { id, surfaced, reason: surfaced ? "band" : null, earnsAt: "structure" };
}

describe("clusterCollapse (SPEC C, pure tail collapse)", () => {
  const nodes = [
    node("cap:1", "capability"), // product, surfaced
    node("cap:2", "capability"), // product, tail
    node("cap:3", "capability"), // product, tail
    node("chan:1", "channel"), // gtm, tail
    node("bet:1", "bet"), // unassigned territory, tail
  ];
  const rankVerdict = [
    ranked("cap:1", true),
    ranked("cap:2", false),
    ranked("cap:3", false),
    ranked("chan:1", false),
    ranked("bet:1", false),
  ];

  it("groups the tail by territory and marks each tail node hidden with its clusterId", () => {
    const { nodes: out, glyphs } = clusterCollapse({ nodes, ranked: rankVerdict });
    // Three territory buckets: product (cap:2, cap:3), gtm (chan:1), unassigned (bet:1).
    const byKey = new Map(glyphs.map((g) => [g.clusterKey, g]));
    expect(byKey.get("product")?.count).toBe(2);
    expect(byKey.get("gtm")?.count).toBe(1);
    expect(byKey.get("unassigned")?.count).toBe(1);
    expect(byKey.get("product")?.label).toBe("2 more Product directions");
    expect(byKey.get("unassigned")?.label).toBe("1 more direction");

    // The surfaced node is untouched; tail nodes are hidden + carry the clusterId of their group.
    const outById = new Map(out.map((n) => [n.id, n]));
    expect(outById.get("cap:1")?.hidden).toBeUndefined();
    expect(outById.get("cap:2")?.hidden).toBe(true);
    expect((outById.get("cap:2")?.data as { clusterId?: string }).clusterId).toBe("cluster:product");
    expect((outById.get("chan:1")?.data as { clusterId?: string }).clusterId).toBe("cluster:gtm");
  });

  // The invariant the spec names: surfaced ∪ clustered === allNodes. Nothing is ever dropped from the array.
  it("INVARIANT: surfaced ∪ clustered === allNodes (nothing removed)", () => {
    const { nodes: out, glyphs } = clusterCollapse({ nodes, ranked: rankVerdict });
    // Every input node is emitted exactly once.
    expect(out.map((n) => n.id).sort()).toEqual(nodes.map((n) => n.id).sort());
    expect(out).toHaveLength(nodes.length);

    const surfaced = out.filter((n) => !n.hidden).map((n) => n.id);
    const clustered = glyphs.flatMap((g) => g.memberIds);
    // Disjoint and covering: surfaced ∪ clustered === all, with no id in both.
    expect(new Set(surfaced).size + new Set(clustered).size).toBe(nodes.length);
    expect([...surfaced, ...clustered].sort()).toEqual(nodes.map((n) => n.id).sort());
    // Every clustered id is actually hidden in the array (still present, just folded).
    for (const id of clustered) expect(out.find((n) => n.id === id)?.hidden).toBe(true);
  });

  it("an unranked node fails open to surfaced rather than vanishing", () => {
    // ranked verdict omits bet:1 entirely.
    const partial = [ranked("cap:1", true), ranked("cap:2", false)];
    const { nodes: out, glyphs } = clusterCollapse({ nodes: [nodes[0], nodes[1], nodes[4]], ranked: partial });
    expect(out.find((n) => n.id === "bet:1")?.hidden).toBeUndefined();
    // Still covered by the invariant.
    const clustered = glyphs.flatMap((g) => g.memberIds);
    const surfaced = out.filter((n) => !n.hidden).map((n) => n.id);
    expect([...surfaced, ...clustered].sort()).toEqual(["bet:1", "cap:1", "cap:2"]);
  });

  it("is pure — the input nodes are not mutated", () => {
    const input = nodes.map((n) => ({ ...n }));
    clusterCollapse({ nodes, ranked: rankVerdict });
    expect(nodes[1].hidden).toBeUndefined();
    expect(nodes).toEqual(input.map((n, i) => ({ ...nodes[i] })));
  });
});
