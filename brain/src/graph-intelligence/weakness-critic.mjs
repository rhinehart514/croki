// weakness-critic.mjs — the WEAKNESS-SEVERITY critic (STEP 2b).
//
// What is deterministic here and what is judgment:
//   - DETECTION (does a node have sourced evidence, is a contract complete, does a path have a
//     measured_by edge) is legitimate graph-walking and stays in weakness.mjs. That is code.
//   - The SEVERITY numbers (weakness.mjs: `severity ? 80 : 50`, `severity === "high" ? 90 : 70`,
//     `Math.round((1 - completeness) * 100)`) and the frozen PRIMARY_WEAKNESS_PRECEDENCE kind order
//     are JUDGMENT that was hardcoded. How bad an "only founder evidence" weakness is versus a
//     "missing measurement contract" one — and which to surface first when a node has several — is a
//     taste call, not arithmetic. This module is where the model's judgment can replace those frozen
//     numbers.
//
// It mirrors path-portfolio.mjs's GRADE_PATH_PROMPT pattern EXACTLY: a SEPARATE, no-tools model call
// over an already-computed signal object handed in as data. It never re-detects anything, never reads
// the repo, and never invents a weakness — it only re-scores and re-orders the weaknesses detection
// already found. Consulting get_taste (rendered as data in the prompt) lets the founder's demonstrated
// priorities shape severity, so the numbers stop being frozen constants.
//
// SAFETY / SCOPE (deliberate): this critic is NOT wired into deriveWeaknessForGraph. The canvas still
// renders the hardcoded severity + precedence from weakness.mjs. Flipping the live render source to
// this critic is a DELIBERATE follow-up (see the deferred note at the bottom of this file): it makes
// the object-graph projection depend on a model call, which is a latency / UX decision about the
// canvas, not something to switch on silently inside a scoring change. This pass builds the critic and
// a parity harness so that flip can be made confidently later.

import { runClaudeQuery, parseAgentObject } from "../agent-bridge.mjs";
import { renderTasteProfile } from "../memory.mjs";
import { WEAKNESS_KINDS, PRIMARY_WEAKNESS_PRECEDENCE } from "./weakness.mjs";

// Lean, exactly like the path grader: no tools, a turn budget just big enough to emit one JSON reply.
// The critic reasons over the pre-computed signals handed in as data, it does not go detect anything.
const LEAN_TOOLS = [];
const LEAN_TURNS = 2;

// A severity is a number on 0..100 — bigger is more urgent, the same scale the hardcoded numbers use,
// so the critic is a drop-in replacement for them when the flip happens.
const SEVERITY_MIN = 0;
const SEVERITY_MAX = 100;

function clampSeverity(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  return Math.min(SEVERITY_MAX, Math.max(SEVERITY_MIN, Math.round(num)));
}

// ── The signal object the critic scores (pure projection, no model) ───────────────────────────────
// Flatten a weakness-annotated graph (the output of deriveWeaknessForGraph) into the flat list of
// signal objects the critic reasons over — one per open weakness, in a STABLE order (node order, then
// each node's weakness order). Each object carries exactly the signal the hardcoded severity was
// computed from, MINUS the severity itself: that is precisely the frozen judgment the critic replaces.
// The critic is handed { index, kind, statement, signal, threshold } and returns a severity for each.
export function extractWeaknessSignals(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const signals = [];
  let index = 0;
  for (const node of nodes) {
    const weaknesses = Array.isArray(node?.weaknesses) ? node.weaknesses : [];
    for (const weakness of weaknesses) {
      if (weakness?.status && weakness.status !== "open") continue;
      signals.push({
        index,
        weaknessId: weakness?.id ?? null,
        nodeId: node?.id ?? null,
        kind: weakness?.kind ?? null,
        statement: weakness?.statement ?? null,
        signal: weakness?.signal ?? {},
        threshold: weakness?.threshold ?? null,
        // The hardcoded number the critic is meant to replace — carried so the parity harness can
        // line the two up. NOT shown to the model (it would just anchor on it); stripped in the prompt.
        hardcodedSeverity: clampSeverity(weakness?.severity),
      });
      index += 1;
    }
  }
  return signals;
}

