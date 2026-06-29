import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectCrystallizationCandidates,
  detectCrystallizationSuggestions,
  actionLogFromRun,
  normalizeProcedure,
  isJudgmentAction,
} from "../src/crystallization.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  recordFeedbackSignalsFromRun,
  loadFeedbackLedger,
  pendingToolBirthProposals,
} from "../src/feedback-ledger.mjs";
import { gateToolBirth, isCallable } from "../src/tool-birth.mjs";

test("normalizeProcedure collapses the same deterministic procedure across different inputs", () => {
  const x = normalizeProcedure({ verb: "research", targetType: "operator", args: { id: "X" } });
  const y = normalizeProcedure({ verb: "research", targetType: "operator", args: { id: "Y" } });
  assert.equal(x, y); // same procedure, different concrete operator
  assert.match(x, /^proc:/);
});

test("normalizeProcedure keeps distinct procedures distinct", () => {
  const research = normalizeProcedure({ verb: "research", targetType: "operator" });
  const score = normalizeProcedure({ verb: "score", targetType: "lead" });
  assert.notEqual(research, score);
});

test("judgment actions get a unique signature and never collapse", () => {
  const a = normalizeProcedure({ verb: "draft", draft: "Hi Mike, quick question." });
  const b = normalizeProcedure({ verb: "draft", draft: "Hi Dana, congrats." });
  assert.match(a, /^judgment:/);
  assert.notEqual(a, b); // two drafts never match -> never crystallize
  assert.equal(isJudgmentAction({ verb: "draft" }), true);
  assert.equal(isJudgmentAction({ verb: "research" }), false);
});

test("an explicit judgment verb cannot bypass the guard via a hand-set signature", () => {
  const sig = normalizeProcedure({ verb: "draft", signature: "proc:draft:email" });
  assert.match(sig, /^judgment:/);
});

test("detectCrystallizationCandidates surfaces deterministic procedures past the threshold", () => {
  const log = [
    { verb: "research", targetType: "operator", args: { id: "A" } },
    { verb: "research", targetType: "operator", args: { id: "B" } },
    { verb: "research", targetType: "operator", args: { id: "C" } },
    { verb: "score", targetType: "lead", args: { id: "A" } }, // only once
    { verb: "draft", draft: "one" }, // judgment, excluded
    { verb: "draft", draft: "two" },
    { verb: "draft", draft: "three" },
  ];
  const candidates = detectCrystallizationCandidates(log, { threshold: 3 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].count, 3);
  assert.match(candidates[0].signature, /research/);
  // The repeated drafting is judgment — it must NOT crystallize even though it recurred 3 times.
  assert.ok(!candidates.some((c) => /draft/.test(c.signature)));
});

test("threshold gates the candidate list", () => {
  const log = [
    { verb: "enrich", targetType: "company" },
    { verb: "enrich", targetType: "company" },
  ];
  assert.equal(detectCrystallizationCandidates(log, { threshold: 3 }).length, 0);
  assert.equal(detectCrystallizationCandidates(log, { threshold: 2 }).length, 1);
});

test("bare string actions are handled", () => {
  const log = ["research operator alpha", "research operator beta", "research operator gamma"];
  const candidates = detectCrystallizationCandidates(log, { threshold: 3 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].count, 3);
});

test("invalid input throws", () => {
  assert.throws(() => detectCrystallizationCandidates("nope"));
  assert.throws(() => detectCrystallizationCandidates([], { threshold: 0 }));
});

test("actionLogFromRun derives one action per executed step, skipping the wall and grounding", () => {
  const graph = {
    id: "g1",
    nodes: [
      { id: "src", category: "source", label: "Research operator" },
      { id: "ctx", category: "context", label: "Load product scan" },
      { id: "g", category: "gate", label: "Founder approval" },
      { id: "out", category: "execute", label: "Send message" },
    ],
  };
  const result = {
    nodes: {
      src: { category: "source", ok: true },
      ctx: { category: "context", ok: true },
      g: { category: "gate", ok: true },
      out: { category: "execute", blocked: true }, // never actually ran -> not an action
    },
  };
  const log = actionLogFromRun(graph, result);
  // Only the source step is a real, ran action; context/gate are skipped, the blocked execute is skipped.
  assert.equal(log.length, 1);
  assert.equal(log[0].name, "Research operator");
});

// The wired callsite: accumulated run history -> gated crystallization proposals, never auto-created.
function runWith(graph, result, options) {
  return recordFeedbackSignalsFromRun({ projectId: "crys-proj", graph, result }, options);
}

