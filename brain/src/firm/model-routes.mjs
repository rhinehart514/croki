import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { getSemanticModel } from "./semantic-model-store.mjs";
import {
  closeModelBranch,
  compareModelBranches,
  createModelBranch,
  mergeModelBranch,
  projectModelBranch,
  proposeModelChange,
} from "./model-branches.mjs";
import { buildMarketMovementIndex } from "./market-movement.mjs";
import {
  checkOutwardObservation,
  executeOutwardAction,
  executePreparedOutwardAction,
  grantOutwardObservation,
  observeOutwardReturn,
  prepareOutwardAction,
  prepareOutwardMaterial,
  revokeOutwardObservation,
} from "./outward-actions.mjs";
import { createWorkScope, listWorkScopes, revokeWorkScope } from "./work-scopes.mjs";

function status(error) {
  if (error?.code === "venture_not_found" || String(error?.code ?? "").endsWith("_not_found")) return 404;
  if (error?.code === "PERSISTENCE_CONFLICT" || String(error?.code ?? "").includes("conflict") || String(error?.code ?? "").includes("stale")) return 409;
  return Number.isInteger(error?.status) ? error.status : 400;
}

function fail(res, error) {
  json(res, status(error), {
    error: error instanceof Error ? error.message : String(error),
    ...(error?.code ? { code: error.code } : {}),
    ...(error?.conflicts ? { conflicts: error.conflicts } : {}),
    ...(error?.action ? { outwardAction: error.action } : {}),
  });
}

