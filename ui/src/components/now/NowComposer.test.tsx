import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ConversationReplyResult, DriveTeammateResult } from "@/api";
import { targetBet, targetWork } from "@/components/firm/directionTarget";
import { NowComposer } from "./NowComposer";

const driveTeammate = vi.fn<(...args: unknown[]) => Promise<DriveTeammateResult>>();
const replyInConversation = vi.fn<(...args: unknown[]) => Promise<ConversationReplyResult>>();
vi.mock("@/api", () => ({
  driveTeammate: (...args: unknown[]) => driveTeammate(...args),
  replyInConversation: (...args: unknown[]) => replyInConversation(...args),
}));

function result(partial: Partial<DriveTeammateResult>): DriveTeammateResult {
  return {
    outcome: {}, work: {}, runtime: { id: "anthropic", label: "Claude", auth: null }, handoff: null,
    ...partial,
  } as DriveTeammateResult;
}

function handoff(changes: { openedBetIds?: string[]; stagedBetIds?: string[]; wallBetIds?: string[] }) {
  return {
    id: "m1", ventureId: "v1", role: "system", kind: "handoff", content: "", teammateRef: null, betId: null,
    changes: { openedBetIds: [], stagedBetIds: [], wallBetIds: [], ...changes }, createdAt: "2026-01-01T00:00:00Z",
  } as DriveTeammateResult["handoff"];
}

async function drive(text: string) {
  const field = screen.getByLabelText(/Say what you want/);
  fireEvent.change(field, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /Start work/ }));
}

