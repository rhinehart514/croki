import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GateReview } from "./GateReview";
import type { GTMItem } from "@/types";

// The wall's UI seam. These assert the two things that must never break: an approve/reject click maps
// to the correct decision on the correct item's key, and a failed submit does NOT silently swallow the
// founder's decision — it reverts the optimistic verdict and surfaces the error (the Phase 1 fix).

// `id` is what itemKey() keys on (email/url/name all absent), so we know exactly which key each
// decision lands under. `subject` + `draft` make the card a real, approvable (non-hollow) draft.
const items: GTMItem[] = [
  { type: "draft", id: "alpha-1", subject: "Intro to Acme", draft: "Hi — wanted to reach out about your rollout." },
  { type: "draft", id: "beta-2", subject: "Follow up with Beta", draft: "Following up on our last conversation." },
];

describe("GateReview decision mapping", () => {
  it("maps an Approve click to { decision: 'approve' } under the item's own key", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GateReview items={items} onSubmit={onSubmit} learned={0} />);

    const approveButtons = screen.getAllByRole("button", { name: /Approve & release/i });
    expect(approveButtons).toHaveLength(2);
    fireEvent.click(approveButtons[0]);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ "alpha-1": { decision: "approve" } });
  });

  it("maps a Return-as-draft click to { decision: 'reject' } under the item's own key", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GateReview items={items} onSubmit={onSubmit} learned={0} />);

    const rejectButtons = screen.getAllByRole("button", { name: /Return as draft/i });
    // Decide the second card so we prove the key is per-item, not the first row by default.
    fireEvent.click(rejectButtons[1]);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ "beta-2": { decision: "reject" } });
  });

  it("carries the edited draft on a Save & approve", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GateReview items={items} onSubmit={onSubmit} learned={0} />);

    fireEvent.click(screen.getAllByRole("button", { name: /^Edit$/i })[0]);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Rewritten by the founder." } });
    fireEvent.click(screen.getByRole("button", { name: /Save & approve/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      "alpha-1": { decision: "approve", editedDraft: "Rewritten by the founder." },
    });
  });
});

describe("GateReview outcome return on a sent item", () => {
  // A real operator gate item carries gtmActionId (the gate stamps it) but no Phase-5 joinKey. The
  // affordance must still appear on it and record against that provenance id.
  const sentItem: GTMItem[] = [
    { type: "draft", id: "alpha-1", gtmActionId: "gtm-abc", subject: "Intro to Acme", draft: "Hi — wanted to reach out." },
  ];

  it("shows 'Record what happened' only after approval, and records the item's provenance outcome", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onRecordOutcome = vi.fn().mockResolvedValue(undefined);
    render(<GateReview items={sentItem} onSubmit={onSubmit} learned={0} onRecordOutcome={onRecordOutcome} />);

    // Before approval there is no outcome door — it rides only the decided-approved card.
    expect(screen.queryByRole("button", { name: /Record what happened/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Approve & release/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    // Now the door is on the approved card; open it and record a plain-label reply.
    fireEvent.click(await screen.findByRole("button", { name: /Record what happened/i }));
    fireEvent.click(screen.getByRole("button", { name: /^reply$/ }));

    await waitFor(() => expect(onRecordOutcome).toHaveBeenCalledTimes(1));
    expect(onRecordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ gtmActionId: "gtm-abc" }),
      { outcomeKind: "reply" },
    );
    // The card collapses to a receipt of what was recorded.
    expect(await screen.findByText(/Recorded: reply/i)).toBeTruthy();
  });

  // The compiled-run gate (ObjectGraphCanvas) used to carry its OWN inline outcome handler that keyed on
  // joinKey ONLY and never refreshed the run summary — a divergent copy. It now forwards the SAME shared
  // handler the operator gate uses (App's recordItemOutcome): resolve the item's provenance id as
  // joinKey ?? gtmActionId, record, then refresh the summary. This models that handler and proves an
  // item carrying ONLY gtmActionId (no joinKey) records against gtmActionId and triggers the refresh —
  // the exact behavior the old inline handler dropped.
  it("compiled-run gate records+joins on gtmActionId via the shared handler, and refreshes the summary", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const recordOutcomeApi = vi.fn().mockResolvedValue(undefined);
    const refreshRunSummary = vi.fn();
    // The shared handler, exactly as App wires it onto both gates.
    const sharedRecordOutcome = async (
      item: GTMItem,
      outcome: { outcomeKind: string; value?: number },
    ) => {
      const ids = item as { joinKey?: unknown; gtmActionId?: unknown };
      const joinKey = typeof ids.joinKey === "string" && ids.joinKey
        ? ids.joinKey
        : typeof ids.gtmActionId === "string" ? ids.gtmActionId : "";
      if (!joinKey) return;
      await recordOutcomeApi({ joinKey, outcomeKind: outcome.outcomeKind });
      refreshRunSummary();
    };
    render(<GateReview items={sentItem} onSubmit={onSubmit} learned={0} onRecordOutcome={sharedRecordOutcome} />);

    fireEvent.click(screen.getByRole("button", { name: /Approve & release/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: /Record what happened/i }));
    fireEvent.click(screen.getByRole("button", { name: /^signup$/ }));

    await waitFor(() => expect(recordOutcomeApi).toHaveBeenCalledTimes(1));
    // The gtmActionId became the joinKey — not dropped as the old joinKey-only inline handler did.
    expect(recordOutcomeApi).toHaveBeenCalledWith({ joinKey: "gtm-abc", outcomeKind: "signup" });
    // And the summary re-read — the second half the divergent copy never did.
    expect(refreshRunSummary).toHaveBeenCalledTimes(1);
  });

  it("offers no outcome door when the item carries no provenance id at all", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onRecordOutcome = vi.fn().mockResolvedValue(undefined);
    // No id, no gtmActionId, no joinKey — nothing to join an outcome back on.
    render(<GateReview items={[{ type: "draft", subject: "Orphan", draft: "no ids here" }]} onSubmit={onSubmit} learned={0} onRecordOutcome={onRecordOutcome} />);

    fireEvent.click(screen.getByRole("button", { name: /Approve & release/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /Record what happened/i })).toBeNull();
  });
});

describe("GateReview failed submit (the Phase 1 busy/error fix)", () => {
  it("locks the actions while a submit is in flight, then unlocks", async () => {
    // A submit we resolve by hand so we can observe the in-flight (busy) window.
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((res) => { resolveSubmit = res; }));
    render(<GateReview items={items} onSubmit={onSubmit} learned={0} />);

    const approveButtons = screen.getAllByRole("button", { name: /Approve & release/i });
    fireEvent.click(approveButtons[0]);

    // While in flight, the still-undecided second card's actions are disabled (busy lock).
    await waitFor(() => {
      const stillApprove = screen.getByRole("button", { name: /Approve & release/i });
      expect(stillApprove).toBeDisabled();
    });

    resolveSubmit();
    // After it resolves, the founder can act again on the remaining card.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Approve & release/i })).not.toBeDisabled();
    });
  });

  it("reverts the optimistic verdict and surfaces the error when the submit rejects", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("network died"));
    render(<GateReview items={items} onSubmit={onSubmit} learned={0} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Approve & release/i })[0]);

    // The failure is shown to the founder, not swallowed…
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/network died/i);
    });

    // …and the card is actionable again — both cards still offer Approve (nothing was released).
    expect(screen.getAllByRole("button", { name: /Approve & release/i })).toHaveLength(2);
    // The optimistic "Approved" verdict was rolled back — no card shows it.
    expect(screen.queryByText(/^Approved$/)).toBeNull();
  });
});
