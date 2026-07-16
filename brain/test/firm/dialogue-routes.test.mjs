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
    assert.equal(res.status, 200);
    assert.equal(res.body.act, "new-direction");
    assert.ok(res.body.teammateRef, "a teammate claimed the direction");
    const claim = listConversation(venture.id, options).find((m) => m.role === "teammate");
    assert.ok(claim, "the claim is visible in the thread before work begins");
  });

  it("fails closed for an unknown venture", async () => {
    const res = await call("POST", "/api/ventures/no-such-venture/conversation/reply", { message: "hi" });
    assert.equal(res.status, 404);
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
