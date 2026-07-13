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
import { runStore, resultStore } from "./gtm-store.mjs";
import {
  experimentStatement,
  normalizeOutcomeKind,
  outcomeCountsAsSuccess,
  outcomeMatchesTarget,
  outcomePolarity,
} from "./experiment-derivation.mjs";
import { now } from "./store-fs.mjs";

const VERDICT_DECISIONS = new Set(["keep", "kill", "double-down"]);

// ── Suggest a verdict from observed outcomes (PROPOSED, never auto-applied) ─────────────────────────
//
// A deterministic read over the outcome ledger that PROPOSES a verdict the founder may accept. It never
// writes: it returns a suggestion object with `autoApplied: false` always. Accepting the suggestion is a
// separate, explicit call to applyExperimentVerdict (provenance "derived") — the founder stays the only
// hand that sets a verdict. This is code, not a model call: it joins results back to the experiment and
// compares real observed counts against a structured/parsed threshold. No success is invented; with no
// signal it honestly proposes nothing.

// Singularize an outcome-kind word so "signups" in a criteria line matches the "signup" outcomeKind on a
// result. Narrow and deterministic — "ies"→"y", trailing "s" dropped, everything else unchanged.
function singular(word) {
  return normalizeOutcomeKind(word);
}

function pluralize(n, kind) {
  const k = String(kind ?? "").trim();
  if (n === 1) return `${n} ${k}`;
  if (k.endsWith("y")) return `${n} ${k.slice(0, -1)}ies`;
  return `${n} ${k}s`;
}

