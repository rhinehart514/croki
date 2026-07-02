// Phase 5 — Outcome store + join (GTM-ENGINE-REBUILD §4, Phase 5).
//
// Phase 4 staged a Run whose every item carries a durable joinKey (minted by the run store) so a real
// outcome can find its exact origin. This module closes that loop: it INGESTS an outcome from any of
// the three sources (a connected account, a product usage event, or a founder-entered note), JOINS it
// on that one key back to the run + item that produced it, records a Result tied to
// run/path/asset/message/channel/buyer/offer, and — for every Result — writes a Learning record.
// It also reads the ledger back out HONESTLY: an item with no outcome is reported as unmeasured, never
// papered over with a fake number.
//
// The invariants this file holds (§2):
//   - Deterministic code (§2.4). The join, the tie resolution, the aggregation, and the plain-language
//     readback are all plain functions over stored records. There is no model call anywhere here —
//     joining an outcome to its run is a lookup, not a judgment.
//   - Open shapes (§2.2). Source labels and outcomeKinds are OPEN strings; a source or outcome kind
//     that did not exist yesterday ingests without being rejected. Nothing is validated against a
//     closed enum.
//   - Honest measurement (Phase 5 guard). Unmeasured is shown as unmeasured. No conversion rate is
//     invented, no success is declared from free-text criteria a function cannot evaluate; the report
//     carries the real counts and lets the founder read which path actually produced outcomes.
//   - The wall is untouched (§2.1). Ingesting an outcome records what ALREADY happened; it never sends,
//     publishes, charges, or runs anything.
//
// Every Result also writes a Learning (§2.8): the structural signal (channel, outcome kind + value)
// stays physically separate from the identifying text (path, offer, message), so a later cross-company
// pool can strip PII at the write boundary. No aggregation across companies is performed here.

import { runStore, resultStore, learningStore, gtmPathStore } from "./gtm-store.mjs";

// The three canonical sources an outcome can arrive from. These are NAMES, not a gate — a source label
// is an open string (§2.2); ingestion accepts any label. These exist so callers spell the common three
// the same way, not to reject a fourth.
export const OUTCOME_SOURCES = {
  connectedAccount: "connected-account",
  productEvent: "product-event",
  founderEntered: "founder-entered",
};

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// ── The join ─────────────────────────────────────────────────────────────────────────────────────
// One key. Every staged run item carries a durable joinKey; an outcome carries the same key. The join
// is a lookup of the item whose joinKey matches — deterministic code, never a model call. Returns the
// { run, item } the outcome came from, or null when the key matches nothing staged (an honest miss, not
// an error). Runs may be passed in so a batch reuses one store read instead of re-listing per outcome.
export function joinToRun({ joinKey, runs }) {
  const key = trimOrNull(joinKey);
  if (!key) return null;
  for (const run of Array.isArray(runs) ? runs : []) {
    for (const item of Array.isArray(run?.items) ? run.items : []) {
      if (trimOrNull(item?.joinKey) === key) return { run, item };
    }
  }
  return null;
}

// ── The Learning write ───────────────────────────────────────────────────────────────────────────
// For a Result, split the signal at the boundary the cross-company schema needs (§2.8): the STRUCTURAL
// half (channel, and the outcome kind + value, with whether it even joined) is non-identifying and safe
// to pool later; the IDENTIFYING half (the path, its market-object refs, the offer, the exact message)
// is company-specific and dropped at any future pooling boundary. Resolving the path is a best-effort
// read purely for the identifying refs — a missing path never blocks capturing the learning.
function writeLearningForResult({ result, run, item, projectId, options }) {
  const pathId = trimOrNull(result.pathId);
  let path = null;
  if (pathId) {
    try {
      path = gtmPathStore.get(pathId, { ...options, projectId });
    } catch {
      path = null;
    }
  }
  // Only the refs to market objects the bet rests on — a structural pointer set, not customer text.
  const marketObjectRefs = (Array.isArray(path?.restsOn) ? path.restsOn : []).filter((ref) =>
    String(ref?.type ?? "").toLowerCase().includes("market"),
  );

  return learningStore.create(
    {
      projectId,
      structural: {
        // No product-shape signal is available at ingest time; an honest null, never a guessed shape.
        productShape: null,
        runType: trimOrNull(run?.status) ? "gtm-path-run" : null,
        channel: result.channel,
        // Outcome kind + numeric value + whether it joined: a shape and a number, no customer text.
        result: {
          outcomeKind: result.outcomeKind ?? null,
          value: result.value ?? null,
          joined: Boolean(run),
        },
        promotionDecision: null,
      },
      identifying: {
        pathId,
        marketObjectRefs,
        offer: result.offerRef ?? trimOrNull(path?.bet?.offer),
        message: trimOrNull(item?.message ?? item?.draft),
      },
    },
    { ...options, projectId },
  );
}

