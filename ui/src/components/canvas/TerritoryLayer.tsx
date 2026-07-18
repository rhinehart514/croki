// The rendered geography of the venture canvas — territory is geography, not a layout seed (spec).
//
// Two large-type region kickers ("Product" / "Go-to-market") name the two HALF-PLANES: Product sits over
// the LEFT population, Go-to-market over the RIGHT, so the split reads as left/right geography the instant
// the map opens — not two headings stacked over clusters. Each kicker's horizontal anchor is the centre of
// its territory's own half-plane mass (recomputed from live member centres every render, so dragging a node
// moves the label with it); its vertical anchor is a SHARED band near the top of the whole field, so the two
// names sit level across the seam like the titles of two regions. The two anchors are always held apart
// across the seam (a minimum left/right separation), so even a weakly-populated field never lets the labels
// converge to the centre. They render only at the STRUCTURE altitude (the map read), matching Law 4's
// semantic zoom. Every causal edge crossing the seam between territories carries a greyscale-safe tick glyph
// at its midpoint — a shape, never a colour, so a monochrome screenshot still shows the crossing (Exp Law 11:
// provenance never by colour alone).
//
// Rendered inside React Flow's ViewportPortal so both kickers and ticks live in flow coordinates and
// track pan/zoom for free. Positions are read from the same live nodes the canvas renders; nothing here
// derives membership from position — that comes from `nodeTerritory` (the facet mirror).

import { useMemo } from "react";
import { ViewportPortal, useStore, type Edge, type Node } from "@xyflow/react";
import { resolveTerritories, TERRITORY_LABEL, TERRITORY_SIDE, type Territory } from "./canvasTerritory";

// STRUCTURE band ceiling — the region kickers belong to the far map read and fade out as the founder
// zooms into relationships/components (matches the atlas' own venture-altitude structure read).
const STRUCTURE_MAX_ZOOM = 0.78;

// Where an EMPTY territory's kicker sits before it has any members — offset to its side of the seam,
// above the hub — so the empty state names its geography even with nothing placed yet (spec empty
// state: the two territory kickers as named empty geography).
const EMPTY_ANCHOR_X = 360;
const EMPTY_ANCHOR_Y = -160;

// The minimum distance each kicker is held from the seam (x = 0), on its own side. Even a field whose two
// populations settled close together never lets the two names slide toward the centre and read as one
// heading — Product stays clearly left, Go-to-market clearly right, so the split is felt in the labels
// themselves. Sized to sit outside the layout's seam gutter under the region mass.
const KICKER_MIN_OFFSET = 300;

type NodeBox = { id: string; x: number; y: number; width: number; height: number };

function nodeBox(node: Node): NodeBox {
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: typeof node.width === "number" ? node.width : 204,
    height: typeof node.height === "number" ? node.height : 210,
  };
}

// The horizontal centre of a population's mass — the mean of its member centres. Recomputed from live boxes,
// so dragging a member moves the kicker. Returns null for an empty population (which takes the side anchor).
function populationCentreX(boxes: NodeBox[]): number | null {
  if (!boxes.length) return null;
  return boxes.reduce((sum, box) => sum + box.x + box.width / 2, 0) / boxes.length;
}

