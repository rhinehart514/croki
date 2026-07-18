// ClusterGlyph — the collapsed-tail glyph node for the dense-map rank-and-reveal (SPEC C). At the STRUCTURE
// map read, the long tail of directions the ranker did not surface (rankAtlasNodes) is grouped by territory
// (clusterCollapse) and stood in for by ONE of these per group: "34 more Go-to-market directions",
// territory-tinted and greyscale-safe (a shape + count, never colour alone). Clicking or approaching it
// expands the group — the tail nodes are never removed from the array (Law 4), the glyph merely fronts them.
//
// This is a NEW NODE_TYPE the stage registers ("clusterGlyph") in a later single-owner phase; here it is the
// isolated presentational node. It carries its OWN data shape (ClusterGlyphNodeData) rather than the full
// AtlasNodeData, so a synthetic glyph node never has to fake a real card's fields. onExpand is the callback
// the stage wires to reveal the group.

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { Layers } from "lucide-react";
import "./cluster-glyph.css";

// The synthetic node data a cluster glyph carries. Deliberately separate from AtlasNodeData: a glyph is not
// a venture object, it is a fold over several.
export type ClusterGlyphNodeData = {
  clusterKey: string;
  label: string;
  count: number;
  territory: "product" | "gtm" | null;
  memberIds: string[];
  onExpand: (clusterKey: string) => void;
};

export type ClusterGlyphNode = Node<ClusterGlyphNodeData, "clusterGlyph">;

function ClusterGlyphView({ data, id }: NodeProps<ClusterGlyphNode>) {
  return (
    <button
      type="button"
      className="cluster-glyph"
      data-atlas-id={id}
      data-territory={data.territory ?? "unassigned"}
      aria-label={`${data.label} — expand`}
      onClick={(event) => {
        event.stopPropagation();
        data.onExpand(data.clusterKey);
      }}
    >
      {/* A stacked-layers mark (shape, not colour) reads as "folded group" in greyscale; the territory tint
          is a redundant second channel, never the only one. */}
      <span className="cluster-glyph-mark" aria-hidden="true">
        <Layers aria-hidden="true" />
        <span className="cluster-glyph-count">{data.count}</span>
      </span>
      <span className="cluster-glyph-label">{data.label}</span>
    </button>
  );
}

export const ClusterGlyph = memo(ClusterGlyphView);
