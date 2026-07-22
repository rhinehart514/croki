import { describe, expect, it } from "vitest";
import type { CodingWorkspace, ThreadTimeline } from "@/api";
import { codingWorkspacesFromTimeline, defaultCodingWorkspace } from "./workspaceProjection";

const attempt = (id: string, updatedAt: string, status: CodingWorkspace["status"] = "running"): CodingWorkspace => ({
  id, kind: "native-code", ventureId: "venture-one", threadRef: "thread:one", betId: null,
  goal: id, repository: "/repo", sourceHead: "abc", branch: `drover/${id}`, worktree: `/worktrees/${id}`,
  runRefs: [], participantRefs: [], providerSessions: [], checkpoints: [], verification: [], changedFiles: [],
  diff: "", diffStat: "", patchHash: "", status, currentActivity: null,
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

  it("defaults to the attempt that needs founder judgment instead of a newer interruption", () => {
    const reviewable = attempt("reviewable", "2026-07-18T12:00:00.000Z", "reviewable");
    const interrupted = attempt("interrupted", "2026-07-19T12:00:00.000Z", "interrupted");

    expect(defaultCodingWorkspace([interrupted, reviewable])?.id).toBe("reviewable");
  });
});
