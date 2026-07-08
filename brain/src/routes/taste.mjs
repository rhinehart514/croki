// Design taste (write) — the wire that lets a founder PERSIST their front-end house style and
// reference screens. Until now saveDesignState/addReference were test-only, so visual agents always
// read houseStyleSeed() defaults and the founder's flagged screens went nowhere. These three routes
// give the already-built DesignState writers real HTTP.
//
// This is TASTE, not the gate: writing a house style or a reference never sends, publishes, or
// approves anything. It only shapes what a later visual agent reads before it drafts.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import {
  getDesignState,
  saveDesignState,
  buildDesignState,
  addReference,
} from "../design-state-store.mjs";

export default async function handle({ req, res, url }) {
  // Read the founder's persisted DesignState for the active project — falls back to the seeded house
  // style when none is saved yet, so a fresh project still returns a usable default.
  if (req.method === "GET" && url.pathname === "/api/design-state") {
    try {
      const project = loadProject();
      json(res, 200, { designState: getDesignState(project.id) });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Persist an edited house style / feeling / dimensions / references for the active project. The
  // projectId is FORCED to the loaded project's id — a client-supplied projectId is never trusted, so
  // one project can never overwrite another's taste. saveDesignState normalizes and stores it; the
  // returned state is what a visual agent will now read instead of the seed.
  if ((req.method === "PUT" || req.method === "POST") && url.pathname === "/api/design-state") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const state = buildDesignState({
        projectId: project.id,
        houseStyle: body?.houseStyle,
        feeling: body?.feeling,
        dimensions: body?.dimensions,
        references: body?.references,
      }, {});
      const designState = saveDesignState({ ...state, projectId: project.id });
      json(res, 200, { designState });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Flag one reference screen (a Mobbin curation or a live URL) — it joins the project's library and
  // re-marks whatever dimensions it anchors as grounded. Same projectId-forcing rule.
  if (req.method === "POST" && url.pathname === "/api/design-state/references") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const designState = addReference(project.id, body?.reference ?? {});
      json(res, 200, { designState });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
