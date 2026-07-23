// Presence routes — the away / unattended state (EXPERIMENT-MACHINE-SPEC rail 1).
//
// The founder's browser POSTs a heartbeat on an interval while the page is open; the backend keeps a
// volatile lease that lapses to "away" when the heartbeats stop (tab closed, laptop asleep, page crashed).
// The GET returns the current state for the always-visible indicator. This is AUTOMATIC detection — the
// founder's recommended default — with a visible chip, never a silent guess and never a manual toggle the
// founder must remember to flip. The mechanism is swappable: a future manual toggle would POST the same
// heartbeat/away endpoints; only the browser driver changes, not this surface or presence.mjs.
//
// FOUNDER WRITE (EXPERIMENT-MACHINE-SPEC rail 1, FIX 2c). Marking "present" REMOVES a safety hold, so
// agent-stamped traffic cannot do it. The loopback Croki page can heartbeat directly; a missing request
// still fails closed. The GET stays open because a read removes no hold, and the lease lapses to away.
import { json, readBody } from "./util.mjs";
import { markPresent, markAway, getPresence } from "../presence.mjs";
import { authorizeFounderWriteForRequest } from "./founder-authority.mjs";

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
    // Marking PRESENT removes a safety hold, so it must come through the local founder page boundary.
    // Marking AWAY only ADDS a hold, so it is always allowed — a
    // caller can freely make the system MORE conservative, never less.
    if (body.away !== true) {
      try {
        authorizeFounderWriteForRequest(req, "Marking the founder present");
      } catch (err) {
        // A page not opened by the desktop host cannot mark the founder present — but a heartbeat is a
        // benign keep-alive, not a decision, and this is a VALID state (a dev/browser harness, or the
        // desktop host not yet attached). The conservative default already models it: the lease simply
        // is not renewed and lapses to "away". So answer the heartbeat with the current presence (200),
        // never a 400/503 the browser logs as if the app were broken. A genuine refusal — an
        // agent-stamped request or non-local origin (403) — still fails closed so a model cannot lift
        // the away hold.
        if (err?.status === 403) {
          json(res, 403, { error: err instanceof Error ? err.message : String(err) });
          return true;
        }
        json(res, 200, getPresence());
        return true;
      }
    }
    const presence = body.away === true ? markAway("explicit") : markPresent("heartbeat");
    json(res, 200, presence);
    return true;
  }

  return false;
}
