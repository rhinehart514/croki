// configuration-routes.mjs — the readable firm definition and its reversible founder writes.

import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import {
  applyFirmConfiguration,
  applyFirmConfigurationProposal,
  getFirmConfiguration,
  proposeCapabilityAttachment,
  restoreFirmConfiguration,
} from "./configuration.mjs";
import { appendConversationMessage } from "./conversation.mjs";

function statusFor(error) {
  if (error?.code === "PERSISTENCE_CONFLICT") return 409;
  if (error?.code === "venture_not_found") return 404;
  if (error?.code === "founder_decision_forbidden") return 403;
  return Number.isInteger(error?.status) ? error.status : 400;
}

function appendConfigurationReceipt(ventureId, receipt) {
  return appendConversationMessage({
    ventureId,
    role: "agent",
    kind: "configuration-receipt",
    content: receipt.summary,
    configurationReceipt: receipt,
  });
}

export default async function handle({ req, res, url }) {
  const configurationMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/configuration$/);
  if (configurationMatch && req.method === "GET") {
    try {
      const ventureId = decodeURIComponent(configurationMatch[1]);
      json(res, 200, { configuration: getFirmConfiguration(ventureId) });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (configurationMatch && req.method === "PUT") {
    try {
      authorizeFounderWriteForRequest(req, "Changing the firm configuration");
      const ventureId = decodeURIComponent(configurationMatch[1]);
      const body = await readBody(req);
      const result = applyFirmConfiguration({
        ventureId,
        expectedRevision: body?.expectedRevision,
        configuration: body?.configuration,
        summary: body?.summary,
        source: "founder",
      });
      const message = appendConfigurationReceipt(ventureId, result.receipt);
      json(res, 200, { ...result, message });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const restoreMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/configuration\/restore$/);
  if (restoreMatch && req.method === "POST") {
    try {
      authorizeFounderWriteForRequest(req, "Restoring the firm configuration");
      const ventureId = decodeURIComponent(restoreMatch[1]);
      const body = await readBody(req);
      const result = restoreFirmConfiguration({
        ventureId,
        expectedRevision: body?.expectedRevision,
        receiptId: body?.receiptId,
      });
      const message = appendConfigurationReceipt(ventureId, result.receipt);
      json(res, 200, { ...result, message });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const applyProposalMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/configuration\/proposals\/([^/]+)\/apply$/);
  if (applyProposalMatch && req.method === "POST") {
    try {
      authorizeFounderWriteForRequest(req, "Applying a proposed firm configuration");
      const ventureId = decodeURIComponent(applyProposalMatch[1]);
      const proposalId = decodeURIComponent(applyProposalMatch[2]);
      const body = await readBody(req);
      const result = applyFirmConfigurationProposal({
        ventureId,
        proposalId,
        expectedRevision: body?.expectedRevision,
      });
      const message = appendConfigurationReceipt(ventureId, result.receipt);
      json(res, 200, { ...result, message });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const capabilityProposalMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/configuration\/proposals\/capability$/);
  if (capabilityProposalMatch && req.method === "POST") {
    try {
      authorizeFounderWriteForRequest(req, "Proposing a capability from the canvas");
      const ventureId = decodeURIComponent(capabilityProposalMatch[1]);
      const body = await readBody(req);
      const proposal = proposeCapabilityAttachment({
        ventureId,
        agentRef: body?.agentRef,
        capability: body?.capability,
      });
      const message = appendConversationMessage({
        ventureId,
        role: "founder",
        kind: "configuration-proposal",
        content: proposal.summary,
        teammateRef: body?.agentRef,
        configurationProposal: proposal,
      });
      json(res, 200, { proposal, message });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  return false;
}
