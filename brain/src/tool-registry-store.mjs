// E7.4 — The tool-birth → registry leg (durable, founder-gated).
//
// Wave 1 wired the FRONT of this loop: crystallization detects a repeated deterministic procedure and
// recordFeedbackSignalsFromRun banks it as a PENDING, gated, inert "ToolBirthProposal" ledger signal.
// What was missing is the BACK of the loop — a durable registry and the one explicit, founder-only
// birth path that turns an approved proposal into a registered, callable tool. This module is that leg.
//
// THE WALL (AGENTS.md): a tool is born ONLY on explicit founder approval, never by an agent. There is
// no auto-approve here and there is no operator/agent approve path anywhere — the run/operator path
// produces PENDING proposals and stops. Birth happens exclusively through approveToolBirth, called by
// the founder action behind the server route, mirroring the no-send execution wall. The gate is
// re-asserted at birth: gateToolBirth refuses an approve that lacks authored code AND a test, so a
// codeless crystallization candidate can never be promoted into a callable tool.
//
// Persistence mirrors feedback-ledger.mjs / program-store.mjs: one durable, project-scoped document
// addressed through the shared persistence() provider, collection "tool-registry".

import { persistence } from "./persistence.mjs";
import { createRegistry, registerTool } from "./tool-registry.mjs";
import { proposeTool, gateToolBirth } from "./tool-birth.mjs";
import {
  loadFeedbackLedger,
  saveFeedbackLedger,
  pendingToolBirthProposals,
} from "./feedback-ledger.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "tool-registry";

function now() {
  return new Date().toISOString();
}

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

function emptyRegistry(projectId) {
  return { ...createRegistry(), schemaVersion: SCHEMA_VERSION, projectId };
}

// Load the durable, project-scoped registry. Returns the createRegistry shape ({ schemaVersion, tools })
// augmented with projectId, so registerTool can consume it directly and the read helpers can list it.
export function loadToolRegistry(projectId = "default", options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(projectId));
  if (!stored) return emptyRegistry(projectId);
  if (stored?.schemaVersion === SCHEMA_VERSION && stored.tools && typeof stored.tools === "object") {
    return { ...stored, projectId };
  }
  return {
    ...emptyRegistry(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    tools: stored?.tools && typeof stored.tools === "object" ? stored.tools : {},
    projectId,
  };
}

export function saveToolRegistry(registry, options = {}) {
  const durable = {
    schemaVersion: SCHEMA_VERSION,
    projectId: registry.projectId,
    tools: registry.tools && typeof registry.tools === "object" ? registry.tools : {},
  };
  persistence(options).set(COLLECTION, safeId(durable.projectId), durable);
  return durable;
}

// Every registered tool (born, callable) for a project — for the UI's "registered tools" panel and for
// find-references / pruning callers.
export function registeredTools(projectId = "default", options = {}) {
  return Object.values(loadToolRegistry(projectId, options).tools ?? {});
}

// The pending tool-birth proposals a founder still has to decide on. Read from the durable feedback
// ledger, then RECONCILED against the registry: a proposal whose tool is already born is never shown as
// pending again. The registry is the source of truth for "is this born" because a procedure that keeps
// recurring across runs can bank a fresh PENDING proposal (same stable id/signature) even after birth;
// reconciling here keeps the founder from being asked to approve a tool that already exists.
export function pendingToolProposals(projectId = "default", options = {}) {
  const ledger = loadFeedbackLedger(projectId, options);
  const registry = loadToolRegistry(projectId, options);
  const bornIds = new Set(Object.keys(registry.tools ?? {}));
  const bornSignatures = new Set(
    Object.values(registry.tools ?? {})
      .map((tool) => tool.signature)
      .filter(Boolean),
  );
  return pendingToolBirthProposals(ledger)
    .filter((proposal) => proposal?.status === "pending")
    .filter((proposal) => !bornIds.has(proposal.id) && !(proposal.signature && bornSignatures.has(proposal.signature)));
}

// The single read the dashboard route uses: pending proposals to decide on + the registered tools.
export function listToolRegistry(projectId = "default", options = {}) {
  return {
    projectId,
    pending: pendingToolProposals(projectId, options),
    registered: registeredTools(projectId, options),
  };
}

