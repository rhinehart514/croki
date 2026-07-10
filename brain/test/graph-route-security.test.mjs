// Direct graph-route security: project ownership, the structural founder wall, and dual founder
// authority over both normal and SSE execution. All state is isolated; external send URLs are
// intercepted and counted so exploit probes can prove no sender was reached.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-graph-route-security-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";
process.env.GMAIL_OAUTH_TOKEN = "route-security-token";

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

const { server } = await import("../src/server.mjs");
if (!server.listening) await once(server, "listening");
const base = `http://127.0.0.1:${PORT}`;

const { loadFlow, recordFlowRun, saveFlow } = await import("../src/flow-store.mjs");
const {
  createChannel,
  createProject,
  getChannel,
  loadProject,
  saveProject,
} = await import("../src/project-store.mjs");
const { addMember, createTeam } = await import("../src/team-store.mjs");

const nativeFetch = global.fetch;
let senderCalls = 0;
global.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "gmail.googleapis.com" || url.hostname === "send.invalid") {
    senderCalls += 1;
    return {
      ok: true,
      status: 200,
      async json() { return { id: `sent-${senderCalls}` }; },
      async text() { return "ok"; },
    };
  }
  return nativeFetch(input, init);
};

let projectA;
let projectB;
let channelA;
let channelB;

function gatedGraph(id, name = "Scoped gate") {
  return {
    id,
    name,
    version: "1",
    revision: 0,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input", position: { x: 0, y: 0 }, config: { items: [{ id: "lead-1", name: "Ada" }] } },
      { id: "gate", category: "gate", connector: "default", label: "Founder review", position: { x: 200, y: 0 }, config: {} },
      { id: "out", category: "execute", connector: "local", label: "Stage locally", position: { x: 400, y: 0 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "src", target: "gate", edgeType: "data" },
      { id: "e2", source: "gate", target: "out", edgeType: "data" },
    ],
  };
}

function ungatedSenderGraph(id, connector) {
  return {
    id,
    name: `Forged ${connector} send`,
    version: "1",
    revision: 0,
    nodes: [
      {
        id: "src",
        category: "source",
        connector: "manual",
        label: "Forged approved input",
        position: { x: 0, y: 0 },
        config: {
          items: [{
            id: "forged-1",
            gtmActionId: "forged-action-1",
            approved: true,
            email: "nobody@example.com",
            draft: "This must never leave.",
          }],
        },
      },
      {
        id: "send",
        category: "execute",
        connector,
        label: "Send",
        position: { x: 240, y: 0 },
        config: connector === "http" ? { endpoint: "https://send.invalid/hook" } : {},
      },
    ],
    edges: [{ id: "e1", source: "src", target: "send", edgeType: "data" }],
  };
}

before(() => {
  ({ project: projectA } = createProject({ id: "route-project-a", name: "Route project A" }, { root: HOME }));
  ({ project: projectB } = createProject({ id: "route-project-b", name: "Route project B" }, { root: HOME }));

  const teamA = createTeam({ name: "Team A", owner: { userId: "founder", name: "Founder" } }, { root: HOME });
  addMember(teamA.id, { userId: "viewer", name: "Viewer", role: "member" }, { root: HOME });
  const teamB = createTeam({ name: "Team B", owner: { userId: "other-owner", name: "Other owner" } }, { root: HOME });
  saveProject({ ...loadProject({ root: HOME, projectId: projectA.id }), teamId: teamA.id }, { root: HOME });
  saveProject({ ...loadProject({ root: HOME, projectId: projectB.id }), teamId: teamB.id }, { root: HOME });

  ({ channel: channelA } = createChannel({ name: "Scoped A" }, { root: HOME, projectId: projectA.id }));
  ({ channel: channelB } = createChannel({ name: "Scoped B" }, { root: HOME, projectId: projectB.id }));
  saveFlow(gatedGraph(channelA.graphId, "Scoped A"), { root: HOME, projectId: projectA.id });
  saveFlow(gatedGraph(channelB.graphId, "Scoped B"), { root: HOME, projectId: projectB.id });
  recordFlowRun(gatedGraph(channelB.graphId, "Scoped B"), {
    runId: "project-b-run",
    graphId: channelB.graphId,
    ok: true,
    pendingGates: [],
    nodes: {},
  }, { root: HOME, projectId: projectB.id });
});

after(async () => {
  global.fetch = nativeFetch;
  delete process.env.GMAIL_OAUTH_TOKEN;
  await new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
  fs.rmSync(HOME, { recursive: true, force: true });
});

async function browserCookie() {
  const response = await fetch(`${base}/api/health`);
  const setCookie = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie().join("; ")
    : (response.headers.get("set-cookie") ?? "");
  const match = setCookie.match(/gtm_session=[^;]+/);
  assert.ok(match, "the browser GET returns the founder capability");
  return match[0];
}

