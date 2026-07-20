import { describe, expect, it } from "vitest";
import type { SystemIndexObject, WorkIndex, WorkIndexItem } from "@/api";
import { linkedWork, systemAgentContext, systemWorkState } from "./systemWorkState";

const object = { id: "offer", objectRef: "object:offer", threadRefs: ["thread:older", "thread:newer"] } as SystemIndexObject;

function item(overrides: Partial<WorkIndexItem>): WorkIndexItem {
  return {
    threadRef: "thread:newer", ventureRef: "venture:v", parentThreadRef: null, originMessageRef: null,
    subjectRefs: ["object:offer"], focusRef: "object:offer", founderIntent: "Improve offer", lifecycle: "open",
    activity: "idle", attention: "none", terminal: null, unread: false, reviewedThrough: null,
    latestMeaningfulEvent: { kind: "created", ref: "thread:newer", at: null, summary: null }, runRefs: [],
    pinnedAt: null, participantRefs: [], activeParticipantRefs: [], createdAt: null, updatedAt: null, ...overrides,
  };
}

function index(items: WorkIndexItem[]): WorkIndex {
  return { ventureId: "v", revision: 1, items, counts: { total: items.length, attention: 0, active: 0, unread: 0, matchCount: items.length }, legacy: { unindexedRunCount: 0 } };
}

describe("system work state", () => {
  it("maps only honest WorkIndex states", () => {
    expect(systemWorkState(item({ activity: "running" }))).toBe("working");
    expect(systemWorkState(item({ attention: "review" }))).toBe("needs-review");
    expect(systemWorkState(item({ attention: "failure", activity: "running" }))).toBe("failed");
    expect(systemWorkState(item({ terminal: "completed" }))).toBe("completed");
    expect(systemWorkState(item({ terminal: "cancelled" }))).toBeNull();
  });

  it("selects the latest linked thread and preserves the object as subject context", () => {
    const older = item({ threadRef: "thread:older", updatedAt: "2026-07-01T00:00:00.000Z" });
    const newer = item({ threadRef: "thread:newer", activity: "running", updatedAt: "2026-07-19T00:00:00.000Z" });
    const workIndex = index([older, newer, item({ threadRef: "thread:unrelated" })]);
    expect(linkedWork(object, workIndex).map((entry) => entry.threadRef)).toEqual(["thread:newer", "thread:older"]);
    expect(systemAgentContext(object, workIndex)).toMatchObject({ objectRef: "object:offer", subjectRefs: ["object:offer"], threadRef: "thread:newer", state: "working" });
  });

  it("uses the most important linked state without manufacturing a thread", () => {
    const workIndex = index([
      item({ threadRef: "thread:older", attention: "failure" }),
      item({ threadRef: "thread:newer", activity: "running" }),
    ]);
    expect(systemAgentContext(object, workIndex).state).toBe("failed");
    expect(systemAgentContext({ ...object, threadRefs: [] }, workIndex)).toMatchObject({ threadRef: null, thread: null, state: null });
  });
});
