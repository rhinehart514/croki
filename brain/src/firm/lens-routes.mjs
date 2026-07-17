// lens-routes.mjs — the lens's HTTP surface (thin; venture-scoped; fails closed).
//
// GET the whole lens payload for one venture; PUT the founder's placement. Placement is the one write
// this surface allows — mirrors routes.mjs's own posture (the founder-authority boundary, when one
// applies, lives one layer down; this file only turns a URL + body into that call's arguments). A
// placement write carries no outward effect, but it is still the founder changing the durable lens.
// It therefore uses the same host-issued capability as every other founder write. Venture existence
// is still fail-closed: an unknown ventureId 404s via
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
import { runFirstRun } from "./first-run.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";

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
        // A new founder venture must not silently imply a pre-existing crew (Product Law 1, §Anti-laws:
        // no permanent AI staff). It opens with connected Claude/Codex runtime capability and no persistent
        // specialist; the first founder direction forms the first participant explicitly.
        const venture = createVenture({ name: body?.name, repository: body?.repository }, { seedFoundingCrew: false });
        // First run (Phase 7): read the bound product back on the canvas as a correctable working theory
        // and offer concrete repo-derived directions in the conversation. It never sends anything outward.
        // A first-run failure must not fail the create — the venture still opens; the read-back is a
        // convenience the founder can trigger by asking, not a gate on entry.
        try {
          runFirstRun({ ventureId: venture.id, repository: venture.repository, ventureName: venture.name });
        } catch {
          // Honest degradation: an unreadable repository leaves the venture without a first read-back.
        }
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
      authorizeFounderWriteForRequest(req, "Changing the canvas placement");
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
