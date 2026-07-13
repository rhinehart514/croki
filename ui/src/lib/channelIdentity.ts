import type { ChannelMeta } from "@/types";

// Operator sessions address the executable graph; founder navigation addresses the owning pipeline.
// Most older pipelines use the same id for both, while project-scoped composed graphs deliberately do
// not. Resolve either form to the founder-facing channel id at this one boundary.
export function channelIdForGraph(channels: ChannelMeta[], graphId: string | null | undefined): string | null {
  if (!graphId) return null;
  return channels.find((channel) => channel.graphId === graphId || channel.id === graphId)?.id ?? null;
}
