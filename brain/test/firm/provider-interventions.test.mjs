import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  __resetProviderInterventions,
  applyProviderInterventionDecision,
  consumeInPlaceContinuation,
  createProviderInterventionHandler,
  providerPermissionKey,
} from "../../src/firm/provider-interventions.mjs";
import { resumeAnsweredIntervention } from "../../src/firm/routes.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import { decide, park, queue } from "../../src/firm/wall.mjs";
import { loadWork, saveWork } from "../../src/firm/work-loop-state.mjs";
import { driveTeammate } from "../../src/firm/work-loop.mjs";
import { __resetLiveRuns, registerLiveRun } from "../../src/firm/work-loop-stream.mjs";
import { founderRequest } from "../helpers/founder-capability.mjs";
import { createWorkJournal } from "../../src/firm/work-journal.mjs";
import { appendConversationMessage, listConversation } from "../../src/firm/conversation.mjs";
import { ensureDirectionThread } from "../../src/firm/semantic-model-store.mjs";

const freshRoot = () => ({ root: fs.mkdtempSync(path.join(os.tmpdir(), "provider-intervention-")) });

// The exact turn-ending message a run gets when nothing can hold its callback open. Asserted verbatim so
// the no-live-run path stays byte-identical to the pre-streaming contract.
const PARKED_MESSAGE = "Croki parked this request for the founder. End this turn and wait; the decision will arrive when this same session resumes.";

// A live run whose prompt queue is genuinely open for this drive, registered exactly the way
// work-loop-stream.mjs registers one from the streaming seam.
function liveDrive({ ventureId, driveId = "drive-live", threadRef = "thread:one" }) {
  registerLiveRun({ driveId, ventureId, threadRef, handle: { steer: () => true } });
  return { driveId, threadRef };
}

