// run-compile.test.mjs — Phase 4, honest run to gate (GTM-ENGINE-REBUILD §4, Phase 4).
//
// What this proves:
//   - A selected GTM path compiles into a real, reviewable Run that STAGES at the founder gate:
//     status "staged", gate pending, compiled-steps snapshot persisted, nothing sent.
//   - The MeasurementContract MUST exist before the run is runnable (the guard, amendment 2): a path
//     with no contract, or a hollow one, is refused loudly at compile time — no run is staged.
//   - The contract is BOUND at compile time (it travels on the run and in the gate view), so the run
//     is measurable before, not after, it reaches the founder.
//   - The wall is UNTOUCHED: a compiled topology whose execute node is not behind a founder gate is
//     rejected by the reused engine; nothing about the send path changed.
//   - The gate renders whatever was staged — an item of an arbitrary, open shape survives into the
//     gate view untouched, with a stable action id and a pending status. No fixed field is required.
//   - Grounding is on BOTH truths: the records the bet rests on are resolved and handed to the composer.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  compileRunFromPath,
  buildCompileGrounding,
  gateReviewForRun,
  isBindableContract,
} from "../src/run-compile.mjs";
import {
  productTruthStore,
  marketObjectStore,
  gtmPathStore,
  measurementContractStore,
  runStore,
} from "../src/gtm-store.mjs";

// Isolated store root per test — nothing touches the real ~/.gtm-ide.
function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "run-compile-")) };
}

// A fake composer: the test exercises the compile plumbing (resolve path → require contract → ground →
// compose → assert wall → stage), not model quality. Returns a gated graph so the wall passes.
function gatedComposer() {
  return async () => ({
    ok: true,
    nodes: [
      { id: "ctx", category: "context", connector: "product", label: "Context" },
      { id: "src", category: "source", connector: "manual", label: "Input" },
      { id: "draft", kind: "agent", ref: "drafter", label: "Draft", agentPrompt: "draft outreach" },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "local", label: "Stage output" },
      { id: "meas", category: "measure", connector: "default", label: "Measure" },
    ],
    edges: [
      { source: "ctx", target: "draft", edgeType: "context" },
      { source: "src", target: "draft", edgeType: "data" },
      { source: "draft", target: "gate", edgeType: "data" },
      { source: "gate", target: "out", edgeType: "data" },
      { source: "out", target: "meas", edgeType: "data" },
    ],
  });
}

// An ungated composer: an execute node with no founder gate upstream — the wall must reject it.
function ungatedComposer() {
  return async () => ({
    ok: true,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input" },
      { id: "out", category: "execute", connector: "local", label: "Send" },
    ],
    edges: [{ source: "src", target: "out", edgeType: "data" }],
  });
}

// Seed a project with both truths, a path, and its measurement contract. Returns the ids.
function seedPath(options, { contractFields } = {}) {
  const projectId = "strelva";
  const truth = productTruthStore.create(
    { projectId, statement: "The product logs a project_created event", solidity: "observed", evidence: [{ claim: "event fires", source: "src/track.ts:42", solidity: "observed" }] },
    options,
  );
  const buyer = marketObjectStore.create(
    { projectId, kind: "buyer", statement: "Solo founders running side projects", evidence: [{ claim: "forum posts", source: "https://x/y", solidity: "researched" }] },
    options,
  );
  const channel = marketObjectStore.create(
    { projectId, kind: "channel", statement: "They gather in indie-hacker Discords", evidence: [{ claim: "seen", source: "https://discord/z", solidity: "researched" }] },
    options,
  );
  const path = gtmPathStore.create(
    {
      projectId,
      summary: "Reach solo founders in indie Discords with a project-launch nudge",
      bet: { buyer: "solo founders", channel: "indie-hacker Discord", offer: "free launch checklist", message: "You just created a project — here's a launch checklist." },
      restsOn: [{ type: "productTruth", id: truth.id }, { type: "marketObject", id: buyer.id }, { type: "marketObject", id: channel.id }],
      status: "selected",
    },
    options,
  );
  const contract = measurementContractStore.create(
    {
      projectId,
      pathId: path.id,
      outcomeKinds: contractFields?.outcomeKinds ?? ["reply", "signup"],
      sources: contractFields?.sources ?? ["founder-entered"],
      joinKey: contractFields?.joinKey ?? "discord-handle",
      successCriteria: contractFields?.successCriteria ?? "one reply within a week",
    },
    options,
  );
  const linked = gtmPathStore.save({ ...path, measurementContractId: contract.id }, options);
  return { projectId, truth, buyer, channel, path: linked, contract };
}

