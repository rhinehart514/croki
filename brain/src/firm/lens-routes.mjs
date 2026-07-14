// lens-routes.mjs — the lens's HTTP surface (thin; venture-scoped; fails closed).
//
// GET the whole lens payload for one venture; PUT the founder's placement. Placement is the one write
// this surface allows — mirrors routes.mjs's own posture (the founder-authority boundary, when one
// applies, lives one layer down; this file only turns a URL + body into that call's arguments). A
// placement write carries no outward effect and touches nothing but where things sit on the canvas, so
// it is not founder-authority-gated the way wall.decide() is — any authenticated venture-scoped caller
// may drag a node. Venture existence is still fail-closed: an unknown ventureId 404s via
// venture-store.mjs's own assertVentureExists, surfaced here as a plain error response.
//
// Also carries the portfolio door — GET/POST /api/ventures (list/create) — because F6's shell (FirmApp)
// is the first surface that needs to open or start a venture at all, and no other route file owns the
// bare venture collection yet. Creating a venture is a real founder act (it starts a new isolated
// machine — FIRM-SPEC.md rail 6), so POST runs through the same authorizeFounderWriteForRequest boundary
// wall.decide() stands on; listing is a read, ungated like the lens GET above.
import { json, readBody } from "../routes/util.mjs";
import { buildLens, putPlacement, PersistenceConflictError } from "./lens.mjs";
import { createVenture, listVentures } from "./venture-store.mjs";
import { authorizeFounderWriteForRequest } from "../routes/session-guard.mjs";

function statusFor(err) {
  if (err instanceof PersistenceConflictError) return 409;
  if (err?.code === "venture_not_found") return 404;
  if (err?.code === "founder_decision_forbidden") return 403;
  return Number.isInteger(err?.status) ? err.status : 400;
}

export default async function handle({ req, res, url }) {
  if (url.pathname === "/api/ventures") {
    if (req.method === "GET") {
      json(res, 200, { ventures: listVentures() });
      return true;
    }
    if (req.method === "POST") {
      try {
        authorizeFounderWriteForRequest(req, "Starting a venture");
        const body = await readBody(req);
        const venture = createVenture({ name: body?.name, repository: body?.repository });
        json(res, 200, { venture });
      } catch (err) {
        json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }
  }

  const lensMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/lens$/);
  if (req.method === "GET" && lensMatch) {
    const ventureId = decodeURIComponent(lensMatch[1]);
    try {
      json(res, 200, { lens: buildLens(ventureId) });
    } catch (err) {
      json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const placementMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/placement$/);
  if (req.method === "PUT" && placementMatch) {
    const ventureId = decodeURIComponent(placementMatch[1]);
    try {
      const body = await readBody(req);
      const placement = putPlacement(ventureId, {
        positions: body?.positions,
        expectedRevision: body?.expectedRevision,
      });
      json(res, 200, { placement });
    } catch (err) {
      json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
