import { json, readBody } from "./util.mjs";
import { reportFriction, listFrictionQueue } from "../friction.mjs";
import { enqueueFeatureRequest } from "../feature-builder.mjs";
import { runtimeStatusesLive } from "../runtimes/index.mjs";
import { capabilityInventory } from "../connected-read-capabilities.mjs";
import crypto from "node:crypto";
import { authorizeFounderWriteForRequest, founderAuthorityStatus } from "./founder-authority.mjs";
import { openVenture } from "../firm/venture-store.mjs";

const startedAt = new Date().toISOString();
const instanceId = crypto.randomUUID();

export function shellStatus() {
  return {
    ok: true,
    instanceId,
    startedAt,
    now: new Date().toISOString(),
    founderAuthority: founderAuthorityStatus(),
  };
}

export default async function handle({ req, res, url }) {
  if (url.pathname === "/api/health" && req.method === "GET") {
    json(res, 200, shellStatus());
    return true;
  }

  if (url.pathname === "/api/runtimes" && req.method === "GET") {
    const ventureId = String(url.searchParams.get("ventureId") ?? "").trim();
    const venture = ventureId ? openVenture(ventureId) : null;
    json(res, 200, { runtimes: await runtimeStatusesLive({ cwd: venture?.repository ?? null }) });
    return true;
  }

  if (url.pathname === "/api/capabilities" && req.method === "GET") {
    json(res, 200, { capabilities: capabilityInventory() });
    return true;
  }

  if (url.pathname === "/api/friction" && req.method === "GET") {
    try {
      json(res, 200, listFrictionQueue());
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === "/api/friction" && req.method === "POST") {
    try {
      const initiatedByAgent = String(req.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase() === "agent";
      if (!initiatedByAgent) authorizeFounderWriteForRequest(req, "Recording founder friction");
      const body = await readBody(req);
      const report = String(body?.report ?? "").trim();
      if (!report) throw new Error("A friction report needs the words — what got in the way?");
      const record = reportFriction({
        report,
        kind: body?.kind,
        context: body?.context,
        snapshot: body?.snapshot && typeof body.snapshot === "object" ? { caller: body.snapshot } : {},
        source: initiatedByAgent ? "mcp" : body?.source ?? "api",
        ventureId: body?.ventureId ?? null,
      });
      json(res, 201, record);
    } catch (error) {
      json(res, Number.isInteger(error?.status) ? error.status : 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === "/api/feature-request" && req.method === "POST") {
    try {
      const initiatedByAgent = String(req.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase() === "agent";
      if (!initiatedByAgent) authorizeFounderWriteForRequest(req, "Starting a product change request");
      const body = await readBody(req);
      const report = String(body?.report ?? "").trim();
      if (!report) throw new Error("A feature request needs the words — what should Croki be able to do?");
      const record = enqueueFeatureRequest({
        report,
        context: body?.context,
        snapshot: body?.snapshot && typeof body.snapshot === "object" ? { caller: body.snapshot } : {},
        source: initiatedByAgent ? "mcp" : body?.source ?? "api",
        provider: body?.provider,
        model: body?.model,
        ventureId: body?.ventureId ?? null,
      });
      json(res, 202, {
        file: record.file,
        status: record.status,
        capturedAt: record.capturedAt,
        note: "Build queued. Any result remains an uncommitted isolated worktree for founder review.",
      });
    } catch (error) {
      json(res, Number.isInteger(error?.status) ? error.status : 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  return false;
}
