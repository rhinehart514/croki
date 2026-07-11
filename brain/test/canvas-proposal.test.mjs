import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-proposal-"));
process.env.GTM_IDE_HOME = home;
process.env.GTM_IDE_PERSISTENCE = "json";
const { createProject } = await import("../src/project-store.mjs");
const { createOperatorSession } = await import("../src/operator-store.mjs");
const { createOperatorBridge } = await import("../src/operator-mcp.mjs");
const { createWorkArtifact, getWorkArtifact, reviseWorkArtifact } = await import("../src/work-artifact-store.mjs");
const { objectGraphLayoutStore } = await import("../src/object-graph-store.mjs");
const { canvasStructureHistoryStore } = await import("../src/canvas-structure-history.mjs");
const { createOpenCanvasRoutes } = await import("../src/routes/open-canvas.mjs");
const { claimFounderSession, founderBootstrapCode } = await import("../src/routes/session-guard.mjs");
const { closePersistence } = await import("../src/persistence.mjs");

function browserCookie() {
  let value = "";
  claimFounderSession({ method: "POST", headers: {} }, { setHeader(_name, next) { value = next; } }, founderBootstrapCode());
  return value.split(";")[0];
}

async function request(handler, pathname, body, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = "POST";
  req.headers = { "content-type": "application/json", ...headers };
  let status = 0;
  let text = "";
  const res = { writeHead(next) { status = next; }, end(next) { text += next ?? ""; } };
  await handler({ req, res, url: new URL(pathname, "http://local") });
  return { status, payload: JSON.parse(text) };
}

function layoutProposal(id, expectedRevision, position) {
  return {
    id,
    kind: "canvas-change-proposal",
    title: `Move ${id}`,
    status: "proposed",
    format: "json",
    contentType: "application/vnd.drover.canvas-change-proposal+json",
    content: {
      schemaVersion: 1,
      title: `Move ${id}`,
      operation: {
        type: "layout",
        expectedRevision,
        geometry: { positions: { "anchor:goal:g1": position } },
      },
    },
    createdBy: { type: "model-worker", id: "codex" },
  };
}

test("typed canvas proposals remain inert model work until an authenticated founder applies one exact CAS mutation", async () => {
  try {
    createProject({ id: "p1", name: "One" });
    createProject({ id: "p2", name: "Two" });
    const session = createOperatorSession({ projectId: "p1", goal: "Arrange the activation work", runtime: "codex" });
    const bridge = createOperatorBridge({ sessionId: session.id });

    const recorded = await bridge.callTool("record", {
      kind: "canvas_proposal",
      idempotencyKey: "operator:layout-proposal",
      value: {
        id: "layout-proposal",
        title: "Move goal",
        rationale: "Keep the goal next to its evidence",
        operation: {
          type: "layout",
          expectedRevision: 0,
          geometry: { positions: { "anchor:goal:g1": { x: 120, y: 80 } } },
        },
      },
    });

    const proposal = recorded.result.recorded.artifact;
    assert.equal(proposal.kind, "canvas-change-proposal");
    assert.equal(proposal.status, "proposed");
    assert.deepEqual(objectGraphLayoutStore.loadNamespace("p1").positions, {}, "recording model work must not mutate canvas authority");
    assert.deepEqual(canvasStructureHistoryStore.list("p1").entries, [], "recording a proposal must not forge structural history");

    const handler = createOpenCanvasRoutes();
    const route = "/api/projects/p1/work-artifacts/layout-proposal/apply-proposal";
    const body = { expectedArtifactRevision: proposal.revision, idempotencyKey: "apply-proposal" };
    const cookie = browserCookie();

    assert.equal((await request(handler, route, body)).status, 403, "an unauthenticated request cannot apply a proposal");
    assert.equal((await request(handler, route, body, { cookie, "x-gtm-actor": "agent" })).status, 403, "an agent cannot borrow a founder session");
    assert.deepEqual(objectGraphLayoutStore.loadNamespace("p1").positions, {});

    const applied = await request(handler, route, body, { cookie });
    assert.equal(applied.status, 200);
    const layout = objectGraphLayoutStore.loadNamespace("p1");
    assert.equal(layout.revision, 1);
    assert.deepEqual(layout.positions, { "anchor:goal:g1": { x: 120, y: 80 } });

    const history = canvasStructureHistoryStore.list("p1");
    assert.equal(history.entries.length, 1);
    assert.equal(history.entries[0].scope, "layout");
    assert.equal(history.entries[0].actor, "founder");
    assert.deepEqual(history.entries[0].before.positions, {});
    assert.deepEqual(history.entries[0].after.positions, { "anchor:goal:g1": { x: 120, y: 80 } });
    assert.equal(applied.payload.structureReceipt.id, history.entries[0].id);
    const appliedArtifact = getWorkArtifact("p1", "layout-proposal");
    assert.equal(appliedArtifact.status, "applied");
    assert.equal(appliedArtifact.content.appliedReceipt.structureReceiptId, history.entries[0].id);

    const staleStructure = createWorkArtifact("p1", layoutProposal("stale-structure", 0, { x: 400, y: 300 }), {
      expectedStoreRevision: 2,
      idempotencyKey: "create-stale-structure",
    });
    const staleStructureResult = await request(handler, "/api/projects/p1/work-artifacts/stale-structure/apply-proposal", {
      expectedArtifactRevision: staleStructure.revision,
      idempotencyKey: "apply-stale-structure",
    }, { cookie });
    assert.equal(staleStructureResult.status, 409, "a stale structural CAS must be rejected");
    assert.equal(getWorkArtifact("p1", "stale-structure").status, "proposed");
    assert.deepEqual(objectGraphLayoutStore.loadNamespace("p1").positions, { "anchor:goal:g1": { x: 120, y: 80 } });

    const staleHead = createWorkArtifact("p1", layoutProposal("stale-head", 1, { x: 500, y: 350 }), {
      expectedStoreRevision: 3,
      idempotencyKey: "create-stale-head",
    });
    reviseWorkArtifact("p1", "stale-head", {
      expectedArtifactRevision: staleHead.revision,
      summary: "Founder clarified the rationale",
      revisionAuthor: { type: "founder", id: "founder" },
      idempotencyKey: "revise-stale-head",
    });
    const staleHeadResult = await request(handler, "/api/projects/p1/work-artifacts/stale-head/apply-proposal", {
      expectedArtifactRevision: staleHead.revision,
      idempotencyKey: "apply-stale-head",
    }, { cookie });
    assert.equal(staleHeadResult.status, 409, "a stale proposal head must be rejected");
    assert.equal(getWorkArtifact("p1", "stale-head").status, "proposed");

    const foreign = await request(handler, "/api/projects/p2/work-artifacts/layout-proposal/apply-proposal", body, { cookie });
    assert.equal(foreign.status, 404, "a proposal cannot cross project authority boundaries");
    assert.deepEqual(objectGraphLayoutStore.loadNamespace("p2").positions, {});
    assert.deepEqual(canvasStructureHistoryStore.list("p2").entries, []);
  } finally {
    closePersistence();
    fs.rmSync(home, { recursive: true, force: true });
  }
});
