import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createChannel, createProject } from "../src/project-store.mjs";
import { gtmPathStore, productTruthStore, recordObjectTouch, listObjectTouches, resultStore, runStore } from "../src/gtm-store.mjs";
import { loadFlow, recordFlowRun } from "../src/flow-store.mjs";
import { getOperatingView } from "../src/operating-view.mjs";
import { buildProductModel, saveProductModelStore } from "../src/product-model-store.mjs";
import { crewRosterStore } from "../src/crew-roster-store.mjs";
import { addClarity } from "../src/clarity-store.mjs";
import { recordFeedbackSignals, recordFounderDecision } from "../src/feedback-ledger.mjs";
import { objectGraphLayoutStore, PROJECT_CANVAS_LAYOUT_NAMESPACE } from "../src/object-graph-store.mjs";
import { appendOperatorEvent, createOperatorSession, saveOperatorSession } from "../src/operator-store.mjs";
import { createGoal } from "../src/goal-store.mjs";
import { createWorkArtifact } from "../src/work-artifact-store.mjs";

// Area 6 — the ONE Operator lens read. getOperatingView is a pure cross-fleet projection: it composes the
// engine stages, the one efficiency table, and Area 1's touch ledger into lanes + a shared object map, and
// it NEVER writes, triggers a run, or emits next-move prose. Each test roots on an isolated temp home so
// nothing touches ~/.gtm-ide.

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "operating-view-")) };
}

