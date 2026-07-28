import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShipAttempt, ShipInfo } from "@/api";
import { WorkShipPanel } from "./WorkShipPanel";

const getShip = vi.fn();
const prepareShip = vi.fn();
const ship = vi.fn();
vi.mock("@/api", async (original) => ({
  ...await original<typeof import("@/api")>(),
  getCodingWorkspaceShip: (...args: unknown[]) => getShip(...args),
  prepareCodingWorkspaceShip: (...args: unknown[]) => prepareShip(...args),
  shipCodingWorkspace: (...args: unknown[]) => ship(...args),
}));

const attempt = (overrides: Partial<ShipAttempt> = {}): ShipAttempt => ({
  id: "ship-1", dryRun: false, startedAt: "2026-07-23T00:00:00Z", completedAt: "2026-07-23T00:00:05Z",
  outcome: "completed", error: null, failedPhase: null,
  branch: "feature/add-drift", baseBranch: "main", commitSha: "abc12345", pushed: true,
  prUrl: "https://github.com/example/repo/pull/7", prNote: null,
  content: { commitMessage: "Add drift", prTitle: "Add drift", prBody: "## Summary" },
  phases: [
    { phase: "fetch", status: "done", detail: "Refreshed origin", at: "t" },
    { phase: "branch", status: "done", detail: "Will create feature/add-drift from abc12345", at: "t" },
    { phase: "commit", status: "done", detail: "Committed abc12345 on feature/add-drift", at: "t" },
    { phase: "push", status: "done", detail: "Pushed feature/add-drift to origin", at: "t" },
    { phase: "pr", status: "done", detail: "https://github.com/example/repo/pull/7", at: "t" },
  ],
  ...overrides,
});

const shipInfo = (overrides: Partial<ShipInfo> = {}): ShipInfo => ({
  drafts: { branch: "feature/add-drift", commitSubject: "Add drift", commitBody: "", commitMessage: "Add drift", prTitle: "Add drift", prBody: "## Summary\n- Add drift" },
  drift: { branch: "drover/code-one", baseRef: "origin/main", hasUpstream: false, upstreamRef: null, upstreamAheadCount: 0, upstreamBehindCount: 0, aheadOfDefaultCount: 0, behindDefaultCount: 3 },
  baseBranch: "main",
  gh: { available: true, authenticated: true, reason: null },
  plan: {
    fingerprint: "a".repeat(64),
    branch: "feature/add-drift",
    commitMessage: "Add drift",
    remote: "git@github.com:example/repo.git",
    pullRequest: { base: "main", head: "feature/add-drift", title: "Add drift" },
    phases: ["fetch", "branch", "commit", "push", "pr"],
  },
  repository: {
    baseBranch: "main", baseRef: "origin/main", baseCommit: "base1234",
    currentBranch: "drover/code-one", currentCommit: "head1234", upstreamRef: null,
    ahead: 0, behind: 3, dirty: true, dirtyCount: 1,
    dirtyEntries: [{ status: "M", path: "src/app.ts" }], dirtyTruncated: false,
    commitCount: 1, commitsTruncated: false,
    commits: [{ sha: "abc12345", shortSha: "abc12345", author: "Founder", at: "now", subject: "Reviewed base" }],
    remote: { name: "origin", url: "git@github.com:example/repo.git", preparedBranchRef: "refs/remotes/origin/feature/add-drift", preparedBranchCommit: null },
    verification: [{ command: "npm test", status: "passed", exitCode: 0 }],
    github: {
      found: true, reason: null,
      pullRequest: {
        url: "https://github.com/example/repo/pull/7", number: 7, state: "open", draft: false,
        mergeable: "mergeable", reviewDecision: "review_required", reviewRequests: ["octocat"],
        checks: [{ name: "test", status: "completed", conclusion: "success", url: "https://checks/7" }],
        headBranch: "feature/add-drift", baseBranch: "main",
      },
    },
    plan: {
      fingerprint: "a".repeat(64), branch: "feature/add-drift", commitMessage: "Add drift",
      remote: "git@github.com:example/repo.git",
      pullRequest: { base: "main", head: "feature/add-drift", title: "Add drift" },
      phases: ["fetch", "branch", "commit", "push", "pr"],
    },
  },
  attempt: null,
  receipts: [],
  ...overrides,
});

beforeEach(() => {
  getShip.mockReset();
  prepareShip.mockReset();
  ship.mockReset();
  getShip.mockResolvedValue({ workspace: {}, readiness: null, ship: shipInfo() });
  prepareShip.mockResolvedValue({ workspace: {}, readiness: null, ship: shipInfo() });
});

