// work-loop-tools-security.test.mjs — the wall-bypass fix in stage_outward (work-loop-tools.mjs),
// adversarial coverage.
//
// THE HOLE a red-team audit found: stage_outward classified a MODEL-SUPPLIED effect by trusting
// effect.effects.external/irreversible/financial verbatim (classifyCapabilityEffects was built for
// host-authored static definitions, never live model data). A call declaring an outward-shaped effect
// (to/channel/etc.) with no effects.external:true classified as read-only and skipped the wall with no
// trace — and separately, producedDraft:false skipped the taste-consult gate on the same call. Two
// founder gates fell in one unprivileged call.
//
// THE FIX (v2 — closes the CLASS, not each field): hasOutwardSignal() walks the effect's WHOLE tree
// (objects and arrays, unbounded depth up to a node cap) for two independent signals, either of which
// FORCES the wall regardless of what effect.effects claims: (1) a recognized field name anywhere in
// the tree (a widened, growable list — to, recipients, cc, bcc, email, channel, url, endpoint, webhook,
// amount, price, charge, deploy, publish, release, phone, sms, sms_to, slack_channel_id, target,
// recipient_list, post_url, address), and (2) a string VALUE anywhere in the tree matching an email,
// http(s) URL, or phone-number pattern — this is the class-closer: it fires even under a field name the
// host has never seen before. v1 (a one-level, plain-objects-only field scan) was red-teamed and beaten
// by deeper nesting, arrays, and novel field names — all three are covered here (see the "evasion
// classes" describe below) and security-matrix.test.mjs's matching tests flipped from documenting the
// gap to proving it closed. Default is deny (park); only an effect tripping NONE of these signals (and
// not host-classified FOUNDER_WALL either) may skip. producedDraft is forced true for anything routed
// to the wall, so the model's own flag can never waive the taste consult on an outward effect. Every
// call — parked or not — leaves a "stage_outward_classified" event on the bet.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildToolSet } from "../../src/firm/work-loop-tools.mjs";
import { createVenture, setVentureDoc, getVentureDoc } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-stage-outward-security-")) };
}

async function setup(options) {
  const venture = createVenture({ name: "Stage-outward security" }, options);
  const bet = createBet({ ventureId: venture.id, intent: "cold email to ops leads", teammateRef: "outreach-writer" });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  const taste = await import("../../src/firm/taste.mjs");
  const ventureStore = await import("../../src/firm/venture-store.mjs");
  const parked = [];
  const { tools, consultedNames } = buildToolSet({
    ventureId: venture.id, teammateRef: "outreach-writer", options, taste, ventureStore,
    deps: { park: async (item) => { parked.push(item); return { id: "queue-1", ...item }; } },
  });
  const stageOutward = tools.find((t) => t.name === "stage_outward");
  const stageArtifact = tools.find((t) => t.name === "stage_artifact");
  const getTaste = tools.find((t) => t.name === "get_taste");
  return { venture, bet, stageArtifact, stageOutward, getTaste, consultedNames, parked, options };
}

