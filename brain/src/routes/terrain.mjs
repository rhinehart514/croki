// Canonical project-scoped terrain HTTP surface. GET is deterministic and read-only. Lane A owns the
// rented reader; the factory accepts it as `runTerrainRead` so integration can add POST behavior without
// this module importing a provider, prompt, runtime, or not-yet-landed implementation.
import { getTerrainView } from "../operating-view.mjs";
import { json, readBody } from "./util.mjs";

export function createTerrainRoutes({
  projectTerrain = getTerrainView,
  projectionOptionsForProject = () => ({}),
  runTerrainRead = null,
} = {}) {
  return async function handle({ req, res, url }) {
    const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/terrain(?:\/(read))?$/);
    if (!match) return false;
    const projectId = decodeURIComponent(match[1]);

    if (req.method === "GET" && !match[2]) {
      try {
        // This hook may only return already-materialized projection inputs. It must not invoke a model
        // or write state; generated reads belong to the explicit POST integration below.
        const options = await projectionOptionsForProject(projectId);
        json(res, 200, projectTerrain({ projectId }, options ?? {}));
      } catch (err) {
        json(res, 404, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    if (req.method === "POST" && match[2]) {
      if (typeof runTerrainRead !== "function") {
        json(res, 501, { error: "The provider-neutral terrain reader is not connected." });
        return true;
      }
      try {
        const body = await readBody(req);
        const read = await runTerrainRead({ projectId, model: body.model, focusRef: body.focusRef ?? null, request: req });
        json(res, 200, read);
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    return false;
  };
}

export default createTerrainRoutes();