describe("getOperatingView — the shared-map read (Area 6)", () => {
  it("draws a shared object ONCE with ties to every lane that touched it (double-work prevention)", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    // Two motions of different kinds touch the SAME object — the eval's shared-map case.
    recordObjectTouch("estatesaleusa", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m-pages", runId: "r1", verb: "built" }, options);
    recordObjectTouch("estatesaleusa", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m-outreach", runId: "r2", verb: "worked" }, options);

    const view = getOperatingView({ projectId: "estatesaleusa" }, options);
    const buffalo = view.objects.filter((o) => o.objectKey === "geo:buffalo");
    assert.equal(buffalo.length, 1, "the shared object renders exactly once");
    assert.deepEqual(buffalo[0].lanes.sort(), ["m-outreach", "m-pages"], "tied to both lanes that touched it");
    assert.equal(buffalo[0].motionCount, 2, "counts two distinct motions on the one object");
  });

  it("every derived object state carries a provenance receipt (DOCTRINE's receipt rule)", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    recordObjectTouch("estatesaleusa", { kind: "keyword", fields: { query: "estate sales near me", geo: "Buffalo" }, motionId: "m-ai", runId: "r1", verb: "targeted" }, options);

    const view = getOperatingView({ projectId: "estatesaleusa" }, options);
    const kw = view.objects.find((o) => o.objectKey === "keyword:estate-sales-near-me|buffalo");
    assert.ok(kw, "the touched keyword appears on the map");
    assert.equal(kw.provenance.kind, "grounded", "a touched object is grounded, not a bet");
    assert.match(kw.provenance.basis, /touch/, "the receipt names what produced the state");
  });

  it("is provably READ-ONLY — the ledger is byte-identical before and after the read", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    recordObjectTouch("estatesaleusa", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    const before = JSON.stringify(listObjectTouches("estatesaleusa", options));

    getOperatingView({ projectId: "estatesaleusa" }, options);
    getOperatingView({ projectId: "estatesaleusa" }, options);

    const after = JSON.stringify(listObjectTouches("estatesaleusa", options));
    assert.equal(after, before, "the read wrote nothing back to the ledger");
  });

  it("emits NO next-move prose — only state, ties, and the decisions the lens routes to", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    recordObjectTouch("estatesaleusa", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    const view = getOperatingView({ projectId: "estatesaleusa" }, options);
    // The shape is state only: lanes, objects, pending decisions — never a recommendation field.
    assert.deepEqual(
      Object.keys(view).filter((k) => /recommend|suggest|nextMove|advice/i.test(k)),
      [],
      "no recommender field on the operating view",
    );
  });

  it("renders proposed plan lanes (Area 4) in the same grammar, marked as bets, without persisting", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    const planMotions = [
      { type: "programmatic-pages", label: "Per-city listing pages", origin: "derived", rationale: "you already hold the sale records" },
      { type: "cold-outreach", label: "Email estate-sale companies", origin: "speculative", rationale: "a bet" },
    ];
    const view = getOperatingView({ projectId: "estatesaleusa" }, { ...options, planMotions });
    const proposed = view.lanes.filter((l) => l.proposed === true);
    assert.equal(proposed.length, 2, "both plan motions render as proposed lanes");
    const derived = proposed.find((l) => l.origin === "derived");
    assert.ok(derived, "a grounded code-native motion reads as derived");
    assert.equal(derived.health, 0, "a not-yet-run lane has no fabricated health");
    // The plan is a regenerated read — nothing about it persisted to the ledger.
    assert.equal(listObjectTouches("estatesaleusa", options).length, 0, "the proposed plan wrote nothing durable");
  });

  it("is honest-blind on a project nothing has touched — no seeded lanes or objects", () => {
    const options = freshRoot();
    createProject({ name: "Empty" }, options);
    const view = getOperatingView({ projectId: "empty" }, options);
    assert.deepEqual(view.objects, [], "no objects fabricated");
    assert.deepEqual(view.lanes, [], "no lanes fabricated");
    assert.deepEqual(view.pending, [], "no pending decisions fabricated");
    assert.equal(view.woven.canvas.state.kind, "empty", "the enriched canvas is also honestly empty");
    assert.deepEqual(view.woven.canvas.outcomes, []);
    assert.deepEqual(view.woven.canvas.implications, []);
  });

  it("projects many goals and open work onto the same canonical canvas without requiring a pipeline", () => {
    const options = { ...freshRoot(), actor: "founder:jacob" };
    createProject({ name: "Open desk" }, options);
    const first = createGoal({
      id: "position", projectId: "open-desk", statement: "Clarify the position",
      createdBy: "founder:jacob", idempotencyKey: "goal:position",
    }, options);
    createGoal({
      id: "activation", projectId: "open-desk", statement: "Improve activation",
      createdBy: "founder:jacob", idempotencyKey: "goal:activation",
      currentWorkRefs: [{ type: "work-artifact", id: "brief" }],
    }, options);
    createWorkArtifact("open-desk", {
      id: "brief", kind: "positioning-brief", title: "Positioning brief", content: { promise: "Make the work visible" },
      createdBy: { type: "founder", id: "jacob" }, expectedStoreRevision: 0, idempotencyKey: "work:brief",
    }, options);

    const view = getOperatingView({ projectId: "open-desk" }, options);
    const canvas = view.woven.canvas;
    assert.equal(view.lanes.length, 0, "goals do not manufacture pipelines");
    assert.ok(canvas.anchors.some((item) => item.ref.type === "goal" && item.ref.id === first.id));
    assert.ok(canvas.anchors.some((item) => item.ref.type === "goal" && item.ref.id === "activation"));
    assert.ok(canvas.anchors.some((item) => item.ref.type === "work-artifact" && item.ref.id === "brief"));
    assert.ok(canvas.relationships.some((item) => item.kind === "current-work"
      && item.source.id === "activation" && item.target.id === "brief" && item.resolved));
  });

  it("resolves outcome pipeline lineage from the execution graph, never the Gmail or Slack connector", () => {
    const options = freshRoot();
    const { project } = createProject({ name: "Lineage" }, options);
    const scoped = { ...options, projectId: project.id };
    const { channel } = createChannel({
      name: "Founder outreach",
      objective: "Learn which proof earns a reply",
    }, scoped);
    const pathRecord = gtmPathStore.create({
      projectId: project.id,
      summary: "Test founder proof",
      status: "selected",
    }, scoped);
    const run = runStore.create({
      projectId: project.id,
      pathId: pathRecord.id,
      status: "staged",
      items: [{ joinKey: "lineage-gmail" }, { joinKey: "lineage-slack" }],
    }, scoped);
    const graph = loadFlow(channel.graphId, null, scoped).graph;
    recordFlowRun(graph, {
      runId: "execution-lineage-1",
      graphId: graph.id,
      ok: true,
      pendingGates: [],
      nodes: {},
    }, scoped);
    const gmail = resultStore.create({
      projectId: project.id,
      runId: run.id,
      executionRunId: "execution-lineage-1",
      pathId: pathRecord.id,
      joinKey: "lineage-gmail",
      channel: "gmail",
      outcomeKind: "reply",
    }, scoped);
    resultStore.create({
      projectId: project.id,
      runId: run.id,
      executionRunId: "execution-lineage-1",
      pathId: pathRecord.id,
      joinKey: "lineage-slack",
      channel: "slack",
      outcomeKind: "meeting",
    }, scoped);

    const canvas = getOperatingView({ projectId: project.id }, options).woven.canvas;
    assert.deepEqual(new Set(canvas.outcomes.map((item) => item.channelId)), new Set([channel.id]));
    assert.equal(canvas.outcomes.some((item) => ["gmail", "slack"].includes(item.channelId)), false);
    const joined = canvas.outcomes.find((item) => item.id === gmail.id);
    assert.deepEqual(joined.lineage.pipelineRef, { type: "pipeline", id: channel.id });
    assert.deepEqual(joined.lineage.graphRef, { type: "graph", id: channel.graphId });
    assert.deepEqual(joined.lineage.pathRef, { type: "path", id: pathRecord.id });
    assert.deepEqual(joined.lineage.runRef, { type: "run", id: run.id });
    assert.deepEqual(joined.lineage.executionRunRef, { type: "execution-run", id: "execution-lineage-1" });
    assert.deepEqual(joined.lineage.deliveryRef, { type: "delivery-connector", id: "gmail" });
    const anchor = canvas.anchors.find((item) => item.ref.type === "outcome" && item.ref.id === gmail.id);
    assert.equal(anchor.body.channelId, channel.id, "the outcome anchor carries the same typed pipeline lineage");
    assert.deepEqual(anchor.body.lineage.pipelineRef, { type: "pipeline", id: channel.id });
    assert.ok(canvas.relationships.some((item) => item.source.type === "pipeline"
      && item.source.id === channel.id && item.target.id === gmail.id && item.resolved));
  });

  it("adds project-scoped anchors and explicit relationships to the canonical woven read", () => {
    const options = freshRoot();
    const { project } = createProject({ name: "Alpha" }, options);
    const { project: other } = createProject({ name: "Other" }, options);
    const scannedAt = new Date().toISOString();
    const truth = productTruthStore.create({
      projectId: project.id,
      statement: "Alpha has a cited activation event",
      evidence: [{ claim: "event", source: "src/track.mjs:12", solidity: "observed" }],
      solidity: "observed",
      scanRef: { scannedAt },
    }, options);
    productTruthStore.create({ projectId: other.id, statement: "Other only", evidence: [], solidity: "speculative" }, options);
    recordFeedbackSignals([{ id: "signal-1", projectId: project.id, type: "FounderApproval", summary: "Keep proof visible", observedAt: scannedAt }], { ...options, projectId: project.id });
    const model = buildProductModel({
      projectId: project.id,
      groundingRef: { scannedAt, citationCount: 1 },
      things: [{ id: "workspace", name: "Workspace", evidence: [{ file: "src/workspace.mjs", line: 1 }] }],
      pinnedSignals: [{ id: "pin-1", signalId: "signal-1", target: { kind: "thing", id: "thing-workspace" }, summary: "Keep proof visible" }],
    }, options);
    saveProductModelStore({ schemaVersion: 1, projectId: project.id, productModels: [model] }, options);
    crewRosterStore.add(project.id, { ref: "researcher", name: "Ari" }, options);
    const question = addClarity(project.id, {
      kind: "question",
      text: "Where does activation break?",
      participantRefs: [{ type: "teammate", id: "researcher" }],
      productRefs: [{ type: "thing", id: "thing-workspace" }],
    }, options);
    const session = createOperatorSession({ goal: "Investigate activation", projectId: project.id, questionId: question.id }, options);
    saveOperatorSession(appendOperatorEvent(session, {
      id: "event-position-1",
      type: "crew_position",
      title: "Ari's position",
      data: {
        position: {
          questionId: question.id,
          statement: "The first useful action is hidden.",
          relation: "challenges",
          participantRef: { type: "teammate", id: "researcher" },
          evidenceRefs: [{ type: "productTruth", id: truth.id }],
          uncertainty: "We have not observed a new founder yet.",
          recommendation: "Expose the action in onboarding.",
          falsifier: "New founders activate without guidance.",
        },
      },
    }), options);
    const pathRecord = gtmPathStore.create({
      projectId: project.id,
      summary: "Test the activation proof",
      restsOn: [{ type: "productTruth", id: truth.id }],
      questionId: question.id,
      participantRefs: [{ type: "teammate", id: "researcher" }],
      productRefs: [{ type: "thing", id: "thing-workspace" }],
    }, options);
    const run = runStore.create({ projectId: project.id, pathId: pathRecord.id, status: "staged" }, options);
    const decision = recordFounderDecision({
      projectId: project.id,
      kind: "gate.approved",
      value: "Run the test",
      sourceRef: { type: "gate-decision", id: "gate-1" },
      contextRefs: [{ type: "run", id: run.id }],
      questionId: question.id,
    }, { ...options, projectId: project.id }).receipt;
    const outcome = resultStore.create({
      projectId: project.id,
      runId: run.id,
      pathId: pathRecord.id,
      joinKey: "activation-1",
      outcomeKind: "activation",
      body: "Founders understood the promise but could not find the first useful action.",
      productImplication: {
        body: "Expose the first useful action earlier in onboarding.",
        authorRef: { type: "teammate", id: "researcher" },
        artifactRef: { type: "operator-event", id: "position-activation" },
      },
      questionId: question.id,
      productRefs: [{ type: "thing", id: "thing-workspace" }],
      participantRefs: [{ type: "teammate", id: "researcher" }],
      decisionRefs: [{ type: "decision", id: decision.id }],
    }, options);
    objectGraphLayoutStore.saveNamespace(project.id, PROJECT_CANVAS_LAYOUT_NAMESPACE, {
      positions: { [`anchor:question:${question.id}`]: { x: 10, y: 20 } },
      pinnedCrew: ["crew:researcher"],
    }, options);

    const canvas = getOperatingView({ projectId: project.id }, options).woven.canvas;
    assert.equal(canvas.anchors.some((item) => item.label === "Other only"), false, "records stay project scoped");
    assert.ok(canvas.anchors.some((item) => item.ref.type === "productTruth" && item.ref.id === truth.id));
    assert.ok(canvas.anchors.some((item) => item.ref.type === "question" && item.ref.id === question.id));
    const questionAnchor = canvas.anchors.find((item) => item.ref.type === "question" && item.ref.id === question.id);
    assert.equal(questionAnchor.body.positions[0].statement, "The first useful action is hidden.");
    assert.equal(questionAnchor.body.positions[0].relation, "challenges");
    assert.ok(questionAnchor.body.backlinks.some((ref) => ref.type === "decision" && ref.id === decision.id));
    assert.ok(canvas.relationships.some((item) => item.kind === "serves" && item.resolved));
    assert.ok(canvas.relationships.some((item) => item.kind === "returns-to" && item.resolved));
    assert.equal(canvas.state.kind, "ready", JSON.stringify(canvas.state.issues));
    assert.deepEqual(canvas.geometry.positions[`anchor:question:${question.id}`], { x: 10, y: 20 });
    assert.equal(canvas.outcomes[0].id, outcome.id);
    assert.equal(canvas.outcomes[0].body, "Founders understood the promise but could not find the first useful action.");
    assert.equal(canvas.outcomes[0].lineage.questionRef.id, question.id);
    assert.equal(canvas.implications[0].body, "Expose the first useful action earlier in onboarding.");
    assert.equal(canvas.implications[0].authority.sourceOutcomeRef.id, outcome.id);
    assert.equal(canvas.implications.some((item) => item.authority.projectId === other.id), false);
  });
});
