import { describe, expect, it } from "vitest";
import type { ThreadTimeline, WorkIndex } from "./work";
import { normalizeDesktopWorkFrame } from "./work-protocol-bridge";

function work(revision: number): WorkIndex {
  return {
    ventureId: "venture-a",
    revision,
    items: [],
    counts: { total: revision, attention: 0, active: 0, unread: 0, matchCount: 0 },
    legacy: { unindexedRunCount: 0 },
  };
}

function thread(revision: number): ThreadTimeline {
  return {
    ventureId: "venture-a",
    revision,
    thread: { threadRef: "thread:one" },
    items: [],
    agents: [],
    visuals: [],
  } as unknown as ThreadTimeline;
}

describe("desktop Work protocol normalization", () => {
  it("normalizes the exact coherent snapshot emitted by the Brain", () => {
    const frame = normalizeDesktopWorkFrame({
      frame: "handshake",
      schemaVersion: 1,
      minSchemaVersion: 1,
      serverInstanceId: "brain-a",
      ventureId: "venture-a",
      cursor: 9,
      mode: "snapshot",
      projectionRevision: 12,
      snapshot: {
        ventureId: "venture-a",
        cursor: 9,
        threadRevision: 11,
        workRevision: 12,
        thread: thread(4),
        work: work(5),
      },
    }, "venture-a");

    expect(frame).toMatchObject({
      frame: "handshake",
      currentCursor: 9,
      projectionRevision: 12,
      delivery: "snapshot",
      snapshot: {
        cursor: 9,
        threads: [{ threadRef: "thread:one", revision: 11 }],
        work: { revision: 12 },
      },
    });
  });

  it("normalizes direct Thread and Work pushes and rejects a cross-venture frame", () => {
    expect(normalizeDesktopWorkFrame({
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-a",
      threadId: "one",
      sequence: 10,
      projection: "thread",
      projectionRevision: 13,
      payload: thread(5),
    }, "venture-a")).toMatchObject({
      frame: "push",
      projection: "thread",
      threadRef: "thread:one",
      sequence: 10,
    });

    expect(normalizeDesktopWorkFrame({
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-a",
      sequence: 11,
      projection: "work",
      projectionRevision: 14,
      payload: work(6),
    }, "venture-a")).toMatchObject({
      frame: "push",
      projection: "work",
      sequence: 11,
    });

    expect(normalizeDesktopWorkFrame({
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-b",
      sequence: 100,
      projection: "work",
      projectionRevision: 100,
      payload: { ...work(100), ventureId: "venture-b" },
    }, "venture-a")).toBeNull();
  });

  it("normalizes the Brain's canonical atomic bundle as one sequence", () => {
    expect(normalizeDesktopWorkFrame({
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-a",
      threadId: "one",
      sequence: 12,
      projection: "bundle",
      projectionRevision: 15,
      payload: { ventureId: "venture-a", workIndex: work(7), timeline: thread(6) },
    }, "venture-a")).toMatchObject({
      frame: "push",
      sequence: 12,
      projection: "bundle",
      work: { revision: 7 },
      thread: { revision: 6 },
    });
  });
});
