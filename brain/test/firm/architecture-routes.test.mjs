import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, before, test } from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-architecture-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: architectureRoutes } = await import("../../src/firm/architecture-routes.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");

let venture;

async function call(method, pathname, body = {}, headers = {}) {
  const req = Readable.from(method === "GET" ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await architectureRoutes({ req, res, url: new URL(pathname, "http://local") });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

before(() => {
  venture = createVenture({ name: "Architecture routes", repository: process.cwd() });
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

test("architecture GET is compatible for a venture with no document", async () => {
  const response = await call("GET", `/api/ventures/${venture.id}/architecture`);
  assert.equal(response.handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.architecture.revision, 0);
  assert.deepEqual(response.body.architecture.elements, []);
  assert.equal(response.body.permissions.agentCanPropose, true);
});

test("founder mutation writes current truth and a revision receipt", async () => {
  const pathname = `/api/ventures/${venture.id}/architecture/mutations`;
  const response = await call("POST", pathname, {
    baseRevision: 0,
    reason: "Name a reusable capability",
    operations: [{ op: "create-element", element: { id: "system-intake", role: "system", name: "Useful intake", does: "Captures a useful starting point." } }],
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.revision, 1);
  assert.equal(response.body.receipt.source, "founder-direct");
  assert.equal(response.body.architecture.elements[0].role, "system");
});

test("agent-stamped direct mutation is forbidden", async () => {
  const pathname = `/api/ventures/${venture.id}/architecture/mutations`;
  const response = await call("POST", pathname, {
    baseRevision: 1,
    operations: [{ op: "create-element", element: { id: "forged", role: "concept", name: "Forged" } }],
  }, { "x-gtm-actor": "agent" });
  assert.equal(response.status, 403);
  assert.equal(response.body.code, "founder_decision_forbidden");
});

test("agent proposal remains a ghost until founder acceptance", async () => {
  const proposalPath = `/api/ventures/${venture.id}/architecture/proposals`;
  const proposed = await call("POST", proposalPath, {
    baseRevision: 1,
    intent: "Preserve a possible distribution door",
    operations: [{ op: "create-element", element: { id: "concept-door", role: "concept", name: "Distribution door" } }],
    expectedExecutionEffect: "Descriptive context only",
  }, { "x-gtm-actor": "agent", "x-gtm-agent": "researcher" });
  assert.equal(proposed.status, 200);
  assert.equal(proposed.body.revision, 1);

  const before = await call("GET", `/api/ventures/${venture.id}/architecture`);
  assert.equal(before.body.architecture.elements.some((entry) => entry.id === "concept-door"), false);

  const decided = await call("POST", `${proposalPath}/${proposed.body.proposal.id}/decide`, { decision: "accept" });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.proposal.status, "accepted");
  assert.equal(decided.body.revision, 2);
});

test("projection response has the stable atlas contract", async () => {
  const response = await call("GET", `/api/ventures/${venture.id}/architecture/projection`);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body.projection).sort(), [
    "connections", "document", "elements", "evidenceAnnotations", "groups", "joins", "omissions", "outline", "pressure", "revision", "traceability", "ventureId", "workingTheory",
  ]);
  assert.deepEqual(Object.keys(response.body.projection.joins).sort(), ["bets", "outcomes", "wall", "work"]);
  assert.equal(response.body.projection.document.ventureId, venture.id);
  assert.equal(response.body.revision, 2);
});

test("context and firm alias remain venture scoped", async () => {
  const context = await call("GET", `/api/ventures/${venture.id}/architecture/context?id=concept-door&revision=2`);
  assert.equal(context.status, 200);
  assert.equal(context.body.context.descriptiveOnly, true);
  assert.equal(context.body.context.architectureRevision, 2);

  const alias = await call("GET", `/api/firm/architecture/projection?ventureId=${venture.id}`);
  assert.equal(alias.status, 200);
  assert.equal(alias.body.projection.ventureId, venture.id);

  const unknown = await call("GET", "/api/ventures/not-real/architecture/projection");
  assert.equal(unknown.status, 404);
});

test("the UI promotion payload changes a concept role without changing its identity", async () => {
  const pathname = `/api/ventures/${venture.id}/architecture/mutations`;
  const response = await call("POST", pathname, {
    baseRevision: 2,
    reason: "Used Distribution door as system.",
    operations: [{
      op: "change-role",
      elementId: "concept-door",
      role: "system",
      fields: { does: "Distribution door" },
    }],
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.revision, 3);
  assert.equal(response.body.architecture.elements.find((entry) => entry.id === "concept-door").role, "system");
  const projected = await call("GET", `/api/ventures/${venture.id}/architecture/projection`);
  assert.equal(projected.body.projection.elements.find((entry) => entry.id === "concept-door").role, "system");
});

test("founder accept-system turns every ghost campaign into a real governed bet", async () => {
  const proposalPath = `/api/ventures/${venture.id}/architecture/proposals`;
  const proposed = await call("POST", proposalPath, {
    baseRevision: 3,
    intent: "Stage one governed outbound campaign",
    operations: [
      { op: "create-element", element: { id: "motion-route-outbound", role: "motion", name: "Route outbound", actor: "Founder", entry: "Grounded account", value: "Relevant conversation", repeatabilityClaim: "Grounded openings can repeat.", systemIds: ["system-intake"], productRefs: [] } },
      { op: "create-element", element: { id: "campaign-route-outbound", role: "campaign", name: "Route outbound campaign", audience: "Qualified accounts", objective: "Learn whether the opening earns a reply", primaryMotionId: "motion-route-outbound", motionIds: ["motion-route-outbound"], governingBetSeed: "The grounded opening earns a useful reply", supportingBetIds: [], measurement: { observation: "A reply in the buyer's own language", window: "Within fourteen days" } } },
    ],
  }, { "x-gtm-actor": "agent", "x-gtm-agent": "operator" });
  assert.equal(proposed.status, 200);

  const accepted = await call("POST", `${proposalPath}/${proposed.body.proposal.id}/accept-system`, {});
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.revision, 4);
  assert.equal(accepted.body.proposal.status, "accepted");
  assert.equal(accepted.body.receipt.source, "proposal-system-acceptance");
  assert.equal(accepted.body.bets.length, 1);
  assert.equal(accepted.body.campaigns[0].governingBetId, accepted.body.bets[0].id);
  assert.equal(accepted.body.bets[0].staged.length, 0);
});