// The distinct weakness KINDS present in a signal list, in first-appearance order — the set the
// critic's precedence ordering must be a permutation of.
export function kindsPresent(signals = []) {
  const seen = [];
  for (const s of signals) {
    if (s?.kind && !seen.includes(s.kind)) seen.push(s.kind);
  }
  return seen;
}

// ── The rented critic (a lean prompt, mirroring GRADE_PATH_PROMPT) ────────────────────────────────

export const GRADE_WEAKNESS_SEVERITY_PROMPT = `You are a SEPARATE critic scoring how URGENT each already-detected weakness in a go-to-market graph is (you did not detect them — deterministic code walked the graph and found them). You do NOT decide WHETHER a weakness exists; that is settled. Your ONE job: given the signal each weakness was detected from, assign its SEVERITY and rank which KINDS of weakness matter most for this founder.

Severity is a number 0-100 — higher means more urgent to fix before this bet runs. Judge it from the signal, not a fixed rule: a claim with zero sourced evidence and speculative solidity is more urgent than one that is merely founder-only; a measurement contract missing every quarter is more urgent than one missing one; a scan-flagged high-severity gap is near the top. Weigh what the founder has shown they care about (their taste, below) — if their past gate decisions lean on proof or on measurement, let that raise those kinds.

The weaknesses are given as a numbered list, each with its "index", "kind", the "signal" it was detected from, and the "threshold" rule that fired it. Return a severity for EVERY index.

Also return "precedence": the distinct weakness KINDS present, ordered MOST-urgent-kind first — this replaces a frozen kind order and decides which single weakness leads when a node has several.

Return ONLY JSON: { "severities": [ { "index": 0, "kind": "evidence", "severity": 80 } ], "precedence": ["measurement", "evidence"] }`;

// Render the signal list for the prompt WITHOUT the hardcoded severity (so the model judges the
// signal, never anchors on the frozen number it is replacing).
function renderSignalsForPrompt(signals) {
  return signals.map((s) => ({
    index: s.index,
    kind: s.kind,
    statement: s.statement,
    signal: s.signal,
    threshold: s.threshold,
  }));
}