// Midpoints of every edge whose two endpoints sit in different territories — the seam crossings.
function seamCrossings(
  edges: Edge[],
  territoryById: Map<string, Territory | null>,
  centreById: Map<string, { x: number; y: number }>,
): Array<{ id: string; x: number; y: number }> {
  const crossings: Array<{ id: string; x: number; y: number }> = [];
  for (const edge of edges) {
    const from = territoryById.get(edge.source);
    const to = territoryById.get(edge.target);
    if (!from || !to || from === to) continue;
    const a = centreById.get(edge.source);
    const b = centreById.get(edge.target);
    if (!a || !b) continue;
    crossings.push({ id: edge.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return crossings;
}

export function TerritoryLayer({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const zoom = useStore((state) => state.transform[2]);
  const atStructure = zoom <= STRUCTURE_MAX_ZOOM;

  const { kickers, crossings, seam } = useMemo(() => {
    const boxes = nodes.map(nodeBox);
    // Territory inherits through the ownership chain (record → bet → campaign/motion), so bet/work/outcome
    // cards populate the two territories instead of piling on the seam under empty kickers.
    const territoryById = resolveTerritories(nodes);
    const centreById = new Map(boxes.map((box) => [box.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 }]));

    // The seam spine — a quiet vertical divider down x = 0 spanning the field's vertical extent, so the
    // left/right split has a visible channel between the two populations. Rendered at the structure band
    // only, like the kickers. Falls back to a band around the hub when the field is empty.
    const fieldMinY = boxes.length ? Math.min(...boxes.map((box) => box.y)) : EMPTY_ANCHOR_Y;
    const fieldMaxY = boxes.length ? Math.max(...boxes.map((box) => box.y + box.height)) : -EMPTY_ANCHOR_Y;
    const seam = { top: fieldMinY - 72, height: fieldMaxY - fieldMinY + 144 };

    // Both territories are always named, positioned LEFT (Product) and RIGHT (Go-to-market) over their own
    // half-plane mass. Horizontal anchor: the population's centre, but always held to its own side of the
    // seam by at least KICKER_MIN_OFFSET so the two names never converge to the centre and read as one
    // heading. Vertical anchor: a SHARED band above the top of the whole field, so the two names sit level
    // across the seam like the titles of two regions. An empty territory takes its fixed side anchor.
    const fieldTop = boxes.length ? Math.min(...boxes.map((box) => box.y)) : EMPTY_ANCHOR_Y;
    // The shared band the two names sit on — a hair above the top of the field so they title the regions
    // without overlapping the topmost cards. The render offsets by translate(-50%,-100%), so this is the
    // baseline the label rises from.
    const labelY = fieldTop;
    const kickers = (["product", "gtm"] as Territory[]).map((territory) => {
      const side = TERRITORY_SIDE[territory];
      const members = boxes.filter((box) => territoryById.get(box.id) === territory);
      const centreX = populationCentreX(members);
      // Held to this territory's side: at least KICKER_MIN_OFFSET from the seam, on `side`. An empty
      // territory falls back to its fixed side anchor.
      const anchorX = centreX === null
        ? side * EMPTY_ANCHOR_X
        : side > 0
          ? Math.max(centreX, KICKER_MIN_OFFSET)
          : Math.min(centreX, -KICKER_MIN_OFFSET);
      return { territory, anchor: { x: anchorX, y: labelY } };
    });

    return { kickers, crossings: seamCrossings(edges, territoryById, centreById), seam };
  }, [nodes, edges]);

  return (
    <ViewportPortal>
      <div
        className="canvas-territory-seam"
        data-visible={atStructure ? "true" : "false"}
        aria-hidden="true"
        style={{
          position: "absolute",
          // Centred on x = 0; spans the field's vertical extent.
          transform: `translate(-50%, 0) translate(0px, ${seam.top}px)`,
          height: `${seam.height}px`,
        }}
      />
      {kickers.map(({ territory, anchor }) => (
        <div
          key={territory}
          className="canvas-territory-kicker"
          data-territory={territory}
          data-visible={atStructure ? "true" : "false"}
          aria-hidden={atStructure ? undefined : true}
          style={{
            position: "absolute",
            // Anchor over the population's half-plane; the label sits above its geography, level with its
            // opposite across the seam.
            transform: `translate(-50%, -100%) translate(${anchor.x}px, ${anchor.y - 44}px)`,
          }}
        >
          {TERRITORY_LABEL[territory]}
        </div>
      ))}
      {crossings.map((crossing) => (
        <span
          key={crossing.id}
          className="canvas-seam-tick"
          aria-hidden="true"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${crossing.x}px, ${crossing.y}px)`,
          }}
        />
      ))}
    </ViewportPortal>
  );
}