// ── Ingest one outcome ─────────────────────────────────────────────────────────────────────────────
// Take a raw outcome from any source, join it on its joinKey back to the run + item that produced it,
// record a Result that ties to run/path/asset/message/channel/buyer/offer (derived from the joined
// run + item, with any explicit field on the outcome winning), and write the paired Learning. An
// outcome whose key matches nothing staged is still captured honestly — the Result records runId/pathId
// as null and `joined` is false — so an out-of-band reply is never silently dropped.
export function ingestOutcome(outcome = {}, options = {}) {
  const projectId = options.projectId ?? outcome.projectId ?? "default";
  const joinKey = trimOrNull(outcome.joinKey);
  if (!joinKey) {
    throw new Error("An outcome needs a joinKey to join back to what was sent.");
  }
  // Reuse a passed-in run snapshot (a batch reads once), else read the project's runs now.
  const runs = Array.isArray(options.runs) ? options.runs : runStore.list({ ...options, projectId });
  const match = joinToRun({ joinKey, runs });
  const run = match?.run ?? null;
  const item = match?.item ?? null;

  const result = resultStore.create(
    {
      projectId,
      joinKey,
      // Ties resolved from the joined run + item; an explicit field on the outcome overrides.
      runId: run?.id ?? null,
      pathId: outcome.pathId ?? run?.pathId ?? null,
      assetId: outcome.assetId ?? item?.assetId ?? null,
      messageId: outcome.messageId ?? item?.messageId ?? null,
      channel: outcome.channel ?? item?.channel ?? null,
      buyerRef: outcome.buyerRef ?? item?.buyer ?? null,
      offerRef: outcome.offerRef ?? item?.offer ?? null,
      outcomeKind: outcome.outcomeKind ?? null,
      value: outcome.value ?? null,
      observedAt: outcome.observedAt ?? undefined,
      source: outcome.source ?? null,
    },
    { ...options, projectId },
  );

  const learning = writeLearningForResult({ result, run, item, projectId, options });
  return { result, learning, joined: Boolean(run), run, item };
}

// ── Ingest a batch from the three sources ────────────────────────────────────────────────────────
// `sources` maps an OPEN source label → a list of raw outcomes ingested under that label (the label is
// stamped as each outcome's `source` unless the outcome already names its own). Reads the project's
// runs once and reuses that snapshot for every join, so a hundred outcomes cost one store read. Returns
// what was ingested plus honest joined / unjoined tallies.
export function ingestBatch({ projectId = "default", sources = {} } = {}, options = {}) {
  const runs = runStore.list({ ...options, projectId });
  const ingested = [];
  for (const [sourceLabel, list] of Object.entries(sources || {})) {
    for (const raw of Array.isArray(list) ? list : []) {
      if (!raw || typeof raw !== "object") continue;
      const outcome = { ...raw, source: raw.source ?? sourceLabel };
      ingested.push(ingestOutcome(outcome, { ...options, projectId, runs }));
    }
  }
  return {
    ingested,
    joined: ingested.filter((x) => x.joined).length,
    unjoined: ingested.filter((x) => !x.joined).length,
  };
}

