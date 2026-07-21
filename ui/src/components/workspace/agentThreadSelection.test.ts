import { describe, expect, it } from "vitest";
import type { WorkIndexItem } from "@/api";
import { latestAgentThread } from "./agentThreadSelection";

const item = (threadRef: string, participantRefs: string[], createdAt: string): WorkIndexItem => ({
  threadRef, ventureRef: "venture:v", parentThreadRef: null, originMessageRef: null, subjectRefs: [], focusRef: threadRef,
  founderIntent: threadRef, lifecycle: "open", activity: "idle", attention: "none", terminal: null, unread: false,
  reviewedThrough: null, latestMeaningfulEvent: { kind: "created", ref: threadRef, at: createdAt, summary: null }, runRefs: [],
  pinnedAt: null, participantRefs, activeParticipantRefs: [], createdAt, updatedAt: createdAt,
});

describe("latestAgentThread", () => {
  it("opens the newest durable thread for the explicitly directed agent", () => {
    expect(latestAgentThread([
      item("thread:other", ["kai"], "2026-07-20T12:03:00.000Z"),
      item("thread:old", ["mara"], "2026-07-20T12:01:00.000Z"),
      item("thread:new", ["mara"], "2026-07-20T12:02:00.000Z"),
    ], "mara")?.threadRef).toBe("thread:new");
  });
});