test("a repeated deterministic procedure across runs surfaces a gated crystallization proposal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-crys-"));
  const options = { root, projectId: "crys-proj" };
  const graph = {
    id: "g1",
    nodes: [{ id: "n1", category: "enrich", label: "Research operator" }],
  };
  // Three separate runs each execute the same deterministic "Research operator" step.
  let last;
  for (let i = 0; i < 3; i += 1) {
    last = runWith(graph, { runId: `run-${i}`, nodes: { n1: { category: "enrich", ok: true } } }, options);
  }
  assert.ok(Array.isArray(last.crystallizationSuggestions));
  assert.equal(last.crystallizationSuggestions.length, 1);
  const suggestion = last.crystallizationSuggestions[0];
  assert.equal(suggestion.count, 3);
  assert.match(suggestion.signature, /research/);
  assert.match(suggestion.reason, /crystalliz/i);
  fs.rmSync(root, { recursive: true, force: true });
});

test("judgment-only work across runs never surfaces a crystallization proposal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-crys-"));
  const options = { root, projectId: "crys-proj" };
  const graph = {
    id: "g2",
    nodes: [{ id: "n1", category: "generate", label: "Draft outreach message" }],
  };
  let last;
  for (let i = 0; i < 5; i += 1) {
    last = runWith(graph, { runId: `run-${i}`, nodes: { n1: { category: "generate", ok: true } } }, options);
  }
  // "Draft …" is judgment — excluded by signature design even though it recurred five times.
  assert.equal(last.crystallizationSuggestions.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("detection -> tool-birth: a repeated procedure yields a PENDING, gated toolBirthProposal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-crys-"));
  const options = { root, projectId: "birth-proj" };
  const graph = {
    id: "g1",
    nodes: [{ id: "n1", category: "enrich", label: "Research operator" }],
  };
  let last;
  for (let i = 0; i < 3; i += 1) {
    last = recordFeedbackSignalsFromRun(
      { projectId: "birth-proj", graph, result: { runId: `run-${i}`, nodes: { n1: { category: "enrich", ok: true } } } },
      options,
    );
  }
  // The chain detect -> propose now connects: the feedback result carries a pending proposal.
  assert.ok(Array.isArray(last.toolBirthProposals));
  assert.equal(last.toolBirthProposals.length, 1);
  const proposal = last.toolBirthProposals[0];
  assert.equal(proposal.status, "pending"); // gated, never auto-born
  assert.equal(proposal.provenance, "self-built");
  assert.match(proposal.signature, /research/);
  assert.equal(isCallable(proposal), false); // the wall: a pending proposal is never callable

  // Registration still requires an EXPLICIT approval call — and a codeless candidate cannot be
  // approved without authored code+test, so the founder gate stays sacred.
  assert.throws(() => gateToolBirth(proposal, "approve"), /authored code and a test/);

  fs.rmSync(root, { recursive: true, force: true });
});

test("pending tool-birth proposals are persisted durably and de-duplicated by signature", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-crys-"));
  const options = { root, projectId: "persist-proj" };
  const graph = {
    id: "g1",
    nodes: [{ id: "n1", category: "enrich", label: "Research operator" }],
  };
  // Five runs of the same procedure: detection keeps firing, but only ONE pending proposal is banked.
  let last;
  for (let i = 0; i < 5; i += 1) {
    last = recordFeedbackSignalsFromRun(
      { projectId: "persist-proj", graph, result: { runId: `run-${i}`, nodes: { n1: { category: "enrich", ok: true } } } },
      options,
    );
  }
  assert.equal(last.toolBirthProposals.length, 1); // de-duped across runs, not one per run

  // Survives a restart: a fresh load of the ledger from disk still carries the pending proposal.
  const reloaded = loadFeedbackLedger("persist-proj", options);
  const persisted = pendingToolBirthProposals(reloaded);
  assert.equal(persisted.length, 1);
  assert.match(persisted[0].signature, /research/);
  assert.equal(persisted[0].status, "pending");

  fs.rmSync(root, { recursive: true, force: true });
});

test("judgment-only work never produces a tool-birth proposal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-crys-"));
  const options = { root, projectId: "judg-proj" };
  const graph = {
    id: "g2",
    nodes: [{ id: "n1", category: "generate", label: "Draft outreach message" }],
  };
  let last;
  for (let i = 0; i < 5; i += 1) {
    last = recordFeedbackSignalsFromRun(
      { projectId: "judg-proj", graph, result: { runId: `run-${i}`, nodes: { n1: { category: "generate", ok: true } } } },
      options,
    );
  }
  assert.equal(last.crystallizationSuggestions.length, 0);
  assert.equal(last.toolBirthProposals.length, 0); // the rented head is never frozen into a tool
  fs.rmSync(root, { recursive: true, force: true });
});

test("detectCrystallizationSuggestions mirrors the proposal shape and excludes judgment", () => {
  const log = [
    { name: "score lead", targetType: "lead" },
    { name: "score lead", targetType: "lead" },
    { name: "score lead", targetType: "lead" },
    { name: "draft note", draft: "a" },
    { name: "draft note", draft: "b" },
    { name: "draft note", draft: "c" },
  ];
  const suggestions = detectCrystallizationSuggestions(log, { threshold: 3 });
  assert.equal(suggestions.length, 1);
  assert.match(suggestions[0].signature, /score/);
  assert.ok(suggestions[0].sample);
});
