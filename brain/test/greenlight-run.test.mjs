// greenlight-run.test.mjs — EXPERIMENT-MACHINE-SPEC rail 3: one founder click SETS AN EXPERIMENT
// RUNNING, distinct from the outward gate. Proves greenlight starts internal/prep work while HOLDING
// every genuinely-outward item at the founder gate — greenlight never approves anything that leaves.
//
// What this proves:
//   - Greenlight approves ONLY internal/prep items (stage-local, reviewed-diff-only); they release.
//   - Every OUTWARD item (send/publish/deploy/charge) stays PENDING at the gate — greenlight never
//     emits an approve decision for one, so it can never send, publish, deploy, or charge.
//   - Greenlight and the outward gate are two separate acts: greenlight leaves the wall intact for the
//     founder to cross item-by-item later.
//   - The item-outward classifier fails CLOSED: an unknown/ambiguous item is treated as outward (held).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { compileRunFromPath, greenlightRun, isOutwardStagedItem } from "../src/run-compile.mjs";
import { gtmPathStore, runStore } from "../src/gtm-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "greenlight-")) };
}

// A fixed gated composer — source → gate → execute(local, stages) → measure. The execute node is LOCAL:
// the compiled-run default that stages, never sends. So even a mis-classified item could only stage, not
// send — the classifier is the primary guard, the local connector the backstop.
function gatedComposer() {
  return async () => ({
    ok: true,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input" },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "local", label: "Stage output" },
      { id: "meas", category: "measure", connector: "default", label: "Measure" },
    ],
    edges: [
      { source: "src", target: "gate", edgeType: "data" },
      { source: "gate", target: "out", edgeType: "data" },
      { source: "out", target: "meas", edgeType: "data" },
    ],
  });
}

// Stage a run carrying BOTH an internal/prep item (stage-local) and an OUTWARD item (send), through the
// real compile path so items get the same joinKey/stamp treatment production uses.
async function stageMixedRun(options, projectId = "atlas") {
  const p = gtmPathStore.create(
    { projectId, summary: "A mixed experiment: one prep step, one outward send", bet: { buyer: "founders", channel: "email" }, status: "selected" },
    options,
  );
  const { run } = await compileRunFromPath({
    projectId,
    pathId: p.id,
    compose: gatedComposer(),
    input: {
      items: [
        { handle: "prep", draft: "prepare a research digest", protects: "stage_locally" },
        { handle: "@alice", draft: "Hi Alice — saw your launch.", protects: "send_emails" },
      ],
    },
    options,
  });
  return { projectId, run };
}

describe("greenlight — item-outward classifier", () => {
  it("internal stays inside, outward crosses the wall, unknown fails closed", () => {
    assert.equal(isOutwardStagedItem({ protects: "stage_locally" }), false);
    const localPatch = {
      kind: "patch",
      protects: "prepare_diff",
      effectBoundary: "reviewed_diff_only",
      externalEffectAuthorized: false,
      blockedEffects: ["commit", "push", "pull_request", "merge", "publish", "deploy"],
    };
    assert.equal(isOutwardStagedItem(localPatch), false);
    assert.equal(isOutwardStagedItem({ protects: "send_emails" }), true);
    assert.equal(isOutwardStagedItem({ protects: "publish_page" }), true);
    assert.equal(isOutwardStagedItem({ protects: "deploy" }), true);
    // Fail closed: an unknown shape or an authorized external effect is outward (held).
    assert.equal(isOutwardStagedItem({}), true);
    assert.equal(isOutwardStagedItem({ kind: "patch" }), true, "a patch label alone is not local proof");
    assert.equal(isOutwardStagedItem({ kind: "patch", protects: "prepare_diff", externalEffectAuthorized: false }), true, "missing boundary/effect blocks stays held");
    assert.equal(isOutwardStagedItem({ kind: "patch", protects: "prepare_diff", effectBoundary: "reviewed_diff_only", externalEffectAuthorized: false, blockedEffects: ["deploy"] }), true, "incomplete effect proof stays held");
    assert.equal(isOutwardStagedItem({ kind: "patch", protects: "commit", effectBoundary: "reviewed_diff_only", externalEffectAuthorized: false, blockedEffects: ["commit", "push", "pull_request", "merge", "publish", "deploy"] }), true, "conflicting commit intent stays held");
    assert.equal(isOutwardStagedItem({ kind: "patch", protects: "prepare_diff", effectBoundary: "reviewed_diff_only", externalEffectAuthorized: true, blockedEffects: ["commit", "push", "pull_request", "merge", "publish", "deploy"] }), true);
    assert.equal(isOutwardStagedItem({ protects: "push" }), true);
    assert.equal(isOutwardStagedItem(null), true);
  });
});

