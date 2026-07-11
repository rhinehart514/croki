import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasRegion, Goal, WorkArtifactRevision } from "@/openCanvasTypes";

const api = vi.hoisted(() => ({
  listGoals: vi.fn(), listGoalRelations: vi.fn(), listWorkArtifacts: vi.fn(), listWorkRelationships: vi.fn(),
  listCanvasRegions: vi.fn(), reviseCanvasRegion: vi.fn(), archiveCanvasRegion: vi.fn(), reopenCanvasRegion: vi.fn(),
  createGoal: vi.fn(), reviseGoal: vi.fn(), changeGoalStatus: vi.fn(), retireGoal: vi.fn(), restoreGoal: vi.fn(), createGoalRelation: vi.fn(),
  createWorkArtifact: vi.fn(), reviseWorkArtifact: vi.fn(), retireWorkArtifact: vi.fn(), restoreWorkArtifact: vi.fn(),
  createWorkRelationship: vi.fn(), getWorkArtifactHistory: vi.fn(),
  applyCanvasProposal: vi.fn(),
  getGoalRelation: vi.fn(), getGoalRelationHistory: vi.fn(), reviseGoalRelation: vi.fn(), retireGoalRelation: vi.fn(), restoreGoalRelation: vi.fn(),
  getWorkRelationship: vi.fn(), getWorkRelationshipHistory: vi.fn(), reviseWorkRelationship: vi.fn(), retireWorkRelationship: vi.fn(), restoreWorkRelationship: vi.fn(),
  listProductChanges: vi.fn(), discardProductChange: vi.fn(), stageProductChangeProposal: vi.fn(),
  reviewProductChange: vi.fn(), getProductChangeReadiness: vi.fn(), applyProductChange: vi.fn(),
}));

vi.mock("@/api", () => api);
vi.mock("@/lib/identity", () => ({ getIdentity: () => ({ userId: "founder", name: "Founder", email: null, teamId: null }) }));

import { OpenCanvasWorkbench } from "@/components/OpenCanvasWorkbench";

function artifact(over: Partial<WorkArtifactRevision> = {}): WorkArtifactRevision {
  return {
    id: "revision:w1:2", artifactId: "w1", projectId: "p1", lineageId: "lineage:w1", revision: 2,
    parentRefs: [], kind: "brief", title: "Launch brief", summary: "The current angle", format: "text",
    contentType: "text/plain", status: "draft", content: "Start with proof.", contentHash: "hash", refs: [],
    evidence: [], provenance: "declared", createdBy: { type: "founder", id: "founder" }, modelReceipts: [],
    toolReceipts: [], createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T11:00:00.000Z",
    ...over,
  };
}

function goal(over: Partial<Goal> = {}): Goal {
  return {
    schemaVersion: 1, id: "g1", projectId: "p1", statement: "Improve activation", desiredChange: "More founders finish setup",
    scopeRefs: [], relatedGoalRefs: [], createdBy: "founder", revisionAuthor: "founder", status: "active", currentWorkRefs: [],
    revision: 3, createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T11:00:00.000Z", ...over,
  };
}

function region(over: Partial<CanvasRegion> = {}): CanvasRegion {
  return {
    schemaVersion: 1, id: "activation", projectId: "p1", title: "Fix activation", purpose: "Improve first value",
    memberRefs: [{ type: "goal", id: "g1" }], position: { x: 120, y: 80 }, size: { width: 640, height: 420 },
    collapsed: false, founderPlaced: true, revision: 2, createdBy: "founder", revisionAuthor: "founder",
    createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T11:00:00.000Z", ...over,
  };
}

