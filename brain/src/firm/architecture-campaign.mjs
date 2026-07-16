// Small orchestration seam for the founder act “activate this motion.” A campaign must govern a real
// bet, so this creates/forks that bet in the existing bet store and attaches the campaign in one
// compensated operation—no campaign task store or lifecycle machine.

import crypto from "node:crypto";
import { createBet, fork } from "./bet.mjs";
import { applyArchitectureMutations, getArchitecture } from "./architecture.mjs";
import { getVentureDoc, now, setVentureDoc, venturePersistence } from "./venture-store.mjs";

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "campaign_start_invalid", status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

export function startArchitectureCampaign({
  ventureId,
  baseRevision,
  motionId,
  campaign = {},
  bet = {},
  supportingBetIds = [],
  reason = null,
  actor,
} = {}, options = {}) {
  if (actor?.authority !== "founder") fail("Only the founder can start a campaign.", "architecture_authority_denied", 403);
  const architecture = getArchitecture(ventureId, options);
  if (architecture.revision !== baseRevision) fail("Architecture changed before this campaign began.", "architecture_stale_revision", 409);
  if (architecture.elements.find((entry) => entry.id === motionId)?.role !== "motion") {
    fail(`No motion ${motionId} belongs to this venture.`, "architecture_missing_ref", 404);
  }
  for (const supportingId of supportingBetIds) {
    if (!getVentureDoc(ventureId, "bets", supportingId, options)) fail(`No supporting bet ${supportingId} belongs to this venture.`, "architecture_missing_ref", 404);
  }
  const intent = text(bet.intent);
  if (!intent) fail("Starting a campaign needs the governing uncertainty in plain language.");
  const parent = text(bet.forkedFrom) ? getVentureDoc(ventureId, "bets", bet.forkedFrom, options) : null;
  if (bet.forkedFrom && !parent) fail(`No parent bet ${bet.forkedFrom} belongs to this venture.`, "architecture_missing_ref", 404);
  const created = parent
    ? fork(parent, intent, { teammateRef: text(bet.teammateRef), learning: text(bet.learning), configurationRevision: bet.configurationRevision })
    : createBet({ ventureId, intent, teammateRef: text(bet.teammateRef), configurationRevision: bet.configurationRevision });
  const campaignId = text(campaign.id) ?? `arch-campaign-${crypto.randomBytes(8).toString("hex")}`;
  const element = {
    id: campaignId,
    role: "campaign",
    name: text(campaign.name),
    statement: text(campaign.statement),
    audience: text(campaign.audience),
    objective: text(campaign.objective),
    primaryMotionId: motionId,
    motionIds: [...new Set([motionId, ...(campaign.motionIds ?? [])])],
    governingBetId: created.id,
    supportingBetIds: [...new Set(supportingBetIds)],
    measurement: { observation: text(campaign.measurement?.observation), window: text(campaign.measurement?.window) },
    bounds: { startsAt: campaign.bounds?.startsAt ?? now(), endsAt: campaign.bounds?.endsAt ?? null },
    provenance: { kind: "founder-authored", createdAt: now() },
  };
  // Persist the bet first only because architecture referential validation must resolve it. Any
  // validation/CAS refusal compensates by removing this newly minted, still-unworked bet.
  setVentureDoc(ventureId, "bets", created.id, created, options);
  let result;
  try {
    result = applyArchitectureMutations({
      ventureId,
      baseRevision,
      operations: [{ op: "create-element", element }],
      reason: text(reason) ?? `Activate ${element.name ?? motionId}`,
      actor,
    }, options);
  } catch (error) {
    venturePersistence(options, ventureId).delete("bets", created.id);
    throw error;
  }
  const governingBet = {
    ...created,
    architectureRevision: result.revision,
    architectureTarget: { id: campaignId, stepId: null },
    campaignId,
    updatedAt: now(),
  };
  setVentureDoc(ventureId, "bets", created.id, governingBet, options);
  return { ...result, campaign: element, bet: governingBet };
}
