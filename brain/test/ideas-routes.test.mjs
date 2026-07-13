// Founder-facing idea routes (server.mjs): list, kill, keep, and trigger-a-round. The kill/keep routes
// are the FOUNDER door — killing banks an IdeaKill FeedbackSignal, keeping banks an IdeaKeep, and a kill
// is dead (keep never resurrects it). The round route delegates to the ideate path; here we only cover
// its guard (a round needs a goal), since a real round invokes Claude on the subscription.
//
// Boots the real route handler on an ephemeral port against an isolated store root, so this exercises
// the actual HTTP wiring, not a re-implementation.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the durable home BEFORE importing the server (and idea-store), so every write lands in a temp
// dir that the routes and the test seed share.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-ideas-routes-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";
process.env.GTM_IDE_FOUNDER_CODE = "ideas-test-founder";
process.env.GTM_IDE_ENABLE_LEGACY_MACHINERY = "1";

// Grab a free port, then hand it to the server via PORT.
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

const { createGtmIdea, getGtmIdea } = await import("../src/idea-store.mjs");
const { loadFeedbackLedger } = await import("../src/feedback-ledger.mjs");
const { createOperatorSession } = await import("../src/operator-store.mjs");
const { server } = await import("../src/server.mjs");

if (!server.listening) await once(server, "listening");

const base = `http://127.0.0.1:${PORT}`;
const PROJECT = "ideas-routes-test";

async function browserCookie() {
  const response = await fetch(`${base}/api/founder-session`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "ideas-test-founder" }),
  });
  return (response.headers.get("set-cookie") ?? "").match(/gtm_session=[^;]+/)?.[0] ?? "";
}

after(() => {
  server.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("idea routes — the founder door", () => {
  it("lists a project's ideas and filters by goal", async () => {
    const a = createGtmIdea({ projectId: PROJECT, goal: "land 5 pilots", angle: "asset-first", pitch: "Pitch A" });
    createGtmIdea({ projectId: PROJECT, goal: "grow the list", angle: "edge-first", pitch: "Pitch B" });

    const all = await fetch(`${base}/api/projects/${PROJECT}/ideas`).then((r) => r.json());
    assert.ok(all.ideas.length >= 2);

    const scoped = await fetch(`${base}/api/projects/${PROJECT}/ideas?goal=${encodeURIComponent("land 5 pilots")}`)
      .then((r) => r.json());
    assert.ok(scoped.ideas.every((idea) => idea.goal === "land 5 pilots"));
    assert.ok(scoped.ideas.some((idea) => idea.id === a.id));
  });

  it("kills an idea: marks it dead AND banks an IdeaKill feedback signal", async () => {
    const idea = createGtmIdea({ projectId: PROJECT, goal: "g", angle: "asset-first", pitch: "Kill me" });

    const res = await fetch(`${base}/api/projects/${PROJECT}/ideas/${idea.id}/kill`, { method: "POST", headers: { cookie: await browserCookie() } });
    assert.equal(res.status, 200);
    const { idea: updated } = await res.json();
    assert.equal(updated.killed, true);
    assert.equal(updated.verdict, "killed");
    assert.equal(getGtmIdea(idea.id).killed, true);

    const ledger = loadFeedbackLedger(PROJECT);
    const kill = ledger.signals.find((s) => s.type === "IdeaKill" && s.ideaId === idea.id);
    assert.ok(kill, "an IdeaKill signal rides the feedback rail");
    // It is a founder decision, never an AgentAction the crystallizer could freeze into a tool.
    assert.notEqual(kill.type, "AgentAction");
  });

  it("keeps a survivor and banks an IdeaKeep signal", async () => {
    const idea = createGtmIdea({ projectId: PROJECT, goal: "g", angle: "asset-first", pitch: "Keep me" });

    const res = await fetch(`${base}/api/projects/${PROJECT}/ideas/${idea.id}/keep`, { method: "POST", headers: { cookie: await browserCookie() } });
    assert.equal(res.status, 200);
    const { idea: updated } = await res.json();
    assert.equal(updated.killed, false);

    const ledger = loadFeedbackLedger(PROJECT);
    assert.ok(ledger.signals.some((s) => s.type === "IdeaKeep" && s.ideaId === idea.id));
  });

  it("refuses to keep a killed idea — a kill is dead, not deprioritized", async () => {
    const idea = createGtmIdea({ projectId: PROJECT, goal: "g", angle: "asset-first", pitch: "Dead", killed: true });

    const res = await fetch(`${base}/api/projects/${PROJECT}/ideas/${idea.id}/keep`, { method: "POST", headers: { cookie: await browserCookie() } });
    assert.equal(res.status, 409);
  });

  it("a 404 when killing an idea that does not exist", async () => {
    const res = await fetch(`${base}/api/projects/${PROJECT}/ideas/idea-nope/kill`, { method: "POST", headers: { cookie: await browserCookie() } });
    assert.equal(res.status, 404);
  });

  // The operator pause→pick path is reachable over HTTP: POST .../ideas dispatches to
  // resolveOperatorIdeas (the founder kill/keep act). A session holding no proposed ideas hits the
  // guard, proving the route is wired without driving the model. The resolution logic itself is covered
  // at the function level in operator-ideate.test.mjs.
  it("the operator ideas action is wired and resolved by the founder, not the agent", async () => {
    const session = createOperatorSession({ goal: "Find a wedge.", projectId: PROJECT });
    const res = await fetch(`${base}/api/operator/sessions/${session.id}/ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ build: [], kill: [] }),
    });
    assert.equal(res.status, 409);
    const out = await res.json();
    assert.match(out.error, /no proposed ideas/i);
  });

  it("an ideation round needs a goal", async () => {
    const res = await fetch(`${base}/api/projects/${PROJECT}/ideas/round`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const out = await res.json();
    assert.match(out.error, /goal/i);
  });
});
