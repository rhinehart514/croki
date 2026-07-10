#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachTerminalServer } from "./terminal-server.mjs";
import { recoverStaleBuilds } from "./feature-builder.mjs";
import { listConnectors } from "./connectors/registry.mjs";
import { recoverInterruptedOperatorSessions } from "./operator-store.mjs";
import { startAmbientScheduler } from "./ambient-scheduler.mjs";
import { json, serveFile } from "./routes/util.mjs";
import { issueSessionCookie } from "./routes/session-guard.mjs";

// Per-domain route modules. The single request handler this file used to hold was split into these
// cohesive groups (behavior-preserving, W8): each exports `handle({ req, res, url })` that runs its
// slice of the original if-chain and returns `true` when it handled the request. The dispatch below
// calls them in the original route order, then falls through to the static-file + 405 tail — so the
// FIRST matching route still wins, exactly as when every route lived inline.
import systemRoutes from "./routes/system.mjs";
import projectRoutes from "./routes/projects.mjs";
import measureRoutes from "./routes/measure.mjs";
import objectGraphRoutes from "./routes/object-graph.mjs";
import runRoutes from "./routes/runs.mjs";
import marketRoutes from "./routes/market.mjs";
import inputRoutes from "./routes/inputs.mjs";
import ideaRoutes from "./routes/ideas.mjs";
import channelRoutes from "./routes/channels.mjs";
import inboxRoutes from "./routes/inbox.mjs";
import productModelRoutes from "./routes/product-model.mjs";
import terrainRoutes from "./routes/terrain.mjs";
import operationPlanRoutes from "./routes/operation-plan.mjs";
import tasteRoutes from "./routes/taste.mjs";
import signalWeightsRoutes from "./routes/signal-weights.mjs";
import reallocationTunablesRoutes from "./routes/reallocation-tunables.mjs";
import operatorRoutes from "./routes/operator.mjs";
import engineRoutes from "./routes/engine.mjs";
import workspaceRoutes from "./routes/workspaces.mjs";
import graphRoutes from "./routes/graph.mjs";
import artifactRoutes from "./routes/artifacts.mjs";
import crewRoutes from "./routes/crew.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Load <repoRoot>/.env.local so the team-sync config persists across restarts without exporting env by
// hand. Minimal KEY=VALUE parser; never overrides an already-set var. CONVEX_URL (written by
// `npx convex dev`) is mapped to GTM_IDE_CONVEX_URL when the latter isn't set, so wiring a team needs
// only GTM_IDE_TEAM_ID. With no .env.local and no env, the engine stays fully local — sync never engages.
(() => {
  try {
    const envPath = path.resolve(here, "../../.env.local");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
    if (!process.env.GTM_IDE_CONVEX_URL && process.env.CONVEX_URL) {
      process.env.GTM_IDE_CONVEX_URL = process.env.CONVEX_URL;
    }
  } catch {
    /* best-effort: a malformed .env.local never blocks boot */
  }
})();

const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || "127.0.0.1";
recoverInterruptedOperatorSessions();

// The route groups, in the original route order. The dispatch tries each until one claims the request.
const ROUTE_GROUPS = [
  systemRoutes,
  projectRoutes,
  measureRoutes,
  objectGraphRoutes,
  runRoutes,
  marketRoutes,
  inputRoutes,
  ideaRoutes,
  channelRoutes,
  inboxRoutes,
  productModelRoutes,
  terrainRoutes,
  operationPlanRoutes,
  tasteRoutes,
  signalWeightsRoutes,
  reallocationTunablesRoutes,
  operatorRoutes,
  engineRoutes,
  workspaceRoutes,
  graphRoutes,
  artifactRoutes,
  crewRoutes,
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

  // Establish the browser-minted session capability on first contact (GET only, set-if-absent). The real
  // page's GET / lands the cookie before any approval UI exists; a header-less raw approval POST holds none
  // and is refused by authorizeReleaseForRequest.
  issueSessionCookie(req, res);

  const ctx = { req, res, url };
  for (const group of ROUTE_GROUPS) {
    if (await group(ctx)) return;
  }

  // Static files
  if (req.method === "GET") { serveFile(url.pathname, res); return; }

  json(res, 405, { error: "Method not allowed." });
});

// Live terminal sessions for canvas terminal nodes (WebSocket on /api/terminal). Loopback-only.
attachTerminalServer(server);

// Exported so a test can boot the real route handler on an ephemeral port and close it cleanly.
export { server };

// In-process ambient heartbeat handle, so shutdown can clear the timer cleanly.
let ambientScheduler = null;

server.listen(port, host, () => {
  console.log(`Drover running at http://${host}:${port}`);
  // Start the in-process heartbeat that re-fires promoted motions and ambient briefs on an interval.
  // It only DRIVES/STAGES standing work — every due item still stops at the founder gate; nothing sends.
  ambientScheduler = startAmbientScheduler();
  // Dogfood crash recovery: no feature build survives a restart, so flip stale queued/building
  // items to `interrupted` and salvage any orphaned worktree work onto its branch. Best-effort.
  try {
    const recovered = recoverStaleBuilds();
    if (recovered.length) console.log(`  Dogfood recovery: ${recovered.map((r) => r.item ?? r.worktree).join(", ")}`);
  } catch (err) {
    console.log(`  Dogfood recovery skipped: ${err instanceof Error ? err.message : err}`);
  }
  const connectors = listConnectors();
  const ready = connectors.filter((c) => c.configured && !c.stub);
  const stubs = connectors.filter((c) => c.stub);
  if (ready.length) console.log(`  Connectors ready: ${ready.map((c) => c.name).join(", ")}`);
  if (stubs.length) console.log(`  Connectors stubbed: ${stubs.map((c) => c.name).join(", ")}`);
  // When a team is configured, hydrate the local store root from the team's shared state on boot.
  // Best-effort and lazy-loaded — a local-only deployment never touches the sync layer, and prints
  // nothing alarming: an unconfigured pull reports `disabled` and we stay quiet rather than logging
  // a "pulled 0" or "pull failed" line for a deployment that never opted into team sync.
  if (process.env.GTM_IDE_CONVEX_URL && process.env.GTM_IDE_TEAM_ID) {
    import("./convex-backend.mjs")
      .then((m) => m.hydrateTeamDocuments())
      .then((r) => {
        if (r?.disabled) return;
        if (r?.pulled != null) console.log(`  Team sync: pulled ${r.pulled} shared document(s) from Convex`);
      })
      .catch(() => {});
  }
});

// Clear the ambient heartbeat timer on shutdown so the process can exit cleanly.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    try {
      ambientScheduler?.stop();
    } catch {
      /* best-effort: never block shutdown on the heartbeat timer */
    }
  });
}
