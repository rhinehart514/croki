import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoalRelation, WorkRelationshipRevision } from "@/openCanvasTypes";

const api = vi.hoisted(() => ({
  getGoalRelation: vi.fn(), getGoalRelationHistory: vi.fn(), reviseGoalRelation: vi.fn(),
  retireGoalRelation: vi.fn(), restoreGoalRelation: vi.fn(),
  getWorkRelationship: vi.fn(), getWorkRelationshipHistory: vi.fn(), reviseWorkRelationship: vi.fn(),
  retireWorkRelationship: vi.fn(), restoreWorkRelationship: vi.fn(),
}));
vi.mock("@/api", () => api);
vi.mock("@/lib/identity", () => ({ getIdentity: () => ({ userId: "founder", name: "Founder" }) }));

import { CanvasRelationshipInspector } from "@/components/CanvasRelationshipInspector";

function goalRelation(overrides: Partial<GoalRelation> = {}): GoalRelation {
  return {
    schemaVersion: 1, id: "gr-1", projectId: "p1",
    sourceRef: { type: "goal", id: "activation" }, targetRef: { type: "goal", id: "retention" },
    kind: "supports", label: "Activation supports retention",
    basis: [{ type: "reasoning", statement: "Both depend on first value" }],
    declaredProvenance: "inferred", provenance: "inferred", createdBy: "model:claude",
    revisionAuthor: "model:claude", revision: 0,
    createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T10:00:00.000Z",
    ...overrides,
  };
}

function workRelationship(overrides: Partial<WorkRelationshipRevision> = {}): WorkRelationshipRevision {
  return {
    id: "revision:wr-1:3", relationshipId: "wr-1", projectId: "p1", revision: 3, parentRefs: [],
    sourceRef: { type: "work-artifact", id: "brief" }, targetRef: { type: "work-artifact", id: "proof" },
    kind: "grounds", label: "Proof grounds brief", basis: ["Founder linked these"],
    declaredProvenance: "founder-stated", provenance: "founder-stated",
    createdBy: { type: "founder", id: "founder" }, modelReceipts: [], toolReceipts: [],
    createdAt: "2026-07-11T10:00:00.000Z", updatedAt: "2026-07-11T12:00:00.000Z",
    ...overrides,
  };
}

describe("CanvasRelationshipInspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const proposed = goalRelation();
    api.getGoalRelation.mockResolvedValue({ relation: proposed });
    api.getGoalRelationHistory.mockResolvedValue({ history: [proposed] });
    api.reviseGoalRelation.mockResolvedValue({ relation: goalRelation({ revision: 1 }) });
    const retired = workRelationship({ retiredAt: "2026-07-11T12:00:00.000Z" });
    api.getWorkRelationship.mockResolvedValue({ relationship: retired });
    api.getWorkRelationshipHistory.mockResolvedValue({ history: [workRelationship({ revision: 1 }), retired] });
    api.restoreWorkRelationship.mockResolvedValue({ relationship: workRelationship({ revision: 4 }) });
  });

  it("keeps inferred material visibly proposed, revises with CAS, and accepts only on founder action", async () => {
    const changed = vi.fn();
    render(<CanvasRelationshipInspector projectId="p1" selection={{ type: "goal-relation", id: "gr-1" }} onChanged={changed} />);

    expect(await screen.findByText("Model suggestion")).toBeInTheDocument();
    expect(screen.getByText("It stays proposed until you accept it.")).toBeInTheDocument();
    expect(screen.getByText("1 immutable revision")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Activation precedes retention" } });
    fireEvent.change(screen.getByLabelText(/^Basis/), { target: { value: "Observed in the onboarding path" } });
    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));
    await waitFor(() => expect(api.reviseGoalRelation).toHaveBeenCalledWith("p1", "gr-1", expect.objectContaining({
      expectedRevision: 0,
      label: "Activation precedes retention",
      basis: [{ type: "reasoning", statement: "Observed in the onboarding path" }],
    })));
    expect(api.reviseGoalRelation.mock.calls[0][2]).not.toHaveProperty("provenance");

    fireEvent.click(screen.getByRole("button", { name: "Accept relationship" }));
    await waitFor(() => expect(api.reviseGoalRelation).toHaveBeenLastCalledWith("p1", "gr-1", expect.objectContaining({
      expectedRevision: 0, provenance: "founder-stated", revisionAuthor: "founder",
    })));
  });

  it("restores a retired work relationship through its existing authority without changing endpoints", async () => {
    render(<CanvasRelationshipInspector projectId="p1" selection={{ type: "work-relationship", id: "wr-1" }} onChanged={vi.fn()} />);

    expect(await screen.findByText("2 immutable revisions")).toBeInTheDocument();
    expect(screen.getByLabelText("Relationship kind")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Restore relationship" }));
    await waitFor(() => expect(api.restoreWorkRelationship).toHaveBeenCalledWith("p1", "wr-1", expect.objectContaining({
      expectedRelationshipRevision: 3,
      createdBy: expect.objectContaining({ type: "founder", id: "founder" }),
    })));
    expect(api.reviseWorkRelationship).not.toHaveBeenCalled();
  });
});
