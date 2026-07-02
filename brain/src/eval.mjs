// The answer key — eval-first composition and run grading.
//
// The IDE used to compose a channel graph from the goal and run it, with no written notion of
// what a passing run looks like. So it could not tell a good run from a merely plausible one.
// This module gives a composed channel a small eval (a handful of binary checks: "what does a
// passing run produce?"), stored on the graph, and grades a finished run against it — oracle
// first (deterministic checks in code), then the SAME crucible/bin/grade.mjs binary the global
// rig uses, so neither rig reimplements scoring.
//
// Contract: ~/.agents/global/HARNESS.md, invariants 1 (eval-first) and 5 (oracle first, judge
// second). Injectable like composition.mjs: a fake evaluator in tests,
// createClaudeEvaluator() live on the subscription, an honest blank default that derives nothing.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runClaudeQuery, parseAgentObject } from "./agent-bridge.mjs";
import { itemReviewText } from "./memory.mjs";

// The shared grader both rigs call. Configurable so a machine without the crucible skill, or a
// test, can point elsewhere; resilient when absent (gradeRun then reports oracle-only).
export function gradePath() {
  return process.env.CRUCIBLE_GRADE_PATH
    || path.join(os.homedir(), ".claude", "skills", "crucible", "bin", "grade.mjs");
}

// The eval-derivation doctrine, passed to the evaluator agent.
export const EVAL_PROMPT = `You are writing the EVAL for one go-to-market channel: the small, concrete test of what a PASSING run of this channel must produce, BEFORE the work runs. The eval is the channel's answer key — it is how the system later tells a good run from a plausible one.

You are given the channel's goal, its composed steps, and the product grounding.

Write 3 to 6 checks. Each check is one binary, observable thing a passing run produces — not a vibe. Prefer checks a machine can verify from the run result. Use these kinds where they fit:
- "reached_gate": the run reached a founder gate with at least one item to review.
- "min_items": at least N items reached the gate. Include "n".
- "has_field": every gated item carries a non-empty field. Include "field" (e.g. "draft", "personalFact").
- "approved": at least one item was approved at the gate.
- "judgment": a quality bar a machine cannot check (e.g. "the opener names a specific, true fact about the person"). Use sparingly; these are graded by the founder, not in code.

Return ONLY JSON: { "checks": [ { "id": "kebab-id", "kind": "reached_gate|min_items|has_field|approved|judgment", "label": "plain sentence", "n": 1, "field": "draft" } ] }
Include "n" only for min_items, "field" only for has_field. Keep labels plain and specific to THIS channel.`;

// Live evaluator: reads the repo on the founder's subscription, returns { ok, checks }.
export function createClaudeEvaluator({ cwd = process.cwd(), model, maxTurns = 12, onText } = {}) {
  return async function evaluate({ goal, channel, agents, grounding }) {
    const prompt = [
      EVAL_PROMPT,
      `\nChannel goal:\n${goal || channel?.objective || ""}`,
      `\nComposed steps:\n${JSON.stringify(agents ?? [], null, 2)}`,
      `\nProduct grounding:\n${JSON.stringify(grounding ?? {}, null, 2)}`,
    ].join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText });
    if (error) return { ok: false, error: error.message };
    const parsed = parseAgentObject(text);
    if (!parsed || !Array.isArray(parsed.checks)) return { ok: false, error: "Evaluator did not return { checks }." };
    return { ok: true, checks: parsed.checks };
  };
}

// Honest blank default: with no evaluator wired, derive nothing rather than fake an answer key.
const blankEvaluate = async () => ({ ok: false, error: "blank", checks: [] });

const CHECK_KINDS = new Set(["reached_gate", "min_items", "has_field", "approved", "judgment"]);

// Normalize a model's checks into a stored eval. Drops malformed checks; returns null when there
// is nothing usable, so composition is unaffected when no evaluator is wired.
function normalizeChecks(rawChecks) {
  const checks = [];
  const usedIds = new Set();
  for (const raw of Array.isArray(rawChecks) ? rawChecks : []) {
    if (!raw || typeof raw !== "object") continue;
    if (!CHECK_KINDS.has(raw.kind)) continue;
    let id = String(raw.id || raw.kind || "check").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "check";
    while (usedIds.has(id)) id = `${id}-${checks.length + 1}`;
    usedIds.add(id);
    const check = { id, kind: raw.kind, label: typeof raw.label === "string" ? raw.label : raw.kind };
    if (raw.kind === "min_items") check.n = Number.isFinite(raw.n) && raw.n > 0 ? Math.floor(raw.n) : 1;
    if (raw.kind === "has_field") check.field = typeof raw.field === "string" && raw.field ? raw.field : "draft";
    checks.push(check);
  }
  return checks.length ? checks : null;
}

// Derive a channel's eval at compose time. Injectable; returns the stored eval object or null.
export async function deriveChannelEval({ goal, channel, agents = [], grounding = null, evaluate = blankEvaluate } = {}) {
  const out = await evaluate({ goal: goal || channel?.objective, channel, agents, grounding });
  if (!out || out.ok === false) return null;
  const checks = normalizeChecks(out.checks);
  if (!checks) return null;
  return { checks, derivedAt: new Date().toISOString() };
}

// ── Run grading (oracle first) ────────────────────────────────────────────────

function gateNodes(result) {
  return Object.entries(result?.nodes ?? {})
    .filter(([, n]) => n?.category === "gate")
    .map(([id, n]) => ({ id, items: Array.isArray(n.items) ? n.items : [] }));
}

