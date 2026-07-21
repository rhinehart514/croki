import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadTimeline, WorkIndex } from "@/api";
import { VentureWorkspace } from "./VentureWorkspace";

const mocks = vi.hoisted(() => ({ replyInConversation: vi.fn() }));

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
vi.mock("@/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api")>()), listVentures: vi.fn(async () => ({ ventures: [venture] })), getWorkIndex: vi.fn(async () => ({ workIndex })), getSystemIndex: vi.fn(async () => ({ systemIndex: { ventureId: venture.id, revision: 2, architectureRevision: 1, scope: "system", objects: [], relationships: [], counts: { total: 0, product: 0, gtm: 0, attention: 0, matchCount: 0 } } })), getReleaseIndex: vi.fn(async () => ({ releaseIndex: { ventureId: venture.id, revision: 2, releases: [], unassignedActions: [], counts: { needsYou: 0, drafts: 0, inMarket: 0, ended: 0 } } })), replyInConversation: mocks.replyInConversation, markWorkIndexReviewed: vi.fn(), setThreadPinned: vi.fn(async () => ({ item, workIndex })) }));

beforeEach(() => {
  mocks.replyInConversation.mockReset().mockResolvedValue({ act: "steer" });
  localStorage.clear();
  localStorage.setItem("drover:thread-session:v2:buffalo", JSON.stringify({ threadRef: item.threadRef, stage: null, railWidth: 240, chatScrollByThread: {} }));
});

describe("VentureWorkspace — unified founder shell", () => {
  it("renders Work with permanent conversation and two first-class surfaces", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Improve onboarding" })).toBeInTheDocument();
    expect(screen.getByLabelText("Buffalo Projects workspace rail")).toBeInTheDocument();
    expect(screen.getByText("Make setup feel immediate.")).toBeInTheDocument();
    expect(screen.getByText("Make setup feel immediate.").closest(".thread-conversation")).toHaveAttribute("data-surface", "work");
    expect(screen.getByLabelText("Chat participation controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Code — Claude / Codex" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Agent presence")).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Workspace modes" })).getByRole("button", { name: /Product \/ GTM/ })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Workspace modes" })).queryByRole("button", { name: /Releases/ })).not.toBeInTheDocument();
  });

  it("opens and collapses Releases within Product / GTM", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    fireEvent.keyDown(window, { key: "2", metaKey: true });
    const releases = await screen.findByRole("button", { name: /Releases/ });
    expect(releases).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(releases);
    expect(await screen.findByRole("heading", { name: "Market movement" })).toBeInTheDocument();
    expect(releases).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("navigation", { name: "Workspace modes" })).getByRole("button", { name: /Product \/ GTM/ })).toHaveAttribute("aria-current", "page");
    fireEvent.click(releases);
    expect(await screen.findByRole("heading", { name: "Agent workflows" })).toBeInTheDocument();
    expect(releases).toHaveAttribute("aria-expanded", "false");
  });

  it("switches modes into mode-owned space and restores contextual conversation on demand", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    fireEvent.keyDown(window, { key: "2", metaKey: true });
    expect(await screen.findByRole("heading", { name: "Agent workflows" })).toBeInTheDocument();
    expect(screen.queryByText("Make setup feel immediate.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New thread" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Product and go-to-market scopes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Product and go-to-market sections" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Workflow agents" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask about this workflow" }));
    const contextual = screen.getByRole("complementary", { name: "Context conversation" });
    expect(contextual.querySelector(".thread-conversation")).toHaveAttribute("data-surface", "context");
    expect(contextual.querySelector(".thread-header")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close conversation" }));
    expect(screen.queryByText("Make setup feel immediate.")).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Workspace modes" })).getByRole("button", { name: /Product \/ GTM/ })).toHaveAttribute("aria-current", "page");
  });

  it("moves substantive contextual work into the exact Work thread", async () => {
    mocks.replyInConversation.mockResolvedValue({ act: "new-direction", accepted: true, threadRef: item.threadRef });
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    fireEvent.keyDown(window, { key: "2", metaKey: true });
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this workflow" }));
    fireEvent.change(screen.getByLabelText("Say what you want for this venture"), { target: { value: "Implement this workflow" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Workspace modes" })).getByRole("button", { name: /^Work/ })).toHaveAttribute("aria-current", "page"));
    expect(screen.queryByRole("complementary", { name: "Context conversation" })).not.toBeInTheDocument();
  });

  it("puts the existing Work chat into Product and GTM agent mode for workflow ideation", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    const composer = screen.getByLabelText("Say what you want for this venture");
    fireEvent.change(composer, { target: { value: "Ideate a founder approval and evidence workflow" } });
    fireEvent.click(screen.getByRole("button", { name: "Product / GTM — Agents" }));
    expect(composer.closest(".thread-conversation")).toHaveAttribute("data-chat-mode", "product-gtm");
    expect(screen.getByText("Drover agents")).toBeInTheDocument();
    expect(screen.queryByLabelText("SDK model")).not.toBeInTheDocument();
    expect(composer).toHaveAttribute("placeholder", "Ideate a Product / GTM workflow…");
    expect(composer).toHaveValue("Ideate a founder approval and evidence workflow");
    expect(within(screen.getByRole("navigation", { name: "Workspace modes" })).getByRole("button", { name: /^Work/ })).toHaveAttribute("aria-current", "page");
    expect(localStorage.getItem(`drover:work-chat-mode:${venture.id}`)).toBe("product-gtm");
    fireEvent.click(screen.getByRole("button", { name: "Send to this thread" }));
    await waitFor(() => expect(mocks.replyInConversation).toHaveBeenCalledWith(venture.id, expect.objectContaining({
      message: "Ideate a founder approval and evidence workflow",
      mode: "context",
      workflowSketch: true,
    })));
  });

  it("shows a submitted founder turn immediately in the existing Work thread", async () => {
    mocks.replyInConversation.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByText("Make setup feel immediate.");
    const composer = screen.getByLabelText("Say what you want for this venture");
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
    expect(screen.getByRole("heading", { name: "What do you want to work on?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Say what you want for this venture" })).toHaveAttribute("placeholder", "Describe what you want to build…");
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
