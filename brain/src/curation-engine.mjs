// The Strategist's derivation layer — it reads real run state and proposes gated curation moves.
//
// Three detectors, each turning derived facts into a raw finding ({ type, signature, subject, reason,
// evidence }) that curation-store wraps into a PENDING, founder-gated proposal. Nothing here mutates a
// graph or sends; it only observes and proposes. The detectors are heuristic, so each carries a sample
// floor and the founder gates every result — a noisy proposal costs a dismissal, never an action.
//
// Shipped first: the cross-channel CONFLICT detector, because it is unambiguous and fully derivable
// today from the Person index (dedupeAcrossChannels). The dead-branch and spine-promotion detectors
// build on the run-ledger volume derivation and land next.

import { dedupeAcrossChannels } from "./cross-reference.mjs";

// Keep only entrants seen within the window, when they carry a timestamp. Items with no timestamp are
// kept (we can't prove them stale); this stays honest rather than silently dropping real entrants.
function withinWindow(entrants, { now, windowDays }) {
  if (!now || !Number.isFinite(windowDays)) return entrants;
  const floor = new Date(now).getTime() - windowDays * 24 * 60 * 60 * 1000;
  return entrants.filter((item) => {
    const stamp = item?.at ?? item?.seenAt ?? item?.lastSeenAt ?? null;
    if (!stamp) return true;
    const t = new Date(stamp).getTime();
    return Number.isNaN(t) ? true : t >= floor;
  });
}

// CROSS-CHANNEL CONFLICT — the same real Person hit by two+ live channels in the window reads as
// pressure, not presence. Derived purely from run entrants via the same identity rule the durable
// Person uses, so a deduped collision and a stored Person collapse to one key.
//
//   entrants — run items tagged with their channel (channelId / channel / source / …)
//   now, windowDays — optional recency window (default: last 7 days when `now` is given)
//
// Returns raw findings (type "conflict"); the caller records them as gated proposals.
export function detectCrossChannelConflicts(entrants = [], { now = null, windowDays = 7 } = {}) {
  const windowed = withinWindow(Array.isArray(entrants) ? entrants : [], { now, windowDays });
  const { collisions } = dedupeAcrossChannels(windowed);
  return collisions.map((collision) => {
    const channels = collision.channels;
    return {
      type: "conflict",
      // Signature is the person identity + the set of channels — stable, so the same overlap surfacing
      // every run stays ONE pending proposal. Channels sorted so order can't fork the signature.
      signature: `conflict:${collision.key}:${[...channels].sort().join("+")}`,
      subject: { personKey: collision.key, channels },
      reason: `The same person is on ${channels.length} live channels at once (${channels.join(", ")}) — that reads as pressure, not presence. Hold one, or stagger them.`,
      evidence: { channels, appearances: collision.appearances.length },
    };
  });
}

// DEAD BRANCH — a channel/branch that has produced zero items (or only errors) across recent runs is
// cost without a decision. `branches` is a derived summary per branch: { branchId, label, runs:
// [{ items, errored }] }. Sample floor: needs at least `minRuns` recent runs before it can be called
// dead, so a brand-new branch is never proposed for retirement.
export function detectDeadBranches(branches = [], { minRuns = 3 } = {}) {
  const list = Array.isArray(branches) ? branches : [];
  const findings = [];
  for (const branch of list) {
    const runs = Array.isArray(branch?.runs) ? branch.runs : [];
    if (runs.length < minRuns) continue;
    const totalItems = runs.reduce((sum, r) => sum + (Number(r?.items) || 0), 0);
    const allErrored = runs.every((r) => r?.errored);
    if (totalItems > 0 && !allErrored) continue;
    findings.push({
      type: "retire",
      signature: `retire:${branch.branchId}`,
      subject: { branchId: branch.branchId, label: branch.label ?? branch.branchId },
      reason: allErrored
        ? `"${branch.label ?? branch.branchId}" has errored on every one of its last ${runs.length} runs — it's cost without a result.`
        : `"${branch.label ?? branch.branchId}" produced zero items across its last ${runs.length} runs. Retire it into history (reversible).`,
      evidence: { runs: runs.length, totalItems, allErrored },
    });
  }
  return findings;
}

// SPINE PROMOTION — an experiment branch that beats the proven spine on the SAME variable, with enough
// sample, is a candidate to become the default. `comparison` is derived: { variable, spine: { branchId,
// rate, sample }, challenger: { branchId, label, rate, sample } }. Sample floor + a real margin guard
// keep noise out; the founder still gates it.
export function detectSpinePromotions(comparisons = [], { minSample = 30, minMargin = 0.2 } = {}) {
  const list = Array.isArray(comparisons) ? comparisons : [];
  const findings = [];
  for (const c of list) {
    const spine = c?.spine;
    const challenger = c?.challenger;
    if (!spine || !challenger) continue;
    if ((challenger.sample ?? 0) < minSample || (spine.sample ?? 0) < minSample) continue;
    const spineRate = Number(spine.rate) || 0;
    const challengerRate = Number(challenger.rate) || 0;
    if (spineRate <= 0) continue;
    const relativeLift = (challengerRate - spineRate) / spineRate;
    if (relativeLift < minMargin) continue;
    findings.push({
      type: "promote",
      signature: `promote:${challenger.branchId}:over:${spine.branchId}:${c.variable ?? ""}`,
      subject: { challengerId: challenger.branchId, spineId: spine.branchId, variable: c.variable ?? null },
      reason: `"${challenger.label ?? challenger.branchId}" beats the spine on ${c.variable ?? "the goal"} (${(challengerRate * 100).toFixed(1)}% vs ${(spineRate * 100).toFixed(1)}%, n=${challenger.sample}). Promote it to the default path?`,
      evidence: { spineRate, challengerRate, relativeLift, sample: challenger.sample },
    });
  }
  return findings;
}

// Orchestrator — run the detectors over derived inputs and return all raw findings. The caller records
// each as a gated proposal (curation-store.recordCurationProposal), dedup by signature handled there.
export function deriveCurationFindings({ entrants = [], branches = [], comparisons = [], now = null } = {}) {
  return [
    ...detectCrossChannelConflicts(entrants, { now }),
    ...detectDeadBranches(branches),
    ...detectSpinePromotions(comparisons),
  ];
}
