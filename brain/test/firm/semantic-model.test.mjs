import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { applyArchitectureMutations, getArchitecture, writeArchitectureCompatibilityState } from "../../src/firm/architecture.mjs";
import { emptySemanticModel, validateSemanticModel } from "../../src/firm/semantic-model.mjs";
import { applySemanticModelMutations } from "../../src/firm/semantic-model-mutations.mjs";
import {
  getSemanticModel,
  getSemanticModelState,
  mutateSemanticModel,
  writeSemanticModelState,
} from "../../src/firm/semantic-model-store.mjs";
import {
  createVenture,
  exportVenture,
  getVentureDoc,
  importVenture,
  setVentureDoc,
} from "../../src/firm/venture-store.mjs";

function directory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixture(name = "Semantic model fixture") {
  const options = { root: directory("drover-semantic-") };
  const repository = directory("drover-semantic-repo-");
  const venture = createVenture({ name, repository }, { ...options, seedFoundingCrew: false });
  setVentureDoc(venture.id, "bets", "bet-one", {
    id: "bet-one",
    ventureId: venture.id,
    intent: "Prove one canonical model",
    events: [{ id: "event-one" }],
    staged: [{ id: "work-one" }],
  }, options);
  setVentureDoc(venture.id, "outcomes", "outcome-one", { id: "outcome-one", ventureId: venture.id }, options);
  setVentureDoc(venture.id, "decisions", "decision-one", { id: "decision-one", ventureId: venture.id }, options);
  setVentureDoc(venture.id, "conversation", "message-one", { id: "message-one", ventureId: venture.id, role: "founder", body: "Build it." }, options);
  return { options, repository, venture };
}

function sevenFamilyOperations(ventureId) {
  return [
    { op: "create-record", family: "objects", record: { id: "object-one", type: "open", name: "Founder promise", statement: "One model everywhere.", properties: {}, assertion: "founder-asserted", provenance: { kind: "founder-authored" } } },
    { op: "create-record", family: "relationships", record: { id: "relationship-one", fromRef: "object:object-one", toRef: "object:object-one", label: "reinforces", type: "causal-claim", properties: {}, assertion: "tentative", sourceRefs: ["conversation:message-one"] } },
    { op: "create-record", family: "threads", record: { id: "thread-one", name: "Promise branch", messageRefs: ["conversation:message-one"], subjectRefs: ["object:object-one"], participantRefs: [`venture:${ventureId}`], properties: {} } },
    { op: "create-record", family: "runs", record: { id: "run-one", threadRef: "thread:thread-one", betRefs: ["bet:bet-one"], originMessageRef: "conversation:message-one", eventRefs: ["event:event-one"], workRefs: ["work:work-one"], decisionRefs: ["decision:decision-one"], outcomeRefs: ["outcome:outcome-one"], workflowContractRef: "workflow-contract:contract-one", modelRevision: 1, properties: {}, createdAt: "2026-07-17T00:00:00.000Z", completedAt: null } },
    { op: "create-record", family: "views", record: { id: "view-one", name: "Promise view", kind: "live", rootRefs: ["object:object-one"], filter: null, query: null, relationshipRefs: ["relationship:relationship-one"], placementRef: "placement:canvas", properties: {} } },
    { op: "create-record", family: "workflowContracts", record: { id: "contract-one", name: "Prove the model", subjectRefs: ["object:object-one"], entryConditions: [], expectedTransitions: [], gateRefs: ["decision:decision-one"], measurement: { proof: "round-trip" }, sourceRefs: ["conversation:message-one"], properties: {} } },
    { op: "create-record", family: "insights", record: { id: "insight-one", statement: "The model survives transfer.", subjectRefs: ["object:object-one"], stance: "supports", type: "interpretation", assertion: "founder-asserted", sourceRefs: ["outcome:outcome-one"], supersedes: [], status: "current", proposedBy: { authority: "founder", id: "jacob" }, appliedBy: { authority: "founder", id: "jacob" }, properties: {} } },
  ];
}

