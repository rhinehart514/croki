import { describe, expect, it } from "vitest";
import type { CodingWorkspace, ThreadTimeline } from "@/api";
import { codingWorkspacesFromTimeline } from "./workspaceProjection";

const attempt = (id: string, updatedAt: string): CodingWorkspace => ({
  id, kind: "native-code", ventureId: "venture-one", threadRef: "thread:one", betId: null,
  goal: id, repository: "/repo", sourceHead: "abc", branch: `drover/${id}`, worktree: `/worktrees/${id}`,
  runRefs: [], participantRefs: [], providerSessions: [], checkpoints: [], verification: [], changedFiles: [],
  diff: "", diffStat: "", patchHash: "", status: "working", currentActivity: null,
  createdAt: updatedAt, updatedAt,
});

describe("coding workspace projection", () => {
  it("returns only native coding artifacts with the latest attempt first", () => {
    const older = attempt("older", "2026-07-18T12:00:00.000Z");
    const latest = attempt("latest", "2026-07-19T12:00:00.000Z");
    const timeline = { items: [
      { kind: "artifact", id: "older", ref: "work:older", at: older.updatedAt, artifact: older },
      { kind: "message", id: "message", ref: "message:one", at: null },
      { kind: "artifact", id: "latest", ref: "work:latest", at: latest.updatedAt, artifact: latest },
    ] } as ThreadTimeline;

    expect(codingWorkspacesFromTimeline(timeline).map((workspace) => workspace.id)).toEqual(["latest", "older"]);
  });
});

