import { describe, expect, it } from "vitest";
import type { ReleaseIndex, SystemIndex, WorkIndex } from "@/api";
import { resolveWorkspaceContext } from "./workspaceContext";

const work = { ventureId: "v", revision: 1, counts: { total: 2, attention: 1, active: 0, unread: 0, matchCount: 2 }, legacy: { unindexedRunCount: 0 }, items: [
  { threadRef: "thread:product", ventureRef: "venture:v", parentThreadRef: null, originMessageRef: null, subjectRefs: ["object:product"], focusRef: "object:product", founderIntent: "Product", lifecycle: "open", activity: "idle", attention: "none", terminal: null, unread: false, reviewedThrough: null, latestMeaningfulEvent: { kind: "created", ref: "thread:product", at: null, summary: null }, runRefs: [], pinnedAt: null, participantRefs: [], activeParticipantRefs: [], createdAt: null, updatedAt: "2026-07-18" },
  { threadRef: "thread:release", ventureRef: "venture:v", parentThreadRef: null, originMessageRef: null, subjectRefs: ["object:release"], focusRef: "object:release", founderIntent: "Release", lifecycle: "open", activity: "idle", attention: "decision", terminal: null, unread: false, reviewedThrough: null, latestMeaningfulEvent: { kind: "decision", ref: "decision:one", at: null, summary: null }, runRefs: [], pinnedAt: null, participantRefs: [], activeParticipantRefs: [], createdAt: null, updatedAt: "2026-07-19" },
] } satisfies WorkIndex;
const system = { ventureId: "v", revision: 1, architectureRevision: 1, scope: "system", relationships: [], counts: { total: 2, product: 1, gtm: 0, attention: 0, matchCount: 2 }, objects: [
  { id: "product", objectRef: "object:product", name: "Product", statement: "", type: "capability", territory: "product", assertion: "founder-asserted", provenance: null, properties: {}, compatibilityOwned: false, architectureRole: null, threadRefs: ["thread:product"], attention: [], createdAt: null, updatedAt: "2026-07-18" },
  { id: "release", objectRef: "object:release", name: "Release", statement: "", type: "release", territory: "product", assertion: "founder-asserted", provenance: null, properties: {}, compatibilityOwned: false, architectureRole: null, threadRefs: ["thread:release"], attention: [], createdAt: null, updatedAt: "2026-07-19" },
] } satisfies SystemIndex;
const releases = { ventureId: "v", revision: 1, unassignedActions: [], counts: { needsYou: 1, drafts: 1, inMarket: 0, ended: 0 }, releases: [{ id: "release", releaseRef: "object:release", name: "Release", statement: "", lifecycle: "draft", attention: ["decision"], updatedAt: "2026-07-19", createdAt: null, endedAt: null, endedBy: null, relatedObjectRefs: ["object:product"], threadRefs: ["thread:release"], runRefs: [], decisions: [], outcomes: [], relationships: [], externalRefs: {} }] } satisfies ReleaseIndex;

describe("workspace context resolver", () => {
  it("prefers a release object when a Work thread has several semantic counterparts", () => expect(resolveWorkspaceContext({ from: "work", to: "system", context: { kind: "thread", ref: "thread:release" }, workIndex: work, systemIndex: system, releaseIndex: releases })).toEqual({ kind: "release", ref: "object:release" }));
  it("opens the highest-priority thread from a release", () => expect(resolveWorkspaceContext({ from: "releases", to: "work", context: { kind: "release", ref: "object:release" }, workIndex: work, systemIndex: system, releaseIndex: releases })).toEqual({ kind: "thread", ref: "thread:release" }));
  it("keeps the source context when no counterpart exists", () => expect(resolveWorkspaceContext({ from: "system", to: "releases", context: { kind: "object", ref: "object:missing" }, workIndex: work, systemIndex: system, releaseIndex: releases })).toEqual({ kind: "object", ref: "object:missing" }));
});