// Open content: shared with memory/gate-pattern, so grading recognizes a staged post, note, or
// page — whatever field names composition chose — not just outreach draft aliases.
function itemText(item) {
  return itemReviewText(item);
}

// Every execute node sits behind a gate on every path (the wall, checked at run time too). Returns
// true when there are no execute nodes (a research/code channel needs no gate).
function executeBehindGate(graph) {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const executes = nodes.filter((n) => n.category === "execute");
  if (!executes.length) return true;
  const gates = new Set(nodes.filter((n) => n.category === "gate").map((n) => n.id));
  if (!gates.size) return false;
  const incoming = new Map();
  for (const edge of edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target).push(edge.source);
  }
  return executes.every((exec) => {
    const seen = new Set();
    const stack = [...(incoming.get(exec.id) ?? [])];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      if (gates.has(id)) return true;
      stack.push(...(incoming.get(id) ?? []));
    }
    return false;
  });
}

// The oracle tier: deterministic checks over the graph + run result. Returns each eval check's
// machine verdict (judgment-kind checks are left "pending" for the founder), plus structural
// checks, and an axes object for the grader. Pure — no model, no I/O.
export function checkRun({ graph = {}, result = {} } = {}) {
  const gates = gateNodes(result);
  const allItems = gates.flatMap((g) => g.items);
  const reachedGate = gates.length > 0 && (allItems.length > 0 || (result.pendingGates ?? []).length > 0);
  const approvedCount = allItems.filter((i) => i?.approvalStatus === "approved").length;
  const withText = allItems.filter((i) => itemText(i)).length;

  const structural = [
    { id: "reached-gate", kind: "reached_gate", pass: reachedGate, note: `${allItems.length} item(s) at ${gates.length} gate(s)` },
    { id: "gate-wall", kind: "gate_wall", pass: executeBehindGate(graph), note: "every execute behind a gate" },
    { id: "emitted-content", kind: "has_field", pass: allItems.length === 0 ? false : withText === allItems.length, note: `${withText}/${allItems.length} items carry content` },
  ];

  const evalChecks = (graph?.eval?.checks ?? []).map((check) => {
    if (check.kind === "judgment") return { ...check, pass: null, note: "founder-judged, not machine-checkable" };
    let pass = false;
    let note = "";
    if (check.kind === "reached_gate") { pass = reachedGate; note = `${allItems.length} item(s)`; }
    else if (check.kind === "min_items") { pass = allItems.length >= (check.n ?? 1); note = `${allItems.length} >= ${check.n ?? 1}`; }
    else if (check.kind === "approved") { pass = approvedCount > 0; note = `${approvedCount} approved`; }
    else if (check.kind === "has_field") {
      const field = check.field || "draft";
      const have = allItems.filter((i) => {
        const v = field === "draft" ? itemText(i) : i?.[field];
        return typeof v === "string" ? v.trim() : v != null && v !== "";
      }).length;
      pass = allItems.length > 0 && have === allItems.length;
      note = `${have}/${allItems.length} carry "${field}"`;
    }
    return { ...check, pass, note };
  });

  const machineChecks = evalChecks.filter((c) => c.pass !== null);
  const evalCoverage = machineChecks.length ? machineChecks.filter((c) => c.pass).length / machineChecks.length : null;

  const axes = {
    reached_gate: reachedGate ? 10 : 0,
    gate_wall: structural[1].pass ? 10 : 0,
    contract_emitted: structural[2].pass ? 10 : 0,
    approved: approvedCount > 0 ? 10 : 0,
  };
  if (evalCoverage !== null) axes.eval_coverage = Math.round(evalCoverage * 100) / 10;

  return { structural, evalChecks, axes, reachedGate, approvedCount };
}

const RUN_WEIGHTS = { reached_gate: 2, gate_wall: 2, contract_emitted: 1.5, approved: 1.5, eval_coverage: 3 };

// Grade a finished run: oracle checks, then the shared grade.mjs for the gate-aware number. The
// grade is injectable for tests; by default it shells out to the real crucible binary. Resilient:
// if the binary is absent, returns oracle-only with graderAvailable=false.
export function gradeRun({ graph = {}, result = {} } = {}, { grade } = {}) {
  const oracle = checkRun({ graph, result });
  const runGrade = grade || defaultGrade;
  const graded = runGrade({ axes: oracle.axes, weights: RUN_WEIGHTS });
  return {
    overall: graded?.overall ?? null,
    verdict: graded?.verdict ?? null,
    graderAvailable: graded?.graderAvailable !== false,
    axes: oracle.axes,
    structural: oracle.structural,
    evalChecks: oracle.evalChecks,
  };
}

// Default grader: shell out to the one shared grade.mjs binary (HARNESS.md: one grader, both rigs).
function defaultGrade({ axes, weights }) {
  const bin = gradePath();
  if (!fs.existsSync(bin)) return { overall: null, verdict: null, graderAvailable: false };
  const proc = spawnSync(process.execPath, [bin, JSON.stringify({ axes, weights })], { encoding: "utf8" });
  if (proc.status !== 0 || !proc.stdout) return { overall: null, verdict: null, graderAvailable: false };
  try {
    const out = JSON.parse(proc.stdout);
    return { overall: out.overall ?? null, verdict: out.verdict ?? null, shape: out.shape, graderAvailable: true };
  } catch {
    return { overall: null, verdict: null, graderAvailable: false };
  }
}
