// The rendered geography of the venture canvas — territory is geography, not a layout seed (spec).
//
// Two large-type region kickers ("Product" / "Go-to-market") are pinned at each territory population's
// centroid-top, RECOMPUTED from the live member centroids every render so they survive any founder
// dragging (a dragged node moves its territory's centroid, and the kicker follows). They render only at
// the STRUCTURE altitude (the map read), matching Law 4's semantic zoom. Every causal edge crossing the
// seam between territories carries a greyscale-safe tick glyph at its midpoint — a shape, never a colour,
// so a monochrome screenshot still shows the crossing (Exp Law 11: provenance never by colour alone).
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
const EMPTY_ANCHOR_X = 300;
const EMPTY_ANCHOR_Y = -160;

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

// The centroid-top anchor for a population: horizontal centroid of member centres, vertical top of the
// highest member. Recomputed from live boxes, so dragging a member moves the kicker.
function centroidTop(boxes: NodeBox[]): { x: number; y: number } | null {
  if (!boxes.length) return null;
  const cx = boxes.reduce((sum, box) => sum + box.x + box.width / 2, 0) / boxes.length;
  const top = Math.min(...boxes.map((box) => box.y));
  return { x: cx, y: top };
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

  const { kickers, crossings } = useMemo(() => {
    const boxes = nodes.map(nodeBox);
    // Territory inherits through the ownership chain (record → bet → campaign/motion), so bet/work/outcome
    // cards populate the two territories instead of piling on the seam under empty kickers.
    const territoryById = resolveTerritories(nodes);
    const centreById = new Map(boxes.map((box) => [box.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 }]));

    // Both territories are always named. A populated territory anchors at its members' centroid-top and
    // follows them under dragging; an empty one takes a fixed side anchor so the empty state still shows
    // named geography, never a blank half-plane.
    const kickers = (["product", "gtm"] as Territory[]).map((territory) => {
      const members = boxes.filter((box) => territoryById.get(box.id) === territory);
      const anchor = centroidTop(members)
        ?? { x: TERRITORY_SIDE[territory] * EMPTY_ANCHOR_X, y: EMPTY_ANCHOR_Y };
      return { territory, anchor };
    });

    return { kickers, crossings: seamCrossings(edges, territoryById, centreById) };
  }, [nodes, edges]);

  return (
    <ViewportPortal>
      {kickers.map(({ territory, anchor }) => (
        <div
          key={territory}
          className="canvas-territory-kicker"
          data-territory={territory}
          data-visible={atStructure ? "true" : "false"}
          aria-hidden={atStructure ? undefined : true}
          style={{
            position: "absolute",
            // Anchor at the population's centroid-top; the label sits above its geography.
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
