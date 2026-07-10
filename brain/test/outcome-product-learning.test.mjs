import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  attachProductChangeProposal,
  ingestOutcome,
  outcomeReport,
  projectFlowRunReceipts,
  projectProductImplications,
  settleProductChangeProposal,
} from "../src/outcome-ingest.mjs";
import { recordFounderOutcome } from "../src/outcome-capture.mjs";
import { gtmPathStore, learningStore, resultStore, runStore } from "../src/gtm-store.mjs";
import { createChannel } from "../src/project-store.mjs";
import { loadFlow, recordFlowRun } from "../src/flow-store.mjs";
import { terrainInputFingerprint } from "../src/terrain-read.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "outcome-product-learning-")) };
}

function seedRun(options, { projectId = "learning-product" } = {}) {
  const gtmPath = gtmPathStore.create({
    projectId,
    summary: "Test whether onboarding exposes the first useful action",
    bet: { channel: "product", offer: "first-use workflow" },
    status: "selected",
  }, options);
  const run = runStore.create({
    projectId,
    pathId: gtmPath.id,
    status: "staged",
    questionId: "question-activation",
    productRefs: [{ type: "productThing", id: "thing-onboarding" }],
    participantRefs: [{ type: "teammate", id: "activation-researcher" }],
    decisionRef: { type: "gateDecision", id: "gate-yes-1" },
    items: [{
      joinKey: "activation-1",
      channel: "product",
      message: "Original staged prompt",
      agentRef: "copy-partner",
    }],
  }, options);
  return { projectId, run };
}

