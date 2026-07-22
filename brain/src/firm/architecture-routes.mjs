// Thin HTTP transport for the Living Venture Atlas. Founder authority is required for current truth;
// agent-stamped callers may only create proposals. All paths remain venture scoped and fail closed.

import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { applyArchitectureMutations, getArchitecture, getArchitectureState, restoreArchitectureRevision } from "./architecture.mjs";
import { buildArchitectureProjection, explainArchitecturePressure } from "./architecture-projection.mjs";
import { buildArchitectureContext } from "./architecture-context.mjs";
import { decideArchitectureProposal, proposeArchitectureChange } from "./architecture-proposals.mjs";
import { markArchitectureContextStale } from "./active-drives.mjs";
import { acceptSystemProposal } from "./architecture-system-assembly.mjs";

function fail(res, error) {
  const status = error?.code === "venture_not_found" || error?.code === "architecture_missing_ref"
    ? 404
    : error?.code === "PERSISTENCE_CONFLICT" ? 409 : (Number.isInteger(error?.status) ? error.status : 400);
  json(res, status, {
    error: error instanceof Error ? error.message : String(error),
    ...(error?.code ? { code: error.code } : {}),
    ...(Number.isInteger(error?.currentRevision) ? { currentRevision: error.currentRevision } : {}),
  });
}

function route(pathname) {
  const scoped = pathname.match(/^\/api\/ventures\/([^/]+)\/architecture(?:\/(projection|mutations|proposals|revisions|context|pressure))?(?:\/([^/]+))?(?:\/(decide|restore|accept-system))?$/);
  if (scoped) return { ventureId: decodeURIComponent(scoped[1]), area: scoped[2] ?? "current", id: scoped[3] ? decodeURIComponent(scoped[3]) : null, action: scoped[4] ?? null };
  const alias = pathname.match(/^\/api\/firm\/architecture(?:\/(projection|mutations|proposals|revisions|context|pressure))?(?:\/([^/]+))?(?:\/(decide|restore|accept-system))?$/);
  if (alias) return { ventureId: null, area: alias[1] ?? "current", id: alias[2] ? decodeURIComponent(alias[2]) : null, action: alias[3] ?? null };
  return null;
}

function founder(req, action) {
  authorizeFounderWriteForRequest(req, action);
  return { authority: "founder", id: "founder" };
}

function agent(req) {
  const authority = String(req.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase();
  if (authority !== "agent") {
    const error = new Error("Architecture proposals from this route require the agent door.");
    error.code = "architecture_proposal_authority";
    error.status = 403;
    throw error;
  }
  return { authority: "agent", id: String(req.headers?.["x-gtm-agent"] ?? "mcp-agent").trim() || "mcp-agent" };
}

export default async function handle({ req, res, url }) {
  const matched = route(url.pathname);
  if (!matched) return false;
  let body = null;
  try {
    if (req.method !== "GET") body = await readBody(req);
    const ventureId = matched.ventureId ?? String(body?.ventureId ?? url.searchParams.get("ventureId") ?? "").trim();
    if (!ventureId) {
      const error = new Error("Architecture request needs a ventureId.");
      error.status = 400;
      throw error;
    }
    if (req.method === "GET" && matched.area === "current") {
      const state = getArchitectureState(ventureId);
      json(res, 200, { architecture: state.current, revision: state.current.revision, permissions: { founderCanMutate: true, agentCanPropose: true }, proposalCounts: { pending: state.proposals.filter((entry) => entry.status === "pending").length } });
      return true;
    }
    if (req.method === "GET" && matched.area === "projection") {
      const projection = buildArchitectureProjection(ventureId);
      json(res, 200, { projection, revision: projection.revision });
      return true;
    }
    if (req.method === "GET" && matched.area === "context") {
      const revisionParam = url.searchParams.get("revision");
      const context = buildArchitectureContext(ventureId, { id: url.searchParams.get("id"), stepId: url.searchParams.get("stepId"), revision: revisionParam == null ? undefined : Number(revisionParam) });
      json(res, 200, { context, revision: context.architectureRevision });
      return true;
    }
    if (req.method === "GET" && matched.area === "pressure") {
      const result = explainArchitecturePressure(ventureId, url.searchParams.get("subjectId"));
      json(res, 200, result);
      return true;
    }
    if (req.method === "POST" && matched.area === "mutations") {
      const result = applyArchitectureMutations({ ventureId, baseRevision: body?.baseRevision, operations: body?.operations, reason: body?.reason, actor: founder(req, "Changing venture architecture") });
      json(res, 200, { ...result, staleDrives: markArchitectureContextStale(ventureId, result.revision) });
      return true;
    }
    if (req.method === "POST" && matched.area === "proposals" && !matched.id) {
      const result = proposeArchitectureChange({ ventureId, baseRevision: body?.baseRevision, intent: body?.intent, operations: body?.operations, affectedExecutionContexts: body?.affectedExecutionContexts, evidenceRefs: body?.evidenceRefs, unresolvedAssumptions: body?.unresolvedAssumptions, expectedExecutionEffect: body?.expectedExecutionEffect, proposedBy: { ...agent(req), configurationRevision: body?.configurationRevision } });
      json(res, 200, result);
      return true;
    }
    if (req.method === "POST" && matched.area === "proposals" && matched.id && matched.action === "decide") {
      const result = decideArchitectureProposal({ ventureId, proposalId: matched.id, decision: body?.decision, operations: body?.operations, reason: body?.reason, actor: founder(req, "Deciding an architecture proposal") });
      json(res, 200, { ...result, staleDrives: markArchitectureContextStale(ventureId, result.revision) });
      return true;
    }
    if (req.method === "POST" && matched.area === "proposals" && matched.id && matched.action === "accept-system") {
      const result = acceptSystemProposal({
        ventureId,
        proposalId: matched.id,
        reason: body?.reason,
        actor: founder(req, "Accepting a proposed venture system"),
      });
      json(res, 200, { ...result, staleDrives: markArchitectureContextStale(ventureId, result.revision) });
      return true;
    }
    if (req.method === "GET" && matched.area === "proposals") {
      const state = getArchitectureState(ventureId);
      const proposals = matched.id ? state.proposals.filter((entry) => entry.id === matched.id) : state.proposals;
      json(res, 200, { proposals, revision: state.current.revision });
      return true;
    }
    if (req.method === "GET" && matched.area === "revisions") {
      const state = getArchitectureState(ventureId);
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 25));
      const before = Number(url.searchParams.get("before")) || Infinity;
      const revisions = state.revisions.filter((entry) => entry.revision < before).slice(-limit).reverse();
      json(res, 200, { revisions, revision: state.current.revision });
      return true;
    }
    if (req.method === "POST" && matched.area === "revisions" && matched.id && matched.action === "restore") {
      const result = restoreArchitectureRevision({ ventureId, revision: Number(matched.id), baseRevision: body?.baseRevision, reason: body?.reason, actor: founder(req, "Restoring venture architecture") });
      json(res, 200, { ...result, staleDrives: markArchitectureContextStale(ventureId, result.revision) });
      return true;
    }
    json(res, 405, { error: "Method not allowed for architecture route." });
  } catch (error) {
    fail(res, error);
  }
  return true;
}

export { getArchitecture };
