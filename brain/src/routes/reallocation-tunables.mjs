// Reallocation tunables (read + write) — the aggressiveness knobs, founder-tunable, beside signal-weights.
//
// LEARN's reallocation loop (Area 3) is governed by three TASTE-CALL numbers the founder owns, not a
// hardcoded policy buried in the loop (GTM-MACHINE.md "Open decisions" #4): the observation floor (how
// many measured outcomes before a motion's lift moves the ranking), the tilt clamp (how far a learned
// tilt may move a base weight), and the daily probe cap (the hard ceiling on paid MCP probe credits).
//
// This surface only tunes how the machine reallocates and what always-on costs — it sends, publishes,
// and charges nothing, so it sits entirely on the founder's side of the gate. It renders beside the
// signal-weights surface: same shape (GET the active table + keys + defaults; PUT a tuned table), so the
// UI reuses the same tuning pattern.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import {
  getReallocationTunables,
  saveReallocationTunables,
  REALLOCATION_TUNABLE_KEYS,
  DEFAULT_REALLOCATION_TUNABLES,
} from "../reallocation-tunables-store.mjs";
import { reallocationReceipt } from "../reallocation.mjs";

export default async function handle({ req, res, url }) {
  // The receipt read (Area 3): what the machine tilted, why, from which outcomes, and which motions are
  // flagged as starved — the Overdrive card the batch renders. Pure read, never triggers or gates.
  if (url.pathname === "/api/reallocation") {
    if (req.method === "GET") {
      try {
        const project = loadProject();
        json(res, 200, reallocationReceipt(project.id));
      } catch (err) {
        json(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }
    return false;
  }

  if (url.pathname !== "/api/reallocation-tunables") return false;

  // The active tunables for the current project, plus the key order and stated defaults the UI needs to
  // render the tuning surface. A project with nothing stored returns the stated defaults.
  if (req.method === "GET") {
    try {
      const project = loadProject();
      json(res, 200, {
        tunables: getReallocationTunables({ projectId: project.id }),
        keys: REALLOCATION_TUNABLE_KEYS,
        defaults: DEFAULT_REALLOCATION_TUNABLES,
      });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Persist a founder-tuned table for the current project. Accept either { tunables: {...} } or a bare
  // table body; the store normalizes and bounds every value before writing and returns exactly what the
  // loop will read back. projectId is forced to the loaded project so a body can't target another.
  if (req.method === "PUT") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const tunables = saveReallocationTunables(body.tunables ?? body, { projectId: project.id });
      json(res, 200, { tunables });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
