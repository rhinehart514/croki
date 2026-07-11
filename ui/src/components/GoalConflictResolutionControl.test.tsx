import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listGoalConflictDecisions, recordGoalConflictDecision } from "@/api";
import type { GoalConflictDecision } from "@/openCanvasTypes";
import type { WovenGoalConflict } from "@/types";
import { GoalConflictResolutionControl } from "./GoalConflictResolutionControl";

vi.mock("@/api", () => ({ listGoalConflictDecisions: vi.fn(), recordGoalConflictDecision: vi.fn() }));

const conflict: WovenGoalConflict = {
  id: "goal-conflict:work-artifact:shared",
  kind: "shared-object",
  objectRef: { type: "work-artifact", id: "shared" },
  goalRefs: [{ type: "goal", id: "activation" }, { type: "goal", id: "positioning" }],
  goalCount: 2,
  status: "needs-founder",
  blocking: false,
  summary: "2 active goals share work-artifact shared",
  detail: "Shared context is not proof that changes are incompatible.",
  provenance: "derived",
  basis: [],
};

function decision(extra: Partial<GoalConflictDecision> = {}): GoalConflictDecision {
  return {
    schemaVersion: 1,
    id: `${conflict.id}:r0`,
    conflictId: conflict.id,
    projectId: "p1",
    objectRef: conflict.objectRef,
    goalRefs: conflict.goalRefs,
    receiptFingerprint: "proof",
    resolution: "keep-separate",
    note: null,
    decidedBy: { type: "founder", id: "jacob" },
    revision: 0,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
    ...extra,
  };
}

describe("GoalConflictResolutionControl", () => {
  beforeEach(() => vi.resetAllMocks());

  it("states the evidence boundary and records a founder choice without implying mutation", async () => {
    vi.mocked(listGoalConflictDecisions).mockResolvedValue({ projectId: "p1", storeRevision: 3, decisions: [] });
    vi.mocked(recordGoalConflictDecision).mockResolvedValue({
      projectId: "p1", storeRevision: 4, decisions: [decision()], decision: decision(),
    });
    const onResolved = vi.fn();
    render(<GoalConflictResolutionControl
      projectId="p1" conflict={conflict} founderId="jacob"
      goalLabels={{ activation: "Fix activation", positioning: "Clarify positioning" }}
      onResolved={onResolved}
    />);

    expect(screen.getByText(/alone does not mean/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is changed or executed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Choose one goal for this object"));
    fireEvent.change(screen.getByLabelText(/Goal that owns/), { target: { value: "positioning" } });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Use the launch wording" } });
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));

    await waitFor(() => expect(recordGoalConflictDecision).toHaveBeenCalledWith(
      "p1", conflict.id, expect.objectContaining({
        expectedStoreRevision: 3,
        resolution: "choose-goal",
        chosenGoalRef: { type: "goal", id: "positioning" },
        note: "Use the launch wording",
        decidedBy: { type: "founder", id: "jacob" },
      }),
    ));
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it("renders an attributable receipt and allows an explicit revision", () => {
    render(<GoalConflictResolutionControl
      projectId="p1"
      conflict={{ ...conflict, status: "resolved", resolution: decision({ resolution: "acknowledge-coexistence", note: "Different uses are compatible." }) }}
      founderId="jacob"
    />);
    expect(screen.getByText("Let both goals use it")).toBeInTheDocument();
    expect(screen.getByText(/Recorded by jacob, revision 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("button", { name: "Record decision" })).toBeInTheDocument();
  });

  it("keeps a stale write visible as a local error", async () => {
    vi.mocked(listGoalConflictDecisions).mockResolvedValue({ projectId: "p1", storeRevision: 1, decisions: [] });
    vi.mocked(recordGoalConflictDecision).mockRejectedValue(new Error("Stale conflict decision store revision: expected 1, current 2."));
    render(<GoalConflictResolutionControl projectId="p1" conflict={conflict} founderId="jacob" />);
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/stale conflict decision/i);
  });
});
