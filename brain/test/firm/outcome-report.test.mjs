// outcome-report.test.mjs — evidence to cause (build contract §4A.4): a joined market reply surfaces in
// the conversation as the teammate reporting it, attached to the effort that caused it and linking down to
// the outcome record. Proven end-to-end through recordOutcome (the real join path) and directly on the
// report composer. Guards the honest edges: an unattributed signal reports nothing; a poller re-observing
// the same reply reports it once, not once per tick; a founder-entered outcome reports the same way (the
// contract's founder-entered proof path); the reported words carry no internal nouns.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { recordOutcome, recordFounderOutcome } from "../../src/firm/market.mjs";
import { composeOutcomeReport, speakerLabel, reportJoinedOutcome } from "../../src/firm/outcome-report.mjs";
import { createVenture, setVentureDoc, listVentureDocs } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { listConversation } from "../../src/firm/conversation.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-outcome-report-")) };
}

function makeBet(ventureId, options, overrides = {}) {
  const bet = createBet({ ventureId, intent: "cold outbound to fintech ops", teammateRef: "outreach-writer", ...overrides });
  setVentureDoc(ventureId, "bets", bet.id, bet, options);
  return bet;
}

// Forbidden nouns the founder must never read (mirror of the UI founder-language guard's intent, applied
// to the one server-authored line this feature adds to the thread).
const FORBIDDEN = /\b(bet|joinkey|join key|outcome|motion|fork|the wall|pipeline|stage|work item)\b/i;

describe("outcome report — a joined reply is reported in the conversation as the teammate", () => {
  it("appends a teammate-authored message attached to the causing effort, linking to the record", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Reported reply" }, options);
    const bet = makeBet(venture.id, options);

    const { outcome, joined } = recordOutcome(
      { ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "what does pricing look like?", from: "jo@buffalo.com", source: "connected-account", channel: "gmail" },
      options,
    );
    assert.equal(joined, true);

    const messages = listConversation(venture.id, options);
    const report = messages.find((m) => m.outcomeReport);
    assert.ok(report, "a conversation message reporting the reply exists");
    assert.equal(report.role, "teammate", "spoken by the teammate, not the founder or an agent");
    assert.equal(report.teammateRef, bet.teammateRef, "authored as the teammate that owns the effort");
    assert.equal(report.target?.betId, bet.id, "attached to the effort that caused the reply");
    assert.equal(report.outcomeReport.outcomeId, outcome.id, "links down to the outcome record");
    assert.equal(report.outcomeReport.channel, "gmail");
    assert.match(report.content, /Jo replied/, "reads as the market answering");
    assert.match(report.content, /pricing/, "carries what the market actually said");
  });

  it("the reported line is founder language — no internal nouns leak into what the founder reads", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Clean copy" }, options);
    const bet = makeBet(venture.id, options);
    recordOutcome(
      { ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "interested, tell me more", from: "sam@acme.com", source: "connected-account" },
      options,
    );
    const report = listConversation(venture.id, options).find((m) => m.outcomeReport);
    assert.doesNotMatch(report.content, FORBIDDEN, `reported content leaked an internal noun: "${report.content}"`);
  });

  it("an unattributed signal reports nothing in the conversation — never guessed onto unrelated work", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Unattributed" }, options);
    makeBet(venture.id, options);

    const { joined } = recordOutcome(
      { ventureId: venture.id, joinKey: "no-such-join-key", outcomeKind: "reply", body: "hello?", from: "stranger@nowhere.com", source: "connected-account" },
      options,
    );
    assert.equal(joined, false, "no bet matched, so the signal stays unattributed");
    assert.equal(listConversation(venture.id, options).filter((m) => m.outcomeReport).length, 0, "nothing reported");
    // The outcome itself is still recorded honestly (unattributed), just not spoken in the thread.
    assert.equal(listVentureDocs(venture.id, "outcomes", options).length, 1);
  });

  it("a poller re-observing the same reply reports it once, not once per tick", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Report dedupe" }, options);
    const bet = makeBet(venture.id, options);
    const raw = { ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "hi", from: "jo@acme.com", source: "connected-account", providerEventId: "gmail-msg-1", providerSourceId: "thread-1" };

    recordOutcome(raw, options);
    recordOutcome(raw, options); // a later poll tick re-reads the same message
    const reports = listConversation(venture.id, options).filter((m) => m.outcomeReport);
    assert.equal(reports.length, 1, "exactly one report across two observations of the same reply");
  });

  it("a founder-entered outcome reports the same way (the contract's founder-entered proof path)", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Founder-entered" }, options);
    const bet = makeBet(venture.id, options);

    recordFounderOutcome(
      { ventureId: venture.id, betId: bet.id, happened: "got replies", learned: "the opening lands when it's short" },
      options,
    );
    const report = listConversation(venture.id, options).find((m) => m.outcomeReport);
    assert.ok(report, "a founder-entered outcome on a bet is also reported in the thread");
    assert.equal(report.target?.betId, bet.id);
    assert.equal(report.role, "teammate");
  });

  it("recording the outcome never depends on the report succeeding (report failure is non-fatal)", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Report isolation" }, options);
    const bet = makeBet(venture.id, options);
    const boom = () => { throw new Error("conversation store unavailable"); };

    // Inject a throwing reporter; recordOutcome must still record + join + park.
    const { outcome, joined } = recordOutcome(
      { ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "ok", from: "jo@acme.com", source: "connected-account" },
      options,
      { reportJoinedOutcome: boom },
    );
    assert.equal(joined, true, "the join still resolved");
    assert.ok(outcome.id, "the outcome was still recorded");
    assert.equal(listVentureDocs(venture.id, "outcomes", options).length, 1);
  });
});

describe("outcome report — composition is deterministic founder language", () => {
  it("composeOutcomeReport quotes the market's own words with a kind-appropriate verb", () => {
    const line = composeOutcomeReport({
      outcome: { outcomeKind: "reply", from: "jo@buffalo.com", body: "what about pricing?" },
      bet: { intent: "cold outbound" },
    });
    assert.match(line, /Jo replied/);
    assert.match(line, /pricing/);
  });

  it("falls back to a neutral verb and the effort intent when the market body is empty", () => {
    const line = composeOutcomeReport({
      outcome: { outcomeKind: "some-brand-new-kind", from: "team@acme.com", body: null },
      bet: { intent: "rewrite onboarding" },
    });
    assert.match(line, /responded/);
    assert.match(line, /rewrite onboarding/);
  });

  it("speakerLabel names a human from an email, an angled display name, or falls back honestly", () => {
    assert.equal(speakerLabel("jo.smith@acme.com"), "Jo Smith");
    assert.equal(speakerLabel("Buffalo Wing Co <team@buffalo.com>"), "Buffalo Wing Co");
    assert.equal(speakerLabel(""), "Someone");
    assert.equal(speakerLabel(null), "Someone");
  });

  it("reportJoinedOutcome stays silent when there is no teammate to speak as", () => {
    const result = reportJoinedOutcome(
      { ventureId: "v1", outcome: { id: "outcome-1", outcomeKind: "reply" }, bet: { id: "bet-1", teammateRef: null } },
      {},
      { appendConversationMessage: () => { throw new Error("should not append"); } },
    );
    assert.equal(result, null, "no teammate → no report, not a fake one");
  });
});
