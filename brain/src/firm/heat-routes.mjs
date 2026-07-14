// heat-routes.mjs — the firm's heat dial HTTP surface (thin; venture-scoped; founder-gated).
//
// GET the venture's current heat + spend rail, POST a founder change to either. Mirrors firm/routes.mjs
// exactly: this file only turns a URL + body into a heat.mjs call and that call's result (or refusal)
// into an HTTP response — authorizeFounderWriteForRequest inside setHeatSettings() is where founder
// authority actually lives, the same guard every other founder-only route in this tree stands on.
import { json, readBody } from "../routes/util.mjs";
import { getHeatSettings, setHeatSettings } from "./heat.mjs";

function statusFor(err) {
  if (err?.code === "venture_not_found") return 404;
  return Number.isInteger(err?.status) ? err.status : 400;
}

export default async function handle({ req, res, url }) {
  const heatMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/heat$/);
  if (!heatMatch) return false;
  const ventureId = decodeURIComponent(heatMatch[1]);

  if (req.method === "GET") {
    try {
      json(res, 200, getHeatSettings(ventureId));
    } catch (err) {
      json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "POST") {
    try {
      const body = await readBody(req);
      const settings = setHeatSettings(
        { ventureId, heat: body?.heat, dailySpendUsd: body?.dailySpendUsd },
        { req },
      );
      json(res, 200, settings);
    } catch (err) {
      // setHeatSettings() throws the founder-authority guard's own 403 for anything not a real founder
      // browser session, a 404 for an unknown venture (venture_not_found); a bad heat word or a
      // negative spend rail is a plain 400.
      json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
