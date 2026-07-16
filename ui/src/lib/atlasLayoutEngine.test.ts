import { describe, expect, it } from "vitest";
import { computeAtlasLayout, HUB_CLEARANCE, LAYOUT_GAP, type LayoutInput } from "./atlasLayoutEngine";

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

  it("keeps every node at least HUB_CLEARANCE from the hub's full resting box", () => {
    const nodes: LayoutInput[] = [
      { id: "atlas:intent", kind: "hub", width: 208, height: 208, pinned: true },
      { id: "bet:top", kind: "effort", width: 204, height: 210 },
      { id: "bet:bottom", kind: "effort", width: 204, height: 210 },
      { id: "crew:yara", kind: "teammate", width: 138, height: 118 },
      { id: "capability:gmail", kind: "capability", width: 178, height: 62 },
      { id: "atlas:wall", kind: "wall", width: 230, height: 150 },
    ];
    const { positions } = computeAtlasLayout(nodes);
    const hub = nodes[0];
    const hubPosition = positions.get(hub.id)!;

    for (const other of nodes.slice(1)) {
      const otherPosition = positions.get(other.id)!;
      const clearsHorizontally =
        hubPosition.x + hub.width + HUB_CLEARANCE <= otherPosition.x ||
        otherPosition.x + other.width + HUB_CLEARANCE <= hubPosition.x;
      const clearsVertically =
        hubPosition.y + hub.height + HUB_CLEARANCE <= otherPosition.y ||
        otherPosition.y + other.height + HUB_CLEARANCE <= hubPosition.y;
      expect(
        clearsHorizontally || clearsVertically,
        `${other.id} is within ${HUB_CLEARANCE}px of the hub`,
      ).toBe(true);
    }
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

  it("keeps a selected effort clear of all resting nodes at its resting footprint", () => {
    // Selecting an effort no longer balloons the card on the stage — the card holds its resting width
    // and its full detail opens in the docked inspector (composite §9; firm-journey asserts the
    // selected card stays ≤ 260px). So there is no expansion envelope to reserve: the selected card's
    // footprint IS its resting footprint, and the resting field is already collision-free. This proves
    // that selecting any effort can never introduce an overlap.
    const nodes = field();
    const { positions } = computeAtlasLayout(nodes);

    for (const effort of nodes.filter((node) => node.kind === "effort")) {
      const restingPosition = positions.get(effort.id)!;
      for (const other of nodes) {
        if (other.id === effort.id) continue;
        const otherPosition = positions.get(other.id)!;
        const overlap =
          restingPosition.x < otherPosition.x + other.width &&
          restingPosition.x + effort.width > otherPosition.x &&
          restingPosition.y < otherPosition.y + other.height &&
          restingPosition.y + effort.height > otherPosition.y;
        expect(overlap, `${effort.id} overlaps ${other.id} when selected`).toBe(false);
      }
    }
  });

  it("handles the empty field without throwing", () => {
    const { positions, bounds } = computeAtlasLayout([]);
    expect(positions.size).toBe(0);
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});