// Live weakness-severity critic — the SEPARATE critic, run ONCE over the whole set of detected
// weaknesses. Lean, no tools. Consults get_taste by folding the rendered taste profile into the
// prompt as data (the founder's demonstrated priorities), exactly as the draft path renders taste.
// Returns { severities: [{ index, kind, severity }], precedence: [...kinds], criticAvailable }.
// runQuery is injectable so the wrapper's parsing can be tested without a live model.
export function createClaudeWeaknessCritic({
  cwd = process.cwd(),
  model,
  maxTurns = LEAN_TURNS,
  onText,
  runQuery = runClaudeQuery,
} = {}) {
  return async function grade({ signals = [], tasteProfile = null } = {}) {
    if (!Array.isArray(signals) || !signals.length) {
      return { severities: [], precedence: [], criticAvailable: false };
    }
    const tasteBlock = renderTasteProfile(tasteProfile);
    const prompt = [
      GRADE_WEAKNESS_SEVERITY_PROMPT,
      `\nThe weaknesses to score (score every one, in order):\n${JSON.stringify(renderSignalsForPrompt(signals), null, 2)}`,
      tasteBlock ? `\nWhat the founder has taught you so far (weigh this):\n${tasteBlock}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const { text, error } = await runQuery({ prompt, cwd, model, maxTurns, onText, allowedTools: LEAN_TOOLS });
    if (error) return { severities: [], precedence: [], criticAvailable: false };
    const parsed = parseAgentObject(text) ?? {};
    const severities = Array.isArray(parsed?.severities)
      ? parsed.severities
          .map((s) => ({ index: Number(s?.index), kind: s?.kind ?? null, severity: clampSeverity(s?.severity) }))
          .filter((s) => Number.isInteger(s.index) && s.severity != null)
      : [];
    const precedence = Array.isArray(parsed?.precedence)
      ? parsed.precedence.map((k) => String(k ?? "").trim()).filter(Boolean)
      : [];
    return { severities, precedence, criticAvailable: true };
  };
}

// Honest blank default: with no critic wired, score nothing rather than fake a number.
export const blankGradeWeakness = async () => ({ severities: [], precedence: [], criticAvailable: false });

// ── The parity harness (pure code — no model) ─────────────────────────────────────────────────────
// Runs BOTH the hardcoded path (the severities/precedence already frozen in weakness.mjs, read off
// the detected weaknesses) and the critic path over the same signal objects, and reports whether the
// critic's output is well-formed and reasonable. This is what lets the flip to the critic be made
// confidently later: the harness proves the critic returns a drop-in-shaped result before anyone
// switches the live render source to it.

// The hardcoded severities + precedence, read straight off a weakness-annotated graph. This is the
// LIVE source the canvas renders today; the harness compares the critic against it.
export function hardcodedSeverityBaseline(signals = []) {
  return {
    severities: signals.map((s) => ({ index: s.index, kind: s.kind, severity: s.hardcodedSeverity })),
    // The frozen kind order, filtered to the kinds actually present (most-urgent kind first).
    precedence: PRIMARY_WEAKNESS_PRECEDENCE.filter((kind) => kindsPresent(signals).includes(kind)),
  };
}

// Validate that a critic result is WELL-FORMED against the signals it scored:
//   - every signal index has a severity, each an integer on 0..100;
//   - no severity for an index that was not scored;
//   - precedence is a permutation of the distinct kinds present (no missing, no extras, no dupes).
// Returns { ok, problems: [] } — pure, so a test asserts on it deterministically.
export function validateCriticSeverity(result, signals = []) {
  const problems = [];
  const severities = Array.isArray(result?.severities) ? result.severities : [];
  const wantIndexes = new Set(signals.map((s) => s.index));
  const gotIndexes = new Set();

  for (const s of severities) {
    if (!wantIndexes.has(s.index)) {
      problems.push(`severity for unknown index ${s.index}`);
      continue;
    }
    if (gotIndexes.has(s.index)) problems.push(`duplicate severity for index ${s.index}`);
    gotIndexes.add(s.index);
    if (!Number.isInteger(s.severity) || s.severity < SEVERITY_MIN || s.severity > SEVERITY_MAX) {
      problems.push(`severity for index ${s.index} out of range: ${s.severity}`);
    }
  }
  for (const idx of wantIndexes) {
    if (!gotIndexes.has(idx)) problems.push(`missing severity for index ${idx}`);
  }

  const present = kindsPresent(signals);
  const precedence = Array.isArray(result?.precedence) ? result.precedence : [];
  const precSet = new Set(precedence);
  if (precedence.length !== precSet.size) problems.push("precedence has duplicate kinds");
  for (const kind of present) {
    if (!precSet.has(kind)) problems.push(`precedence missing present kind: ${kind}`);
  }
  for (const kind of precedence) {
    if (!present.includes(kind)) problems.push(`precedence contains absent kind: ${kind}`);
    if (kind && !WEAKNESS_KINDS.includes(kind)) problems.push(`precedence contains unknown kind: ${kind}`);
  }

  return { ok: problems.length === 0, problems };
}

// Run both paths and hand back a comparison. `grade` is the critic (live or a stub in tests). Returns
// the hardcoded baseline, the critic result, whether the critic is well-formed, and — for each scored
// index — both severities side by side, so a reviewer (or a test) can eyeball the drop-in before the
// flip. Pure orchestration; the only judgment is inside the injected critic.
export async function runWeaknessSeverityParity({ signals = [], grade = blankGradeWeakness, tasteProfile = null } = {}) {
  const hardcoded = hardcodedSeverityBaseline(signals);
  const critic = await grade({ signals, tasteProfile });
  const validation = validateCriticSeverity(critic, signals);
  const bySignalIndex = new Map(signals.map((s) => [s.index, s]));
  const criticByIndex = new Map((critic?.severities ?? []).map((s) => [s.index, s.severity]));
  const comparison = signals.map((s) => ({
    index: s.index,
    kind: s.kind,
    hardcoded: bySignalIndex.get(s.index)?.hardcodedSeverity ?? null,
    critic: criticByIndex.has(s.index) ? criticByIndex.get(s.index) : null,
  }));
  return { hardcoded, critic, validation, comparison };
}

// DEFERRED (deliberate follow-up, not this pass): flip deriveWeaknessForGraph's render source from the
// hardcoded severity/precedence in weakness.mjs to this critic. Doing so makes the object-graph
// projection depend on a live model call — a latency and UX decision about the canvas (the weakness
// pills and the lit strongest path would wait on the critic, or need a cached/async path), not a
// scoring change to switch on silently. Ship that flip only once the canvas has an async/cached story.
