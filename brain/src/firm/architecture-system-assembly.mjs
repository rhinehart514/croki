// Founder acceptance for a whole proposed GTM system. Ghost campaigns acquire real governing bets
// only here. The architecture revision and proposal decision share one CAS; the separately stored
// bets are compensated if that CAS refuses, so this is compensated acceptance rather than a claim
// of a cross-document transaction.

import { createBet } from "./bet.mjs";
import {
  applyArchitectureMutations,
  getArchitectureState,
  validateArchitectureProposalOperations,
} from "./architecture.mjs";
import { listVentureDocs, now, setVentureDoc, venturePersistence } from "./venture-store.mjs";

const ACCEPTANCE_REF_TYPE = "architecture-system-acceptance";

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "architecture_system_acceptance_invalid", status = 400, details = {}) {
  throw Object.assign(new Error(message), { code, status, ...details });
}

function campaignSeed(operation) {
  const element = operation?.element ?? operation?.value;
  if (operation?.op !== "create-element" || element?.role !== "campaign") return null;
  return text(element.governingBetSeed) ? { element, intent: text(element.governingBetSeed) } : null;
}

function acceptanceRef(proposalId, campaignId) {
  return { type: ACCEPTANCE_REF_TYPE, id: JSON.stringify([proposalId, campaignId]) };
}

function hasAcceptanceRef(bet, ref) {
  return Array.isArray(bet?.refs) && bet.refs.some((entry) => entry?.type === ref.type && entry?.id === ref.id);
}

function isUntouchedSeededBet(bet, { ventureId, intent, campaignId, proposal, architectureRevision, ref }) {
  return bet?.ventureId === ventureId
    && bet.intent === intent
    && bet.forkedFrom == null
    && bet.teammateRef === (text(proposal.proposedBy?.id) ?? null)
    && bet.configurationRevision === (Number.isInteger(proposal.configurationRevision) ? proposal.configurationRevision : null)
    && bet.architectureRevision === architectureRevision
    && bet.architectureTarget?.id === campaignId
    && bet.architectureTarget?.stepId == null
    && bet.campaignId === campaignId
    && bet.endedAt == null
    && bet.endedBy == null
    && bet.learning == null
    && (!Array.isArray(bet.staged) || bet.staged.length === 0)
    && (!Array.isArray(bet.evidence) || bet.evidence.length === 0)
    && (!Array.isArray(bet.events) || bet.events.length === 0)
    && Array.isArray(bet.refs)
    && bet.refs.length === 1
    && hasAcceptanceRef(bet, ref);
}

