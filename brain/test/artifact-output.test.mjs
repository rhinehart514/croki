import { test } from "node:test";
import assert from "node:assert/strict";

import * as artifact from "../src/connectors/execute/artifact.mjs";
import { getConnector, defaultGraphTemplate } from "../src/connectors/registry.mjs";

const node = (config = {}) => ({ id: "exe-artifact", category: "execute", connector: "artifact", config });

const approvedItem = (over = {}) => ({
  gtmActionId: "gtm-abc",
  approved: true,
  artifactSpec: { kind: "landing-page", title: "RodentRadar demo" },
  artifactFiles: ["index.html", "app.js"],
  ...over,
});

test("artifact connector stages approved items and NEVER marks anything deployed or live", async () => {
  const result = await artifact.run(node({ target: "vercel-preview" }), [approvedItem()]);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  // The wall: prepared, never live.
  assert.equal(item.staged, true);
  assert.equal(item.deployed, false);
  assert.equal(item.live, false);
  assert.equal(item.executionStatus, "staged_for_deploy");
  assert.match(item.deployStatus, /awaiting founder approval to deploy/i);
  // Nothing in the run meta claims a deploy happened.
  assert.equal(result.meta.deployed, 0);
  assert.equal(result.meta.staged, 1);
  assert.match(result.meta.note, /Nothing was deployed or published/i);
});

test("every staged item is tagged outputKind \"artifact\" and carries the captured spec/files/target", async () => {
  const result = await artifact.run(node({ target: "vercel-preview" }), [approvedItem()]);
  const item = result.items[0];
  assert.equal(item.outputKind, "artifact");
  assert.deepEqual(item.artifact.spec, { kind: "landing-page", title: "RodentRadar demo" });
  assert.deepEqual(item.artifact.files, ["index.html", "app.js"]);
  assert.equal(item.artifact.target, "vercel-preview");
});

test("only founder-approved items are staged — unapproved/pending artifacts never pass", async () => {
  const result = await artifact.run(node(), [
    approvedItem({ gtmActionId: "ok" }),
    { gtmActionId: "pending", approved: false, artifactSpec: {} },
    { gtmActionId: "undecided", artifactSpec: {} },
  ]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].gtmActionId, "ok");
  // And the one that survived is still staged, not deployed.
  assert.equal(result.items[0].deployed, false);
  assert.equal(result.items[0].staged, true);
});

test("the connector NEVER produces a deployed/live item regardless of how 'approved' an item looks", async () => {
  // Even an item that arrives pre-marked deployed:true is re-stamped to staged-only —
  // this node cannot be the thing that flips an artifact live.
  const result = await artifact.run(node(), [approvedItem({ deployed: true, live: true })]);
  const item = result.items[0];
  assert.equal(item.deployed, false);
  assert.equal(item.live, false);
  // Property over the whole batch: no item is ever live/deployed out of this node.
  assert.ok(result.items.every((i) => i.deployed === false && i.live !== true));
});

test("declares the wall in its meta: deploy/publish/push are blocked, gate continuation is approval-required", () => {
  assert.equal(artifact.meta.category, "execute");
  assert.equal(artifact.meta.outputKind, "artifact");
  for (const verb of ["deploy", "publish", "push"]) {
    assert.ok(artifact.meta.blocked.includes(verb), `expected blocked verb: ${verb}`);
  }
  assert.ok(artifact.meta.approvalRequired.includes("continue_from_gate"));
  // It declares no allowed verb that leaves the machine.
  assert.ok(!artifact.meta.allowed.some((v) => /^(deploy|publish|push|send|go_live)$/.test(v)));
});

test("registered in the execute family without breaking the default template", () => {
  const connector = getConnector("execute", "artifact");
  assert.ok(connector, "artifact connector should resolve from the registry");
  assert.equal(connector.meta.id, "artifact");
  // The existing execute connectors still resolve.
  assert.ok(getConnector("execute", "local"));
  assert.ok(getConnector("execute", "http"));
  // The default template is untouched — still the local execute node, no artifact in it.
  const template = defaultGraphTemplate();
  const exeNodes = template.nodes.filter((n) => n.category === "execute");
  assert.equal(exeNodes.length, 1);
  assert.equal(exeNodes[0].connector, "local");
});

test("composes behind a gate: it only acts on items a gate marked approved", async () => {
  // Simulate the upstream gate having NOT approved (the wall holds): nothing stages.
  const beforeGate = await artifact.run(node(), [{ gtmActionId: "x", artifactSpec: {}, approved: false }]);
  assert.equal(beforeGate.items.length, 0);
  // After the gate approves, the artifact stages (still never live).
  const afterGate = await artifact.run(node(), [{ gtmActionId: "x", artifactSpec: {}, approved: true }]);
  assert.equal(afterGate.items.length, 1);
  assert.equal(afterGate.items[0].staged, true);
  assert.equal(afterGate.items[0].live, false);
});