async function post(route, body, { cookie = null, userId = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (userId) headers["x-gtm-user"] = userId;
  const response = await fetch(`${base}${route}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { response, body: await response.json().catch(() => ({})) };
}

describe("direct graph routes — project ownership and founder authority", () => {
  it("rejects cross-project template/read, save, run, and stream access", async () => {
    const template = await fetch(`${base}/api/graph/template?project=${projectA.id}&channel=${encodeURIComponent(channelB.graphId)}`);
    assert.equal(template.status, 403);
    assert.match((await template.json()).error, /belongs to project route-project-b/);

    const save = await post("/api/graph/save", { projectId: projectA.id, graph: gatedGraph(channelB.graphId) });
    assert.equal(save.response.status, 403);

    const run = await post("/api/graph/run", { projectId: projectA.id, graph: gatedGraph(channelB.graphId) });
    assert.equal(run.response.status, 403);

    const stream = await post("/api/graph/run/stream", { projectId: projectA.id, graph: gatedGraph(channelB.graphId) });
    assert.equal(stream.response.status, 403);
    assert.equal(loadFlow(channelB.graphId, null, { root: HOME, projectId: projectB.id }).runs.length, 1,
      "rejected cross-project routes cannot append or replace the foreign run ledger");
  });

  it("registers a genuinely new safe graph inside its explicit project", async () => {
    const graph = {
      id: "route-project-a-new-graph",
      name: "New safe graph",
      version: "1",
      revision: 0,
      nodes: [{ id: "context", category: "context", connector: "product", label: "Context", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    };
    const saved = await post("/api/graph/save", { projectId: projectA.id, channelId: "new-safe", graph });
    assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
    assert.equal(getChannel(loadProject({ root: HOME, projectId: projectA.id }), "new-safe", { root: HOME }).graphId, graph.id);
    const read = await fetch(`${base}/api/graph/template?project=${projectA.id}&channel=new-safe`);
    assert.equal(read.status, 200);
    assert.equal((await read.json()).graph.id, graph.id);
  });

  it("rejects approved-item Gmail and HTTP graphs with no gate before any sender call", async () => {
    const beforeCalls = senderCalls;
    const save = await post("/api/graph/save", {
      projectId: projectA.id,
      graph: ungatedSenderGraph(channelA.graphId, "gmail"),
    });
    assert.equal(save.response.status, 400);
    assert.match(save.body.error, /no founder gate|not behind a founder gate/i);

    const normal = await post("/api/graph/run", {
      projectId: projectA.id,
      graph: ungatedSenderGraph(channelA.graphId, "gmail"),
    });
    assert.equal(normal.response.status, 400);
    assert.match(normal.body.error, /no founder gate|not behind a founder gate/i);

    const stream = await post("/api/graph/run/stream", {
      projectId: projectA.id,
      graph: ungatedSenderGraph(channelA.graphId, "http"),
    });
    assert.equal(stream.response.status, 400);
    assert.match(stream.body.error, /no founder gate|not behind a founder gate/i);
    assert.equal(senderCalls, beforeCalls, "neither direct route reached Gmail or HTTP transport");
  });

  it("lets an owner run to and clear the gate, but rejects browser members and foreign-project owners", async () => {
    const graph = gatedGraph(channelA.graphId, "Scoped A");
    const reached = await post("/api/graph/run", { projectId: projectA.id, graph });
    assert.equal(reached.response.status, 200);
    assert.deepEqual(reached.body.pendingGates, ["gate"]);

    const cookie = await browserCookie();
    const viewer = await post("/api/graph/run", {
      projectId: projectA.id,
      graph,
      approvals: { gate: true },
    }, { cookie, userId: "viewer" });
    assert.equal(viewer.response.status, 403);
    assert.match(viewer.body.error, /cannot release|owner or approver/i);

    const foreignOwner = await post("/api/graph/run", {
      projectId: projectA.id,
      graph,
      approvals: { gate: true },
    }, { cookie, userId: "other-owner" });
    assert.equal(foreignOwner.response.status, 403);

    const viewerStream = await post("/api/graph/run/stream", {
      projectId: projectA.id,
      graph,
      approvals: { gate: true },
      userId: "founder",
    }, { cookie, userId: "viewer" });
    assert.equal(viewerStream.response.status, 403, "the SSE door trusts request identity, not a spoofed body userId");

    const founder = await post("/api/graph/run", {
      projectId: projectA.id,
      graph,
      approvals: { gate: true },
    }, { cookie, userId: "founder" });
    assert.equal(founder.response.status, 200, JSON.stringify(founder.body));
    assert.deepEqual(founder.body.pendingGates, []);
    assert.equal(founder.body.nodes.out.meta.staged, 1, "the unchanged local connector stages the approved item");
  });
});
