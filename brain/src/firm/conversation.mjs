// conversation.mjs — the venture's passive founder/teammate transcript.
//
// This is deliberately not a goal store, session machine, or execution authority. A message records
// what someone actually said while the ordinary drive loop remains the only place work can start.
// Keeping the transcript in the venture directory makes the chat readable, exportable, and durable
// across reloads without teaching it any workflow semantics.

import crypto from "node:crypto";
import { getVentureDoc, listVentureDocs, now, setVentureDoc } from "./venture-store.mjs";
import { diffFirmConfigurations } from "./configuration-diff.mjs";
import { emitFirmEvent } from "./firm-events.mjs";

const ROLES = new Set(["founder", "teammate", "agent", "system"]);
const KINDS = new Set(["message", "handoff", "configuration-proposal", "configuration-receipt", "proposal-assembly", "working-theory"]);
let lastStamp = "";
let stampSequence = 0;

function trimOrNull(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function normalizeCoordination(value) {
  const requestedBy = trimOrNull(value?.requestedBy);
  const protocol = trimOrNull(value?.protocol);
  const question = trimOrNull(value?.question);
  return requestedBy && protocol && question ? { requestedBy, protocol, question } : null;
}

// A joined market outcome reported in the thread carries a pointer down to its own record (the outcome
// document) so the UI can link the reported reply to its full receipt. Purely a reference — the words the
// founder reads live in `content`; this is the seam to the record, never rendered copy. Null unless the
// message actually reports a joined outcome.
function normalizeOutcomeReport(value) {
  const outcomeId = trimOrNull(value?.outcomeId);
  if (!outcomeId) return null;
  return {
    outcomeId,
    outcomeKind: trimOrNull(value?.outcomeKind),
    channel: trimOrNull(value?.channel),
    from: trimOrNull(value?.from),
  };
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.map((attachment) => {
    if (attachment?.kind === "journey-import") {
      return {
        kind: "journey-import",
        importRef: trimOrNull(attachment.importRef),
        name: trimOrNull(attachment.name),
        mediaType: trimOrNull(attachment.mediaType),
        byteSize: Number(attachment.byteSize),
        digest: trimOrNull(attachment.digest),
      };
    }
    return {
      id: trimOrNull(attachment?.id),
      name: trimOrNull(attachment?.name),
      mediaType: trimOrNull(attachment?.mediaType),
      size: Number(attachment?.size),
    };
  }).filter((attachment) => attachment.kind === "journey-import"
    ? Boolean(
        attachment.importRef && attachment.name && attachment.mediaType && attachment.digest
        && Number.isSafeInteger(attachment.byteSize) && attachment.byteSize > 0
      )
    : Boolean(
        attachment.id && attachment.name && /^image\/(jpeg|png|gif|webp)$/.test(attachment.mediaType)
        && Number.isSafeInteger(attachment.size) && attachment.size > 0,
      ));
}

function normalizeTarget(value) {
  const betId = trimOrNull(value?.betId);
  const workRef = trimOrNull(value?.workRef);
  const architectureId = trimOrNull(value?.architectureId ?? value?.architectureTarget?.id);
  const architectureStepId = trimOrNull(value?.architectureStepId ?? value?.architectureTarget?.stepId);
  const architectureRevision = Number.isInteger(value?.architectureRevision)
    ? value.architectureRevision
    : (Number.isInteger(value?.architectureTarget?.revision) ? value.architectureTarget.revision : null);
  const teammateRefs = [...new Set((value?.teammateRefs ?? []).map(trimOrNull).filter(Boolean))];
  const theoryId = trimOrNull(value?.theoryId ?? value?.theoryTarget?.theoryId);
  const theorySubjectId = trimOrNull(value?.theorySubjectId ?? value?.theoryTarget?.subjectId);
  const theoryRelationshipId = trimOrNull(value?.theoryRelationshipId ?? value?.theoryTarget?.relationshipId);
  const subjectRefs = [...new Set((value?.subjectRefs ?? []).map(trimOrNull).filter(Boolean))];
  return betId || workRef || architectureId || theorySubjectId || theoryRelationshipId || subjectRefs.length || teammateRefs.length
    ? {
        betId,
        workRef,
        ...(architectureId ? { architectureId, architectureStepId, architectureRevision } : {}),
        ...(theorySubjectId ? { theoryId, theorySubjectId } : {}),
        ...(theoryRelationshipId ? { theoryId, theoryRelationshipId } : {}),
        ...(subjectRefs.length ? { subjectRefs } : {}),
        teammateRefs,
      }
    : null;
}

function normalizeProposalAssembly(value) {
  const proposalId = trimOrNull(value?.proposalId);
  const baseRevision = Number(value?.baseRevision);
  const events = Array.isArray(value?.events) ? value.events.map((event, operationIndex) => ({
    operationIndex: Number.isInteger(event?.operationIndex) ? event.operationIndex : operationIndex,
    op: trimOrNull(event?.op),
    ...(trimOrNull(event?.role) ? { role: trimOrNull(event.role) } : {}),
    ...(trimOrNull(event?.elementId) ? { elementId: trimOrNull(event.elementId) } : {}),
    label: trimOrNull(event?.label),
    validated: event?.validated === true,
    at: trimOrNull(event?.at),
  })) : [];
  if (!proposalId || !Number.isInteger(baseRevision) || events.some((event) => !event.op || !event.label || !event.validated || !event.at)) {
    throw new Error("A proposal assembly message needs a proposal, base revision, and validated operation receipts.");
  }
  return { proposalId, baseRevision, events };
}

// Multiple tool calls can speak inside the same millisecond. The sequence keeps those writes in
// their real order when listConversation falls back to id after createdAt; random bytes keep the id
// collision-resistant across process restarts without carrying a durable counter or session store.
function messageId(createdAt) {
  const stamp = createdAt.replace(/\D/g, "").slice(0, 17);
  if (stamp === lastStamp) stampSequence += 1;
  else {
    lastStamp = stamp;
    stampSequence = 0;
  }
  return `message-${stamp}-${String(stampSequence).padStart(4, "0")}-${crypto.randomBytes(4).toString("hex")}`;
}

export function appendConversationMessage({
  ventureId,
  role,
  content,
  kind = "message",
  teammateRef = null,
  betId = null,
  changes = null,
  configurationProposal = null,
  configurationReceipt = null,
  proposalAssembly = null,
  workingTheory = null,
  runtime = null,
  coordination = null,
  target = null,
  outcomeReport = null,
  attachments = [],
} = {}, options = {}) {
  if (!ventureId) throw new Error("A conversation message needs a ventureId.");
  if (!ROLES.has(role)) throw new Error(`Unknown conversation role: ${role}`);
  if (!KINDS.has(kind)) throw new Error(`Unknown conversation message kind: ${kind}`);
  if (role === "system" && kind !== "handoff") throw new Error("System conversation entries must be handoffs.");
  const text = String(content ?? "").trim();
  if (!text) throw new Error("A conversation message needs content.");

  const normalizedChanges = kind === "handoff" ? {
    openedBetIds: [...new Set((changes?.openedBetIds ?? []).map(String).filter(Boolean))],
    stagedBetIds: [...new Set((changes?.stagedBetIds ?? []).map(String).filter(Boolean))],
    wallBetIds: [...new Set((changes?.wallBetIds ?? []).map(String).filter(Boolean))],
  } : null;

  const createdAt = now();
  const message = {
    id: messageId(createdAt),
    ventureId,
    role,
    kind,
    content: text,
    teammateRef: teammateRef ? String(teammateRef) : null,
    betId: betId ? String(betId) : null,
    changes: normalizedChanges,
    configurationProposal: kind === "configuration-proposal" ? {
      id: trimOrNull(configurationProposal?.id),
      baseRevision: Number(configurationProposal?.baseRevision),
      proposedRevision: Number(configurationProposal?.proposedRevision),
      summary: trimOrNull(configurationProposal?.summary),
    } : null,
    configurationReceipt: kind === "configuration-receipt" ? {
      id: trimOrNull(configurationReceipt?.id),
      revision: Number(configurationReceipt?.revision),
      summary: trimOrNull(configurationReceipt?.summary),
      source: trimOrNull(configurationReceipt?.source),
    } : null,
    proposalAssembly: kind === "proposal-assembly" ? normalizeProposalAssembly(proposalAssembly) : null,
    workingTheory: kind === "working-theory" ? {
      theoryId: trimOrNull(workingTheory?.theoryId),
      supersedes: trimOrNull(workingTheory?.supersedes),
      subjectIds: [...new Set((workingTheory?.subjectIds ?? []).map(trimOrNull).filter(Boolean))],
    } : null,
    runtime: runtime ? {
      id: trimOrNull(runtime.id),
      label: trimOrNull(runtime.label),
      auth: trimOrNull(runtime.auth),
      model: trimOrNull(runtime.model),
      configurationRevision: Number.isInteger(runtime.configurationRevision) ? runtime.configurationRevision : null,
    } : null,
    coordination: normalizeCoordination(coordination),
    target: normalizeTarget(target),
    outcomeReport: normalizeOutcomeReport(outcomeReport),
    attachments: normalizeAttachments(attachments),
    createdAt,
  };
  setVentureDoc(ventureId, "conversation", message.id, message, options);
  // Push a live "the conversation changed" signal to any present SSE client (Phase 5). Best-effort and
  // data-free: the client re-reads the transcript through the existing venture-scoped route.
  emitFirmEvent(ventureId, "conversation", { betId: message.betId });
  return message;
}

export function stampConversationRuntime(ventureId, messageIds, runtime, options = {}, coordination = null) {
  const ids = new Set(messageIds ?? []);
  if (!ids.size) return [];
  const stamped = [];
  for (const message of listVentureDocs(ventureId, "conversation", options)) {
    if (!ids.has(message.id)) continue;
    const updated = {
      ...message,
      runtime: {
        id: trimOrNull(runtime?.id),
        label: trimOrNull(runtime?.label),
        auth: trimOrNull(runtime?.auth),
        model: trimOrNull(runtime?.model),
        configurationRevision: Number.isInteger(runtime?.configurationRevision) ? runtime.configurationRevision : null,
      },
      coordination: normalizeCoordination(coordination) ?? message.coordination ?? null,
    };
    setVentureDoc(ventureId, "conversation", message.id, updated, options);
    stamped.push(updated);
  }
  return stamped;
}

export function listConversation(ventureId, options = {}) {
  return listVentureDocs(ventureId, "conversation", options)
    .map((message) => {
      if (message.kind === "configuration-proposal" && message.configurationProposal?.id) {
        const proposal = getVentureDoc(ventureId, "configuration", message.configurationProposal.id, options);
        if (!proposal || proposal.type !== "firm-configuration-proposal") return message;
        return {
          ...message,
          configurationProposal: {
            ...message.configurationProposal,
            status: proposal.status,
            appliedRevision: Number.isInteger(proposal.appliedRevision) ? proposal.appliedRevision : null,
            receiptId: trimOrNull(proposal.receiptId),
            rationale: trimOrNull(proposal.rationale),
            diff: diffFirmConfigurations(proposal.before, proposal.proposed),
          },
        };
      }
      if (message.kind === "configuration-receipt" && message.configurationReceipt?.id) {
        const receipt = getVentureDoc(ventureId, "configuration", message.configurationReceipt.id, options);
        if (!receipt || receipt.type !== "firm-configuration-change") return message;
        return {
          ...message,
          configurationReceipt: {
            ...message.configurationReceipt,
            diff: diffFirmConfigurations(receipt.before, receipt.after),
          },
        };
      }
      return message;
    })
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
}
