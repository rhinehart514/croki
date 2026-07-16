// grant-stage-outward.test.mjs — the trust grant integrated at the real outward seam (build contract
// §4A.3), driven through the actual drive loop (mirrors security-matrix.test.mjs's driveStageOutward
// harness). A granted act proceeds without the effort waiting and says so in the conversation; a
// non-matching act still waits; a deploy still waits regardless of any grant.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

async function driveStageOutward(effect, { grantActType = null } = {}) {
  const driveOptions = { root: fs.mkdtempSync(path.join(os.tmpdir(), "grant-stage-outward-")) };
  const { createVenture, setVentureDoc, getVentureDoc } = await import("../../src/firm/venture-store.mjs");
  const { createBet } = await import("../../src/firm/bet.mjs");
  const { driveTeammate } = await import("../../src/firm/work-loop.mjs");
  const { queue: loadQueue } = await import("../../src/firm/wall.mjs");
  const { recordGrant } = await import("../../src/firm/grants.mjs");
  const { listConversation } = await import("../../src/firm/conversation.mjs");

  const venture = createVenture({ name: "grant stage outward" }, driveOptions);
  const bet = createBet({ ventureId: venture.id, intent: "outreach target", teammateRef: "sable" });
  setVentureDoc(venture.id, "bets", bet.id, bet, driveOptions);
  if (grantActType) recordGrant({ ventureId: venture.id, actType: grantActType }, driveOptions);

  function fakeClient(turns) {
    let i = 0;
    return { messages: { async create() { const r = turns[i]; i += 1; if (!r) throw new Error("extra turn"); return r; } } };
  }
  const client = fakeClient([
    { content: [
      { type: "tool_use", id: "t1", name: "get_taste", input: {} },
      { type: "tool_use", id: "s1", name: "stage_outward", input: { betId: bet.id, effect } },
    ] },
    { content: [{ type: "text", text: "done" }] },
  ]);
  const result = await driveTeammate({
    ventureId: venture.id, teammateRef: "sable", goal: "send it", betId: bet.id, options: driveOptions, deps: { client },
  });
  const queued = loadQueue(venture.id, driveOptions);
  const reloaded = getVentureDoc(venture.id, "bets", bet.id, driveOptions);
  const messages = listConversation(venture.id, driveOptions);
  return { result, queued, reloaded, messages, ventureId: venture.id };
}

describe("stage_outward + trust grant", () => {
  it("a matching granted act proceeds WITHOUT the effort waiting, and says 'you told me I could'", async () => {
    const { result, queued, reloaded, messages } = await driveStageOutward(
      { kind: "message", channel: "gmail", to: "buyer@acme.com", body: "hi" },
      { grantActType: "message:gmail" },
    );
    // The drive completes rather than pausing at the wall.
    assert.equal(result.outcome.kind, "completed", "a pre-authorized act does not pause the drive");
    // The act still parks for the record, but non-blocking and pre-authorized.
    const item = queued.find((q) => q.betId === reloaded.id);
    assert.ok(item, "the act is still recorded at the wall");
    assert.equal(item.blocksBet, false, "a granted act does not block the effort");
    assert.equal(item.effect.preAuthorizedGrantId != null, true, "the item is stamped pre-authorized by the grant");
    assert.ok(messages.some((m) => m.role === "teammate" && /you told me I could/i.test(m.content)));
    assert.ok(reloaded.events.some((e) => e.type === "parked_pre_authorized"));
  });

  it("a non-matching act type still WAITS with its exact payload at the wall (the drive pauses)", async () => {
    const { result, queued, reloaded, messages } = await driveStageOutward(
      { kind: "message", channel: "linkedin", to: "someone", body: "hi" },
      { grantActType: "message:gmail" },
    );
    assert.equal(result.outcome.kind, "paused", "a non-matching act still waits on the founder");
    const item = queued.find((q) => q.betId === reloaded.id);
    assert.ok(item);
    assert.notEqual(item.blocksBet, false, "a waiting act blocks the effort until the founder acts");
    assert.equal(item.effect.to, "someone", "the exact payload is at the wall for the founder");
    assert.equal(messages.some((m) => /you told me I could/i.test(m.content)), false);
  });

  it("INVARIANT §5.8: a deploy still WAITS regardless of any grant on record", async () => {
    const { result, queued, reloaded } = await driveStageOutward(
      { kind: "deploy", target: "prod" },
      { grantActType: "deploy" },
    );
    assert.equal(result.outcome.kind, "paused", "deploy keeps its wait even with a deploy grant on file");
    const item = queued.find((q) => q.betId === reloaded.id);
    assert.ok(item, "the deploy is parked for the founder");
    assert.equal(item.effect.preAuthorizedGrantId, undefined, "a deploy is never stamped pre-authorized");
  });
});
