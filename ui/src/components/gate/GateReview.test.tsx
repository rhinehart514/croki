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
