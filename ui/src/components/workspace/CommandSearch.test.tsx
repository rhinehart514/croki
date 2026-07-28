import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemIndex, WorkIndex, WorkIndexItem } from "@/api";
import { CommandSearch } from "./CommandSearch";
import { WORK_REVIEW_REQUEST_EVENT } from "@/components/work-mode/previewPresentation";

const item = (threadRef: string, founderIntent: string, updatedAt: string): WorkIndexItem => ({
  threadRef, ventureRef: "venture:v", parentThreadRef: null, originMessageRef: null, subjectRefs: [],
  focusRef: "bet:x", founderIntent, lifecycle: "open", activity: "idle", attention: "none", terminal: null,
  unread: false, settled: true, reviewedThrough: null,
  latestMeaningfulEvent: { kind: "done", ref: "run:1#done", at: null, summary: null },
  runRefs: [], pinnedAt: null, participantRefs: [], activeParticipantRefs: [], createdAt: null, updatedAt,
});

const workIndex = {
  ventureId: "v", revision: 1,
  items: [
    item("thread:onboarding", "Improve onboarding", "2026-07-21T10:00:00.000Z"),
    item("thread:pricing", "Pricing page rework", "2026-07-20T10:00:00.000Z"),
  ],
  counts: { total: 2, attention: 0, active: 0, unread: 0, matchCount: 2 },
} as WorkIndex;

const systemIndex = {
  ventureId: "v", revision: 1, architectureRevision: 1, scope: "system",
  objects: [{ id: "motion", objectRef: "object:motion", name: "Founder-led sales", statement: "Learn directly with founders.", type: "motion", territory: "gtm", assertion: "founder-asserted", provenance: null, properties: {}, compatibilityOwned: false, architectureRole: null, threadRefs: [], attention: [], createdAt: null, updatedAt: null }],
  relationships: [], counts: { total: 1, product: 0, gtm: 1, attention: 0, matchCount: 1 },
} as SystemIndex;

function renderSearch(overrides: Partial<React.ComponentProps<typeof CommandSearch>> = {}) {
  const handlers = {
    onSelectThread: vi.fn(), onSelectObject: vi.fn(), onToggleCanvas: vi.fn(), onNewThread: vi.fn(),
  };
  render(<CommandSearch canvasOpen={false} workIndex={workIndex} systemIndex={systemIndex} {...handlers} {...overrides} />);
  return handlers;
}

const openSearch = () => fireEvent.keyDown(window, { key: "k", metaKey: true });

beforeEach(() => {
  // The desktop bridge reports the platform; darwin makes shortcut labels deterministic (⌘).
  Object.assign(window, { droverDesktop: { platform: "darwin" } });
});

describe("CommandSearch", () => {
  it("stays out of the way until ⌘K, then opens focused search with actions and recent Threads", async () => {
    renderSearch();
    expect(screen.queryByRole("combobox", { name: "Search this project" })).not.toBeInTheDocument();
    openSearch();
    const input = await screen.findByRole("combobox", { name: "Search this project" });
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByRole("option", { name: /New Thread/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Show Canvas/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Improve onboarding/ })).toBeInTheDocument();
    expect(screen.getByText("⌘N")).toBeInTheDocument();
  });

  it("filters Threads by query and jumps with full keyboard traversal", async () => {
    const handlers = renderSearch();
    openSearch();
    const input = await screen.findByRole("combobox", { name: "Search this project" });
    fireEvent.change(input, { target: { value: "pricing" } });
    expect(screen.getByRole("option", { name: /Pricing page rework/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("option", { name: /Improve onboarding/ })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(handlers.onSelectThread).toHaveBeenCalledWith(expect.objectContaining({ threadRef: "thread:pricing" })));
  });

  it("moves the highlight with arrow keys and wraps", async () => {
    renderSearch();
    openSearch();
    const input = await screen.findByRole("combobox", { name: "Search this project" });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option").at(-1)).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("shows an honest empty state naming the surface's search scope", async () => {
    renderSearch();
    openSearch();
    const input = await screen.findByRole("combobox", { name: "Search this project" });
    fireEvent.change(input, { target: { value: "zebra" } });
    expect(screen.getByText("No matches for “zebra”.")).toBeInTheDocument();
    expect(screen.getByText("Search covers Threads, the Canvas, and actions in this project.")).toBeInTheDocument();
  });

  it("reaches Canvas objects and keeps them query-only at rest", async () => {
    const handlers = renderSearch();
    openSearch();
    const input = await screen.findByRole("combobox", { name: "Search this project" });
    // The Canvas map is query-only at rest: no object rows until the founder types.
    expect(screen.queryByRole("option", { name: /Founder-led sales/ })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "founder-led" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(handlers.onSelectObject).toHaveBeenCalledWith(expect.objectContaining({ objectRef: "object:motion" })));
  });

  it("toggles the Canvas from search, honestly labeled by its current state", async () => {
    const handlers = renderSearch({ canvasOpen: true });
    openSearch();
    await screen.findByRole("combobox", { name: "Search this project" });
    fireEvent.click(screen.getByRole("option", { name: /Hide Canvas/ }));
    await waitFor(() => expect(handlers.onToggleCanvas).toHaveBeenCalledTimes(1));
  });

  it("offers exact Review material only when a coding attempt exists, without relying on tabs", async () => {
    const requested = vi.fn();
    const workSurface = document.createElement("div");
    workSurface.className = "work-surface";
    workSurface.dataset.hasAttempts = "true";
    document.body.appendChild(workSurface);
    window.addEventListener(WORK_REVIEW_REQUEST_EVENT, requested);
    const composer = document.createElement("section");
    composer.className = "now-composer";
    const textarea = document.createElement("textarea");
    composer.appendChild(textarea);
    document.body.appendChild(composer);
    try {
      renderSearch();
      openSearch();
      await screen.findByRole("combobox", { name: "Search this project" });
      expect(screen.getByRole("option", { name: /Show preview/ })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /Open terminal/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("option", { name: /Show code changes/ }));
      await waitFor(() => expect(requested).toHaveBeenCalledTimes(1));
      openSearch();
      await screen.findByRole("combobox", { name: "Search this project" });
      fireEvent.click(screen.getByRole("option", { name: /Write a prompt/ }));
      await waitFor(() => expect(textarea).toHaveFocus());
    } finally {
      window.removeEventListener(WORK_REVIEW_REQUEST_EVENT, requested);
      workSurface.remove();
      composer.remove();
    }
  });

  it("starts a new Thread from ⌘N without opening the overlay", () => {
    const handlers = renderSearch();
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(handlers.onNewThread).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("combobox", { name: "Search this project" })).not.toBeInTheDocument();
  });

  it("closes on Escape without running anything", async () => {
    const handlers = renderSearch();
    openSearch();
    const input = await screen.findByRole("combobox", { name: "Search this project" });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Search this project" })).not.toBeInTheDocument());
    expect(handlers.onSelectThread).not.toHaveBeenCalled();
    expect(handlers.onNewThread).not.toHaveBeenCalled();
  });
});
