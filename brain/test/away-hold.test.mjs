// away-hold.test.mjs — EXPERIMENT-MACHINE-SPEC rail 1, second half: "nothing outward runs when the
// founder is away." Proves the away / unattended state HOLDS an unattended standing-autonomy auto-approval
// of any POSSIBLY-outward item, and that away only ADDS conservatism — it never loosens the wall.
//
// What this proves:
//   - Present + outward standing pattern → auto-approves (today's behavior, unchanged).
//   - Away + outward standing pattern → HELD pending (the hold). Even a graduated/blessed pattern.
//   - Away + NON-outward standing pattern (staging locally, possiblyOutward false) → still auto-approves;
//     away holds only what could leave.
//   - FAIL CLOSED (FIX 2b): away + an UNKNOWN / unrecognized executor (possiblyOutward not proven false)
//     → HELD. An unknown downstream is treated as possibly-outward and held, never auto-approved.
//   - Away never turns a hold into a send: an away run can only move an auto-approval toward pending.
//   - The presence lease is automatic: a heartbeat makes present, a lapsed lease makes away.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { run as runGate } from "../src/connectors/gate/default.mjs";
import {
  markPresent,
  markAway,
  isFounderPresent,
  getPresence,
  __setPresenceClock,
  __resetPresence,
  PRESENCE_LEASE_MS,
} from "../src/presence.mjs";

const CLEAN = [
  { id: "a", draft: "Hi there, saw your repo.", protects: "send_emails" },
  { id: "b", draft: "Loved your latest release.", protects: "send_emails" },
];

// A gate node promoted to a standing autonomy pattern — the ONE path where an outward item can be
// auto-approved with no live human in the loop.
const AUTONOMOUS_GATE = {
  id: "gate-1",
  category: "gate",
  config: { autonomy: "autonomous", blessedPattern: { decision: "approve" } },
};

describe("away / unattended hold — the gate connector", () => {
  it("PRESENT + outward standing pattern still auto-approves (unchanged behavior)", async () => {
    const context = { __run: { originRunId: "run-1" }, __founderPresent: true, __gateDownstream: { willSend: true, possiblyOutward: true } };
    const result = await runGate(AUTONOMOUS_GATE, [...CLEAN], context);
    assert.equal(result.meta.mode, "autonomy");
    assert.equal(result.meta.approved, 2);
    assert.equal(result.pendingReview, false);
  });

  it("AWAY + outward standing pattern HOLDS every item pending — nothing outward runs unattended", async () => {
    const context = { __run: { originRunId: "run-1" }, __founderPresent: false, __gateDownstream: { willSend: true, possiblyOutward: true } };
    const result = await runGate(AUTONOMOUS_GATE, [...CLEAN], context);
    // The standing pattern is suppressed: this falls through to per-item hold, NOT the autonomy path.
    assert.notEqual(result.meta.mode, "autonomy");
    assert.equal(result.pendingReview, true);
    assert.ok(result.items.every((item) => item.approvalStatus === "pending"),
      "every outward item is held pending while the founder is away");
    // The hold NEVER produces an approval — away can only add conservatism.
    assert.equal(result.items.filter((i) => i.approvalStatus === "approved").length, 0);
  });

  it("AWAY + NON-outward standing pattern still auto-approves — away holds only what could leave", async () => {
    // possiblyOutward false: every downstream branch is proven-internal (local/artifact), so approving
    // here stages locally and does not cross the wall — away does not hold it.
    const context = { __run: { originRunId: "run-1" }, __founderPresent: false, __gateDownstream: { willSend: false, possiblyOutward: false } };
    const localItems = [
      { id: "a", draft: "stage this", protects: "stage_locally" },
      { id: "b", draft: "stage that", protects: "stage_locally" },
    ];
    const result = await runGate(AUTONOMOUS_GATE, localItems, context);
    assert.equal(result.meta.mode, "autonomy");
    assert.equal(result.meta.approved, 2);
  });

  it("FAIL CLOSED — AWAY + an UNKNOWN / unrecognized executor is HELD (was fail-open before)", async () => {
    // An unrecognized connector resolves to willSend:null → possiblyOutward true. The old code held only on
    // willSend===true, so an unknown executor auto-approved unattended — the hole. It must now be HELD.
    const unknownExecutor = { __run: { originRunId: "run-1" }, __founderPresent: false, __gateDownstream: { connector: "some-new-sender", verb: null, willSend: null, possiblyOutward: true } };
    const heldUnknown = await runGate(AUTONOMOUS_GATE, [...CLEAN], unknownExecutor);
    assert.notEqual(heldUnknown.meta.mode, "autonomy", "an unknown executor while away is held, not auto-approved");
    assert.ok(heldUnknown.items.every((i) => i.approvalStatus === "pending"));

    // A Slack node is a real sender that was MISSING from the willSend map (fail-open). It is now outward.
    const slackExecutor = { __run: { originRunId: "run-1" }, __founderPresent: false, __gateDownstream: { connector: "slack", willSend: true, possiblyOutward: true } };
    const heldSlack = await runGate(AUTONOMOUS_GATE, [...CLEAN], slackExecutor);
    assert.notEqual(heldSlack.meta.mode, "autonomy", "Slack while away is held");

    // Even with NO downstream descriptor at all (unknown), away holds — the conservative default.
    const noDescriptor = { __run: { originRunId: "run-1" }, __founderPresent: false, __gateDownstream: undefined };
    const heldNoInfo = await runGate(AUTONOMOUS_GATE, [...CLEAN], noDescriptor);
    assert.notEqual(heldNoInfo.meta.mode, "autonomy", "no downstream info while away fails closed — held");
  });
});

describe("presence lease — automatic detection with a visible state", () => {
  afterEach(() => __resetPresence());

  it("a heartbeat makes the founder present; a lapsed lease makes them away", () => {
    let t = 1_000_000;
    __setPresenceClock(() => t);
    __resetPresence();
    __setPresenceClock(() => t);

    // Fresh boot with no heartbeat → away (conservative default).
    assert.equal(isFounderPresent(), false);
    assert.equal(getPresence().state, "away");

    // A heartbeat → present.
    markPresent();
    assert.equal(isFounderPresent(), true);
    assert.equal(getPresence().state, "present");
    assert.equal(getPresence().outwardHold, false);

    // Time passes beyond the lease with no further heartbeat → the lease lapses to away on its own.
    t += PRESENCE_LEASE_MS + 1;
    assert.equal(isFounderPresent(), false);
    assert.equal(getPresence().state, "away");
    assert.equal(getPresence().outwardHold, true);
  });

  it("markAway drops to away immediately, and the indicator always reports which state it is in", () => {
    __resetPresence();
    markPresent();
    assert.equal(getPresence().present, true);
    markAway();
    const p = getPresence();
    assert.equal(p.present, false);
    assert.equal(p.state, "away");
    // The automatic-default flag is exposed so the indicator can say the state was detected, not toggled.
    assert.equal(p.detection, "automatic");
  });
});
