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

const founderReturnPriority: Record<CodingWorkspace["status"], number> = {
  reviewable: 0,
  "failed-verification": 1,
  "needs-verification": 2,
  interrupted: 3,
  running: 4,
  preparing: 5,
  "no-change": 6,
  applied: 7,
  committed: 8,
  cancelled: 9,
  discarded: 10,
};

export function defaultCodingWorkspace(workspaces: CodingWorkspace[]): CodingWorkspace | null {
  return workspaces.reduce<CodingWorkspace | null>((best, workspace) => {
    if (!best) return workspace;
    const priority = founderReturnPriority[workspace.status] - founderReturnPriority[best.status];
    if (priority < 0) return workspace;
    if (priority > 0) return best;
    return timestamp(workspace.updatedAt) > timestamp(best.updatedAt) ? workspace : best;
  }, null);
}
