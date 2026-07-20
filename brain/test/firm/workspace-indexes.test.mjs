import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { emptySemanticModel } from "../../src/firm/semantic-model.mjs";
import { getSemanticModel, mutateSemanticModel } from "../../src/firm/semantic-model-store.mjs";
import { applySystemMutations, buildSystemIndex } from "../../src/firm/system-index.mjs";
import { buildReleaseIndex, createRelease, mutateRelease, projectReleaseIndex } from "../../src/firm/release-index.mjs";
import { createVenture, setVentureDoc } from "../../src/firm/venture-store.mjs";

const directory = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
function fixture() {
  const options = { root: directory("drover-workspace-") };
  const venture = createVenture({ name: "Workspace fixture", repository: directory("drover-workspace-repo-") }, { ...options, seedFoundingCrew: false });
  return { options, venture, actor: { authority: "founder", id: "founder" } };
}

describe("workspace system mutations", () => {
  it("creates founder-authored open objects and labeled connections with CAS", () => {
    const fx = fixture();
    const first = applySystemMutations({ ventureId: fx.venture.id, baseRevision: 0, actor: fx.actor, mutations: [{ op: "create-object", id: "product", name: "Faster setup", statement: "A founder reaches value sooner.", territory: "product" }, { op: "create-object", id: "offer", name: "Setup promise", statement: "Lead with time to value.", territory: "gtm" }] }, fx.options);
    const second = applySystemMutations({ ventureId: fx.venture.id, baseRevision: first.model.revision, actor: fx.actor, mutations: [{ op: "create-relationship", fromRef: "object:offer", toRef: "object:product", label: "promised by" }] }, fx.options);
    assert.equal(second.systemIndex.objects.length, 2);
    assert.equal(second.systemIndex.relationships[0].label, "promised by");
    assert.throws(() => applySystemMutations({ ventureId: fx.venture.id, baseRevision: 0, actor: fx.actor, mutations: [{ op: "create-object", name: "Stale", territory: "product" }] }, fx.options), (error) => error.status === 409);
  });

  it("projects release-scoped evidence back to exact connected objects without changing truth", () => {
    const fx = fixture();
    mutateSemanticModel({ ventureId: fx.venture.id, baseRevision: 0, actor: fx.actor, operations: [
      { op: "create-record", family: "objects", record: { id: "capability", type: "capability", name: "Continuous context", statement: "Context survives the venture loop.", assertion: "founder-asserted", properties: { territory: "product" } } },
      { op: "create-record", family: "objects", record: { id: "release", type: "release", name: "Continuity release", statement: "Put continuity in market.", assertion: "founder-asserted", properties: { territory: "product", release: {} } } },
      { op: "create-record", family: "relationships", record: { id: "capability-release", fromRef: "object:capability", toRef: "object:release", label: "ships in", type: "trace", assertion: "founder-asserted", sourceRefs: [], properties: {} } },
    ] }, fx.options);
    setVentureDoc(fx.venture.id, "outcomes", "reply-one", {
      id: "reply-one", outcomeKind: "reply", body: "Continuity matters more than replacing every tool.",
      from: "founder@example.com", source: "gmail", observedAt: "2026-07-20T12:00:00.000Z",
      attribution: "joined", releaseRef: "object:release", observationContractRef: "observation:one",
    }, fx.options);

    const index = buildSystemIndex(fx.venture.id, fx.options);
    const returned = index.objects.find((object) => object.objectRef === "outcome:reply-one");
    assert.equal(returned?.projectionOnly, true);
    assert.equal(returned?.properties.returnedEvidence.interpretation, "unresolved");
    assert.deepEqual(returned?.properties.returnedEvidence.affectedObjectRefs, ["object:capability"]);
    const returnLink = index.relationships.find((entry) => entry.type === "evidence-return");
    assert.equal(returnLink?.fromRef, "object:outcome:reply-one");
    assert.equal(returnLink?.toRef, "object:capability");
    assert.equal(returnLink?.assertion, "tentative");
    assert.equal(getSemanticModel(fx.venture.id, fx.options).objects.length, 2);
  });
});

