import { describe, expect, it } from "vitest";
import type { ThreadTimeline, WorkIndex } from "./work";
import { normalizeDesktopWorkFrame } from "./work-protocol-bridge";
import {
  createWorkProtocolState,
  foldWorkHandshake,
  foldWorkPush,
} from "./work-protocol";

function timeline(revision: number, marker: string): ThreadTimeline {
  return {
    ventureId: "project-a",
    revision,
    thread: { threadRef: "thread:one", founderIntent: marker },
    items: [],
    agents: [],
    visuals: [],
  } as unknown as ThreadTimeline;
}

function work(revision: number, marker: number): WorkIndex {
  return {
    ventureId: "project-a",
    revision,
    items: [],
    counts: {
      total: marker,
      attention: 0,
      active: 0,
      unread: 0,
      matchCount: 0,
    },
    legacy: { unindexedRunCount: 0 },
  };
}

describe("ENG-02 Brain-to-renderer frame receipt", () => {
  it("normalizes the canonical Brain snapshot and reordered direct projections without a sequence hole", () => {
    const brainHandshake = {
      frame: "handshake",
      protocol: "croki-work",
      schemaVersion: 1,
      minSchemaVersion: 1,
      serverInstanceId: "brain-live",
      ventureId: "project-a",
      cursor: 0,
      projectionRevision: 0,
      mode: "snapshot",
      snapshot: {
        ventureId: "project-a",
        cursor: 0,
        threadRevision: 0,
        workRevision: 0,
        thread: timeline(0, "last coherent"),
        work: work(0, 0),
      },
    } as DroverWorkFrame;
    const normalizedHandshake = normalizeDesktopWorkFrame(brainHandshake, "project-a");
    expect(normalizedHandshake?.frame).toBe("handshake");
    if (!normalizedHandshake || normalizedHandshake.frame !== "handshake") {
      throw new Error("The canonical Brain handshake did not normalize.");
    }
    let state = foldWorkHandshake(createWorkProtocolState("project-a"), normalizedHandshake);
    expect(state.cursor).toBe(0);
    expect(state.threads["thread:one"]?.value.thread.founderIntent).toBe("last coherent");
    expect(state.work?.value.counts.total).toBe(0);

    const delayedThread = normalizeDesktopWorkFrame({
      frame: "push",
      protocol: "croki-work",
      schemaVersion: 1,
      serverInstanceId: "brain-live",
      ventureId: "project-a",
      threadId: "one",
      sequence: 2,
      projection: "thread",
      projectionRevision: 2,
      kind: "thread-replaced",
      payload: timeline(2, "current Thread"),
    } as DroverWorkFrame, "project-a");
    const missingWork = normalizeDesktopWorkFrame({
      frame: "push",
      protocol: "croki-work",
      schemaVersion: 1,
      serverInstanceId: "brain-live",
      ventureId: "project-a",
      sequence: 1,
      projection: "work",
      projectionRevision: 1,
      kind: "conversation-changed",
      payload: work(1, 1),
    } as DroverWorkFrame, "project-a");
    if (
      !delayedThread
      || delayedThread.frame !== "push"
      || !missingWork
      || missingWork.frame !== "push"
    ) {
      throw new Error("A canonical Brain push did not normalize.");
    }

    state = foldWorkPush(state, delayedThread);
    expect(state.cursor).toBe(0);
    expect(state.pending[2]).toBeDefined();
    expect(state.threads["thread:one"]?.value.thread.founderIntent).toBe("last coherent");

    state = foldWorkPush(state, missingWork);
    expect(state.cursor).toBe(2);
    expect(state.pending).toEqual({});
    expect(state.work?.value.counts.total).toBe(1);
    expect(state.threads["thread:one"]?.value.thread.founderIntent).toBe("current Thread");
  });

  it("drops a frame scoped to another Project before it reaches the reducer", () => {
    const foreign = normalizeDesktopWorkFrame({
      frame: "push",
      schemaVersion: 1,
      serverInstanceId: "brain-live",
      ventureId: "project-b",
      sequence: 99,
      projection: "work",
      projectionRevision: 99,
      kind: "work-replaced",
      payload: { ...work(99, 99), ventureId: "project-b" },
    } as DroverWorkFrame, "project-a");
    expect(foreign).toBeNull();
  });

  it("consumes one atomic Brain bundle as one cursor step for both Thread and Work", () => {
    const normalized = normalizeDesktopWorkFrame({
      frame: "push",
      protocol: "croki-work",
      schemaVersion: 1,
      serverInstanceId: "brain-live",
      ventureId: "project-a",
      threadId: "one",
      sequence: 1,
      projection: "bundle",
      projectionRevision: 1,
      kind: "timeline-changed",
      payload: {
        workIndex: work(1, 1),
        timeline: timeline(1, "atomic current"),
      },
    } as unknown as DroverWorkFrame, "project-a");
    if (!normalized || normalized.frame !== "push") {
      throw new Error("The canonical Brain bundle did not normalize.");
    }

    const state = foldWorkPush(createWorkProtocolState("project-a"), normalized);
    expect(state.cursor).toBe(1);
    expect(state.pending).toEqual({});
    expect(state.work?.value.counts.total).toBe(1);
    expect(state.threads["thread:one"]?.value.thread.founderIntent).toBe("atomic current");
  });
});
