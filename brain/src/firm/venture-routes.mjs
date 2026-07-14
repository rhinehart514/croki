// venture-routes.mjs — the firm's portfolio + bet read HTTP surface (thin; read-only; fails closed).
//
// GET the venture list, one venture's manifest, a venture's bets, and one bet. All are open reads — no
// founder-authority boundary, exactly like lens-routes.mjs's own lens GET — because a manifest, a bet, and
// the portfolio list carry no outward capability of their own; anything a bet's staged content would
// actually release still has to cross the wall (routes.mjs). getVentureDoc/listVentureDocs already
// fail closed on an unknown ventureId (venture_not_found), surfaced here as a plain 404. This file is
// new, appended to server.mjs's ROUTE_GROUPS separately — nothing here edits routes.mjs, lens.mjs, or
// venture-store.mjs.
import { json } from "../routes/util.mjs";
import { listVentures, openVenture, getVentureDoc, listVentureDocs } from "./venture-store.mjs";

function fail(res, err) {
  const status = err?.code === "venture_not_found" ? 404 : (Number.isInteger(err?.status) ? err.status : 400);
  json(res, status, { error: err instanceof Error ? err.message : String(err) });
}

export default async function handle({ req, res, url }) {
  if (req.method !== "GET") return false;

  if (url.pathname === "/api/ventures") {
    json(res, 200, { ventures: listVentures() });
    return true;
  }

  const getMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)$/);
  if (getMatch) {
    const ventureId = decodeURIComponent(getMatch[1]);
    const venture = openVenture(ventureId);
    if (!venture) {
      json(res, 404, { error: `No such venture: ${ventureId}` });
      return true;
    }
    json(res, 200, { venture });
    return true;
  }

  const betsMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/bets$/);
  if (betsMatch) {
    const ventureId = decodeURIComponent(betsMatch[1]);
    try {
      json(res, 200, { bets: listVentureDocs(ventureId, "bets") });
    } catch (err) { fail(res, err); }
    return true;
  }

  const betMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/bets\/([^/]+)$/);
  if (betMatch) {
    const ventureId = decodeURIComponent(betMatch[1]);
    const betId = decodeURIComponent(betMatch[2]);
    try {
      const bet = getVentureDoc(ventureId, "bets", betId);
      if (!bet) {
        json(res, 404, { error: `No such bet: ${betId}` });
        return true;
      }
      json(res, 200, { bet });
    } catch (err) { fail(res, err); }
    return true;
  }

  return false;
}
