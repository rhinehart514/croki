// Presence routes — the away / unattended state (EXPERIMENT-MACHINE-SPEC rail 1).
//
// The founder's browser POSTs a heartbeat on an interval while the page is open; the backend keeps a
// volatile lease that lapses to "away" when the heartbeats stop (tab closed, laptop asleep, page crashed).
// The GET returns the current state for the always-visible indicator. This is AUTOMATIC detection — the
// founder's recommended default — with a visible chip, never a silent guess and never a manual toggle the
// founder must remember to flip. The mechanism is swappable: a future manual toggle would POST the same
// heartbeat/away endpoints; only the browser driver changes, not this surface or presence.mjs.
//
// AUTHENTICATED WRITE (EXPERIMENT-MACHINE-SPEC rail 1, FIX 2c). Marking "present" REMOVES a safety hold —
// it lets an unattended standing-autonomy pattern auto-approve a possibly-outward item — so the write must
// be founder-authenticated, exactly like a wall decision. A raw/tokenless or agent-stamped POST can no
// longer mark the founder present and drop the away-hold. The GET (the indicator read) stays open — a read
// removes no hold. Holding when uncertain (an unauthenticated caller cannot force "present") is always the
// safe direction: the lease simply lapses to away on its own.
import { json, readBody } from "./util.mjs";
import { markPresent, markAway, getPresence } from "../presence.mjs";
import { authorizeFounderWriteForRequest } from "./session-guard.mjs";

export default async function handle({ req, res, url }) {
  if (url.pathname !== "/api/presence") return false;

  // Read the current presence for the indicator chip. Pure read.
  if (req.method === "GET") {
    json(res, 200, getPresence());
    return true;
  }

  // Heartbeat (present) or explicit away. A body { away: true } drops to away immediately (the founder
  // closed the app or flipped a future manual toggle); anything else is a keep-alive heartbeat.
  if (req.method === "POST") {
    const body = (await readBody(req)) ?? {};
    // Marking PRESENT removes a safety hold, so it must come from the authenticated founder browser (same
    // two-factor guard as a wall decision). Marking AWAY only ADDS a hold, so it is always allowed — a
    // caller can freely make the system MORE conservative, never less.
    if (body.away !== true) {
      try {
        authorizeFounderWriteForRequest(req, "Marking the founder present");
      } catch (err) {
        json(res, err?.status === 403 ? 403 : 400, { error: err instanceof Error ? err.message : String(err) });
        return true;
      }
    }
    const presence = body.away === true ? markAway("explicit") : markPresent("heartbeat");
    json(res, 200, presence);
    return true;
  }

  return false;
}
