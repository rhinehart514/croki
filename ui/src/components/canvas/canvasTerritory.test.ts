import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { nodeTerritory, TERRITORY_SIDE } from "./canvasTerritory";
import { canvasReservedHeight, canvasReservedWidth, foldPlacement, seedCanvasPositions } from "./canvasSeedLayout";

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
    const hubCentre = hub.x + canvasReservedWidth("intent") / 2;
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
  // A realistic mixed field: intent hub, TWO working-theory subjects (both map to layout kind "hub" — the
  // exact stacking case the demotion fixes), the WIDE product-loop card (480px in the DOM, wider than its
  // architecture archetype footprint — the exact 320-vs-480 case), product- and gtm-territory cards across
  // >=2 kinds, each sized from its real reserved width. The seed must clear every pair — no card overlaps.
  const field: Node[] = [
    sceneNode("atlas:intent", { kind: "intent" }),
    sceneNode("theory:t1", { kind: "theory" }),
    sceneNode("theory:t2", { kind: "theory" }),
    sceneNode("architecture:loop", { kind: "product-loop", element: { role: "product-loop" } }),
    sceneNode("architecture:loop2", { kind: "product-loop", element: { role: "product-loop" } }),
    sceneNode("architecture:sys", { kind: "system", element: { role: "system" } }),
    sceneNode("architecture:cmp", { kind: "campaign", element: { role: "campaign" } }),
    sceneNode("architecture:mot", { kind: "motion", element: { role: "motion" } }),
    sceneNode("bet:b1", { kind: "bet", bet: { id: "b1" } }),
    sceneNode("bet:b2", { kind: "bet", bet: { id: "b2" } }),
    sceneNode("work:w1", { kind: "work", workKind: "product-change", join: { betId: "b1" } }),
    sceneNode("work:w2", { kind: "work", workKind: "draft", join: { betId: "b2" } }),
  ];

  // The width the seed actually reserves for a kind — read straight from canvasReservedWidth, the SAME
  // seam the seed uses (never a hand-mirror). If a mapping or CSS drift widened a card past its archetype
  // footprint again, this test would separate against the true width and catch the overlap.
  const widthFor = (kind: string) => canvasReservedWidth(kind);
  // Heights come from the SAME shared truth the seed reserves (canvasReservedHeight) — never a hand-mirror,
  // so a footprint or override drift that grew a card past its reserved height fails the test instead of
  // silently overlapping in the DOM (the exact regression the bet 293>280 measured-overflow was).
  const heightFor = (kind: string) => canvasReservedHeight(kind);

  it("clears every pair of placed cards (no overlap at rest, real CSS widths)", () => {
    const positions = seedCanvasPositions(field);
    const boxes = field
      .map((node) => {
        const p = positions[node.id];
        if (!p) return null;
        const kind = String((node.data as { kind: string }).kind);
        return { id: node.id, left: p.x, top: p.y, right: p.x + widthFor(kind), bottom: p.y + heightFor(kind) };
      })
      .filter((box): box is NonNullable<typeof box> => Boolean(box));
    // Every placed card gets a position (nothing filtered off), including both theory subjects.
    expect(boxes.length).toBe(field.length);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("pins only the intent hub at the origin — theory subjects ring as placed cards, not stacked at (0,0)", () => {
    const positions = seedCanvasPositions(field);
    const hubCentre = positions["atlas:intent"].x + canvasReservedWidth("intent") / 2;
    expect(Math.abs(hubCentre)).toBeLessThan(1);
    // Neither theory subject sits stacked on the origin seam; each rings out as its own card.
    for (const id of ["theory:t1", "theory:t2"]) {
      const centre = positions[id].x + canvasReservedWidth("theory") / 2;
      expect(Math.abs(centre), `${id} stacked on the hub at the origin`).toBeGreaterThan(1);
    }
    // The two theory subjects are not on top of each other.
    expect(positions["theory:t1"]).not.toEqual(positions["theory:t2"]);
  });

  it("settles product-rooted cards clearly left of gtm-rooted cards (felt spatial split)", () => {
    const positions = seedCanvasPositions(field);
    const centreX = (id: string, kind: string) => positions[id].x + widthFor(kind) / 2;
    // Product-rooted: the product-loops, the system, and the product-change work (b1 inherits product).
    const product = [centreX("architecture:loop", "product-loop"), centreX("architecture:loop2", "product-loop"), centreX("architecture:sys", "system"), centreX("bet:b1", "bet")];
    // GTM-rooted: the campaign, the motion, and the draft work (b2 inherits gtm).
    const gtm = [centreX("architecture:cmp", "campaign"), centreX("architecture:mot", "motion"), centreX("bet:b2", "bet")];
    expect(Math.max(...product)).toBeLessThan(Math.min(...gtm));
  });

  it("holds every card fully on its own side with a clear seam gutter (guaranteed, not statistical)", () => {
    const positions = seedCanvasPositions(field);
    // Every product-rooted card sits entirely left of the seam (its RIGHT edge is <= 0), and every
    // gtm-rooted card entirely right (its LEFT edge is >= 0). This is the reassert + seam-aware separation
    // guarantee: no card straddles or crosses x = 0, so the two half-planes read as distinct geography.
    const productIds: Array<[string, string]> = [["architecture:loop", "product-loop"], ["architecture:loop2", "product-loop"], ["architecture:sys", "system"], ["bet:b1", "bet"], ["work:w1", "work"]];
    const gtmIds: string[] = ["architecture:cmp", "architecture:mot", "bet:b2", "work:w2"];
    for (const [id, kind] of productIds) {
      const rightEdge = positions[id].x + widthFor(kind);
      expect(rightEdge, `${id} crosses the seam (rightEdge ${rightEdge})`).toBeLessThanOrEqual(0);
    }
    for (const id of gtmIds) {
      const leftEdge = positions[id].x;
      expect(leftEdge, `${id} crosses the seam (leftEdge ${leftEdge})`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("seedCanvasPositions — a small venture still reads left/right, not a top/bottom stack", () => {
  // The pole-seeding regression: a 1-2 bet venture's cards used to seed at x≈0 (the ring poles), stacking
  // above/below the hub so the field read as a top/bottom column instead of a Product/GTM split. With one
  // product bet and one gtm bet, the two directions must land on opposite sides of the seam.
  const nodes: Node[] = [
    sceneNode("atlas:intent", { kind: "intent" }),
    sceneNode("bet:b1", { kind: "bet", bet: { id: "b1" } }),
    sceneNode("bet:b2", { kind: "bet", bet: { id: "b2" } }),
    sceneNode("work:w1", { kind: "work", workKind: "product-change", join: { betId: "b1" } }),
    sceneNode("work:w2", { kind: "work", workKind: "draft", join: { betId: "b2" } }),
  ];

  it("puts the product direction left and the gtm direction right of the seam, off the vertical axis", () => {
    const positions = seedCanvasPositions(nodes);
    const centreX = (id: string, kind: string) => positions[id].x + canvasReservedWidth(kind) / 2;
    const productCentres = [centreX("bet:b1", "bet"), centreX("work:w1", "work")];
    const gtmCentres = [centreX("bet:b2", "bet"), centreX("work:w2", "work")];
    // Both product cards clearly left, both gtm cards clearly right — a felt split even in a tiny venture.
    for (const c of productCentres) expect(c, "product card not clearly left of seam").toBeLessThan(-100);
    for (const c of gtmCentres) expect(c, "gtm card not clearly right of seam").toBeGreaterThan(100);
    expect(Math.max(...productCentres)).toBeLessThan(Math.min(...gtmCentres));
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

  it("routes a newly appearing card AROUND a dragged card (stored placement fed in as a pinned obstacle)", () => {
    // A dragged card parked exactly where the seed would otherwise place a new same-territory card. Before
    // the obstacle wiring, the stored card was excluded from the sim entirely, so the new card could seed
    // right on top of it. Fed as a pinned obstacle, the new card must be separated clear of it.
    const many: Node[] = [
      sceneNode("atlas:intent", { kind: "intent" }),
      sceneNode("architecture:a", { kind: "system", element: { role: "system" } }),
      sceneNode("architecture:b", { kind: "system", element: { role: "system" } }),
      sceneNode("architecture:c", { kind: "system", element: { role: "system" } }),
    ];
    // Park a dragged system card at the origin-ish product region where fresh systems seed.
    const dragged = { x: -260, y: 20 };
    const positions = foldPlacement(many, { "architecture:a": dragged });
    expect(positions["architecture:a"]).toEqual(dragged);
    const w = canvasReservedWidth("system");
    const h = 270;
    const draggedBox = { left: dragged.x, top: dragged.y, right: dragged.x + w, bottom: dragged.y + h };
    for (const id of ["architecture:b", "architecture:c"]) {
      const p = positions[id];
      const box = { left: p.x, top: p.y, right: p.x + w, bottom: p.y + h };
      const overlaps = box.left < draggedBox.right && draggedBox.left < box.right && box.top < draggedBox.bottom && draggedBox.top < box.bottom;
      expect(overlaps, `${id} seeded on top of the dragged card`).toBe(false);
    }
  });
});
