import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  loadCurationLedger,
  saveCurationLedger,
  recordCurationProposal,
  pendingCurationProposals,
  resolveCurationProposal,
} from "../src/curation-store.mjs";
import {
  detectCrossChannelConflicts,
  detectDeadBranches,
  detectSpinePromotions,
  deriveCurationFindings,
} from "../src/curation-engine.mjs";

function tmp() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "gtm-curation-")), projectId: "cur-proj" };
}

describe("curation-store — gated proposal ledger", () => {
  it("records a pending proposal and persists it", () => {
    const options = tmp();
    const ledger = loadCurationLedger("p", options);
    const { proposal, created } = recordCurationProposal(ledger, {
      type: "conflict", signature: "conflict:x", reason: "overlap", subject: { personKey: "x" },
    });
    assert.equal(created, true);
    assert.equal(proposal.status, "pending");
    saveCurationLedger(ledger, options);
    const reloaded = loadCurationLedger("p", options);
    assert.equal(pendingCurationProposals(reloaded).length, 1);
  });

  it("dedupes by signature — the same situation stays ONE pending proposal", () => {
    const ledger = loadCurationLedger("p", tmp());
    recordCurationProposal(ledger, { type: "retire", signature: "retire:b1", reason: "dead" });
    const second = recordCurationProposal(ledger, { type: "retire", signature: "retire:b1", reason: "dead again" });
    assert.equal(second.created, false);
    assert.equal(pendingCurationProposals(ledger).length, 1);
  });

  it("only the founder resolution closes a proposal; an unknown decision is refused", () => {
    const ledger = loadCurationLedger("p", tmp());
    const { proposal } = recordCurationProposal(ledger, { type: "promote", signature: "promote:b2", reason: "wins" });
    assert.throws(() => resolveCurationProposal(ledger, proposal.id, { decision: "auto-apply" }), /approve|dismiss/i);
    const resolved = resolveCurationProposal(ledger, proposal.id, { decision: "approve", rationale: "ship it" });
    assert.equal(resolved.status, "approved");
    assert.equal(resolved.rationale, "ship it");
    assert.equal(pendingCurationProposals(ledger).length, 0, "approved proposals leave the pending queue");
  });

  it("requires a type and signature", () => {
    const ledger = loadCurationLedger("p", tmp());
    assert.throws(() => recordCurationProposal(ledger, { reason: "no type" }), /type and a signature/i);
  });
});

describe("curation-engine — cross-channel conflict detector", () => {
  it("flags the same person on two live channels as one conflict", () => {
    const entrants = [
      { email: "ada@x.com", channelId: "email" },
      { email: "ada@x.com", channelId: "linkedin" },
      { email: "lin@y.com", channelId: "email" },
    ];
    const findings = detectCrossChannelConflicts(entrants);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].type, "conflict");
    assert.deepEqual([...findings[0].subject.channels].sort(), ["email", "linkedin"]);
  });

  it("does not flag a person who appears on only one channel", () => {
    const findings = detectCrossChannelConflicts([
      { email: "ada@x.com", channelId: "email" },
      { email: "ada@x.com", channelId: "email" },
    ]);
    assert.equal(findings.length, 0);
  });

  it("a stable signature lets the store dedupe a recurring conflict to one proposal", () => {
    const entrants = [
      { email: "ada@x.com", channelId: "email" },
      { email: "ada@x.com", channelId: "linkedin" },
    ];
    const ledger = loadCurationLedger("p", tmp());
    for (const f of detectCrossChannelConflicts(entrants)) recordCurationProposal(ledger, f);
    for (const f of detectCrossChannelConflicts(entrants)) recordCurationProposal(ledger, f); // second run
    assert.equal(pendingCurationProposals(ledger).length, 1);
  });

  it("respects a recency window when entrants carry timestamps", () => {
    const now = "2026-06-29T00:00:00.000Z";
    const old = "2026-05-01T00:00:00.000Z";
    const findings = detectCrossChannelConflicts([
      { email: "ada@x.com", channelId: "email", at: now },
      { email: "ada@x.com", channelId: "linkedin", at: old },
    ], { now, windowDays: 7 });
    assert.equal(findings.length, 0, "the linkedin appearance is outside the window, so no live overlap");
  });
});

describe("curation-engine — dead branch + spine promotion", () => {
  it("retires a branch with zero items over enough runs, but spares a fresh one", () => {
    const dead = detectDeadBranches([{ branchId: "twitter", label: "Twitter", runs: [{ items: 0 }, { items: 0 }, { items: 0 }] }]);
    assert.equal(dead.length, 1);
    assert.equal(dead[0].type, "retire");
    const fresh = detectDeadBranches([{ branchId: "new", runs: [{ items: 0 }] }], { minRuns: 3 });
    assert.equal(fresh.length, 0, "a brand-new branch is never proposed for retirement");
  });

  it("proposes promotion only with enough sample and a real margin", () => {
    const promote = detectSpinePromotions([{
      variable: "reply", spine: { branchId: "email", rate: 0.03, sample: 200 },
      challenger: { branchId: "linkedin", label: "LinkedIn", rate: 0.08, sample: 120 },
    }]);
    assert.equal(promote.length, 1);
    assert.equal(promote[0].type, "promote");
    const tooClose = detectSpinePromotions([{
      variable: "reply", spine: { branchId: "email", rate: 0.05, sample: 200 },
      challenger: { branchId: "x", rate: 0.052, sample: 120 },
    }]);
    assert.equal(tooClose.length, 0, "a marginal win is not worth a proposal");
  });

  it("the orchestrator gathers findings across all three detectors", () => {
    const findings = deriveCurationFindings({
      entrants: [{ email: "a@x.com", channelId: "email" }, { email: "a@x.com", channelId: "linkedin" }],
      branches: [{ branchId: "dead", runs: [{ items: 0 }, { items: 0 }, { items: 0 }] }],
      comparisons: [{ variable: "reply", spine: { branchId: "s", rate: 0.03, sample: 200 }, challenger: { branchId: "c", rate: 0.09, sample: 120 } }],
    });
    const types = findings.map((f) => f.type).sort();
    assert.deepEqual(types, ["conflict", "promote", "retire"]);
  });
});
