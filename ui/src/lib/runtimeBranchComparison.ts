import type { OperatorComparisonGroup, OperatorSession } from "@/types";
import type { CreateWorkArtifactInput, WorkArtifactRevision } from "@/openCanvasTypes";

export type RuntimeBranchComparisonModel = {
  branchGroupId: string;
  parentSessionId: string;
  branches: OperatorSession[];
  selectedSessionId: string | null;
  keptBoth: boolean;
};

export function comparisonsFromDurableGroups(
  groups: OperatorComparisonGroup[],
  humanize: (session: OperatorSession) => OperatorSession = (session) => session,
): Record<string, RuntimeBranchComparisonModel> {
  return Object.fromEntries(groups.flatMap((group) => {
    if (!group.branchGroupId || !group.parentSessionId || group.branches.length === 0) return [];
    return [[group.branchGroupId, {
      branchGroupId: group.branchGroupId,
      parentSessionId: group.parentSessionId,
      branches: group.branches.map(humanize),
      selectedSessionId: null,
      keptBoth: false,
    } satisfies RuntimeBranchComparisonModel]];
  }));
}

export function comparisonArtifactId(branchGroupId: string): string {
  return `runtime-comparison-${branchGroupId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "branches"}`;
}

export function comparisonArtifactFor(model: RuntimeBranchComparisonModel, expectedStoreRevision: number, founderId: string): CreateWorkArtifactInput {
  const branches = model.branches.map((session) => ({
    sessionId: session.id,
    runtime: session.worker?.runtime ?? (String(session.model || "").startsWith("gpt-") ? "codex" : "claude"),
    model: session.worker?.model ?? session.model ?? null,
    status: session.status,
    readout: session.summary?.trim() || [...(session.events ?? [])].reverse().find((event) => event.detail?.trim() || event.title?.trim())?.detail?.trim() || "No response has landed yet.",
  }));
  return {
    id: comparisonArtifactId(model.branchGroupId),
    kind: "runtime-comparison",
    title: "Claude and Codex comparison",
    summary: "Two attributable branch readouts preserved without choosing or merging them.",
    format: "structured",
    contentType: "application/json",
    status: "draft",
    content: {
      type: "runtime-branch-comparison",
      branchGroupId: model.branchGroupId,
      parentSessionId: model.parentSessionId,
      branches,
      disagreementPreserved: true,
      synthesis: null,
      winner: null,
      authorityGranted: false,
    },
    provenance: "Founder materialized two durable runtime branches as separate open work.",
    createdBy: { type: "founder", id: founderId },
    modelReceipts: [],
    toolReceipts: [{ tool: "runtime-branch-comparison", branchSessionIds: branches.map((branch) => branch.sessionId) }],
    expectedStoreRevision,
    idempotencyKey: `ui:runtime-comparison:${model.branchGroupId}`,
  };
}

export function artifactMatchesComparison(artifact: WorkArtifactRevision, branchGroupId: string): boolean {
  const content = artifact.content && typeof artifact.content === "object" && !Array.isArray(artifact.content) ? artifact.content : null;
  return artifact.kind === "runtime-comparison" && content?.branchGroupId === branchGroupId;
}
