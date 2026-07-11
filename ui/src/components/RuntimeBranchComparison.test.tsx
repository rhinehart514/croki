import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeBranchComparison } from "./RuntimeBranchComparison";
import { comparisonsFromDurableGroups, type RuntimeBranchComparisonModel } from "@/lib/runtimeBranchComparison";
import type { OperatorComparisonGroup, OperatorSession } from "@/types";

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock("@/api", () => ({ listWorkArtifacts: api.list, createWorkArtifact: api.create }));

function branch(runtime: "claude" | "codex", overrides: Partial<OperatorSession> = {}): OperatorSession {
  const name = runtime === "codex" ? "Codex" : "Claude";
  return {
    id: `${runtime}-branch`,
    goal: "Challenge positioning",
    graphId: "graph-1",
    projectId: "project-1",
    status: "running",
    createdAt: "2026-07-11T12:00:00.000Z",
    updatedAt: "2026-07-11T12:00:01.000Z",
    schemaVersion: 1,
    model: runtime === "codex" ? "gpt-5.5-codex" : "claude-opus-4-8",
    worker: { runtime, model: runtime === "codex" ? "gpt-5.5-codex" : "claude-opus-4-8" },
    parentSessionId: "parent-1",
    branchGroupId: "both-1",
    handoffRevision: 0,
    stepCount: 1,
    maxSteps: 20,
    graphRevision: 0,
    events: [{
      id: `${runtime}-event`,
      createdAt: "2026-07-11T12:00:01.000Z",
      type: "operator_note",
      title: `${name} found a different wedge`,
      detail: `${name} says the strongest proof is founder activation.`,
    }],
    ...overrides,
  } as OperatorSession;
}

function comparison(overrides: Partial<RuntimeBranchComparisonModel> = {}): RuntimeBranchComparisonModel {
  return {
    branchGroupId: "both-1",
    parentSessionId: "parent-1",
    branches: [branch("claude"), branch("codex")],
    selectedSessionId: null,
    keptBoth: false,
    ...overrides,
  };
}

