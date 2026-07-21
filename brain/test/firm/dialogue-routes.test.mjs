// dialogue-routes.test.mjs — the conversation as the operating handle (build contract Phase 4). A
// founder reply is classified and dispatched to the existing seams: steer enqueues, close ends the
// effort (founder-only), approve/approve-standing surface the waiting act (and record a grant), and a
// new direction routes to a teammate. Also proves the SSE stream opens fail-closed and pushes events.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "firm-dialogue-routes-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: dialogueRoutes } = await import("../../src/firm/dialogue-routes.mjs");
const { createVenture, setVentureDoc, getVentureDoc, listVentureDocs } = await import("../../src/firm/venture-store.mjs");
const { createBet } = await import("../../src/firm/bet.mjs");
const { park } = await import("../../src/firm/wall.mjs");
const { listConversation } = await import("../../src/firm/conversation.mjs");
const { pendingSteerFor } = await import("../../src/firm/work-loop-steer.mjs");
const { liveGrants } = await import("../../src/firm/grants.mjs");
const { getFirmConfiguration, applyFirmConfiguration } = await import("../../src/firm/configuration.mjs");
const { ensureDirectionThread, getSemanticModel, recordRun } = await import("../../src/firm/semantic-model-store.mjs");
const { beginActiveDrive, listActiveDrives } = await import("../../src/firm/active-drives.mjs");
const { driveTeammate: driveThroughWorkLoop } = await import("../../src/firm/work-loop.mjs");
const { AGENT_HEADERS } = { AGENT_HEADERS: { "x-gtm-actor": "agent" } };

const options = { root };

