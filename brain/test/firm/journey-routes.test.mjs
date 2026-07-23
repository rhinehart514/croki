import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "croki-journey-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: journeyRoutes } = await import("../../src/firm/journey-routes.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const { getSemanticModel, mutateSemanticModel } = await import("../../src/firm/semantic-model-store.mjs");
const { saveJourneyMappingProposal } = await import("../../src/firm/journey-mapping-proposals.mjs");

const venture = createVenture({ name: "Journey routes" });
const model = getSemanticModel(venture.id);
mutateSemanticModel({
  ventureId: venture.id,
  baseRevision: model.revision,
  actor: { authority: "agent", id: "page-map" },
  operations: [{
    op: "create-record",
    family: "objects",
    record: {
      id: "page-home", type: "page", name: "Home", statement: "Welcome",
      assertion: "tentative", provenance: { kind: "repository-page", sourceRef: "repository:home" },
      properties: { territory: "product", page: { route: "/", sourceRef: "repository:home" } },
    },
  }],
});

async function call(method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = {
    "content-type": "application/json",
    ...founderHeaders({ method, path: pathname }),
    ...headers,
  };
  let status = 0;
  let raw = "";
  const res = {
    writeHead(next) { status = next; },
    setHeader() {},
    end(next) { raw += next ?? ""; },
  };
  const handled = await journeyRoutes({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(handled, true);
  return { status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("journey routes stage, preview, adopt, list, and preserve exact response envelopes", async () => {
  const content = "sid,at,route\nprivate-session,2026-07-01T10:00:00Z,/\n";
  const staged = await call("POST", `/api/ventures/${venture.id}/journey-imports`, {
    name: "journey.csv",
    mediaType: "text/csv",
    data: Buffer.from(content).toString("base64"),
  });
  assert.equal(staged.status, 201);
  assert.equal(staged.body.import.valid, true);
  assert.deepEqual(staged.body.import && Object.keys(staged.body), ["import"]);
  const importRef = staged.body.import.importRef;
  const mapping = {
    inputKind: "event-rows",
    fields: { sequenceKey: "sid", timestamp: "at", route: "route" },
    routeMappings: {},
    timezone: "UTC",
  };

  const previewed = await call("POST", `/api/ventures/${venture.id}/journey-imports/${importRef}/preview`, mapping);
  assert.equal(previewed.status, 200);
  assert.deepEqual(Object.keys(previewed.body), ["preview"]);
  assert.equal(previewed.body.preview.pageCounts[0].pageRef, "object:page-home");

  const proposal = saveJourneyMappingProposal(
    venture.id,
    importRef,
    mapping,
    { threadRef: "thread:journey-route", proposedBy: { authority: "agent", id: "codex" } },
  );
  const proposals = await call("GET", `/api/ventures/${venture.id}/journey-mapping-proposals?importRef=${encodeURIComponent(importRef)}`);
  assert.equal(proposals.status, 200);
  assert.deepEqual(proposals.body.proposals.map((entry) => entry.id), [proposal.id]);
  const proposalItem = await call("GET", `/api/ventures/${venture.id}/journey-mapping-proposals/${proposal.id}`);
  assert.equal(proposalItem.status, 200);
  assert.equal(proposalItem.body.proposal.threadRef, "thread:journey-route");

  const adopted = await call("POST", `/api/ventures/${venture.id}/journey-imports/${importRef}/adopt`, {
    mapping,
    expectedPageModelRevision: previewed.body.preview.pageModelRevision,
    sourceRef: "source:route-test",
  });
  assert.equal(adopted.status, 201);
  assert.deepEqual(Object.keys(adopted.body), ["snapshot", "receipt"]);

  const listed = await call("GET", `/api/ventures/${venture.id}/journey-observations`);
  assert.equal(listed.status, 200);
  assert.deepEqual(Object.keys(listed.body), ["observations", "receipts"]);
  assert.equal(listed.body.observations.length, 1);
  assert.equal(JSON.stringify(listed.body).includes("private-session"), false);
});

test("journey mutation routes reject an agent-stamped caller", async () => {
  const response = await call("POST", `/api/ventures/${venture.id}/journey-imports`, {
    name: "journey.csv",
    content: "sid,at,route\na,2026-07-01,/\n",
  }, { "x-gtm-actor": "agent" });
  assert.equal(response.status, 403);
  assert.equal(response.body.code, "founder_decision_forbidden");
});

test("journey delete returns the bounded cancellation envelope", async () => {
  const staged = await call("POST", `/api/ventures/${venture.id}/journey-imports`, {
    name: "cancel.jsonl",
    content: '{"sid":"a","at":"2026-07-01","route":"/"}',
  });
  const deleted = await call("DELETE", `/api/ventures/${venture.id}/journey-imports/${staged.body.import.importRef}`);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, { deleted: true });
});
