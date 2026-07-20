import type { CodingWorkspace, ThreadTimeline } from "@/api";

const timestamp = (value: string | null | undefined) => {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
};

export function codingWorkspacesFromTimeline(timeline: ThreadTimeline | null): CodingWorkspace[] {
  if (!timeline) return [];
  return timeline.items
    .flatMap((item) => {
      const artifact = item.artifact as Partial<CodingWorkspace> | undefined;
      return artifact?.kind === "native-code" && artifact.id ? [artifact as CodingWorkspace] : [];
    })
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt)
      || timestamp(right.createdAt) - timestamp(left.createdAt));
}

