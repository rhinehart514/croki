import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ConversationReplyResult, DriveTeammateResult } from "@/api";
import { targetBet, targetWork } from "@/components/firm/directionTarget";
import type { FirmConfiguration, FirmConfiguredAgent } from "@/types";
import { NowComposer } from "./NowComposer";

const driveTeammate = vi.fn<(...args: unknown[]) => Promise<DriveTeammateResult>>();
const replyInConversation = vi.fn<(...args: unknown[]) => Promise<ConversationReplyResult>>();
const putFirmConfiguration = vi.fn();
const stopActiveDrive = vi.fn();
vi.mock("@/api", () => ({
  driveTeammate: (...args: unknown[]) => driveTeammate(...args),
  replyInConversation: (...args: unknown[]) => replyInConversation(...args),
  putFirmConfiguration: (...args: unknown[]) => putFirmConfiguration(...args),
  stopActiveDrive: (...args: unknown[]) => stopActiveDrive(...args),
}));

const runningDrive = {
  id: "drive-1", ventureId: "v1", teammateRef: "t1", betId: "b1", runtime: "codex",
  startedAt: "2026-01-01T00:00:00Z", abortSupported: true, abortRequestedAt: null, activity: "Editing WorkSurface.tsx",
} as const;

const mara: FirmConfiguredAgent = {
  ref: "mara", name: "Mara", label: "Specialist", perspective: "Find the sharpest market proof.",
  activation: "direct", capabilities: { firmTools: true, additional: [] }, context: { scope: "venture", instructions: null },
  memory: { scope: "venture-soul", instructions: null }, runtime: { provider: "codex", model: null },
  budget: { maxSteps: null, dailySpendUsd: null }, authority: { outwardEffects: "wall" }, evaluation: { signals: [], instructions: null },
};
const configuration: FirmConfiguration = {
  id: "firm", schemaVersion: 1, revision: 3,
  presentation: { participant: "specialist", participantLabel: "agent", collectiveLabel: "agents" },
  defaults: { runtime: null, model: null, maxSteps: 24 }, organization: { shape: "flat", instructions: null, relationships: [] },
  coordination: { mode: "adaptive", coordinatorRef: null, protocols: [], stopWhen: [] },
  authority: { outwardEffects: "wall", configurationChanges: "founder" }, agents: [mara],
};

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
    window.localStorage.clear();
    driveTeammate.mockReset();
    replyInConversation.mockReset();
    putFirmConfiguration.mockReset();
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

  it("attaches, previews, removes, and submits multiple images in one turn", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:images" } as ConversationReplyResult);
    const { container } = render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: null, workRef: null, teammateRefs: [], threadRef: "thread:images" }} scopeLabel="Visual audit" hasWork variant="dock" submissionMode="work" runtimeOverride="codex" />);
    const png = new File([new Uint8Array([137, 80, 78, 71])], "first.png", { type: "image/png" });
    const jpeg = new File([new Uint8Array([255, 216, 255])], "second.jpg", { type: "image/jpeg" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [png, jpeg] } });
    expect(await screen.findByAltText("first.png")).toBeVisible();
    expect(screen.getByAltText("second.jpg")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove first.png" }));
    expect(screen.queryByAltText("first.png")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Compare this with the current UI" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", expect.objectContaining({
      message: "Compare this with the current UI",
      images: [expect.objectContaining({ name: "second.jpg", mediaType: "image/jpeg" })],
      threadRef: "thread:images",
      mode: "work",
      runtime: "codex",
    })));
  });

  it("accepts an image-only turn with an honest default instruction", async () => {
    replyInConversation.mockResolvedValue({ act: "answer", accepted: true } as ConversationReplyResult);
    const { container } = render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork variant="dock" submissionMode="conversation" />);
    const png = new File([new Uint8Array([137, 80, 78, 71])], "screen.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [png] } });
    expect(await screen.findByAltText("screen.png")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", expect.objectContaining({ message: "Look at this image.", images: [expect.objectContaining({ name: "screen.png" })] })));
  });

  it("mentions an existing agent with @ and sends its exact ref", async () => {
    driveTeammate.mockResolvedValue(result({ handoff: handoff({ openedBetIds: ["b-agent"] }) }));
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork variant="dock" configuration={configuration} />);
    const field = screen.getByLabelText(/Say what you want/);
    fireEvent.change(field, { target: { value: "@Mar" } });
    fireEvent.click(screen.getByRole("option", { name: /Mara/ }));
    expect(field).toHaveValue("@Mara ");
    fireEvent.change(field, { target: { value: "@Mara audit the onboarding proof" } });
    fireEvent.click(screen.getByRole("button", { name: "Start work" }));
    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      goal: "@Mara audit the onboarding proof", teammateRefs: ["mara"],
    }));
  });

  it("scopes with @ to a real repo file as a chip and sends the exact path", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:file" } as ConversationReplyResult);
    const { container } = render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork variant="dock" submissionMode="work"
      repositoryFiles={["ui/src/components/work-mode/WorkSurface.tsx", "ui/src/components/thread/ThreadMessage.tsx", "brain/src/firm/work-loop.mjs"]} />);
    const field = screen.getByLabelText(/Say what you want/);
    fireEvent.change(field, { target: { value: "fix @WorkSurf" } });
    // The basename match is offered and named a File, never by icon alone.
    const option = screen.getByRole("option", { name: /WorkSurface\.tsx/ });
    expect(option).toHaveTextContent("File");
    fireEvent.click(option);
    // The founder reads a compact chip token, and the chip layer names the exact file it stands for.
    expect(field).toHaveValue("fix @WorkSurface.tsx ");
    expect(container.querySelector('.now-composer-mention-backdrop mark')).toHaveAttribute("title", "ui/src/components/work-mode/WorkSurface.tsx");
    // At send the chip expands: the agent reads the literal repo-relative path.
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", expect.objectContaining({
      message: "fix ui/src/components/work-mode/WorkSurface.tsx", mode: "work",
    })));
  });

  it("deletes a file chip as one unit on Backspace at its end", async () => {
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork variant="dock" submissionMode="work"
      repositoryFiles={["ui/src/components/work-mode/WorkSurface.tsx"]} />);
    const field = screen.getByLabelText<HTMLTextAreaElement>(/Say what you want/);
    fireEvent.change(field, { target: { value: "fix @WorkSurf" } });
    fireEvent.click(screen.getByRole("option", { name: /WorkSurface\.tsx/ }));
    expect(field).toHaveValue("fix @WorkSurface.tsx ");
    // One Backspace at the token's end removes the whole reference, never a trailing character of it.
    field.setSelectionRange("fix @WorkSurface.tsx".length, "fix @WorkSurface.tsx".length);
    fireEvent.keyDown(field, { key: "Backspace" });
    expect(field).toHaveValue("fix  ");
  });

  it("keeps a draft and its attachments across a full remount — restart survival", async () => {
    const { container, unmount } = render(<NowComposer ventureId="v1" ventureName="Acme" selection={targetBet("bet-1")} scopeLabel="First direction" hasWork variant="dock" />);
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Draft that survives a restart" } });
    const png = new File([new Uint8Array([137, 80, 78, 71])], "kept.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [png] } });
    expect(await screen.findByAltText("kept.png")).toBeVisible();
    // Unmount flushes presentation memory; a fresh mount (a new app session) reads it back.
    unmount();
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={targetBet("bet-1")} scopeLabel="First direction" hasWork variant="dock" />);
    expect(screen.getByLabelText(/Say what you want/)).toHaveValue("Draft that survives a restart");
    expect(screen.getByAltText("kept.png")).toBeVisible();
  });

  it("requests an honest interrupt of the running drive and keeps the draft to steer with", async () => {
    stopActiveDrive.mockResolvedValue({ drive: { ...runningDrive, abortRequestedAt: "2026-01-01T00:01:00Z" } });
    const onDriven = vi.fn();
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: "b1", workRef: null, teammateRefs: [] }} scopeLabel={null} hasWork variant="dock" submissionMode="work" activeDrive={runningDrive} onDriven={onDriven} />);
    // The live line reflects the drive's real reported activity, not invented prose.
    expect(screen.getByText("Editing WorkSurface.tsx")).toBeInTheDocument();
    const field = screen.getByLabelText(/Say what you want/);
    fireEvent.change(field, { target: { value: "actually use the other endpoint" } });
    // A typed draft during a live run earns the quiet promise of where it will land — never a block.
    expect(screen.getByText("Your message will reach the running agent.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop the current step" }));
    await waitFor(() => expect(stopActiveDrive).toHaveBeenCalledWith("v1", "drive-1"));
    expect(onDriven).toHaveBeenCalled();
    // The correction the founder typed is preserved so they can send it the moment the step ends.
    expect(field).toHaveValue("actually use the other endpoint");
  });

  it("shows no stop control for a drive the host cannot interrupt", () => {
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: "b1", workRef: null, teammateRefs: [] }} scopeLabel={null} hasWork variant="dock" submissionMode="work" activeDrive={{ ...runningDrive, abortSupported: false }} />);
    expect(screen.queryByRole("button", { name: "Stop the current step" })).toBeNull();
  });

  it("keeps the @ menu agent-only when no repository files are supplied", async () => {
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork variant="dock" configuration={configuration} />);
    const field = screen.getByLabelText(/Say what you want/);
    fireEvent.change(field, { target: { value: "@Work" } });
    expect(screen.getByRole("listbox")).toHaveAccessibleName("Mention an agent");
    expect(screen.queryByText("File")).toBeNull();
  });

  it("opens the same creation form from /add-agent and inserts the new mention", async () => {
    putFirmConfiguration.mockImplementation(async (_ventureId, _revision, next: FirmConfiguration) => ({ configuration: { ...next, revision: 4 } }));
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork variant="dock" configuration={{ ...configuration, agents: [] }} onDriven={() => {}} />);
    const field = screen.getByLabelText(/Say what you want/);
    fireEvent.change(field, { target: { value: "/add-agent" } });
    fireEvent.click(screen.getByRole("option", { name: /Create an agent/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Research Lead" } });
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Ground decisions in customer evidence." } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(field).toHaveValue("@Research Lead "));
    expect(putFirmConfiguration).toHaveBeenCalledWith("v1", 3, expect.objectContaining({ agents: [expect.objectContaining({ ref: "research-lead" })] }), "Created Research Lead");
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

  it("sends the bounded Product and GTM reasoning effort", async () => {
    replyInConversation.mockResolvedValue({ act: "answer", accepted: true } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork
      variant="dock" submissionMode="product-gtm" effortOverride="medium" onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Find the strategic mismatch" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Find the strategic mismatch", mode: "context", effort: "medium",
    }));
  });

  it("carries the exact provisional model branch into a correction", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:model" } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: "bet-1", workRef: "view-one", teammateRefs: [], threadRef: "thread:model" }} scopeLabel="Ecosystem direction" hasWork variant="dock" submissionMode="work" productGtmView modelBranchRef="model-branch:branch-one" onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Keep this unresolved until evidence returns" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Keep this unresolved until evidence returns", betId: "bet-1", workRef: "view-one", modelBranchRef: "model-branch:branch-one",
      threadRef: "thread:model", mode: "work", productGtmView: true,
    }));
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

  it("carries the focused walkthrough step of a drafted play as the correction's exact subject", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:play" } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} subjectRefs={["object:play-1"]} scopeLabel="Founder proof loop" hasWork variant="dock" submissionMode="conversation"
      workflowStep={{ ref: "workflow:play-1:prepare", id: "prepare", label: "Prepare the story", position: 2, count: 5 }} onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Lead with the customer's own numbers" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    // The play arrives as the thread subject, the step's stable graph id rides alongside it, and the
    // turn is a play revision (workflowSketch) — never a fabricated step object id.
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Lead with the customer's own numbers",
      subjectRefs: ["object:play-1", "workflow:play-1:prepare"],
      workflowStep: { id: "prepare", label: "Prepare the story", position: 2 },
      mode: "context",
      workflowSketch: true,
    }));
  });

  it("keeps the focused step on a correction sent into the play's existing thread", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:play" } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: null, workRef: null, teammateRefs: [], threadRef: "thread:play" }} scopeLabel="Founder proof loop" hasWork variant="dock" submissionMode="conversation"
      workflowStep={{ ref: "workflow:play-1:approve", id: "approve", label: "Approve the claim", position: 3, count: 5 }} onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Say what you want/), { target: { value: "Gate this on the pricing page too" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    // An existing thread rejects subjectRefs at the route; the step still travels as structured context.
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Gate this on the pricing page too",
      threadRef: "thread:play",
      workflowStep: { id: "approve", label: "Approve the claim", position: 3 },
      mode: "context",
      workflowSketch: true,
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
  beforeEach(() => { window.localStorage.clear(); driveTeammate.mockReset(); replyInConversation.mockReset(); });

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
