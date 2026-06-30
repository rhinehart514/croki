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
import { promoteEntrantsFromRun } from "./person-store.mjs";
import { recordExperimentFromRun } from "./experiment-derivation.mjs";
import { recordIdeaOutcomeFromRun } from "./idea-derivation.mjs";

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

  let idea = null;
  try {
    idea = recordIdeaOutcomeFromRun({ projectId, graph, result }, options);
  } catch {
    idea = null;
  }

  return { feedback, promotion, experiment, idea };
}
