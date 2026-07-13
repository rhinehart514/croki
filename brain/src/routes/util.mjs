// Shared HTTP + path utilities for the split route modules. These moved verbatim out of server.mjs
// when the single request handler was broken into per-domain route modules — behavior is identical.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This module lives in brain/src/routes/, one level deeper than the original server.mjs (brain/src/),
// so the on-disk anchors are recomputed to point at the SAME absolute locations they did before.
const here = path.dirname(fileURLToPath(import.meta.url));
export const srcDir = path.resolve(here, "..");
export const uiRoot = path.resolve(srcDir, "../../ui/dist");

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// The on-disk agent roster — every subagent definition with the one-line description from its
// frontmatter. Shared by the library listing and the bench so the two never drift on which agents
// exist or how they're named. Read-only; returns [] when there is no agents directory.
export function listLibraryAgents() {
  const agentsDir = path.join(os.homedir(), ".claude", "agents");
  const firstDescription = (text) => {
    const m = text.match(/^description:\s*(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, "").slice(0, 160) : "";
  };
  try {
    return fs.readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        let description = "";
        try { description = firstDescription(fs.readFileSync(path.join(agentsDir, f), "utf8")); } catch { /* name only */ }
        return { ref: f.replace(/\.md$/, ""), description };
      })
      .sort((a, b) => a.ref.localeCompare(b.ref));
  } catch {
    return [];
  }
}

export function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

// Read a request body as RAW text (no JSON.parse), for the CSV drop route where the body is a
// pasted/uploaded spreadsheet, not JSON. Same 100k guard as readBody.
export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let receivedBytes = 0;
    let tooLarge = false;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      if (tooLarge) return;
      receivedBytes += Buffer.byteLength(chunk, "utf8");
      if (receivedBytes > 100_000) {
        tooLarge = true;
        body = "";
        reject(new Error("Request body too large."));
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (!tooLarge) resolve(body);
    });
    req.on("error", reject);
  });
}

export async function readBody(req) {
  const body = await readRawBody(req);
  try { return body ? JSON.parse(body) : {}; }
  catch { throw new Error("Request body must be valid JSON."); }
}

export function expandHome(v) {
  if (typeof v !== "string") return "";
  if (v === "~") return process.env.HOME || v;
  if (v.startsWith("~/")) return path.join(process.env.HOME || "", v.slice(2));
  return v;
}

// The pipeline's own offer/deal for a graph, when the graph belongs to a channel that carries one.
// Passed into applySharedContextToGraph so a run's drafting steps honor the pipeline's deal without
// the founder restating it; null falls back to the project-level sharedContext.offer there.
export function channelOfferFor(project, graphId) {
  if (!graphId) return null;
  const channel = (project?.channels ?? []).find((c) => c.graphId === graphId || c.id === graphId);
  return channel?.offer ?? null;
}

export function serveFile(reqPath, res) {
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
