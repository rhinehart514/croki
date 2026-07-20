import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { emitFirmEvent } from "./firm-events.mjs";
import { buildReleaseDetail, buildReleaseIndex, createRelease, mutateRelease } from "./release-index.mjs";

const status = (error) => error?.code === "venture_not_found" || error?.code === "semantic_model_missing_ref" ? 404 : error?.code === "semantic_model_stale_revision" || error?.code === "PERSISTENCE_CONFLICT" ? 409 : Number.isInteger(error?.status) ? error.status : 400;
export default async function handle({ req, res, url }) {
  const index = url.pathname.match(/^\/api\/ventures\/([^/]+)\/releases$/);
  const detail = url.pathname.match(/^\/api\/ventures\/([^/]+)\/releases\/([^/]+)(?:\/(mutations))?$/);
  try {
    if (req.method === "GET" && index) { const ventureId = decodeURIComponent(index[1]); json(res, 200, { releaseIndex: buildReleaseIndex(ventureId, { query: url.searchParams.get("q") ?? "" }) }); return true; }
    if (req.method === "POST" && index) { authorizeFounderWriteForRequest(req, "Creating a release"); const ventureId = decodeURIComponent(index[1]); const body = await readBody(req); const result = createRelease({ ventureId, baseRevision: body?.baseRevision, release: body?.release, actor: { authority: "founder", id: "founder" } }); emitFirmEvent(ventureId, "release"); emitFirmEvent(ventureId, "system"); json(res, 201, result); return true; }
    if (req.method === "GET" && detail && !detail[3]) { json(res, 200, { release: buildReleaseDetail(decodeURIComponent(detail[1]), decodeURIComponent(detail[2])) }); return true; }
    if (req.method === "POST" && detail && detail[3] === "mutations") { authorizeFounderWriteForRequest(req, "Changing a release"); const ventureId = decodeURIComponent(detail[1]); const body = await readBody(req); const result = mutateRelease({ ventureId, releaseId: decodeURIComponent(detail[2]), baseRevision: body?.baseRevision, mutations: body?.mutations, actor: { authority: "founder", id: "founder" } }); emitFirmEvent(ventureId, "release"); emitFirmEvent(ventureId, "system"); json(res, 200, result); return true; }
  } catch (error) { json(res, status(error), { error: error.message, code: error.code, currentRevision: error.currentRevision }); return true; }
  return false;
}
