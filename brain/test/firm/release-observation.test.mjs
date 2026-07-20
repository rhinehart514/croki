import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createBet } from "../../src/firm/bet.mjs";
import { createRelease } from "../../src/firm/release-index.mjs";
import { checkObservationContract, grantObservationContract, revokeObservationContract } from "../../src/firm/release-observation.mjs";
import { mutateSemanticModel } from "../../src/firm/semantic-model-store.mjs";
import { createVenture, setVentureDoc } from "../../src/firm/venture-store.mjs";
import { decide, park } from "../../src/firm/wall.mjs";
import { founderRequest } from "../helpers/founder-capability.mjs";

function fixture() {
  const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "drover-observation-")) };
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "drover-observation-repo-"));
  const venture = createVenture({ name: "Observation", repository }, { ...options, seedFoundingCrew: false });
  const actor = { authority: "founder", id: "founder" };
  const created = createRelease({ ventureId: venture.id, baseRevision: 0, actor, release: { id: "release-one", name: "Release one" } }, options);
  const bet = createBet({ ventureId: venture.id, intent: "Send exact release" });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  const queued = park({ ventureId: venture.id, betId: bet.id, workRef: "work-one", effect: { kind: "message", channel: "gmail", to: "buyer@example.com", body: "Hello" } }, options);
  decide({ ventureId: venture.id, itemId: queued.id, decision: "release" }, { req: founderRequest() }, { isFounderPresent: () => true, executeEffect: () => ({ messageId: "gmail-message-one" }) }, options);
  mutateSemanticModel({ ventureId: venture.id, baseRevision: created.releaseIndex.revision, actor, operations: [
    { op: "create-record", family: "threads", record: { id: "release-thread", name: "Release work", lifecycle: "open", subjectRefs: ["object:release-one"], messageRefs: [], participantRefs: [], properties: {} } },
    { op: "create-record", family: "runs", record: { id: "release-run", threadRef: "thread:release-thread", lifecycle: "completed", betRefs: [`bet:${bet.id}`], eventRefs: [], workRefs: [], decisionRefs: [`decision:${queued.id}`], outcomeRefs: [], scopeRefs: [], participantRefs: [], properties: {} } },
  ] }, options);
  return { options, venture, actor, queued };
}

function grant(fx, overrides = {}) {
  return grantObservationContract({ ventureId: fx.venture.id, releaseId: "release-one", source: "gmail", purpose: "Capture attributable replies", startsAt: "2099-01-01T00:00:00.000Z", endsAt: "2099-01-15T00:00:00.000Z", returnConditions: ["reply", "objection", "window closes"], actor: fx.actor, ...overrides }, fx.options);
}

describe("release observation authority", () => {
  it("grants exact release-scoped read authority without any outward authority", async () => {
    const fx = fixture();
    const contract = grant(fx);
    assert.deepEqual(contract.messageIds, ["gmail-message-one"]);
    assert.deepEqual(contract.decisionRefs, [`decision:${fx.queued.id}`]);
    assert.deepEqual(contract.authority.reads, ["gmail:thread"]);
    assert.deepEqual(contract.authority.denies, ["send", "publish", "deploy", "spend", "canonical-interpretation"]);

    let observed = null;
    const result = await checkObservationContract({ ventureId: fx.venture.id, releaseId: "release-one", contractId: contract.id }, fx.options, {
      now: () => "2099-01-02T00:00:00.000Z",
      pollReplies: async (_ventureId, options) => { observed = options.sentIndex; return { polled: 1, ingested: [{ outcomeKind: "reply", joined: true }] }; },
    });
    assert.equal(observed.size, 1);
    assert.equal(observed.get("gmail-message-one").releaseRef, "object:release-one");
    assert.equal(observed.get("gmail-message-one").observationContractRef, `observation:${contract.id}`);
    assert.equal(result.evidence.ingested[0].outcomeKind, "reply");
  });

  it("fails closed for agents, invalid windows, revocation, expiry, and a foreign release", async () => {
    const fx = fixture();
    assert.throws(() => grant(fx, { actor: { authority: "agent", id: "model" } }), /Only the founder/);
    assert.throws(() => grant(fx, { endsAt: "2098-01-01T00:00:00.000Z" }), /explicit valid start and end/);
    const contract = grant(fx);
    await assert.rejects(() => checkObservationContract({ ventureId: fx.venture.id, releaseId: "foreign", contractId: contract.id }, fx.options, { now: () => "2099-01-02T00:00:00.000Z" }), /No such observation contract/);
    await assert.rejects(() => checkObservationContract({ ventureId: fx.venture.id, releaseId: "release-one", contractId: contract.id }, fx.options, { now: () => "2099-02-01T00:00:00.000Z" }), /window closed/);
    revokeObservationContract({ ventureId: fx.venture.id, releaseId: "release-one", contractId: contract.id, actor: fx.actor }, fx.options);
    await assert.rejects(() => checkObservationContract({ ventureId: fx.venture.id, releaseId: "release-one", contractId: contract.id }, fx.options, { now: () => "2099-01-02T00:00:00.000Z" }), /revoked/);
  });
});
