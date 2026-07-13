// Compiled-run approvals use the same browser-only release wall as raw graph and operator approvals.

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-compiled-run-browser-only-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";
process.env.GTM_IDE_FOUNDER_CODE = "compiled-run-founder";
process.env.GMAIL_OAUTH_TOKEN = "compiled-route-test-token";

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

const { createProject, loadProject, saveProject } = await import("../src/project-store.mjs");
const { addMember, createTeam } = await import("../src/team-store.mjs");
const { gtmPathStore, runStore } = await import("../src/gtm-store.mjs");
const { compileRunFromPath, stableActionId } = await import("../src/run-compile.mjs");

const { activeProjectId: PROJECT_ID } = createProject({ id: "compiled-run-wall", name: "Compiled run wall" }, { root: HOME });
const TEAM = createTeam({ name: "Compiled run team", owner: { userId: "founder", name: "Founder" } }, { root: HOME });
addMember(TEAM.id, { userId: "viewer", name: "Viewer", role: "member" }, { root: HOME });
saveProject({ ...loadProject({ root: HOME, projectId: PROJECT_ID }), teamId: TEAM.id }, { root: HOME });

after(async () => {
  await new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
  fs.rmSync(HOME, { recursive: true, force: true });
});

function gatedComposer() {
  return async () => ({
    ok: true,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input" },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "local", label: "Stage output" },
    ],
    edges: [
      { source: "src", target: "gate", edgeType: "data" },
      { source: "gate", target: "out", edgeType: "data" },
    ],
  });
}

function stagedGmailRun(item) {
  return runStore.create(
    {
      projectId: PROJECT_ID,
      pathId: `path-gmail-${Date.now()}-${Math.random()}`,
      steps: [
        { id: "src", category: "source", connector: "manual", config: { items: [item] } },
        { id: "gate", category: "gate", connector: "default", config: {} },
        { id: "gmail", category: "execute", connector: "gmail", config: { from: "founder@example.com", subject: "Route approval" } },
      ],
      edges: [
        { source: "src", target: "gate", edgeType: "data" },
        { source: "gate", target: "gmail", edgeType: "data" },
      ],
      items: [item],
      gateState: { status: "pending", awaitingReview: 1 },
      status: "staged",
    },
    { root: HOME, projectId: PROJECT_ID },
  );
}

async function stagedRun() {
  const pathRecord = gtmPathStore.create(
    {
      projectId: PROJECT_ID,
      summary: "Stage one founder-reviewed action",
      bet: { buyer: "founders", channel: "direct", offer: "useful proof" },
      status: "selected",
    },
    { root: HOME },
  );
  const { run } = await compileRunFromPath({
    projectId: PROJECT_ID,
    pathId: pathRecord.id,
    compose: gatedComposer(),
    input: { items: [{ handle: "@founder", draft: "Prepared action" }] },
    options: { root: HOME },
  });
  return run;
}

function decisionsFor(run) {
  return { [stableActionId(run, run.items[0])]: { decision: "approve" } };
}