describe("NowComposer contextual routing", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    driveTeammate.mockReset();
    replyInConversation.mockReset();
  });

  it("STEERS an existing direction through the conversation when scoped to a bet — not a fresh /drive", async () => {
    replyInConversation.mockResolvedValue({ act: "steer", betId: "bet-1" } as ConversationReplyResult);
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={targetBet("bet-1")} scopeLabel="Reach the first buyers"
        hasWork variant="dock" onDriven={() => {}}
      />,
    );
    const field = screen.getByLabelText(/Say what you want/);
    fireEvent.change(field, { target: { value: "Try a warmer subject line" } });
    fireEvent.click(screen.getByRole("button", { name: /Send to this direction/ }));

    // The turn routes through the ONE venture conversation (steer), carrying the scoped bet.
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", { message: "Try a warmer subject line", betId: "bet-1" }));
    // /drive is reserved for starting/branching — it must NOT fire for a steer.
    expect(driveTeammate).not.toHaveBeenCalled();
    // And the founder gets an honest receipt of the routed act.
    expect(await screen.findByText(/Your steer is in/)).toBeTruthy();
  });

  it("DIRECTS the venture through /drive when unscoped (starting work)", async () => {
    driveTeammate.mockResolvedValue(result({ handoff: handoff({ openedBetIds: ["b1"] }) }));
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork={false}
        onDriven={() => {}}
      />,
    );
    const field = screen.getByLabelText(/Say what you want/);
    fireEvent.change(field, { target: { value: "Find the first 20 customers" } });
    fireEvent.click(screen.getByRole("button", { name: /Start work/ }));

    await waitFor(() => expect(driveTeammate).toHaveBeenCalled());
    expect(replyInConversation).not.toHaveBeenCalled();
  });

  it("targets one selected SDK agent explicitly", async () => {
    driveTeammate.mockResolvedValue(result({ handoff: handoff({ openedBetIds: ["b-agent"] }) }));
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme"
        selection={{ betId: null, workRef: null, teammateRefs: ["mara"] }}
        scopeLabel="Mara" hasWork variant="dock" submissionMode="auto"
        runtimeOverride="claude-code" onDriven={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Plan the founder outbound campaign" } });
    fireEvent.click(screen.getByRole("button", { name: "Start work" }));

    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      goal: "Plan the founder outbound campaign",
      teammateRef: "mara",
      runtime: "claude-code",
    }));
    expect(replyInConversation).not.toHaveBeenCalled();
  });

  it("keeps the thread composer on the nonblocking conversation surface", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:one" } as ConversationReplyResult);
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme"
        selection={{ betId: null, workRef: null, teammateRefs: [], threadRef: "thread:one" }}
        scopeLabel="Audit the shell" hasWork variant="dock" submissionMode="conversation" onDriven={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Stop Claude" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", { message: "Stop Claude", threadRef: "thread:one", mode: "context" }));
    expect(driveTeammate).not.toHaveBeenCalled();
  });

  it("hands a contextual work direction to its exact Work thread", async () => {
    const onWorkRouted = vi.fn();
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:work-one" } as ConversationReplyResult);
    render(
      <NowComposer ventureId="v1" ventureName="Acme" selection={null} subjectRefs={["object:pipeline"]}
        scopeLabel="Founder insight workflow" hasWork variant="dock" submissionMode="conversation"
        workflowSketch onDriven={() => {}} onWorkRouted={onWorkRouted} />,
    );
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Implement the workflow repair" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(onWorkRouted).toHaveBeenCalledWith("thread:work-one"));
    expect(replyInConversation).toHaveBeenCalledWith("v1", { message: "Implement the workflow repair", subjectRefs: ["object:pipeline"], mode: "context", workflowSketch: true });
  });

  it("starts an immediate coding turn in Work with the selected model", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:one" } as ConversationReplyResult);
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme"
        selection={{ betId: "bet-1", workRef: null, teammateRefs: [], threadRef: "thread:one" }}
        scopeLabel="Build the shell" hasWork variant="dock" submissionMode="work"
        runtimeOverride="codex" modelOverride="gpt-5.4" onDriven={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Collapse the workbench" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Collapse the workbench", betId: "bet-1", threadRef: "thread:one", mode: "work", runtime: "codex", model: "gpt-5.4",
    }));
    expect(driveTeammate).not.toHaveBeenCalled();
  });

  it("keeps the submitted prompt visible as it leaves for Product and GTM agents", async () => {
    let resolveReply!: (value: ConversationReplyResult) => void;
    replyInConversation.mockImplementation(() => new Promise((resolve) => { resolveReply = resolve; }));
    const { container } = render(
      <NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork
        variant="dock" submissionMode="product-gtm" workflowSketch onDriven={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Shape the launch evidence loop" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));

    expect(container.querySelector(".now-composer")).toHaveAttribute("data-launching", "true");
    expect(container.querySelector(".now-composer")).toHaveAttribute("data-submission-mode", "product-gtm");
    expect(container.querySelector(".now-composer-flight")).toHaveTextContent("Shape the launch evidence loop");
    resolveReply({ act: "answer", accepted: true } as ConversationReplyResult);
    await waitFor(() => expect(replyInConversation).toHaveBeenCalled());
  });

  it("revises the exact provisional Product / GTM graph in its Work thread", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:workflow" } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: "bet-1", workRef: "workflow-one", teammateRefs: [], threadRef: "thread:workflow" }} scopeLabel="Customer return loop" hasWork variant="dock" submissionMode="work" workflowSketch onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Wait seven days before taking the silence branch" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Wait seven days before taking the silence branch", betId: "bet-1", workRef: "workflow-one",
      threadRef: "thread:workflow", mode: "work", workflowSketch: true,
    }));
  });

  it("sends a selected artifact section as structured context while preserving the founder message", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:artifact" } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: "bet-1", workRef: "artifact-one", teammateRefs: [], threadRef: "thread:artifact" }} scopeLabel="Launch brief" hasWork variant="dock" submissionMode="work" artifactSection={{ artifactRef: "work:artifact-one", artifactTitle: "Launch brief", artifactAt: "2026-07-20T12:00:00.000Z", sectionId: "0:Channel W", sectionTitle: "Channel W", sectionIndex: 0 }} onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Use founder introductions before cold outreach" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Use founder introductions before cold outreach",
      betId: "bet-1",
      workRef: "artifact-one",
      threadRef: "thread:artifact",
      mode: "work",
      artifactSection: { title: "Channel W", index: 0 },
    }));
    expect(await screen.findByText("Revision sent to this Thread")).toBeVisible();
  });

  it("CORRECTS exact work through /drive without dropping its work reference", async () => {
    driveTeammate.mockResolvedValue(result({ handoff: handoff({ stagedBetIds: ["bet-1"] }) }));
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={targetWork("bet-1", "work-1")}
        scopeLabel="Reach the first buyers / Outreach draft" hasWork variant="dock" onDriven={() => {}}
      />,
    );
    const field = screen.getByLabelText(/Say what you want/);
    fireEvent.change(field, { target: { value: "Make the opening more specific" } });
    fireEvent.click(screen.getByRole("button", { name: "Correct this work" }));

    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      goal: "Make the opening more specific", betId: "bet-1", workRef: "work-1",
    }));
    expect(replyInConversation).not.toHaveBeenCalled();
  });

  it("continues an object-scoped thought through its durable thread instead of minting a sibling", async () => {
    driveTeammate.mockResolvedValue(result({ handoff: handoff({}) }));
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme"
        selection={{
          betId: null, workRef: null, teammateRefs: [], threadRef: "thread:thought-1",
          architectureId: "onboarding", architectureStepId: null, architectureRevision: 4,
        }}
        scopeLabel="Remove setup friction" hasWork variant="dock" onDriven={() => {}}
      />,
    );
    const field = screen.getByLabelText(/Say what you want/);
    fireEvent.change(field, { target: { value: "Try the zero-config version" } });
    fireEvent.click(screen.getByRole("button", { name: "Start work" }));

    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      goal: "Try the zero-config version",
      threadRef: "thread:thought-1",
      architectureTarget: { id: "onboarding", stepId: null, revision: 4 },
    }));
  });

  it("keeps unsent drafts attached to the scope where they were written", () => {
    const { rerender } = render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={targetBet("bet-1")}
        scopeLabel="First direction" hasWork variant="dock"
      />,
    );
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Draft for the first direction" } });

    rerender(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={targetBet("bet-2")}
        scopeLabel="Second direction" hasWork variant="dock"
      />,
    );
    expect(screen.getByLabelText(/Say what you want/)).toHaveValue("");
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Draft for the second direction" } });

    rerender(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={targetBet("bet-1")}
        scopeLabel="First direction" hasWork variant="dock"
      />,
    );
    expect(screen.getByLabelText(/Say what you want/)).toHaveValue("Draft for the first direction");
  });

  it("keeps contextual new-thread drafts attached to their semantic subject", () => {
    const { rerender } = render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} subjectRefs={["object:one"]} scopeLabel={null} hasWork variant="dock" submissionMode="conversation" />);
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Draft for object one" } });
    rerender(<NowComposer ventureId="v1" ventureName="Acme" selection={null} subjectRefs={["object:two"]} scopeLabel={null} hasWork variant="dock" submissionMode="conversation" />);
    expect(screen.getByLabelText(/Say what you want/)).toHaveValue("");
    rerender(<NowComposer ventureId="v1" ventureName="Acme" selection={null} subjectRefs={["object:one"]} scopeLabel={null} hasWork variant="dock" submissionMode="conversation" />);
    expect(screen.getByLabelText(/Say what you want/)).toHaveValue("Draft for object one");
  });
});

