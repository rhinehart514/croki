import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/api";
import type { JsonValue } from "@/openCanvasTypes";

type CapturedRequest = { url: string; method: string; body?: unknown };

const requests: CapturedRequest[] = [];
const okJson = () => ({ ok: true, status: 200, json: async () => ({}) }) as Response;

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(url),
      method: init?.method ?? "GET",
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    return okJson();
  }));
});

afterEach(() => vi.unstubAllGlobals());

const founder = { type: "founder", id: "founder-1" } as const;

describe("open-canvas reads", () => {
  it("uses encoded project and record ids, exact routes, and opt-in retired records", async () => {
    await api.listGoals("project / north", { includeRetired: true });
    await api.getGoal("project / north", "goal / 1", { includeRetired: true });
    await api.listGoalRelations("project / north");
    await api.listWorkArtifacts("project / north", { includeRetired: true });
    await api.getWorkArtifact("project / north", "artifact / 1", { includeRetired: true });
    await api.getWorkArtifactHistory("project / north", "artifact / 1");
    await api.listWorkRelationships("project / north", { includeRetired: true });
    await api.getWorkRelationship("project / north", "edge / 1", { includeRetired: true });
    await api.getWorkRelationshipHistory("project / north", "edge / 1");
    await api.listCanvasRegions("project / north", { includeRetired: true });
    await api.getCanvasRegion("project / north", "region / 1");

    expect(requests).toEqual([
      { url: "/api/projects/project%20%2F%20north/goals?includeRetired=true", method: "GET" },
      { url: "/api/projects/project%20%2F%20north/goals/goal%20%2F%201?includeRetired=true", method: "GET" },
      { url: "/api/projects/project%20%2F%20north/goal-relations", method: "GET" },
      { url: "/api/projects/project%20%2F%20north/work-artifacts?includeRetired=true", method: "GET" },
      { url: "/api/projects/project%20%2F%20north/work-artifacts/artifact%20%2F%201?includeRetired=true", method: "GET" },
      { url: "/api/projects/project%20%2F%20north/work-artifacts/artifact%20%2F%201/history", method: "GET" },
      { url: "/api/projects/project%20%2F%20north/work-relationships?includeRetired=true", method: "GET" },
      { url: "/api/projects/project%20%2F%20north/work-relationships/edge%20%2F%201?includeRetired=true", method: "GET" },
      { url: "/api/projects/project%20%2F%20north/work-relationships/edge%20%2F%201/history", method: "GET" },
      { url: "/api/projects/project%20%2F%20north/canvas-regions?includeRetired=true", method: "GET" },
      { url: "/api/projects/project%20%2F%20north/canvas-regions/region%20%2F%201", method: "GET" },
    ]);
  });
});

describe("open-canvas goal writes", () => {
  it("sends exact methods, paths, idempotency keys, revisions, and open relation labels", async () => {
    const create = {
      idempotencyKey: "goal:create", statement: "Understand activation", createdBy: "founder",
      scopeRefs: [{ type: "product-truth", id: "onboarding" }],
    };
    const revise = {
      idempotencyKey: "goal:revise", revisionAuthor: "founder", expectedRevision: 2,
      desiredChange: "More invited teammates return",
    };
    const status = {
      idempotencyKey: "goal:status", revisionAuthor: "founder", expectedRevision: 3,
      status: "waiting" as const, statusReason: "Needs outside evidence",
    };
    const retire = { idempotencyKey: "goal:retire", revisionAuthor: "founder", expectedRevision: 4 };
    const createRelation = {
      idempotencyKey: "relation:create",
      sourceRef: { type: "goal", id: "goal / 1" }, targetRef: { type: "goal", id: "goal-2" },
      kind: "shares an emerging proof shape with", basis: ["Founder connected these"],
      provenance: "founder-stated", createdBy: "founder",
    };
    const reviseRelation = {
      idempotencyKey: "relation:revise", revisionAuthor: "codex", expectedRevision: 1,
      kind: "complicates in a new way", basis: [{ type: "reasoning", statement: "Observed overlap" }],
    };
    const retireRelation = {
      idempotencyKey: "relation:retire", revisionAuthor: "founder", expectedRevision: 2,
    };

    await api.createGoal("p", create);
    await api.reviseGoal("p", "goal / 1", revise);
    await api.changeGoalStatus("p", "goal / 1", status);
    await api.retireGoal("p", "goal / 1", retire);
    await api.createGoalRelation("p", createRelation);
    await api.reviseGoalRelation("p", "relation / 1", reviseRelation);
    await api.retireGoalRelation("p", "relation / 1", retireRelation);

    expect(requests).toEqual([
      { url: "/api/projects/p/goals", method: "POST", body: create },
      { url: "/api/projects/p/goals/goal%20%2F%201", method: "PATCH", body: revise },
      { url: "/api/projects/p/goals/goal%20%2F%201/status", method: "POST", body: status },
      { url: "/api/projects/p/goals/goal%20%2F%201/retire", method: "POST", body: retire },
      { url: "/api/projects/p/goal-relations", method: "POST", body: createRelation },
      { url: "/api/projects/p/goal-relations/relation%20%2F%201", method: "PATCH", body: reviseRelation },
      { url: "/api/projects/p/goal-relations/relation%20%2F%201/retire", method: "POST", body: retireRelation },
    ]);
  });
});

