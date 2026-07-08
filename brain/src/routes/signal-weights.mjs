// Signal weights (write) — wires the founder-tunable path-ranking table to HTTP.
//
// Path ranking scores GTM paths as a weighted sum of seven signals (evidence strength, product
// readiness, channel reachability, measurement readiness, speed to test, upside, founder fit). HOW
// those trade off is a strategic judgment that belongs to the founder, so the weight VALUES live in a
// per-project taste snapshot (signal-weights-store) — not a frozen constant in the ranking code.
//
// Until now saveSignalWeights had no caller, so every project's ranking was pinned to the seed
// defaults. These two routes let the founder read the active table and persist a tuned one; the store
// already normalizes any table down to exactly the seven known keys, so a partial or malformed body
// can never break ranking. This surface only tunes ordering — it sends, publishes, or charges nothing,
// so it sits entirely on the founder's side of the gate.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import {
  getSignalWeights,
  saveSignalWeights,
  normalizeSignalWeights,
  SIGNAL_WEIGHT_KEYS,
  DEFAULT_SIGNAL_WEIGHTS,
} from "../signal-weights-store.mjs";

export default async function handle({ req, res, url }) {
  if (url.pathname !== "/api/signal-weights") return false;

  // Read the active table for the current project, plus the key order and seed defaults the UI needs
  // to render a tuning surface. A project with nothing stored returns today's exact defaults.
  if (req.method === "GET") {
    try {
      const project = loadProject();
      json(res, 200, {
        weights: getSignalWeights({ projectId: project.id }),
        keys: SIGNAL_WEIGHT_KEYS,
        defaults: DEFAULT_SIGNAL_WEIGHTS,
      });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Persist a founder-tuned table for the current project. Accept either { weights: {...} } or a bare
  // table body; the store normalizes to the seven known keys before writing and returns exactly what
  // ranking will read back. projectId is forced to the loaded project so a body can't target another.
  if (req.method === "PUT") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const weights = saveSignalWeights(body.weights ?? body, { projectId: project.id });
      json(res, 200, { weights });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}

// normalizeSignalWeights is imported to keep this module the single import surface for the weights
// store; re-export it so callers wiring a preview/validation path don't reach around this route.
export { normalizeSignalWeights };
