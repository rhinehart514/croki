import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WallQueueItemView } from "@/api";
import { FirmWallReview } from "./FirmWallReview";

function item(overrides: Partial<WallQueueItemView>): WallQueueItemView {
  return {
    id: "wall-private-id",
    ventureId: "venture-private-id",
    betId: "bet-private-id",
    purpose: "release",
    blocksBet: true,
    effect: {},
    parkedAt: "2026-07-01T00:00:00.000Z",
    decision: null,
    ...overrides,
  };
}

describe("FirmWallReview", () => {
  it("shows a release as its destination and draft without exposing routing machinery", () => {
    render(<FirmWallReview items={[item({
      effect: {
        kind: "send",
        to: "founder@example.com",
        subject: "A smaller first step",
        body: "Would a fifteen-minute review be useful?",
        joinKey: "join-secret-123",
        providerEventId: "provider-secret-456",
        runtime: { provider: "private-provider", token: "credential-secret" },
      },
    })]} onDecide={vi.fn()} />);

    expect(screen.getAllByText("Ready to send")).toHaveLength(2);
    expect(screen.getAllByText("A smaller first step")).toHaveLength(2);
    expect(screen.getByText("founder@example.com")).toBeTruthy();
    expect(screen.getByText("Would a fifteen-minute review be useful?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Release" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();

    const surface = document.body.textContent ?? "";
    expect(surface).not.toMatch(/wall-private|venture-private|bet-private|join-secret|provider-secret|credential-secret|private-provider/i);
    expect(surface).not.toMatch(/join key|provider event|runtime|kind/i);
  });

  it("shows the reviewed patch and makes approval a separate act before apply", async () => {
    const change = item({
      effect: {
        kind: "product-change",
        workspaceId: "workspace-private-id",
        revisionId: "revision-private-id",
        diffStat: "1 file changed, 1 insertion(+), 1 deletion(-)",
        diff: "--- a/pricing.tsx\n+++ b/pricing.tsx\n@@ -1 +1 @@\n-$29\n+$39\n",
        worktree: "/private/tmp/internal-worktree",
        branch: "dogfood/internal-branch",
      },
    });
    const onDecide = vi.fn().mockResolvedValue(undefined);
    const onInspectProductChange = vi.fn().mockResolvedValue({
      ready: false,
      status: "proposed",
      reasons: ["The change set is not approved."],
    });
    const onApproveProductChange = vi.fn().mockResolvedValue({ ready: true, status: "approved", reasons: [] });

    render(
      <FirmWallReview
        items={[change]}
        onDecide={onDecide}
        onInspectProductChange={onInspectProductChange}
        onApproveProductChange={onApproveProductChange}
      />,
    );

    expect(await screen.findByRole("button", { name: "Approve change" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apply change" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Release" })).toBeNull();
    expect(screen.getByText(/does not commit, push, or deploy/i)).toBeTruthy();
    expect(screen.getByText(/--- a\/pricing\.tsx/)).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Note for Product change ready for review" }), {
      target: { value: "The pricing hierarchy is clear." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve change" }));
    await waitFor(() => expect(onApproveProductChange).toHaveBeenCalledWith(change, "The pricing hierarchy is clear."));

    fireEvent.click(await screen.findByRole("button", { name: "Apply change" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(change, "release", undefined));

    const surface = document.body.textContent ?? "";
    expect(surface).not.toMatch(/workspace-private|revision-private|internal-worktree|internal-branch|\/private\/tmp/i);
  });

  it("lets the founder hear a market outcome in the context of its bet without provenance records", () => {
    render(<FirmWallReview items={[item({
      purpose: "review-outcome",
      blocksBet: false,
      effect: {
        kind: "outcome",
        joinKey: "join-outcome-secret",
        outcome: {
          id: "outcome-private-id",
          ventureId: "venture-outcome-private",
          outcomeKind: "reply",
          body: "This is timely. Can we talk Thursday?",
          providerEventId: "gmail-message-secret",
          providerSourceId: "gmail-thread-secret",
          source: "connected-account-private",
          structural: { channel: "gmail-private", outcomeKind: "reply", joined: true },
          identifying: {
            betId: "bet-nested-private",
            betIntent: "Invite operations leaders to a short working session",
            from: "hidden-identity@example.com",
            body: "This is timely. Can we talk Thursday?",
          },
        },
      },
    })]} onDecide={vi.fn()} />);

    expect(screen.getAllByText("From the market")).toHaveLength(2);
    expect(screen.getAllByText("A reply came back")).toHaveLength(2);
    expect(screen.getByText("This is timely. Can we talk Thursday?")).toBeTruthy();
    expect(screen.getByText("Invite operations leaders to a short working session")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeTruthy();

    const surface = document.body.textContent ?? "";
    expect(surface).not.toMatch(/outcome-private|venture-outcome|join-outcome|gmail-message|gmail-thread|connected-account|gmail-private|bet-nested|hidden-identity/i);
    expect(screen.getByText("Provider-backed join")).toBeTruthy();
    expect(surface).not.toMatch(/structural|identifying|join key/i);
  });

  it("keeps answer notes and end-bet decisions purpose-correct", async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    const answer = item({
      id: "answer-item",
      purpose: "answer",
      effect: { question: "Which audience should we invite first?", joinKey: "hidden-answer-key" },
    });
    const ending = item({
      id: "ending-item",
      purpose: "end-bet",
      effect: { kind: "kill-proposal", reason: "Three rounds produced no replies.", betId: "hidden-effect-bet" },
    });
    render(<FirmWallReview items={[answer, ending]} onDecide={onDecide} />);

    const answerButton = screen.getByRole("button", { name: "Answer" });
    expect((answerButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Note for An agent needs your answer" }), {
      target: { value: "Start with finance leaders." },
    });
    fireEvent.click(answerButton);
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(answer, "answer", "Start with finance leaders."));

    fireEvent.click(screen.getByRole("button", { name: /Ending decisionShould this work end/i }));
    const detail = screen.getByRole("article");
    expect(within(detail).getByText("Three rounds produced no replies.")).toBeTruthy();
    expect(within(detail).getByRole("button", { name: "End this work" })).toBeTruthy();
    expect(within(detail).getByRole("button", { name: "Keep it going" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/hidden-answer|hidden-effect/i);
  });

  it("fails closed when an unknown release has no safe founder-facing description", () => {
    render(<FirmWallReview items={[item({
      effect: {
        kind: "vendor-secret-action",
        opaquePayload: { apiKey: "never-render-this", targetId: "internal-target" },
      },
    })]} onDecide={vi.fn()} />);

    expect(screen.getAllByText("Action ready for review")).toHaveLength(2);
    expect(screen.getByText(/cannot safely describe this action/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Release" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/vendor-secret|never-render|internal-target|opaque payload/i);
  });

  it("retains the queue while showing one purpose-exact detail", () => {
    const release = item({ id: "release", effect: { kind: "send", to: "founder@example.com", body: "One exact note" } });
    const outcome = item({
      id: "outcome", purpose: "review-outcome", blocksBet: false,
      effect: { outcome: { outcomeKind: "reply", body: "Send the export first", joined: false } },
    });
    render(<FirmWallReview items={[release, outcome]} onDecide={vi.fn()} />);

    expect(screen.getByRole("list", { name: "Items waiting for your decision" })).toBeTruthy();
    expect(screen.getByText("One exact note")).toBeTruthy();
    expect(screen.queryByText("Send the export first")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /From the market/i }));
    expect(screen.getByText("Send the export first")).toBeTruthy();
    expect(screen.getByText("Unattributed return")).toBeTruthy();
    expect(screen.queryByText("One exact note")).toBeNull();
  });

  it("opens the exact wall item requested by its originating work card", () => {
    const first = item({ id: "first", effect: { kind: "send", body: "First held note" } });
    const exact = item({ id: "exact", effect: { kind: "send", body: "Exact held note" } });
    render(<FirmWallReview items={[first, exact]} preferredItemId="exact" onDecide={vi.fn()} />);

    expect(screen.getByText("Exact held note")).toBeTruthy();
    expect(screen.queryByText("First held note")).toBeNull();
  });

  it("accepts only one decision while the first request is in flight", async () => {
    let settle!: () => void;
    const onDecide = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { settle = resolve; }));
    render(<FirmWallReview items={[item({ effect: { kind: "send", body: "Held note" } })]} onDecide={onDecide} />);

    const reject = screen.getByRole("button", { name: "Reject" });
    fireEvent.click(reject);
    fireEvent.click(reject);

    expect(onDecide).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(reject).toBeDisabled());
    settle();
    await waitFor(() => expect(reject).toBeEnabled());
  });

  it("keeps every consequential action disabled while the projection is read-only", () => {
    render(<FirmWallReview items={[item({ effect: { kind: "send", body: "Held note" } })]} onDecide={vi.fn()} readOnly />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Release" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("keeps deploy authorization separate from the outward release", () => {
    const deploy = item({ effect: { kind: "deploy", destination: "production", body: "Publish the reviewed build", deployContract: { command: "npm run deploy", definition: "vercel --prod", destination: "production" } } });
    const view = render(<FirmWallReview items={[deploy]} onDecide={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Authorize deploy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Release" })).toBeNull();

    view.rerender(<FirmWallReview items={[{ ...deploy, deployAuthorizedAt: "2026-07-01T00:01:00.000Z" }]} onDecide={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Release" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Authorize deploy" })).toBeNull();
  });
});