function requestActor(req, founderAction = null) {
  const requested = String(req.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase();
  if (requested === "agent") return { authority: "agent", id: String(req.headers?.["x-gtm-agent"] ?? "mcp-agent").trim() || "mcp-agent" };
  if (founderAction) authorizeFounderWriteForRequest(req, founderAction);
  return { authority: "founder", id: "founder" };
}

export default async function handle({ req, res, url, deps = {} }) {
  const model = url.pathname.match(/^\/api\/ventures\/([^/]+)\/model$/);
  const branches = url.pathname.match(/^\/api\/ventures\/([^/]+)\/model\/branches$/);
  const branch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/model\/branches\/([^/]+)(?:\/(changes|merge|close|compare))?$/);
  const scopes = url.pathname.match(/^\/api\/ventures\/([^/]+)\/work-scopes$/);
  const revokeScope = url.pathname.match(/^\/api\/ventures\/([^/]+)\/work-scopes\/([^/]+)\/revoke$/);
  const movement = url.pathname.match(/^\/api\/ventures\/([^/]+)\/market-movement$/);
  const outward = url.pathname.match(/^\/api\/ventures\/([^/]+)\/outward-actions$/);
  const outwardAction = url.pathname.match(/^\/api\/ventures\/([^/]+)\/outward-actions\/([^/]+)(?:\/(execute|observations)(?:\/([^/]+)(?:\/(check|revoke))?)?)?$/);
  if (!model && !branches && !branch && !scopes && !revokeScope && !movement && !outward && !outwardAction) return false;

  try {
    if (req.method === "GET" && model) {
      json(res, 200, { model: getSemanticModel(decodeURIComponent(model[1])) });
      return true;
    }
    if (req.method === "GET" && movement) {
      json(res, 200, { marketMovement: buildMarketMovementIndex(decodeURIComponent(movement[1])) });
      return true;
    }
    if (req.method === "GET" && branches) {
      const current = getSemanticModel(decodeURIComponent(branches[1]));
      json(res, 200, { branches: current.modelBranches, revision: current.revision });
      return true;
    }
    if (req.method === "POST" && branches) {
      const ventureId = decodeURIComponent(branches[1]);
      const body = await readBody(req);
      const createdBy = requestActor(req, "Creating a Product model branch");
      const created = createModelBranch({ ventureId, ...body, createdBy });
      json(res, 201, { branch: created });
      return true;
    }
    if (req.method === "GET" && branch && !branch[3]) {
      json(res, 200, { branch: projectModelBranch(decodeURIComponent(branch[1]), decodeURIComponent(branch[2])) });
      return true;
    }
    if (req.method === "GET" && branch && branch[3] === "compare") {
      const ids = [decodeURIComponent(branch[2]), ...url.searchParams.getAll("with")];
      json(res, 200, { comparison: compareModelBranches(decodeURIComponent(branch[1]), ids) });
      return true;
    }
    if (req.method === "POST" && branch && branch[3] === "changes") {
      const ventureId = decodeURIComponent(branch[1]);
      const body = await readBody(req);
      const proposedBy = requestActor(req, "Changing a provisional Product model");
      const change = proposeModelChange({ ventureId, branchId: decodeURIComponent(branch[2]), ...body, proposedBy });
      json(res, 201, { change, branch: projectModelBranch(ventureId, decodeURIComponent(branch[2])) });
      return true;
    }
    if (req.method === "POST" && branch && branch[3] === "merge") {
      const ventureId = decodeURIComponent(branch[1]);
      const body = await readBody(req);
      const actor = requestActor(req, "Making selected Product changes current");
      const result = mergeModelBranch({ ventureId, branchId: decodeURIComponent(branch[2]), ...body, actor });
      json(res, 200, { receipt: result.receipt, model: result.model });
      return true;
    }
    if (req.method === "POST" && branch && branch[3] === "close") {
      const ventureId = decodeURIComponent(branch[1]);
      const body = await readBody(req);
      const actor = requestActor(req, "Closing Product model work");
      json(res, 200, { branch: closeModelBranch({ ventureId, branchId: decodeURIComponent(branch[2]), reason: body?.reason, actor }) });
      return true;
    }
    if (req.method === "GET" && scopes) {
      json(res, 200, { workScopes: listWorkScopes(decodeURIComponent(scopes[1])) });
      return true;
    }
    if (req.method === "POST" && scopes) {
      const ventureId = decodeURIComponent(scopes[1]);
      const body = await readBody(req);
      const actor = requestActor(req, "Authorizing continuing work");
      json(res, 201, { workScope: createWorkScope({ ventureId, ...body, actor }) });
      return true;
    }
    if (req.method === "POST" && revokeScope) {
      const ventureId = decodeURIComponent(revokeScope[1]);
      const body = await readBody(req);
      const actor = requestActor(req, "Revoking continuing work");
      json(res, 200, { workScope: revokeWorkScope({ ventureId, scopeId: decodeURIComponent(revokeScope[2]), reason: body?.reason, actor }) });
      return true;
    }
    if (req.method === "POST" && outward) {
      const ventureId = decodeURIComponent(outward[1]);
      const body = await readBody(req);
      const actor = requestActor(req, "Preparing outward work");
      const preparedMaterial = (deps.prepareOutwardMaterial ?? prepareOutwardMaterial)({ ventureId, kind: body?.kind, preparedMaterial: body?.preparedMaterial });
      json(res, 201, { outwardAction: prepareOutwardAction({ ventureId, ...body, preparedMaterial, actor }) });
      return true;
    }
    if (req.method === "POST" && outwardAction && outwardAction[3] === "execute") {
      const ventureId = decodeURIComponent(outwardAction[1]);
      const actionId = decodeURIComponent(outwardAction[2]);
      const actor = requestActor(req, "Executing exact outward work");
      const execute = deps.executeOutwardAction ?? ((action) => executePreparedOutwardAction(action, {}, deps.outwardAdapters));
      json(res, 200, { outwardAction: await executeOutwardAction({ ventureId, actionId, actor }, {}, { execute }) });
      return true;
    }
    if (req.method === "POST" && outwardAction && outwardAction[3] === "observations" && !outwardAction[4]) {
      const ventureId = decodeURIComponent(outwardAction[1]);
      const actionId = decodeURIComponent(outwardAction[2]);
      const body = await readBody(req);
      const actor = requestActor(req, "Authorizing bounded return observation");
      json(res, 201, { observation: grantOutwardObservation({ ventureId, actionId, ...body, actor }) });
      return true;
    }
    if (req.method === "POST" && outwardAction && outwardAction[3] === "observations" && outwardAction[4] && outwardAction[5] === "check") {
      requestActor(req, "Checking an exact authorized return");
      const ventureId = decodeURIComponent(outwardAction[1]);
      const actionId = decodeURIComponent(outwardAction[2]);
      const observationId = decodeURIComponent(outwardAction[4]);
      const observe = deps.observeOutwardReturn ?? ((contract) => observeOutwardReturn(contract, {}, deps.observationAdapters));
      json(res, 200, await checkOutwardObservation({ ventureId, actionId, observationId }, {}, { observe }));
      return true;
    }
    if (req.method === "POST" && outwardAction && outwardAction[3] === "observations" && outwardAction[4] && outwardAction[5] === "revoke") {
      const ventureId = decodeURIComponent(outwardAction[1]);
      const actionId = decodeURIComponent(outwardAction[2]);
      const observationId = decodeURIComponent(outwardAction[4]);
      const actor = requestActor(req, "Revoking bounded return observation");
      json(res, 200, { observation: revokeOutwardObservation({ ventureId, actionId, observationId, actor }) });
      return true;
    }
    json(res, 405, { error: "Method not allowed." });
  } catch (error) {
    fail(res, error);
  }
  return true;
}