describe("ship panel", () => {
  it("states drift plainly and seeds the exact prepared branch, commit, and PR content", async () => {
    render(<WorkShipPanel ventureId="v1" workspaceId="code-one" disabled={false} onChanged={vi.fn()} />);
    expect(await screen.findByText(/last fetched main reference gained 3 commits while this work ran/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("feature/add-drift")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Add drift")).toHaveLength(2);
    expect(screen.getByDisplayValue(/## Summary/)).toBeInTheDocument();
    expect(screen.getByLabelText("Exact source-control review")).toHaveTextContent("origin/main");
    expect(screen.getByLabelText("Exact source-control review")).toHaveTextContent("3 behind");
    expect(screen.getByLabelText("Exact source-control review")).toHaveTextContent("test");
    expect(screen.getByLabelText("Exact source-control review")).toHaveTextContent("mergeable");
  });

  it("says honestly when gh cannot open the pull request", async () => {
    getShip.mockResolvedValue({
      workspace: {}, readiness: null,
      ship: shipInfo({ gh: { available: true, authenticated: false, reason: "The GitHub CLI is installed but not signed in. Run `gh auth login` to enable the pull request step." } }),
    });
    render(<WorkShipPanel ventureId="v1" workspaceId="code-one" disabled={false} onChanged={vi.fn()} />);
    expect(await screen.findByText(/not signed in.*The branch will still be pushed/)).toBeInTheDocument();
  });

  it("blocks confirmation language when the prepared branch already exists remotely", async () => {
    getShip.mockResolvedValue({
      workspace: {}, readiness: null,
      ship: shipInfo({
        repository: {
          ...shipInfo().repository,
          remote: {
            ...shipInfo().repository.remote,
            preparedBranchCommit: "remote123456789",
          },
        },
      }),
    });
    render(<WorkShipPanel ventureId="v1" workspaceId="code-one" disabled={false} onChanged={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("already points to remote12");
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh or choose another branch");
  });

  it("previews with a dry run that never needs confirmation and shows the exact plan", async () => {
    const dryAttempt = attempt({
      outcome: "dry-run", dryRun: true, pushed: false, prUrl: null, commitSha: null,
      phases: [
        { phase: "fetch", status: "ready", detail: "Would refresh origin", at: "t" },
        { phase: "branch", status: "ready", detail: "Would create feature/add-drift from abc12345", at: "t" },
        { phase: "commit", status: "ready", detail: "The exact reviewed patch applies cleanly", at: "t" },
        { phase: "push", status: "skipped", detail: "Would run: git push -u origin feature/add-drift", at: "t" },
        { phase: "pr", status: "skipped", detail: "Would run: gh pr create --head feature/add-drift", at: "t" },
      ],
    });
    ship.mockResolvedValue({ workspace: {}, readiness: null, ship: shipInfo({ attempt: dryAttempt, receipts: [dryAttempt] }) });
    render(<WorkShipPanel ventureId="v1" workspaceId="code-one" disabled={false} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview without shipping" }));
    await waitFor(() => expect(ship).toHaveBeenCalledWith("v1", "code-one", expect.objectContaining({
      dryRun: true, branch: "feature/add-drift", planFingerprint: "a".repeat(64),
    })));
    expect(await screen.findByText(/Would run: git push -u origin feature\/add-drift/)).toBeInTheDocument();
    expect(screen.getByText("This was a preview. Nothing left your machine.")).toBeInTheDocument();
  });

  it("ships only after a distinct confirmation and reports the pull request", async () => {
    const done = attempt();
    ship.mockResolvedValue({ workspace: {}, readiness: null, ship: shipInfo({ attempt: done, receipts: [done] }) });
    const changed = vi.fn();
    render(<WorkShipPanel ventureId="v1" workspaceId="code-one" disabled={false} onChanged={changed} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ship" }));
    expect(ship).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /Confirm: push feature\/add-drift and open the pull request/ }));
    await waitFor(() => expect(ship).toHaveBeenCalledWith("v1", "code-one", expect.objectContaining({
      dryRun: false, planFingerprint: "a".repeat(64),
    })));
    expect(await screen.findByRole("link", { name: "https://github.com/example/repo/pull/7" })).toBeInTheDocument();
    expect(changed).toHaveBeenCalled();
  });

  it("shows a failed step honestly and leaves the founder able to try again", async () => {
    const failed = attempt({
      outcome: "failed", error: "Push failed: no route to host.", failedPhase: "push", pushed: false, prUrl: null,
      phases: [
        { phase: "fetch", status: "done", detail: null, at: "t" },
        { phase: "branch", status: "done", detail: null, at: "t" },
        { phase: "commit", status: "done", detail: null, at: "t" },
        { phase: "push", status: "failed", detail: "Push failed: no route to host.", at: "t" },
        { phase: "pr", status: "pending", detail: null, at: null },
      ],
    });
    ship.mockRejectedValue(new Error("Push failed: no route to host."));
    getShip.mockResolvedValue({ workspace: {}, readiness: null, ship: shipInfo({ attempt: failed, receipts: [failed] }) });
    prepareShip.mockResolvedValue({ workspace: {}, readiness: null, ship: shipInfo({ attempt: failed, receipts: [failed] }) });
    render(<WorkShipPanel ventureId="v1" workspaceId="code-one" disabled={false} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry push only" }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirm: retry push/ }));
    expect(await screen.findByText(/exact commit abc12345 remains.*Retry only the push/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry push only" })).toBeEnabled();
  });

  it("refreshes a stale plan after execution is blocked", async () => {
    ship.mockRejectedValue(new Error("Repository state changed after this ship plan was reviewed."));
    getShip
      .mockResolvedValueOnce({ workspace: {}, readiness: null, ship: shipInfo() })
      .mockResolvedValue({ workspace: {}, readiness: null, ship: shipInfo({
        plan: { ...shipInfo().plan, fingerprint: "b".repeat(64) },
        repository: {
          ...shipInfo().repository,
          behind: 4,
          plan: { ...shipInfo().repository.plan, fingerprint: "b".repeat(64) },
        },
      }) });
    render(<WorkShipPanel ventureId="v1" workspaceId="code-one" disabled={false} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ship" }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirm: push/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("state changed");
    await waitFor(() => expect(screen.getByLabelText("Exact source-control review")).toHaveTextContent("bbbbbbbbbbbb"));
  });
});
