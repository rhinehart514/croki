// routes.mjs — the firm's HTTP surface (thin; venture-scoped; fails closed).
//
// F3 slice: the wall queue. GET the founder's queue for one venture, POST a decision on one item. Every
// mutating call runs through wall.decide(), which is where founder authority, presence, and the deploy
// double-authorization all actually live — this file's only job is turning a URL + body into that call's
// arguments and turning its result (or its refusal) into an HTTP response. No new authority is invented
// here: authorizeFounderWriteForRequest inside decide() is the same guard every other founder-only route
// in this tree already stands on (routes/presence.mjs, routes/crew.mjs).
import { json, readBody } from "../routes/util.mjs";
import { queue, queueAll, decide } from "./wall.mjs";
import { listVentures } from "./venture-store.mjs";
import { authorizeFounderWriteForRequest } from "../routes/session-guard.mjs";
import { decideWithExecution } from "./effect-executors.mjs";

export default async function handle({ req, res, url }) {
  // The portfolio wall (F8): every venture's pending decisions in one surface. A founder-gated READ —
  // it aggregates across ventures, so it stands on the same authority boundary as a decide() write
  // rather than the ordinary open-GET convention a single venture's own queue uses below. Each
  // returned item still carries its own ventureId; deciding any of them still goes through the single
  // per-venture route beneath, which re-derives and re-checks everything from scratch — this route
  // grants no additional reach, it only lists.
  if (req.method === "GET" && url.pathname === "/api/wall") {
    try {
      authorizeFounderWriteForRequest(req, "Viewing the portfolio wall");
      json(res, 200, { queue: queueAll({ listVentureIds: (opts) => listVentures(opts).map((v) => v.id) }) });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const wallMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/wall$/);
  if (req.method === "GET" && wallMatch) {
    const ventureId = decodeURIComponent(wallMatch[1]);
    try {
      json(res, 200, { queue: queue(ventureId) });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const decideMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/wall\/([^/]+)\/decide$/);
  if (req.method === "POST" && decideMatch) {
    const ventureId = decodeURIComponent(decideMatch[1]);
    const itemId = decodeURIComponent(decideMatch[2]);
    try {
      const body = await readBody(req);
      // decideWithExecution wires the real executor (product-change apply, message send) into
      // wall.decide()'s executeEffect — without it a founder release throws "cannot release without
      // an executeEffect executor" and nothing outward can ever actually happen through this route.
      // The executor is built fresh per call from THIS request's own founder actor (decide() derives
      // the actor from the session, never the body — decideWithExecution/createEffectExecutor read
      // auth.actor the same way, so there is no second, weaker authority path here); it still checks
      // hasWallRelease exactly like the deploy/away/founder-only gates decide() already enforces —
      // this wiring adds a real destination for a release, never a second way to grant one.
      const receipt = decideWithExecution(
        decide,
        { ventureId, itemId, decision: body?.decision, note: body?.note ?? null },
        { req },
      );
      json(res, 200, { receipt });
    } catch (err) {
      // wall.decide() throws the founder-authority guard's own 403, the cross-venture 404, the
      // away-hold 409, and the deploy-confirmation 409 — each already carries its own status; anything
      // else (a bad decision string, a missing effect) is a plain 400.
      json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
