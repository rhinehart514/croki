import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { getVentureDoc, listVentureDocs } from "./venture-store.mjs";
import {
  CODE_WORKSPACE_COLLECTION,
  applyCodingWorkspace,
  assertCodingWorkspaceIdentity,
  commitCodingWorkspace,
  discardCodingWorkspace,
  inspectCodingReadiness,
  prepareCodingPullRequest,
  revertCodingWorkspaceApply,
  reviewCodingProductConsequence,
  reviewCodingWorkspace,
} from "./code-workspace.mjs";
import { inspectShip, prepareShipDrafts, runShipAction } from "./git-ship.mjs";
import {
  addCodingReviewComment,
  compareCodingWorkspaceCheckpoints,
  listWorkspaceRepositoryTree,
  readVentureRepositoryFile,
  readWorkspaceRepositoryFile,
  restoreCodingWorkspaceCheckpoint,
  searchWorkspaceRepositoryPaths,
} from "./repository-files.mjs";

function shipInfo(ventureId, id) {
  try { return inspectShip(ventureId, id); }
  catch { return null; }
}

function fail(res, error) {
  json(res, Number.isInteger(error?.status) ? error.status : 400, {
    error: error instanceof Error ? error.message : String(error),
    ...(error?.code ? { code: error.code } : {}),
  });
}

function exactWorkspace(ventureId, id) {
  const workspace = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id);
  if (!workspace) throw Object.assign(new Error(`No such coding workspace in this venture: ${id}`), { status: 404 });
  return workspace;
}

export default async function handle({ req, res, url }) {
  const ventureRepositoryMatch = url.pathname.match(
    /^\/api\/ventures\/([^/]+)\/repository\/file$/,
  );
  if (req.method === "GET" && ventureRepositoryMatch) {
    try {
      const ventureId = decodeURIComponent(ventureRepositoryMatch[1]);
      json(res, 200, {
        file: readVentureRepositoryFile(ventureId, {
          file: url.searchParams.get("path") ?? "",
          startLine: url.searchParams.get("startLine") ?? 1,
          endLine: url.searchParams.has("endLine") ? url.searchParams.get("endLine") : null,
        }),
      });
    } catch (error) { fail(res, error); }
    return true;
  }

  const listMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/coding-workspaces$/);
  if (req.method === "GET" && listMatch) {
    try {
      const ventureId = decodeURIComponent(listMatch[1]);
      json(res, 200, { workspaces: listVentureDocs(ventureId, CODE_WORKSPACE_COLLECTION) });
    } catch (error) { fail(res, error); }
    return true;
  }

  const repositoryMatch = url.pathname.match(
    /^\/api\/ventures\/([^/]+)\/coding-workspaces\/([^/]+)\/repository\/(tree|search|file)$/,
  );
  if (req.method === "GET" && repositoryMatch) {
    try {
      const ventureId = decodeURIComponent(repositoryMatch[1]);
      const id = decodeURIComponent(repositoryMatch[2]);
      const operation = repositoryMatch[3];
      const workspace = exactWorkspace(ventureId, id);
      const { worktree } = assertCodingWorkspaceIdentity(workspace);
      const cursor = url.searchParams.get("cursor") ?? 0;
      const limit = url.searchParams.get("limit") ?? undefined;
      if (operation === "tree") {
        json(res, 200, {
          tree: listWorkspaceRepositoryTree(worktree, {
            directory: url.searchParams.get("path") ?? "",
            cursor,
            limit,
          }),
        });
      } else if (operation === "search") {
        json(res, 200, {
          search: searchWorkspaceRepositoryPaths(worktree, {
            query: url.searchParams.get("q") ?? "",
            cursor,
            limit,
          }),
        });
      } else {
        json(res, 200, {
          file: readWorkspaceRepositoryFile(worktree, {
            file: url.searchParams.get("path") ?? "",
            startLine: url.searchParams.get("startLine") ?? 1,
            endLine: url.searchParams.has("endLine") ? url.searchParams.get("endLine") : null,
          }),
        });
      }
    } catch (error) { fail(res, error); }
    return true;
  }

  const itemMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/coding-workspaces\/([^/]+)$/);
  if (req.method === "GET" && itemMatch) {
    try {
      const ventureId = decodeURIComponent(itemMatch[1]);
      const id = decodeURIComponent(itemMatch[2]);
      json(res, 200, { workspace: exactWorkspace(ventureId, id), readiness: inspectCodingReadiness(ventureId, id), ship: shipInfo(ventureId, id) });
    } catch (error) { fail(res, error); }
    return true;
  }

  const compareMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/coding-workspaces\/([^/]+)\/compare-checkpoints$/);
  if (req.method === "GET" && compareMatch) {
    try {
      const ventureId = decodeURIComponent(compareMatch[1]);
      const id = decodeURIComponent(compareMatch[2]);
      json(res, 200, {
        comparison: compareCodingWorkspaceCheckpoints(
          ventureId,
          id,
          url.searchParams.get("from"),
          url.searchParams.get("to"),
        ),
      });
    } catch (error) { fail(res, error); }
    return true;
  }

  const actionMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/coding-workspaces\/([^/]+)\/(review-comment|review|product-consequence|apply|revert|commit|prepare-pull-request|prepare-ship|ship|restore|discard)$/);
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
    // A real ship pushes and opens a pull request; only a dry run may proceed without confirmation.
    if (action === "ship" && body?.dryRun !== true && body?.confirm !== true) {
      throw new Error("ship requires explicit confirmation.");
    }
    if (action === "ship" || action === "prepare-ship") {
      if (action === "prepare-ship") prepareShipDrafts(ventureId, id, body ?? {});
      else await runShipAction(ventureId, id, body ?? {}, { authority: "founder", id: "founder" });
      json(res, 200, { workspace: exactWorkspace(ventureId, id), readiness: inspectCodingReadiness(ventureId, id), ship: shipInfo(ventureId, id) });
      return true;
    }
    if (action === "review-comment") {
      const result = addCodingReviewComment(ventureId, id, body);
      json(res, 200, { ...result, readiness: inspectCodingReadiness(ventureId, id) });
      return true;
    }
    const workspace = action === "review" ? reviewCodingWorkspace(ventureId, id, body?.decision, body?.note)
      : action === "product-consequence" ? reviewCodingProductConsequence(ventureId, id, body, { authority: "founder", id: "founder" })
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