export function acceptSystemProposal({ ventureId, proposalId, reason = null, actor } = {}, options = {}, dependencies = {}) {
  if (actor?.authority !== "founder") fail("Only the founder can accept a proposed system.", "architecture_authority_denied", 403);
  const state = getArchitectureState(ventureId, options);
  const proposal = state.proposals.find((entry) => entry.id === proposalId);
  if (!proposal) fail(`No such architecture proposal: ${proposalId}`, "architecture_proposal_not_found", 404);
  if (proposal.status !== "pending") fail(`Architecture proposal ${proposalId} was already decided.`, "architecture_proposal_decided", 409);
  if (proposal.baseRevision !== state.current.revision) {
    fail(
      `Architecture proposal ${proposalId} was based on revision ${proposal.baseRevision}, not ${state.current.revision}.`,
      "architecture_stale_revision",
      409,
      { baseRevision: proposal.baseRevision, currentRevision: state.current.revision },
    );
  }

  // Re-run whole-list ghost validation against current truth before creating the first real bet.
  validateArchitectureProposalOperations({
    ventureId,
    baseRevision: proposal.baseRevision,
    operations: proposal.operations,
  }, options);
  const seededCampaigns = proposal.operations.map(campaignSeed).filter(Boolean);
  if (!seededCampaigns.length) fail("System acceptance needs at least one ghost campaign with a governingBetSeed.");

  const makeBet = dependencies.createBet ?? createBet;
  const persistBet = dependencies.persistBet ?? ((bet) => setVentureDoc(ventureId, "bets", bet.id, bet, options));
  const removeBet = dependencies.removeBet ?? ((betId) => venturePersistence(options, ventureId).delete("bets", betId));
  const bets = [];
  const compensatableBets = [];
  const knownBets = listVentureDocs(ventureId, "bets", options);
  const resumableBetByCampaignId = new Map();
  // Resolve every replay identity before writing anything. A touched or duplicated seed blocks the
  // retry without partially cleaning other crash residue or minting a replacement.
  for (const { element, intent } of seededCampaigns) {
    if (!text(element.id)) fail("Every ghost campaign needs an explicit id.");
    const ref = acceptanceRef(proposalId, element.id);
    const matches = knownBets.filter((bet) => hasAcceptanceRef(bet, ref));
    if (matches.length > 1) {
      fail(`More than one governing bet carries the acceptance identity for campaign ${element.id}.`, "architecture_system_acceptance_conflict", 409);
    }
    if (matches.length === 1) {
      if (!isUntouchedSeededBet(matches[0], {
        ventureId,
        intent,
        campaignId: element.id,
        proposal,
        architectureRevision: state.current.revision + 1,
        ref,
      })) {
        fail(`The seeded governing bet for campaign ${element.id} was changed before acceptance could resume.`, "architecture_system_acceptance_conflict", 409);
      }
      resumableBetByCampaignId.set(element.id, matches[0]);
    }
  }
  const betByCampaignId = new Map();
  try {
    for (const { element, intent } of seededCampaigns) {
      const ref = acceptanceRef(proposalId, element.id);
      const resumable = resumableBetByCampaignId.get(element.id);
      if (resumable) {
        bets.push(resumable);
        compensatableBets.push(resumable);
        betByCampaignId.set(element.id, resumable);
        continue;
      }
      const raw = makeBet({
        ventureId,
        intent,
        teammateRef: proposal.proposedBy?.id,
        configurationRevision: proposal.configurationRevision,
        refs: [ref],
      });
      const bet = {
        ...raw,
        refs: [ref],
        architectureRevision: state.current.revision + 1,
        architectureTarget: { id: element.id, stepId: null },
        campaignId: element.id,
        updatedAt: now(),
      };
      persistBet(bet);
      compensatableBets.push(bet);
      knownBets.push(bet);
      bets.push(bet);
      betByCampaignId.set(element.id, bet);
    }

    const operations = proposal.operations.map((operation) => {
      const seed = campaignSeed(operation);
      if (!seed) return structuredClone(operation);
      const rewritten = structuredClone(operation);
      const element = rewritten.element ?? rewritten.value;
      delete element.governingBetSeed;
      element.governingBetId = betByCampaignId.get(seed.element.id).id;
      return rewritten;
    });
    const decidedAt = now();
    const result = applyArchitectureMutations({
      ventureId,
      baseRevision: state.current.revision,
      operations,
      reason: text(reason) ?? proposal.intent,
      actor,
      source: "proposal-system-acceptance",
      proposalId,
      proposalDecision: {
        proposalId,
        fields: {
          status: "accepted",
          decision: "accept",
          reason: text(reason),
          decidedAt,
          decidedBy: actor,
          appliedRevision: state.current.revision + 1,
        },
      },
    }, options);
    const campaignIds = new Set(seededCampaigns.map(({ element }) => element.id));
    return {
      ...result,
      bets,
      campaigns: result.architecture.elements.filter((element) => campaignIds.has(element.id)),
      atomicity: "compensated-acceptance",
    };
  } catch (error) {
    const orphanBetIds = [];
    for (const bet of compensatableBets.reverse()) {
      try { removeBet(bet.id); } catch { orphanBetIds.push(bet.id); }
    }
    if (orphanBetIds.length) {
      fail(
        `System acceptance failed and could not compensate ${orphanBetIds.length} governing bet${orphanBetIds.length === 1 ? "" : "s"}.`,
        "architecture_system_compensation_failed",
        500,
        { orphanBetIds, cause: error },
      );
    }
    throw error;
  }
}
