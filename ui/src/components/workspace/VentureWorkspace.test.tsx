import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadTimeline, WorkIndex } from "@/api";
import { readWorkspaceSession } from "@/lib/venture-session";
import { VentureWorkspace } from "./VentureWorkspace";

const mocks = vi.hoisted(() => ({
  replyInConversation: vi.fn(),
  setThreadName: vi.fn(),
  getMarketMovement: vi.fn(),
}));

const venture = { id: "buffalo", name: "Buffalo Projects", repository: "/tmp/buffalo", createdAt: "2026-07-19T10:00:00.000Z", updatedAt: "2026-07-19T10:00:00.000Z" };
const item = { threadRef: "thread:onboarding", ventureRef: "venture:buffalo", parentThreadRef: "thread:venture-root", originMessageRef: "conversation:one", subjectRefs: ["bet:onboarding"], focusRef: "bet:onboarding", founderIntent: "Improve onboarding", lifecycle: "open" as const, activity: "running" as const, attention: "none" as const, terminal: null, unread: false, reviewedThrough: null, latestMeaningfulEvent: { kind: "running", ref: "run:one#running", at: "2026-07-19T10:02:00.000Z", summary: "In progress" }, runRefs: ["run:one"], pinnedAt: null, participantRefs: ["codex"], activeParticipantRefs: ["codex"], createdAt: "2026-07-19T10:00:00.000Z", updatedAt: "2026-07-19T10:02:00.000Z" };
const workIndex: WorkIndex = { ventureId: venture.id, revision: 2, items: [item], outline: { architectureRevision: 1, objects: [], relationships: [], unplacedThreadRefs: [] }, counts: { total: 1, attention: 0, active: 1, unread: 0, matchCount: 1 }, legacy: { unindexedRunCount: 0 } };
const visual = { kind: "preview" as const, ref: "work:preview", threadRef: item.threadRef, title: "Onboarding proposal", relatedRefs: ["bet:onboarding"] };
const timeline: ThreadTimeline = { ventureId: venture.id, revision: 2, thread: item, agents: [{ participantRef: "codex", state: "working", runRef: "run:one", betRef: "bet:onboarding", updatedAt: "2026-07-19T10:02:00.000Z" }], visuals: [visual, { kind: "map", ref: "thread:onboarding#venture-map", threadRef: item.threadRef, title: "Venture map" }], items: [
  { kind: "message", id: "message:one", ref: "conversation:one", at: "2026-07-19T10:00:00.000Z", role: "founder", content: "Make setup feel immediate." },
  { kind: "artifact", id: "artifact:preview", ref: "work:preview", at: "2026-07-19T10:02:00.000Z", title: "Onboarding proposal", artifact: { id: "preview", content: "## Job-first onboarding\nStart with today's work." }, visual },
] };

vi.mock("@/hooks/use-firm-connection", () => ({ useFirmConnection: () => ({ lens: { bets: [{ id: "onboarding", intent: "Improve onboarding", staged: [], evidence: [] }], crew: [], wallItems: [] }, messages: [], activeDrives: [], workIndex, connection: { phase: "fresh", lastUpdatedAt: Date.now(), retryAt: null, failures: 0, message: null }, refresh: vi.fn(), setWorkIndex: vi.fn() }) }));
vi.mock("@/components/thread/useThreadTimeline", () => ({ useThreadTimeline: (_ventureId: string, threadRef: string | null) => ({ timeline: threadRef === item.threadRef ? timeline : null, loading: false, error: null, streaming: true, refresh: vi.fn() }) }));
vi.mock("@/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api")>()), listVentures: vi.fn(async () => ({ ventures: [venture] })), getWorkIndex: vi.fn(async () => ({ workIndex })), getSystemIndex: vi.fn(async () => ({ systemIndex: { ventureId: venture.id, revision: 2, architectureRevision: 1, scope: "system", objects: [{ id: "product", objectRef: "object:product", name: "Immediate setup", statement: "A founder reaches value immediately.", type: "experience", territory: "product", assertion: "founder-asserted", provenance: null, properties: {}, compatibilityOwned: false, architectureRole: null, threadRefs: [item.threadRef], attention: [], createdAt: null, updatedAt: null }], relationships: [], counts: { total: 1, product: 1, gtm: 0, attention: 0, matchCount: 1 } } })), getCurrentModel: vi.fn(async () => ({ model: { schemaVersion: 3, ventureId: venture.id, revision: 2, objects: [{ id: "product", type: "experience", name: "Immediate setup", statement: "A founder reaches value immediately.", properties: { territory: "product" }, assertion: "founder-asserted" }], relationships: [], modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [] } })), getMarketMovement: mocks.getMarketMovement, getJourneyObservations: vi.fn(async () => ({ observations: [], receipts: [] })), getJourneyMappingProposals: vi.fn(async () => ({ proposals: [] })), replyInConversation: mocks.replyInConversation, markWorkIndexReviewed: vi.fn(), setThreadPinned: vi.fn(async () => ({ item, workIndex })), setThreadName: mocks.setThreadName }));