describe("outcome-to-product learning lineage", () => {
  it("keeps one outcome body and carries optional causal refs into Result and Learning", () => {
    const options = freshRoot();
    const { projectId, run } = seedRun(options);
    const { result, learning, joined } = ingestOutcome({
      joinKey: "activation-1",
      outcomeKind: "activation",
      body: "People understand the promise but cannot find the first useful action.",
    }, { ...options, projectId });

    assert.equal(joined, true);
    assert.equal(result.runId, run.id);
    assert.equal(result.body, "People understand the promise but cannot find the first useful action.");
    assert.equal(result.questionId, "question-activation");
    assert.deepEqual(result.productRefs, [{ type: "productThing", id: "thing-onboarding" }]);
    assert.ok(result.participantRefs.some((ref) => ref.id === "activation-researcher"));
    assert.ok(result.participantRefs.some((ref) => ref.id === "copy-partner"));
    assert.deepEqual(result.decisionRef, { type: "gateDecision", id: "gate-yes-1" });

    assert.equal(learning.identifying.sourceResultId, result.id);
    assert.equal(learning.identifying.questionId, result.questionId);
    assert.deepEqual(learning.identifying.productRefs, result.productRefs);
    assert.deepEqual(learning.identifying.participantRefs, result.participantRefs);
    assert.deepEqual(learning.identifying.decisionRef, result.decisionRef);
    assert.equal(learning.identifying.message, "Original staged prompt");
    assert.equal(learning.body, undefined);
    assert.equal(learning.identifying.body, undefined, "Learning references Result instead of copying its body");
    assert.deepEqual(projectProductImplications({ projectId }, options), [],
      "an outcome body is evidence and does not become a recommendation");
  });

  it("retains a plural decision reference when no singular decision reference is supplied", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    const decisionRef = { type: "founder-decision", id: "decision-from-list" };
    const { result, learning } = ingestOutcome({
      joinKey: "activation-1",
      outcomeKind: "activation",
      decisionRefs: [decisionRef],
    }, { ...options, projectId });

    assert.deepEqual(result.decisionRef, decisionRef);
    assert.deepEqual(learning.identifying.decisionRef, decisionRef);
  });

  it("keeps repeated manual receipts separate and leaves an unknown run honestly unattributed", () => {
    const options = freshRoot();
    const { projectId, run } = seedRun(options);
    const first = recordFounderOutcome(projectId, {
      runId: run.id,
      happened: "got objections",
      learned: "The workflow is the objection.",
    }, options);
    const second = recordFounderOutcome(projectId, {
      runId: run.id,
      happened: "got objections",
      learned: "A second founder named the same friction.",
    }, options);
    const late = recordFounderOutcome(projectId, {
      runId: "run-that-is-not-local",
      happened: "got replies",
      learned: "A late receipt arrived without local attribution.",
    }, options);

    assert.notEqual(first.result.id, second.result.id);
    assert.equal(resultStore.list({ ...options, projectId }).length, 3);
    assert.equal(first.result.body, "The workflow is the objection.");
    assert.equal(second.result.body, "A second founder named the same friction.");
    assert.equal(first.learning.identifying.message, "Original staged prompt");
    assert.equal(late.joined, false);
    assert.equal(late.result.runId, null);
    assert.equal(late.result.body, "A late receipt arrived without local attribution.");
  });

  it("preserves provider idempotency while body-less provider metrics project no implication", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    const signal = {
      joinKey: "activation-1",
      outcomeKind: "activation",
      messageId: "provider-event-1",
      source: "product-event",
    };
    const first = ingestOutcome(signal, { ...options, projectId });
    const second = ingestOutcome(signal, { ...options, projectId });

    assert.equal(second.deduped, true);
    assert.equal(second.result.id, first.result.id);
    assert.equal(resultStore.list({ ...options, projectId }).length, 1);
    assert.deepEqual(projectProductImplications({ projectId }, options), []);
  });

  it("joins a live flow-store receipt and reconciles it with the compiled run for one runGraph execution", () => {
    const options = freshRoot();
    const projectId = "default";
    const { channel } = createChannel({ name: "Activation test", objective: "Test activation" }, options);
    const graph = loadFlow(channel.graphId, null, options).graph;
    const compiled = runStore.create({
      projectId,
      pathId: channel.graphId,
      questionId: "question-live",
      productRefs: [{ type: "productThing", id: "thing-live" }],
      items: [{ joinKey: "live-join", message: "Compiled draft" }],
    }, options);
    recordFlowRun(graph, {
      runId: "execution-live-1",
      graphId: graph.id,
      ok: true,
      pendingGates: [],
      nodes: {
        execute: {
          category: "execute",
          items: [{ joinKey: "live-join", providerMessageId: "provider-live-1", sentAt: "2026-07-10T00:00:00.000Z" }],
        },
      },
    }, options);

    const flowReceipts = projectFlowRunReceipts(loadFlow(channel.graphId, null, options).runs);
    assert.equal(flowReceipts[0].executionRunId, "execution-live-1");
    const { result, item } = ingestOutcome({
      joinKey: "live-join",
      outcomeKind: "reply",
      body: "The activation promise landed.",
    }, { ...options, projectId });

    assert.equal(result.runId, compiled.id, "compiled Run remains the durable run owner");
    assert.equal(result.executionRunId, "execution-live-1", "the live runGraph receipt remains addressable");
    assert.equal(result.questionId, "question-live");
    assert.equal(item.providerMessageId, "provider-live-1", "live delivery facts win on the joined item");
  });

  it("chooses the completed/latest flow receipt deterministically and preserves its work refs", () => {
    const receipts = projectFlowRunReceipts([
      {
        id: "execution-pending",
        createdAt: "2026-07-10T10:00:00.000Z",
        pendingGates: ["founder-gate"],
        questionId: "question-old",
        result: { runId: "execution-pending", graphId: "graph-live", ok: true, nodes: { gate: { items: [{ joinKey: "same-join", draft: "pending" }] } } },
      },
      {
        id: "execution-complete",
        createdAt: "2026-07-10T10:01:00.000Z",
        pendingGates: [],
        questionId: "question-live",
        participantRefs: [{ type: "teammate", id: "researcher-live" }],
        productRefs: [{ type: "productThing", id: "thing-live" }],
        result: { runId: "execution-complete", graphId: "graph-live", ok: true, nodes: { execute: { items: [{ joinKey: "same-join", sentAt: "now" }] } } },
      },
    ]);
    assert.equal(receipts[0].executionRunId, "execution-complete");
    assert.equal(receipts[0].questionId, "question-live");
    assert.deepEqual(receipts[0].participantRefs, [{ type: "teammate", id: "researcher-live" }]);
    assert.deepEqual(receipts[0].productRefs, [{ type: "productThing", id: "thing-live" }]);
  });

  it("reports a flow-only joined outcome as joined and measured", () => {
    const options = freshRoot();
    const projectId = "default";
    const { channel } = createChannel({ name: "Flow-only outcome", objective: "Observe a live action" }, options);
    const graph = {
      ...loadFlow(channel.graphId, null, options).graph,
      questionId: "question-flow-only",
      participantRefs: [{ type: "teammate", id: "flow-researcher" }],
      productRefs: [{ type: "productThing", id: "flow-product" }],
    };
    recordFlowRun(graph, {
      runId: "execution-flow-only",
      graphId: graph.id,
      ok: true,
      pendingGates: [],
      nodes: { execute: { category: "execute", items: [{ joinKey: "flow-only-join", agentRef: "flow-researcher" }] } },
    }, options);
    const { result } = ingestOutcome({ joinKey: "flow-only-join", outcomeKind: "reply" }, { ...options, projectId });
    assert.equal(result.executionRunId, "execution-flow-only");
    assert.equal(result.questionId, "question-flow-only");
    assert.deepEqual(result.productRefs, [{ type: "productThing", id: "flow-product" }]);

    const report = outcomeReport({ projectId }, options);
    assert.equal(report.totals.unjoinedResults, 0);
    assert.equal(report.totals.measured, 1);
    assert.ok(report.paths.some((entry) => entry.pathId === graph.id && entry.outcomes.reply === 1));
  });

  it("dedupes by true provider event identity while preserving distinct replies on one outbound", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    const base = {
      joinKey: "activation-1",
      outcomeKind: "reply",
      messageId: "same-outbound-message",
      source: "connected-account",
      providerSourceId: "thread-1",
    };
    const first = ingestOutcome({ ...base, providerEventId: "reply-1" }, { ...options, projectId });
    const second = ingestOutcome({ ...base, providerEventId: "reply-2" }, { ...options, projectId });
    const replay = ingestOutcome({ ...base, providerEventId: "reply-1" }, { ...options, projectId });
    assert.notEqual(first.result.id, second.result.id, "two real inbound events remain distinct");
    assert.equal(replay.deduped, true);
    assert.equal(resultStore.list({ ...options, projectId }).length, 2);
  });

  it("does not turn a negative outcome body into a product change", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    ingestOutcome({
      joinKey: "activation-1",
      outcomeKind: "objection",
      body: "The market rejected the workflow and could not find the first useful action.",
    }, { ...options, projectId });

    assert.deepEqual(projectProductImplications({ projectId }, options), []);
  });
});

