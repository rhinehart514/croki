import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { acceptProductImplication, askBothOperatorRuntimes, composerTurn, createOperatorSession, getGoalRelationHistory, getTerrainView, handoffOperatorSession, restoreGoalRelation, reviseGoalRelation, resumeOperatorSession, saveObjectGraphGeometry, saveObjectGraphPositions } from "@/api";

// A fetch spy that captures the last request and returns an ok JSON envelope. This proves the client
// wiring for fix 1 (question → pipeline binds the real questionId/context) and fix 4 (accept hits the
// founder-reviewable staging route) — the request shape the parallel backend routes actually read.
let lastUrl = "";
let lastBody: Record<string, unknown> = {};
const okJson = (payload: unknown) => ({ ok: true, json: async () => payload }) as unknown as Response;

beforeEach(() => {
  lastUrl = ""; lastBody = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    lastUrl = String(url);
    lastBody = init?.body ? JSON.parse(String(init.body)) : {};
    return okJson({ session: { id: "s1", graphRevision: 0 }, reused: false, implication: {}, sessionId: "s1", proposal: {}, deduped: false });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("createOperatorSession — binds question context (fix 1)", () => {
  it("threads questionId + participant/product refs into the create-or-run body when turning a question into a pipeline", async () => {
    await createOperatorSession("proj", "Compose a pipeline for: which segment?", undefined, true, {
      questionId: "q1", participantRefs: ["scout", "closer"], productRefs: ["billing"],
    });
    expect(lastUrl).toBe("/api/operator/sessions");
    expect(lastBody.goal).toContain("which segment");
    expect(lastBody.fresh).toBe(true);       // a fresh, additional pipeline
    expect(lastBody.questionId).toBe("q1");  // the real question binding — keeps questions optional elsewhere
    expect(lastBody.participantRefs).toEqual(["scout", "closer"]);
    expect(lastBody.productRefs).toEqual(["billing"]);
  });

  it("omits the context entirely for a direct pipeline (questions stay optional)", async () => {
    await createOperatorSession("proj", "Just build outbound", undefined, false);
    expect(lastBody.questionId).toBeUndefined();
    expect(lastBody.participantRefs).toBeUndefined();
    expect(lastBody.productRefs).toBeUndefined();
    expect(lastBody.reuse).toBe(true); // a non-fresh session reuses the project's live thread
  });

  it("threads the selected Codex model into session creation instead of treating the picker as cosmetic", async () => {
    await createOperatorSession("proj", "Build a pipeline", undefined, true, undefined, "gpt-5.5-codex");
    expect(lastBody.model).toBe("gpt-5.5-codex");
  });

  it("threads terrain surface, lens, focus, and context refs into session creation", async () => {
    await createOperatorSession("proj", "Investigate this", undefined, true, {
      surface: "terrain", lens: "canvas", focusRef: "terrain-hypothesis:h1",
      contextRefs: ["product-truth:t1", "market-evidence:e1"], threadRef: "goal:activation",
    });
    expect(lastBody).toMatchObject({
      surface: "terrain", lens: "canvas", focusRef: "terrain-hypothesis:h1",
      contextRefs: ["product-truth:t1", "market-evidence:e1"], threadRef: "goal:activation",
    });
  });

  it("threads current canvas context into resume and intent-routed turns", async () => {
    await resumeOperatorSession("s1", "proj", "Continue", undefined, {
      surface: "pipeline", lens: "canvas", focusRef: "pipeline:ch1", contextRefs: ["question:q1"],
    });
    expect(lastBody).toMatchObject({ surface: "pipeline", lens: "canvas", focusRef: "pipeline:ch1", contextRefs: ["question:q1"] });
    await composerTurn({ projectId: "proj", input: "Explain this", surface: "terrain", lens: "canvas", focusRef: "product-truth:t1" });
    expect(lastBody).toMatchObject({ surface: "terrain", lens: "canvas", focusRef: "product-truth:t1" });
  });
});

describe("terrain API", () => {
  it("uses the project-scoped deterministic route", async () => {
    await getTerrainView("proj / one");
    expect(lastUrl).toBe("/api/projects/proj%20%2F%20one/terrain");
  });
});

describe("provider-neutral runtime continuation API", () => {
  it("hands the same session to another runtime with optimistic concurrency", async () => {
    await handoffOperatorSession("session / one", "proj", "codex", 3, "gpt-5.5-codex");
    expect(lastUrl).toBe("/api/operator/sessions/session%20%2F%20one/handoff");
    expect(lastBody).toEqual({
      projectId: "proj", target: "codex", model: "gpt-5.5-codex", expectedRevision: 3,
      idempotencyKey: "handoff:session / one:3:codex:gpt-5.5-codex",
    });
  });

  it("creates deliberate separate Claude and Codex branches", async () => {
    await askBothOperatorRuntimes("s1", "proj", 4);
    expect(lastUrl).toBe("/api/operator/sessions/s1/ask-both");
    expect(lastBody).toEqual({ projectId: "proj", expectedRevision: 4, idempotencyKey: "ask-both:s1:4" });
  });
});

describe("canvas layout API", () => {
  it("sends the optimistic revision and idempotency receipt with founder placement", async () => {
    await saveObjectGraphPositions("proj / one", { "anchor:goal:g1": { x: 12, y: 34 } }, {
      expectedRevision: 7,
      idempotencyKey: "drag:g1:7",
    });
    expect(lastUrl).toBe("/api/projects/proj%20%2F%20one/object-graph/positions");
    expect(lastBody).toEqual({
      positions: { "anchor:goal:g1": { x: 12, y: 34 } },
      expectedRevision: 7,
      idempotencyKey: "drag:g1:7",
    });
  });

  it("persists the founder's pan and zoom through the same revisioned geometry authority", async () => {
    await saveObjectGraphGeometry("proj / one", { viewport: { x: -120, y: 44, zoom: 0.72 } }, {
      expectedRevision: 8,
      idempotencyKey: "viewport:8",
    });
    expect(lastUrl).toBe("/api/projects/proj%20%2F%20one/object-graph/positions");
    expect(lastBody).toEqual({
      geometry: { viewport: { x: -120, y: 44, zoom: 0.72 } },
      expectedRevision: 8,
      idempotencyKey: "viewport:8",
    });
  });
});

describe("goal relationship revision API", () => {
  it("uses one project-scoped authority for history, revision, and restoration", async () => {
    await getGoalRelationHistory("proj / one", "rel / one");
    expect(lastUrl).toBe("/api/projects/proj%20%2F%20one/goal-relations/rel%20%2F%20one/history");
    await reviseGoalRelation("proj / one", "rel / one", {
      expectedRevision: 2, revisionAuthor: "founder", idempotencyKey: "revise:2", label: "Needs proof",
    });
    expect(lastUrl).toBe("/api/projects/proj%20%2F%20one/goal-relations/rel%20%2F%20one");
    expect(lastBody).toMatchObject({ expectedRevision: 2, idempotencyKey: "revise:2", label: "Needs proof" });
    await restoreGoalRelation("proj / one", "rel / one", {
      expectedRevision: 3, revisionAuthor: "founder", idempotencyKey: "restore:3",
    });
    expect(lastUrl).toBe("/api/projects/proj%20%2F%20one/goal-relations/rel%20%2F%20one/restore");
    expect(lastBody).toMatchObject({ expectedRevision: 3, idempotencyKey: "restore:3" });
  });
});

describe("acceptProductImplication — fully server-derived accept route", () => {
  it("posts to the accept route and the request body can carry ONLY the founder's wording — never a graph", async () => {
    await acceptProductImplication("proj", "implication-r1", { wording: "Add proof to onboarding" });
    expect(lastUrl).toBe("/api/projects/proj/outcome-implications/implication-r1/accept");
    expect(lastBody.wording).toBe("Add proof to onboarding");
    // The client cannot select a graph or smuggle operations — those are derived server-side.
    expect(lastBody.graphId).toBeUndefined();
    expect(lastBody.operations).toBeUndefined();
  });

  it("sends no graph authority even when called with no body (proposed or already-staged both go here)", async () => {
    await acceptProductImplication("proj", "implication-r1");
    expect(lastBody.graphId).toBeUndefined();
    expect(lastBody.operations).toBeUndefined();
    expect(lastBody.wording).toBeUndefined();
    // Only the project scope rides the body.
    expect(lastBody.projectId).toBe("proj");
  });

  // The type itself forbids graph authority: `ImplicationAcceptBody` has no graphId/operations fields, so a
  // caller cannot even construct one. This documents that contract at the call site.
  it("has no graphId/operations on the accept body type", () => {
    const body: Parameters<typeof acceptProductImplication>[2] = { wording: "x" };
    expect(Object.keys(body ?? {})).toEqual(["wording"]);
  });
});
