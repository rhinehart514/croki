// The outcome door (server.mjs): the write route that lands what actually happened. POST an outcome
// keyed off a staged item's joinKey; the server joins it back to the run + path that produced it and
// records a Result the GET report then reads. This proves the round trip through the real HTTP wiring
// (not a re-implementation): a posted outcome becomes a measured Result the outcome report reports.
//
// The wall is untouched — recording an outcome captures what ALREADY happened; it never sends.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the durable home BEFORE importing the server (and the stores), so route writes and test seeds
// share one temp dir.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-outcome-routes-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const PORT = await freePort();
process.env.PORT = String(PORT);

const { gtmPathStore, runStore } = await import("../src/gtm-store.mjs");
const { loadFlow } = await import("../src/flow-store.mjs");
const { loadFounderDecisions } = await import("../src/feedback-ledger.mjs");
const { getOperatorSession } = await import("../src/operator-store.mjs");
const { createChannel, createProject } = await import("../src/project-store.mjs");
const { server } = await import("../src/server.mjs");

if (!server.listening) await once(server, "listening");

const base = `http://127.0.0.1:${PORT}`;

async function browserSessionCookie() {
  const response = await fetch(`${base}/api/health`);
  const setCookie = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie().join("; ")
    : (response.headers.get("set-cookie") ?? "");
  const match = setCookie.match(/gtm_session=[^;]+/);
  assert.ok(match, "the server issues a founder browser capability on GET");
  return match[0];
}