describe("NowComposer post-submit receipt", () => {
  beforeEach(() => { driveTeammate.mockReset(); replyInConversation.mockReset(); });

  it("replaces the black box with a composed receipt and a way in", async () => {
    driveTeammate.mockResolvedValue(result({ handoff: handoff({ stagedBetIds: ["b1"] }) }));
    const onOpenResult = vi.fn();
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork={false}
        onDriven={() => {}} onOpenResult={onOpenResult}
      />,
    );
    await drive("Ship the onboarding fix");

    // The old dead status line is gone; a real receipt of what landed takes its place.
    expect(await screen.findByText("A change is ready to review.")).toBeTruthy();
    expect(screen.queryByText(/Work started/)).toBeNull();

    // And there is a concrete way into the resulting direction, carrying the bet the drive landed on.
    const open = screen.getByRole("button", { name: /Open this direction/ });
    fireEvent.click(open);
    expect(onOpenResult).toHaveBeenCalledWith("b1");
  });

  it("points at judgment when the drive paused for a decision", async () => {
    driveTeammate.mockResolvedValue(result({ outcome: { kind: "paused" }, handoff: handoff({ wallBetIds: ["b2"] }) }));
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork={false}
        onDriven={() => {}} onOpenResult={() => {}}
      />,
    );
    await drive("Reach the first 20 customers");

    expect(await screen.findByText(/decision that's yours/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Make the decision/ })).toBeTruthy();
  });

  it("omits the open action in the docked composer (already inside the direction)", async () => {
    driveTeammate.mockResolvedValue(result({ handoff: handoff({ openedBetIds: ["b3"] }) }));
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={null} scopeLabel="Ship the onboarding fix" hasWork
        variant="dock" onDriven={() => {}}
      />,
    );
    await drive("Try a warmer tone");

    expect(await screen.findByText("A new approach is underway.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open this direction/ })).toBeNull();
  });
});
