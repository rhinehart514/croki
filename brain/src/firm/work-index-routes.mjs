// Venture-scoped production work index. Reads join canonical and live state; the only write advances a
// founder-owned review cursor to the exact consequence currently visible, with stale writes rejected.

import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { markDirectionThreadReviewed } from "./semantic-model-store.mjs";
import { buildWorkIndex } from "./work-index.mjs";

function statusFor(error) {
  if (error?.code === "venture_not_found" || error?.code === "semantic_model_missing_ref") return 404;
  if (error?.code === "founder_decision_forbidden") return 403;
  return Number.isInteger(error?.status) ? error.status : 400;
}

export default async function handle({ req, res, url }) {
  const indexMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/work-index$/);
  if (req.method === "GET" && indexMatch) {
    try {
      const ventureId = decodeURIComponent(indexMatch[1]);
      json(res, 200, { workIndex: buildWorkIndex(ventureId) });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const reviewMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/work-index\/([^/]+)\/reviewed-through$/);
  if (req.method === "PUT" && reviewMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Reviewing returned work");
      const ventureId = decodeURIComponent(reviewMatch[1]);
      const threadId = decodeURIComponent(reviewMatch[2]);
      const body = await readBody(req);
      const requested = String(body?.reviewedThrough ?? "").trim();
      const before = buildWorkIndex(ventureId);
      const item = before.items.find((entry) => entry.threadRef === `thread:${threadId}`);
      if (!item) throw Object.assign(new Error(`No such direction thread: ${threadId}`), { code: "semantic_model_missing_ref", status: 404 });
      if (!requested || requested !== item.latestMeaningfulEvent.ref) {
        throw Object.assign(new Error("Work changed since this review began."), { code: "work_index_stale_review", status: 409 });
      }
      markDirectionThreadReviewed(
        ventureId,
        item.threadRef,
        requested,
        { actor: { authority: "founder", id: "founder" } },
      );
      const after = buildWorkIndex(ventureId);
      json(res, 200, { item: after.items.find((entry) => entry.threadRef === item.threadRef), workIndex: after });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  return false;
}
