// The Strategist's durable ledger — promote / retire / conflict proposals the founder gates.
//
// This MIRRORS feedback-ledger.mjs exactly (load/save/dedupe/resolve), because the gated-proposal
// pattern is already proven there (and in tool-registry-store's approveToolBirth): a detector derives
// a PENDING proposal from real run state, it is deduplicated by a stable signature so a recurring
// situation yields ONE pending item, and the founder is the only path that resolves it. The Strategist
// never auto-applies a graph change — promote/retire/conflict are proposals, the wall holds.

import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "curation-ledger";

function now() {
  return new Date().toISOString();
}

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

function emptyLedger(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, proposals: [] };
}

export function loadCurationLedger(projectId = "default", options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(projectId));
  if (!stored) return emptyLedger(projectId);
  if (stored?.schemaVersion === SCHEMA_VERSION && Array.isArray(stored.proposals)) return stored;
  return {
    ...emptyLedger(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    proposals: Array.isArray(stored?.proposals) ? stored.proposals : [],
  };
}

export function saveCurationLedger(ledger, options = {}) {
  const durable = {
    ...ledger,
    schemaVersion: SCHEMA_VERSION,
    proposals: Array.isArray(ledger.proposals) ? ledger.proposals : [],
  };
  persistence(options).set(COLLECTION, safeId(durable.projectId), durable);
  return durable;
}

export function pendingCurationProposals(ledger) {
  return (ledger?.proposals ?? []).filter((p) => p?.status === "pending");
}

// Wrap a detector's raw finding ({ type, signature, subject, reason, evidence }) into a durable,
// PENDING proposal. Returns the proposal (existing or new). Dedupe is by signature, so the same
// situation surfacing run after run stays ONE pending item the founder sees once.
export function recordCurationProposal(ledger, finding) {
  if (!finding?.type || !finding?.signature) {
    throw new Error("A curation proposal needs a type and a signature.");
  }
  const existing = (ledger.proposals ?? []).find(
    (p) => p.signature === finding.signature && p.status === "pending",
  );
  if (existing) return { proposal: existing, created: false };
  const proposal = {
    id: `curation-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    type: finding.type,
    signature: finding.signature,
    status: "pending",
    subject: finding.subject ?? null,
    reason: finding.reason ?? "",
    evidence: finding.evidence ?? null,
    proposedAt: now(),
  };
  ledger.proposals = [...(ledger.proposals ?? []), proposal];
  return { proposal, created: true };
}

// The founder's resolution — the only path that closes a proposal. It records the decision and
// rationale; it does NOT itself mutate the graph (the caller applies the approved typed operation
// through the normal validated mutation path, then the wall is re-asserted there).
export function resolveCurationProposal(ledger, proposalId, { decision, rationale } = {}) {
  const proposal = (ledger.proposals ?? []).find((p) => p.id === proposalId);
  if (!proposal) throw new Error(`Curation proposal not found: ${proposalId}`);
  if (decision !== "approve" && decision !== "dismiss") {
    throw new Error('A curation decision must be "approve" or "dismiss".');
  }
  proposal.status = decision === "approve" ? "approved" : "dismissed";
  proposal.decision = decision;
  proposal.rationale = rationale ?? "";
  proposal.resolvedAt = now();
  return proposal;
}