// ── Honest readback ────────────────────────────────────────────────────────────────────────────────
// Fold the run ledger and the result ledger into a per-path picture the founder can read. The whole
// point of the guard: an item with no result is counted as UNMEASURED, not hidden and not turned into a
// rate. No success is asserted from a contract's free-text criteria — the report carries the real
// outcome counts and orders paths by how many outcomes they actually produced, so "which path worked"
// is answered by observed results, never by an invented score.

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// One plain-language sentence for a path's line in the report — founder register, strictly honest.
function plainSummary(entry, pathTitle) {
  const lead = pathTitle ? `${pathTitle}: ` : "";
  if (entry.staged === 0) return `${lead}Nothing staged under this path yet.`;
  if (entry.measured === 0) {
    return `${lead}${pluralize(entry.staged, "action")} staged. Nothing measured yet.`;
  }
  const outcomeParts = Object.entries(entry.outcomes)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${kind}`);
  const measuredPart = outcomeParts.length ? outcomeParts.join(", ") : `${entry.measured} measured`;
  const tail = entry.unmeasured ? ` ${pluralize(entry.unmeasured, "action")} not yet measured.` : "";
  return `${lead}${pluralize(entry.staged, "action")} staged — ${measuredPart} so far.${tail}`;
}

export function outcomeReport({ projectId = "default" } = {}, options = {}) {
  const runs = runStore.list({ ...options, projectId });
  const results = resultStore.list({ ...options, projectId });

  // Index results by the key they joined on, so counting is a lookup per staged item.
  const resultsByJoinKey = new Map();
  for (const r of results) {
    const key = trimOrNull(r.joinKey);
    if (!key) continue;
    if (!resultsByJoinKey.has(key)) resultsByJoinKey.set(key, []);
    resultsByJoinKey.get(key).push(r);
  }

  // Which staged joinKeys exist at all, so we can tell an out-of-band (unjoined) result apart from one
  // that matched a staged item.
  const stagedJoinKeys = new Set();
  const paths = new Map();
  for (const run of runs) {
    const pathId = run.pathId ?? null;
    const entry =
      paths.get(pathId) ?? { pathId, runs: 0, staged: 0, measured: 0, unmeasured: 0, outcomes: {} };
    entry.runs += 1;
    for (const item of Array.isArray(run.items) ? run.items : []) {
      const key = trimOrNull(item?.joinKey);
      if (!key) continue;
      stagedJoinKeys.add(key);
      entry.staged += 1;
      const attached = resultsByJoinKey.get(key) ?? [];
      if (attached.length) {
        entry.measured += 1;
        for (const r of attached) {
          const kind = r.outcomeKind ?? "unlabeled";
          entry.outcomes[kind] = (entry.outcomes[kind] ?? 0) + 1;
        }
      } else {
        entry.unmeasured += 1;
      }
    }
    paths.set(pathId, entry);
  }

  // Results whose key matched no staged item — captured, but honestly reported apart so nothing is
  // silently attributed to a path it did not come from.
  const unjoinedResults = results.filter((r) => {
    const key = trimOrNull(r.joinKey);
    return key && !stagedJoinKeys.has(key);
  }).length;

  const pathReadouts = [...paths.values()]
    // Order by observed outcomes, then by how much is measured — "which path worked" from real results.
    .sort((a, b) => {
      const ao = Object.values(a.outcomes).reduce((s, n) => s + n, 0);
      const bo = Object.values(b.outcomes).reduce((s, n) => s + n, 0);
      return bo - ao || b.measured - a.measured;
    })
    .map((entry) => {
      let title = null;
      if (entry.pathId) {
        try {
          title = trimOrNull(gtmPathStore.get(entry.pathId, { ...options, projectId })?.summary);
        } catch {
          title = null;
        }
      }
      return { ...entry, pathSummary: title, summary: plainSummary(entry, title) };
    });

  const staged = pathReadouts.reduce((s, e) => s + e.staged, 0);
  const measured = pathReadouts.reduce((s, e) => s + e.measured, 0);

  return {
    projectId,
    paths: pathReadouts,
    totals: {
      runs: runs.length,
      staged,
      measured,
      // Honest: unmeasured is a real count, never derived from a fabricated rate.
      unmeasured: staged - measured,
      results: results.length,
      unjoinedResults,
    },
  };
}