describe("product implications are projections", () => {
  it("projects an explicit attributable interpretation and records only review-proposal lineage", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    const { result } = ingestOutcome({
      joinKey: "activation-1",
      outcomeKind: "objection",
      body: "The market supports the problem but not this onboarding workflow.",
      productImplication: {
        body: "Expose the first useful action before asking the founder to configure the workflow.",
        authorRef: { type: "teammate", id: "product-interpreter" },
        artifactRef: { type: "operator-event", id: "interpretation-1" },
        evidenceRefs: [{ type: "market-signal", id: "signal-activation-1" }],
      },
    }, { ...options, projectId });

    const [before] = projectProductImplications({ projectId }, options);
    assert.equal(before.id, `implication-${result.id}`);
    assert.equal(result.body, "The market supports the problem but not this onboarding workflow.");
    assert.equal(before.body, "Expose the first useful action before asking the founder to configure the workflow.");
    assert.deepEqual(before.authorRef, { type: "teammate", id: "product-interpreter" });
    assert.deepEqual(before.artifactRef, { type: "operator-event", id: "interpretation-1" });
    assert.deepEqual(before.evidenceRefs, [{ type: "market-signal", id: "signal-activation-1" }]);
    assert.equal(before.status, "proposed");
    assert.equal(before.attribution.joined, true);
    assert.ok(before.updatedAt, "the projection exposes its source authority revision");

    const originalFingerprint = terrainInputFingerprint({
      projectId,
      joinedOutcomes: resultStore.list({ ...options, projectId }),
      implications: [before],
    });
    assert.notEqual(terrainInputFingerprint({
      projectId,
      joinedOutcomes: resultStore.list({ ...options, projectId }).map((outcome) => (
        outcome.id === result.id ? { ...outcome, updatedAt: "2099-01-01T00:00:00.000Z" } : outcome
      )),
      implications: [before],
    }), originalFingerprint, "a changed outcome authority stales the prior terrain input");
    assert.notEqual(terrainInputFingerprint({
      projectId,
      joinedOutcomes: resultStore.list({ ...options, projectId }),
      implications: [{ ...before, updatedAt: "2099-01-01T00:00:00.000Z" }],
    }), originalFingerprint, "a changed implication authority stales the prior terrain input");

    const staged = attachProductChangeProposal({
      projectId,
      implicationId: before.id,
      proposalSessionId: "op-review-1",
    }, options);
    attachProductChangeProposal({
      projectId,
      implicationId: before.id,
      proposalSessionId: "op-review-1",
    }, options);

    assert.equal(staged.status, "staged");
    assert.deepEqual(staged.proposalRef, { type: "productChangeProposal", id: "op-review-1" });
    assert.deepEqual(
      resultStore.get(result.id, options).proposalRef,
      { type: "productChangeProposal", id: "op-review-1" },
    );
    const learning = learningStore.list({ ...options, projectId })[0];
    assert.deepEqual(
      learning.identifying.proposalRef,
      { type: "productChangeProposal", id: "op-review-1" },
    );

    settleProductChangeProposal({
      projectId,
      proposalSessionId: "op-review-1",
      disposition: "discarded",
    }, options);
    const [discarded] = projectProductImplications({ projectId }, options);
    assert.equal(discarded.status, "discarded");
    assert.equal(discarded.proposalDisposition, "discarded");
    assert.deepEqual(discarded.proposalRef, staged.proposalRef, "the settled proposal remains an audit ref");
  });
});