async function browserSessionCookie() {
  const response = await fetch(`${base}/api/founder-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "compiled-run-founder" }),
  });
  const setCookie = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie().join("; ")
    : (response.headers.get("set-cookie") ?? "");
  const match = setCookie.match(/gtm_session=[^;]+/);
  assert.ok(match, "claiming the founder session with the one-time code issues the browser session cookie");
  return match[0];
}

async function nativeJson(url, options = {}) {
  const response = await fetch(url, options);
  return { status: response.status, body: await response.json() };
}

async function postRunAction(run, action, body, cookie = null, userId = null) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (userId) headers["x-gtm-user"] = userId;
  const response = await fetch(`${base}/api/projects/${PROJECT_ID}/runs/${run.id}/${action}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  return { status: response.status, body: await response.json() };
}

async function approveHttp(run, cookie = null, userId = null) {
  return postRunAction(run, "approve", { decisions: decisionsFor(run) }, cookie, userId);
}

async function greenlightHttp(run, cookie = null, userId = null) {
  return postRunAction(run, "greenlight", {}, cookie, userId);
}

describe("compiled-run UI approval is browser-only", () => {
  it("rejects a normal per-item approval from a caller without the browser session", async () => {
    const run = await stagedRun();
    const response = await approveHttp(run);
    assert.equal(response.status, 403);
    assert.match(String(response.body.error), /browser session|Drover page/i);
    assert.equal(runStore.get(run.id, { root: HOME, projectId: PROJECT_ID }).status, "staged");
  });

  it("lets the browser session release the same normal per-item approval payload", async () => {
    const run = await stagedRun();
    const response = await approveHttp(run, await browserSessionCookie(), "founder");
    assert.equal(response.status, 200);
    assert.equal(response.body.run.status, "completed");
    assert.equal(response.body.run.gateState.status, "approved");
  });

  it("rejects a browser member and a foreign-project actor before changing compiled-run state", async () => {
    const cookie = await browserSessionCookie();
    const memberRun = await stagedRun();
    const member = await approveHttp(memberRun, cookie, "viewer");
    assert.equal(member.status, 403);
    assert.match(member.body.error, /cannot release|owner or approver/i);
    assert.equal(runStore.get(memberRun.id, { root: HOME, projectId: PROJECT_ID }).status, "staged");

    const foreignRun = await stagedRun();
    const foreign = await approveHttp(foreignRun, cookie, "other-project-owner");
    assert.equal(foreign.status, 403);
    assert.equal(runStore.get(foreignRun.id, { root: HOME, projectId: PROJECT_ID }).status, "staged");
  });

  it("HTTP ROUTES — cross-venture gate, approve, greenlight, and promotion all stay 404", async () => {
    const cookie = await browserSessionCookie();
    const foreignRun = runStore.create(
      {
        projectId: "another-venture",
        pathId: "foreign-path",
        steps: [
          { id: "src", category: "source", connector: "manual" },
          { id: "gate", category: "gate", connector: "default" },
          { id: "out", category: "execute", connector: "local" },
        ],
        edges: [
          { source: "src", target: "gate", edgeType: "data" },
          { source: "gate", target: "out", edgeType: "data" },
        ],
        items: [{ draft: "private work", protects: "stage_locally" }],
        status: "staged",
      },
      { root: HOME, projectId: "another-venture" },
    );
    const headers = { Cookie: cookie, "x-gtm-user": "founder", "Content-Type": "application/json" };
    const gate = await nativeJson(`${base}/api/projects/${PROJECT_ID}/runs/${foreignRun.id}/gate`, { headers });
    const approve = await postRunAction(foreignRun, "approve", { decisions: decisionsFor(foreignRun) }, cookie, "founder");
    const greenlight = await postRunAction(foreignRun, "greenlight", {}, cookie, "founder");
    const promote = await postRunAction(foreignRun, "promote", {}, cookie, "founder");
    assert.deepEqual([gate.status, approve.status, greenlight.status, promote.status], [404, 404, 404, 404]);
  });

  it("HTTP ROUTE — founder approval injects the default Gmail runner and persists the provider id", async () => {
    const cookie = await browserSessionCookie();
    const run = stagedGmailRun({
      email: "recipient@example.com",
      subject: "Founder-approved route send",
      draft: "This leaves only after the route approval.",
      protects: "send_emails",
      joinKey: "route-gmail-approved",
    });
    const nativeFetch = globalThis.fetch;
    let gmailCalls = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes("gmail.googleapis.com/gmail/v1/users/me/messages/send")) {
        gmailCalls += 1;
        assert.match(String(options?.headers?.Authorization), /^Bearer compiled-route-test-token$/);
        return { ok: true, status: 200, json: async () => ({ id: "gmail-route-message-1" }) };
      }
      return nativeFetch(url, options);
    };
    let response;
    try {
      response = await approveHttp(run, cookie, "founder");
    } finally {
      globalThis.fetch = nativeFetch;
    }
    assert.equal(response.status, 200);
    assert.equal(gmailCalls, 1, "the persisted Gmail execute node used the route's default live runner");
    assert.equal(response.body.run.items[0].providerMessageId, "gmail-route-message-1");
    assert.equal(runStore.get(run.id, { root: HOME, projectId: PROJECT_ID }).items[0].providerMessageId, "gmail-route-message-1");
  });

  it("HTTP ROUTE — greenlight of explicit local prepare_diff proof never calls Gmail", async () => {
    const cookie = await browserSessionCookie();
    const run = stagedGmailRun({
      kind: "patch",
      email: "recipient@example.com",
      draft: "diff --git a/app.js b/app.js",
      protects: "prepare_diff",
      effectBoundary: "reviewed_diff_only",
      externalEffectAuthorized: false,
      blockedEffects: ["commit", "push", "pull_request", "merge", "publish", "deploy"],
      joinKey: "route-gmail-greenlight",
    });
    const nativeFetch = globalThis.fetch;
    let gmailCalls = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes("gmail.googleapis.com/gmail/v1/users/me/messages/send")) {
        gmailCalls += 1;
        return { ok: true, status: 200, json: async () => ({ id: "must-not-send" }) };
      }
      return nativeFetch(url, options);
    };
    let response;
    try {
      response = await greenlightHttp(run, cookie, "founder");
    } finally {
      globalThis.fetch = nativeFetch;
    }
    assert.equal(response.status, 200);
    assert.equal(gmailCalls, 0, "greenlight carries neither the default send runner nor outward-release capability");
    assert.equal(response.body.greenlight.startedInternal, 1);
    assert.ok(!response.body.run.items[0].providerMessageId);
  });
});
