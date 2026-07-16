import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "firm-configuration-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: configurationRoutes } = await import("../../src/firm/configuration-routes.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const { listConversation } = await import("../../src/firm/conversation.mjs");

const venture = createVenture({ name: "Configuration route" }, { root });

async function call(method, pathname, body = null, headers = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await configurationRoutes({ req, res, url: new URL(pathname, "http://local") });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("GET exposes the complete readable firm configuration", async () => {
  const response = await call("GET", `/api/ventures/${venture.id}/configuration`);
  assert.equal(response.handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.configuration.revision, 1);
  assert.equal(response.body.configuration.authority.outwardEffects, "wall");
});

test("PUT is founder-only and returns a reversible receipt", async () => {
  const current = (await call("GET", `/api/ventures/${venture.id}/configuration`)).body.configuration;
  const body = {
    expectedRevision: current.revision,
    summary: "Name the operating group",
    configuration: {
      ...current,
      presentation: { ...current.presentation, collectiveLabel: "studio" },
    },
  };
  const forbidden = await call("PUT", `/api/ventures/${venture.id}/configuration`, body, { "x-gtm-actor": "agent" });
  assert.equal(forbidden.status, 403);

  const applied = await call("PUT", `/api/ventures/${venture.id}/configuration`, body);
  assert.equal(applied.status, 200);
  assert.equal(applied.body.configuration.presentation.collectiveLabel, "studio");
  assert.equal(applied.body.receipt.before.revision, 1);
  assert.equal(applied.body.message.kind, "configuration-receipt");
  assert.equal(applied.body.message.configurationReceipt.id, applied.body.receipt.id);
});

test("POST restore is founder-only and restores as a new revision", async () => {
  const changed = (await call("GET", `/api/ventures/${venture.id}/configuration`)).body.configuration;
  const update = await call("PUT", `/api/ventures/${venture.id}/configuration`, {
    expectedRevision: changed.revision,
    summary: "Use Claude Code",
    configuration: { ...changed, defaults: { ...changed.defaults, runtime: "claude-code" } },
  });
  const restored = await call("POST", `/api/ventures/${venture.id}/configuration/restore`, {
    expectedRevision: update.body.configuration.revision,
    receiptId: update.body.receipt.id,
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.configuration.defaults.runtime, changed.defaults.runtime);
  assert.equal(restored.body.configuration.revision, update.body.configuration.revision + 1);
  assert.equal(restored.body.message.configurationReceipt.revision, restored.body.configuration.revision);
});

test("a canvas capability action creates a chat-visible proposal and grants nothing until applied", async () => {
  const canvasVenture = createVenture({ name: "Canvas proposal" }, { root });
  const current = (await call("GET", `/api/ventures/${canvasVenture.id}/configuration`)).body.configuration;
  const configured = await call("PUT", `/api/ventures/${canvasVenture.id}/configuration`, {
    expectedRevision: current.revision,
    configuration: { ...current, agents: [{ ref: "auditor", name: "Value Auditor" }] },
  });

  const forbidden = await call(
    "POST",
    `/api/ventures/${canvasVenture.id}/configuration/proposals/capability`,
    { agentRef: "auditor", capability: "verification" },
    { "x-gtm-actor": "agent" },
  );
  assert.equal(forbidden.status, 403);

  const proposed = await call(
    "POST",
    `/api/ventures/${canvasVenture.id}/configuration/proposals/capability`,
    { agentRef: "auditor", capability: "verification" },
  );
  assert.equal(proposed.status, 200);
  assert.equal(proposed.body.proposal.proposed.agents[0].capabilities.additional[0], "verification");
  const unchanged = (await call("GET", `/api/ventures/${canvasVenture.id}/configuration`)).body.configuration;
  assert.deepEqual(unchanged.agents[0].capabilities.additional, []);
  const pendingMessage = listConversation(canvasVenture.id, { root }).at(-1);
  assert.equal(pendingMessage.configurationProposal.id, proposed.body.proposal.id);
  assert.deepEqual(pendingMessage.configurationProposal.diff, [{
    path: "agents.auditor.capabilities.additional",
    before: [],
    after: ["verification"],
  }]);

  const applied = await call(
    "POST",
    `/api/ventures/${canvasVenture.id}/configuration/proposals/${proposed.body.proposal.id}/apply`,
    { expectedRevision: configured.body.configuration.revision },
  );
  assert.equal(applied.status, 200);
  assert.equal(applied.body.configuration.agents[0].capabilities.additional[0], "verification");
  const conversation = listConversation(canvasVenture.id, { root });
  const proposalMessage = conversation.find((message) => message.configurationProposal?.id === proposed.body.proposal.id);
  assert.equal(proposalMessage.configurationProposal.status, "applied");
  assert.equal(proposalMessage.configurationProposal.receiptId, applied.body.receipt.id);
  assert.equal(conversation.at(-1).kind, "configuration-receipt");
  assert.deepEqual(conversation.at(-1).configurationReceipt.diff, proposalMessage.configurationProposal.diff);
});
