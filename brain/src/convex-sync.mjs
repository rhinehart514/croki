// The team sync layer — the thin mirror between the local file-backed stores and Convex.
//
// The engine stays local-first and SYNCHRONOUS: it reads/writes ~/.gtm-ide exactly as before, with
// zero awaits added. This module is the only async edge. It does two things, and only when a team is
// configured (GTM_IDE_CONVEX_URL + GTM_IDE_TEAM_ID): it PUSHES each local write up to the team's
// Convex deployment (write-behind, debounced, never blocking the local write), and it PULLS the
// team's documents down on boot so a fresh machine starts from shared state. last-write-wins by
// timestamp keeps machines convergent. If Convex is unreachable, everything keeps working locally —
// sync is best-effort, never load-bearing for a single operator.
//
// Functions are referenced by string (makeFunctionReference) so this file needs no generated types
// and compiles/runs before `npx convex dev` has ever been run.
import fs from "node:fs";
import path from "node:path";
import { storeRoot, now } from "./store-fs.mjs";

let client = null;
let warnedPush = false;

function config() {
  const url = process.env.GTM_IDE_CONVEX_URL;
  const teamId = process.env.GTM_IDE_TEAM_ID;
  if (!url || !teamId) return null;
  return { url, teamId, identity: process.env.GTM_IDE_USER || "local" };
}

export function syncEnabled() {
  return !!config();
}

async function getClient(url) {
  if (client) return client;
  const { ConvexHttpClient } = await import("convex/browser");
  client = new ConvexHttpClient(url);
  return client;
}

// The relative key for an absolute store file — its path under the local root, in forward slashes,
// so it's identical on every machine. Returns null for paths outside the root (never synced).
function keyFor(absFile) {
  try {
    const key = path.relative(storeRoot(), absFile).split(path.sep).join("/");
    return key && !key.startsWith("..") ? key : null;
  } catch {
    return null;
  }
}

// Debounced write-behind: coalesce rapid writes to the same key and push the latest after a beat.
const pendingPush = new Map(); // key -> data
let flushTimer = null;

export function enqueueDocument(absFile, data) {
  if (!config()) return;
  const key = keyFor(absFile);
  if (!key) return;
  pendingPush.set(key, data);
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), 400);
}

async function flush() {
  flushTimer = null;
  const cfg = config();
  if (!cfg || !pendingPush.size) return;
  const batch = [...pendingPush.entries()];
  pendingPush.clear();
  try {
    const c = await getClient(cfg.url);
    const { makeFunctionReference } = await import("convex/server");
    const setRef = makeFunctionReference("documents:set");
    for (const [key, data] of batch) {
      await c.mutation(setRef, {
        teamId: cfg.teamId,
        key,
        data,
        updatedAt: now(),
        updatedBy: cfg.identity,
      });
    }
  } catch (err) {
    if (!warnedPush) {
      console.warn(`[convex-sync] push failed, continuing local-only: ${err?.message ?? err}`);
      warnedPush = true;
    }
    // Re-queue so a transient outage mirrors once the connection is back.
    for (const [key, data] of batch) if (!pendingPush.has(key)) pendingPush.set(key, data);
    if (!flushTimer) flushTimer = setTimeout(() => void flush(), 4000);
  }
}

// Boot hydration: pull every team document into the local store root so this machine starts from the
// team's shared state. Writes raw (not through atomicWrite) so a pulled document never bounces back
// up as a push. Best-effort: a failure leaves whatever is already on disk untouched.
export async function pullTeamDocuments() {
  const cfg = config();
  if (!cfg) return { pulled: 0 };
  try {
    const c = await getClient(cfg.url);
    const { makeFunctionReference } = await import("convex/server");
    const listRef = makeFunctionReference("documents:list");
    const docs = await c.query(listRef, { teamId: cfg.teamId });
    let pulled = 0;
    for (const doc of docs ?? []) {
      const abs = path.join(storeRoot(), doc.key);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, `${JSON.stringify(doc.data, null, 2)}\n`);
      pulled += 1;
    }
    return { pulled };
  } catch (err) {
    console.warn(`[convex-sync] pull failed, continuing local-only: ${err?.message ?? err}`);
    return { pulled: 0, error: err?.message ?? String(err) };
  }
}
