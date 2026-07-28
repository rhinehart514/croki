import { beforeEach, describe, expect, it } from "vitest";
import type { ThreadTimeline, WorkIndex } from "./work";
import { createWorkProtocolState, seedThreadProjection, seedWorkProjection } from "./work-protocol";
import { readWorkProtocolCache, writeWorkProtocolCache } from "./work-protocol-cache";

const work = {
  ventureId: "venture-a",
  revision: 4,
  items: [],
  counts: { total: 0, attention: 0, active: 0, unread: 0, matchCount: 0 },
  legacy: { unindexedRunCount: 0 },
} satisfies WorkIndex;

const thread = {
  ventureId: "venture-a",
  revision: 5,
  thread: { threadRef: "thread:one" },
  items: [],
  agents: [],
  visuals: [],
} as unknown as ThreadTimeline;

describe("last-coherent Work projection cache", () => {
  beforeEach(() => localStorage.clear());

  it("hydrates only the exact Project and Thread scope", () => {
    const seeded = seedThreadProjection(
      seedWorkProjection(createWorkProtocolState("venture-a"), work),
      thread,
    );
    writeWorkProtocolCache(seeded, "thread:one");

    expect(readWorkProtocolCache("venture-a", "thread:one")).toMatchObject({
      work: { value: { ventureId: "venture-a", revision: 4 } },
      threads: { "thread:one": { value: { ventureId: "venture-a", revision: 5 } } },
    });
    expect(readWorkProtocolCache("venture-b", "thread:one")).toBeNull();
    expect(readWorkProtocolCache("venture-a", "thread:other")).toBeNull();
  });

  it("rejects a stale schema version and a payload that names another Project", () => {
    const cacheKey = "drover:work-projection-cache:v1:venture-a:thread%3Aone";
    localStorage.setItem(cacheKey, JSON.stringify({
      version: 0,
      ventureId: "venture-a",
      cursor: 2,
      projectionRevision: 4,
      threads: [],
      work: { revision: 4, value: work },
    }));
    expect(readWorkProtocolCache("venture-a", "thread:one")).toBeNull();

    localStorage.setItem(cacheKey, JSON.stringify({
      version: 1,
      ventureId: "venture-a",
      cursor: 2,
      projectionRevision: 4,
      threads: [],
      work: { revision: 4, value: { ...work, ventureId: "venture-b" } },
    }));
    expect(readWorkProtocolCache("venture-a", "thread:one")).toBeNull();
  });

  it("lets a fresh fallback read replace equal-revision cached facts while a live stream stays authoritative", () => {
    const cachedThread = { ...thread, items: [{ kind: "review", state: "waiting" }] } as unknown as ThreadTimeline;
    const reviewedThread = { ...thread, items: [{ kind: "review", state: "approved" }] } as unknown as ThreadTimeline;
    const cachedWork = { ...work, counts: { ...work.counts, attention: 1 } };
    const refreshedWork = { ...work, counts: { ...work.counts, attention: 0 } };
    const cached = seedThreadProjection(
      seedWorkProjection(createWorkProtocolState("venture-a"), cachedWork),
      cachedThread,
    );
    const degraded = { ...cached, transportSync: "degraded" as const };
    const refreshed = seedThreadProjection(seedWorkProjection(degraded, refreshedWork), reviewedThread);

    expect(refreshed.threads["thread:one"].value.items).toEqual([{ kind: "review", state: "approved" }]);
    expect(refreshed.work?.value.counts.attention).toBe(0);

    const live = { ...cached, transportSync: "live" as const };
    const preserved = seedThreadProjection(seedWorkProjection(live, refreshedWork), reviewedThread);
    expect(preserved.threads["thread:one"].value.items).toEqual([{ kind: "review", state: "waiting" }]);
    expect(preserved.work?.value.counts.attention).toBe(1);
  });
});
