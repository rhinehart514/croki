import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmConversationMessage, FirmLens } from "@/types";
import { ConversationFeed } from "./ConversationFeed";

const lens: FirmLens = {
  ventureId: "venture-1",
  crew: [{ ref: "sable", summonedAt: "2026-07-01T09:00:00.000Z", soul: { name: "Sable" } }],
  bets: [{
    id: "bet-1", ventureId: "venture-1", intent: "Find a repeatable outbound motion",
    forkedFrom: null, teammateRef: "sable", refs: [], evidence: [], staged: [], joinKey: "join-1",
    createdAt: "2026-07-01T09:30:00.000Z", updatedAt: "2026-07-01T09:30:00.000Z",
    endedAt: null, endedBy: null, learning: null, position: "live", stagedCount: 0, latestOutcome: null,
    events: [{ type: "bet_forked", detail: "Find a repeatable outbound motion", at: "2026-07-01T09:30:00.000Z" }],
  }],
  wall: { count: 0, oldestParkedAt: null },
  placement: { positions: {}, revision: 0 },
};

const messages: FirmConversationMessage[] = [
  {
    id: "message-1", ventureId: "venture-1", role: "founder", content: "Find the first buyer.",
    teammateRef: "sable", betId: null, createdAt: "2026-07-01T10:00:00.000Z",
  },
  {
    id: "message-2", ventureId: "venture-1", role: "teammate", content: "I found three segments worth testing.",
    teammateRef: "sable", betId: "bet-1", createdAt: "2026-07-01T10:01:00.000Z",
  },
];

function renderFeed(
  feedMessages = messages,
  overrides: Partial<React.ComponentProps<typeof ConversationFeed>> = {},
) {
  return render(<ConversationFeed
    lens={lens}
    messages={feedMessages}
    selection={null}
    driving={null}
    onSelectBet={vi.fn()}
    onOpenWall={vi.fn()}
    onConfigurationChanged={vi.fn()}
    {...overrides}
  />);
}

