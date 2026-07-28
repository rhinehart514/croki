import type { ShipDrift } from "./work";

export type ShipDrafts = {
  branch: string;
  commitSubject: string;
  commitBody: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
};

export type ShipPhase = {
  phase: "fetch" | "branch" | "commit" | "push" | "pr";
  status: "pending" | "running" | "ready" | "done" | "skipped" | "failed";
  detail: string | null;
  at: string | null;
};

export type ShipPlan = {
  fingerprint: string;
  branch: string | null;
  commitMessage: string | null;
  remote: string | null;
  pullRequest: { base: string | null; head: string | null; title: string | null };
  phases: Array<"fetch" | "branch" | "commit" | "push" | "pr">;
};

export type ShipAttempt = {
  id: string;
  dryRun: boolean;
  startedAt: string;
  completedAt: string | null;
  outcome: "running" | "completed" | "dry-run" | "failed";
  error: string | null;
  failedPhase: string | null;
  branch: string;
  baseBranch: string | null;
  commitSha: string | null;
  pushed: boolean;
  prUrl: string | null;
  prNote: string | null;
  planFingerprint?: string;
  reviewedPlan?: ShipPlan;
  content: { commitMessage: string; prTitle: string; prBody: string };
  phases: ShipPhase[];
};

export type ShipRepositoryState = {
  baseBranch: string | null;
  baseRef: string | null;
  baseCommit: string | null;
  currentBranch: string | null;
  currentCommit: string | null;
  upstreamRef: string | null;
  ahead: number;
  behind: number;
  dirty: boolean;
  dirtyCount: number;
  dirtyTruncated: boolean;
  dirtyEntries: Array<{ status: string; path: string }>;
  commitCount: number;
  commitsTruncated: boolean;
  commits: Array<{ sha: string; shortSha: string; author: string; at: string; subject: string }>;
  remote: {
    name: string;
    url: string | null;
    preparedBranchRef: string | null;
    preparedBranchCommit: string | null;
  };
  verification: Array<{ command: string; status: string; exitCode: number | null }>;
  github: {
    found: boolean;
    reason: string | null;
    pullRequest: null | {
      url: string | null;
      number: number | null;
      state: string;
      draft: boolean;
      mergeable: string;
      reviewDecision: string | null;
      reviewRequests: string[];
      checks: Array<{ name: string; status: string; conclusion: string | null; url: string | null }>;
      headBranch: string;
      baseBranch: string | null;
    };
  };
  plan: ShipPlan;
};

export type ShipInfo = {
  drafts: ShipDrafts;
  drift: ShipDrift | null;
  baseBranch: string | null;
  gh: { available: boolean; authenticated: boolean; reason: string | null };
  repository: ShipRepositoryState;
  plan: ShipPlan;
  attempt: ShipAttempt | null;
  receipts: ShipAttempt[];
};

export type ShipRequest = {
  dryRun?: boolean;
  branch?: string;
  commitMessage?: string;
  prTitle?: string;
  prBody?: string;
  planFingerprint?: string;
};
