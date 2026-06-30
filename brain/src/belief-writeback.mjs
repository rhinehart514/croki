// Belief write-back — the founder resolves an experiment, and that decision updates the belief.
//
// STRICTLY POST-GATE. This is never a precondition for a run: a run reaches the founder gate on
// whatever it produced (relaxPreGateContracts), the founder reviews it, and ONLY THEN may the founder
// resolve the experiment with a verdict. Nothing here gates, blocks, or triggers a run.
//
// A verdict is the founder's own decision (decision + winningArmId + decidedAt + decidedBy) and is the
// ONLY hand that may set `experiment.verdict` — the run-completion deriver omits it on purpose, so a
// re-run can never clobber it (experiment-derivation.mjs). A keep / double-down verdict crystallizes
// the experiment's hypothesis into a structured Claim — a belief the founder has now backed. That claim
// is written through the EXISTING updateSharedContext, so normalizeClaimProvenance stamps its
// provenance for free: an evidence-free derived belief self-demotes to "speculative" (the one-way truth
// valve), and the founder never has to think about it.

import { loadProject, updateSharedContext } from "./project-store.mjs";

function now() {
  return new Date().toISOString();
}

const VERDICT_DECISIONS = new Set(["keep", "kill", "double-down"]);

export function applyExperimentVerdict({ projectId, experimentId, verdict } = {}, options = {}) {
  if (!experimentId) throw new Error("applyExperimentVerdict requires an experimentId.");
  if (!verdict || !VERDICT_DECISIONS.has(verdict.decision)) {
    throw new Error('A verdict needs a decision of "keep", "kill", or "double-down".');
  }
  const opts = projectId ? { ...options, projectId } : options;
  const project = loadProject(opts);
  const experiments = Array.isArray(project.sharedContext?.experiments) ? project.sharedContext.experiments : [];
  const target = experiments.find((e) => e?.id === experimentId);
  if (!target) throw new Error(`Experiment not found: ${experimentId}`);

  // The founder's stamp. decidedBy defaults to "founder" because only the founder may set a verdict.
  const stampedVerdict = {
    decision: verdict.decision,
    winningArmId: verdict.winningArmId ?? null,
    decidedAt: verdict.decidedAt ?? now(),
    decidedBy: verdict.decidedBy ?? "founder",
  };

  const nextExperiments = experiments.map((e) =>
    e?.id === experimentId
      ? {
          ...e,
          verdict: stampedVerdict,
          origin: e.origin ?? "derived",
          updates: verdict.updates ?? e.updates,
        }
      : e,
  );

  const patch = { experiments: nextExperiments };

  // A kept (or doubled-down) belief becomes a durable claim. Provenance is whatever the verdict carries,
  // defaulting to "derived" so the truth valve in updateSharedContext applies: with real evidence it
  // stays "derived"; with none it self-demotes to "speculative". A founder may pass provenance:"founder"
  // to assert it outright (never demoted).
  if ((verdict.decision === "keep" || verdict.decision === "double-down") && String(target.hypothesis ?? "").trim()) {
    const text = String(target.hypothesis).trim();
    const claims = Array.isArray(project.sharedContext?.claims) ? [...project.sharedContext.claims] : [];
    if (!claims.some((c) => (typeof c === "string" ? c : c?.text) === text)) {
      claims.push({
        text,
        provenance: verdict.provenance ?? "derived",
        evidence: Array.isArray(verdict.evidence) ? verdict.evidence : [],
      });
    }
    patch.claims = claims;
  }

  return updateSharedContext(patch, opts);
}