describe("OpenCanvasWorkbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listGoals.mockResolvedValue({ goals: [] });
    api.listGoalRelations.mockResolvedValue({ relations: [] });
    api.listWorkArtifacts.mockResolvedValue({ artifacts: [], storeRevision: 4 });
    api.listCanvasRegions.mockResolvedValue({ regions: [], storeRevision: 0 });
    api.listWorkRelationships.mockResolvedValue({ relationships: [], storeRevision: 4 });
    api.createGoal.mockResolvedValue({ goal: { id: "goal-new" } });
    api.createWorkArtifact.mockResolvedValue({ artifact: artifact({ artifactId: "work-new" }) });
    api.changeGoalStatus.mockResolvedValue({ goal: goal({ status: "paused", revision: 4 }) });
    api.reviseWorkArtifact.mockResolvedValue({ artifact: artifact({ revision: 3 }) });
    api.retireWorkArtifact.mockResolvedValue({ artifact: artifact({ revision: 3, retiredAt: "2026-07-11T12:00:00.000Z" }) });
    api.getWorkArtifactHistory.mockResolvedValue({ history: [] });
    api.listProductChanges.mockResolvedValue({ changes: [] });
    api.reviseCanvasRegion.mockResolvedValue({ region: region({ revision: 3 }) });
    api.archiveCanvasRegion.mockResolvedValue({ region: region({ revision: 3, archivedAt: "2026-07-11T12:00:00.000Z" }) });
    api.reopenCanvasRegion.mockResolvedValue({ region: region({ revision: 4 }) });
  });

  it("starts as a quiet canvas action and creates an independent goal in plain words", async () => {
    const changed = vi.fn();
    const created = vi.fn();
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={null} onChanged={changed} onCreated={created} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "New goal" }));
    fireEvent.change(screen.getByLabelText("What do you want to change?"), { target: { value: "Learn why setup stalls" } });
    fireEvent.change(screen.getByLabelText("What would be different?"), { target: { value: "Founders reach first value in one session" } });
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    await waitFor(() => expect(api.createGoal).toHaveBeenCalledTimes(1));
    expect(api.createGoal.mock.calls[0][0]).toBe("p1");
    expect(api.createGoal.mock.calls[0][1]).toMatchObject({
      statement: "Learn why setup stalls",
      desiredChange: "Founders reach first value in one session",
      createdBy: "founder",
    });
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(created).toHaveBeenCalledWith({ type: "goal", id: "goal-new" });
  });

  it("focuses a newly persisted work artifact by its authority reference", async () => {
    const created = vi.fn();
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={null} onChanged={vi.fn()} onCreated={created} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "New work" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Activation notes" } });
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "Founders miss the first action." } });
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));

    await waitFor(() => expect(api.createWorkArtifact).toHaveBeenCalledTimes(1));
    expect(created).toHaveBeenCalledWith({ type: "work-artifact", id: "work-new" });
  });

  it("edits a selected artifact, shows immutable history, and retires it without executing anything", async () => {
    const current = artifact();
    const first = artifact({ id: "revision:w1:1", revision: 1, summary: "First angle", updatedAt: "2026-07-11T10:00:00.000Z" });
    api.listWorkArtifacts.mockResolvedValue({ artifacts: [current], storeRevision: 8 });
    api.getWorkArtifactHistory.mockResolvedValue({ history: [first, current] });
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={{ type: "work-artifact", id: "w1" }} onChanged={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("region", { name: "Artifact content" })).toHaveTextContent("Start with proof.");
    expect(screen.queryByLabelText("Content")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const title = await screen.findByLabelText("Title");
    fireEvent.change(title, { target: { value: "Sharper launch brief" } });
    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));
    await waitFor(() => expect(api.reviseWorkArtifact).toHaveBeenCalledTimes(1));
    expect(api.reviseWorkArtifact.mock.calls[0][2]).toMatchObject({ expectedArtifactRevision: 2, title: "Sharper launch brief" });

    expect(await screen.findByText("2 revisions")).toBeInTheDocument();
    fireEvent.click(screen.getByText("2 revisions"));
    fireEvent.click(screen.getByText("First angle"));
    await waitFor(() => expect(screen.getAllByText("Start with proof.").length).toBeGreaterThan(1));
    fireEvent.click(screen.getByRole("button", { name: "Retire work" }));
    await waitFor(() => expect(api.retireWorkArtifact).toHaveBeenCalledTimes(1));
    expect(api.retireWorkArtifact.mock.calls[0][2]).toMatchObject({ expectedArtifactRevision: 2 });
  });

  it("edits a comparison with direct structured controls and preserves a source escape hatch", async () => {
    const comparison = artifact({
      contentType: "application/vnd.drover.comparison+json",
      format: "json",
      content: { alternatives: [{ name: "Proof first", risk: "Narrow" }] },
    });
    api.listWorkArtifacts.mockResolvedValue({ artifacts: [comparison], storeRevision: 8 });
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={{ type: "work-artifact", id: "w1" }} onChanged={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByRole("group", { name: "Content editing mode" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("risk"), { target: { value: "Focused" } });
    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));
    await waitFor(() => expect(api.reviseWorkArtifact).toHaveBeenCalledWith("p1", "w1", expect.objectContaining({
      content: { alternatives: [{ name: "Proof first", risk: "Focused" }] },
    })));

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect((screen.getByLabelText("Content") as HTMLTextAreaElement).value).toContain("Proof first");
  });

  it("restores an earlier work revision as a new latest revision", async () => {
    const current = artifact({ content: "Current angle" });
    const earlier = artifact({ id: "revision:w1:1", revision: 1, content: "Earlier angle", updatedAt: "2026-07-11T10:00:00.000Z" });
    api.listWorkArtifacts.mockResolvedValue({ artifacts: [current], storeRevision: 8 });
    api.getWorkArtifactHistory.mockResolvedValue({ history: [earlier, current] });
    api.restoreWorkArtifact.mockResolvedValue({ artifact: artifact({ revision: 3, content: "Earlier angle" }) });
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={{ type: "work-artifact", id: "w1" }} onChanged={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByText("2 revisions"));
    fireEvent.click(screen.getByText("Revision 1"));
    fireEvent.click(await screen.findByRole("button", { name: "Restore as latest revision" }));

    await waitFor(() => expect(api.restoreWorkArtifact).toHaveBeenCalledWith("p1", "w1", expect.objectContaining({
      expectedArtifactRevision: 2, revision: 1,
    })));
  });

  it("keeps a model-proposed canvas arrangement inert until the founder confirms it", async () => {
    const proposal = artifact({
      kind: "canvas-change-proposal", status: "proposed", title: "Group activation work",
      contentType: "application/vnd.drover.canvas-change-proposal+json", format: "json",
      content: { schemaVersion: 1, title: "Group activation work", operation: { type: "create-region", title: "Activation", memberRefs: [], position: { x: 10, y: 20 }, size: { width: 400, height: 260 }, expectedStoreRevision: 0 } },
    });
    api.listWorkArtifacts.mockResolvedValue({ artifacts: [proposal], storeRevision: 8 });
    api.applyCanvasProposal.mockResolvedValue({ artifact: artifact({ revision: 3, status: "applied" }), deduped: false });
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={{ type: "work-artifact", id: "w1" }} onChanged={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("region", { name: "Canvas proposal review" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review and apply…" }));
    expect(api.applyCanvasProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, apply on canvas" }));
    await waitFor(() => expect(api.applyCanvasProposal).toHaveBeenCalledWith("p1", "w1", expect.objectContaining({ expectedArtifactRevision: 2 })));
  });

  it("keeps a stale-write error visible and refreshes authority state on the next load", async () => {
    api.createGoal.mockRejectedValueOnce(new Error("Stale goal revision. Refresh and try again."));
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={null} onChanged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "New goal" }));
    fireEvent.change(screen.getByLabelText("What do you want to change?"), { target: { value: "Resolve the conflict" } });
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stale goal revision. Refresh and try again.");
    expect(api.listGoals).toHaveBeenCalledTimes(2);
    expect(api.listWorkArtifacts).toHaveBeenCalledTimes(2);
  });

  it("changes one goal's status with revision protection and keeps retirement separate", async () => {
    api.listGoals.mockResolvedValue({ goals: [goal()] });
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={{ type: "goal", id: "g1" }} onChanged={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText("Goal status"), { target: { value: "paused" } });
    fireEvent.change(screen.getByLabelText("Status note"), { target: { value: "Waiting for customer evidence" } });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));

    await waitFor(() => expect(api.changeGoalStatus).toHaveBeenCalledTimes(1));
    expect(api.changeGoalStatus.mock.calls[0]).toEqual(["p1", "g1", expect.objectContaining({
      expectedRevision: 3, status: "paused", statusReason: "Waiting for customer evidence", revisionAuthor: "founder",
    })]);
    expect(api.retireGoal).not.toHaveBeenCalled();
  });

  it("restores a retired goal as a new revision", async () => {
    api.listGoals.mockResolvedValue({ goals: [goal({ retiredAt: "2026-07-11T12:00:00.000Z" })] });
    api.restoreGoal.mockResolvedValue({ goal: goal({ revision: 4 }) });
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={{ type: "goal", id: "g1" }} onChanged={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Restore goal" }));

    await waitFor(() => expect(api.restoreGoal).toHaveBeenCalledTimes(1));
    expect(api.restoreGoal.mock.calls[0]).toEqual(["p1", "g1", expect.objectContaining({
      expectedRevision: 3, revisionAuthor: "founder",
    })]);
    expect(api.retireGoal).not.toHaveBeenCalled();
  });

  it("finds existing work from the quiet launcher and returns its stable canvas reference", async () => {
    api.listGoals.mockResolvedValue({ goals: [goal(), goal({ id: "g2", statement: "Clarify pricing" })] });
    api.listWorkArtifacts.mockResolvedValue({ artifacts: [artifact()], storeRevision: 5 });
    const select = vi.fn();
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={null} onChanged={vi.fn()} onSelect={select} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Open work" }));
    fireEvent.change(screen.getByLabelText("Find work"), { target: { value: "launch" } });
    expect(screen.queryByRole("button", { name: /Improve activation/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Launch brief/ }));

    expect(select).toHaveBeenCalledWith({ type: "work-artifact", id: "w1" });
  });

  it("opens isolated Claude and Codex product changes from the canvas launcher", async () => {
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={null} onChanged={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Product changes" }));

    expect(await screen.findByRole("heading", { name: "Product work waiting on you" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing is merged, pushed, deployed, or released/)).toBeInTheDocument();
    expect(api.listProductChanges).toHaveBeenCalledWith("p1");
  });

  it("edits and archives a region with CAS, then exposes an archived region for reopening", async () => {
    api.listCanvasRegions.mockResolvedValue({ regions: [region()], storeRevision: 3 });
    const changed = vi.fn();
    const view = render(<OpenCanvasWorkbench projectId="p1" selectedRef={{ type: "work-region", id: "activation" }} onChanged={changed} onClose={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText("Purpose"), { target: { value: "Make first value unmistakable" } });
    fireEvent.click(screen.getByRole("button", { name: "Save region" }));
    await waitFor(() => expect(api.reviseCanvasRegion).toHaveBeenCalledWith("p1", "activation", expect.objectContaining({
      expectedRevision: 2, purpose: "Make first value unmistakable", placementMode: "founder",
    })));
    fireEvent.click(screen.getByRole("button", { name: "Archive region" }));
    await waitFor(() => expect(api.archiveCanvasRegion).toHaveBeenCalledWith("p1", "activation", expect.objectContaining({ expectedRevision: 2 })));

    view.unmount();
    api.listCanvasRegions.mockResolvedValue({ regions: [region({ revision: 3, archivedAt: "2026-07-11T12:00:00.000Z" })], storeRevision: 4 });
    render(<OpenCanvasWorkbench projectId="p1" selectedRef={{ type: "work-region", id: "activation" }} onChanged={changed} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reopen region" }));
    await waitFor(() => expect(api.reopenCanvasRegion).toHaveBeenCalledWith("p1", "activation", expect.objectContaining({ expectedRevision: 3 })));
  });
});
