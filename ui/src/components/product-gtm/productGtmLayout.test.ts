import { describe, expect, it } from "vitest";
import type { FirmSemanticModel } from "@/types";
import { productGtmBundleOffset } from "./productGtmEdgeGeometry";
import { buildProductGtmLayout } from "./productGtmLayout";
import { layoutProductGtmWorkflow } from "./productGtmWorkflow";

const entry = (id: string, type: string) => ({
  id, type, name: id, statement: id, properties: {}, assertion: "founder-asserted" as const,
});
const join = (from: string, to: string) => ({
  id: `${from}-${to}`, fromRef: `object:${from}`, toRef: `object:${to}`, label: "leads to",
  type: "connected", properties: {}, assertion: "founder-asserted" as const, sourceRefs: [],
});

describe("Product/GTM layout", () => {
  it("prefers a complete Product-to-market-to-evidence chapter over a longer generic chain", () => {
    const model: FirmSemanticModel = {
      schemaVersion: 3, ventureId: "venture-one", revision: 1,
      objects: [
        entry("direction", "direction"), entry("generic-a", "note"), entry("generic-b", "note"), entry("generic-c", "note"), entry("generic-d", "note"), entry("generic-e", "note"),
        entry("product", "capability"), entry("market", "campaign"), entry("evidence", "evidence"),
      ],
      relationships: [
        join("direction", "generic-a"), join("generic-a", "generic-b"), join("generic-b", "generic-c"), join("generic-c", "generic-d"), join("generic-d", "generic-e"),
        join("direction", "product"), join("product", "market"), join("market", "evidence"),
      ],
      modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
    };

    const layout = buildProductGtmLayout(model, null, null);

    expect(layout.spine).toEqual(["direction", "product", "market", "evidence"]);
    expect([...layout.initialFocusIds]).toEqual(layout.spine);
  });

  it("keeps workflow columns and branches compact enough for readable chapter framing", () => {
    const graph = {
      steps: [
        { id: "trigger", label: "Signal" }, { id: "prepare", label: "Prepare" },
        { id: "approve", label: "Approve" }, { id: "revise", label: "Revise" }, { id: "send", label: "Send" },
      ],
      edges: [
        { from: "trigger", to: "prepare" }, { from: "prepare", to: "approve" },
        { from: "prepare", to: "revise" }, { from: "approve", to: "send" }, { from: "revise", to: "send" },
      ],
    };
    const layout = layoutProductGtmWorkflow("owner", graph, { x: 100, y: 200 });

    expect(layout.positions.get("prepare")!.x - layout.positions.get("trigger")!.x).toBe(272);
    expect(Math.abs(layout.positions.get("approve")!.y - layout.positions.get("revise")!.y)).toBe(72);
  });

  it("fans bundled branches around their shared route", () => {
    expect([0, 1, 2].map((index) => productGtmBundleOffset(index, 3))).toEqual([-16, 0, 16]);
    expect(productGtmBundleOffset(0, 1)).toBe(0);
  });
});