describe("greenlight — starts internal/prep work, holds outward at the gate", () => {
  it("greenlight releases the internal item and HOLDS the outward one pending; nothing sends", async () => {
    const options = freshRoot();
    const { projectId, run: staged } = await stageMixedRun(options);
    assert.equal(staged.items.length, 2);

    const { run, greenlight, result } = await greenlightRun({ projectId, runId: staged.id, options });

    // The greenlight summary reports what it started vs what still waits.
    assert.equal(greenlight.startedInternal, 1, "one internal/prep item was greenlit to run");
    assert.equal(greenlight.heldOutward, 1, "one outward item was held at the gate");

    // The internal item released (approved); the outward item is STILL pending — greenlight never approved it.
    const byHandle = Object.fromEntries((run.items ?? []).map((i) => [i.handle, i]));
    assert.equal(byHandle["prep"].approvalStatus, "approved", "internal/prep item released");
    assert.equal(byHandle["@alice"].approvalStatus, "pending", "outward item held at the founder gate");

    // Nothing sent: no item carries a provider message id (the execute connector staged locally).
    assert.ok((run.items ?? []).every((i) => !i.providerMessageId), "greenlight sent nothing");
    // The gate still holds the outward item — the run is not resolved.
    assert.equal(run.gateState.status, "pending");
    assert.ok(result.pendingGates.length >= 1, "the founder gate still holds the outward item");

    // The execute node only ever saw the internal item — the outward item never reached a send/stage path.
    const executeResult = result.nodes.out;
    assert.ok(executeResult, "the execute node ran");
    assert.ok(executeResult.items.every((i) => i.handle !== "@alice"), "the outward item never reached execute");
  });

  // FIX 1 defense-in-depth (executor-level): even when greenlight approves an internal item AND that item
  // is routed into a REAL network execute node (http), greenlight's run carries NO outward-release
  // capability, so the connector HOLDS it — the network is never touched. Greenlight is structurally
  // incapable of a send, independent of the item classifier.
  it("greenlight routed into an http execute node sends NOTHING — no outward-release capability on the run", async () => {
    const options = freshRoot();
    const projectId = "atlas";
    let fetched = 0;
    // A composer whose execute node is a REAL http sender. Its config carries only a plain endpoint (so the
    // compiled steps persist cleanly); the fetch seam is stubbed on globalThis so any real send would fire
    // it. If greenlight could ever reach a send, `fetched` would increment.
    const httpComposer = async () => ({
      ok: true,
      nodes: [
        { id: "src", category: "source", connector: "manual", label: "Input" },
        { id: "gate", category: "gate", connector: "default", label: "Founder review" },
        { id: "out", category: "execute", label: "HTTP send" },
        { id: "meas", category: "measure", connector: "default", label: "Measure" },
      ],
      edges: [
        { source: "src", target: "gate", edgeType: "data" },
        { source: "gate", target: "out", edgeType: "data" },
        { source: "out", target: "meas", edgeType: "data" },
      ],
    });
    const p = gtmPathStore.create({ projectId, summary: "prep routed to http", bet: { channel: "email" }, status: "selected" }, options);
    const { run: staged, graph } = await compileRunFromPath({
      projectId, pathId: p.id, compose: httpComposer,
      // Bind a REAL http output so the execute node the founder's I/O produces is a network sender.
      output: { type: "api", endpoint: "https://relay.example/send" },
      // An INTERNAL prep item greenlight WILL approve — with a gtmActionId so nothing but the missing
      // capability could hold it at the connector.
      input: { items: [{ handle: "prep", draft: "prepare a digest", protects: "stage_locally", gtmActionId: "gtm-prep-1" }] },
      options,
    });
    // Confirm the execute node is genuinely an http sender (not normalized to local) — otherwise this test
    // would be vacuous.
    assert.ok(graph.nodes.some((n) => n.category === "execute" && n.connector === "http"), "the execute node is a real http sender");

    const priorFetch = globalThis.fetch;
    globalThis.fetch = async () => { fetched += 1; return { ok: true, status: 202, json: async () => ({ id: "p" }) }; };
    let result;
    try {
      ({ result } = await greenlightRun({ projectId, runId: staged.id, options }));
    } finally {
      globalThis.fetch = priorFetch;
    }

    assert.equal(fetched, 0, "greenlight never reaches the network — the http fetch was never called");
    // The execute node ran but HELD the approved item for lack of the outward-release capability.
    const exec = Object.values(result.nodes).find((n) => n?.connector === "http");
    assert.ok(exec, "the http execute node ran");
    assert.equal(exec.blockedReason, "needs_release", "the connector held the item — no outward-release capability on a greenlight run");
    assert.ok((exec.items ?? []).every((i) => i.executionStatus !== "sent"), "nothing was sent");
  });

  it("a run whose every item is outward is an honest no-op on the wall — nothing runs unattended", async () => {
    const options = freshRoot();
    const projectId = "atlas";
    const p = gtmPathStore.create({ projectId, summary: "all outward", bet: { channel: "email" }, status: "selected" }, options);
    const { run: staged } = await compileRunFromPath({
      projectId, pathId: p.id, compose: gatedComposer(),
      input: { items: [{ handle: "@a", draft: "outreach", protects: "send_emails" }] },
      options,
    });

    const { greenlight, run } = await greenlightRun({ projectId, runId: staged.id, options });
    assert.equal(greenlight.startedInternal, 0);
    assert.equal(greenlight.heldOutward, 1);
    const held = (run.items ?? []).find((i) => i.handle === "@a");
    assert.equal(held.approvalStatus, "pending", "the outward item stays held");
  });
});
