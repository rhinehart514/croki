// Structured, provisional mapping material returned by a Product / GTM Thread. A proposal can be
// corrected in place and previewed deterministically, but only the founder-only adopt route promotes
// its aggregate observation.

import crypto from "node:crypto";

import { journeyImportProfile } from "./journey-import.mjs";
import { previewJourneyImport } from "./journey-observations.mjs";
import { getVentureDoc, listVentureDocs, now, setVentureDoc } from "./venture-store.mjs";

function fail(message, code, status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function text(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function proposalId(importRef, threadRef) {
  const digest = crypto.createHash("sha256").update(`${importRef}\u0000${threadRef ?? ""}`).digest("hex");
  return `journey-mapping-${digest.slice(0, 32)}`;
}

export function saveJourneyMappingProposal(
  ventureId,
  importRef,
  mapping,
  { threadRef = null, messageRef = null, proposedBy = null } = {},
  options = {},
) {
  journeyImportProfile(ventureId, importRef, options);
  const preview = previewJourneyImport(ventureId, importRef, mapping, options);
  const boundThreadRef = text(threadRef);
  const id = proposalId(importRef, boundThreadRef);
  const existing = getVentureDoc(ventureId, "journeyMappingProposals", id, options);
  const at = now();
  const proposal = {
    id,
    ventureId,
    importRef,
    revision: (existing?.revision ?? 0) + 1,
    status: "proposed",
    mapping: preview.mapping,
    pageModelRevision: preview.pageModelRevision,
    preview: {
      window: preview.window,
      pageCounts: preview.pageCounts,
      transitions: preview.transitions,
      dropOffs: preview.dropOffs,
      unmatchedRoutes: preview.unmatchedRoutes,
      rejectedRows: preview.rejectedRows,
    },
    threadRef: boundThreadRef,
    messageRef: text(messageRef),
    proposedBy: proposedBy ?? { authority: "agent", id: "unknown" },
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  };
  setVentureDoc(ventureId, "journeyMappingProposals", id, proposal, options);
  return structuredClone(proposal);
}

export function getJourneyMappingProposal(ventureId, proposalRef, options = {}) {
  const proposal = getVentureDoc(ventureId, "journeyMappingProposals", proposalRef, options);
  if (!proposal) fail(`No such journey mapping proposal: ${proposalRef}`, "journey_mapping_proposal_not_found", 404);
  return structuredClone(proposal);
}

export function listJourneyMappingProposals(ventureId, importRef = null, options = {}) {
  return listVentureDocs(ventureId, "journeyMappingProposals", options)
    .filter((proposal) => !importRef || proposal.importRef === importRef)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .map((proposal) => structuredClone(proposal));
}

function proposalTool(args) {
  const { ventureId, importRef, teammateRef, threadRef, options, trackCall } = args;
  return {
    name: "propose_journey_mapping",
    description: "Return a structured field and route mapping for the attached journey evidence. This validates a preview but never adopts evidence or changes Product truth.",
    input_schema: {
      type: "object",
      properties: {
        inputKind: { enum: ["event-rows", "aggregate-transitions"] },
        fields: {
          type: "object",
          properties: {
            sequenceKey: { type: "string" }, timestamp: { type: "string" },
            route: { type: "string" }, eventName: { type: "string" },
            from: { type: "string" }, to: { type: "string" }, count: { type: "string" },
          },
        },
        routeMappings: { type: "object", additionalProperties: { type: "string" } },
        timezone: { type: "string" },
        sourceRef: { type: "string" },
        window: {
          type: "object",
          properties: { from: { type: "string" }, to: { type: "string" } },
          required: ["from", "to"],
        },
      },
      required: ["inputKind", "fields"],
    },
    async run(mapping = {}) {
      trackCall("propose_journey_mapping");
      return saveJourneyMappingProposal(
        ventureId,
        importRef,
        mapping,
        { threadRef, proposedBy: { authority: "agent", id: teammateRef } },
        options,
      );
    },
  };
}

export function buildJourneyMappingWorkLoopTools({ ventureId, teammateRef, target, options, trackCall }) {
  const importRef = text(target?.journeyImportRef);
  if (!importRef) return [];
  // Resolve now so a stale/cross-venture attachment cannot quietly add a misleading tool to a run.
  journeyImportProfile(ventureId, importRef, options);
  return [proposalTool({ ventureId, importRef, teammateRef, threadRef: target?.threadRef, options, trackCall })];
}