beforeEach(() => {
  mocks.replyInConversation.mockReset().mockResolvedValue({ act: "steer" });
  mocks.setThreadName.mockReset().mockResolvedValue({ item: { ...item, founderIntent: "Product development" }, workIndex: { ...workIndex, items: [{ ...item, founderIntent: "Product development" }] } });
  mocks.getMarketMovement.mockReset().mockResolvedValue({ marketMovement: { ventureId: venture.id, modelRevision: 2, generatedAt: "now", actions: [], liveWork: [] } });
  localStorage.clear();
  localStorage.setItem("drover:thread-session:v2:buffalo", JSON.stringify({ threadRef: item.threadRef, stage: null, railWidth: 240, chatScrollByThread: {} }));
});

describe("VentureWorkspace — unified founder shell", () => {
  it("renders one shell with a permanent conversation spine and a closed Canvas toggle", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Improve onboarding" })).toBeInTheDocument();
    expect(screen.getByLabelText("Buffalo Projects workspace rail")).toBeInTheDocument();
    expect(screen.getByText("Make setup feel immediate.")).toBeInTheDocument();
    expect(screen.getByText("Make setup feel immediate.").closest(".thread-conversation")).toHaveAttribute("data-surface", "work");
    expect(screen.getByLabelText("Thread controls")).toBeInTheDocument();
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("Claude Opus 4.8");
    expect(screen.queryByRole("navigation", { name: "Workspace modes" })).not.toBeInTheDocument();
    // The Canvas is an auxiliary workbench view, not a participation switch.
    const toggle = screen.getByRole("button", { name: "Canvas" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("complementary", { name: "Venture Canvas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Releases/ })).not.toBeInTheDocument();
  });

  it("renames the thread inline while preserving its original transcript", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    fireEvent.click(screen.getAllByRole("button", { name: "Rename thread" })[0]);
    const input = screen.getByRole("textbox", { name: "Thread name" });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "Product development" } });
    fireEvent.click(screen.getByRole("button", { name: "Save thread name" }));
    await waitFor(() => expect(mocks.setThreadName).toHaveBeenCalledWith(venture.id, item.threadRef, "Product development"));
    expect(screen.getByText("Make setup feel immediate.")).toBeInTheDocument();
  });

  it("opens the Canvas as one graph beside the spine without a Releases destination", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    fireEvent.click(screen.getByRole("button", { name: "Canvas" }));
    const canvas = await screen.findByRole("complementary", { name: "Venture Canvas" });
    // The conversation spine stays present; the Canvas is auxiliary, not a mode swap.
    expect(screen.getByText("Make setup feel immediate.")).toBeInTheDocument();
    expect(screen.getByText("Make setup feel immediate.").closest(".thread-conversation")).toHaveAttribute("data-surface", "work");
    expect(screen.getByText("Make setup feel immediate.").closest(".workspace-shell")).toHaveAttribute("data-canvas-open", "true");
    expect(screen.getByRole("button", { name: "Canvas" })).toHaveAttribute("aria-pressed", "true");
    expect(within(canvas).getByRole("region", { name: "Canvas agents" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Releases/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /In market/ })).not.toBeInTheDocument();
  });

  it("keeps the conversation spine while the Canvas opens and closes", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    fireEvent.click(screen.getByRole("button", { name: "Canvas" }));
    await screen.findByRole("complementary", { name: "Venture Canvas" });
    // No second conversation is spun up on the Canvas; direction stays in the one spine.
    expect(screen.getAllByText("Make setup feel immediate.")).toHaveLength(1);
    expect(screen.getByLabelText("Describe what you want to build")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide Canvas" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Venture Canvas" })).not.toBeInTheDocument());
    expect(screen.getByText("Make setup feel immediate.")).toBeInTheDocument();
    expect(screen.getByText("Make setup feel immediate.").closest(".workspace-shell")).not.toHaveAttribute("data-canvas-open");
    expect(screen.getByRole("button", { name: "Canvas" })).toHaveAttribute("aria-pressed", "false");
  });

  it("sends a code direction to the exact Work Thread with the chosen SDK model", async () => {
    localStorage.setItem(`drover:work-model:${venture.id}`, "codex:gpt-5.6-sol");
    localStorage.setItem(`drover:work-effort:${venture.id}`, "xhigh");
    mocks.replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: item.threadRef });
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    fireEvent.change(screen.getByLabelText("Describe what you want to build"), { target: { value: "Implement this workflow" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(mocks.replyInConversation).toHaveBeenCalledWith(venture.id, expect.objectContaining({
      message: "Implement this workflow",
      threadRef: item.threadRef,
      mode: "work",
      runtime: "codex",
      model: "gpt-5.6-sol",
      effort: "xhigh",
    })));
    // Direction stays in place: the same Work spine, no surface swap.
    expect(screen.getByText("Make setup feel immediate.").closest(".thread-conversation")).toHaveAttribute("data-surface", "work");
  });

  it("keeps the spine composer draft while the Canvas opens and closes", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    const composer = screen.getByLabelText("Describe what you want to build");
    fireEvent.change(composer, { target: { value: "Keep this exact canvas thought" } });

    fireEvent.click(screen.getByRole("button", { name: "Canvas" }));
    await screen.findByRole("complementary", { name: "Venture Canvas" });
    expect(screen.getByLabelText("Describe what you want to build")).toHaveValue("Keep this exact canvas thought");
    fireEvent.click(screen.getByRole("button", { name: "Hide Canvas" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Venture Canvas" })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Describe what you want to build")).toHaveValue("Keep this exact canvas thought");
  });

  it("keeps the selected SDK participant while the Canvas is open", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    const composer = screen.getByLabelText("Describe what you want to build");
    fireEvent.change(composer, { target: { value: "Ideate a founder approval and evidence workflow" } });
    fireEvent.click(screen.getByRole("button", { name: "Canvas" }));
    expect(composer.closest(".thread-conversation")).not.toHaveAttribute("data-chat-mode");
    expect(screen.queryByText("Croki agents")).not.toBeInTheDocument();
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("Claude Opus 4.8");
    expect(composer).toHaveAttribute("placeholder", "Ask for a change…");
    expect(composer).toHaveValue("Ideate a founder approval and evidence workflow");
    await screen.findByRole("complementary", { name: "Venture Canvas" });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(mocks.replyInConversation).toHaveBeenCalledWith(venture.id, expect.objectContaining({
      message: "Ideate a founder approval and evidence workflow",
      mode: "work",
      runtime: "claude-code",
      model: "claude-opus-4-8",
      effort: "high",
    })));
  });

  it("attaches the focused Canvas node as exact context to the selected SDK in the same Thread", async () => {
    localStorage.setItem("drover:workspace-session:v13:buffalo", JSON.stringify({
      railWidth: 272,
      canvasOpen: true,
      selectedThreadRef: item.threadRef,
      selectedObjectRef: "object:product",
      systemCamera: null,
      chatScrollByThread: {},
    }));
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByRole("complementary", { name: "Venture Canvas" });
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("Claude Opus 4.8");
    expect(document.querySelector(".now-composer-scope-label")).toHaveTextContent("Immediate setup");

    fireEvent.change(screen.getByLabelText("Describe what you want to build"), { target: { value: "Make this page explain itself" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(mocks.replyInConversation).toHaveBeenCalledWith(venture.id, expect.objectContaining({
      message: "Make this page explain itself",
      threadRef: item.threadRef,
      subjectRefs: ["object:product"],
      mode: "work",
      runtime: "claude-code",
      model: "claude-opus-4-8",
    })));
  });

  it("preserves a restored outward-action selection until its async Canvas projection loads", async () => {
    const actionRef = "outward-action:message-one";
    localStorage.setItem("drover:workspace-session:v13:buffalo", JSON.stringify({
      railWidth: 272,
      canvasOpen: true,
      selectedThreadRef: item.threadRef,
      selectedObjectRef: actionRef,
      systemCamera: null,
      chatScrollByThread: {},
    }));
    mocks.getMarketMovement.mockResolvedValue({
      marketMovement: {
        ventureId: venture.id,
        modelRevision: 2,
        generatedAt: "now",
        liveWork: [],
        actions: [{
          id: "message-one",
          ventureId: venture.id,
          kind: "message",
          state: "needs-founder",
          subjectRefs: ["object:product"],
          branchRefs: [],
          motionRefs: [],
          productDeltaRefs: [],
          workRefs: ["work:attempt-one"],
          decisionRef: "decision:message-one",
          preparedMaterial: { messageContract: { to: "founder@example.test", subject: "Exact draft", body: "Do not send." } },
          expectedReturn: { source: "gmail-thread", windowHours: 24 },
          preparedBy: { authority: "agent", id: "codex" },
          executedAt: null,
          executorReceipt: null,
          executionLease: null,
          executionAttempts: [],
          lastExecutionError: null,
          needsReconnect: false,
          observationRefs: [],
          outcomeRefs: [],
          observations: [],
          latestObservation: null,
          latestOutcome: null,
          createdAt: "2026-07-19T10:00:00.000Z",
          updatedAt: "2026-07-19T10:00:00.000Z",
        }],
      },
    });

    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    expect(await screen.findByText("Nothing crosses into the world until you execute this exact action here.")).toBeInTheDocument();
    expect(screen.queryByText("The saved Canvas item is no longer available. The Thread and its draft were kept.")).not.toBeInTheDocument();
    await waitFor(() => expect(readWorkspaceSession(venture.id).selectedObjectRef).toBe(actionRef));
  });

  it("clears a restored canonical Canvas object that no longer exists", async () => {
    localStorage.setItem("drover:workspace-session:v13:buffalo", JSON.stringify({
      railWidth: 272,
      canvasOpen: true,
      selectedThreadRef: item.threadRef,
      selectedObjectRef: "object:deleted-page",
      systemCamera: { x: 40, y: 20, zoom: 1.1 },
      chatScrollByThread: {},
    }));

    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    expect(await screen.findByText("Canvas return · The saved Canvas item is no longer available. The Thread and its draft were kept.")).toBeInTheDocument();
    await waitFor(() => {
      const restored = readWorkspaceSession(venture.id);
      expect(restored.selectedObjectRef).toBeNull();
      expect(restored.systemCamera).toBeNull();
    });
  });

  it("shows a submitted founder turn immediately in the existing Work thread", async () => {
    mocks.replyInConversation.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    const composer = screen.getByLabelText("Describe what you want to build");
    fireEvent.change(composer, { target: { value: "Keep this visible while the agent starts" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));

    const pendingTurn = container.querySelector('.thread-message-pending[data-role="founder"]');
    expect(pendingTurn).toHaveTextContent("Keep this visible while the agent starts");
    expect(pendingTurn?.closest(".thread-conversation")).toHaveAccessibleName("Improve onboarding");
    expect(screen.getByRole("heading", { name: "Improve onboarding" })).toBeInTheDocument();
  });

  it("opens visual material beside chat and Escape restores focus without unmounting chat", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    const open = await screen.findByRole("button", { name: "Open: Onboarding proposal" });
    fireEvent.click(open);
    expect(screen.getByLabelText("Onboarding proposal visual workspace")).toBeInTheDocument();
    expect(screen.getByText("Make setup feel immediate.")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Onboarding proposal visual workspace")).not.toBeInTheDocument());
    expect(open).toHaveFocus();
  });

  it("creates only a local draft when New thread is chosen", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    expect(screen.getByRole("heading", { name: "What do you want to build?" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Describe what you want to build" })).toHaveAttribute("placeholder", "Describe what you want to build…");
  });

  it("starts a clean draft when New thread is chosen during a pending first turn", async () => {
    mocks.replyInConversation.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    const composer = screen.getByLabelText("Describe what you want to build");
    fireEvent.change(composer, { target: { value: "Map out the concrete chat improvements" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    expect(container.querySelector('.thread-message-pending[data-role="founder"]')).toHaveTextContent("Map out the concrete chat improvements");

    fireEvent.click(screen.getByRole("button", { name: "New thread" }));

    expect(screen.getByRole("heading", { name: "What do you want to build?" })).toBeInTheDocument();
    expect(container.querySelector('.thread-message-pending[data-role="founder"]')).not.toBeInTheDocument();
  });

  it("migrates an old map session to its thread with the visual closed", async () => {
    localStorage.removeItem("drover:thread-session:v2:buffalo");
    localStorage.setItem("drover:workspace-session:v1:buffalo", JSON.stringify({ mode: "map", focus: { directionId: item.threadRef, target: { betId: "onboarding", workRef: null, teammateRefs: [], threadRef: item.threadRef } } }));
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Improve onboarding" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/visual workspace/)).not.toBeInTheDocument();
    expect(screen.getByText("Make setup feel immediate.")).toBeInTheDocument();
  });
});
