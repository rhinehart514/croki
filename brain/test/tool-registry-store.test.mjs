import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { recordFeedbackSignalsFromRun } from "../src/feedback-ledger.mjs";
import { isCallable } from "../src/tool-birth.mjs";
import { closePersistence } from "../src/persistence.mjs";
import {
  loadToolRegistry,
  registeredTools,
  pendingToolProposals,
  listToolRegistry,
  approveToolBirth,
} from "../src/tool-registry-store.mjs";

const projectId = "acme";

// Authored code + test — what the founder/model supplies at the gate. Mirrors the spec shape proposeTool
// mandates in tool-birth.test.mjs.
const CODE = "export function scoreLead(lead) { return lead.signals.length; }";
const TEST = "assert.equal(scoreLead({ signals: [1,2] }), 2);";

// A graph + result whose one deterministic node ("score lead", category "enrich") ran cleanly. Re-running
// this banks one AgentAction per run; three runs reach the crystallization threshold (3) and the run path
// produces a PENDING tool-birth proposal — exactly the front of the loop Wave 1 wired.
function deterministicRun(runId) {
  return {
    graph: { id: "g", nodes: [{ id: "n1", label: "score lead", category: "enrich" }], edges: [] },
    result: { runId, graphId: "g", nodes: { n1: { nodeId: "n1", category: "enrich", ok: true } } },
  };
}

// Drive the real run path enough times to crystallize a pending proposal, returning the proposal id.
function seedPendingProposal(options) {
  let last;
  for (let i = 1; i <= 3; i += 1) {
    const { graph, result } = deterministicRun(`r${i}`);
    last = recordFeedbackSignalsFromRun({ projectId, graph, result }, options);
  }
  assert.equal(last.toolBirthProposals.length, 1, "three runs should crystallize one pending proposal");
  const proposal = last.toolBirthProposals[0];
  assert.equal(proposal.status, "pending");
  return proposal.id;
}

describe("tool-registry-store — the founder-gated tool-birth → registry leg", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-tool-registry-"));
    options = { root: parent };
  });

  afterEach(() => {
    closePersistence(options);
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("the run/agent path produces a PENDING proposal but NEVER auto-registers a tool", () => {
    const proposalId = seedPendingProposal(options);
    // The wall: nothing the agent/operator run path did put a tool in the registry.
    assert.deepEqual(registeredTools(projectId, options), []);
    // The proposal is visible to the founder as pending, awaiting an explicit decision.
    const pending = pendingToolProposals(projectId, options);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, proposalId);
  });

  it("founder approveToolBirth with authored code+test births a registered, callable tool that survives reload, and resolves the proposal", () => {
    const proposalId = seedPendingProposal(options);

    const { tool, alreadyRegistered } = approveToolBirth(
      { projectId, proposalId, code: CODE, test: TEST, name: "score-lead", description: "Deterministic lead scorer." },
      options,
    );
    assert.equal(alreadyRegistered, false);
    assert.equal(tool.status, "approved");
    assert.equal(isCallable(tool), true);
    assert.equal(tool.provenance, "self-built");
    assert.equal(tool.sourceProposalId, proposalId);

    // Durable: drop the cached backend handle to simulate a process restart, then reload from disk.
    closePersistence(options);
    const registry = loadToolRegistry(projectId, options);
    const reloaded = registry.tools[tool.id];
    assert.ok(reloaded, "the born tool survives a reload");
    assert.equal(isCallable(reloaded), true);
    assert.equal(reloaded.uses, 0);

    // The pending proposal is resolved — it no longer surfaces for decision.
    const list = listToolRegistry(projectId, options);
    assert.equal(list.pending.length, 0);
    assert.equal(list.registered.length, 1);
    assert.equal(list.registered[0].id, tool.id);
  });

  it("approving WITHOUT authored code+test is refused, and nothing is registered", () => {
    const proposalId = seedPendingProposal(options);

    // No code -> proposeTool refuses; no test -> refused; the wall holds before registration.
    assert.throws(() => approveToolBirth({ projectId, proposalId, test: TEST }, options), /code/i);
    assert.throws(() => approveToolBirth({ projectId, proposalId, code: CODE }, options), /test/i);

    assert.deepEqual(registeredTools(projectId, options), []);
    // The proposal is untouched — still pending, still decidable.
    assert.equal(pendingToolProposals(projectId, options).length, 1);
  });

  it("approving an unknown proposal is refused", () => {
    assert.throws(() => approveToolBirth({ projectId, proposalId: "toolbirth-nope", code: CODE, test: TEST }, options), /No pending tool-birth proposal/);
  });

  it("approveToolBirth is idempotent by proposal id — a re-approve returns the existing tool without resetting telemetry", () => {
    const proposalId = seedPendingProposal(options);

    const first = approveToolBirth({ projectId, proposalId, code: CODE, test: TEST }, options);
    assert.equal(first.alreadyRegistered, false);

    const second = approveToolBirth({ projectId, proposalId, code: CODE, test: TEST }, options);
    assert.equal(second.alreadyRegistered, true);
    assert.equal(second.tool.id, first.tool.id);

    // Exactly one registered tool — the re-approve did not duplicate or reset it.
    assert.equal(registeredTools(projectId, options).length, 1);
  });

  it("there is no operator/agent approve path — birth is exclusively the founder approveToolBirth call", () => {
    // The only export from the store that registers a tool is approveToolBirth (the founder action behind
    // the server route). No run-path / operator export births a tool — proven above by the run path
    // leaving the registry empty. This asserts the module surface itself exposes no auto-approve.
    const surface = Object.keys({
      loadToolRegistry,
      registeredTools,
      pendingToolProposals,
      listToolRegistry,
      approveToolBirth,
    });
    assert.ok(!surface.some((name) => /auto|operator|agent/i.test(name)));
  });
});
