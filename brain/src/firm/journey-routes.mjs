import path from "node:path";

import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { deleteJourneyImport, stageJourneyImport } from "./journey-import.mjs";
import {
  adoptJourneyImport,
  listJourneyObservations,
  previewJourneyImport,
} from "./journey-observations.mjs";
import {
  getJourneyMappingProposal,
  listJourneyMappingProposals,
} from "./journey-mapping-proposals.mjs";
import { emitFirmEvent } from "./firm-events.mjs";

const STAGE_BODY_LIMIT = 17 * 1024 * 1024;

function firmOptions() {
  const home = process.env.GTM_IDE_HOME;
  return home ? { root: home, queueDir: path.join(home, "dogfood", "queue") } : {};
}

function fail(res, error) {
  const status = error?.code === "venture_not_found" || String(error?.code ?? "").endsWith("_not_found")
    ? 404
    : Number.isInteger(error?.status) ? error.status : 400;
  json(res, status, {
    error: error instanceof Error ? error.message : String(error),
    ...(error?.code ? { code: error.code } : {}),
    ...(Number.isInteger(error?.expectedPageModelRevision) ? { expectedPageModelRevision: error.expectedPageModelRevision } : {}),
    ...(Number.isInteger(error?.currentPageModelRevision) ? { currentPageModelRevision: error.currentPageModelRevision } : {}),
  });
}

export default async function handle({ req, res, url }) {
  const collection = url.pathname.match(/^\/api\/ventures\/([^/]+)\/journey-(imports|observations)$/);
  const item = url.pathname.match(/^\/api\/ventures\/([^/]+)\/journey-imports\/([^/]+)(?:\/(preview|adopt))?$/);
  const proposals = url.pathname.match(/^\/api\/ventures\/([^/]+)\/journey-mapping-proposals(?:\/([^/]+))?$/);
  if (!collection && !item && !proposals) return false;

  try {
    if (req.method === "GET" && proposals?.[2]) {
      const proposal = getJourneyMappingProposal(
        decodeURIComponent(proposals[1]),
        decodeURIComponent(proposals[2]),
        firmOptions(),
      );
      json(res, 200, { proposal });
      return true;
    }
    if (req.method === "GET" && proposals) {
      const ventureId = decodeURIComponent(proposals[1]);
      const importRef = url.searchParams.get("importRef");
      json(res, 200, { proposals: listJourneyMappingProposals(ventureId, importRef, firmOptions()) });
      return true;
    }
    if (req.method === "GET" && collection?.[2] === "observations") {
      const result = listJourneyObservations(decodeURIComponent(collection[1]), firmOptions());
      json(res, 200, result);
      return true;
    }
    if (req.method === "POST" && collection?.[2] === "imports") {
      authorizeFounderWriteForRequest(req, "Importing observed journey evidence");
      const body = await readBody(req, { maxBytes: STAGE_BODY_LIMIT });
      const profile = stageJourneyImport(decodeURIComponent(collection[1]), body, firmOptions());
      json(res, 201, { import: profile });
      return true;
    }
    if (req.method === "POST" && item?.[3] === "preview") {
      authorizeFounderWriteForRequest(req, "Checking a journey mapping");
      const body = await readBody(req);
      const preview = previewJourneyImport(
        decodeURIComponent(item[1]),
        decodeURIComponent(item[2]),
        body,
        firmOptions(),
      );
      json(res, 200, { preview });
      return true;
    }
    if (req.method === "POST" && item?.[3] === "adopt") {
      authorizeFounderWriteForRequest(req, "Adopting observed journey evidence");
      const body = await readBody(req);
      const result = adoptJourneyImport(
        decodeURIComponent(item[1]),
        decodeURIComponent(item[2]),
        body,
        firmOptions(),
      );
      emitFirmEvent(decodeURIComponent(item[1]), "system");
      json(res, 201, result);
      return true;
    }
    if (req.method === "DELETE" && item && !item[3]) {
      authorizeFounderWriteForRequest(req, "Removing a staged journey import");
      deleteJourneyImport(decodeURIComponent(item[1]), decodeURIComponent(item[2]), firmOptions());
      json(res, 200, { deleted: true });
      return true;
    }
    json(res, 405, { error: "Method not allowed." });
  } catch (error) {
    fail(res, error);
  }
  return true;
}
