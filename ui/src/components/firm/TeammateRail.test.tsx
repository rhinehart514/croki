import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { FirmLens } from "@/types";

vi.mock("@/components/crew/CrewFace", () => ({
  CrewFace: ({ agentRef }: { agentRef: string }) => <span data-testid={`face-${agentRef}`} />,
}));
vi.mock("./ConversationFeed", () => ({ ConversationFeed: () => <div>Conversation</div> }));
vi.mock("./GoalComposer", () => ({
  GoalComposer: ({ repositoryName, selection }: { repositoryName?: string; selection?: { betId: string | null; workRef: string | null; teammateRefs: string[] } | null }) => <div data-testid="composer" data-scope={selection?.workRef ? `work:${selection.workRef}` : selection?.betId ? "bet" : selection?.teammateRefs.length ? "teammates" : "venture"}>{repositoryName}</div>,
}));

import { TeammateRail } from "./TeammateRail";

const lens: FirmLens = {
  ventureId: "venture-1",
  crew: ["mara", "sol", "reed", "aya", "noor"].map((ref) => ({
    ref,
    summonedAt: "2026-07-14T00:00:00.000Z",
    soul: { name: ref[0].toUpperCase() + ref.slice(1) },
  })),
  bets: [{
    id: "bet-1",
    ventureId: "venture-1",
    intent: "Reach the first design partner",
    forkedFrom: null,
    teammateRef: "mara",
    refs: [],
    evidence: [],
    staged: [],
    joinKey: "join-1",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    endedAt: null,
    endedBy: null,
    learning: null,
    position: "live",
    stagedCount: 0,
    latestOutcome: null,
  }],
  wall: { count: 0, oldestParkedAt: null },
  placement: { positions: {}, revision: 0 },
};

function renderRail(overrides: Partial<ComponentProps<typeof TeammateRail>> = {}) {
  const props: ComponentProps<typeof TeammateRail> = {
    venture: {
      id: "venture-1",
      name: "Drover",
      repository: "/products/drover",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    },
    lens,
    messages: [],
    selection: null,
    wallOpen: false,
    onSelectCrew: vi.fn(),
    onSelectBet: vi.fn(),
    onClearSelection: vi.fn(),
    onOpenWall: vi.fn(),
    onCloseWall: vi.fn(),
    onDriven: vi.fn(),
    onConfigurationChanged: vi.fn(),
    ...overrides,
  };
  render(<TeammateRail {...props} />);
  return props;
}

describe("TeammateRail", () => {
  it("keeps crew out of the conversation panel and leaves the composer grounded", () => {
    renderRail();
    expect(screen.queryByRole("region", { name: "Teammate roster" })).toBeNull();
    expect(screen.getByText("Direction, configuration, and work")).toBeVisible();
    expect(screen.getByTestId("composer")).toHaveTextContent("drover");
  });

  it("preserves selected teammate scope without duplicating crew navigation", () => {
    const onClearSelection = vi.fn();
    renderRail({ selection: { betId: null, workRef: null, teammateRefs: ["mara"] }, onClearSelection });

    expect(screen.getByText("Mara")).toBeVisible();
    expect(screen.getByTestId("composer")).toHaveAttribute("data-scope", "teammates");
    fireEvent.click(screen.getByRole("button", { name: "Return to venture thread" }));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it("can collapse independently from the canvas", () => {
    const onCollapse = vi.fn();
    renderRail({ onCollapse });
    fireEvent.click(screen.getByRole("button", { name: "Hide conversation" }));
    expect(onCollapse).toHaveBeenCalledOnce();
  });

  it("collapses the transcript while retaining the exact-work composer", () => {
    renderRail({
      transcriptOpen: false,
      selection: { betId: "bet-1", workRef: "work-1", teammateRefs: ["mara"] },
    });

    expect(screen.queryByText("Conversation")).toBeNull();
    expect(screen.getByRole("complementary", { name: /exact work direction/i })).toBeTruthy();
    expect(screen.getByTestId("composer")).toHaveAttribute("data-scope", "work:work-1");
  });

  it("keeps the composer available while the wall is open", () => {
    const onCloseWall = vi.fn();
    renderRail({ wallOpen: true, onCloseWall });

    expect(screen.getByTestId("composer")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/founder decisions are open.*direction remains available/i);
    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    expect(onCloseWall).toHaveBeenCalledOnce();
  });

  it("can finish a return briefing after opening the wider firm", () => {
    const onReviewReturnBrief = vi.fn();
    renderRail({
      returnBrief: {
        heading: "Return to the firm",
        records: [{ id: "brief-1", group: "kept-moving", truth: "A bet moved inward.", actionLabel: "Open bet", target: { kind: "bet", betId: "bet-1" } }],
        reviewableCount: 1,
        omittedCount: 0,
        omission: "Routine work remains in the wider firm.",
      },
      onReviewReturnBrief,
    });

    fireEvent.click(screen.getByRole("button", { name: /show the wider firm/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish briefing/i }));
    expect(onReviewReturnBrief).toHaveBeenCalledOnce();
  });
});
