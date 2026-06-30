// Run-completion derivations — ONE seam.
//
// When a run completes (or a gate resolves), three deriversturn the run's real state into durable GTM
// state: the feedback ledger banks the founder's gate decisions (taste), the person store promotes the
// run's entrants into durable People, and the experiment deriver upserts one live hypothesis per
// channel. These three used to be three scattered call-sites repeated in operator-runtime.mjs and
// server.mjs; drift between them was a latent bug. This module is the single place they fire.
//
// All three are read-derived GTM state, NEVER health and NEVER a gate — recording them can never block,
// re-run, or send anything. Each is wrapped so a malformed or empty run can never throw out of the seam;
// a derivation failure is swallowed and reported as null, exactly as the underlying derivers already do.

import { recordFeedbackSignalsFromRun } from "./feedback-ledger.mjs";
import { promoteEntrantsFromRun } from "./person-store.mjs";
import { recordExperimentFromRun } from "./experiment-derivation.mjs";

export function recordRunDerivations({ projectId = "default", graph, result } = {}, options = {}) {
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

  let experiment = null;
  try {
    experiment = recordExperimentFromRun({ projectId, graph, result }, options);
  } catch {
    experiment = null;
  }

  return { feedback, promotion, experiment };
}
