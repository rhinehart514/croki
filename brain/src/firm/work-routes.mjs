// work-routes.mjs — the firm's inward-work HTTP surface (thin; venture-scoped; fails closed).
//
// POST one drive of driveTeammate (F2's work-loop.mjs) — the only route in the firm core that starts
// or resumes a teammate. Deliberately NOT founder-gated at the door: a drive can only stage local work
// (fork bets, stage drafts/evidence) and, for anything that would touch the world, park at the wall
// (F3) — it can never release, decide, kill, or set heat. That is the wall's own construction (this
// route adds no capability of its own), so it is safe for the MCP agent door (mcp-tools.mjs) to reach
// unattended, exactly like fork_product_bet already is at product-routes.mjs's own stage endpoint.
//
// This file is new, appended to server.mjs's ROUTE_GROUPS separately — nothing here edits routes.mjs,
// heat.mjs, work-loop.mjs, or wall.mjs.
import { json, readBody } from "../routes/util.mjs";
import { driveTeammate } from "./work-loop.mjs";

export default async function handle({ req, res, url }) {
  const driveMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/drive$/);
  if (req.method !== "POST" || !driveMatch) return false;
  const ventureId = decodeURIComponent(driveMatch[1]);

  try {
    const body = await readBody(req);
    const result = await driveTeammate({
      ventureId,
      teammateRef: body?.teammateRef,
      goal: body?.goal,
      betId: body?.betId ?? null,
      model: body?.model ?? null,
    });
    json(res, 200, { outcome: result.outcome, work: result.work });
  } catch (err) {
    json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
  }
  return true;
}