describe("run-compile — a selected path stages a reviewable run at the gate", () => {
  it("compiles a path into a staged run with the contract bound; nothing sends", async () => {
    const options = freshRoot();
    const { projectId, path } = seedPath(options);

    const { run, graph, contract, gate } = await compileRunFromPath(
      { projectId, pathId: path.id, compose: gatedComposer(), options },
    );

    // A run STAGES: pending gate, staged status, nothing sent.
    assert.equal(run.status, "staged");
    assert.equal(run.gateState.status, "pending");

    // Compiled-steps snapshot persisted, with its wiring.
    assert.ok(run.steps.length >= 2, "the compiled node snapshot is persisted");
    assert.ok(run.edges.length >= 1, "the compiled edges round-trip");
    assert.ok(graph.nodes.some((n) => n.category === "gate"), "the compiled graph has a founder gate");

    // The contract is BOUND at compile time — on the run and in the gate view.
    assert.equal(run.measurementContractId, contract.id);
    assert.equal(run.measurementContract.joinKey, "discord-handle");
    assert.equal(gate.measurementContract.successCriteria, "one reply within a week");

    // The run persisted and reads back.
    assert.equal(runStore.get(run.id, options).pathId, path.id);
  });

  it("mints a joinKey per staged action so a later result can join back", async () => {
    const options = freshRoot();
    const { projectId, path } = seedPath(options);
    const { run } = await compileRunFromPath({ projectId, pathId: path.id, compose: gatedComposer(), options });
    assert.ok(run.items.length >= 1);
    for (const item of run.items) assert.ok(item.joinKey, "every staged item carries a durable joinKey");
  });

  it("carries the founder's concrete input items into the staged actions", async () => {
    const options = freshRoot();
    const { projectId, path } = seedPath(options);
    const { run } = await compileRunFromPath({
      projectId,
      pathId: path.id,
      compose: gatedComposer(),
      input: { items: [{ handle: "@alice" }, { handle: "@bob" }] },
      options,
    });
    assert.equal(run.items.length, 2);
    assert.equal(run.items[0].handle, "@alice");
    // The compiled plan (the bet's own message) rides along on each concrete item.
    assert.ok(run.items[0].message, "the bet's message is carried onto the staged action");
  });
});

describe("run-compile — the measurement contract MUST exist before the run is runnable", () => {
  it("refuses to compile a path with no measurement contract", async () => {
    const options = freshRoot();
    const projectId = "strelva";
    const path = gtmPathStore.create({ projectId, summary: "a path with no measurement plan" }, options);
    await assert.rejects(
      compileRunFromPath({ projectId, pathId: path.id, compose: gatedComposer(), options }),
      /measurement plan/i,
    );
    // No run was staged.
    assert.equal(runStore.list({ ...options, projectId }).length, 0);
  });

  it("refuses to compile a path whose contract is hollow (nothing to measure)", async () => {
    const options = freshRoot();
    const { projectId, path, contract } = seedPath(options, {
      contractFields: { outcomeKinds: [], sources: [], joinKey: "", successCriteria: "" },
    });
    assert.equal(isBindableContract(contract), false, "an empty contract is not bindable");
    await assert.rejects(
      compileRunFromPath({ projectId, pathId: path.id, compose: gatedComposer(), options }),
      /measurement plan is empty/i,
    );
    assert.equal(runStore.list({ ...options, projectId }).length, 0);
  });

  it("compiles once a founder-edited contract is passed in, even if the stored one was hollow", async () => {
    const options = freshRoot();
    const { projectId, path } = seedPath(options, {
      contractFields: { outcomeKinds: [], sources: [], joinKey: "", successCriteria: "" },
    });
    const { run } = await compileRunFromPath({
      projectId,
      pathId: path.id,
      contract: { id: "mc-edited", outcomeKinds: ["meeting"], joinKey: "email", successCriteria: "a booked call" },
      compose: gatedComposer(),
      options,
    });
    assert.equal(run.status, "staged");
    assert.equal(run.measurementContractId, "mc-edited");
  });
});

describe("run-compile — the wall is untouched", () => {
  it("rejects a compiled topology whose execute node has no founder gate upstream", async () => {
    const options = freshRoot();
    const { projectId, path } = seedPath(options);
    await assert.rejects(
      compileRunFromPath({ projectId, pathId: path.id, compose: ungatedComposer(), options }),
      /gate/i,
    );
    assert.equal(runStore.list({ ...options, projectId }).length, 0, "an ungated compile stages nothing");
  });
});

describe("run-compile — the gate renders whatever was staged (open shapes)", () => {
  it("carries an arbitrary item shape through the gate view untouched, with a stable action id", async () => {
    const options = freshRoot();
    const run = runStore.create(
      {
        projectId: "strelva",
        pathId: "path-1",
        items: [{ midnight_barter_offer: "swap tools", nested: { any: ["shape"] }, joinKey: "k-42" }],
      },
      options,
    );
    const gate = gateReviewForRun(run);
    assert.equal(gate.status, "pending");
    assert.equal(gate.items.length, 1);
    assert.equal(gate.items[0].approvalStatus, "pending");
    assert.equal(gate.items[0].joinKey, "k-42");
    assert.equal(gate.items[0].item.midnight_barter_offer, "swap tools", "an open field survives into the gate view");
    assert.deepEqual(gate.items[0].item.nested, { any: ["shape"] });
    // A stable action id derived from the run + the item's joinKey.
    assert.ok(gate.items[0].actionId.includes("k-42"));
  });
});

describe("run-compile — grounding is on BOTH truths", () => {
  it("resolves the records the bet rests on into product + market grounding", () => {
    const options = freshRoot();
    const { path } = seedPath(options);
    const grounding = buildCompileGrounding({ path, projectId: "strelva", options });
    assert.ok(grounding.productTruths.length >= 1, "product truth side is grounded");
    assert.ok(grounding.marketObjects.length >= 1, "market side is grounded");
    assert.ok(grounding.headline.includes("solo founders") || grounding.headline.includes("indie"));
  });
});