// Pull structured targets from the experiment or, failing that, from a free-text success-criteria line.
// A structured `successThreshold` ([{ outcomeKind, min }] or one object) is preferred and unambiguous.
// The free-text fallback is a CONSERVATIVE parse of "<number> <kind>" pairs (e.g. "3 signups", "at least
// 2 replies") — good enough to PROPOSE (the founder confirms), never to auto-declare success. Returns
// { source, criteriaText, targets } or null when nothing evaluable is present.
function resolveThreshold(experiment, criteriaText) {
  const structured = experiment?.successThreshold;
  const structuredList = Array.isArray(structured) ? structured : structured ? [structured] : [];
  const fromStructured = structuredList
    .map((t) => ({ outcomeKind: singular(t?.outcomeKind), min: Number(t?.min ?? t?.count ?? t?.value) }))
    .filter((t) => t.outcomeKind && Number.isFinite(t.min) && t.min > 0);
  if (fromStructured.length) {
    return { source: "experiment.successThreshold", criteriaText: criteriaText || null, targets: fromStructured };
  }
  const text = String(criteriaText ?? "").trim();
  if (!text) return null;
  const targets = [];
  const re = /(\d+)\s+([a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const min = Number(m[1]);
    const kind = singular(m[2]);
    if (Number.isFinite(min) && min > 0 && kind) targets.push({ outcomeKind: kind, min });
  }
  if (!targets.length) return null;
  return { source: "successCriteria", criteriaText: text, targets };
}

// The set of channel identifiers this experiment spans (top-level + every arm). Results and runs are
// matched against this set, so a single-channel derived experiment and a multi-arm stated grouping both
// resolve their outcomes.
function experimentChannelIds(experiment) {
  const ids = new Set();
  if (experiment?.channelId) ids.add(String(experiment.channelId));
  for (const arm of Array.isArray(experiment?.arms) ? experiment.arms : []) {
    if (arm?.channelId) ids.add(String(arm.channelId));
  }
  return ids;
}

// Gather the results that belong to an experiment, plus the staged/measured tallies. A result belongs if
// it joined (via a matching run's item joinKey) OR it directly carries a pathId/channel in the id set.
// This bridges the two id spaces (graph channelId vs gtm-store pathId) without inventing a link where
// none exists — no match yields an honest empty tally.
function gatherOutcomes(experiment, { projectId, options }) {
  const idSet = experimentChannelIds(experiment);
  const runs = runStore.list({ ...options, projectId });
  const ownRuns = runs.filter(
    (r) => idSet.has(String(r?.pathId ?? "")) || idSet.has(String(r?.id ?? "")),
  );
  const stagedJoinKeys = new Set();
  for (const run of ownRuns) {
    for (const item of Array.isArray(run?.items) ? run.items : []) {
      const key = String(item?.joinKey ?? "").trim();
      if (key) stagedJoinKeys.add(key);
    }
  }
  const allResults = resultStore.list({ ...options, projectId });
  const own = allResults.filter((r) => {
    const key = String(r?.joinKey ?? "").trim();
    if (key && stagedJoinKeys.has(key)) return true;
    if (r?.pathId && idSet.has(String(r.pathId))) return true;
    if (r?.channel && idSet.has(String(r.channel))) return true;
    return false;
  });

  const byKind = {};
  const byPolarity = { positive: 0, negative: 0, neutral: 0, unknown: 0 };
  const measuredKeys = new Set();
  for (const r of own) {
    const rawKind = String(r?.outcomeKind ?? "").trim();
    const kind = normalizeOutcomeKind(rawKind) || "unlabeled";
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    const polarity = outcomePolarity(rawKind);
    byPolarity[polarity] += 1;
    const key = String(r?.joinKey ?? "").trim();
    if (key) measuredKeys.add(key);
  }
  const staged = stagedJoinKeys.size;
  const measured = [...measuredKeys].filter((k) => stagedJoinKeys.has(k)).length;
  const unmeasured = Math.max(0, staged - measured);
  const total = own.length;
  return { own, byKind, byPolarity, total, staged, measured, unmeasured };
}

// Read the success-criteria text tied to this experiment's runs (the criteria lives on the measurement
// contract set BEFORE a run, not on the experiment). The experiment may also carry its own
// `successCriteria` string, which wins.
function criteriaTextForExperiment(experiment, { projectId, options }) {
  if (String(experiment?.successCriteria ?? "").trim()) return String(experiment.successCriteria).trim();
  const idSet = experimentChannelIds(experiment);
  const runs = runStore.list({ ...options, projectId });
  for (const run of runs) {
    if (!(idSet.has(String(run?.pathId ?? "")) || idSet.has(String(run?.id ?? "")))) continue;
    const text = String(run?.measurementContract?.successCriteria ?? "").trim();
    if (text) return text;
  }
  return null;
}

export function suggestVerdictFromOutcomes({ experimentId, projectId = "default" } = {}, options = {}) {
  if (!experimentId) throw new Error("suggestVerdictFromOutcomes requires an experimentId.");
  const opts = { ...options, projectId };
  const project = loadProject(opts);
  const experiments = Array.isArray(project.sharedContext?.experiments)
    ? project.sharedContext.experiments
    : [];
  const experiment = experiments.find((e) => e?.id === experimentId);
  if (!experiment) throw new Error(`Experiment not found: ${experimentId}`);

  const observed = gatherOutcomes(experiment, { projectId, options });
  const criteriaText = criteriaTextForExperiment(experiment, { projectId, options });
  const thresholdRaw = resolveThreshold(experiment, criteriaText);

  // Evaluate the threshold against observed counts (matching kinds after singularizing both sides).
  let threshold = null;
  if (thresholdRaw) {
    const targets = thresholdRaw.targets.map((t) => {
      // Exact canonical target matching, with the polarity wall: an ignored/objection/bounce receipt is
      // measurement, but it can never satisfy a success target or be promoted as a win.
      const seen = observed.own.filter((result) =>
        outcomeCountsAsSuccess(result?.outcomeKind, [t.outcomeKind])
        && outcomeMatchesTarget(result?.outcomeKind, t.outcomeKind)).length;
      return { outcomeKind: t.outcomeKind, min: t.min, observed: seen, met: seen >= t.min };
    });
    threshold = {
      source: thresholdRaw.source,
      criteriaText: thresholdRaw.criteriaText,
      targets,
      allMet: targets.every((t) => t.met),
    };
  }

  // The per-arm winner (only when unambiguous): the arm whose channel produced the most outcomes.
  const winningArmId = pickWinningArm(experiment, {
    projectId,
    options,
    targetKinds: thresholdRaw?.targets.map((target) => target.outcomeKind) ?? [],
  });

  // Decide the PROPOSAL. Conservative on kill: only when measurement is complete and the signal is clearly
  // negative. Never proposes when the read is inconclusive.
  const proposal = decideProposal({ observed, threshold, winningArmId });

  return {
    experimentId,
    projectId,
    // INVARIANT: this function proposes; it never applies. The founder's accept is a separate call.
    autoApplied: false,
    observed: {
      byKind: observed.byKind,
      total: observed.total,
      staged: observed.staged,
      measured: observed.measured,
      unmeasured: observed.unmeasured,
      byPolarity: observed.byPolarity,
    },
    threshold,
    proposal,
    message: proposalMessage({ observed, threshold, proposal }),
  };
}

// Per-arm outcome tally → the single dominant arm's id, or null when tied / no arms / no outcomes.
function pickWinningArm(experiment, { projectId, options, targetKinds = [] }) {
  const arms = Array.isArray(experiment?.arms) ? experiment.arms : [];
  if (arms.length < 1) return null;
  const results = resultStore.list({ ...options, projectId });
  const runs = runStore.list({ ...options, projectId });
  const counts = arms.map((arm) => {
    const armId = arm?.channelId ? String(arm.channelId) : null;
    if (!armId) return { id: arm?.id ?? null, n: 0 };
    const stagedKeys = new Set();
    for (const run of runs) {
      if (String(run?.pathId ?? "") !== armId && String(run?.id ?? "") !== armId) continue;
      for (const item of Array.isArray(run?.items) ? run.items : []) {
        const key = String(item?.joinKey ?? "").trim();
        if (key) stagedKeys.add(key);
      }
    }
    const n = results.filter((r) => {
      const key = String(r?.joinKey ?? "").trim();
      const belongs = (key && stagedKeys.has(key))
        || (r?.pathId && String(r.pathId) === armId)
        || (r?.channel && String(r.channel) === armId);
      return belongs && outcomeCountsAsSuccess(r?.outcomeKind, targetKinds);
    }).length;
    return { id: arm?.id ?? null, n };
  });
  const sorted = [...counts].sort((a, b) => b.n - a.n);
  if (sorted.length === 0 || sorted[0].n === 0) return null;
  if (sorted.length > 1 && sorted[1].n === sorted[0].n) return null; // tied — no confident winner
  return sorted[0].id;
}

function decideProposal({ observed, threshold, winningArmId }) {
  const provenance = "derived";
  if (threshold) {
    if (threshold.allMet) {
      return { decision: "keep", provenance, winningArmId, rationale: "Every success target is met." };
    }
    // Clearly negative: measurement is complete and a KNOWN negative came back. Unknown labels remain
    // inconclusive; open vocabulary is preserved rather than silently interpreted as failure.
    const anyTargetSignal = threshold.targets.some((t) => t.observed > 0);
    if (observed.staged > 0 && observed.unmeasured === 0 && observed.measured > 0
      && observed.byPolarity.negative > 0 && !anyTargetSignal) {
      return {
        decision: "kill",
        provenance,
        winningArmId: null,
        rationale: "Measurement is complete and only negative evidence reached the success targets.",
      };
    }
    return null; // inconclusive — still running, partially met, positive elsewhere, or honestly unknown
  }
  // No threshold: don't invent success from any arbitrary receipt. Known positives may support keep;
  // known negatives may support kill once fully measured; neutral/unknown evidence stays inconclusive.
  if (observed.byPolarity.positive > 0) {
    return { decision: "keep", provenance, winningArmId, rationale: "Positive market outcomes were observed." };
  }
  if (observed.staged > 0 && observed.unmeasured === 0 && observed.measured > 0
    && observed.byPolarity.negative > 0 && observed.byPolarity.unknown === 0) {
    return { decision: "kill", provenance, winningArmId: null, rationale: "Measurement completed with negative market outcomes." };
  }
  return null;
}

function proposalMessage({ observed, threshold, proposal }) {
  const observedText = Object.entries(observed.byKind)
    .filter(([kind]) => kind !== "unlabeled")
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => pluralize(n, kind))
    .join(", ");
  if (!proposal) {
    if (observed.total === 0) {
      return observed.staged > 0
        ? "No outcomes observed yet — nothing to suggest."
        : "Nothing staged for this experiment yet.";
    }
    return `${observedText || `${observed.total} observed`} so far — still inconclusive.`;
  }
  if (proposal.decision === "keep") {
    const lead = observedText || `${observed.total} observed`;
    return threshold ? `${lead} observed — meets the target. Keep?` : `${lead} observed — keep?`;
  }
  if (proposal.decision === "kill") {
    return "No success signal after full measurement — kill?";
  }
  return `${observedText} observed.`;
}