describe("open-canvas artifact and relationship writes", () => {
  it("preserves open content and sends every mutation to its exact persistence route", async () => {
    const openContent: JsonValue = {
      rendererNobodyHasNamedYet: { answer: 42, branches: ["alpha", "beta"] },
    };
    const createArtifact = {
      idempotencyKey: "artifact:create", expectedStoreRevision: 7, id: "artifact-a",
      kind: "unknown-map-from-the-future", status: "waiting-under-a-tree",
      contentType: "application/vnd.future-map+json", content: openContent, createdBy: founder,
    };
    const reviseArtifact = {
      idempotencyKey: "artifact:revise", expectedArtifactRevision: 1,
      content: { ...openContent, revised: true }, createdBy: founder,
    };
    const branchArtifact = {
      idempotencyKey: "artifact:branch", expectedArtifactRevision: 2,
      id: "artifact-b", content: "an open text alternative", createdBy: founder,
    };
    const retireArtifact = {
      idempotencyKey: "artifact:retire", expectedArtifactRevision: 1,
      reason: "Keep it reversible", createdBy: founder,
    };
    const restoreArtifact = {
      idempotencyKey: "artifact:restore", expectedArtifactRevision: 2, revision: 1, createdBy: founder,
    };
    const createRelationship = {
      idempotencyKey: "edge:create", expectedStoreRevision: 12,
      sourceRef: { type: "work-artifact", id: "artifact-a" },
      targetRef: { type: "work-artifact", id: "artifact-b" },
      kind: "unrecognized-yet-valid-relationship", basis: [{ reasoning: "Founder connected them" }],
      provenance: "founder-stated", createdBy: founder,
    };
    const reviseRelationship = {
      idempotencyKey: "edge:revise", expectedRelationshipRevision: 1,
      kind: "complicates", basis: [], provenance: "proven", createdBy: founder,
    };
    const retireRelationship = {
      idempotencyKey: "edge:retire", expectedRelationshipRevision: 2, createdBy: founder,
    };
    const restoreRelationship = {
      idempotencyKey: "edge:restore", expectedRelationshipRevision: 3, createdBy: founder,
    };

    await api.createWorkArtifact("p", createArtifact);
    await api.reviseWorkArtifact("p", "artifact-a", reviseArtifact);
    await api.branchWorkArtifact("p", "artifact-a", branchArtifact);
    await api.retireWorkArtifact("p", "artifact-b", retireArtifact);
    await api.restoreWorkArtifact("p", "artifact-b", restoreArtifact);
    await api.createWorkRelationship("p", createRelationship);
    await api.reviseWorkRelationship("p", "edge-a", reviseRelationship);
    await api.retireWorkRelationship("p", "edge-a", retireRelationship);
    await api.restoreWorkRelationship("p", "edge-a", restoreRelationship);

    expect(requests).toEqual([
      { url: "/api/projects/p/work-artifacts", method: "POST", body: createArtifact },
      { url: "/api/projects/p/work-artifacts/artifact-a", method: "PATCH", body: reviseArtifact },
      { url: "/api/projects/p/work-artifacts/artifact-a/branch", method: "POST", body: branchArtifact },
      { url: "/api/projects/p/work-artifacts/artifact-b/retire", method: "POST", body: retireArtifact },
      { url: "/api/projects/p/work-artifacts/artifact-b/restore", method: "POST", body: restoreArtifact },
      { url: "/api/projects/p/work-relationships", method: "POST", body: createRelationship },
      { url: "/api/projects/p/work-relationships/edge-a", method: "PATCH", body: reviseRelationship },
      { url: "/api/projects/p/work-relationships/edge-a/retire", method: "POST", body: retireRelationship },
      { url: "/api/projects/p/work-relationships/edge-a/restore", method: "POST", body: restoreRelationship },
    ]);
    expect(requests[0]?.body).toMatchObject({
      kind: "unknown-map-from-the-future",
      status: "waiting-under-a-tree",
      contentType: "application/vnd.future-map+json",
      content: openContent,
    });
  });
});

