import { useCallback, useEffect, useMemo, useState } from "react";
import type { Node } from "@xyflow/react";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import { epistemicStateForNode, indexContext } from "@/components/atlas/epistemicScene";
import type { SemanticBand } from "@/components/atlas/semanticBand";
import { clusterCollapse, MIN_TAIL_TO_COLLAPSE } from "./clusterCollapse";
import { rankAtlasNodes } from "./rankAtlasNodes";

export function useCanvasDenseNodes({
  nodes,
  projection,
  lens,
  band,
  readOnly,
  selectedNodeId,
  overlayActive,
}: {
  nodes: AtlasNode[];
  projection: FirmArchitectureProjection | null;
  lens: FirmLens | null;
  band: SemanticBand;
  readOnly: boolean;
  selectedNodeId: string | null;
  overlayActive: boolean;
}) {
  const [revealedClusters, setRevealedClusters] = useState<Set<string>>(() => new Set());
  const [rankNow, setRankNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setRankNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const expandCluster = useCallback((clusterKey: string) => {
    setRevealedClusters((current) => new Set(current).add(clusterKey));
  }, []);
  const epistemicIndex = useMemo(() => (projection ? indexContext(projection) : null), [projection]);
  const decoratedBase = useMemo<AtlasNode[]>(() => nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
    draggable: overlayActive ? false : node.draggable,
    data: { ...node.data, readOnly, epistemic: epistemicStateForNode(node, projection, epistemicIndex) },
  })), [nodes, readOnly, selectedNodeId, projection, epistemicIndex, overlayActive]);

  const { decorated, glyphs } = useMemo(() => {
    if (band !== "structure" || overlayActive || lens === null) return { decorated: decoratedBase, glyphs: [] as AtlasNode[] };
    const ranked = rankAtlasNodes({ nodes: decoratedBase, placementPositions: lens.placement.positions, band, now: rankNow });
    const tailCount = ranked.reduce((count, entry) => (entry.surfaced ? count : count + 1), 0);
    if (tailCount < MIN_TAIL_TO_COLLAPSE) return { decorated: decoratedBase, glyphs: [] as AtlasNode[] };
    const collapsed = clusterCollapse({ nodes: decoratedBase, ranked });
    const revealed = new Set(revealedClusters);
    const visible = collapsed.nodes.map((node) => {
      const clusterId = typeof node.data.clusterId === "string" ? node.data.clusterId : null;
      const clusterKey = clusterId?.replace(/^cluster:/, "") ?? null;
      return node.hidden && clusterKey && revealed.has(clusterKey) ? { ...node, hidden: false } : node;
    });
    const glyphNodes = collapsed.glyphs.filter((glyph) => !revealed.has(glyph.clusterKey)).map((glyph) => {
      const members = decoratedBase.filter((node) => glyph.memberIds.includes(node.id));
      const cx = members.length ? members.reduce((sum, node) => sum + node.position.x, 0) / members.length : 0;
      const cy = members.length ? members.reduce((sum, node) => sum + node.position.y, 0) / members.length : 0;
      return {
        id: glyph.id,
        type: "clusterGlyph",
        position: { x: cx, y: cy },
        draggable: false,
        selectable: false,
        data: {
          kind: "group", title: glyph.label, clusterKey: glyph.clusterKey, label: glyph.label,
          count: glyph.count, territory: glyph.territory, memberIds: glyph.memberIds, onExpand: expandCluster,
        },
      } as unknown as AtlasNode;
    });
    return { decorated: visible, glyphs: glyphNodes };
  }, [band, overlayActive, lens, decoratedBase, revealedClusters, expandCluster, rankNow]);

  const flowNodes = useMemo(() => [...decorated, ...glyphs] as unknown as Node[], [decorated, glyphs]);
  return { decorated, flowNodes };
}
