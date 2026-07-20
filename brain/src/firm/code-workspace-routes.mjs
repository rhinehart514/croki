import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { getVentureDoc, listVentureDocs } from "./venture-store.mjs";
import {
  CODE_WORKSPACE_COLLECTION,
  applyCodingWorkspace,
  commitCodingWorkspace,
  discardCodingWorkspace,
  inspectCodingReadiness,
  prepareCodingPullRequest,
  revertCodingWorkspaceApply,
  restoreCodingWorkspaceCheckpoint,
  reviewCodingWorkspace,
} from "./code-workspace.mjs";

function fail(res, error) {
  json(res, Number.isInteger(error?.status) ? error.status : 400, { error: error instanceof Error ? error.message : String(error) });
}

function exactWorkspace(ventureId, id) {
  const workspace = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id);
  if (!workspace) throw Object.assign(new Error(`No such coding workspace in this venture: ${id}`), { status: 404 });
  return workspace;
}

export default async function handle({ req, res, url }) {
  const listMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/coding-workspaces$/);
  if (req.method === "GET" && listMatch) {
    try {
      const ventureId = decodeURIComponent(listMatch[1]);
      json(res, 200, { workspaces: listVentureDocs(ventureId, CODE_WORKSPACE_COLLECTION) });
    } catch (error) { fail(res, error); }
    return true;
  }

  const itemMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/coding-workspaces\/([^/]+)$/);
  if (req.method === "GET" && itemMatch) {
    try {
      const ventureId = decodeURIComponent(itemMatch[1]);
      const id = decodeURIComponent(itemMatch[2]);
      json(res, 200, { workspace: exactWorkspace(ventureId, id), readiness: inspectCodingReadiness(ventureId, id) });
    } catch (error) { fail(res, error); }
    return true;
  }

  const actionMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/coding-workspaces\/([^/]+)\/(review|apply|revert|commit|prepare-pull-request|restore|discard)$/);
  if (req.method !== "POST" || !actionMatch) return false;
  const ventureId = decodeURIComponent(actionMatch[1]);
  const id = decodeURIComponent(actionMatch[2]);
  const action = actionMatch[3];
  try {
    authorizeFounderWriteForRequest(req, `${action} native coding work`);
    exactWorkspace(ventureId, id);
    const body = await readBody(req);
    if (["apply", "revert", "commit", "restore", "discard"].includes(action) && body?.confirm !== true) {
      throw new Error(`${action} requires explicit confirmation.`);
    }
    const workspace = action === "review" ? reviewCodingWorkspace(ventureId, id, body?.decision, body?.note)
      : action === "apply" ? applyCodingWorkspace(ventureId, id)
        : action === "revert" ? revertCodingWorkspaceApply(ventureId, id)
          : action === "commit" ? commitCodingWorkspace(ventureId, id, body?.message)
          : action === "prepare-pull-request" ? prepareCodingPullRequest(ventureId, id)
            : action === "restore" ? restoreCodingWorkspaceCheckpoint(ventureId, id, body?.checkpointId)
              : discardCodingWorkspace(ventureId, id);
    json(res, 200, { workspace, readiness: action === "discard" ? null : inspectCodingReadiness(ventureId, id) });
  } catch (error) { fail(res, error); }
  return true;
}