describe("canonical semantic model", () => {
  it("reads schema v1 without rewriting, then lazily migrates through the architecture projection", () => {
    const fx = fixture();
    const legacy = {
      current: {
        schemaVersion: 1,
        ventureId: fx.venture.id,
        revision: 3,
        intent: { statement: "Keep the promise", constraints: [] },
        elements: [{ id: "legacy-one", role: "concept", name: "Legacy identity", statement: "Survives.", provenance: { kind: "founder-authored" } }],
        connections: [], groups: [], evidenceAnnotations: [],
        updatedAt: "2026-07-16T00:00:00.000Z",
        updatedBy: { authority: "founder", id: "jacob" },
      },
      revisions: [{ id: "architecture-revision-3", revision: 3 }],
      proposals: [{ id: "proposal-decided", status: "rejected" }],
      revision: 5,
    };
    setVentureDoc(fx.venture.id, "architecture", "atlas", legacy, fx.options);

    const read = getSemanticModelState(fx.venture.id, fx.options);
    assert.equal(read.sourceFormat, "v1");
    assert.equal(read.model.objects[0].id, "legacy-one");
    assert.ok(getVentureDoc(fx.venture.id, "architecture", "atlas", fx.options).current, "a read does not rewrite the file");

    applyArchitectureMutations({
      ventureId: fx.venture.id,
      baseRevision: 3,
      operations: [{ op: "create-element", element: { id: "legacy-two", role: "concept", name: "Second identity" } }],
      actor: { authority: "founder", id: "jacob" },
    }, fx.options);

    const stored = getVentureDoc(fx.venture.id, "architecture", "atlas", fx.options);
    assert.equal(stored.schemaVersion, 2);
    assert.equal(stored.revision, 6);
    assert.equal(stored.current, undefined);
    assert.deepEqual(stored.objects.map((entry) => entry.id).sort(), ["legacy-one", "legacy-two"]);
    assert.equal(stored.compatibility.architecture.revisions[0].revision, 3);
    assert.equal(stored.compatibility.architecture.proposals[0].status, "rejected");
    assert.deepEqual(getArchitecture(fx.venture.id, fx.options).elements.map((entry) => entry.id).sort(), ["legacy-one", "legacy-two"]);
  });

  it("persists every record family in one readable atlas and round-trips it through venture export/import", () => {
    const fx = fixture();
    const model = mutateSemanticModel({
      ventureId: fx.venture.id,
      baseRevision: 0,
      operations: sevenFamilyOperations(fx.venture.id),
      actor: { authority: "founder", id: "jacob" },
    }, fx.options);
    for (const family of ["objects", "relationships", "threads", "runs", "views", "workflowContracts", "insights"]) assert.equal(model[family].length, 1, family);

    const atlasPath = path.join(fx.options.root, "ventures", fx.venture.id, "architecture", "atlas.json");
    const readable = fs.readFileSync(atlasPath, "utf8");
    assert.match(readable, /\n  "objects": \[/);
    assert.equal(JSON.parse(readable).current, undefined);

    const bundle = exportVenture(fx.venture.id, fx.options);
    const destination = { root: directory("drover-semantic-import-") };
    const destinationRepository = directory("drover-semantic-import-repo-");
    importVenture(bundle, { ...destination, repository: destinationRepository });
    const reopened = getSemanticModel(fx.venture.id, destination);
    for (const family of ["objects", "relationships", "threads", "runs", "views", "workflowContracts", "insights"]) assert.deepEqual(reopened[family], model[family], family);
  });

  it("lifts working-theory snapshots into tentative objects and source-bearing insight lineage", () => {
    const fx = fixture();
    const theory = (id, status, statement, supersedes = null) => ({
      id,
      mode: "working-theory",
      status,
      supersedes,
      proposedBy: { authority: "agent", id: "codex" },
      createdAt: `2026-07-17T00:0${id.endsWith("two") ? 2 : 1}:00.000Z`,
      subjects: [{ id: "subject-one", name: "Promise", statement, sourceRefs: ["conversation:message-one"] }],
      relationships: [],
    });
    setVentureDoc(fx.venture.id, "architecture", "atlas", {
      current: { schemaVersion: 1, ventureId: fx.venture.id, revision: 0, intent: { statement: "", constraints: [] }, elements: [], connections: [], groups: [], evidenceAnnotations: [], updatedAt: null, updatedBy: null },
      revisions: [],
      proposals: [theory("theory-one", "superseded", "First read"), theory("theory-two", "current", "Revised read", "theory-one")],
      revision: 2,
    }, fx.options);

    const model = getSemanticModel(fx.venture.id, fx.options);
    assert.equal(model.objects.find((entry) => entry.id === "subject-one").statement, "Revised read");
    const insights = model.insights.filter((entry) => entry.type === "working-theory");
    assert.equal(insights.length, 2);
    assert.equal(insights[0].assertion, "tentative");
    assert.deepEqual(insights[0].sourceRefs, ["conversation:message-one"]);
    assert.deepEqual(insights[1].supersedes, [`insight:${insights[0].id}`]);
  });

  it("fails a stale second writer at the atlas CAS boundary", () => {
    const fx = fixture();
    const left = getSemanticModelState(fx.venture.id, fx.options);
    const right = getSemanticModelState(fx.venture.id, fx.options);
    const operation = (id) => [{ op: "create-record", family: "objects", record: { id, type: "open", name: id, statement: "", properties: {}, assertion: "founder-asserted", provenance: { kind: "founder-authored" } } }];
    const leftModel = applySemanticModelMutations(left.model, { baseRevision: 0, operations: operation("left"), actor: { authority: "founder" } });
    const rightModel = applySemanticModelMutations(right.model, { baseRevision: 0, operations: operation("right"), actor: { authority: "founder" } });
    writeSemanticModelState(fx.venture.id, left, leftModel, fx.options);
    assert.throws(
      () => writeSemanticModelState(fx.venture.id, right, rightModel, fx.options),
      (error) => error.code === "PERSISTENCE_CONFLICT" && error.actualRevision === 1,
    );
    assert.deepEqual(getSemanticModel(fx.venture.id, fx.options).objects.map((entry) => entry.id), ["left"]);
  });

  it("fails closed on cross-venture and active references", () => {
    const fx = fixture();
    mutateSemanticModel({ ventureId: fx.venture.id, baseRevision: 0, operations: sevenFamilyOperations(fx.venture.id), actor: { authority: "founder" } }, fx.options);
    assert.throws(
      () => mutateSemanticModel({ ventureId: fx.venture.id, baseRevision: 1, operations: [{ op: "remove-record", family: "objects", id: "object-one" }], actor: { authority: "founder" } }, fx.options),
      (error) => error.code === "semantic_model_missing_ref",
    );
    assert.equal(getSemanticModel(fx.venture.id, fx.options).revision, 1);

    const poisoned = emptySemanticModel(fx.venture.id);
    poisoned.objects.push({ id: "crossed", type: "open", name: "Crossed", statement: "", properties: {}, authorityRef: "venture:another", assertion: "founder-asserted", provenance: {} });
    assert.throws(() => validateSemanticModel(poisoned), (error) => error.code === "semantic_model_cross_scope");
  });

  it("keeps conversation, work, placement, evidence, and workflow state in their authoritative records", () => {
    const fx = fixture();
    const base = applySemanticModelMutations(emptySemanticModel(fx.venture.id), {
      baseRevision: 0,
      operations: sevenFamilyOperations(fx.venture.id),
      actor: { authority: "founder" },
      externalRefExists: () => true,
    });
    const cases = [
      ["threads", "thread-one", { messages: [{ body: "copied" }] }],
      ["runs", "run-one", { bet: { id: "bet-one" } }],
      ["views", "view-one", { camera: { x: 1, y: 2 } }],
      ["insights", "insight-one", { outcome: { id: "outcome-one" } }],
      ["workflowContracts", "contract-one", { status: "running" }],
    ];
    for (const [family, id, fields] of cases) {
      assert.throws(
        () => applySemanticModelMutations(base, { baseRevision: 1, operations: [{ op: "update-record", family, id, record: fields }], actor: { authority: "founder" }, externalRefExists: () => true }),
        (error) => error.code === "semantic_model_invalid",
        family,
      );
    }
  });

  it("keeps architecture compatibility writes on the same canonical document", () => {
    const fx = fixture();
    const state = getSemanticModelState(fx.venture.id, fx.options);
    const architectureState = {
      semanticModel: state.model,
      storageRevision: state.storageRevision,
      storageRevisionPresent: state.storageRevisionPresent,
    };
    writeArchitectureCompatibilityState(fx.venture.id, architectureState, {
      current: { schemaVersion: 1, ventureId: fx.venture.id, revision: 0, intent: { statement: "", constraints: [] }, elements: [], connections: [], groups: [], evidenceAnnotations: [], updatedAt: null, updatedBy: null },
      revisions: [],
      proposals: [{ id: "proposal-only", status: "pending" }],
    }, fx.options);
    const stored = getVentureDoc(fx.venture.id, "architecture", "atlas", fx.options);
    assert.equal(stored.schemaVersion, 2);
    assert.equal(stored.revision, 1);
    assert.equal(stored.compatibility.architecture.proposals[0].id, "proposal-only");
    assert.equal(stored.current, undefined);
  });

  it("refuses an architecture projection that collides with unrelated canonical identity", () => {
    const fx = fixture();
    mutateSemanticModel({
      ventureId: fx.venture.id,
      baseRevision: 0,
      operations: [{ op: "create-record", family: "objects", record: { id: "same", type: "open", name: "Canonical", statement: "Must survive.", properties: {}, assertion: "founder-asserted", provenance: { kind: "founder-authored" } } }],
      actor: { authority: "founder", id: "jacob" },
    }, fx.options);
    assert.throws(
      () => applyArchitectureMutations({ ventureId: fx.venture.id, baseRevision: 0, operations: [{ op: "create-element", element: { id: "same", role: "concept", name: "Compatibility collision" } }], actor: { authority: "founder", id: "jacob" } }, fx.options),
      (error) => error.code === "semantic_model_compatibility_conflict" && error.status === 409,
    );
    const stored = getSemanticModel(fx.venture.id, fx.options);
    assert.equal(stored.revision, 1);
    assert.equal(stored.objects[0].statement, "Must survive.");
  });

  it("fails closed on a spoofed repository citation but accepts a well-formed one", () => {
    const grounded = (sourceRef) => [
      { op: "create-record", family: "objects", record: { id: "grounded-object", type: "open", name: "Grounded", statement: "", properties: {}, assertion: "tentative", provenance: { kind: "model-inference" } } },
      { op: "create-record", family: "insights", record: { id: "grounded-insight", statement: "Cited by the repository.", subjectRefs: ["object:grounded-object"], stance: "supports", type: "interpretation", assertion: "tentative", sourceRefs: [sourceRef], supersedes: [], status: "current", proposedBy: { authority: "agent", id: "codex" }, properties: {} } },
    ];
    const spoof = fixture();
    assert.throws(
      () => mutateSemanticModel({ ventureId: spoof.venture.id, baseRevision: 0, operations: grounded("repository:evil"), actor: { authority: "founder", id: "jacob" } }, spoof.options),
      (error) => error.code === "semantic_model_missing_ref",
    );
    const real = fixture();
    const model = mutateSemanticModel({ ventureId: real.venture.id, baseRevision: 0, operations: grounded("repository:src/app.mjs#L1-L4:0a1b2c3d4e5f"), actor: { authority: "founder", id: "jacob" } }, real.options);
    assert.deepEqual(model.insights.find((entry) => entry.id === "grounded-insight").sourceRefs, ["repository:src/app.mjs#L1-L4:0a1b2c3d4e5f"]);
  });

  it("does not present semantic-only activity as an architecture revision", () => {
    const fx = fixture();
    applyArchitectureMutations({ ventureId: fx.venture.id, baseRevision: 0, operations: [{ op: "create-element", element: { id: "architecture-one", role: "concept", name: "Architecture" } }], actor: { authority: "founder", id: "jacob" } }, fx.options);
    const before = getArchitecture(fx.venture.id, fx.options);
    mutateSemanticModel({
      ventureId: fx.venture.id,
      baseRevision: 1,
      operations: [{ op: "create-record", family: "threads", record: { id: "thread-later", name: "Later", messageRefs: [], subjectRefs: [], participantRefs: [], properties: {} } }],
      actor: { authority: "founder", id: "jacob" },
    }, fx.options);
    const after = getArchitecture(fx.venture.id, fx.options);
    assert.equal(after.revision, before.revision);
    assert.equal(after.updatedAt, before.updatedAt);
    assert.deepEqual(after.updatedBy, before.updatedBy);
  });
});

describe("canonical run and thread schema", () => {
  const anyRef = () => true;
  const founder = { authority: "founder" };

  function withThread(id = "thread-root") {
    return applySemanticModelMutations(emptySemanticModel("venture-x"), {
      baseRevision: 0,
      operations: [{ op: "create-record", family: "threads", record: { id, name: "Root", messageRefs: [], subjectRefs: [], participantRefs: [], properties: {} } }],
      actor: founder,
      externalRefExists: anyRef,
    });
  }

  function addRun(model, record) {
    return applySemanticModelMutations(model, {
      baseRevision: model.revision,
      operations: [{ op: "create-record", family: "runs", record }],
      actor: founder,
      externalRefExists: anyRef,
    });
  }

  it("accepts a betless drive as a run with no bets", () => {
    const next = addRun(withThread(), { id: "run-betless", threadRef: "thread:thread-root", betRefs: [], properties: {} });
    assert.deepEqual(next.runs[0].betRefs, []);
  });

  it("accepts a multi-bet drive", () => {
    const next = addRun(withThread(), { id: "run-multi", threadRef: "thread:thread-root", betRefs: ["bet:a", "bet:b"], properties: {} });
    assert.deepEqual(next.runs[0].betRefs, ["bet:a", "bet:b"]);
  });

  it("accepts a nested child run under its parent run", () => {
    const parent = addRun(withThread(), { id: "run-parent", threadRef: "thread:thread-root", betRefs: [], properties: {} });
    const next = addRun(parent, { id: "run-child", threadRef: "thread:thread-root", parentRunRef: "run:run-parent", betRefs: [], properties: {} });
    assert.equal(next.runs.find((entry) => entry.id === "run-child").parentRunRef, "run:run-parent");
  });

  it("keeps the legacy single betRef as a readable compatibility seam", () => {
    const next = addRun(withThread(), { id: "run-legacy", threadRef: "thread:thread-root", betRef: "bet:legacy", properties: {} });
    assert.equal(next.runs[0].betRef, "bet:legacy");
  });

  it("rejects a run with no thread", () => {
    assert.throws(() => addRun(withThread(), { id: "run-orphan", betRefs: [], properties: {} }), (error) => error.code === "semantic_model_missing_ref");
  });

  it("rejects a run that persists running state", () => {
    assert.throws(() => addRun(withThread(), { id: "run-live", threadRef: "thread:thread-root", running: true, properties: {} }), (error) => error.code === "semantic_model_invalid");
  });

  it("rejects a run that copies bet, event, work, decision, or outcome records", () => {
    for (const copied of [{ bet: { id: "a" } }, { events: [{ id: "e" }] }, { work: [{ id: "w" }] }, { decisions: [{ id: "d" }] }, { outcomes: [{ id: "o" }] }]) {
      assert.throws(
        () => addRun(withThread(), { id: "run-copy", threadRef: "thread:thread-root", betRefs: [], properties: {}, ...copied }),
        (error) => error.code === "semantic_model_invalid",
        JSON.stringify(copied),
      );
    }
  });

  it("rejects a run that parents itself", () => {
    assert.throws(() => addRun(withThread(), { id: "run-self", threadRef: "thread:thread-root", parentRunRef: "run:run-self", betRefs: [], properties: {} }), (error) => error.code === "semantic_model_invalid");
  });

  it("rejects a run whose parent run does not exist", () => {
    assert.throws(() => addRun(withThread(), { id: "run-dangling", threadRef: "thread:thread-root", parentRunRef: "run:ghost", betRefs: [], properties: {} }), (error) => error.code === "semantic_model_missing_ref");
  });

  it("rejects a thread that references itself as its parent", () => {
    assert.throws(
      () => applySemanticModelMutations(emptySemanticModel("venture-x"), {
        baseRevision: 0,
        operations: [{ op: "create-record", family: "threads", record: { id: "loop", name: "Loop", messageRefs: [], subjectRefs: [], participantRefs: [], parentThreadRef: "thread:loop", properties: {} } }],
        actor: founder,
        externalRefExists: anyRef,
      }),
      (error) => error.code === "semantic_model_invalid",
    );
  });
});
