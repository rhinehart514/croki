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
const { registerLiveRun, __resetLiveRuns } = await import("../../src/firm/work-loop-stream.mjs");
const { driveTeammate: driveThroughWorkLoop } = await import("../../src/firm/work-loop.mjs");
const { stageJourneyImport } = await import("../../src/firm/journey-import.mjs");
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

  it("a reply into a Thread with a live run steers the SAME turn instead of queueing for the next one", async () => {
    const { venture, bet } = ventureWithEffort("live same-turn steer");
    const steers = [];
    registerLiveRun({
      driveId: "drive-live-1", ventureId: venture.id, betId: bet.id,
      handle: { steer: (text, attachments) => { steers.push({ text, attachments }); return true; } },
    });
    try {
      const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
        message: "focus on the pricing objection first", betId: bet.id,
      }, { deps: { dialogueDeps: { classify: async () => null } } });
      assert.equal(res.status, 200);
      assert.equal(res.body.act, "steer");
      assert.equal(res.body.applied, "same-turn");
      assert.equal(res.body.runRef, "run:drive-live-1");
      assert.deepEqual(steers.map((s) => s.text), ["focus on the pricing objection first"]);
      assert.equal(pendingSteerFor(venture.id, bet.id, options).length, 0, "the live turn owns the steer; nothing waits for a restart");
      assert.ok(listConversation(venture.id, options).some((m) => m.role === "founder" && /pricing objection/.test(m.content)));
    } finally {
      __resetLiveRuns();
    }
  });

  it("a steer that races the run's settled queue falls back to the durable next-step path", async () => {
    const { venture, bet } = ventureWithEffort("settled queue fallback");
    registerLiveRun({ driveId: "drive-live-2", ventureId: venture.id, betId: bet.id, handle: { steer: () => false } });
    try {
      const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
        message: "tighten the second paragraph", betId: bet.id,
      }, { deps: { dialogueDeps: { classify: async () => null } } });
      assert.equal(res.status, 200);
      assert.equal(res.body.applied, "next-step");
      assert.equal(pendingSteerFor(venture.id, bet.id, options).length, 1, "a racing steer lands durably instead of vanishing");
    } finally {
      __resetLiveRuns();
    }
  });

  it("persists multiple images on the founder turn and gives their real paths to the selected SDK", async () => {
    const { venture, bet, threadRef } = configuredThread("visual reply");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1]);
    let driveInput;
    const response = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "Compare these two screens", betId: bet.id, threadRef, mode: "work", runtime: "codex",
      images: [
        { name: "current.png", mediaType: "image/png", data: png.toString("base64") },
        { name: "target.jpg", mediaType: "image/jpeg", data: jpeg.toString("base64") },
      ],
    }, { deps: { driveTeammate: (input) => { driveInput = input; return { outcome: { kind: "completed" } }; } } });
    assert.equal(response.status, 202);
    assert.equal(driveInput.attachments.length, 2);
    assert.ok(driveInput.attachments.every((attachment) => fs.existsSync(attachment.path)));
    const founderTurn = listConversation(venture.id, options).find((message) => message.content === "Compare these two screens");
    assert.deepEqual(founderTurn.attachments.map((attachment) => attachment.name), ["current.png", "target.jpg"]);
    const image = await call("GET", `/api/ventures/${venture.id}/attachments/${founderTurn.attachments[0].id}/data`);
    assert.equal(image.status, 200);
    assert.equal(image.body.dataUrl, `data:image/png;base64,${png.toString("base64")}`);
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

  it("keeps a Product question on its canvas while using the selected Work SDK", async () => {
    const { venture, threadRef } = configuredThread("direct Product question");
    let driven = null;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "what does this onboarding page prove today",
      mode: "work",
      threadRef,
      runtime: "codex",
      model: "gpt-5.6-sol",
      effort: "xhigh",
      productGtmView: true,
    }, { deps: {
      driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; },
    } });
    assert.equal(res.status, 202);
    assert.equal(res.body.act, "answer");
    assert.equal(res.body.teammateRef, "codex");
    assert.equal(driven.runtime, "codex");
    assert.equal(driven.model, "gpt-5.6-sol");
    assert.equal(driven.effort, "xhigh");
    assert.equal(driven.directSdk, true);
    assert.equal(driven.target.threadRef, threadRef);
    assert.equal(res.body.threadRef, threadRef);
  });

  it("binds a sanitized journey profile to the exact Product Thread without exposing raw rows", async () => {
    const { venture, threadRef } = configuredThread("journey mapping Thread");
    const raw = "session_id,timestamp,route,email\nprivate-session,2026-07-01T10:00:00Z,/pricing,founder@example.com\n";
    const profile = stageJourneyImport(venture.id, {
      name: "journey.csv",
      mediaType: "text/csv",
      data: Buffer.from(raw).toString("base64"),
    }, options);
    let driven = null;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "Map this journey source to the Product walk.",
      mode: "work",
      threadRef,
      runtime: "codex",
      model: "gpt-5.6-sol",
      effort: "high",
      productGtmView: true,
      journeyImportRef: profile.importRef,
    }, { deps: {
      driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; },
    } });

    assert.equal(res.status, 202);
    assert.equal(res.body.act, "answer", "journey mapping stays beside the Product canvas");
    assert.equal(driven.target.threadRef, threadRef);
    assert.equal(driven.target.journeyImportRef, profile.importRef);
    assert.equal(driven.target.journeyImportProfile.rowCount, 1);
    assert.equal(driven.attachments.length, 0, "raw journey evidence is never passed as a provider attachment");
    assert.equal(JSON.stringify(driven.target).includes("private-session"), false);
    assert.equal(JSON.stringify(driven.target).includes("founder@example.com"), false);
    assert.equal(JSON.stringify(driven.target).includes("/pricing"), false);

    const founderTurn = listConversation(venture.id, options).find((message) => message.id === res.body.messageId);
    assert.deepEqual(founderTurn.attachments, [{
      kind: "journey-import",
      importRef: profile.importRef,
      name: "journey.csv",
      mediaType: "text/csv",
      byteSize: Buffer.byteLength(raw),
      digest: profile.digest,
    }]);
  });

  it("does not replace the selected Product SDK with a contextual participant", async () => {
    const { venture, bet, threadRef } = configuredThread("selected Product SDK");
    let driven = null;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "Have Claude inspect the onboarding consequence",
      mode: "work",
      threadRef,
      betId: bet.id,
      runtime: "codex",
      model: "gpt-5.6-sol",
      effort: "high",
      productGtmView: true,
    }, { deps: {
      driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; },
    } });
    assert.equal(res.status, 202);
    assert.equal(res.body.teammateRef, "codex");
    assert.equal(driven.runtime, "codex");
    assert.equal(driven.directSdk, true);
    assert.equal(driven.target.teammateRefs, undefined);
  });

  it("routes an explicitly included agent by exact ref and preserves the participation target", async () => {
    const { venture } = configuredThread("mentioned contextual agent");
    let driven = null;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "new idea: @Codex investigate the onboarding proof",
      mode: "context",
      teammateRefs: ["codex"],
    }, { deps: { driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; } } });
    assert.equal(res.status, 202);
    assert.equal(res.body.teammateRef, "codex");
    assert.deepEqual(driven.target.teammateRefs, ["codex"]);
    const founderTurn = listConversation(venture.id, options).find((message) => message.id === res.body.fromMessageId);
    assert.deepEqual(founderTurn.target.teammateRefs, ["codex"]);
  });

  it("refuses an included agent ref that is not configured for the venture", async () => {
    const { venture } = configuredThread("unknown contextual agent");
    let driven = false;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "new idea: @Ghost investigate the onboarding proof",
      mode: "context",
      teammateRefs: ["ghost"],
    }, { deps: { driveTeammate: async () => { driven = true; return { outcome: { kind: "completed" } }; } } });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /not configured/);
    assert.equal(driven, false);
  });

  it("starts a Work coding turn nonblocking with the founder's selected model", async () => {
    const venture = createVenture({ name: "reply selected model" }, options);
    let driven = null;
    let routed = false;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "implement the compact work composer", mode: "work", runtime: "codex", model: "gpt-5.4",
    }, { deps: {
      driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; },
      routingDeps: { classify: async () => { routed = true; return null; } },
    } });
    assert.equal(res.status, 202);
    assert.equal(res.body.teammateRef, "codex");
    assert.equal(routed, false, "Work talks directly to the selected SDK model");
    assert.equal(driven.runtime, "codex");
    assert.equal(driven.model, "gpt-5.4");
    assert.equal(driven.directSdk, true);
    assert.equal(driven.target.threadRef, res.body.threadRef);
    assert.equal(res.body.why, undefined, "the selected SDK does not narrate its own continuation");
    assert.equal(res.body.messageId, res.body.fromMessageId, "the acceptance exposes the founder turn's durable identity");
    const thread = getSemanticModel(venture.id).threads.find((entry) => `thread:${entry.id}` === res.body.threadRef);
    assert.ok(thread?.messageRefs.includes(`conversation:${res.body.messageId}`));
    assert.equal(listConversation(venture.id, options).some((message) => /^Continuing with /.test(message.content)), false,
      "Work waits for the SDK's real response instead of inserting a provider acknowledgement");
  });

  it("routes Product / GTM graph corrections to the exact staged work in the same bet", async () => {
    const { venture, bet, threadRef } = configuredThread("revise workflow graph");
    let driven = null;
    const res = await call("POST", `/api/ventures/${venture.id}/conversation/reply`, {
      message: "Wait seven days before taking the silence branch", mode: "work", threadRef,
      betId: bet.id, workRef: "workflow-one", workflowSketch: true, productGtmView: true,
    }, { deps: { driveTeammate: async (input) => { driven = input; return { outcome: { kind: "completed" } }; } } });
    assert.equal(res.status, 202);
    assert.equal(res.body.act, "answer", "a canvas correction stays with the canvas while its SDK work runs");
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
