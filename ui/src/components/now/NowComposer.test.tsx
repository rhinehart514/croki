import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ConversationReplyResult, DriveTeammateResult } from "@/api";
import { targetBet, targetWork } from "@/components/firm/directionTarget";
import type { FirmConfiguration, FirmConfiguredAgent } from "@/types";
import { NowComposer } from "./NowComposer";
import { publishTerminalReference } from "@/components/work-mode/terminalReference";
import { addComposerSourceReference } from "./composerSourceReference";
import { composerScopeKey } from "./composerScope";

const driveTeammate = vi.fn<(...args: unknown[]) => Promise<DriveTeammateResult>>();
const replyInConversation = vi.fn<(...args: unknown[]) => Promise<ConversationReplyResult>>();
const putFirmConfiguration = vi.fn();
const stopActiveDrive = vi.fn();
const stageJourneyImport = vi.fn();
const deleteJourneyImport = vi.fn();
const getRuntimeStatuses = vi.fn();
vi.mock("@/api", () => ({
  driveTeammate: (...args: unknown[]) => driveTeammate(...args),
  replyInConversation: (...args: unknown[]) => replyInConversation(...args),
  putFirmConfiguration: (...args: unknown[]) => putFirmConfiguration(...args),
  stopActiveDrive: (...args: unknown[]) => stopActiveDrive(...args),
  stageJourneyImport: (...args: unknown[]) => stageJourneyImport(...args),
  deleteJourneyImport: (...args: unknown[]) => deleteJourneyImport(...args),
  getRuntimeStatuses: (...args: unknown[]) => getRuntimeStatuses(...args),
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
  const field = screen.getByLabelText(/Describe what you want/);
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
    stageJourneyImport.mockReset();
    deleteJourneyImport.mockReset();
    getRuntimeStatuses.mockReset().mockResolvedValue({ runtimes: [] });
  });

  it("STEERS an existing direction through the conversation when scoped to a bet — not a fresh /drive", async () => {
    replyInConversation.mockResolvedValue({ act: "steer", betId: "bet-1" } as ConversationReplyResult);
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={targetBet("bet-1")} scopeLabel="Reach the first buyers"
        hasWork variant="dock" onDriven={() => {}}
      />,
    );
    const field = screen.getByLabelText(/Describe what you want/);
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
    const field = screen.getByLabelText(/Describe what you want/);
    fireEvent.change(field, { target: { value: "Fix the signup return path" } });
    fireEvent.click(screen.getByRole("button", { name: /Start work/ }));

    await waitFor(() => expect(driveTeammate).toHaveBeenCalled());
    expect(replyInConversation).not.toHaveBeenCalled();
  });

  it("places continuous voice words in the current draft and yields cleanly to typing", () => {
    class Recognition {
      static current: Recognition | null = null;
      lang = ""; continuous = false; interimResults = false; maxAlternatives = 0;
      start = vi.fn(); stop = vi.fn(); abort = vi.fn();
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      constructor() { Recognition.current = this; }
    }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = Recognition;
    try {
      render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork variant="dock" submissionMode="conversation" />);
      const field = screen.getByLabelText(/Describe what you want/);
      fireEvent.change(field, { target: { value: "Keep this thought" } });
      fireEvent.click(screen.getByRole("button", { name: "Speak your direction" }));
      expect(screen.getByRole("status")).toHaveTextContent(/Listening/);

      const interim = Object.assign([{ transcript: "and map the product" }], { isFinal: false });
      act(() => Recognition.current?.onresult?.({ results: [interim] }));
      expect(field).toHaveValue("Keep this thought and map the product");

      const completed = Object.assign([{ transcript: "and map the product walk" }], { isFinal: true });
      act(() => Recognition.current?.onresult?.({ results: [completed] }));
      expect(field).toHaveValue("Keep this thought and map the product walk");

      fireEvent.change(field, { target: { value: "Founder-edited final direction" } });
      expect(Recognition.current?.stop).toHaveBeenCalledOnce();
      expect(field).toHaveValue("Founder-edited final direction");
      act(() => Recognition.current?.onresult?.({ results: [Object.assign([{ transcript: "late browser words" }], { isFinal: true })] }));
      expect(field).toHaveValue("Founder-edited final direction");
    } finally {
      delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    }
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
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Compare this with the current UI" } });
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
    const field = screen.getByLabelText(/Describe what you want/);
    expect(field).toHaveAttribute("role", "combobox");
    expect(field).toHaveAttribute("aria-expanded", "false");
    fireEvent.change(field, { target: { value: "@Mar" } });
    expect(field).toHaveAttribute("aria-expanded", "true");
    expect(field).toHaveAttribute("aria-controls", "composer-agent-menu");
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
    const field = screen.getByLabelText(/Describe what you want/);
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

  it("sends a source-bearing repository range as the exact grounded correction", async () => {
    replyInConversation.mockResolvedValue({ act: "steer", accepted: true, threadRef: "thread:source" } as ConversationReplyResult);
    const selection = { betId: null, workRef: null, teammateRefs: [], threadRef: "thread:source" };
    render(<NowComposer ventureId="v1" ventureName="Acme"
      selection={selection}
      scopeLabel={null} hasWork variant="dock" submissionMode="work" />);
    act(() => addComposerSourceReference({
      scopeKey: composerScopeKey("v1", selection),
      path: "src/unchanged-long.ts",
      startLine: 200,
      endLine: 205,
      ref: "repository:src/unchanged-long.ts#L200-L205:abc123def456",
    }));
    const field = screen.getByLabelText(/Describe what you want/);
    expect(field).toHaveValue("@unchanged-long.ts:L200–205 ");
    fireEvent.change(field, { target: { value: "@unchanged-long.ts:L200–205 Make this unchanged contract naming clearer." } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", expect.objectContaining({
      message: "src/unchanged-long.ts#L200-L205 Make this unchanged contract naming clearer.",
      threadRef: "thread:source",
      mode: "work",
    })));
  });

  it("completes an invoked native reference inline and sends it only with that turn", async () => {
    getRuntimeStatuses.mockResolvedValue({
      runtimes: [{
        id: "claude-code",
        label: "Claude",
        connected: true,
        auth: "oauth",
        authLabel: "Claude subscription",
        reason: null,
        capabilities: {
          version: "Agent SDK 9.8.7",
          models: [],
          skills: [{ name: "review", description: "Review exact changes", reference: "/review" }],
          slashCommands: [{ name: "workflows", description: "Inspect native workflow runs", reference: "/workflows" }],
          interactionModes: [{ id: "default", label: "Act" }, { id: "plan", label: "Plan" }],
          planSupported: true,
          update: { state: "unknown", detail: null },
          discovery: { state: "complete", detail: null },
        },
      }],
    });
    replyInConversation.mockResolvedValue({ act: "steer", accepted: true, threadRef: "thread:native" } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme"
      selection={{ betId: null, workRef: null, teammateRefs: [], threadRef: "thread:native" }}
      scopeLabel={null} hasWork variant="dock" submissionMode="work"
      runtimeOverride="claude-code" modelOverride="claude-opus-4-8" effortOverride="max"
      interactionModeOverride="plan" />);

    const field = screen.getByLabelText(/Describe what you want/);
    fireEvent.change(field, { target: { value: "/rev", selectionStart: 4 } });
    fireEvent.keyUp(field, { key: "v" });
    fireEvent.click(await screen.findByRole("option", { name: /\/review.*Review exact changes.*Skill/ }));
    expect(field).toHaveValue("/review ");
    fireEvent.change(field, { target: { value: "/review Inspect the current patch", selectionStart: 33 } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "/review Inspect the current patch",
      threadRef: "thread:native",
      mode: "work",
      runtime: "claude-code",
      model: "claude-opus-4-8",
      effort: "max",
      interactionMode: "plan",
    }));
  });

  it("keeps Codex Skills explicit with dollar-reference completion", async () => {
    getRuntimeStatuses.mockResolvedValue({
      runtimes: [{
        id: "codex",
        label: "Codex",
        connected: true,
        auth: "chatgpt-login",
        authLabel: "ChatGPT subscription",
        reason: null,
        capabilities: {
          version: "codex-cli 5.6.1",
          models: [],
          skills: [{ name: "audit", description: "Audit the repository", reference: "$audit" }],
          slashCommands: [],
          interactionModes: [{ id: "default", label: "Act" }],
          planSupported: false,
          update: { state: "unknown", detail: null },
          discovery: { state: "complete", detail: null },
        },
      }],
    });
    render(<NowComposer ventureId="v1" ventureName="Acme"
      selection={{ betId: null, workRef: null, teammateRefs: [], threadRef: "thread:codex-skill" }}
      scopeLabel={null} hasWork variant="dock" submissionMode="work"
      runtimeOverride="codex" modelOverride="gpt-5.6-sol" effortOverride="high" />);

    const field = screen.getByLabelText(/Describe what you want/);
    expect(screen.queryByText("$audit")).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "$au", selectionStart: 3 } });
    fireEvent.keyUp(field, { key: "u" });
    fireEvent.click(await screen.findByRole("option", { name: /\$audit.*Audit the repository.*Skill/ }));
    expect(field).toHaveValue("$audit ");
  });

  it("attaches selected terminal output as a source-bearing correction in the same Thread", async () => {
    replyInConversation.mockResolvedValue({ act: "steer", accepted: true, threadRef: "thread:terminal" } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme"
      selection={{ betId: null, workRef: null, teammateRefs: [], threadRef: "thread:terminal" }}
      scopeLabel={null} hasWork variant="dock" submissionMode="work" />);
    act(() => publishTerminalReference({
      ref: "terminal:workspace-one:tests:range",
      ventureId: "v1",
      workspaceId: "workspace-one",
      threadRef: "thread:terminal",
      terminalId: "tests",
      terminalName: "Tests",
      text: "npm test\nFAIL src/client.test.ts:42",
      start: { x: 0, y: 4 },
      end: { x: 31, y: 5 },
    }));
    expect((screen.getByLabelText(/Describe what you want/) as HTMLTextAreaElement).value).toContain("FAIL src/client.test.ts:42");
    fireEvent.change(screen.getByLabelText(/Describe what you want/), {
      target: { value: `${(screen.getByLabelText(/Describe what you want/) as HTMLTextAreaElement).value}\nFix this failure` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", expect.objectContaining({
      message: expect.stringContaining("terminal:workspace-one:tests:range"),
      threadRef: "thread:terminal",
      mode: "work",
    })));
  });

  it("deletes a file chip as one unit on Backspace at its end", async () => {
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork variant="dock" submissionMode="work"
      repositoryFiles={["ui/src/components/work-mode/WorkSurface.tsx"]} />);
    const field = screen.getByLabelText<HTMLTextAreaElement>(/Describe what you want/);
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
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Draft that survives a restart" } });
    const png = new File([new Uint8Array([137, 80, 78, 71])], "kept.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [png] } });
    expect(await screen.findByAltText("kept.png")).toBeVisible();
    // Unmount flushes presentation memory; a fresh mount (a new app session) reads it back.
    unmount();
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={targetBet("bet-1")} scopeLabel="First direction" hasWork variant="dock" />);
    expect(screen.getByLabelText(/Describe what you want/)).toHaveValue("Draft that survives a restart");
    expect(screen.getByAltText("kept.png")).toBeVisible();
  });

  it("requests an honest interrupt of the running drive and keeps the draft to steer with", async () => {
    stopActiveDrive.mockResolvedValue({ drive: { ...runningDrive, abortRequestedAt: "2026-01-01T00:01:00Z" } });
    const onDriven = vi.fn();
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: "b1", workRef: null, teammateRefs: [] }} scopeLabel={null} hasWork variant="dock" submissionMode="work" activeDrive={runningDrive} onDriven={onDriven} />);
    // The live line reflects the drive's real reported activity, not invented prose.
    expect(screen.getByText("Editing WorkSurface.tsx")).toBeInTheDocument();
    const field = screen.getByLabelText(/Describe what you want/);
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

  it("morphs the empty send slot into stop during a live run and back the moment a draft exists", async () => {
    stopActiveDrive.mockResolvedValue({ drive: { ...runningDrive, abortRequestedAt: "2026-01-01T00:01:00Z" } });
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: "b1", workRef: null, teammateRefs: [] }} scopeLabel={null} hasWork variant="dock" submissionMode="work" activeDrive={runningDrive} />);
    // Nothing staged: the send position itself is the stop control.
    const morphed = screen.getByRole("button", { name: "Stop the current step" });
    expect(morphed).toHaveClass("now-composer-send");
    expect(screen.queryByRole("button", { name: "Send to this thread" })).toBeNull();
    // A staged correction restores send — steering mid-run is real — while stop keeps its own slot.
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "steer it" } });
    expect(screen.getByRole("button", { name: "Send to this thread" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Stop the current step" })).toHaveClass("now-composer-stop");
    // Clearing the draft morphs the slot back, and it still requests the honest interrupt.
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Stop the current step" }));
    await waitFor(() => expect(stopActiveDrive).toHaveBeenCalledWith("v1", "drive-1"));
  });

  it("keeps the @ menu agent-only when no repository files are supplied", async () => {
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork variant="dock" configuration={configuration} />);
    const field = screen.getByLabelText(/Describe what you want/);
    fireEvent.change(field, { target: { value: "@Work" } });
    expect(screen.getByRole("listbox")).toHaveAccessibleName("Mention an agent");
    expect(screen.queryByText("File")).toBeNull();
  });

  it("opens the same creation form from /add-agent and inserts the new mention", async () => {
    putFirmConfiguration.mockImplementation(async (_ventureId, _revision, next: FirmConfiguration) => ({ configuration: { ...next, revision: 4 } }));
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork variant="dock" configuration={{ ...configuration, agents: [] }} onDriven={() => {}} />);
    const field = screen.getByLabelText(/Describe what you want/);
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
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Plan the founder outbound campaign" } });
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
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Stop Claude" } });
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
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Implement the workflow repair" } });
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
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Collapse the workbench" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Collapse the workbench", betId: "bet-1", threadRef: "thread:one", mode: "work", runtime: "codex", model: "gpt-5.4",
    }));
    expect(driveTeammate).not.toHaveBeenCalled();
  });

  it("keeps the submitted prompt visible as it leaves for the selected SDK", async () => {
    let resolveReply!: (value: ConversationReplyResult) => void;
    replyInConversation.mockImplementation(() => new Promise((resolve) => { resolveReply = resolve; }));
    const { container } = render(
      <NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork
        variant="dock" submissionMode="work" workflowSketch runtimeOverride="codex" modelOverride="gpt-5.4" onDriven={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Shape the launch evidence loop" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));

    expect(container.querySelector(".now-composer")).toHaveAttribute("data-launching", "true");
    expect(container.querySelector(".now-composer")).toHaveAttribute("data-submission-mode", "work");
    expect(container.querySelector(".now-composer-flight")).toHaveTextContent("Shape the launch evidence loop");
    resolveReply({ act: "answer", accepted: true } as ConversationReplyResult);
    await waitFor(() => expect(replyInConversation).toHaveBeenCalled());
  });

  it("sends Canvas-grounded work with the selected SDK reasoning effort", async () => {
    replyInConversation.mockResolvedValue({ act: "answer", accepted: true } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork
      variant="dock" submissionMode="work" runtimeOverride="codex" modelOverride="gpt-5.4" effortOverride="medium" productGtmView onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Find the strategic mismatch" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Find the strategic mismatch", mode: "work", runtime: "codex", model: "gpt-5.4", effort: "medium", productGtmView: true,
    }));
  });

  it("treats an explicit projection request beside the open Canvas as Croki Canvas work", async () => {
    replyInConversation.mockResolvedValue({ act: "answer", accepted: true } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork
      variant="dock" submissionMode="work" runtimeOverride="codex" modelOverride="gpt-5.4" canvasOpen onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Put the entire product on the canvas" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Put the entire product on the canvas", mode: "work", runtime: "codex", model: "gpt-5.4", productGtmView: true,
    }));
  });

  it("keeps implementation work native merely because Canvas is open", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork
      variant="dock" submissionMode="work" runtimeOverride="codex" modelOverride="gpt-5.4" canvasOpen onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Fix the canvas zoom rendering bug" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Fix the canvas zoom rendering bug", mode: "work", runtime: "codex", model: "gpt-5.4",
    }));
  });

  it("keeps an explicitly named Figma canvas in the native harness", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork
      variant="dock" submissionMode="work" runtimeOverride="codex" modelOverride="gpt-5.4" canvasOpen onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Put this UI on the Figma canvas" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Put this UI on the Figma canvas", mode: "work", runtime: "codex", model: "gpt-5.4",
    }));
  });

  it("treats direction from an exact Canvas subject as Canvas work", async () => {
    replyInConversation.mockResolvedValue({ act: "answer", accepted: true } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} subjectRefs={["object:onboarding"]} scopeLabel="Onboarding" hasWork
      variant="dock" submissionMode="work" runtimeOverride="codex" modelOverride="gpt-5.4" canvasOpen canvasSubjectContext onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "What does this page prove today?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "What does this page prove today?", subjectRefs: ["object:onboarding"], mode: "work",
      runtime: "codex", model: "gpt-5.4", productGtmView: true,
    }));
  });

  it("carries the exact provisional model branch into a correction", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:model" } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: "bet-1", workRef: "view-one", teammateRefs: [], threadRef: "thread:model" }} scopeLabel="Ecosystem direction" hasWork variant="dock" submissionMode="work" productGtmView modelBranchRef="model-branch:branch-one" onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Keep this unresolved until evidence returns" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Keep this unresolved until evidence returns", betId: "bet-1", workRef: "view-one", modelBranchRef: "model-branch:branch-one",
      threadRef: "thread:model", mode: "work", productGtmView: true,
    }));
  });

  it("revises the exact provisional Product / GTM graph in its Work thread", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:workflow" } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: "bet-1", workRef: "workflow-one", teammateRefs: [], threadRef: "thread:workflow" }} scopeLabel="Customer return loop" hasWork variant="dock" submissionMode="work" workflowSketch onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Wait seven days before taking the silence branch" } });
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
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Lead with the customer's own numbers" } });
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
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: null, workRef: null, teammateRefs: [], threadRef: "thread:play" }} subjectRefs={["object:play-1"]} scopeLabel="Founder proof loop" hasWork variant="dock" submissionMode="conversation"
      workflowStep={{ ref: "workflow:play-1:approve", id: "approve", label: "Approve the claim", position: 3, count: 5 }} onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Gate this on the pricing page too" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    // The selected Canvas subject and focused step remain exact context on the existing Thread.
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Gate this on the pricing page too",
      threadRef: "thread:play",
      subjectRefs: ["object:play-1", "workflow:play-1:approve"],
      workflowStep: { id: "approve", label: "Approve the claim", position: 3 },
      mode: "context",
      workflowSketch: true,
    }));
  });

  it("sends a selected artifact section as structured context while preserving the founder message", async () => {
    replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: "thread:artifact" } as ConversationReplyResult);
    render(<NowComposer ventureId="v1" ventureName="Acme" selection={{ betId: "bet-1", workRef: "artifact-one", teammateRefs: [], threadRef: "thread:artifact" }} scopeLabel="Launch brief" hasWork variant="dock" submissionMode="work" artifactSection={{ artifactRef: "work:artifact-one", artifactTitle: "Launch brief", artifactAt: "2026-07-20T12:00:00.000Z", sectionId: "0:Channel W", sectionTitle: "Channel W", sectionIndex: 0 }} onDriven={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Use founder introductions before cold outreach" } });
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
    const field = screen.getByLabelText(/Describe what you want/);
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
    const field = screen.getByLabelText(/Describe what you want/);
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
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Draft for the first direction" } });

    rerender(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={targetBet("bet-2")}
        scopeLabel="Second direction" hasWork variant="dock"
      />,
    );
    expect(screen.getByLabelText(/Describe what you want/)).toHaveValue("");
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Draft for the second direction" } });

    rerender(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={targetBet("bet-1")}
        scopeLabel="First direction" hasWork variant="dock"
      />,
    );
    expect(screen.getByLabelText(/Describe what you want/)).toHaveValue("Draft for the first direction");
  });

  it("keeps contextual new-thread drafts attached to their semantic subject", () => {
    const { rerender } = render(<NowComposer ventureId="v1" ventureName="Acme" selection={null} subjectRefs={["object:one"]} scopeLabel={null} hasWork variant="dock" submissionMode="conversation" />);
    fireEvent.change(screen.getByLabelText(/Describe what you want/), { target: { value: "Draft for object one" } });
    rerender(<NowComposer ventureId="v1" ventureName="Acme" selection={null} subjectRefs={["object:two"]} scopeLabel={null} hasWork variant="dock" submissionMode="conversation" />);
    expect(screen.getByLabelText(/Describe what you want/)).toHaveValue("");
    rerender(<NowComposer ventureId="v1" ventureName="Acme" selection={null} subjectRefs={["object:one"]} scopeLabel={null} hasWork variant="dock" submissionMode="conversation" />);
    expect(screen.getByLabelText(/Describe what you want/)).toHaveValue("Draft for object one");
  });

  it("stages one observed journey source and sends only its reference to the exact Work Thread", async () => {
    stageJourneyImport.mockResolvedValue({ import: {
      importRef: "journey-import:one", name: "observed.csv", mediaType: "text/csv", byteSize: 42,
      digest: "abc", rowCount: 2, columns: [], createdAt: "2026-07-23T00:00:00Z", expiresAt: "2026-07-24T00:00:00Z",
    } });
    replyInConversation.mockResolvedValue({ act: "new-direction", threadRef: "thread:journey" } as ConversationReplyResult);
    const { container } = render(<NowComposer
      ventureId="v1" ventureName="Acme" selection={null} subjectRefs={["object:page-home"]}
      scopeLabel="Home" hasWork variant="dock" submissionMode="work" productGtmView journeyImportEnabled
      runtimeOverride="codex" modelOverride="gpt-5" effortOverride="high" onDriven={() => {}}
    />);
    const file = new File(["session,route\none,/\n"], "observed.csv", { type: "text/csv" });
    fireEvent.change(container.querySelector(".now-composer-journey-input")!, { target: { files: [file] } });
    expect(await screen.findByLabelText("Observed journey source observed.csv")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("v1", expect.objectContaining({
      message: "Map this observed journey source to the current Product walk.",
      journeyImportRef: "journey-import:one",
      subjectRefs: ["object:page-home"],
      mode: "work",
      runtime: "codex",
      model: "gpt-5",
      effort: "high",
      productGtmView: true,
    })));
    expect(screen.queryByLabelText("Observed journey source observed.csv")).toBeNull();
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
