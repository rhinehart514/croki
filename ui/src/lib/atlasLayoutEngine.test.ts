import { describe, expect, it } from "vitest";
import { computeAtlasLayout, LAYOUT_GAP, type LayoutInput } from "./atlasLayoutEngine";

// A realistic venture field: one hub, seven efforts, four teammates, two capabilities, one wall —
// the composite composition, at the real rendered node sizes.
function field(): LayoutInput[] {
  const nodes: LayoutInput[] = [
    { id: "atlas:intent", kind: "hub", width: 280, height: 190, pinned: true },
    { id: "atlas:wall", kind: "wall", width: 230, height: 122 },
    { id: "capability:product", kind: "capability", width: 168, height: 52 },
    { id: "capability:gmail", kind: "capability", width: 168, height: 52 },
  ];
  for (let index = 0; index < 7; index += 1) {
    nodes.push({ id: `bet:bet-${index}`, kind: "effort", width: 180, height: 180 });
  }
  for (const ref of ["yara", "mira", "soren", "kai"]) {
    nodes.push({ id: `crew:${ref}`, kind: "teammate", width: 138, height: 118 });
  }
  return nodes;
}

function anyOverlap(positions: Map<string, { x: number; y: number }>, nodes: LayoutInput[]) {
  const boxes = nodes.map((node) => {
    const position = positions.get(node.id)!;
    return { id: node.id, ...position, width: node.width, height: node.height };
  });
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap =
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      if (overlap) return [a.id, b.id];
    }
  }
  return null;
}

describe("computeAtlasLayout", () => {
  it("places every node collision-free with at least LAYOUT_GAP clear space", () => {
    const nodes = field();
    const { positions } = computeAtlasLayout(nodes);
    expect(anyOverlap(positions, nodes)).toBeNull();

    // Inflate every box by LAYOUT_GAP/2 on all sides: the inflated boxes must still not overlap,
    // which proves at least LAYOUT_GAP of clear space between every real pair.
    const half = LAYOUT_GAP / 2;
    const boxes = nodes.map((node) => {
      const position = positions.get(node.id)!;
      return {
        id: node.id,
        x: position.x - half,
        y: position.y - half,
        width: node.width + LAYOUT_GAP,
        height: node.height + LAYOUT_GAP,
      };
    });
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap =
          a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlap, `${a.id} too close to ${b.id}`).toBe(false);
      }
    }
  });

  it("pins the hub at the field origin and rings the rest around it", () => {
    const nodes = field();
    const { positions } = computeAtlasLayout(nodes);
    const hub = positions.get("atlas:intent")!;
    // Hub top-left is (-width/2, -height/2): its center is the origin.
    expect(hub.x + 280 / 2).toBeCloseTo(0);
    expect(hub.y + 190 / 2).toBeCloseTo(0);
  });

  it("is deterministic — identical input yields byte-identical positions", () => {
    const first = computeAtlasLayout(field());
    const second = computeAtlasLayout(field());
    for (const [id, position] of first.positions) {
      const other = second.positions.get(id)!;
      expect(other.x).toBe(position.x);
      expect(other.y).toBe(position.y);
    }
  });

  it("stays collision-free as a single new effort joins the field", () => {
    const nodes = field();
    nodes.push({ id: "bet:bet-new", kind: "effort", width: 180, height: 180 });
    const { positions } = computeAtlasLayout(nodes);
    expect(anyOverlap(positions, nodes)).toBeNull();
  });

  it("keeps every selected effort's expansion clear of all resting nodes", () => {
    // An effort only ever expands OUTWARD — toward its orbitSide, the open side of the field the card
    // was placed on (sign of its settled center x, hub pinned at origin). The engine reserves the
    // expansion envelope on exactly that side; this proves a selected card never overlaps a neighbor.
    const nodes = field();
    const { positions } = computeAtlasLayout(nodes);

    for (const effort of nodes.filter((node) => node.kind === "effort")) {
      const restingPosition = positions.get(effort.id)!;
      const centerX = restingPosition.x + effort.width / 2;
      // orbitSide === "left" when the card center is left of the field center (origin): it grows left
      // via translateX(-434); otherwise it grows right from its resting left edge.
      const expandsLeft = centerX < 0;
      const expandedLeft = expandsLeft ? restingPosition.x - 434 : restingPosition.x;

      for (const other of nodes) {
        if (other.id === effort.id) continue;
        const otherPosition = positions.get(other.id)!;
        const overlap =
          expandedLeft < otherPosition.x + other.width &&
          expandedLeft + 566 > otherPosition.x &&
          restingPosition.y < otherPosition.y + other.height &&
          restingPosition.y + 300 > otherPosition.y;
        expect(
          overlap,
          `${effort.id} overlaps ${other.id} when expanded ${expandsLeft ? "left" : "right"}`,
        ).toBe(false);
      }
    }
  });

  it("handles the empty field without throwing", () => {
    const { positions, bounds } = computeAtlasLayout([]);
    expect(positions.size).toBe(0);
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});