describe("staged work — stable identity and participant attribution", () => {
  it("revises one durable work record and preserves owner/contributor attribution", async () => {
    const options = freshRoot();
    const firstDrive = await setup(options);
    await firstDrive.getTaste.run({});
    const first = await firstDrive.stageArtifact.run({
      betId: firstDrive.bet.id,
      title: "Paid pilot offer",
      content: "First draft",
    });

    const taste = await import("../../src/firm/taste.mjs");
    const ventureStore = await import("../../src/firm/venture-store.mjs");
    const secondTools = buildToolSet({
      ventureId: firstDrive.venture.id,
      teammateRef: "buyer-researcher",
      options,
      taste,
      ventureStore,
      deps: {},
    }).tools;
    await secondTools.find((tool) => tool.name === "get_taste").run({});
    const revised = await secondTools.find((tool) => tool.name === "stage_artifact").run({
      betId: firstDrive.bet.id,
      workRef: first.id,
      content: "Revised with buyer language",
    });

    const reloaded = getVentureDoc(firstDrive.venture.id, "bets", firstDrive.bet.id, options);
    assert.equal(reloaded.staged.length, 1, "revision updates the same durable work record");
    assert.equal(revised.id, first.id);
    assert.deepEqual(revised.ownerRefs, ["outreach-writer"]);
    assert.deepEqual(revised.contributorRefs, ["buyer-researcher"]);
    assert.equal(revised.title, "Paid pilot offer");
    assert.equal(revised.content, "Revised with buyer language");
  });

  it("parks the outward act against the exact staged work and rejects a foreign work reference", async () => {
    const options = freshRoot();
    const { bet, stageArtifact, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const work = await stageArtifact.run({ betId: bet.id, content: "Offer draft" });
    const result = await stageOutward.run({
      betId: bet.id,
      workRef: work.id,
      effect: { kind: "message", to: "buyer@acme.com", body: "Offer" },
    });
    assert.equal(result.queueItem.workRef, work.id);
    assert.equal(parked[0].workRef, work.id);
    await assert.rejects(
      () => stageOutward.run({ betId: bet.id, workRef: "staged-from-another-bet", effect: { to: "buyer@acme.com" } }),
      /No staged work/,
    );
  });

  it("infers one possible origin but never guesses among several staged workpieces", async () => {
    const options = freshRoot();
    const { bet, stageArtifact, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const onlyWork = await stageArtifact.run({ betId: bet.id, content: "First workpiece" });
    const inferred = await stageOutward.run({ betId: bet.id, effect: { to: "buyer@acme.com" } });
    assert.equal(inferred.queueItem.workRef, onlyWork.id);

    await stageArtifact.run({ betId: bet.id, content: "Second workpiece" });
    const unjoined = await stageOutward.run({ betId: bet.id, effect: { to: "other@acme.com" } });
    assert.equal(unjoined.queueItem.workRef, null, "chronology must not masquerade as provenance");
    assert.equal(parked.length, 2);
  });

  it("attributes an involved participant to work staged after their contribution", async () => {
    const options = freshRoot();
    const base = await setup(options);
    const taste = await import("../../src/firm/taste.mjs");
    const ventureStore = await import("../../src/firm/venture-store.mjs");
    const { tools } = buildToolSet({
      ventureId: base.venture.id,
      teammateRef: "outreach-writer",
      options,
      taste,
      ventureStore,
      coordinationParticipants: [{ ref: "buyer-researcher" }],
      coordinationProtocols: ["consult"],
      involveParticipant: async () => ({ contribution: "Buyer language needs a concrete result." }),
      deps: {},
    });
    await tools.find((tool) => tool.name === "get_taste").run({});
    await tools.find((tool) => tool.name === "involve_participant").run({
      targetRef: "buyer-researcher",
      protocol: "consult",
      question: "Check the offer language",
    });
    const work = await tools.find((tool) => tool.name === "stage_artifact").run({
      betId: base.bet.id,
      content: "Revised paid pilot offer",
    });
    assert.deepEqual(work.ownerRefs, ["outreach-writer"]);
    assert.deepEqual(work.contributorRefs, ["buyer-researcher"]);
  });
});

describe("stage_outward — the exact bypass call now parks and leaves a trace", () => {
  it("an outward-shaped effect (to/channel/body) with NO effects.external declared still forces the wall", async () => {
    const options = freshRoot();
    const { venture, bet, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const result = await stageOutward.run({
      betId: bet.id,
      effect: { kind: "message", channel: "gmail", to: "x@y.com", body: "..." },
    });
    assert.equal(result.lane, "founder-wall", "the exact bypass call now classifies FOUNDER_WALL");
    assert.equal(result.parked, true, "and it actually parks");
    assert.equal(parked.length, 1, "park() was really called");

    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    const classified = (reloaded.events ?? []).find((e) => e.type === "stage_outward_classified");
    assert.ok(classified, "a distinguishing classification event was left on the bet");
    assert.match(classified.detail, /founder-wall/);
    assert.ok((reloaded.events ?? []).some((e) => e.type === "parked"), "a parked event was also recorded");
    void venture;
  });
});

describe("stage_outward — a mislabeled effect (outward fields + effects.external:false) still parks", () => {
  it("effects.external:false cannot suppress the structural signal", async () => {
    const options = freshRoot();
    const { bet, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const result = await stageOutward.run({
      betId: bet.id,
      effect: { kind: "message", to: "victim@corp.com", effects: { external: false, irreversible: false, financial: false } },
    });
    assert.equal(result.lane, "founder-wall", "the model's own false claim never overrides the structural signal");
    assert.equal(result.parked, true);
    assert.equal(parked.length, 1);
  });

  it("a recipient buried one level deep (nested message object) is still caught", async () => {
    const options = freshRoot();
    const { bet, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const result = await stageOutward.run({
      betId: bet.id,
      effect: { kind: "custom-shape", message: { to: "victim@corp.com", body: "hi" } },
    });
    assert.equal(result.lane, "founder-wall");
    assert.equal(result.parked, true);
    assert.equal(parked.length, 1);
  });
});

describe("stage_outward — producedDraft:false on an outward effect still consults taste", () => {
  it("declaring producedDraft:false never waives the taste-consult gate for anything that parks", async () => {
    const options = freshRoot();
    const { bet, stageOutward } = await setup(options);
    // get_taste is deliberately never called.
    await assert.rejects(
      () => stageOutward.run({ betId: bet.id, effect: { to: "x@y.com" }, producedDraft: false }),
      /moat|taste/i,
    );
  });

  it("with taste actually consulted, the same outward effect proceeds to park", async () => {
    const options = freshRoot();
    const { bet, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const result = await stageOutward.run({ betId: bet.id, effect: { to: "x@y.com" }, producedDraft: false });
    assert.equal(result.parked, true);
    assert.equal(parked.length, 1);
  });
});

describe("stage_outward — the four confirmed evasion classes of the field-name-only v1 fix now all park", () => {
  it("depth: a recipient two levels deep ({payload:{message:{to:...}}}) still parks", async () => {
    const options = freshRoot();
    const { bet, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const result = await stageOutward.run({
      betId: bet.id,
      effect: { kind: "custom", payload: { message: { to: "victim@acme.com", body: "hi" } } },
    });
    assert.equal(result.parked, true, "the whole-tree walk is not depth-limited to one level");
    assert.equal(parked.length, 1);
  });

  it("arrays: a batch of recipient objects ({batch:[{to:...}]}) still parks", async () => {
    const options = freshRoot();
    const { bet, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const result = await stageOutward.run({
      betId: bet.id,
      effect: { kind: "message", batch: [{ to: "victim@acme.com" }] },
    });
    assert.equal(result.parked, true, "array elements are walked exactly like object values");
    assert.equal(parked.length, 1);
  });

  it("field names: phone/sms_to/slack_channel_id/target/recipient_list/post_url/address all park (now recognized field names)", async () => {
    const shapes = [
      { phone: "+15551234567" },
      { sms_to: "+15551234567" },
      { slack_channel_id: "C123" },
      { target: "prod-db" },
      { recipient_list: ["victim@acme.com"] },
      { post_url: "https://evil.example.com/hook" },
      { address: "victim@acme.com" },
    ];
    for (const extra of shapes) {
      const fresh = await setup(freshRoot());
      await fresh.getTaste.run({});
      const result = await fresh.stageOutward.run({ betId: fresh.bet.id, effect: { kind: "message", ...extra } });
      assert.equal(result.parked, true, `${Object.keys(extra)[0]} now parks`);
    }
  });

  it("value-pattern (the class-closer): a TOTALLY NOVEL field name with an email-shaped value still parks — no field-name dependency at all", async () => {
    const options = freshRoot();
    const { bet, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const result = await stageOutward.run({
      betId: bet.id,
      effect: { kind: "message", totally_novel_key_nobody_named: "reach me at victim@acme.com" },
    });
    assert.equal(result.parked, true, "the value-pattern signal fires on content alone, closing the class rather than one more field");
    assert.equal(parked.length, 1);
  });

  it("value-pattern also catches a bare URL or phone number under a novel key, with no email present", async () => {
    const urlCase = await setup(freshRoot());
    await urlCase.getTaste.run({});
    const urlResult = await urlCase.stageOutward.run({ betId: urlCase.bet.id, effect: { kind: "custom", weblink: "https://evil.example.com/hook" } });
    assert.equal(urlResult.parked, true);

    const phoneCase = await setup(freshRoot());
    await phoneCase.getTaste.run({});
    const phoneResult = await phoneCase.stageOutward.run({ betId: phoneCase.bet.id, effect: { kind: "custom", contact_info: "call 555-123-4567" } });
    assert.equal(phoneResult.parked, true);
  });
});

describe("stage_outward — a genuinely-local artifact still skips the wall cleanly (no false positive)", () => {
  it("an effect with none of the recognized outward-shaped fields, and no host effects.external claim, is not parked", async () => {
    const options = freshRoot();
    const { bet, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const result = await stageOutward.run({
      betId: bet.id,
      effect: { kind: "internal-note", title: "research summary", body: "just some findings, nothing outward" },
    });
    assert.equal(result.lane, "read-only");
    assert.equal(result.parked, false, "a genuinely local artifact is never force-parked");
    assert.equal(parked.length, 0);
  });

  it("the pre-existing {external:true} top-level convention (no nested effects object) still parks — no regression", async () => {
    const options = freshRoot();
    const { bet, stageOutward, getTaste, parked } = await setup(options);
    await getTaste.run({});
    const result = await stageOutward.run({ betId: bet.id, effect: { external: true } });
    assert.equal(result.lane, "founder-wall");
    assert.equal(result.parked, true);
    assert.equal(parked.length, 1);
  });
});
