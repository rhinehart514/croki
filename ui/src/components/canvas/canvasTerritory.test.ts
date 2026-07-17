import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { nodeTerritory, TERRITORY_SIDE } from "./canvasTerritory";
import { foldPlacement, seedCanvasPositions } from "./canvasSeedLayout";

function sceneNode(id: string, data: Record<string, unknown>): Node {
  return { id, position: { x: 0, y: 0 }, data } as Node;
}

describe("nodeTerritory — the facet mirror, derived from role/kind never position", () => {
  it("reads the architecture role first (campaign/motion → gtm, system/product-loop → product)", () => {
    expect(nodeTerritory(sceneNode("a", { kind: "concept", element: { role: "campaign" } }))).toBe("gtm");
    expect(nodeTerritory(sceneNode("b", { kind: "concept", element: { role: "motion" } }))).toBe("gtm");
    expect(nodeTerritory(sceneNode("c", { kind: "concept", element: { role: "system" } }))).toBe("product");
    expect(nodeTerritory(sceneNode("d", { kind: "concept", element: { role: "product-loop" } }))).toBe("product");
  });

  it("falls back to the visual kind when no architecture role carries a territory", () => {
    expect(nodeTerritory(sceneNode("e", { kind: "campaign" }))).toBe("gtm");
    expect(nodeTerritory(sceneNode("f", { kind: "system" }))).toBe("product");
  });

  it("classifies the atlas kinds the scene emits to their Law-6 territory (brain vocab mirror)", () => {
    // A populated venture emits capability nodes with no architecture role — capability is product-side
    // built value in the brain (PRODUCT_TYPES), so it must render a territory, not fall on the seam.
    expect(nodeTerritory(sceneNode("cap", { kind: "capability" }))).toBe("product");
    expect(nodeTerritory(sceneNode("rel", { kind: "release" }))).toBe("product");
    expect(nodeTerritory(sceneNode("impl", { kind: "implementation" }))).toBe("product");
    expect(nodeTerritory(sceneNode("aud", { kind: "audience" }))).toBe("gtm");
    expect(nodeTerritory(sceneNode("off", { kind: "offer" }))).toBe("gtm");
    expect(nodeTerritory(sceneNode("chn", { kind: "channel" }))).toBe("gtm");
  });

  it("leaves genuinely neutral kinds — the intent hub, crew, the wall, a bare concept — on the seam (null)", () => {
    expect(nodeTerritory(sceneNode("intent", { kind: "intent" }))).toBeNull();
    expect(nodeTerritory(sceneNode("crew", { kind: "teammate" }))).toBeNull();
    expect(nodeTerritory(sceneNode("wall", { kind: "wall" }))).toBeNull();
    expect(nodeTerritory(sceneNode("concept", { kind: "concept", element: { role: "concept" } }))).toBeNull();
  });
});

describe("seedCanvasPositions — territory-biased seed, hub pinned on the seam", () => {
  const nodes: Node[] = [
    sceneNode("atlas:intent", { kind: "intent" }),
    sceneNode("architecture:sys", { kind: "system", element: { role: "system" } }),
    sceneNode("architecture:cmp", { kind: "campaign", element: { role: "campaign" } }),
  ];

  it("pins the intent hub at the origin seam", () => {
    const positions = seedCanvasPositions(nodes);
    // The hub is engine-pinned at the origin; the layout's top-left offset is symmetric, so its centre
    // sits on the seam (x ≈ 0).
    const hub = positions["atlas:intent"];
    // seedInput passes the fallback width (204) for an unmeasured node; the engine pins the hub centre
    // at the origin, so top-left + width/2 lands on the seam.
    const hubCentre = hub.x + 204 / 2;
    expect(Math.abs(hubCentre)).toBeLessThan(1);
  });

  it("seeds a product-rooted object to one side and a gtm-rooted object to the other", () => {
    const positions = seedCanvasPositions(nodes);
    const product = positions["architecture:sys"].x;
    const gtm = positions["architecture:cmp"].x;
    // Product biases toward its side, gtm toward the opposite side.
    expect(Math.sign(product - 0)).toBe(TERRITORY_SIDE.product);
    expect(Math.sign(gtm - 0)).toBe(TERRITORY_SIDE.gtm);
    expect(product).toBeLessThan(gtm);
  });
});

describe("foldPlacement — a stored founder placement overrides the seed absolutely (Law 6)", () => {
  const nodes: Node[] = [
    sceneNode("atlas:intent", { kind: "intent" }),
    sceneNode("architecture:sys", { kind: "system", element: { role: "system" } }),
  ];

  it("keeps a stored position exactly and never re-seeds a node that was dragged", () => {
    const dragged = { x: 999, y: -777 };
    const positions = foldPlacement(nodes, { "architecture:sys": dragged });
    expect(positions["architecture:sys"]).toEqual(dragged);
    // The un-stored hub still takes its seed.
    expect(positions["atlas:intent"]).toBeDefined();
  });
});
