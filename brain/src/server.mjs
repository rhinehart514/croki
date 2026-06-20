#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTrackingFix } from "./build.mjs";
import { loadFlow, recordFlowRun, saveFlow } from "./flow-store.mjs";
import { defaultTemplate, listConnectors, runPipeline } from "./pipeline.mjs";
import { defaultGraphTemplate, runGraph } from "./graph.mjs";
import {
  applyRevision,
  createRevision,
  inspectApplyReadiness,
  reviewRevision,
  revertRevision,
} from "./revision.mjs";
import { scanRepo } from "./scan.mjs";
import {
  addDecision,
  addRevision,
  getWorkspace,
  listWorkspaces,
  openWorkspace,
  rescanWorkspace,
  updateRevision,
} from "./workspace.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.resolve(here, "../../ui/dist");
const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) reject(new Error("Request body too large."));
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("Request body must be valid JSON.")); }
    });
    req.on("error", reject);
  });
}

function expandHome(v) {
  if (typeof v !== "string") return "";
  if (v === "~") return process.env.HOME || v;
  if (v.startsWith("~/")) return path.join(process.env.HOME || "", v.slice(2));
  return v;
}

function serveFile(reqPath, res) {
  if (!fs.existsSync(uiRoot)) {
    json(res, 503, { error: "UI not built. Run `npm run build`." });
    return;
  }
  const relative = reqPath === "/" ? "index.html" : reqPath.replace(/^\/+/, "");
  let file = path.resolve(uiRoot, relative);
  if (!file.startsWith(uiRoot)) { json(res, 403, { error: "Forbidden." }); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(uiRoot, "index.html");
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    "Cache-Control": file.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

  // Health
  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, { ok: true }); return;
  }

  // Durable GTM workspaces
  if (req.method === "GET" && url.pathname === "/api/workspaces") {
    json(res, 200, { workspaces: listWorkspaces() }); return;
  }

  if (req.method === "POST" && url.pathname === "/api/workspaces/open") {
    try {
      const body = await readBody(req);
      const workspace = openWorkspace(expandHome(body.repoPath), body.outcome || body.winEvent);
      json(res, 200, { workspace });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const workspaceMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (req.method === "GET" && workspaceMatch) {
    try { json(res, 200, { workspace: getWorkspace(workspaceMatch[1]) }); }
    catch (err) { json(res, 404, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const rescanMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/rescan$/);
  if (req.method === "POST" && rescanMatch) {
    try { json(res, 200, { workspace: rescanWorkspace(rescanMatch[1]) }); }
    catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const revisionsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions$/);
  if (req.method === "POST" && revisionsMatch) {
    try {
      const workspace = getWorkspace(revisionsMatch[1]);
      if (!workspace.report.gaps?.some((gap) => gap.status === "proven")) {
        throw new Error("A proven repository gap is required before creating a change set.");
      }
      const revision = await createRevision(workspace);
      json(res, 200, {
        workspace: addRevision(workspace.id, revision),
        revision,
        error: revision.error,
      });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const reviewMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions\/([^/]+)\/review$/);
  if (req.method === "POST" && reviewMatch) {
    try {
      const body = await readBody(req);
      const workspace = updateRevision(
        reviewMatch[1],
        reviewMatch[2],
        (revision) => reviewRevision(revision, body.decision, body.note),
      );
      const reviewed = workspace.revisions.find((revision) => revision.id === reviewMatch[2]);
      const withDecision = addDecision(workspace.id, {
        type: "revision_review",
        revisionId: reviewMatch[2],
        decision: body.decision,
        note: String(body.note || "").trim(),
        summary: `${body.decision === "approve" ? "Approved" : "Rejected"} ${reviewMatch[2]}.`,
      });
      json(res, 200, { workspace: withDecision, revision: reviewed });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const readinessMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions\/([^/]+)\/readiness$/);
  if (req.method === "GET" && readinessMatch) {
    try {
      const workspace = getWorkspace(readinessMatch[1]);
      const revision = workspace.revisions.find((item) => item.id === readinessMatch[2]);
      if (!revision) throw new Error(`Revision not found: ${readinessMatch[2]}`);
      json(res, 200, { readiness: inspectApplyReadiness(workspace, revision) });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const revisionActionMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions\/([^/]+)\/(apply|revert)$/);
  if (req.method === "POST" && revisionActionMatch) {
    try {
      const body = await readBody(req);
      const workspace = getWorkspace(revisionActionMatch[1]);
      const revision = workspace.revisions.find((item) => item.id === revisionActionMatch[2]);
      if (!revision) throw new Error(`Revision not found: ${revisionActionMatch[2]}`);
      const action = revisionActionMatch[3];
      const nextRevision = action === "apply"
        ? applyRevision(workspace, revision, body.confirm === true)
        : revertRevision(workspace, revision, body.confirm === true);
      const updated = updateRevision(workspace.id, revision.id, () => nextRevision);
      const withDecision = addDecision(updated.id, {
        type: `revision_${action}`,
        revisionId: revision.id,
        decision: action,
        summary: `${action === "apply" ? "Applied" : "Reverted"} ${revision.id}.`,
      });
      json(res, 200, { workspace: withDecision, revision: nextRevision });
    } catch (err) { json(res, 409, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // Funnel scan
  if (req.method === "POST" && url.pathname === "/api/scan") {
    try {
      const body = await readBody(req);
      const report = scanRepo(expandHome(body.repoPath), {
        winEvent: typeof body.winEvent === "string" && body.winEvent.trim() ? body.winEvent.trim() : "project_created",
      });
      json(res, 200, report);
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // Code repair
  if (req.method === "POST" && url.pathname === "/api/build") {
    try {
      const body = await readBody(req);
      if (!body.report || typeof body.report !== "object") throw new Error("A grounded scan report is required.");
      const result = await buildTrackingFix(body.report);
      json(res, result.ok ? 200 : 422, result);
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // Connector registry
  if (req.method === "GET" && url.pathname === "/api/connectors") {
    json(res, 200, { connectors: listConnectors() }); return;
  }

  // Pipeline default template
  if (req.method === "GET" && url.pathname === "/api/pipeline/template") {
    json(res, 200, { pipeline: defaultTemplate() }); return;
  }

  // Pipeline run (multi-channel)
  if (req.method === "POST" && url.pathname === "/api/pipeline/run") {
    try {
      const body = await readBody(req);
      if (!body.pipeline || !Array.isArray(body.pipeline.channels)) {
        throw new Error("Request must include a pipeline object with a channels array.");
      }
      const result = await runPipeline(body.pipeline);
      json(res, result.ok ? 200 : 422, result);
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // GTM Graph — default template
  if (req.method === "GET" && url.pathname === "/api/graph/template") {
    const fallback = defaultGraphTemplate();
    const saved = loadFlow(fallback.id, fallback);
    json(res, 200, {
      graph: saved.graph,
      runs: saved.runs.slice(-10).map((run) => run.result),
    }); return;
  }

  if (req.method === "POST" && url.pathname === "/api/graph/save") {
    try {
      const body = await readBody(req);
      if (!body.graph || !Array.isArray(body.graph.nodes)) {
        throw new Error("Request must include a graph object with a nodes array.");
      }
      const saved = saveFlow(body.graph);
      json(res, 200, { graph: saved.graph, savedAt: saved.updatedAt });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // GTM Graph — run
  if (req.method === "POST" && url.pathname === "/api/graph/run") {
    try {
      const body = await readBody(req);
      if (!body.graph || !Array.isArray(body.graph.nodes)) {
        throw new Error("Request must include a graph object with a nodes array.");
      }
      const result = await runGraph(body.graph, {
        targetNodeId: typeof body.targetNodeId === "string" ? body.targetNodeId : undefined,
        approvals: body.approvals && typeof body.approvals === "object" ? body.approvals : {},
      });
      const saved = recordFlowRun(body.graph, result);
      // Graph failures are domain results. Return the full per-node result so
      // the client can render partial success, blocked nodes, and recovery.
      json(res, 200, {
        ...result,
        storedRunCount: saved.runs.length,
        storedAt: saved.updatedAt,
      });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // Static files
  if (req.method === "GET") { serveFile(url.pathname, res); return; }

  json(res, 405, { error: "Method not allowed." });
});

server.listen(port, host, () => {
  console.log(`GTM IDE running at http://${host}:${port}`);
  const connectors = listConnectors();
  const ready = connectors.filter((c) => c.configured && !c.stub);
  const stubs = connectors.filter((c) => c.stub);
  if (ready.length) console.log(`  Connectors ready: ${ready.map((c) => c.name).join(", ")}`);
  if (stubs.length) console.log(`  Connectors stubbed: ${stubs.map((c) => c.name).join(", ")}`);
});
