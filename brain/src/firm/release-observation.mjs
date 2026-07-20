// Founder-granted, release-scoped read authority. This is deliberately separate from standing outward
// grants: it can only filter and invoke an existing read transport, and can never mint a wall release.

import crypto from "node:crypto";
import { buildReleaseDetail } from "./release-index.mjs";
import { buildSentIndex, pollReplies } from "./market-poll.mjs";
import { getVentureDoc, listVentureDocs, now, setVentureDoc } from "./venture-store.mjs";

const COLLECTION = "observationContracts";
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const time = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

function contractId() {
  return `observation-${now().replace(/\D/g, "").slice(0, 17)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function listObservationContracts(ventureId, releaseId, options = {}) {
  return listVentureDocs(ventureId, COLLECTION, options)
    .filter((entry) => entry.releaseRef === `object:${releaseId}`)
    .sort((left, right) => String(right.grantedAt).localeCompare(String(left.grantedAt)));
}

export function currentObservationContract(ventureId, releaseId, options = {}) {
  return listObservationContracts(ventureId, releaseId, options)[0] ?? null;
}

function releasedMessages(release) {
  return release.decisions.flatMap((decision) => {
    const messageId = text(decision.executionResult?.messageId ?? decision.executionResult?.providerMessageId);
    return decision.releasedAt && messageId ? [{ decisionId: decision.id, messageId }] : [];
  });
}

export function grantObservationContract({ ventureId, releaseId, source, purpose, startsAt, endsAt, returnConditions, actor } = {}, options = {}) {
  if (actor?.authority !== "founder") throw Object.assign(new Error("Only the founder can grant observation."), { status: 403 });
  if (source !== "gmail") throw Object.assign(new Error("Only release-scoped Gmail observation is available."), { status: 400 });
  const start = time(startsAt);
  const end = time(endsAt);
  if (start == null || end == null || end <= start) throw Object.assign(new Error("Observation needs an explicit valid start and end."), { status: 400 });
  const namedPurpose = text(purpose);
  const conditions = Array.isArray(returnConditions) ? returnConditions.map(text).filter(Boolean) : [];
  if (!namedPurpose || conditions.length === 0) throw Object.assign(new Error("Observation needs a purpose and at least one return condition."), { status: 400 });

  const release = buildReleaseDetail(ventureId, releaseId, options);
  const messages = releasedMessages(release);
  if (messages.length === 0) throw Object.assign(new Error("Release one real Gmail action before granting observation."), { status: 409, code: "observation_source_unavailable" });
  const current = currentObservationContract(ventureId, releaseId, options);
  if (current && !current.revokedAt && time(current.endsAt) > Date.now()) {
    throw Object.assign(new Error("This release already has an active observation contract."), { status: 409, code: "observation_already_active" });
  }
  const grantedAt = now();
  const contract = {
    id: contractId(), type: "observation-contract", ventureId, releaseRef: `object:${releaseId}`,
    source, purpose: namedPurpose, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(),
    returnConditions: conditions, messageIds: messages.map((entry) => entry.messageId),
    decisionRefs: messages.map((entry) => `decision:${entry.decisionId}`), grantedAt,
    grantedBy: actor.id ?? "founder", revokedAt: null, lastCheckedAt: null, lastResult: null,
    authority: { reads: ["gmail:thread"], writes: ["attributable-evidence"], denies: ["send", "publish", "deploy", "spend", "canonical-interpretation"] },
  };
  return setVentureDoc(ventureId, COLLECTION, contract.id, contract, options);
}

export function revokeObservationContract({ ventureId, releaseId, contractId: id, actor } = {}, options = {}) {
  if (actor?.authority !== "founder") throw Object.assign(new Error("Only the founder can revoke observation."), { status: 403 });
  const contract = getVentureDoc(ventureId, COLLECTION, id, options);
  if (!contract || contract.releaseRef !== `object:${releaseId}`) throw Object.assign(new Error(`No such observation contract: ${id}`), { status: 404 });
  if (contract.revokedAt) return contract;
  return setVentureDoc(ventureId, COLLECTION, id, { ...contract, revokedAt: now(), revokedBy: actor.id ?? "founder" }, options);
}

export async function checkObservationContract({ ventureId, releaseId, contractId: id } = {}, options = {}, deps = {}) {
  const contract = getVentureDoc(ventureId, COLLECTION, id, options);
  if (!contract || contract.releaseRef !== `object:${releaseId}`) throw Object.assign(new Error(`No such observation contract: ${id}`), { status: 404 });
  if (contract.revokedAt) throw Object.assign(new Error("Observation was revoked. No source was read."), { status: 409, code: "observation_revoked" });
  const checkedAt = deps.now?.() ?? now();
  const checkedTime = time(checkedAt);
  if (checkedTime < time(contract.startsAt)) throw Object.assign(new Error("The observation window has not opened. No source was read."), { status: 409, code: "observation_not_started" });
  if (checkedTime > time(contract.endsAt)) throw Object.assign(new Error("The observation window closed. No source was read."), { status: 409, code: "observation_expired" });

  const allowedMessages = new Set(contract.messageIds);
  const allowedDecisions = new Set(contract.decisionRefs.map((ref) => ref.replace(/^decision:/, "")));
  const sentIndex = new Map([...buildSentIndex(ventureId, options)].filter(([messageId, sent]) =>
    allowedMessages.has(messageId) && allowedDecisions.has(sent.decisionId),
  ).map(([messageId, sent]) => [messageId, { ...sent, releaseRef: contract.releaseRef, observationContractRef: `observation:${contract.id}` }]));
  if (sentIndex.size !== contract.messageIds.length) throw Object.assign(new Error("The exact released Gmail source no longer matches this contract. No source was read."), { status: 409, code: "observation_source_mismatch" });

  const poll = deps.pollReplies ?? pollReplies;
  const result = await poll(ventureId, { ...options, sentIndex });
  const updated = { ...contract, lastCheckedAt: checkedAt, lastResult: result };
  setVentureDoc(ventureId, COLLECTION, contract.id, updated, options);
  return { contract: updated, evidence: result };
}

export async function checkAuthorizedObservations(ventureId, options = {}, deps = {}) {
  const checkedAt = deps.now?.() ?? now();
  const checkedTime = time(checkedAt);
  const active = listVentureDocs(ventureId, COLLECTION, options).filter((contract) =>
    !contract.revokedAt && time(contract.startsAt) <= checkedTime && time(contract.endsAt) >= checkedTime,
  );
  if (active.length === 0) return { polled: 0, ingested: [], checked: 0, reason: "No active founder-authorized release observation." };
  const results = [];
  for (const contract of active) {
    const releaseId = contract.releaseRef.replace(/^object:/, "");
    results.push(await checkObservationContract({ ventureId, releaseId, contractId: contract.id }, options, { ...deps, now: () => checkedAt }));
  }
  return {
    checked: results.length,
    polled: results.reduce((total, result) => total + (result.evidence.polled ?? 0), 0),
    ingested: results.flatMap((result) => result.evidence.ingested ?? []),
    reasons: results.map((result) => result.evidence.reason).filter(Boolean),
  };
}