async function call(method, pathname, body = null, { headers = {}, deps = {} } = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await dialogueRoutes({ req, res, url: new URL(pathname, "http://local"), deps });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

function ventureWithEffort(name, intent = "cold outreach") {
  const venture = createVenture({ name }, options);
  const bet = createBet({ ventureId: venture.id, intent, teammateRef: "sable" });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  return { venture, bet };
}

function configuredThread(name) {
  const { venture, bet } = ventureWithEffort(name);
  const initial = getFirmConfiguration(venture.id, options);
  applyFirmConfiguration({
    ventureId: venture.id,
    expectedRevision: initial.revision,
    configuration: { ...initial, agents: [
      { ref: "claude", name: "Claude", activation: "direct" },
      { ref: "codex", name: "Codex", activation: "direct" },
    ] },
    summary: "Add the two implementation participants",
  }, options);
  const { threadRef } = ensureDirectionThread(venture.id, { name, subjectRefs: [`bet:${bet.id}`], identityKey: bet.id }, options);
  return { venture, bet, threadRef };
}

describe("POST conversation/reply — dialogue dispatch", () => {
  it("an ambiguous reply steers the effort's next run and records the founder message", async () => {
    const { venture, bet } = ventureWithEffort("reply steer");
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "tighten the opening, it's too salesy", betId: bet.id,
    }, { deps: { dialogueDeps: { classify: async () => null } } });
    assert.equal(res.status, 200);
    assert.equal(res.body.act, "steer");
    assert.equal(res.body.applied, "next-step");
    assert.equal(pendingSteerFor(venture.id, bet.id, options).length, 1);
    assert.ok(listConversation(venture.id, options).some((m) => m.role === "founder" && /tighten the opening/.test(m.content)));
  });

  it("'close it' ends the effort (founder-only) and it recedes; no button is added", async () => {
    const { venture, bet } = ventureWithEffort("reply close");
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "that's done, close it", betId: bet.id,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.act, "close");
    assert.equal(res.body.ended, true);
    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.ok(reloaded.endedAt, "the effort is ended");
    assert.equal(reloaded.endedBy, "founder", "only the founder ends work");
  });

  it("an agent-stamped reply is refused — dialogue is a founder act", async () => {
    const { venture, bet } = ventureWithEffort("reply agent refused");
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "close it", betId: bet.id,
    }, { headers: AGENT_HEADERS });
    assert.equal(res.status, 403);
    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal(reloaded.endedAt, null, "the refused close never ended the effort");
  });

  it("'you can send these yourself' records a trust grant for the waiting act type and surfaces the gate", async () => {
    const { venture, bet } = ventureWithEffort("reply approve standing");
    park({ ventureId: venture.id, betId: bet.id, purpose: "release", effect: { kind: "message", channel: "gmail", to: "buyer@acme.com" } }, options);
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "you can send these yourself from now on", betId: bet.id,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.act, "approve-standing");
    assert.equal(res.body.grant.actType, "message:gmail");
    assert.equal(liveGrants(venture.id, options).length, 1);
    assert.ok(res.body.waitingItemId, "the exact waiting act is surfaced for the founder's own release");
  });

  it("a new direction routes to the coordinator with a visible one-line why, then drives", async () => {
    const venture = createVenture({ name: "reply new direction" }, options);
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "new idea: reach out to referral partners instead",
    }, { deps: { driveTeammate: async () => ({ outcome: { kind: "completed" }, messages: [] }) } });
    assert.equal(res.status, 202);
    assert.equal(res.body.act, "new-direction");
    assert.ok(res.body.teammateRef, "a teammate claimed the direction");
    const claim = listConversation(venture.id, options).find((m) => m.role === "teammate");
    assert.ok(claim, "the claim is visible in the thread before work begins");
  });

  it("answers a contextual workflow question through the SDK without routing the surface to Work", async () => {
    const venture = createVenture({ name: "contextual workflow question" }, options);
    let driven = null;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "what is considered garbage right now in this project",
      mode: "context",
    }, { deps: { driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; } } });
    assert.equal(res.status, 202);
    assert.equal(res.body.act, "answer");
    assert.deepEqual(driven.target, { threadRef: res.body.threadRef });
  });

  it("starts a Work coding turn nonblocking with the founder's selected model", async () => {
    const venture = createVenture({ name: "reply selected model" }, options);
    let driven = null;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "implement the compact work composer", mode: "work", runtime: "codex", model: "gpt-5.4",
    }, { deps: {
      driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; },
    } });
    assert.equal(res.status, 202);
    assert.equal(driven.runtime, "codex");
    assert.equal(driven.model, "gpt-5.4");
  });

  it("routes Product / GTM graph corrections to the exact staged work in the same bet", async () => {
    const { venture, bet, threadRef } = configuredThread("revise workflow graph");
    let driven = null;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "Wait seven days before taking the silence branch", mode: "work", threadRef,
      betId: bet.id, workRef: "workflow-one", workflowSketch: true,
    }, { deps: { driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; } } });
    assert.equal(res.status, 202);
    assert.equal(driven.betId, bet.id);
    assert.equal(driven.target.threadRef, threadRef);
    assert.equal(driven.target.workRef, "workflow-one");
    assert.equal(driven.target.workflowSketch, true);
  });

  it("routes a selected artifact section as an exact in-place correction", async () => {
    const { venture, bet, threadRef } = configuredThread("revise artifact section");
    let driven = null;
    const founderWords = "Use founder introductions before cold outreach";
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: founderWords, mode: "context", threadRef, betId: bet.id, workRef: "launch-brief",
      artifactSection: { title: "Channel W", index: 0 },
    }, { deps: {
      dialogueDeps: { classify: async () => "steer" },
      driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; },
    } });
    assert.equal(res.status, 202);
    assert.equal(driven.target.threadRef, threadRef);
    assert.equal(driven.target.workRef, "launch-brief");
    assert.deepEqual(driven.target.artifactSection, { title: "Channel W", index: 0 });
    assert.ok(listConversation(venture.id, options).some((message) => message.role === "founder" && message.content === founderWords));
  });

  it("records the founder direction exactly once when routing through the real work loop", async () => {
    const venture = createVenture({ name: "reply new direction once" }, options);
    const direction = "new idea: pilot the referral partner motion";
    let settled = false;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: direction,
    }, { deps: {
      driveTeammate: async (input) => {
        try { return await driveThroughWorkLoop(input); }
        finally { settled = true; }
      },
      workLoopDeps: { client: { messages: { async create() { return { content: [{ type: "text", text: "on it" }] }; } } } },
    } });
    assert.equal(res.status, 202);
    assert.equal(res.body.act, "new-direction");
    for (let attempt = 0; attempt < 50 && !settled; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(settled, true, "the background drive settled before the test releases its venture store");
    const founderMessages = listConversation(venture.id, options).filter((m) => m.role === "founder" && m.content === direction);
    assert.equal(founderMessages.length, 1, "the founder direction is not duplicated by the work loop");
  });

  it("fails closed for an unknown venture", async () => {
    const res = await call("POST", "/api/ventures/no-such-venture/conversation/reply", { message: "hi" });
    assert.equal(res.status, 404);
  });

  it("accepts a direction without holding the composer open for provider completion", async () => {
    const venture = createVenture({ name: "nonblocking direction" }, options);
    let driveStarted = false;
    let driveFinished = false;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "inspect the return flow",
    }, { deps: { driveTeammate: async () => {
      driveStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 30));
      driveFinished = true;
      return { outcome: { kind: "completed" } };
    } } });
    assert.equal(res.status, 202);
    assert.equal(res.body.accepted, true);
    assert.equal(driveStarted, true);
    assert.equal(driveFinished, false);
    assert.ok(res.body.threadRef);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(driveFinished, true);
  });

  it("checks returned evidence from the current conversation without starting agent work", async () => {
    const { venture, bet, threadRef } = configuredThread("observe market returns");
    let polled = false;
    let driven = false;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "Check for returned evidence and replies.", betId: bet.id, threadRef,
    }, { deps: {
      checkObservations: async () => {
        polled = true;
        return { polled: 2, ingested: [{ outcomeKind: "reply", deduped: false }] };
      },
      driveTeammate: async () => { driven = true; },
    } });
    assert.equal(res.status, 200);
    assert.equal(res.body.act, "observe");
    assert.equal(polled, true);
    assert.equal(driven, false);
    assert.match(res.body.note, /1 new market return/);
    assert.ok(listConversation(venture.id, options).some((message) => /joined to the work that caused it/.test(message.content)));
  });

  it("starts two independent attempts as sibling bets in the same thread", async () => {
    const { venture, bet, threadRef } = configuredThread("parallel approaches");
    const calls = [];
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "Let Claude and Codex try independently and show me both approaches.", betId: bet.id, threadRef,
    }, { deps: { driveTeammate: async (input) => { calls.push(input); return { outcome: { kind: "completed" } }; } } });
    assert.equal(res.status, 202);
    assert.equal(res.body.act, "parallel-attempts");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((input) => input.target.threadRef === threadRef));
    const children = listVentureDocs(venture.id, "bets", options).filter((item) => item.forkedFrom === bet.id);
    assert.deepEqual(new Set(children.map((item) => item.teammateRef)), new Set(["claude", "codex"]));
  });

  it("routes an exact participant critique to the latest artifact in the same thread", async () => {
    const { venture, bet, threadRef } = configuredThread("critique returned work");
    setVentureDoc(venture.id, "bets", bet.id, { ...bet, staged: [{ id: "onboarding-preview", title: "Onboarding preview", content: "preview" }] }, options);
    let driven = null;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "Have Claude critique what Codex just built.", betId: bet.id, threadRef,
    }, { deps: { driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; } } });
    assert.equal(res.status, 202);
    assert.equal(res.body.act, "critique");
    assert.equal(driven.teammateRef, "claude");
    assert.equal(driven.target.workRef, "work:onboarding-preview");
    assert.equal(driven.target.threadRef, threadRef);
  });

  it("asks instead of guessing when a parallel participant command is ambiguous", async () => {
    const { venture, bet, threadRef } = configuredThread("ambiguous agents");
    let driven = false;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "Have Claude and the researcher try independently.", betId: bet.id, threadRef,
    }, { deps: { driveTeammate: async () => { driven = true; } } });
    assert.equal(res.status, 200);
    assert.equal(res.body.act, "parallel-attempts");
    assert.equal(res.body.needsFounderJudgment, true);
    assert.equal(driven, false);
  });

  it("an explicit close closes the canonical thread as well as its effort", async () => {
    const { venture, bet, threadRef } = configuredThread("close thread");
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "we've learned enough, close this", betId: bet.id, threadRef,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.act, "close-thread");
    assert.equal(getSemanticModel(venture.id, options).threads.find((thread) => `thread:${thread.id}` === threadRef).lifecycle, "closed");
  });

  it("stops only the named participant's active run and leaves the thread and peer running", async () => {
    const { venture, bet, threadRef } = configuredThread("participant stop");
    const codex = beginActiveDrive({ ventureId: venture.id, teammateRef: "codex", betId: bet.id, runtime: "codex", abortSupported: true });
    const claude = beginActiveDrive({ ventureId: venture.id, teammateRef: "claude", betId: bet.id, runtime: "claude-code", abortSupported: true });
    recordRun(venture.id, { id: codex.id, threadRef, betRefs: [`bet:${bet.id}`] }, {}, options);
    recordRun(venture.id, { id: claude.id, threadRef, betRefs: [`bet:${bet.id}`] }, {}, options);
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, { message: "Stop Codex.", betId: bet.id, threadRef });
    assert.equal(res.status, 200);
    assert.equal(res.body.act, "stop-run");
    assert.ok(listConversation(venture.id, options).some((message) => /Stop requested for Codex/.test(message.content)));
    const active = listActiveDrives(venture.id);
    assert.ok(active.find((drive) => drive.id === codex.id).abortRequestedAt);
    assert.equal(active.find((drive) => drive.id === claude.id).abortRequestedAt, null);
    assert.equal(getSemanticModel(venture.id, options).threads.find((thread) => `thread:${thread.id}` === threadRef).lifecycle, "open");
    codex.finish(); claude.finish();
  });

  it("stops a named betless run by its exact thread", async () => {
    const venture = createVenture({ name: "betless stop" }, options);
    const configuration = getFirmConfiguration(venture.id, options);
    applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: configuration.revision,
      configuration: { ...configuration, agents: [{ ref: "claude", name: "Claude", activation: "direct" }] },
      summary: "Add Claude",
    }, options);
    const { threadRef } = ensureDirectionThread(venture.id, { name: "Audit the shell", identityKey: "betless-stop" }, options);
    const claude = beginActiveDrive({ ventureId: venture.id, teammateRef: "claude", betId: null, runtime: "claude-code", abortSupported: true });
    recordRun(venture.id, { id: claude.id, threadRef, betRefs: [] }, {}, options);
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, { message: "Stop Claude.", threadRef });
    assert.equal(res.status, 200);
    assert.equal(res.body.act, "stop-run");
    assert.ok(listActiveDrives(venture.id).find((drive) => drive.id === claude.id).abortRequestedAt);
    claude.finish();
  });
});