describe("canonical release projection", () => {
  it("derives in-market and attention from exact thread/run/decision joins", () => {
    const model = { ...emptySemanticModel("venture-one"), objects: [{ id: "release-one", type: "release", name: "Launch", statement: "Move the change to market.", assertion: "founder-asserted", properties: { release: {} } }], threads: [{ id: "thread-one", name: "Launch work", subjectRefs: ["object:release-one"], messageRefs: [], participantRefs: [], properties: {} }], runs: [{ id: "run-one", threadRef: "thread:thread-one", betRefs: [], eventRefs: [], workRefs: [], decisionRefs: ["decision:decision-one"], outcomeRefs: [], scopeRefs: [], participantRefs: [], properties: {} }] };
    const index = projectReleaseIndex(model, { decisions: [{ id: "decision-one", releasedAt: "2026-07-19T12:00:00.000Z", decision: "release", needsReconnect: false }], receipts: [{ id: "receipt-one", runRef: "run:run-one", terminal: { kind: "completed" } }] });
    assert.equal(index.releases[0].lifecycle, "in-market");
    assert.deepEqual(index.releases[0].attention, []);
    assert.equal(index.releases[0].receipts[0].id, "receipt-one");
    assert.equal(index.unassignedActions.length, 0);
  });

  it("keeps decisions without an exact release join unassigned", () => {
    const model = { ...emptySemanticModel("venture-one"), objects: [{ id: "release-one", type: "release", name: "Launch", statement: "", assertion: "founder-asserted", properties: { release: {} } }] };
    const index = projectReleaseIndex(model, { decisions: [{ id: "decision-one", decision: null }] });
    assert.equal(index.releases[0].lifecycle, "draft");
    assert.equal(index.unassignedActions[0].id, "decision-one");
  });

  it("creates, ends, and reopens a semantic release without another collection", () => {
    const fx = fixture();
    const created = createRelease({ ventureId: fx.venture.id, baseRevision: 0, actor: fx.actor, release: { id: "release-one", name: "Launch" } }, fx.options);
    assert.equal(buildReleaseIndex(fx.venture.id, fx.options).releases[0].lifecycle, "draft");
    const ended = mutateRelease({ ventureId: fx.venture.id, releaseId: "release-one", baseRevision: created.releaseIndex.revision, actor: fx.actor, mutations: [{ op: "end" }] }, fx.options);
    assert.equal(ended.release.lifecycle, "ended");
    const reopened = mutateRelease({ ventureId: fx.venture.id, releaseId: "release-one", baseRevision: ended.release.revision, actor: fx.actor, mutations: [{ op: "reopen" }] }, fx.options);
    assert.equal(reopened.release.lifecycle, "draft");
  });

  it("joins and unjoins exact existing work without copying it into the release", () => {
    const fx = fixture();
    const seeded = mutateSemanticModel({ ventureId: fx.venture.id, baseRevision: 0, actor: fx.actor, operations: [{ op: "create-record", family: "threads", record: { id: "launch-work", name: "Prepare launch", lifecycle: "open", subjectRefs: [], messageRefs: [], participantRefs: [], properties: {} } }] }, fx.options);
    const created = createRelease({ ventureId: fx.venture.id, baseRevision: seeded.revision, actor: fx.actor, release: { id: "release-one", name: "Launch" } }, fx.options);
    const linked = mutateRelease({ ventureId: fx.venture.id, releaseId: "release-one", baseRevision: created.releaseIndex.revision, actor: fx.actor, mutations: [{ op: "link-thread", threadRef: "thread:launch-work" }] }, fx.options);
    assert.deepEqual(linked.release.threadRefs, ["thread:launch-work"]);
    const unlinked = mutateRelease({ ventureId: fx.venture.id, releaseId: "release-one", baseRevision: linked.release.revision, actor: fx.actor, mutations: [{ op: "unlink-thread", threadRef: "thread:launch-work" }] }, fx.options);
    assert.deepEqual(unlinked.release.threadRefs, []);
  });

  it("seeds one release from the exact Product object and owning Work thread atomically", () => {
    const fx = fixture();
    const seeded = mutateSemanticModel({ ventureId: fx.venture.id, baseRevision: 0, actor: fx.actor, operations: [
      { op: "create-record", family: "objects", record: { id: "verified-capability", type: "capability", name: "Verified capability", statement: "Repository-backed Product change.", assertion: "founder-asserted", properties: { territory: "product" }, provenance: { kind: "repository-implementation", sourceRef: "work:code-one" } } },
      { op: "create-record", family: "threads", record: { id: "verified-work", name: "Build verified capability", lifecycle: "open", subjectRefs: ["object:verified-capability"], messageRefs: [], participantRefs: [], properties: {} } },
    ] }, fx.options);
    const created = createRelease({ ventureId: fx.venture.id, baseRevision: seeded.revision, actor: fx.actor, release: {
      id: "verified-release", name: "Verified capability", statement: "Who should receive this first?",
      objectRef: "object:verified-capability", threadRef: "thread:verified-work", linkLabel: "Product delta",
    } }, fx.options);
    assert.deepEqual(created.release.relatedObjectRefs, ["object:verified-capability"]);
    assert.deepEqual(created.release.threadRefs, ["thread:verified-work"]);
    assert.equal(created.release.relationships[0].label, "Product delta");
    assert.equal(created.release.statement, "Who should receive this first?");
  });
});
