import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "firm-conversation-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: workRoutes } = await import("../../src/firm/work-routes.mjs");
const { appendConversationMessage } = await import("../../src/firm/conversation.mjs");
const { createVenture, setVentureDoc } = await import("../../src/firm/venture-store.mjs");
const { createBet } = await import("../../src/firm/bet.mjs");
const { applyFirmConfiguration, getFirmConfiguration } = await import("../../src/firm/configuration.mjs");
const { recordWorkingTheory } = await import("../../src/firm/architecture-proposals.mjs");

const options = { root };
const venture = createVenture({ name: "Conversation route" }, options);

async function call(method, pathname, body = null, deps = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = founderHeaders({ method, path: pathname });
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await workRoutes({ req, res, url: new URL(pathname, "http://local"), deps });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("GET conversation returns the venture-scoped durable transcript", async () => {
  appendConversationMessage({
    ventureId: venture.id,
    role: "founder",
    content: "Keep this with the venture",
    teammateRef: "operator",
  }, options);

  const response = await call("GET", `/api/ventures/${venture.id}/conversation`);
  assert.equal(response.handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.messages.length, 1);
  assert.equal(response.body.messages[0].content, "Keep this with the venture");
});

test("GET conversation fails closed for an unknown venture", async () => {
  const response = await call("GET", "/api/ventures/no-such-venture/conversation");
  assert.equal(response.handled, true);
  assert.equal(response.status, 404);
});

test("POST an unscoped whole-firm direction resolves through the configured coordinator", async () => {
  const coordinated = createVenture({ name: "Coordinated conversation" }, options);
  const initial = getFirmConfiguration(coordinated.id, options);
  applyFirmConfiguration({
    ventureId: coordinated.id,
    expectedRevision: initial.revision,
    configuration: {
      ...initial,
      coordination: { ...initial.coordination, coordinatorRef: "synthesizer" },
      agents: [
        { ref: "auditor", name: "Auditor" },
        { ref: "synthesizer", name: "Synthesizer" },
      ],
    },
  }, options);
  let received;
  const runtime = {
    id: "capturing-runtime",
    label: "Capturing runtime",
    async drive(context) {
      received = context;
      return { kind: "completed", summary: "coordinated" };
    },
  };

  const response = await call("POST", `/api/ventures/${coordinated.id}/drive`, {
    goal: "Examine the current value model",
  }, { runtime });

  assert.equal(response.status, 200);
  assert.match(received.system, /You are Synthesizer/);
  assert.equal(response.body.messages[0].content, "coordinated");
  assert.equal(response.body.messages[0].runtime.id, "capturing-runtime");
  const messages = response.status === 200
    ? (await call("GET", `/api/ventures/${coordinated.id}/conversation`)).body.messages
    : [];
  assert.equal(messages[0].teammateRef, "synthesizer");
});

test("POST an unscoped direction honors activation when no coordinator is configured", async () => {
  const activated = createVenture({ name: "Activation-aware conversation" }, options);
  const initial = getFirmConfiguration(activated.id, options);
  applyFirmConfiguration({
    ventureId: activated.id,
    expectedRevision: initial.revision,
    configuration: {
      ...initial,
      agents: [
        { ref: "observer", name: "Observer", activation: "relevant" },
        { ref: "lead", name: "Lead", activation: "direct" },
      ],
    },
  }, options);
  let received;
  const response = await call("POST", `/api/ventures/${activated.id}/drive`, {
    goal: "Take the whole-firm direction",
  }, {
    runtime: {
      id: "activation-runtime",
      label: "Activation runtime",
      async drive(context) { received = context; return { kind: "completed", summary: "handled" }; },
    },
  });

  assert.equal(response.status, 200);
  assert.match(received.system, /You are Lead/);
  assert.equal(response.body.messages[0].teammateRef, "lead");
});

test("POST carries explicit bet, work, and multiple-participant targeting into the drive and transcript", async () => {
  const targeted = createVenture({ name: "Targeted conversation" }, options);
  const initial = getFirmConfiguration(targeted.id, options);
  applyFirmConfiguration({
    ventureId: targeted.id,
    expectedRevision: initial.revision,
    configuration: {
      ...initial,
      agents: [
        { ref: "yara", name: "Yara", activation: "direct" },
        { ref: "reed", name: "Reed", activation: "relevant" },
      ],
    },
  }, options);
  const bet = createBet({ ventureId: targeted.id, intent: "Earn a buyer signal", teammateRef: "yara" });
  bet.staged.push({ id: "staged-offer", content: "Paid pilot offer" });
  setVentureDoc(targeted.id, "bets", bet.id, bet, options);
  let received;

  const response = await call("POST", `/api/ventures/${targeted.id}/drive`, {
    goal: "Tighten this exact offer together.",
    teammateRefs: ["yara", "reed"],
    betId: bet.id,
    workRef: "staged-offer",
  }, {
    runtime: {
      id: "target-runtime",
      label: "Target runtime",
      async drive(context) { received = context; return { kind: "completed", summary: "targeted" }; },
    },
  });

  assert.equal(response.status, 200);
  assert.match(received.system, /explicitly targets durable work staged-offer/);
  assert.match(received.system, /yara, reed/);
  const messages = (await call("GET", `/api/ventures/${targeted.id}/conversation`)).body.messages;
  assert.deepEqual(messages[0].target, {
    betId: bet.id,
    workRef: "staged-offer",
    teammateRefs: ["yara", "reed"],
  });
});

test("POST keeps execution assignment distinct from explicit participant targeting", async () => {
  const assigned = createVenture({ name: "Assigned conversation" }, options);
  const initial = getFirmConfiguration(assigned.id, options);
  applyFirmConfiguration({
    ventureId: assigned.id,
    expectedRevision: initial.revision,
    configuration: {
      ...initial,
      agents: [{ ref: "yara", name: "Yara", activation: "direct" }],
    },
  }, options);

  const response = await call("POST", `/api/ventures/${assigned.id}/drive`, {
    goal: "Take this direction without inventing a selected chip.",
    teammateRef: "yara",
  }, {
    runtime: {
      id: "assignment-runtime",
      label: "Assignment runtime",
      async drive() { return { kind: "completed", summary: "assigned" }; },
    },
  });

  assert.equal(response.status, 200);
  const messages = (await call("GET", `/api/ventures/${assigned.id}/conversation`)).body.messages;
  assert.equal(messages[0].teammateRef, "yara");
  assert.deepEqual(messages[0].target, null);
});

test("POST scopes a direction to one provisional relationship", async () => {
  const targeted = createVenture({ name: "Relationship-targeted conversation" }, options);
  const initial = getFirmConfiguration(targeted.id, options);
  applyFirmConfiguration({
    ventureId: targeted.id,
    expectedRevision: initial.revision,
    configuration: {
      ...initial,
      agents: [{ ref: "yara", name: "Yara", activation: "direct" }],
    },
  }, options);
  const sourceMessage = appendConversationMessage({
    ventureId: targeted.id,
    role: "founder",
    content: "A useful result may earn another look.",
  }, options);
  const theory = recordWorkingTheory({
    ventureId: targeted.id,
    baseRevision: 0,
    intent: "A useful result may lead to continued exploration",
    operations: [
      { op: "upsert-subject", id: "first-value", value: { name: "First value", statement: "A useful result appears early." } },
      { op: "upsert-subject", id: "continued-use", value: { name: "Continued use", statement: "People return to explore further." } },
      { op: "upsert-relationship", id: "value-leads-to-use", value: { fromRef: "theory:first-value", toRef: "theory:continued-use", label: "may lead to" } },
    ],
    anchors: [
      { subjectRef: "theory:first-value", sourceRefs: [`conversation:${sourceMessage.id}`] },
      { subjectRef: "theory:continued-use", sourceRefs: [`conversation:${sourceMessage.id}`] },
      { subjectRef: "theory-relationship:value-leads-to-use", sourceRefs: [`conversation:${sourceMessage.id}`] },
    ],
    proposedBy: { authority: "agent", id: "yara" },
  }, options).theory;
  let received;

  const response = await call("POST", `/api/ventures/${targeted.id}/drive`, {
    goal: "It earns exploration, not repeat use yet.",
    theoryTarget: { theoryId: theory.id, relationshipId: "value-leads-to-use" },
  }, {
    runtime: {
      id: "relationship-target-runtime",
      label: "Relationship target runtime",
      async drive(context) { received = context; return { kind: "completed", summary: "scoped" }; },
    },
  });

  assert.equal(response.status, 200);
  assert.match(received.system, /Selected provisional theory relationship/);
  const messages = (await call("GET", `/api/ventures/${targeted.id}/conversation`)).body.messages;
  const direction = messages.find((message) => message.content === "It earns exploration, not repeat use yet.");
  assert.equal(direction.target.theoryId, theory.id);
  assert.equal(direction.target.theoryRelationshipId, "value-leads-to-use");
});

test("POST rejects an exact-work target that does not belong to the named bet", async () => {
  const targeted = createVenture({ name: "Invalid exact work" }, options);
  const initial = getFirmConfiguration(targeted.id, options);
  applyFirmConfiguration({
    ventureId: targeted.id,
    expectedRevision: initial.revision,
    configuration: {
      ...initial,
      agents: [{ ref: "yara", name: "Yara", activation: "direct" }],
    },
  }, options);
  const bet = createBet({ ventureId: targeted.id, intent: "Keep identity exact", teammateRef: "yara" });
  bet.staged.push({ id: "real-work", content: "Durable work" });
  setVentureDoc(targeted.id, "bets", bet.id, bet, options);
  let runtimeCalls = 0;

  const response = await call("POST", `/api/ventures/${targeted.id}/drive`, {
    goal: "Do not accept this invented target.",
    teammateRefs: ["yara"],
    betId: bet.id,
    workRef: "invented-work",
  }, {
    runtime: {
      id: "must-not-run",
      label: "Must not run",
      async drive() { runtimeCalls += 1; return { kind: "completed" }; },
    },
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /no durable work invented-work belongs to bet/i);
  assert.equal(runtimeCalls, 0);
});

test("POST does not silently wake a relevance-only firm without a coordinator", async () => {
  const dormant = createVenture({ name: "Dormant conversation" }, options);
  const initial = getFirmConfiguration(dormant.id, options);
  applyFirmConfiguration({
    ventureId: dormant.id,
    expectedRevision: initial.revision,
    configuration: {
      ...initial,
      agents: [{ ref: "observer", name: "Observer", activation: "relevant" }],
    },
  }, options);
  let runtimeCalls = 0;
  const response = await call("POST", `/api/ventures/${dormant.id}/drive`, {
    goal: "Do not invent an activation path",
  }, {
    runtime: {
      id: "must-not-run",
      label: "Must not run",
      async drive() { runtimeCalls += 1; return { kind: "completed" }; },
    },
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /no configured participant/i);
  assert.equal(runtimeCalls, 0);
});

test("POST refuses a drive before runtime invocation when the configured daily spend is exhausted", async () => {
  const budgeted = createVenture({ name: "Budgeted conversation" }, options);
  const initial = getFirmConfiguration(budgeted.id, options);
  applyFirmConfiguration({
    ventureId: budgeted.id,
    expectedRevision: initial.revision,
    configuration: {
      ...initial,
      agents: [{ ref: "operator", name: "Operator", budget: { dailySpendUsd: 0 } }],
    },
  }, options);
  let runtimeCalls = 0;
  const response = await call("POST", `/api/ventures/${budgeted.id}/drive`, {
    goal: "Do not spend past the rail",
  }, {
    runtime: {
      id: "must-not-run",
      label: "Must not run",
      async drive() { runtimeCalls += 1; return { kind: "completed" }; },
    },
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /configured \$0\.00 daily spend limit/);
  assert.equal(runtimeCalls, 0);
});