describe("GET events (SSE) — the live push stream", () => {
  it("opens fail-closed for an unknown venture", async () => {
    const res = await call("GET", "/api/ventures/no-such-venture/events");
    assert.equal(res.status, 404);
  });

  it("opens a text/event-stream for a real venture and pushes an emitted event, then cleans up", async () => {
    const venture = createVenture({ name: "sse stream" }, options);
    const { emitFirmEvent, __subscriberCount } = await import("../../src/firm/firm-events.mjs");

    const writes = [];
    let closeHandler;
    const req = Readable.from([]);
    req.method = "GET";
    req.url = `/api/ventures/${venture.id}/events`;
    req.headers = founderHeaders({ method: "GET", path: req.url });
    req.on = (event, handler) => { if (event === "close") closeHandler = handler; return req; };
    let headers = null;
    const res = {
      writeHead(status, h) { this.status = status; headers = h; },
      write(chunk) { writes.push(chunk); },
      end() {},
    };
    const handled = await dialogueRoutes({ req, res, url: new URL(req.url, "http://local") });
    assert.equal(handled, true);
    assert.equal(res.status, 200);
    assert.match(headers["Content-Type"], /text\/event-stream/);
    const before = __subscriberCount();
    assert.ok(before >= 1, "the client subscribed to firm events");

    emitFirmEvent(venture.id, "conversation", { betId: null });
    assert.ok(writes.some((w) => /event: conversation/.test(w)), "the emitted event was pushed to the stream");

    closeHandler?.();
    assert.equal(__subscriberCount(), before - 1, "closing the connection unsubscribes");
  });
});
