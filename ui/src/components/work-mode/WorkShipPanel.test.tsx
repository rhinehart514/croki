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
    expect(await screen.findByText(/main gained 3 commits while this work ran/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("feature/add-drift")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Add drift")).toHaveLength(2);
    expect(screen.getByDisplayValue(/## Summary/)).toBeInTheDocument();
  });

  it("says honestly when gh cannot open the pull request", async () => {
    getShip.mockResolvedValue({
      workspace: {}, readiness: null,
      ship: shipInfo({ gh: { available: true, authenticated: false, reason: "The GitHub CLI is installed but not signed in. Run `gh auth login` to enable the pull request step." } }),
    });
    render(<WorkShipPanel ventureId="v1" workspaceId="code-one" disabled={false} onChanged={vi.fn()} />);
    expect(await screen.findByText(/not signed in.*The branch will still be pushed/)).toBeInTheDocument();
  });

  it("previews with a dry run that never needs confirmation and shows the exact plan", async () => {
    const dryAttempt = attempt({
      outcome: "dry-run", dryRun: true, pushed: false, prUrl: null, commitSha: null,
      phases: [
        { phase: "branch", status: "ready", detail: "Would create feature/add-drift from abc12345", at: "t" },
        { phase: "commit", status: "ready", detail: "The exact reviewed patch applies cleanly", at: "t" },
        { phase: "push", status: "skipped", detail: "Would run: git push -u origin feature/add-drift", at: "t" },
        { phase: "pr", status: "skipped", detail: "Would run: gh pr create --head feature/add-drift", at: "t" },
      ],
    });
    ship.mockResolvedValue({ workspace: {}, readiness: null, ship: shipInfo({ attempt: dryAttempt, receipts: [dryAttempt] }) });
    render(<WorkShipPanel ventureId="v1" workspaceId="code-one" disabled={false} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview without shipping" }));
    await waitFor(() => expect(ship).toHaveBeenCalledWith("v1", "code-one", expect.objectContaining({ dryRun: true, branch: "feature/add-drift" })));
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
    await waitFor(() => expect(ship).toHaveBeenCalledWith("v1", "code-one", expect.objectContaining({ dryRun: false })));
    expect(await screen.findByRole("link", { name: "https://github.com/example/repo/pull/7" })).toBeInTheDocument();
    expect(changed).toHaveBeenCalled();
  });

  it("shows a failed step honestly and leaves the founder able to try again", async () => {
    const failed = attempt({
      outcome: "failed", error: "Push failed: no route to host.", failedPhase: "push", pushed: false, prUrl: null,
      phases: [
        { phase: "branch", status: "done", detail: null, at: "t" },
        { phase: "commit", status: "done", detail: null, at: "t" },
        { phase: "push", status: "failed", detail: "Push failed: no route to host.", at: "t" },
        { phase: "pr", status: "pending", detail: null, at: null },
      ],
    });
    ship.mockRejectedValue(new Error("Push failed: no route to host."));
    render(<WorkShipPanel ventureId="v1" workspaceId="code-one" disabled={false} onChanged={vi.fn()} />);
    getShip.mockResolvedValue({ workspace: {}, readiness: null, ship: shipInfo({ attempt: failed, receipts: [failed] }) });
    fireEvent.click(await screen.findByRole("button", { name: "Ship" }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirm: push/ }));
    expect(await screen.findByText(/Nothing partial was kept — fix the cause and ship again/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ship" })).toBeEnabled();
  });
});
