import { json, readBody } from "./util.mjs";
import { reportFriction, listFrictionQueue } from "../friction.mjs";
import { enqueueFeatureRequest } from "../feature-builder.mjs";
import { claimFounderSession, requestHasSessionToken } from "./session-guard.mjs";

export default async function handle({ req, res, url }) {
  if (url.pathname === "/api/founder-session" && req.method === "GET") {
    json(res, 200, { authenticated: requestHasSessionToken(req) });
    return true;
  }

  if (url.pathname === "/api/founder-session" && req.method === "POST") {
    try {
      const body = await readBody(req);
      if (!claimFounderSession(req, res, body?.code)) {
        json(res, 403, { error: "That founder action code was not accepted." });
        return true;
      }
      json(res, 200, { authenticated: true });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    json(res, 200, { ok: true });
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
      const body = await readBody(req);
      const report = String(body?.report ?? "").trim();
      if (!report) throw new Error("A friction report needs the words — what got in the way?");
      const record = reportFriction({
        report,
        kind: body?.kind,
        context: body?.context,
        snapshot: body?.snapshot && typeof body.snapshot === "object" ? { caller: body.snapshot } : {},
        source: body?.source ?? "api",
        ventureId: body?.ventureId ?? null,
      });
      json(res, 201, record);
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === "/api/feature-request" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const report = String(body?.report ?? "").trim();
      if (!report) throw new Error("A feature request needs the words — what should Drover be able to do?");
      const record = enqueueFeatureRequest({
        report,
        context: body?.context,
        snapshot: body?.snapshot && typeof body.snapshot === "object" ? { caller: body.snapshot } : {},
        source: body?.source ?? "api",
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
      json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  return false;
}
