// Candidate pipeline shapes for an AMBIGUOUS goal.
//
// compose_and_run composes ONE graph and drives it to the gate. But some goals do not point at one
// shape — "get more pest-control owners" could be an outbound pipeline, a content/community play, or a
// referral loop, and the founder, not the model, should choose which the product runs. This module is
// the one well-named place that turns such a goal into 2–3 candidate SHAPES the founder picks among.
//
// The split, per the harness: the MODEL does only the fuzzy work — judging whether the goal genuinely
// forks and sketching the distinct shapes. The HOST (code) does routing and safety — it normalizes each
// sketch into a valid graph and re-asserts the founder-gate wall on every candidate, so a candidate can
// never smuggle an ungated send. NOTHING here runs, sends, or builds: a candidate is a shape only, and a
// shape becomes work solely when the founder picks it (resolveOperatorCandidates → compose_and_run).
//
// There is NO hardcoded taxonomy — no closed list of channels. The model decides the fork freely from
// the real product and the goal; the examples in the prompt are illustrations, not an enum.

import { runClaudeQuery, parseAgentObject } from "./agent-bridge.mjs";
import { normalizeComposedGraph, assertGateWall } from "./workflow-composer.mjs";

// The candidate doctrine. Edit ~/.claude/agents/gtm-compose-workflow.md-style guidance in prose here;
// the instruction is a template string, not host logic. It reuses the same open node model the single
// composer uses, so a picked candidate rebuilds cleanly through the normal compose path.
export const COMPOSE_CANDIDATES_PROMPT = `You are deciding whether a go-to-market goal admits SEVERAL genuinely distinct pipeline shapes, and if so, sketching them for the founder to choose among. You may Read and Grep the repository.

First, judge ambiguity honestly. A goal is AMBIGUOUS only when it truly forks into distinct go-to-market approaches a founder would want to choose between — for example an outbound pipeline that finds and contacts owners directly, versus a content/community play that earns inbound, versus a referral loop through existing users. A goal that points at ONE obvious shape is NOT ambiguous; say so and return no candidates.

If the goal is ambiguous, design 2 or 3 candidate pipelines, each a DISTINCT shape (not three variants of the same outbound flow). Each candidate is a full graph in the open node model:
- context: { "category": "context", "connector": "product" }
- source:  { "category": "source", "connector": "manual" | "csv" | "api" }
- agent:   { "kind": "agent", "ref": "<agent-ref>" } — judgment/research/drafting
- skill:   { "kind": "skill", "ref": "<skill>" }
- code:    { "kind": "code", "ref": "<deterministic-transform>" }
- gate:    { "category": "gate", "connector": "default" }
- execute: { "category": "execute", "connector": "local" | "http" } — staged, never sends on its own
- measure: { "category": "measure", "connector": "default" }

THE WALL (non-negotiable): any execute node MUST sit downstream of a founder gate on every path. A research- or content-only candidate may have no execute node and needs no gate.

Return ONLY a JSON object:
{ "ambiguous": true|false,
  "candidates": [
    { "id": "kebab-id", "label": "Short human name for the shape", "rationale": "One plain sentence: what this pipeline does and who it reaches.",
      "nodes": [ ... ], "edges": [ { "source": "id", "target": "id", "edgeType": "data" } ] }
  ] }
When ambiguous is false, return "candidates": [].`;

function slugId(value, index) {
  const base = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || `candidate-${index + 1}`;
}

// The one well-named seam. Given the goal + grounding and an injected `compose` (the model), it decides
// ambiguity and returns normalized, wall-checked candidate shapes — WITHOUT persisting or running any of
// them. Empty/whitespace goal refuses (never weakens the blank-default-refuses invariant). A candidate
// that violates the founder-gate wall is dropped rather than surfaced, so every returned shape is safe to
// build. Fewer than two valid candidates collapses to "not ambiguous" — a fork needs at least two arms.
export async function composeCandidates({ goal, grounding = null, compose }) {
  const trimmed = String(goal ?? "").trim();
  if (!trimmed) throw new Error("Candidate composition needs a goal.");
  if (typeof compose !== "function") throw new Error("composeCandidates needs a compose function.");

  const decision = await compose({ goal: trimmed, grounding });
  if (decision?.ok === false) {
    throw new Error(decision.error === "blank"
      ? "Candidate composition is model-driven and needs a live Claude subscription. Sign in and try again."
      : `Candidate composition failed: ${decision.error}`);
  }

  const rawCandidates = Array.isArray(decision?.candidates) ? decision.candidates : [];
  const seenIds = new Set();
  const candidates = [];
  rawCandidates.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const { nodes, edges } = normalizeComposedGraph(raw);
    if (nodes.length === 0) return;
    // The wall, per candidate: a sketch with an execute node but no founder gate on every path is
    // dropped, never shown. Code guarantees it; the model is only asked to try.
    try {
      assertGateWall(nodes, edges);
    } catch {
      return;
    }
    let id = slugId(raw.id || raw.label, index);
    while (seenIds.has(id)) id = `${id}-${index + 1}`;
    seenIds.add(id);
    candidates.push({
      id,
      label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : `Candidate ${index + 1}`,
      rationale: typeof raw.rationale === "string" ? raw.rationale.trim() : "",
      nodes,
      edges,
    });
  });

  // A genuine fork needs at least two arms; the model saying "ambiguous" with one shape is not a fork.
  const ambiguous = decision?.ambiguous === true && candidates.length >= 2;
  return { ambiguous, candidates: ambiguous ? candidates.slice(0, 3) : [] };
}

// Live candidate composer: reads the repo on the founder's subscription and returns the ambiguity
// decision + candidate shapes. The host (composeCandidates) normalizes, enforces the wall, and drops
// anything unsafe. Mirrors createClaudeComposer's shape so the wiring is identical.
export function createClaudeCandidateComposer({ cwd = process.cwd(), model, maxTurns = 24, onText } = {}) {
  return async function compose({ goal, grounding }) {
    const prompt = [
      COMPOSE_CANDIDATES_PROMPT,
      `\nGoal:\n${goal || ""}`,
      `\nProduct grounding:\n${JSON.stringify(grounding ?? {}, null, 2)}`,
    ].join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText });
    if (error) return { ok: false, error: error.message };
    const parsed = parseAgentObject(text);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "Candidate composer did not return an { ambiguous, candidates } object." };
    }
    return {
      ok: true,
      ambiguous: parsed.ambiguous === true,
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
    };
  };
}
