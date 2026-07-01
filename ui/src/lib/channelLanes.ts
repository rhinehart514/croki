import type { ChannelMeta, GTMGraph } from "@/types";

// The unified pipeline canvas stacks every pipeline's full graph into ONE coordinate space as
// horizontal lanes — each pipeline keeps its own left-to-right internal flow (unchanged), lanes are
// stacked top to bottom with a gap so no two pipelines' cards can ever overlap. Pure and React-free
// so the stacking math is testable on its own.
const LANE_NODE_HEIGHT = 160; // a work-node card's rough footprint, incl. breathing room
// The gutter BETWEEN two pipelines must read as bigger than the gap WITHIN a pipeline, or the eye
// can't group cards by pipeline (Gestalt proximity): with every lane stacked in one coordinate space,
// the same agent ("Outreach Writer") recurs across pipelines, and if lanes sit closer than a
// pipeline's own branch rows those repeats read as one undifferentiated field of ~40 duplicate cards.
// GraphCanvas lays each pipeline out at ROW_GAP = 212 between same-rank branch rows, so this gutter is
// held clearly ABOVE that — each pipeline resolves into its own band with real air around it, and the
// camera pan-to-lane (LanePanner, zoom 0.7) then pushes the neighbours out to the periphery so the
// focused pipeline is unmistakably primary and the rest recede as quiet context you pan to.
const LANE_GAP = 320;

// offsetY/height locate the lane's vertical band (for stacking); centerX/centerY are the point a
// camera pan should frame — "open this pipeline" pans there without touching node selection (which
// would pop the node detail modal open).
export type ChannelLane = { offsetY: number; height: number; centerX: number; centerY: number };

// For each channel (in the given order — the same order ChannelSwitcher/the channel list uses),
// compute how far to shift its nodes' y so lanes stack without collision, and how tall its own lane
// is. Channels with no loaded graph, or an empty one, reserve no lane (nothing to draw yet).
export function computeChannelLanes(
  channels: ChannelMeta[],
  channelGraphs: Map<string, GTMGraph>,
): Map<string, ChannelLane> {
  const lanes = new Map<string, ChannelLane>();
  let cursor = 0;
  for (const channel of channels) {
    const g = channelGraphs.get(channel.id);
    if (!g || !g.nodes.length) continue;
    const xs = g.nodes.map((n) => n.position?.x ?? 0);
    const ys = g.nodes.map((n) => n.position?.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const height = (maxY - minY) + LANE_NODE_HEIGHT;
    const offsetY = cursor - minY;
    lanes.set(channel.id, { offsetY, height, centerX: (minX + maxX) / 2, centerY: cursor + height / 2 });
    cursor += height + LANE_GAP;
  }
  return lanes;
}
