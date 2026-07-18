// view-routes.mjs — the saved-views HTTP surface (thin; venture-scoped; fails closed).
//
// Law 12 (views are disposable; useful questions persist): the founder saves a temporary generated view
// as a synchronized LIVE VIEW or captures an immutable SNAPSHOT, and promotes selected findings out of a
// view into durable truth (Law 11). Saving, capturing, deleting, and promoting are explicit founder acts
// (FIRM-SPEC canonical acts §7) — every write runs through the same host-issued capability boundary as
// every other founder write (authorizeFounderWriteForRequest). Listing and reopening a view are reads,
// ungated like the lens GET. Venture existence and cross-venture scope both fail closed one layer down in
// views-store; this file only turns a URL + body into that call's arguments.

import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import {
  saveLiveView,
  captureSnapshot,
  listViews,
  reopenView,
  deleteView,
  promoteFinding,
  listFindings,
} from "./views-store.mjs";

function statusFor(err) {
  if (err?.code === "venture_not_found") return 404;
  if (err?.code === "view_not_found") return 404;
  if (err?.code === "view_scope_cross_venture") return 404;
  if (err?.code === "founder_decision_forbidden") return 403;
  return Number.isInteger(err?.status) ? err.status : 400;
}

function ventureOf(match) {
  return decodeURIComponent(match[1]);
}

export default async function handle({ req, res, url }) {
  const viewsMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/views$/);
  if (viewsMatch) {
    const ventureId = ventureOf(viewsMatch);
    if (req.method === "GET") {
      try {
        json(res, 200, { views: listViews(ventureId) });
      } catch (err) {
        json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }
    if (req.method === "POST") {
      try {
        authorizeFounderWriteForRequest(req, "Saving a view");
        const body = await readBody(req);
        const kind = body?.kind === "snapshot" ? "snapshot" : "live";
        const view = kind === "snapshot"
          ? captureSnapshot(ventureId, body)
          : saveLiveView(ventureId, body);
        json(res, 200, { view });
      } catch (err) {
        json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }
  }

  const viewMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/views\/([^/]+)$/);
  if (viewMatch) {
    const ventureId = ventureOf(viewMatch);
    const viewId = decodeURIComponent(viewMatch[2]);
    if (req.method === "GET") {
      try {
        json(res, 200, { reopened: reopenView(ventureId, viewId) });
      } catch (err) {
        json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }
    if (req.method === "DELETE") {
      try {
        authorizeFounderWriteForRequest(req, "Deleting a view");
        deleteView(ventureId, viewId);
        json(res, 200, { deleted: true });
      } catch (err) {
        json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }
  }

  const findingsMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/findings$/);
  if (findingsMatch) {
    const ventureId = ventureOf(findingsMatch);
    if (req.method === "GET") {
      try {
        json(res, 200, { findings: listFindings(ventureId) });
      } catch (err) {
        json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }
    if (req.method === "POST") {
      try {
        authorizeFounderWriteForRequest(req, "Promoting a finding");
        const body = await readBody(req);
        // The write passed the founder boundary, so this promotion IS a founder act — its authority is set
        // server-side, never read from the body (Law 9: authority is earned, not claimed by the caller).
        const finding = promoteFinding(ventureId, { ...body, promotedBy: { authority: "founder", id: "founder" } });
        json(res, 200, { finding });
      } catch (err) {
        json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }
  }

  return false;
}
