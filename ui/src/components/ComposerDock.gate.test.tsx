import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ComposerDock } from "./ComposerDock";
import { itemKey } from "@/lib/itemKey";
import type { GTMItem, GTMRunResult, OperatorSession } from "@/types";

// Gate-in-chat: the "Review & send" button in the warm composer must OPEN the real founder review IN the
// thread (GateReview variant="stage"), fed by the session's own pending-gate payload, and release through
// the passed onSubmitGateReview handler — the same authorized path the canvas gate uses. Before this WI the
// button called onReviewGate, which only selected an invisible canvas node, so the review never opened.

const GATE_ID = "gate-1";

function gateItem(gtmActionId: string, draft: string): GTMItem {
  return { gtmActionId, draft_note: draft, subject: `To ${gtmActionId}` } as unknown as GTMItem;
}

function runResultWith(items: GTMItem[]): GTMRunResult {
  return {
    runId: "r1",
    graphId: "g1",
    ok: true,
    nodes: {
      [GATE_ID]: { nodeId: GATE_ID, category: "gate", ok: true, items, pendingReview: true },
    },
    executionOrder: [GATE_ID],
    pendingGates: [GATE_ID],
  } as unknown as GTMRunResult;
}

function gateSession(items: GTMItem[] | null): OperatorSession {
  return {
    id: "s1",
    goal: "get more owners",
    graphId: "g1",
    status: "waiting_for_gate",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: 1,
    model: "claude",
    stepCount: 3,
    maxSteps: 20,
    graphRevision: 1,
    events: [],
    pendingGate: items
      ? { nodeIds: [GATE_ID], runResult: runResultWith(items) }
      : { nodeIds: [GATE_ID], runResult: runResultWith([]) },
  } as unknown as OperatorSession;
}

// jsdom doesn't implement Element.scrollTo, which the dock calls to keep the thread pinned to newest.
beforeAll(() => {
  if (!("scrollTo" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollTo", { value: () => {}, writable: true });
  }
});

describe("ComposerDock — gate in chat", () => {
  it("opens the real review IN the thread when 'Review & send' is clicked (the button is no longer dead)", () => {
    const items = [gateItem("a1", "Hi Ada — saw your launch."), gateItem("a2", "Hi Bo — nice to meet you.")];
    render(
      <ComposerDock
        session={gateSession(items)}
        running={false}
        onSend={() => {}}
        onCancel={() => {}}
        onReviewGate={() => {}}
        onSubmitGateReview={() => {}}
      />,
    );

    const button = screen.getByRole("button", { name: /review & send/i });
    expect(button).toBeTruthy();

    fireEvent.click(button);

    // The GateReview stage's count lead proves the review opened (not the summary card, not an empty stage).
    expect(screen.getByText(/2 to decide · nothing sends until you say so/i)).toBeTruthy();
    // The staged draft body renders — the founder is now reading the real work in the thread.
    expect(screen.getByText(/saw your launch/i)).toBeTruthy();
  });

  it("routes Approve through the passed onSubmitGateReview handler (the authorized path, not a fork)", () => {
    const items = [gateItem("a1", "Hi Ada — saw your launch.")];
    const onSubmitGateReview = vi.fn();
    render(
      <ComposerDock
        session={gateSession(items)}
        running={false}
        onSend={() => {}}
        onCancel={() => {}}
        onReviewGate={() => {}}
        onSubmitGateReview={onSubmitGateReview}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /review & send/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send it$/i }));

    const key = itemKey(items[0], 0);
    expect(onSubmitGateReview).toHaveBeenCalledWith(GATE_ID, { [key]: { decision: "approve" } });
  });

  it("does NOT open an empty stage when no items are staged — shows the 'nothing staged' note instead", () => {
    render(
      <ComposerDock
        session={gateSession([])}
        running={false}
        onSend={() => {}}
        onCancel={() => {}}
        onReviewGate={() => {}}
        onSubmitGateReview={() => {}}
      />,
    );

    // The button is present but disabled — and clicking it never opens the review.
    const button = screen.getByRole("button", { name: /review & send/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(screen.getByText(/nothing staged to review/i)).toBeTruthy();
    // No decision-card lead text — the stage stayed closed.
    expect(screen.queryByText(/^nothing sends until you approve$/i)).toBeNull();
  });

  it("threads send-back: opening the note box and sending fires onRefineItem with the item + note", () => {
    const items = [gateItem("a1", "Hi Ada — saw your launch.")];
    const onRefineItem = vi.fn();
    render(
      <ComposerDock
        session={gateSession(items)}
        running={false}
        onSend={() => {}}
        onCancel={() => {}}
        onReviewGate={() => {}}
        onSubmitGateReview={() => {}}
        onRefineItem={onRefineItem}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /review & send/i }));
    // With onRefineItem passed, the stage card offers "Send back" (routes to the crew) instead of a bare Return.
    fireEvent.click(screen.getByRole("button", { name: /^send back$/i }));
    const note = screen.getByPlaceholderText(/make the opening less salesy/i) as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "warmer opener please" } });
    // Scope to the refine card so a stray composer "Send" control never matches.
    const refineCard = note.closest(".cgate-refine") as HTMLElement;
    fireEvent.click(within(refineCard).getByRole("button", { name: /send to your crew/i }));

    expect(onRefineItem).toHaveBeenCalledWith(items[0], "warmer opener please");
  });
});