describe("ConversationFeed", () => {
  it("renders founder direction and teammate speech as chat while retaining venture activity", () => {
    renderFeed();

    expect(screen.getByRole("list", { name: "Conversation messages" })).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("Find the first buyer.")).toBeTruthy();
    expect(screen.getByText("I found three segments worth testing.")).toBeTruthy();
    expect(screen.getByLabelText("Refine this direction act"))
      .toHaveTextContent(/act.*refine this direction.*what changed.*three segments.*receipt.*repeatable outbound motion/i);
    expect(screen.getByText("to Sable")).toBeTruthy();
    expect(screen.getByText("Find the first buyer.").closest("li"))
      .toHaveAttribute("data-message-id", "message-1");
    expect(screen.getByText("Find the first buyer.").closest("li")).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByText("Find a repeatable outbound motion").length).toBeGreaterThan(0);
    expect(screen.getByText("Work log")).toBeTruthy();
    expect(screen.getByText("Work began")).toBeTruthy();
  });

  it("keeps agent-authored directions honest instead of attributing them to the founder", () => {
    renderFeed([{
      ...messages[0], id: "message-agent", role: "agent", content: "Continue the winning angle.",
    }]);

    expect(screen.getByText("Drover agent")).toBeTruthy();
    expect(screen.queryByText("You")).toBeNull();
  });

  it("shows the runtime and configuration provenance on an agent answer", () => {
    renderFeed([{
      ...messages[1],
      id: "message-runtime",
      role: "agent",
      content: "I checked the implementation and staged the result.",
      runtime: { id: "codex", label: "Codex", auth: "chatgpt-login", model: "gpt-5-codex", configurationRevision: 7 },
    }]);

    expect(screen.getByText("Codex")).toBeTruthy();
    expect(screen.getByText("gpt-5-codex")).toBeTruthy();
    expect(screen.getByText("Configuration v7")).toBeTruthy();
    expect(screen.getByLabelText("Runtime receipt")).toHaveTextContent(/receipt.*codex.*gpt-5-codex.*configuration v7/i);
  });

  it("keeps an involved participant's protocol and requester legible without another workflow surface", () => {
    renderFeed([{
      ...messages[1],
      id: "message-consult",
      teammateRef: "auditor",
      content: "The claim needs independent evidence.",
      coordination: {
        requestedBy: "sable",
        protocol: "red-team",
        question: "What would break this conclusion?",
      },
    }], {
      lens: {
        ...lens,
        crew: [...lens.crew, { ref: "auditor", summonedAt: "2026-07-01T09:05:00.000Z", soul: { name: "Auditor" } }],
      },
    });

    expect(screen.getByText("Auditor")).toBeTruthy();
    expect(screen.getByText("red team · asked by Sable")).toBeTruthy();
  });

  it("brings durable pre-chat speak events into the conversation without duplicating them as activity", () => {
    const legacyLens: FirmLens = {
      ...lens,
      bets: [{
        ...lens.bets[0],
        events: [
          ...(lens.bets[0].events ?? []),
          { type: "speak", detail: "I already narrowed this to two buyers.", at: "2026-07-01T09:45:00.000Z" },
        ],
      }],
    };
    renderFeed([], { lens: legacyLens });

    expect(screen.getByRole("list", { name: "Conversation messages" })).toBeTruthy();
    expect(screen.getByText("I already narrowed this to two buyers.")).toBeTruthy();
    expect(screen.getAllByText("I already narrowed this to two buyers.")).toHaveLength(1);
  });

  it("turns a completed drive into a canvas and wall handoff", () => {
    const onSelectBet = vi.fn();
    const onOpenWall = vi.fn();
    renderFeed([{
      id: "handoff-1",
      ventureId: "venture-1",
      role: "system",
      kind: "handoff",
      content: "Work landed on the canvas — 1 bet opened · 1 waiting at the wall.",
      teammateRef: "sable",
      betId: null,
      changes: { openedBetIds: ["bet-1"], stagedBetIds: [], wallBetIds: ["bet-1"] },
      createdAt: "2026-07-01T10:02:00.000Z",
    }], { onSelectBet, onOpenWall });

    expect(screen.getByLabelText("Work landed on the canvas")).toBeTruthy();
    expect(screen.getByLabelText("Work landed on the canvas").closest("li")).toHaveAttribute("data-message-id", "handoff-1");
    fireEvent.click(screen.getByRole("button", { name: /needs your hand.*find a repeatable outbound motion/i }));
    expect(onSelectBet).toHaveBeenCalledWith("bet-1");
    fireEvent.click(screen.getByRole("button", { name: /review what needs you/i }));
    expect(onOpenWall).toHaveBeenCalledOnce();
  });

  it("keeps first use in the real composer and reports only recorded work in the thread", () => {
    renderFeed([], {
      lens: { ...lens, bets: [] },
      driving: { teammateRef: "sable", teammateName: "Sable", direction: "Find the first buyer", betId: null },
    });

    expect(screen.queryByRole("button", { name: /repeatable path/i })).toBeNull();
    expect(screen.getByLabelText("Current work status")).toHaveTextContent(/direction sent.*no durable work.*find the first buyer/i);
  });

  it("presents externally supplied active work after return and stops only the current work", () => {
    const onStopActiveWork = vi.fn();
    renderFeed([], {
      lens: { ...lens, bets: [{ ...lens.bets[0], work: { spentUsd: 1.25 } }] },
      activeWork: [{
        id: "drive-1",
        teammateRef: "sable",
        betId: "bet-1",
        runtime: "claude-code",
        startedAt: new Date(Date.now() - 65_000).toISOString(),
        abortSupported: true,
        abortRequestedAt: null,
      }],
      onStopActiveWork,
    });

    const currentWork = screen.getByLabelText("Current work");
    expect(currentWork).toHaveTextContent("Work began");
    expect(currentWork).toHaveTextContent("Find a repeatable outbound motion");
    expect(currentWork).toHaveTextContent(/sable.*claude code.*1m 5s elapsed/i);
    expect(currentWork).toHaveTextContent("Stopping keeps this direction and everything already prepared.");
    expect(currentWork).toHaveTextContent("Cost recorded: $1.25");
    fireEvent.click(screen.getByRole("button", { name: "Stop current work" }));
    expect(onStopActiveWork).toHaveBeenCalledWith("drive-1");
    expect(screen.queryByRole("button", { name: /end this work/i })).toBeNull();
  });

  it("does not offer a fabricated stop action when the runtime cannot abort", () => {
    renderFeed([], {
      activeWork: [{
        id: "drive-2",
        teammateRef: "sable",
        betId: null,
        runtime: "codex",
        startedAt: "2026-07-01T10:15:00.000Z",
        abortSupported: false,
        abortRequestedAt: null,
      }],
      onStopActiveWork: vi.fn(),
    });

    expect(screen.getByLabelText("Current work")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop current work" })).toBeNull();
  });

  it("narrows a bet thread while retaining the direction that produced it", () => {
    renderFeed(messages, { selection: { betId: "bet-1", workRef: null, teammateRefs: [] } });
    expect(screen.getByText("Find the first buyer.")).toBeTruthy();
    expect(screen.getByText("I found three segments worth testing.")).toBeTruthy();
  });

  it("removes global configuration from a participant focus and keeps only changes attributable to them", () => {
    const globalReceipt: FirmConversationMessage = {
      id: "receipt-1", ventureId: "venture-1", role: "agent", kind: "configuration-receipt",
      content: "Changed the firm", teammateRef: null, betId: null,
      configurationReceipt: { id: "configuration-2", revision: 2, summary: "Changed the firm", source: "founder" },
      createdAt: "2026-07-01T11:00:00.000Z",
    };
    const sableReceipt: FirmConversationMessage = {
      ...globalReceipt,
      id: "receipt-sable",
      content: "Changed Sable's context",
      teammateRef: "sable",
      configurationReceipt: { ...globalReceipt.configurationReceipt!, summary: "Changed Sable's context" },
    };
    renderFeed([globalReceipt, sableReceipt], { selection: { betId: null, workRef: null, teammateRefs: ["sable"] } });

    expect(screen.queryByText("Changed the firm")).toBeNull();
    expect(screen.getByRole("article", { name: "Venture configuration receipt" })).toHaveTextContent("Changed Sable's context");
  });

  it("keeps the configuration receipt that formed a selected bet", () => {
    const receipt: FirmConversationMessage = {
      id: "receipt-2", ventureId: "venture-1", role: "agent", kind: "configuration-receipt",
      content: "Changed the firm", teammateRef: null, betId: null,
      configurationReceipt: { id: "configuration-2", revision: 2, summary: "The definition that formed this bet", source: "founder" },
      createdAt: "2026-07-01T11:00:00.000Z",
    };
    renderFeed([receipt], {
      lens: { ...lens, bets: [{ ...lens.bets[0], configurationRevision: 2 }] },
      selection: { betId: "bet-1", workRef: null, teammateRefs: [] },
    });

    const article = screen.getByRole("article", { name: "Venture configuration receipt" });
    expect(article).toHaveTextContent("The definition that formed this bet");
    expect(article.closest("li")).toHaveAttribute("data-message-id", "receipt-2");
  });

  it("treats exact work as a strict conversation boundary", () => {
    const exactMessage: FirmConversationMessage = {
      ...messages[1],
      id: "message-exact-work",
      content: "I revised only this durable artifact.",
      target: { betId: "bet-1", workRef: "work-1", teammateRefs: ["sable"] },
    };
    const otherWorkMessage: FirmConversationMessage = {
      ...exactMessage,
      id: "message-other-work",
      content: "This belongs to another artifact.",
      target: { betId: "bet-1", workRef: "work-2", teammateRefs: ["sable"] },
    };
    const configurationReceipt: FirmConversationMessage = {
      id: "receipt-work-neighbor", ventureId: "venture-1", role: "agent", kind: "configuration-receipt",
      content: "The firm definition that formed this bet", teammateRef: null, betId: null,
      configurationReceipt: { id: "configuration-2", revision: 2, summary: "Changed the firm", source: "founder" },
      createdAt: "2026-07-01T11:00:00.000Z",
    };
    renderFeed([configurationReceipt, otherWorkMessage, exactMessage], {
      lens: { ...lens, bets: [{ ...lens.bets[0], configurationRevision: 2 }] },
      selection: { betId: "bet-1", workRef: "work-1", teammateRefs: [] },
    });

    expect(screen.getByText("I revised only this durable artifact.")).toBeTruthy();
    expect(screen.queryByText("This belongs to another artifact.")).toBeNull();
    expect(screen.queryByText("Changed the firm")).toBeNull();
    expect(screen.queryByText("Work log")).toBeNull();
  });

  it("states honestly when exact work has no attached conversation", () => {
    renderFeed(messages, {
      selection: { betId: "bet-1", workRef: "work-without-messages", teammateRefs: [] },
      activeWork: [{
        id: "drive-neighbor", teammateRef: "sable", betId: "bet-1", runtime: "codex",
        startedAt: "2026-07-01T10:15:00.000Z", abortSupported: true, abortRequestedAt: null,
      }],
    });

    expect(screen.getByText("No conversation for this exact work yet")).toBeTruthy();
    expect(screen.getByText(/direction sent below will stay attached to this work identity/i)).toBeTruthy();
    expect(screen.queryByLabelText("Current work")).toBeNull();
  });
});