describe("provider interventions", () => {
  it("connects the provider callback to the real Work pause and founder wall", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Native provider question" }, options);
    const runtime = {
      id: "claude-question-test",
      label: "Claude Code",
      supportsAbort: true,
      async drive(ctx) {
        const result = await ctx.onProviderIntervention({
          toolName: "AskUserQuestion",
          input: { questions: [{
            header: "Scope",
            question: "Which customer should this work target?",
            options: [
              { label: "Teams", description: "Target collaborative accounts." },
              { label: "Solo", description: "Target individual accounts." },
            ],
          }] },
        });
        assert.equal(result.behavior, "deny");
        assert.equal(ctx.currentStatus(), "paused");
        return { kind: "paused" };
      },
    };
    const result = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founder",
      goal: "Choose the next customer segment",
      initiatedBy: "founder",
      options,
      deps: { runtime },
    });
    assert.equal(result.outcome.kind, "paused");
    const waiting = queue(venture.id, options);
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0].effect.kind, "provider-question");
    assert.equal(waiting[0].effect.continuation.runtime, runtime.id);
    assert.ok(waiting[0].effect.continuation.target.threadRef);
    const { work } = loadWork({ ventureId: venture.id, teammateRef: "founder", options });
    assert.match(work.pausedFor, /Which customer/);
    const openedProjection = createWorkJournal(options).readProjections(venture.id);
    assert.equal(openedProjection.attention[0].kind, "intervention");
    assert.equal(openedProjection.runs[0].interventions[0].status, "open");

    decide(
      { ventureId: venture.id, itemId: waiting[0].id, decision: "answer", note: "Teams" },
      { req: founderRequest() },
      {},
      options,
    );
    const resolvedProjection = createWorkJournal(options).readProjections(venture.id);
    assert.equal(resolvedProjection.runs[0].interventions[0].status, "answer");
    assert.equal(resolvedProjection.attention.length, 0);
  });

  it("parks Claude's structured question and pauses durable work", async () => {
    let work = { pausedFor: null };
    let parked;
    const handler = createProviderInterventionHandler({
      ventureId: "venture-1",
      continuation: { teammateRef: "founder", target: { threadRef: "thread:one" } },
      getWork: () => work,
      putWork: (next) => { work = next; },
      park: async (input) => { parked = input; return { id: "wall-one" }; },
    });
    const result = await handler({
      toolName: "AskUserQuestion",
      input: { questions: [{
        header: "Approach",
        question: "Which implementation should Claude use?",
        multiSelect: false,
        options: [
          { label: "Native", description: "Use the existing seam.", preview: "preview_open" },
          { label: "Custom", description: "Build another driver." },
        ],
      }] },
    });
    assert.equal(result.behavior, "deny");
    assert.equal(parked.effect.kind, "provider-question");
    assert.equal(parked.effect.questions[0].options[0].preview, "preview_open");
    assert.equal(parked.effect.continuation.target.threadRef, "thread:one");
    assert.match(work.pausedFor, /Which implementation/);
    assert.equal(work.pendingProviderIntervention.decisionRef, "decision:wall-one");
  });

  it("consumes only an exact one-shot permission grant", async () => {
    const input = { command: "npm run test:unit" };
    let work = { nativePermissionGrant: { permissionKey: providerPermissionKey("Bash", input) } };
    let parkCalls = 0;
    const handler = createProviderInterventionHandler({
      ventureId: "venture-1",
      continuation: { teammateRef: "founder" },
      getWork: () => work,
      putWork: (next) => { work = next; },
      park: async () => { parkCalls += 1; return { id: "wall" }; },
    });
    assert.deepEqual(await handler({ toolName: "Bash", input }), { behavior: "allow", updatedInput: input });
    assert.equal(work.nativePermissionGrant, null);
    assert.equal(parkCalls, 0);
    assert.equal((await handler({ toolName: "Bash", input: { command: "npm run build" } })).behavior, "deny");
    assert.equal(parkCalls, 1);
  });

  it("persists a betless allow-once decision on the exact work scope", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Permission continuation" }, options);
    const continuation = {
      teammateRef: "founder",
      target: { workScopeRef: "work-scope:thread-one", threadRef: "thread:one" },
    };
    saveWork({
      ventureId: venture.id,
      teammateRef: "founder",
      workScopeRef: continuation.target.workScopeRef,
      work: { pausedFor: "Waiting", pendingProviderIntervention: { key: "key" } },
      options,
    });
    const item = park({
      ventureId: venture.id,
      purpose: "answer",
      effect: {
        kind: "provider-permission",
        permissionKey: "exact-key",
        question: "Allow Bash?",
        continuation,
      },
    }, options);
    decide(
      { ventureId: venture.id, itemId: item.id, decision: "answer", note: "Allow once" },
      { req: founderRequest() },
      {},
      options,
    );
    const { work } = loadWork({
      ventureId: venture.id,
      teammateRef: "founder",
      workScopeRef: continuation.target.workScopeRef,
      options,
    });
    assert.equal(work.nativePermissionGrant.permissionKey, "exact-key");
    assert.equal(work.pendingProviderIntervention, null);
  });

  it("resumes the same provider, model, Thread, and worktree context", async () => {
    let input;
    const receipt = {
      ventureId: "venture-1",
      betId: null,
      purpose: "answer",
      decision: "answer",
      note: "Use the native path",
      effect: { continuation: {
        teammateRef: "founder",
        runtime: "claude-code",
        model: "claude-opus-4-1",
        effort: "high",
        directSdk: true,
        target: { threadRef: "thread:one", workScopeRef: "work-scope:one" },
      } },
    };
    await resumeAnsweredIntervention(receipt, {
      drive: async (next) => { input = next; return { outcome: { kind: "completed" } }; },
    });
    assert.equal(input.goal, "Use the native path");
    assert.equal(input.runtime, "claude-code");
    assert.equal(input.model, "claude-opus-4-1");
    assert.equal(input.target.threadRef, "thread:one");
    assert.equal(input.target.workScopeRef, "work-scope:one");
    assert.equal(input.initiatedBy, "founder");
  });

  it("resolves a live-run permission in place — same turn, same session, no new drive", async () => {
    __resetLiveRuns();
    __resetProviderInterventions();
    const options = freshRoot();
    const venture = createVenture({ name: "Live permission" }, options);
    const input = { command: "npm run test:unit" };
    let reply = null;
    let receipt = null;
    let queuedWhilePending = 0;
    let grantAfterAnswer = "unset";
    const runtime = {
      id: "claude-live-test",
      label: "Claude Code",
      supportsAbort: true,
      async drive(ctx) {
        ctx.onRuntimeSession("session-live");
        ctx.onRunHandle({ steer: () => true });
        ctx.onTurn();
        // The provider asks mid-turn; the callback stays open while the founder decides. A real answer
        // arrives from the event loop (an HTTP decide), never inside the callback's own microtask chain,
        // so the test yields the same way rather than racing the park it depends on.
        const pending = ctx.onProviderIntervention({ toolName: "Bash", input });
        await new Promise((resolve) => { setImmediate(resolve); });
        queuedWhilePending = queue(venture.id, options).length;
        const item = queue(venture.id, options)[0];
        receipt = decide(
          { ventureId: venture.id, itemId: item.id, decision: "answer", note: "Allow once" },
          { req: founderRequest() },
          {},
          options,
        );
        reply = await pending;
        // Read the durable record while the run is still live: an answer spent in place mints no
        // cold-resume grant, so the same allow can never be spent a second time.
        grantAfterAnswer = loadWork({ ventureId: venture.id, teammateRef: "founder", options }).work.nativePermissionGrant ?? null;
        ctx.onText("Ran the tests.");
        return { kind: "completed", summary: "Ran the tests." };
      },
    };
    const result = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founder",
      goal: "Run the unit tests",
      initiatedBy: "founder",
      options,
      deps: { runtime },
    });
    // The founder's answer came back through the SAME open callback: the turn never died.
    assert.deepEqual(reply, { behavior: "allow", updatedInput: input });
    assert.equal(result.outcome.kind, "completed");
    // The durable park was written all the same, and it settled exactly once.
    assert.equal(queuedWhilePending, 1);
    assert.equal(queue(venture.id, options).length, 0);
    assert.equal(receipt.decision, "answer");
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: receipt.id, decision: "answer", note: "Allow once" }, { req: founderRequest() }, {}, options),
      /already decided/,
    );
    // No resume: no new drive, the step count never restarted, and the provider session is the same one.
    assert.equal(await resumeAnsweredIntervention(receipt), null);
    const { work } = loadWork({ ventureId: venture.id, teammateRef: "founder", options });
    assert.equal(work.stepCount, 1);
    assert.equal(work.runtimeSessionId, "claude-live-test:session-live");
    assert.equal(work.pausedFor, null);
    assert.equal(work.pendingProviderIntervention, null);
    assert.equal(grantAfterAnswer, null);
    __resetLiveRuns();
    __resetProviderInterventions();
  });

  it("hands a live-run question the founder's exact answer without ending the turn", async () => {
    __resetLiveRuns();
    __resetProviderInterventions();
    const options = freshRoot();
    const venture = createVenture({ name: "Live question" }, options);
    const origin = appendConversationMessage({ ventureId: venture.id, role: "founder", content: "Choose a segment" }, options);
    const direction = ensureDirectionThread(venture.id, { name: "Choose a segment", identityKey: origin.id, originMessageRef: `conversation:${origin.id}` }, options);
    const live = liveDrive({ ventureId: venture.id, threadRef: direction.threadRef });
    let work = { };
    const handler = createProviderInterventionHandler({
      ventureId: venture.id,
      continuation: { teammateRef: "founder", target: { threadRef: live.threadRef } },
      getWork: () => work,
      putWork: (next) => { work = next; },
      park,
      liveRun: live,
      options,
    });
    const pending = handler({
      toolName: "AskUserQuestion",
      input: { questions: [{ header: "Scope", question: "Which segment?", options: [{ label: "Teams" }] }] },
    });
    await new Promise((resolve) => { setImmediate(resolve); });
    const item = queue(venture.id, options)[0];
    decide({ ventureId: venture.id, itemId: item.id, decision: "answer", note: "Teams" }, { req: founderRequest() }, {}, options);
    const reply = await pending;
    // Croki never synthesizes a selection: the founder's exact words ride back on the denial channel.
    assert.equal(reply.behavior, "deny");
    assert.match(reply.message, /^The founder answered: Teams/);
    assert.ok(listConversation(venture.id, options).some((message) => message.role === "founder" && message.content === "Teams"));
    assert.equal(listConversation(venture.id, options).some((message) => /AskUserQuestion|pendingProviderIntervention/.test(message.content)), false);
    assert.equal(work.pendingProviderIntervention, null);
    // The same answer is marked as already delivered, keyed exactly the way driveTeammate reads it, so
    // wall.decide()'s continuation cannot fork a second run over this Thread.
    assert.equal(
      consumeInPlaceContinuation({ ventureId: venture.id, teammateRef: "founder", betId: null, target: { threadRef: live.threadRef }, goal: "Teams" }),
      true,
    );
    __resetLiveRuns();
    __resetProviderInterventions();
  });

  it("falls back to deny-and-resume when the founder does not answer in time", async () => {
    __resetLiveRuns();
    __resetProviderInterventions();
    const options = freshRoot();
    const venture = createVenture({ name: "Absent founder" }, options);
    const live = liveDrive({ ventureId: venture.id });
    let work = {};
    const handler = createProviderInterventionHandler({
      ventureId: venture.id,
      continuation: { teammateRef: "founder", target: { threadRef: live.threadRef } },
      getWork: () => work,
      putWork: (next) => { work = next; },
      park,
      liveRun: live,
      waitMs: 5,
      options,
    });
    const result = await handler({ toolName: "Bash", input: { command: "npm run build" } });
    assert.deepEqual(result, { behavior: "deny", message: PARKED_MESSAGE });
    // The park is untouched by the expiry: it is still the founder's queued decision, still resumable.
    assert.equal(queue(venture.id, options).length, 1);
    assert.ok(work.pendingProviderIntervention.decisionRef);
    const item = queue(venture.id, options)[0];
    decide({ ventureId: venture.id, itemId: item.id, decision: "answer", note: "Allow once" }, { req: founderRequest() }, {}, options);
    const answered = applyProviderInterventionDecision(work, { ...item, decision: "answer" }, "answer", "Allow once", "now");
    assert.equal(answered.nativePermissionGrant.permissionKey, item.effect.permissionKey);
    __resetLiveRuns();
    __resetProviderInterventions();
  });

  it("ends the turn exactly as before when no run is live", async () => {
    __resetLiveRuns();
    __resetProviderInterventions();
    const options = freshRoot();
    const venture = createVenture({ name: "No live run" }, options);
    let work = {};
    const handler = createProviderInterventionHandler({
      ventureId: venture.id,
      continuation: { teammateRef: "founder", target: { threadRef: "thread:one" } },
      getWork: () => work,
      putWork: (next) => { work = next; },
      park,
      liveRun: { driveId: "drive-live", threadRef: "thread:one" },
      options,
    });
    const result = await handler({ toolName: "Bash", input: { command: "npm run build" } });
    assert.deepEqual(result, { behavior: "deny", message: PARKED_MESSAGE });
    const item = queue(venture.id, options)[0];
    const receipt = decide(
      { ventureId: venture.id, itemId: item.id, decision: "answer", note: "Allow once" },
      { req: founderRequest() },
      {},
      options,
    );
    // Nothing was held open, so the ordinary continuation still drives the answer into a fresh session.
    let resumed = null;
    await resumeAnsweredIntervention(receipt, { drive: async (next) => { resumed = next; return { outcome: { kind: "completed" } }; } });
    assert.equal(resumed.goal, "Allow once");
    __resetProviderInterventions();
  });

  it("mints a grant only for the explicit allow answer", () => {
    const item = { id: "wall-one", effect: { kind: "provider-permission", permissionKey: "key" } };
    assert.equal(
      applyProviderInterventionDecision({}, item, "answer", "Allow once", "now").nativePermissionGrant.permissionKey,
      "key",
    );
    assert.equal(
      applyProviderInterventionDecision({}, item, "answer", "Deny", "now").nativePermissionGrant,
      null,
    );
  });
});