export function applyExperimentVerdict({ projectId, experimentId, verdict, decidedBy } = {}, options = {}) {
  if (!experimentId) throw new Error("applyExperimentVerdict requires an experimentId.");
  if (!verdict || !VERDICT_DECISIONS.has(verdict.decision)) {
    throw new Error('A verdict needs a decision of "keep", "kill", or "double-down".');
  }
  const opts = projectId ? { ...options, projectId } : options;
  const project = loadProject(opts);
  const experiments = Array.isArray(project.sharedContext?.experiments) ? project.sharedContext.experiments : [];
  const target = experiments.find((e) => e?.id === experimentId);
  if (!target) throw new Error(`Experiment not found: ${experimentId}`);

  // The founder's stamp. FIX 3: decidedBy is the AUTHENTICATED actor the caller derived from the founder
  // session — NEVER a caller-supplied body field. A verdict (especially a kill) is founder-only, so the
  // route authenticates the request and passes the resolved actor here; body.decidedBy is ignored. Absent
  // an explicit actor (a trusted in-process caller / test), it defaults to "founder".
  const stampedVerdict = {
    decision: verdict.decision,
    winningArmId: verdict.winningArmId ?? null,
    decidedAt: verdict.decidedAt ?? now(),
    decidedBy: decidedBy ?? "founder",
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
  const acceptedStatement = experimentStatement(target);
  if ((verdict.decision === "keep" || verdict.decision === "double-down") && acceptedStatement) {
    const text = acceptedStatement;
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
