import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { nodeTerritory, TERRITORY_SIDE } from "./canvasTerritory";
import { reservedFootprint } from "@/components/atlas/nodeDimensions";
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
    // sits on the seam (x ≈ 0). The seed reserves the intent archetype's LARGEST-band footprint (440px)
    // as the hub width, so its top-left + width/2 lands back on the seam.
    const hub = positions["atlas:intent"];
    const hubCentre = hub.x + reservedFootprint("intent").width / 2;
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

describe("seedCanvasPositions — collision-free by construction at the arrival fit", () => {
  // A realistic mixed field: intent hub, product-territory and gtm-territory cards across >=2 kinds, each
  // sized from its real reserved footprint. The seed must clear every pair — no card overlaps at rest.
  const field: Node[] = [
    sceneNode("atlas:intent", { kind: "intent" }),
    sceneNode("architecture:loop", { kind: "product-loop", element: { role: "product-loop" } }),
    sceneNode("architecture:sys", { kind: "system", element: { role: "system" } }),
    sceneNode("architecture:cmp", { kind: "campaign", element: { role: "campaign" } }),
    sceneNode("architecture:mot", { kind: "motion", element: { role: "motion" } }),
    sceneNode("bet:b1", { kind: "bet", bet: { id: "b1" } }),
    sceneNode("bet:b2", { kind: "bet", bet: { id: "b2" } }),
    sceneNode("work:w1", { kind: "work", workKind: "product-change", join: { betId: "b1" } }),
    sceneNode("work:w2", { kind: "work", workKind: "draft", join: { betId: "b2" } }),
  ];

  // The archetype size the seed reserves for each kind, mirroring canvasSeedLayout's KIND_ARCHETYPE.
  const sizeFor = (kind: string) => {
    const archetype =
      kind === "intent" ? "intent"
        : kind === "bet" || kind === "work" || kind === "outcome" ? "bet"
          : kind === "capability" ? "capability"
            : kind === "teammate" ? "crew"
              : "architecture";
    return reservedFootprint(archetype as "intent" | "bet" | "capability" | "crew" | "architecture");
  };

  it("clears every pair of placed cards (no overlap at rest)", () => {
    const positions = seedCanvasPositions(field);
    const boxes = field
      .map((node) => {
        const p = positions[node.id];
        if (!p) return null;
        const size = sizeFor(String((node.data as { kind: string }).kind));
        return { id: node.id, left: p.x, top: p.y, right: p.x + size.width, bottom: p.y + size.height };
      })
      .filter((box): box is NonNullable<typeof box> => Boolean(box));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("settles product-rooted cards clearly left of gtm-rooted cards (felt spatial split)", () => {
    const positions = seedCanvasPositions(field);
    const centreX = (id: string, kind: string) => positions[id].x + sizeFor(kind).width / 2;
    // Product-rooted: the product-loop, the system, and the product-change work (b1 inherits product).
    const product = [centreX("architecture:loop", "product-loop"), centreX("architecture:sys", "system"), centreX("bet:b1", "bet")];
    // GTM-rooted: the campaign, the motion, and the draft work (b2 inherits gtm).
    const gtm = [centreX("architecture:cmp", "campaign"), centreX("architecture:mot", "motion"), centreX("bet:b2", "bet")];
    expect(Math.max(...product)).toBeLessThan(Math.min(...gtm));
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
