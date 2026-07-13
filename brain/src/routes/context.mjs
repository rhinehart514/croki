// The context-discovery seam: scout the project's approved repository, then promote only a
// founder-confirmed candidate into ordinary open work. Discovery is a read and persists nothing.

import { discoverContextCandidates, promoteContextCandidate } from "../context-discovery.mjs";
import { loadProject } from "../project-store.mjs";
import { loadWorkArtifactStore } from "../work-artifact-store.mjs";
import { authorizeFounderWriteForRequest } from "./session-guard.mjs";
import { expandHome, json, readBody } from "./util.mjs";

function decoded(value) {
  try { return decodeURIComponent(value); } catch { throw new Error("projectId is not a valid path identifier."); }
}
function repositoryFor(project) {
  const repo = String(project?.sharedContext?.repository?.repo ?? "").trim();
  if (!repo) throw new Error("This project has no approved repository to scout.");
  return expandHome(repo);
}

export default async function handle({ req, res, url }) {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/context\/(discover|promote)$/);
  if (!match) return false;
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return true;
  }

  try {
    const projectId = decoded(match[1]);
    const action = match[2];
    const body = (await readBody(req)) ?? {};
    const project = loadProject({ projectId });
    const root = repositoryFor(project);

    if (action === "discover") {
      const discovery = discoverContextCandidates({
        root,
        project,
        question: typeof body.question === "string" ? body.question : "",
        limit: body.limit,
      });
      json(res, 200, {
        projectId,
        ...discovery,
        workArtifactStoreRevision: loadWorkArtifactStore(projectId).revision,
      });
      return true;
    }

    authorizeFounderWriteForRequest(req, "Promoting repository evidence into shared context");
    const result = promoteContextCandidate({
      projectId,
      root,
      candidate: body.candidate,
      expectedStoreRevision: body.expectedStoreRevision,
      idempotencyKey: body.idempotencyKey,
    });
    json(res, result.created ? 201 : 200, { projectId, ...result });
  } catch (error) {
    const status = Number.isInteger(error?.status)
      ? error.status
      : /not found|no approved repository/i.test(error?.message ?? "") ? 404
        : /stale|changed after discovery/i.test(error?.message ?? "") ? 409
          : 400;
    json(res, status, { error: error instanceof Error ? error.message : String(error) });
  }
  return true;
}