function defaultName(proposal) {
  const base = String(proposal?.signature || "").replace(/[^a-zA-Z0-9]+/g, " ").trim();
  return base || "Self-built tool";
}

// Re-classify the resolved proposal's ledger signal so pendingToolBirthProposals no longer returns it,
// while keeping the durable record (now carrying the born tool id). The signal is retyped rather than
// deleted so the ledger preserves the full provenance trail of the birth.
function resolveProposalSignal(ledger, proposalId, toolId, options) {
  let changed = false;
  const signals = (ledger.signals ?? []).map((item) => {
    if (item?.type === "ToolBirthProposal" && item.proposal?.id === proposalId) {
      changed = true;
      return {
        ...item,
        type: "ToolBirthResolved",
        proposal: { ...item.proposal, status: "registered", toolId, resolvedAt: now() },
      };
    }
    return item;
  });
  if (changed) saveFeedbackLedger({ ...ledger, signals }, options);
}

// THE founder birth action — the only path from a PENDING proposal to a registered, callable tool.
// Looks up the pending proposal, authors it into a full spec through proposeTool (which MANDATES code +
// a test — a codeless/testless approve throws here), re-asserts the wall through gateToolBirth("approve"),
// registers the born tool into the durable registry, and resolves the pending proposal. Idempotent by
// proposal id: a second approve of an already-born proposal returns the existing tool untouched (it does
// not reset telemetry or re-resolve). This is a FOUNDER action behind the server route — there is no
// operator/agent caller of it anywhere.
export function approveToolBirth(
  { projectId = "default", proposalId, code, test, name, description, decisionNote } = {},
  options = {},
) {
  if (!proposalId || typeof proposalId !== "string") {
    throw new Error("approveToolBirth requires a proposalId.");
  }
  // Idempotency: a proposal already promoted into a registered tool is returned as-is. The born tool's
  // id equals its originating proposal id, so this also covers re-approval of a re-surfaced duplicate.
  const registry = loadToolRegistry(projectId, options);
  const already = Object.values(registry.tools ?? {}).find(
    (tool) => tool.sourceProposalId === proposalId || tool.id === proposalId,
  );
  if (already) {
    return { tool: already, registry, alreadyRegistered: true };
  }
  // Find the PENDING proposal in the durable feedback ledger.
  const ledger = loadFeedbackLedger(projectId, options);
  const entry = (ledger.signals ?? []).find(
    (item) => item?.type === "ToolBirthProposal" && item.proposal?.id === proposalId,
  );
  if (!entry) {
    throw new Error(`No pending tool-birth proposal: ${proposalId}`);
  }
  const proposal = entry.proposal;
  // Author the full spec. proposeTool refuses a tool without code AND a test — that refusal IS the wall
  // for the codeless case, raised before anything is registered.
  const spec = proposeTool({
    id: proposalId, // a stable id ties the born tool back to its originating proposal (idempotency + reconcile)
    name: typeof name === "string" && name.trim() ? name : defaultName(proposal),
    description:
      typeof description === "string" && description.trim()
        ? description
        : (typeof proposal.reason === "string" && proposal.reason.trim()
            ? proposal.reason
            : `Crystallized tool for ${proposal.signature}`),
    code,
    test,
    signature: typeof proposal.signature === "string" ? proposal.signature : null,
    provenance: "self-built",
  });
  // The founder gate, re-asserted: approve now passes because code + test exist.
  const approved = gateToolBirth(spec, {
    decision: "approve",
    ...(decisionNote ? { note: decisionNote } : {}),
  });
  const born = { ...approved, sourceProposalId: proposalId };
  // Register into the durable, project-scoped registry and persist.
  const nextRegistry = registerTool({ ...registry, projectId }, born);
  saveToolRegistry({ ...nextRegistry, projectId }, options);
  // Resolve the pending proposal so it stops surfacing — durable, survives a reload.
  resolveProposalSignal(ledger, proposalId, born.id, options);
  return { tool: nextRegistry.tools[born.id], registry: { ...nextRegistry, projectId }, alreadyRegistered: false };
}
