import { describe, expect, it } from "vitest";
import type { ThreadTimeline, WorkIndex } from "./work";
import {
  WORK_PROTOCOL_SCHEMA_VERSION,
  createWorkProtocolState,
  foldWorkHandshake,
  foldWorkPush,
  type WorkProtocolSnapshot,
  type WorkPush,
} from "./work-protocol";

function timeline(
  ventureId: string,
  threadRef: string,
  revision: number,
  marker: string,
): ThreadTimeline {
  return {
    ventureId,
    revision,
    thread: { threadRef, founderIntent: marker },
    items: [],
    agents: [],
    visuals: [],
  } as unknown as ThreadTimeline;
}

function workIndex(ventureId: string, revision: number, marker: number): WorkIndex {
  return {
    ventureId,
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

function threadPush(sequence: number, revision: number, marker: string): WorkPush {
  return {
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
    ventureId: "project-a",
    sequence,
    projectionRevision: revision,
    projection: "thread",
    threadRef: "thread:one",
    value: timeline("project-a", "thread:one", revision, marker),
  };
}

function workPush(sequence: number, revision: number, marker: number): WorkPush {
  return {
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
    ventureId: "project-a",
    sequence,
    projectionRevision: revision,
    projection: "work",
    value: workIndex("project-a", revision, marker),
  };
}

function handshake(
  currentCursor: number,
  delivery: "resume" | "snapshot" = "resume",
  snapshot?: WorkProtocolSnapshot,
) {
  return {
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
    minCompatibleSchemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
    ventureId: "project-a",
    serverInstanceId: "brain-b",
    currentCursor,
    delivery,
    snapshot,
  };
}

describe("ENG-02 ordered Work projection receipts", () => {
  it("converges after reordered, duplicated, and delayed pushes", () => {
    const first = threadPush(1, 1, "first");
    const second = workPush(2, 2, 2);
    const third = threadPush(3, 3, "third");

    const canonical = [first, second, third].reduce(foldWorkPush, createWorkProtocolState("project-a"));
    const adversarial = [third, third, first, first, second, second]
      .reduce(foldWorkPush, createWorkProtocolState("project-a"));

    expect(adversarial.cursor).toBe(3);
    expect(adversarial.pending).toEqual({});
    expect(adversarial.threads["thread:one"]?.value.thread.founderIntent).toBe("third");
    expect(adversarial.work?.value.counts.total).toBe(2);
    expect(adversarial).toEqual(canonical);
  });

  it("preserves the last coherent projection across a dropped frame and resumes at its exact cursor", () => {
    const cached = [threadPush(1, 1, "last coherent"), workPush(2, 2, 2)]
      .reduce(foldWorkPush, createWorkProtocolState("project-a"));
    const reconnecting = foldWorkHandshake(cached, handshake(4));

    expect(reconnecting.cursor).toBe(2);
    expect(reconnecting.threadSync).toBe("catching-up");
    expect(reconnecting.threads["thread:one"]?.value.thread.founderIntent).toBe("last coherent");
    expect(reconnecting.work?.value.counts.total).toBe(2);

    const missingFour = foldWorkPush(reconnecting, threadPush(4, 4, "current"));
    expect(missingFour.cursor).toBe(2);
    expect(missingFour.pending[4]).toBeDefined();
    expect(missingFour.threads["thread:one"]?.value.thread.founderIntent).toBe("last coherent");

    const repaired = foldWorkPush(
      foldWorkPush(missingFour, workPush(3, 3, 3)),
      threadPush(4, 4, "current"),
    );
    expect(repaired.cursor).toBe(4);
    expect(repaired.pending).toEqual({});
    expect(repaired.threadSync).toBe("current");
    expect(repaired.workSync).toBe("current");
    expect(repaired.threads["thread:one"]?.value.thread.founderIntent).toBe("current");
    expect(repaired.work?.value.counts.total).toBe(3);
  });

  it("repairs a gap outside retention with one coherent snapshot and rejects an older replacement", () => {
    const coherent = [threadPush(1, 1, "coherent"), workPush(2, 2, 2)]
      .reduce(foldWorkPush, createWorkProtocolState("project-a"));
    const replacement: WorkProtocolSnapshot = {
      ventureId: "project-a",
      cursor: 20,
      threads: [{
        threadRef: "thread:one",
        revision: 20,
        value: timeline("project-a", "thread:one", 20, "snapshot current"),
      }],
      work: { revision: 20, value: workIndex("project-a", 20, 20) },
    };
    const repaired = foldWorkHandshake(coherent, handshake(20, "snapshot", replacement));

    expect(repaired.cursor).toBe(20);
    expect(repaired.threads["thread:one"]?.value.thread.founderIntent).toBe("snapshot current");
    expect(repaired.work?.value.counts.total).toBe(20);
    expect(repaired.transportSync).toBe("live");

    const older: WorkProtocolSnapshot = {
      ventureId: "project-a",
      cursor: 19,
      threads: [{
        threadRef: "thread:one",
        revision: 19,
        value: timeline("project-a", "thread:one", 19, "stale snapshot"),
      }],
      work: { revision: 19, value: workIndex("project-a", 19, 19) },
    };
    const rejected = foldWorkHandshake(repaired, handshake(19, "snapshot", older));
    expect(rejected.cursor).toBe(20);
    expect(rejected.threads["thread:one"]?.value.thread.founderIntent).toBe("snapshot current");
    expect(rejected.work?.value.counts.total).toBe(20);
  });

  it("keeps an unsnapshotted Thread coherent but stale instead of claiming it is current", () => {
    const coherent = [threadPush(1, 1, "last coherent"), workPush(2, 2, 2)]
      .reduce(foldWorkPush, createWorkProtocolState("project-a"));
    const ventureWideSnapshot: WorkProtocolSnapshot = {
      ventureId: "project-a",
      cursor: 20,
      threads: [],
      work: { revision: 20, value: workIndex("project-a", 20, 20) },
    };
    const repaired = foldWorkHandshake(
      coherent,
      handshake(20, "snapshot", ventureWideSnapshot),
    );

    expect(repaired.cursor).toBe(20);
    expect(repaired.threads["thread:one"]?.value.thread.founderIntent).toBe("last coherent");
    expect(repaired.threadSync).toBe("stale");
    expect(repaired.workSync).toBe("current");
  });

  it("cannot cross-paint another Project even when its push is otherwise newer", () => {
    const projectBPush = {
      ...threadPush(1, 100, "Project B must not paint"),
      ventureId: "project-b",
      value: timeline("project-b", "thread:one", 100, "Project B must not paint"),
    } satisfies WorkPush;
    const state = foldWorkPush(
      foldWorkPush(createWorkProtocolState("project-a"), threadPush(1, 1, "Project A")),
      projectBPush,
    );

    expect(state.ventureId).toBe("project-a");
    expect(state.cursor).toBe(1);
    expect(state.threads["thread:one"]?.value.thread.founderIntent).toBe("Project A");
  });
});
