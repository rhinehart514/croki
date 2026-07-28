import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkIndex } from "@/api/work";
import { createWorkProtocolClient } from "./useWorkProtocol";

function work(revision: number): WorkIndex {
  return {
    ventureId: "venture-a",
    revision,
    items: [],
    counts: { total: revision, attention: 0, active: 0, unread: 0, matchCount: 0 },
    legacy: { unindexedRunCount: 0 },
  };
}

describe("Work protocol client", () => {
  afterEach(() => vi.useRealTimers());

  it("repairs a dropped-frame gap from the last applied cursor and retains coherent Work", async () => {
    vi.useFakeTimers();
    const requests: Array<{ ventureId: string; cursor: number }> = [];
    const relays: Array<(frame: DroverWorkFrame) => void> = [];
    const subscriber = vi.fn(async (input, listener: (frame: DroverWorkFrame) => void) => {
      requests.push({ ventureId: input.ventureId, cursor: input.cursor });
      relays.push(listener);
      return () => {};
    });
    const client = createWorkProtocolClient("venture-a", subscriber, 20);
    const stop = client.subscribe(() => {});
    await Promise.resolve();

    relays[0]({
      frame: "handshake",
      schemaVersion: 1,
      minSchemaVersion: 1,
      serverInstanceId: "brain-a",
      ventureId: "venture-a",
      cursor: 0,
      mode: "snapshot",
      projectionRevision: 0,
      snapshot: {
        ventureId: "venture-a",
        cursor: 0,
        threadRevision: 0,
        workRevision: 0,
        thread: null,
        work: work(0),
      },
    });
    relays[0]({
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-a",
      sequence: 2,
      projection: "work",
      projectionRevision: 2,
      payload: work(2),
    });

    expect(client.getSnapshot().cursor).toBe(0);
    expect(client.getSnapshot().work?.value.revision).toBe(0);
    await vi.advanceTimersByTimeAsync(20);
    expect(requests.at(-1)).toEqual({ ventureId: "venture-a", cursor: 0 });

    const replay = relays.at(-1)!;
    replay({
      frame: "handshake",
      schemaVersion: 1,
      minSchemaVersion: 1,
      serverInstanceId: "brain-b",
      ventureId: "venture-a",
      cursor: 2,
      mode: "resume",
      projectionRevision: 2,
    });
    replay({
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-a",
      sequence: 1,
      projection: "work",
      projectionRevision: 1,
      payload: work(1),
    });
    replay({
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-a",
      sequence: 2,
      projection: "work",
      projectionRevision: 2,
      payload: work(2),
    });

    expect(client.getSnapshot().cursor).toBe(2);
    expect(client.getSnapshot().projectionRevision).toBe(2);
    expect(client.getSnapshot().work?.value.revision).toBe(2);
    expect(client.getSnapshot().workSync).toBe("current");
    stop();
  });
});
