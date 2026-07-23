#!/usr/bin/env node

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devFounderAuthorityEnabled } from "./routes/founder-authority.mjs";
import { dispatchRequest } from "./request-dispatcher.mjs";
import { recoverDesktopWork } from "./desktop-runtime.mjs";
import { json, serveFile } from "./routes/util.mjs";

const port = Number(process.env.PORT || 4317);
const host = "127.0.0.1";
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  if (await dispatchRequest(req, res)) return;

  // Static files
  if (req.method === "GET") { serveFile(url.pathname, res); return; }

  json(res, 405, { error: "Method not allowed." });
});

// Exported so a test can boot the real route handler on an ephemeral port and close it cleanly.
export { server };

// No ambient loop runs at boot. Work begins ONLY through explicit founder direction or a founder-
// invoked workflow (FIRM-SPEC rail #1; STATE.md); there is no perpetual firm loop to arm here, and no
let shutdownPromise = null;
let shutdownFailSafe = null;

const SHUTDOWN_GRACE_MS = 5_000;

function closeHttpServer() {
  if (!server.listening) return Promise.resolve();

  return new Promise((resolve, reject) => {
    // Let in-flight requests finish, but do not let a stuck connection pin Croki forever.
    const forceClose = setTimeout(() => server.closeAllConnections?.(), SHUTDOWN_GRACE_MS);
    forceClose.unref();

    server.close((err) => {
      clearTimeout(forceClose);
      if (err && err.code !== "ERR_SERVER_NOT_RUNNING") reject(err);
      else resolve();
    });
    server.closeIdleConnections?.();
  });
}

function shutdownServer() {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = closeHttpServer().catch((err) => {
    server.closeAllConnections?.();
    process.exitCode = 1;
    console.error(`Croki shutdown failed: ${err instanceof Error ? err.message : err}`);
    throw err;
  });
  return shutdownPromise;
}

function shutdownAfterSignal() {
  // This timer is unref'd so a healthy shutdown still exits naturally. If a broken listener or
  // connection keeps the event loop alive past the drain window, fail closed instead of pinning the
  // old Croki process and port forever.
  if (!shutdownFailSafe) {
    shutdownFailSafe = setTimeout(() => {
      console.error("Croki shutdown timed out; forcing exit.");
      process.exit(1);
    }, SHUTDOWN_GRACE_MS + 1_000);
    shutdownFailSafe.unref();
  }

  void shutdownServer()
    .then(() => {
      clearTimeout(shutdownFailSafe);
      shutdownFailSafe = null;
    })
    .catch(() => {});
}

function startServer() {
  server.listen(port, host, () => {
    const activePort = server.address().port;
    console.log(`Croki running at http://${host}:${activePort}`);
    if (devFounderAuthorityEnabled()) {
      console.warn("  Development founder writes enabled for non-agent loopback browser requests.");
    }
    // No ambient loop is armed here. Work starts only through an explicit founder direction or a
    // founder-invoked workflow (the /drive route with founder authority, or a founder-invoked call into
    // Dogfood crash recovery: no feature build survives a restart, so flip stale queued/building
    // items to `interrupted` and salvage any orphaned worktree work onto its branch. Best-effort.
    void recoverDesktopWork().then(({ recoveredBuilds, recoveredWorkspaces, authorizedScopes }) => {
      if (recoveredBuilds.length) console.log(`  Dogfood recovery: ${recoveredBuilds.map((r) => r.item ?? r.worktree).join(", ")}`);
      if (recoveredWorkspaces.length) console.log(`  Native coding recovery: ${recoveredWorkspaces.map((entry) => entry.id).join(", ")}`);
      if (authorizedScopes.length) console.log(`  Authorized continuing work discovered: ${authorizedScopes.length}`);
    }).catch((err) => {
      console.log(`  Dogfood recovery skipped: ${err instanceof Error ? err.message : err}`);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
  // Release the listening socket on signal. The shared promise makes repeated signals join the same
  // shutdown instead of racing multiple server.close() calls.
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, shutdownAfterSignal);
  }
}

export { shutdownServer, startServer };
