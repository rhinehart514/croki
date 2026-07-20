import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { emitFirmEvent } from "./firm-events.mjs";
import { applySystemMutations, buildSystemIndex } from "./system-index.mjs";

const status = (error) => error?.code === "venture_not_found" || error?.code === "semantic_model_missing_ref" ? 404 : error?.code === "semantic_model_stale_revision" || error?.code === "PERSISTENCE_CONFLICT" ? 409 : Number.isInteger(error?.status) ? error.status : 400;
export default async function handle({ req, res, url }) {
  const read = url.pathname.match(/^\/api\/ventures\/([^/]+)\/system-index$/);
  const write = url.pathname.match(/^\/api\/ventures\/([^/]+)\/system\/mutations$/);
  if (req.method === "GET" && read) {
    try { const ventureId = decodeURIComponent(read[1]); json(res, 200, { systemIndex: buildSystemIndex(ventureId, { scope: url.searchParams.get("scope") ?? "system", query: url.searchParams.get("q") ?? "" }) }); }
    catch (error) { json(res, status(error), { error: error.message, code: error.code }); }
    return true;
  }
  if (req.method === "POST" && write) {
    try { authorizeFounderWriteForRequest(req, "Changing the venture system"); const ventureId = decodeURIComponent(write[1]); const body = await readBody(req); const result = applySystemMutations({ ventureId, baseRevision: body?.baseRevision, mutations: body?.mutations, actor: { authority: "founder", id: "founder" } }); emitFirmEvent(ventureId, "system"); json(res, 200, result); }
    catch (error) { json(res, status(error), { error: error.message, code: error.code, currentRevision: error.currentRevision }); }
    return true;
  }
  return false;
}
