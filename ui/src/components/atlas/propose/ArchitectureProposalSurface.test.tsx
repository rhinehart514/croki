import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmArchitectureOperation, FirmArchitectureProposal } from "@/types";
import { projectArchitectureProposal } from "../architectureProposalProjection";
import { ArchitectureProposalCard } from "./ArchitectureProposalSurface";
import { groupProposalOperationsByMotion } from "./proposalMotionGroups";

const operations: FirmArchitectureOperation[] = [
  {
    op: "create-element",
    element: {
      id: "motion-outbound",
      role: "motion",
      name: "Founder-led outbound",
      actor: "Founder",
      entry: "Grounded account",
      value: "Relevant conversation",
      repeatabilityClaim: "Grounded relevance repeatedly opens useful conversations.",
      systemIds: ["system-research"],
      productRefs: [],
    },
  },
  {
    op: "create-element",
    element: { id: "system-research", role: "system", name: "Account research", does: "Grounds each account in product truth." },
  },
  {
    op: "create-element",
    element: {
      id: "motion-plg",
      role: "motion",
      name: "Product-led invitation",
      actor: "Product",
      entry: "Useful first result",
      value: "Invited teammate",
      repeatabilityClaim: "Useful results create a natural invitation moment.",
      systemIds: [],
      productRefs: [],
    },
  },
  {
    op: "create-connection",
    connection: {
      id: "connection-motion-bridge",
      fromRef: "architecture:motion-outbound",
      toRef: "architecture:motion-plg",
      label: "returns learning to",
      assertion: "tentative",
    },
  },
  {
    op: "create-element",
    element: {
      id: "campaign-first-proof",
      role: "campaign",
      name: "First outbound proof",
      audience: "Design-led founders",
      objective: "Open grounded conversations",
      primaryMotionId: "motion-outbound",
      motionIds: ["motion-outbound"],
      governingBetId: "bet-outbound",
      supportingBetIds: [],
      measurement: { observation: "Relevant replies", window: "First twenty sends" },
    },
  },
  {
    op: "create-connection",
    connection: {
      id: "connection-research-outbound",
      fromRef: "architecture:system-research",
      toRef: "architecture:motion-outbound",
      label: "grounds",
      assertion: "tentative",
    },
  },
];

function proposal(overrides: Partial<FirmArchitectureProposal> = {}): FirmArchitectureProposal {
  return {
    id: "proposal-1",
    ventureId: "venture-1",
    baseRevision: 4,
    intent: "Open three grounded routes from one ask",
    operations,
    affectedExecutionContexts: ["whole venture"],
    evidenceRefs: ["repository:src/product.ts#L4"],
    unresolvedAssumptions: ["The founder has not confirmed the first audience."],
    expectedExecutionEffect: "Architecture changes only; no campaign or outward act starts.",
    proposedBy: { authority: "agent", id: "operator" },
    configurationRevision: 3,
    status: "pending",
    createdAt: "2026-07-15T12:00:00.000Z",
    decidedAt: null,
    decision: null,
    assemblyEvents: operations.map((operation, operationIndex) => ({
      operationIndex,
      op: operation.op,
      label: `${operation.op}: operation ${operationIndex + 1}`,
      validated: true,
      at: `2026-07-15T12:00:0${operationIndex}.000Z`,
    })),
    ...overrides,
  };
}

describe("ArchitectureProposalCard", () => {
  it("renders only operation-backed objects with exact assumptions, effect, gaps, and receipt", () => {
    const view = projectArchitectureProposal(proposal(), 4);
    render(<ArchitectureProposalCard view={view} onAccept={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Open three grounded routes from one ask" })).toBeVisible();
    expect(screen.getByText("Founder-led outbound")).toBeVisible();
    expect(screen.getByText("Product-led invitation")).toBeVisible();
    expect(screen.getByText("First outbound proof")).toBeVisible();
    expect(screen.getByText("Architecture changes only; no campaign or outward act starts.")).toBeVisible();
    expect(screen.getByText("The founder has not confirmed the first audience.")).toBeVisible();
    expect(screen.getByText(/do not define a sequence of steps, approval counts, or teammate assignments/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Verified assembly progress" })).toBeVisible();
    expect(screen.getByText(/full proposal validated before this ordered batch was recorded/i)).toBeVisible();
    expect(screen.getByRole("list", { name: "Validated proposal operations" }).children).toHaveLength(6);
    expect(screen.queryByText(/reasoning progress/i)).not.toBeInTheDocument();
    expect(screen.getByText("6 operations")).toBeVisible();
    expect(screen.getByText("2 routes")).toBeVisible();
    expect(screen.getByText("1 campaign")).toBeVisible();
    expect(screen.queryByText(/5 stages|3 gates/i)).not.toBeInTheDocument();
  });

  it("accepts the whole proposal when current and refuses stale acceptance locally", async () => {
    const accept = vi.fn().mockResolvedValue(undefined);
    const current = projectArchitectureProposal(proposal(), 4);
    const view = render(<ArchitectureProposalCard view={current} onAccept={accept} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept whole proposal" }));
    await waitFor(() => expect(accept).toHaveBeenCalledOnce());

    const stale = projectArchitectureProposal(proposal(), 5);
    view.rerender(<ArchitectureProposalCard view={stale} onAccept={accept} />);
    const disabled = screen.getByRole("button", { name: "Accept whole proposal" });
    expect(disabled).toBeDisabled();
    fireEvent.click(disabled);
    expect(accept).toHaveBeenCalledOnce();
    expect(screen.getByText(/must be refreshed before acceptance/i)).toBeVisible();
  });

  it("exposes only exclusive operation groups to per-motion adjustment", () => {
    const view = projectArchitectureProposal(proposal(), 4);
    const groups = groupProposalOperationsByMotion(view);

    expect(groups).toEqual([
      expect.objectContaining({
        motionId: "motion-outbound",
        operationIndexes: [0, 4, 5],
        sharedOperationIndexes: [3],
      }),
      expect.objectContaining({
        motionId: "motion-plg",
        operationIndexes: [2],
        sharedOperationIndexes: [3],
      }),
    ]);

    const adjust = vi.fn();
    render(<ArchitectureProposalCard view={view} onAccept={vi.fn()} onAdjustMotion={adjust} />);
    const buttons = screen.getAllByRole("button", { name: "Adjust path" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    expect(adjust).toHaveBeenCalledWith(expect.objectContaining({
      motionId: "motion-outbound",
      operationIndexes: [0, 4, 5],
      sharedOperationIndexes: [3],
    }));
    expect(screen.getAllByText(/1 shared operation excluded/i)).toHaveLength(2);
  });
});
