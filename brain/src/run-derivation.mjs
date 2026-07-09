// Run-completion derivations — ONE seam.
//
// When a run completes (or a gate resolves), four derivers turn the run's real state into durable GTM
// state: the feedback ledger banks the founder's gate decisions (taste), the person store promotes the
// run's entrants into durable People, the experiment deriver upserts one live hypothesis per channel,
// and the idea deriver closes the loop back to the GtmIdea that spawned the channel (its real outcome
// onto the idea + into the crucible ledger). These used to be scattered call-sites repeated in
// operator-runtime.mjs and server.mjs; drift between them was a latent bug. This module is the single
// place they fire.
//
// All four are read-derived GTM state, NEVER health and NEVER a gate — recording them can never block,
// re-run, or send anything. Each is wrapped so a malformed or empty run can never throw out of the seam;
// a derivation failure is swallowed and reported as null, exactly as the underlying derivers already do.

import { recordFeedbackSignalsFromRun } from "./feedback-ledger.mjs";
import { promoteEntrantsFromRun, extractRunItems } from "./person-store.mjs";
import { recordExperimentFromRun } from "./experiment-derivation.mjs";
import { recordIdeaOutcomeFromRun } from "./idea-derivation.mjs";
import { ingestBatch } from "./outcome-ingest.mjs";
import { recordObjectTouch } from "./gtm-store.mjs";
import { inferKind } from "./object-identity.mjs";

// Area 1 touch deriver: for every object a run touched, append one touch to the durable touch ledger,
// keyed by the object's deterministic objectKey so the SAME object collapses to one record across every
// motion. It reuses the SAME extraction loop the person promoter runs (extractRunItems) — People flow
// through as kind:"person" (their objectKey IS their durable Person identityKey), and every other
// discovered object (geo/keyword/page/partner/change/any open kind) is filed the same way. The touch's
// motion is the run's channel/graph id; its verb defaults to "worked" (the object was produced/handled by
// this run). Best-effort by design: an item with no stable identity is skipped, and any failure is
// swallowed so a derivation never breaks a run. NOTHING here reads the ledger to gate a run — it only
// WRITES touches; suppression is derived separately at read time (GTM-MACHINE.md §Area 1).
function recordObjectTouchesFromRun({ projectId = "default", motionId, runId, result } = {}, options = {}) {
  const items = extractRunItems(result);
  let touched = 0;
  for (const item of items) {
    const kind = inferKind(item);
    if (!kind) continue; // no stable identity to key on — skip rather than mint a noise record
    // A discovered object's verb reads its role when meaningful; otherwise it was "worked" by this run.
    const verb = String(item.role || "").trim() && item.role !== "entrant" ? String(item.role).trim() : "worked";
    const record = recordObjectTouch(
      projectId,
      { kind, fields: item, motionId, runId, verb },
      options,
    );
    if (record) touched += 1;
  }
  return { touched };
}

// The fifth derivation is outcome ingestion (Phase 5): when a run completion carries real outcomes —
// a product event, a founder-entered note, a connected-account signal — they join back to the run's
// staged items on the durable key and become Results (+ Learnings). `outcomes` is an OPEN map of
// source label → outcome list; a run that carries none (the common case — a run just STAGES at the
// gate) is an honest no-op, never a fabricated Result. It ingests what already happened; the wall is
// untouched (§2.1) — no send, publish, or charge here.
export function recordRunDerivations({ projectId = "default", graph, result, outcomes = null } = {}, options = {}) {
  const channelId = graph?.id ?? result?.graphId ?? null;

  let feedback = null;
  try {
    feedback = recordFeedbackSignalsFromRun({ projectId, graph, result }, options);
  } catch {
    feedback = null;
  }

  let promotion = null;
  try {
    promotion = promoteEntrantsFromRun({ projectId, channelId, result }, options);
  } catch {
    promotion = null;
  }

  // Area 1 — the durable touch ledger. Every object this run touched gets one appended touch, keyed by
  // its deterministic objectKey (People included, as kind:"person"). Wrapped best-effort like the others.
  let touches = null;
  try {
    touches = recordObjectTouchesFromRun(
      { projectId, motionId: channelId, runId: result?.runId ?? null, result },
      options,
    );
  } catch {
    touches = null;
  }

  let experiment = null;
  try {
    experiment = recordExperimentFromRun({ projectId, graph, result }, options);
  } catch {
    experiment = null;
  }

  let idea = null;
  try {
    idea = recordIdeaOutcomeFromRun({ projectId, graph, result }, options);
  } catch {
    idea = null;
  }

  // Outcome ingestion — only when this completion actually carries outcomes (explicit arg, or a
  // `result.outcomes` sources map). No outcomes → null, the honest no-op. Joining is deterministic.
  let outcome = null;
  try {
    const sources = outcomes ?? result?.outcomes ?? null;
    if (sources && typeof sources === "object" && !Array.isArray(sources) && Object.keys(sources).length) {
      outcome = ingestBatch({ projectId, sources }, options);
    }
  } catch {
    outcome = null;
  }

  return { feedback, promotion, touches, experiment, idea, outcome };
}
