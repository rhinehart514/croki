// Soul wiring — the bridge that fills a teammate's soul from REAL runs, and reads it back at draft time.
//
// teammate-soul.mjs is the pure model and teammate-soul-store.mjs is its disk; both are agnostic about
// WHERE an observation comes from. This module is the only place that knows the run shape, so it holds
// the three real-signal seams and nothing else:
//   1. A founder gate decision (approve / reject / edit) on an item a teammate PRODUCED becomes a scratch
//      learning for that teammate. The decisions come from memory.mjs's existing per-agent extractor —
//      never a new one — so "what the founder decided" is defined in exactly one place.
//   2. A real outcome (a reply, a win) that joins back to an item a teammate produced bumps that
//      teammate's track record and banks a world learning capturing what landed.
//   3. The promoted (founder-blessed) lessons a teammate has earned, read back so a draft starts from
//      its permanent soul, not a blank slate.
//
// Hard invariant: REAL SIGNALS ONLY. Every learning here traces to a founder gate decision or a joined
// outcome — nothing is seeded, defaulted, or invented. A teammate with no signal gets no learning.

import { extractDecisionsForAgent } from "./memory.mjs";
import { patternKeyFor } from "./teammate-soul.mjs";
import { teammateSoulStore } from "./teammate-soul-store.mjs";

// Which teammates produced a reviewable item in this run's gate nodes. An item carries agentRef only
// when an agent step stamped it (graph.mjs stampAgentRef), so an unstamped item teaches no soul.
function agentRefsInResult(result) {
  const refs = new Set();
  const nodes = result?.nodes ?? {};
  for (const node of Object.values(nodes)) {
    if (node?.category !== "gate" || !Array.isArray(node.items)) continue;
    for (const item of node.items) {
      if (item?.agentRef) refs.add(item.agentRef);
    }
  }
  return [...refs];
}

// Turn one run's founder gate decisions into scratch learnings on the teammate that produced each item.
// Sourced from extractDecisionsForAgent (memory.mjs) — the SAME extractor the agent face already uses —
// so this never invents a second notion of "what the founder decided". Deterministic: no model call.
//
// patternKey derivation (the recurrence key that lets "the same correction, again" cluster into one
// graduating lesson): an edit keys on the corrected wording (the aspect the founder pushed the draft
// toward); a rejection and a clean approval key on the draft itself. These are the honest deterministic
// fallbacks — clustering the exact text — since no structured "aspect" or "reason" field exists to key
// on. taskId is the run id, so the "2 distinct tasks" gate means "the same correction across 2 runs".
//
// Returns the list of { ref, patternKey, source } observations recorded (for logging/tests). Never
// throws on a store hiccup at the caller's boundary — the caller wraps this best-effort.
export function recordGateDecisionsIntoSouls({ projectId = "default", result, templateRef = null } = {}, options = {}) {
  const recorded = [];
  if (!result) return recorded;
  const taskId = result.runId ?? result.originRunId ?? null;
  const runs = [{ result }]; // synthetic single-run ledger for the existing extractor

  for (const ref of agentRefsInResult(result)) {
    const { approved, rejected, edits } = extractDecisionsForAgent(runs, ref, { limit: Infinity });

    // An edited item also appears in `approved` (with its corrected text) — dedupe so one correction is
    // one occurrence, not two, in a single run.
    const editedTexts = new Set(edits.map((e) => String(e.to || "")));

    for (const edit of edits) {
      const to = String(edit.to || "").trim();
      const from = String(edit.from || "").trim();
      if (!to) continue;
      const obs = {
        patternKey: patternKeyFor(to),
        text: from ? `You changed "${from}" to "${to}".` : `You edited a draft to: "${to}".`,
        why: "A correction you made at the gate.",
        source: "gate",
        taskId,
      };
      teammateSoulStore.record(projectId, ref, obs, { templateRef }, options);
      recorded.push({ ref, patternKey: obs.patternKey, source: "gate" });
    }

    for (const rej of rejected) {
      const draft = String(rej.draft || "").trim();
      if (!draft) continue;
      const obs = {
        patternKey: patternKeyFor(draft),
        text: `You rejected: "${draft}".`,
        why: "A draft you turned down at the gate.",
        source: "gate",
        taskId,
      };
      teammateSoulStore.record(projectId, ref, obs, { templateRef }, options);
      recorded.push({ ref, patternKey: obs.patternKey, source: "gate" });
    }

    for (const app of approved) {
      const draft = String(app.draft || "").trim();
      if (!draft || editedTexts.has(draft)) continue; // an edited item is a correction, not a clean pass
      const obs = {
        patternKey: patternKeyFor(draft),
        text: `You approved as written: "${draft}".`,
        why: "A draft you approved at the gate without changes.",
        source: "gate",
        taskId,
      };
      teammateSoulStore.record(projectId, ref, obs, { templateRef }, options);
      recorded.push({ ref, patternKey: obs.patternKey, source: "gate" });
    }
  }
  return recorded;
}

// Map a real outcome kind to the track-record counter it bumps. Only a reply or a win — the two real
// world signals the task recognizes. Anything else (an open, a click) is not a reply/win, so it bumps
// nothing and banks no learning: no fabricated success. Open-string match, never a closed enum.
function outcomePatch(outcomeKind) {
  const kind = String(outcomeKind || "").toLowerCase();
  if (/\b(repl|respond|answer)/.test(kind)) return { patch: { replies: 1 }, verb: "reply" };
  if (/\b(win|won|convert|conversion|custom|paid|purchase|sign\s*up|signup|deal|closed|subscrib)/.test(kind)) {
    return { patch: { wins: 1 }, verb: "win" };
  }
  return null;
}

// Fold one real, joined outcome into the teammate's soul: bump its track record and bank a world
// learning capturing what landed. Only called for an outcome that joined back to an item carrying an
// agentRef, so the signal is real and attributable. Returns what was recorded, or null when the outcome
// is neither a reply nor a win (nothing to learn, nothing bumped).
export function recordOutcomeIntoSoul({ projectId = "default", agentRef, outcomeKind, message = null, taskId = null, templateRef = null } = {}, options = {}) {
  if (!agentRef) return null;
  const mapped = outcomePatch(outcomeKind);
  if (!mapped) return null;

  teammateSoulStore.recordOutcome(projectId, agentRef, mapped.patch, { templateRef }, options);

  const msg = String(message || "").trim();
  const obs = {
    patternKey: patternKeyFor(msg || String(outcomeKind)),
    text: msg
      ? `A ${mapped.verb} came back on: "${msg}".`
      : `A ${mapped.verb} came back on your work.`,
    why: "A real result from the world.",
    source: "world",
    taskId,
  };
  teammateSoulStore.record(projectId, agentRef, obs, { templateRef }, options);
  return { ref: agentRef, patch: mapped.patch, patternKey: obs.patternKey };
}

// The teammate's PROMOTED (founder-blessed) lessons — the permanent soul that loads on every future
// run. Read back for the taste path so a draft starts from what the teammate has earned. Returns a
// plain [{ text, why }] list, or [] when the teammate has no soul yet (so the read stays additive:
// no promoted lesson => the taste read behaves exactly as before).
export function promotedSoulLessons(projectId, agentRef, options = {}, store = teammateSoulStore) {
  if (!projectId || !agentRef) return [];
  const soul = store.get(projectId, agentRef, options);
  const entries = Array.isArray(soul?.soul) ? soul.soul : [];
  return entries
    .map((e) => ({ text: String(e?.text || "").trim(), why: String(e?.why || "").trim() }))
    .filter((e) => e.text);
}
