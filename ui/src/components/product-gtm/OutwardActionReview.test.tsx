import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketMovementIndex } from "@/types";
import { OutwardActionReview } from "./OutwardActionReview";

const executeOutwardAction = vi.fn(async () => ({}));
const grantOutwardObservation = vi.fn(async () => ({}));
const checkOutwardObservation = vi.fn(async () => ({}));
vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api")>()),
  executeOutwardAction: (...args: unknown[]) => executeOutwardAction(...args),
  grantOutwardObservation: (...args: unknown[]) => grantOutwardObservation(...args),
  checkOutwardObservation: (...args: unknown[]) => checkOutwardObservation(...args),
}));

type Action = MarketMovementIndex["actions"][number];

function action(overrides: Partial<Action> = {}): Action {
  return {
    id: "action-one", ventureId: "venture-one", kind: "deploy", subjectRefs: [], branchRefs: [], motionRefs: [], productDeltaRefs: [], workRefs: [], decisionRef: "decision:one",
    executedAt: null, executorReceipt: null, executionAttempts: [], lastExecutionError: null, needsReconnect: false, observationRefs: [], outcomeRefs: [],
    preparedMaterial: { deployContract: { command: "npm run deploy", destination: "Drover production" } },
    expectedReturn: { source: "http", target: { url: "https://drover.test" }, windowHours: 24, returnConditions: [{ type: "http-status", equals: 200 }] },
    state: "needs-founder", observations: [], latestObservation: null, latestOutcome: null,
    ...overrides,
  };
}

describe("outward action review", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the exact deploy consequence and executes only from its founder control", async () => {
    const onChanged = vi.fn();
    render(<OutwardActionReview ventureId="venture-one" action={action()} readOnly={false} onChanged={onChanged} />);
    expect(screen.getByText("npm run deploy")).toBeInTheDocument();
    expect(screen.getByText("Drover production")).toBeInTheDocument();
    expect(screen.getByText("24 hours, only after you grant it")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deploy now" }));
    await waitFor(() => expect(executeOutwardAction).toHaveBeenCalledWith("venture-one", "action-one"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("keeps silence honest and lets the founder recheck the same bounded source", async () => {
    const observation = { id: "observation-one", actionRef: "outward-action:action-one", source: "http" as const, target: { url: "https://drover.test" }, purpose: "Watch", startsAt: "2026-07-21T12:00:00.000Z", endsAt: "2099-07-22T12:00:00.000Z", returnConditions: [], grantedAt: "2026-07-21T12:00:00.000Z", revokedAt: null, lastCheckedAt: "2026-07-21T13:00:00.000Z", lastResult: { state: "silence" as const, checkedAt: "2026-07-21T13:00:00.000Z", facts: {} } };
    render(<OutwardActionReview ventureId="venture-one" action={action({ state: "silent", executedAt: "2026-07-21T12:00:00.000Z", observationRefs: ["observation:observation-one"], observations: [observation], latestObservation: observation })} readOnly={false} onChanged={vi.fn()} />);
    expect(screen.getByText("No expected return yet")).toBeInTheDocument();
    expect(screen.getByText(/has not interpreted the silence/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check exact return" }));
    await waitFor(() => expect(checkOutwardObservation).toHaveBeenCalledWith("venture-one", "action-one", "observation-one"));
  });

  it("does not imply execution for an unsupported prepared kind", () => {
    render(<OutwardActionReview ventureId="venture-one" action={action({ kind: "founder-interview", preparedMaterial: {}, expectedReturn: null })} readOnly={false} onChanged={vi.fn()} />);
    expect(screen.getByText(/no executor adapter is available yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deploy/i })).not.toBeInTheDocument();
  });

  it("shows the exact recipient and full body of a message at the point of the founder send decision", async () => {
    const body = "Noticed your team is scaling.\n\nWorth a chat this week?";
    render(<OutwardActionReview ventureId="venture-one" action={action({
      kind: "message",
      preparedMaterial: { messageContract: { to: "ada@acme.com", subject: "Quick question", body } },
      expectedReturn: { source: "gmail-thread", windowHours: 24 },
    })} readOnly={false} onChanged={vi.fn()} />);
    expect(screen.getByText("ada@acme.com")).toBeInTheDocument();
    expect(screen.getByText("Quick question")).toBeInTheDocument();
    expect(screen.getByText(/Worth a chat this week\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send this email" }));
    await waitFor(() => expect(executeOutwardAction).toHaveBeenCalledWith("venture-one", "action-one"));
  });

  it("offers the gmail-thread watch only once the send receipt names the exact thread", () => {
    const executed = action({
      kind: "message", executedAt: "2026-07-22T12:00:00.000Z", state: "in-world",
      preparedMaterial: { messageContract: { to: "ada@acme.com", subject: null, body: "Hello" } },
      expectedReturn: { source: "gmail-thread", windowHours: 24 },
      executorReceipt: { adapter: "gmail-message-send", messageId: "gmsg-1", threadId: "gthread-1" },
    });
    render(<OutwardActionReview ventureId="venture-one" action={executed} readOnly={false} onChanged={vi.fn()} />);
    expect(screen.getByText(/exact Gmail thread/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Watch for 24h" })).toBeInTheDocument();
    render(<OutwardActionReview ventureId="venture-one" action={{ ...executed, executorReceipt: { adapter: "gmail-message-send", messageId: "gmsg-1", threadId: null } }} readOnly={false} onChanged={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: "Watch for 24h" })).toHaveLength(1);
  });

  it("keeps an unsendable message honest instead of implying a missing adapter", () => {
    render(<OutwardActionReview ventureId="venture-one" action={action({
      kind: "message",
      preparedMaterial: { messageUnavailableReason: "Name the exact recipient before authorizing this message." },
      expectedReturn: { source: "gmail-thread", windowHours: 24 },
    })} readOnly={false} onChanged={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/exact recipient/);
    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/no executor adapter/i)).not.toBeInTheDocument();
  });

  it("refuses a blind retry after interruption leaves execution uncertain", () => {
    render(<OutwardActionReview ventureId="venture-one" action={action({ state: "execution-unknown", executionLease: { id: "lease-one", startedAt: "2026-07-21T12:00:00.000Z", startedBy: "founder" } })} readOnly={false} onChanged={vi.fn()} />);
    expect(screen.getByText("Deploy needs verification")).toBeInTheDocument();
    expect(screen.getByText(/retry is intentionally disabled/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deploy/i })).not.toBeInTheDocument();
  });
});