describe("RuntimeBranchComparison", () => {
  beforeEach(() => { api.list.mockReset().mockResolvedValue({ artifacts: [], storeRevision: 7 }); api.create.mockReset(); });
  it("reconstructs independent comparison groups after reload without inventing a decision", () => {
    const groups: OperatorComparisonGroup[] = ["both-1", "both-2"].map((branchGroupId, index) => ({
      branchGroupId,
      parentSessionId: `parent-${index + 1}`,
      projectId: "project-1",
      createdAt: "2026-07-11T12:00:00.000Z",
      updatedAt: "2026-07-11T12:00:01.000Z",
      branches: [
        branch("claude", { id: `${branchGroupId}-claude`, branchGroupId, parentSessionId: `parent-${index + 1}` }),
        branch("codex", { id: `${branchGroupId}-codex`, branchGroupId, parentSessionId: `parent-${index + 1}` }),
      ],
    }));
    const restored = comparisonsFromDurableGroups(groups);

    expect(Object.keys(restored)).toEqual(["both-1", "both-2"]);
    expect(restored["both-1"].branches).toHaveLength(2);
    expect(restored["both-1"].selectedSessionId).toBeNull();
    expect(restored["both-1"].keptBoth).toBe(false);
  });

  it("keeps both provider outputs visible, attributable, and explicitly separate", () => {
    render(<RuntimeBranchComparison comparison={comparison()} onChoose={() => {}} onKeepBoth={() => {}} />);

    expect(screen.getByRole("region", { name: /Claude and Codex are working/ })).toBeInTheDocument();
    const claude = screen.getByRole("article", { name: "Claude branch" });
    const codex = screen.getByRole("article", { name: "Codex branch" });
    expect(within(claude).getByText("Produced by Claude")).toBeInTheDocument();
    expect(within(codex).getByText("Produced by Codex")).toBeInTheDocument();
    expect(within(claude).getByText(/Claude says the strongest proof/)).toBeInTheDocument();
    expect(within(codex).getByText(/Codex says the strongest proof/)).toBeInTheDocument();
    expect(screen.getByText(/does not merge work, stop the other branch, or approve an action/i)).toBeInTheDocument();
    expect(screen.getByText("No branch has been chosen. Both continue independently.")).toBeInTheDocument();
  });

  it("makes focus and keep-both separate founder decisions", () => {
    const onChoose = vi.fn();
    const onKeepBoth = vi.fn();
    const { rerender } = render(
      <RuntimeBranchComparison comparison={comparison()} onChoose={onChoose} onKeepBoth={onKeepBoth} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Codex" }));
    expect(onChoose).toHaveBeenCalledWith("codex-branch");
    expect(onKeepBoth).not.toHaveBeenCalled();

    rerender(
      <RuntimeBranchComparison
        comparison={comparison({ selectedSessionId: "codex-branch" })}
        onChoose={onChoose}
        onKeepBoth={onKeepBoth}
      />,
    );
    expect(screen.getByRole("button", { name: "Codex chosen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Codex is in focus. The other branch remains intact and attributable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep both branches" }));
    expect(onKeepBoth).toHaveBeenCalledOnce();
  });

  it("keeps a visible non-authorizing receipt when both branches are retained", () => {
    render(<RuntimeBranchComparison
      comparison={comparison({ keptBoth: true })}
      onChoose={() => {}}
      onKeepBoth={() => {}}
    />);

    expect(screen.getByText("Both branches are kept as separate work. Nothing was merged or approved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Both branches kept" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Both branches kept" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows each branch's own status without implying equivalence or a winner", () => {
    render(<RuntimeBranchComparison
      comparison={comparison({
        branches: [
          branch("claude", { status: "completed", summary: "A proof-led activation argument." }),
          branch("codex", { status: "waiting_for_input", summary: "Needs the pricing constraint." }),
        ],
      })}
      onChoose={() => {}}
      onKeepBoth={() => {}}
    />);

    expect(within(screen.getByRole("article", { name: "Claude branch" })).getByText("completed")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Codex branch" })).getByText("waiting for input")).toBeInTheDocument();
    expect(screen.queryByText(/winner|best response|equivalent/i)).not.toBeInTheDocument();
  });

  it("deliberately materializes a third attributable comparison object without consensus or authority", async () => {
    const onMaterialized = vi.fn();
    api.create.mockResolvedValue({ artifact: { artifactId: "runtime-comparison-both-1", kind: "runtime-comparison", content: { branchGroupId: "both-1" } } });
    render(<RuntimeBranchComparison comparison={comparison()} onChoose={() => {}} onKeepBoth={() => {}} onMaterialized={onMaterialized} />);
    fireEvent.click(await screen.findByRole("button", { name: "Make comparison work" }));
    await vi.waitFor(() => expect(api.create).toHaveBeenCalledOnce());
    const [projectId, input] = api.create.mock.calls[0];
    expect(projectId).toBe("project-1");
    expect(input.expectedStoreRevision).toBe(7);
    expect(input.idempotencyKey).toBe("ui:runtime-comparison:both-1");
    expect(input.content.branches.map((item: { sessionId: string }) => item.sessionId).sort()).toEqual(["claude-branch", "codex-branch"]);
    expect(input.content).toMatchObject({ disagreementPreserved: true, synthesis: null, winner: null, authorityGranted: false });
    expect(input.modelReceipts).toEqual([]);
    expect(onMaterialized).toHaveBeenCalledWith({ type: "work-artifact", id: "runtime-comparison-both-1" });
    expect(await screen.findByText(/Neither branch was merged, chosen, stopped, or authorized/)).toBeInTheDocument();
  });

  it("reconstructs the durable comparison artifact after refresh instead of creating a duplicate", async () => {
    api.list.mockResolvedValue({ artifacts: [{ artifactId: "existing", kind: "runtime-comparison", content: { branchGroupId: "both-1" } }], storeRevision: 8 });
    render(<RuntimeBranchComparison comparison={comparison()} onChoose={() => {}} onKeepBoth={() => {}} />);
    expect(await screen.findByRole("button", { name: "Comparison on canvas" })).toBeDisabled();
    expect(api.create).not.toHaveBeenCalled();
  });
});
