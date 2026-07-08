import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComposerDock } from "./ComposerDock";
import type { OperatorSession, OperatorSessionSummary, OperatorStatus } from "@/types";

// WI-D — per-tab STOP (a running run) / CLOSE (a paused or finished thread) in the chat-tab strip.
// The strip only renders at 2+ live pipelines, so every case here seeds a roster of two or more. Stop
// routes through onStopSession (the authorized cancel path, App-side); close routes through onCloseSession
// (a client-side dismissal). A tab with something to lose — a running run or a pending gate — arms on the
// first tap and fires on the second; a finished tab closes at once. The control never also switches tabs.

// jsdom doesn't implement Element.scrollTo, which the dock calls to keep the thread pinned to newest.
beforeAll(() => {
  if (!("scrollTo" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollTo", { value: () => {}, writable: true });
  }
});

function summary(id: string, status: OperatorStatus, goal: string): OperatorSessionSummary {
  return {
    id,
    goal,
    graphId: `g-${id}`,
    projectId: "p1",
    status,
    createdAt: `2026-07-08T0${id.slice(-1)}:00:00.000Z`,
    updatedAt: "2026-07-08T09:00:00.000Z",
    summary: null,
    error: null,
  };
}

function activeSession(id: string, status: OperatorStatus): OperatorSession {
  return {
    ...summary(id, status, "active goal"),
    schemaVersion: 1,
    model: "claude",
    stepCount: 1,
    maxSteps: 20,
    graphRevision: 1,
    events: [],
  } as unknown as OperatorSession;
}

function renderDock(
  roster: OperatorSessionSummary[],
  handlers: {
    onStopSession?: (id: string) => void;
    onCloseSession?: (id: string) => void;
    onSwitchSession?: (id: string) => void;
  },
  activeId = roster[0]?.id ?? null,
) {
  return render(
    <ComposerDock
      session={activeSession(activeId ?? "s1", roster.find((r) => r.id === activeId)?.status ?? "running")}
      running={false}
      onSend={() => {}}
      onCancel={() => {}}
      onReviewGate={() => {}}
      roster={roster}
      activeSessionId={activeId}
      onSwitchSession={handlers.onSwitchSession ?? (() => {})}
      onStopSession={handlers.onStopSession}
      onCloseSession={handlers.onCloseSession}
      startOpen // keep the dock open so the tab strip renders regardless of the active session's status
    />,
  );
}

describe("ComposerDock — per-tab stop / close", () => {
  it("a running tab exposes a Stop control that stops THAT tab (after confirm), without also switching", () => {
    const onStopSession = vi.fn();
    const onSwitchSession = vi.fn();
    const roster = [
      summary("s1", "waiting_for_gate", "pipeline one"), // active, so not the one we stop
      summary("s2", "running", "pipeline two"),
    ];
    renderDock(roster, { onStopSession, onSwitchSession }, "s1");
    const stop = screen.getByLabelText("Stop pipeline two");
    fireEvent.click(stop); // arms (a live run has something to lose)
    fireEvent.click(screen.getByText("End?")); // confirms
    expect(onStopSession).toHaveBeenCalledWith("s2");
    expect(onSwitchSession).not.toHaveBeenCalled();
  });

  it("a finished tab exposes a Close control that closes THAT tab on the first click, no confirm", () => {
    const onCloseSession = vi.fn();
    const onSwitchSession = vi.fn();
    const roster = [
      summary("s1", "running", "pipeline one"), // active
      summary("s2", "completed", "pipeline two"),
    ];
    renderDock(roster, { onCloseSession, onSwitchSession }, "s1");
    const close = screen.getByLabelText("Close pipeline two");
    fireEvent.click(close);
    expect(onCloseSession).toHaveBeenCalledWith("s2");
    expect(onSwitchSession).not.toHaveBeenCalled();
  });

  it("closing a running tab ARMS on the first click and fires only on the second (two-tap confirm)", () => {
    const onStopSession = vi.fn();
    const roster = [
      summary("s1", "completed", "pipeline one"), // active
      summary("s2", "running", "pipeline two"),
    ];
    renderDock(roster, { onStopSession }, "s1");
    const stop = screen.getByLabelText("Stop pipeline two");
    fireEvent.click(stop);
    expect(onStopSession).not.toHaveBeenCalled(); // armed, not fired
    expect(screen.getByText("End?")).toBeTruthy();
    fireEvent.click(screen.getByText("End?"));
    expect(onStopSession).toHaveBeenCalledWith("s2");
  });

  it("closing a waiting-for-gate tab also confirms — first click arms, second closes", () => {
    const onCloseSession = vi.fn();
    const roster = [
      summary("s1", "running", "pipeline one"), // active
      summary("s2", "waiting_for_gate", "pipeline two"),
    ];
    renderDock(roster, { onCloseSession }, "s1");
    const close = screen.getByLabelText("Close pipeline two");
    fireEvent.click(close);
    expect(onCloseSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("End?"));
    expect(onCloseSession).toHaveBeenCalledWith("s2");
  });
});