after(() => {
  server.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

// Seed a project with a selected path and a staged run whose items carry durable joinKeys — the same
// shape run-compile stages at the founder gate.
function seedRun(projectId, items, { runPathId = null } = {}) {
  const gtmPath = gtmPathStore.create(
    {
      projectId,
      summary: "Reach solo founders in indie Discords with a launch nudge",
      bet: { buyer: "solo founders", channel: "indie-hacker Discord", offer: "free launch checklist" },
      status: "selected",
    },
    { projectId },
  );
  const run = runStore.create(
    {
      projectId,
      pathId: runPathId ?? gtmPath.id,
      status: "staged",
      items: items ?? [
        { joinKey: "handle-ada", buyer: "Ada", channel: "discord", offer: "checklist", message: "hey Ada" },
        { joinKey: "handle-bo", buyer: "Bo", channel: "discord", offer: "checklist", message: "hey Bo" },
      ],
    },
    { projectId },
  );
  return { pathId: run.pathId, gtmPathId: gtmPath.id, runId: run.id };
}

describe("outcome routes — the write door", () => {
  it("a posted outcome joins its run and becomes a measured Result the report reads", async () => {
    const projectId = "outcome-routes-single";
    const { pathId, runId } = seedRun(projectId);

    const res = await fetch(`${base}/api/projects/${projectId}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinKey: "handle-ada", outcomeKind: "reply", value: 1 }),
    });
    assert.equal(res.status, 200);
    const posted = await res.json();
    assert.equal(posted.joined, true);
    // Joined back to the exact run + path that produced the staged item.
    assert.equal(posted.result.runId, runId);
    assert.equal(posted.result.pathId, pathId);
    assert.equal(posted.result.outcomeKind, "reply");
    // A manual record with no explicit source defaults to founder-entered.
    assert.equal(posted.result.source, "founder-entered");

    // The read side now reports it as measured — a real Result, not a fabricated rate.
    const report = await fetch(`${base}/api/projects/${projectId}/outcomes`).then((r) => r.json());
    assert.equal(report.totals.staged, 2);
    assert.equal(report.totals.measured, 1);
    assert.equal(report.totals.unmeasured, 1);
    assert.equal(report.totals.results, 1);
    const line = report.paths.find((p) => p.pathId === pathId);
    assert.deepEqual(line.outcomes, { reply: 1 });
  });

  it("accepts a batch under the `outcomes` list, each joined on its key", async () => {
    const projectId = "outcome-routes-batch";
    const { pathId } = seedRun(projectId);

    const res = await fetch(`${base}/api/projects/${projectId}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcomes: [
          { joinKey: "handle-ada", outcomeKind: "meeting" },
          { joinKey: "handle-bo", outcomeKind: "signup" },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const posted = await res.json();
    assert.equal(posted.joined, 2);
    assert.equal(posted.unjoined, 0);

    const report = await fetch(`${base}/api/projects/${projectId}/outcomes`).then((r) => r.json());
    assert.equal(report.totals.measured, 2);
    const line = report.paths.find((p) => p.pathId === pathId);
    assert.deepEqual(line.outcomes, { meeting: 1, signup: 1 });
  });

  it("refuses a single outcome with no joinKey (400), without recording anything", async () => {
    const projectId = "outcome-routes-nokey";
    seedRun(projectId);
    const res = await fetch(`${base}/api/projects/${projectId}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcomeKind: "reply" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /joinKey/);

    const report = await fetch(`${base}/api/projects/${projectId}/outcomes`).then((r) => r.json());
    assert.equal(report.totals.results, 0);
  });

  it("founder-guards implication acceptance, stages only a typed proposal, and records its disposition", async () => {
    const projectId = "default";
    const { channel } = createChannel({
      name: "Outcome product review",
      objective: "Review an attributable product implication",
    }, { projectId });
    const graph = loadFlow(channel.graphId, null).graph;
    const { project: otherProject } = createProject({
      id: "other-outcome-project",
      name: "Other outcome project",
    });
    const { channel: otherChannel } = createChannel({
      name: "Other product review",
      objective: "Owned by another project",
    }, { projectId: otherProject.id });
    const otherGraph = loadFlow(otherChannel.graphId, null).graph;
    seedRun(
      projectId,
      [{ joinKey: "implication-route-1", message: "Original action" }],
      { runPathId: graph.id },
    );
    const posted = await fetch(`${base}/api/projects/${projectId}/outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        joinKey: "implication-route-1",
        outcomeKind: "objection",
        // Even overridable Result fields cannot select the review target; stored run lineage owns it.
        pathId: otherGraph.id,
        motionRef: otherGraph.id,
        body: "The problem lands, but the first product action is hidden.",
        productImplication: {
          body: "Review whether onboarding should expose the first product action sooner.",
          authorRef: { type: "teammate", id: "product-interpreter" },
          artifactRef: { type: "operator-event", id: "route-interpretation-1" },
        },
        productRefs: [{ type: "productThing", id: "thing-onboarding" }],
      }),
    }).then((response) => response.json());
    const implicationId = `implication-${posted.result.id}`;
    const operating = await fetch(`${base}/api/operating-view?project=${projectId}`).then((response) => response.json());
    const canonical = operating.woven.canvas.implications.find((candidate) => candidate.id === implicationId);
    assert.deepEqual(canonical.review.pipelineRef, { type: "pipeline", id: channel.id });
    assert.deepEqual(canonical.review.graphRef, { type: "graph", id: graph.id });
    assert.equal(canonical.review.operations.length, 1);
    assert.equal(canonical.review.operations[0].type, "add_node");
    assert.equal(canonical.review.operations[0].node.category, "context");
    assert.equal(canonical.review.operations[0].node.connector, "product");
    assert.equal(canonical.review.operations[0].node.outputKind, "product-change");
    assert.equal(canonical.review.operations[0].node.config.sourceOutcomeId, posted.result.id);
    const proposedNodeId = canonical.review.operations[0].node.id;

    const unguarded = await fetch(
      `${base}/api/projects/${projectId}/outcome-implications/${encodeURIComponent(implicationId)}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    assert.equal(unguarded.status, 403, "a token-less caller cannot accept a product implication");
    assert.equal(loadFlow(graph.id, null).graph.nodes.some((node) => node.id === proposedNodeId), false);

    const cookie = await browserSessionCookie();
    const arbitrary = await fetch(
      `${base}/api/projects/${projectId}/outcome-implications/${encodeURIComponent(implicationId)}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          graphId: graph.id,
          operations: [{ type: "remove_node", nodeId: "unrelated-node" }],
        }),
      },
    );
    const arbitraryBody = await arbitrary.json();
    assert.equal(arbitrary.status, 400, "the implication route cannot stage client graph operations");
    assert.match(arbitraryBody.error, /derived server-side/);

    const crossProjectResponse = await fetch(
      `${base}/api/projects/${projectId}/outcome-implications/${encodeURIComponent(implicationId)}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ graphId: otherGraph.id }),
      },
    );
    const crossProject = await crossProjectResponse.json();
    assert.equal(crossProjectResponse.status, 400);
    assert.match(crossProject.error, /derived server-side/);
    assert.equal(loadFlow(otherGraph.id, null).graph.nodes.some((node) => node.id === proposedNodeId), false,
      "a project cannot stage its implication against another project's graph");

    const acceptedResponse = await fetch(
      `${base}/api/projects/${projectId}/outcome-implications/${encodeURIComponent(implicationId)}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ wording: "Founder agrees this deserves product review." }),
      },
    );
    const accepted = await acceptedResponse.json();
    assert.equal(acceptedResponse.status, 200, JSON.stringify(accepted));

    assert.equal(accepted.implication.status, "staged");
    assert.equal(accepted.implication.proposalDisposition, "staged");
    assert.deepEqual(accepted.implication.proposalRef, { type: "productChangeProposal", id: accepted.sessionId });
    assert.deepEqual(accepted.implication.decisionRef, { type: "founder-decision", id: accepted.decision.id });
    assert.equal(accepted.decision.kind, "product-implication.accepted");
    assert.equal(accepted.proposal.operations.length, 1);
    assert.equal(accepted.proposal.operations[0].type, "add_node");
    assert.equal(accepted.proposal.operations[0].node.config.sourceOutcomeId, posted.result.id);
    assert.equal(accepted.proposal.preview.nodes.some((node) => node.id === proposedNodeId), true);
    assert.equal(loadFlow(graph.id, null).graph.nodes.some((node) => node.id === proposedNodeId), false,
      "accepting the implication does not apply the graph change");
    assert.equal(getOperatorSession(accepted.sessionId).status, "waiting_for_proposal");
    assert.equal(
      loadFounderDecisions(projectId).some((decision) => decision.id === accepted.decision.id),
      true,
      "the implication choice uses the append-only founder decision ledger",
    );

    const unguardedProposal = await fetch(`${base}/api/operator/sessions/${accepted.sessionId}/proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept: true, projectId }),
    });
    assert.equal(unguardedProposal.status, 403, "a token-less caller cannot apply the staged proposal");
    assert.equal(getOperatorSession(accepted.sessionId).status, "waiting_for_proposal");
    assert.equal(loadFlow(graph.id, null).graph.nodes.some((node) => node.id === proposedNodeId), false);

    const applied = await fetch(`${base}/api/operator/sessions/${accepted.sessionId}/proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ accept: true, projectId }),
    });
    assert.equal(applied.status, 200);
    assert.equal(loadFlow(graph.id, null).graph.nodes.some((node) => node.id === proposedNodeId), true);

    const report = await fetch(`${base}/api/projects/${projectId}/outcomes`).then((response) => response.json());
    const resolved = report.implications.find((candidate) => candidate.id === implicationId);
    assert.equal(resolved.status, "accepted");
    assert.equal(resolved.proposalDisposition, "accepted");
    assert.equal(
      loadFounderDecisions(projectId).some((decision) => decision.kind === "graph-proposal.accepted"),
      true,
      "applying the proposal also records the founder's authority decision",
    );

    const repeated = await fetch(
      `${base}/api/projects/${projectId}/outcome-implications/${encodeURIComponent(implicationId)}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({}),
      },
    ).then((response) => response.json());
    assert.equal(repeated.deduped, true);
    assert.equal(repeated.sessionId, accepted.sessionId);
    assert.equal(repeated.implication.status, "accepted");
  });
});