describe("open-canvas region writes", () => {
  it("keeps region geometry and lifecycle on the project-scoped persistence surface", async () => {
    const create = {
      idempotencyKey: "region:create", expectedStoreRevision: 0, title: "Fix activation",
      purpose: "Keep evidence and alternatives together", memberRefs: [{ type: "goal", id: "activation" }],
      position: { x: 120, y: 80 }, size: { width: 720, height: 480 },
      createdBy: "founder", revisionAuthor: "founder",
    };
    const revise = {
      idempotencyKey: "region:revise", expectedRevision: 0, revisionAuthor: "founder",
      position: { x: 240, y: 160 }, collapsed: true,
    };
    const archive = { idempotencyKey: "region:archive", expectedRevision: 1, revisionAuthor: "founder" };
    const reopen = { idempotencyKey: "region:reopen", expectedRevision: 2, revisionAuthor: "founder" };

    await api.createCanvasRegion("p", create);
    await api.reviseCanvasRegion("p", "region / 1", revise);
    await api.archiveCanvasRegion("p", "region / 1", archive);
    await api.reopenCanvasRegion("p", "region / 1", reopen);

    expect(requests).toEqual([
      { url: "/api/projects/p/canvas-regions", method: "POST", body: create },
      { url: "/api/projects/p/canvas-regions/region%20%2F%201", method: "PATCH", body: revise },
      { url: "/api/projects/p/canvas-regions/region%20%2F%201/archive", method: "POST", body: archive },
      { url: "/api/projects/p/canvas-regions/region%20%2F%201/reopen", method: "POST", body: reopen },
    ]);
  });
});

describe("open-canvas conflict decisions", () => {
  it("keeps founder decisions and their history on the project-scoped persistence surface", async () => {
    const input = {
      idempotencyKey: "conflict:resolve",
      expectedStoreRevision: 2,
      expectedDecisionRevision: 0,
      resolution: "choose-goal" as const,
      chosenGoalRef: { type: "goal", id: "activation" },
      note: "Activation owns this change.",
      decidedBy: { type: "founder" as const, id: "jacob" },
    };
    await api.listGoalConflictDecisions("p");
    await api.recordGoalConflictDecision("p", "goal-conflict:work-artifact:shared / one", input);
    await api.getGoalConflictDecisionHistory("p", "goal-conflict:work-artifact:shared / one");
    expect(requests).toEqual([
      { url: "/api/projects/p/goal-conflict-decisions", method: "GET", body: undefined },
      { url: "/api/projects/p/goal-conflict-decisions/goal-conflict%3Awork-artifact%3Ashared%20%2F%20one", method: "POST", body: input },
      { url: "/api/projects/p/goal-conflict-decisions/goal-conflict%3Awork-artifact%3Ashared%20%2F%20one/history", method: "GET", body: undefined },
    ]);
  });
});

describe("open-canvas wall boundary", () => {
  it("exports persistence operations but no founder approval or release operation", () => {
    expect("releaseWorkArtifact" in api).toBe(false);
    expect("approveWorkArtifact" in api).toBe(false);
    expect("releaseGoal" in api).toBe(false);
    expect("approveGoal" in api).toBe(false);
  });
});
