// The Convex backend for the persistence provider — the team sync layer, expressed as a backend that
// satisfies the SAME synchronous provider interface every durable store in brain/ already speaks.
//
// THE SHAPE OF THE PROBLEM. The provider contract (persistence.mjs) is SYNCHRONOUS: get/set/list/delete
// return values, not Promises, because every store in the engine reads and writes them inline with no
// await. Convex is a remote, asynchronous database. You cannot block a Node event loop on an HTTP round
// trip without freezing the whole engine. So a Convex backend cannot be "talk to Convex on every call".
//
// THE DESIGN. Local-first stays the base, exactly as the founder chose: a real SQLite backend on this
// machine answers every synchronous get/list instantly, and every set/delete lands there first and is
// authoritative locally. Convex is the MIRROR that makes a project shared across a team in real time:
// each local write is pushed up write-behind (async, best-effort, never blocking, never able to fail the
// local write), and on boot the team's documents are pulled down so a fresh machine starts from shared
// state. last-write-wins by timestamp keeps machines convergent. If Convex is unreachable the engine
// keeps working entirely from SQLite — sync is best-effort, never load-bearing for one operator.
//
// THE (collection, key) MAPPING. The provider addresses a document by (collection, key); the Convex
// `documents` table keys by one string `key` scoped to a `teamId` (see convex/documents.ts). We join the
// pair into a stable composite — `collection/key` — so the existing Convex schema and functions are
// reused verbatim, and a list(collection) on the team is a prefix query on `collection/`.

import {
  persistence as createPersistence,
  registerConvexBackend,
  PROJECT_COLLECTION,
} from "./persistence.mjs";

// Join a (collection, key) into the single Convex document key, and split it back. The separator is "/"
// — collection names are directory-name-shaped (no slashes) so the FIRST slash is always the boundary.
function convexKey(collection, key) {
  return `${collection}/${key}`;
}
function splitConvexKey(composite) {
  const idx = composite.indexOf("/");
  if (idx < 0) return { collection: composite, key: "" };
  return { collection: composite.slice(0, idx), key: composite.slice(idx + 1) };
}

// The Convex client we need is narrow: a mutation/query pair against the documents functions. The live
// client is `convex/browser`'s ConvexHttpClient (mutation/query take a function reference + args). Tests
// inject a fake exposing the same `mutation`/`query` calls, so the adapter is proven without a real
// deployment. We reference functions by string name (makeFunctionReference) so no generated types are
// needed and this runs before `npx convex dev` has ever generated `convex/_generated/`.
async function loadLiveClient(url) {
  const { ConvexHttpClient } = await import("convex/browser");
  return new ConvexHttpClient(url);
}

async function functionRef(name) {
  const { makeFunctionReference } = await import("convex/server");
  return makeFunctionReference(name);
}

// The mirror: a tiny async write-behind queue plus a boot pull. It owns ALL Convex contact, so the
// synchronous backend below never awaits. Best-effort throughout: a failed push is re-queued and a
// failed pull leaves local state untouched.
function createMirror({ url, teamId, identity, client: injectedClient, now }) {
  const timestamp = typeof now === "function" ? now : () => new Date().toISOString();
  let clientPromise = null;
  let warnedPush = false;
  let warnedPull = false;

  // Resolve the client once. An injected fake (tests, or a future in-process client) wins; otherwise the
  // real HTTP client is constructed lazily so a backend that never writes never loads convex/browser.
  function getClient() {
    if (injectedClient) return Promise.resolve(injectedClient);
    if (!clientPromise) clientPromise = loadLiveClient(url);
    return clientPromise;
  }

  const pending = new Map(); // convexKey -> { op: "set" | "delete", data? }
  let flushTimer = null;
  let flushing = null;

  function scheduleFlush() {
    if (flushTimer || flushing) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushing = flush().finally(() => {
        flushing = null;
        if (pending.size) scheduleFlush();
      });
    }, 0);
    // Don't keep the process alive just to flush a mirror — the local write already succeeded.
    if (typeof flushTimer.unref === "function") flushTimer.unref();
  }

  async function flush() {
    if (!pending.size) return;
    const batch = [...pending.entries()];
    pending.clear();
    let client;
    let setRef;
    let removeRef;
    try {
      [client, setRef, removeRef] = await Promise.all([
        getClient(),
        functionRef("documents:set"),
        functionRef("documents:remove"),
      ]);
    } catch (err) {
      requeue(batch);
      warnPush(err);
      return;
    }
    for (const [key, entry] of batch) {
      try {
        if (entry.op === "delete") {
          await client.mutation(removeRef, { teamId, key });
        } else {
          await client.mutation(setRef, {
            teamId,
            key,
            data: entry.data,
            updatedAt: timestamp(),
            updatedBy: identity,
          });
        }
      } catch (err) {
        // Re-queue only this key (don't lose newer writes that arrived meanwhile) and stop the batch —
        // a transient outage will retry on the next schedule.
        if (!pending.has(key)) pending.set(key, entry);
        warnPush(err);
        break;
      }
    }
  }

  function requeue(batch) {
    for (const [key, entry] of batch) if (!pending.has(key)) pending.set(key, entry);
  }
  function warnPush(err) {
    if (warnedPush) return;
    warnedPush = true;
    console.warn(`[convex-backend] push failed, continuing local-only: ${err?.message ?? err}`);
  }

  return {
    pushSet(collection, key, data) {
      pending.set(convexKey(collection, key), { op: "set", data });
      scheduleFlush();
    },
    pushDelete(collection, key) {
      pending.set(convexKey(collection, key), { op: "delete" });
      scheduleFlush();
    },
    // Drain the queue now and wait for it — used by tests and any caller that wants the mirror settled
    // (e.g. a graceful shutdown). Makes a bounded number of flush passes so a re-queued item gets a
    // retry, but a PERSISTENTLY failing Convex (which re-queues every pass) can never spin forever:
    // drain returns and the local writes are already safe. A live transient outage still retries later
    // via the normal scheduled flush.
    async drain(maxPasses = 5) {
      let passes = 0;
      while ((pending.size || flushing) && passes < maxPasses) {
        passes += 1;
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (flushing) await flushing;
        if (pending.size) await flush();
      }
    },
    // Boot hydration: pull every team document and hand each (collection, key, data) to the sink (the
    // local SQLite backend). Best-effort: a failure returns { pulled: 0, error } and changes nothing.
    async pull(sink) {
      let client;
      let listRef;
      try {
        [client, listRef] = await Promise.all([getClient(), functionRef("documents:list")]);
      } catch (err) {
        return warnPull(err);
      }
      try {
        const docs = (await client.query(listRef, { teamId })) ?? [];
        let pulled = 0;
        for (const doc of docs) {
          const { collection, key } = splitConvexKey(doc.key);
          if (!collection || !key) continue;
          sink(collection, key, doc.data);
          pulled += 1;
        }
        return { pulled };
      } catch (err) {
        return warnPull(err);
      }
    },
  };

  function warnPull(err) {
    if (!warnedPull) {
      warnedPull = true;
      console.warn(`[convex-backend] pull failed, continuing local-only: ${err?.message ?? err}`);
    }
    return { pulled: 0, error: err?.message ?? String(err) };
  }
}

// Read the Convex config off options/env. Returns null when no Convex URL is set, so the provider falls
// back to plain SQLite. teamId is required to actually mirror; without it the local backend still works
// and pushes are simply skipped (a single-machine Convex URL with no team is a no-op mirror).
export function convexConfig(options = {}) {
  const url = options.convexUrl || process.env.GTM_IDE_CONVEX_URL;
  if (!url) return null;
  return {
    url,
    teamId: options.teamId || process.env.GTM_IDE_TEAM_ID || null,
    identity: options.identity || process.env.GTM_IDE_USER || "local",
  };
}

// The Convex backend: the local SQLite backend (local-first base, synchronous, authoritative on this
// machine) wrapped so every write also mirrors to the team's Convex deployment. Satisfies the exact
// provider interface — get/set/list/delete(collection, key) — synchronously.
//
//   - get/list read SQLite only (instant, local-first). The mirror never blocks a read.
//   - set writes SQLite, returns the data, and queues a write-behind push.
//   - delete removes from SQLite, returns the result, and queues a write-behind remove.
//
// Options:
//   - root: the local store root (passed to the SQLite backend) — tests isolate here.
//   - convexUrl / teamId / identity: override the env config (tests inject these).
//   - client: an injected Convex client (a fake in tests) — when present, no real HTTP client is built.
//   - now: an injected timestamp function (tests freeze it).
//   - local: an explicit local backend to wrap (defaults to a real SQLite backend on `root`).
export function createConvexBackend(options = {}) {
  const config = convexConfig(options);
  if (!config) {
    throw new Error("createConvexBackend requires a Convex URL (options.convexUrl or GTM_IDE_CONVEX_URL)");
  }

  // The local-first base. Default to SQLite; a test can inject any provider-shaped backend via `local`.
  const local =
    options.local || createPersistence({ root: options.root, backend: "sqlite" });

  // A Convex URL with no team id is a degenerate "configured but no team" state — keep the local backend
  // fully working and simply skip mirroring rather than crash. mirror is null in that case.
  const mirror = config.teamId
    ? createMirror({ ...config, client: options.client, now: options.now })
    : null;

  return {
    name: "convex",
    // Cross-process runtimes must pin themselves to the concrete local format this process actually
    // opened. That can be JSON when the SQLite native module is unavailable under this Node binary.
    localBackendName: local.name,
    // Exposed so a boot path can hydrate and a graceful shutdown / test can settle the queue. Null when
    // there is no team to mirror to.
    mirror,
    get(collection, key) {
      return local.get(collection, key);
    },
    // A session-scoped MCP tool writes through a separate process. The host must be able to bypass
    // both its outer Convex provider cache and the wrapped local SQLite provider cache before it
    // appends narration or decides the model turn is complete.
    getFresh(collection, key) {
      return typeof local.getFresh === "function"
        ? local.getFresh(collection, key)
        : local.get(collection, key);
    },
    set(collection, key, data) {
      const stored = local.set(collection, key, data);
      if (mirror) mirror.pushSet(collection, key, stored);
      return stored;
    },
    list(collection) {
      return local.list(collection);
    },
    delete(collection, key) {
      const removed = local.delete(collection, key);
      if (mirror) mirror.pushDelete(collection, key);
      return removed;
    },
    // Boot hydration: pull the team's shared documents into the local backend so a fresh machine starts
    // from shared state. Best-effort; a no-op when there is no team. Returns { pulled } / { pulled, error }.
    async hydrate() {
      if (!mirror) return { pulled: 0 };
      return mirror.pull((collection, key, data) => local.set(collection, key, data));
    },
  };
}

// ── The one shared write-behind queue (the single seam) ──────────────────────────────────────────
//
// Every production write path that is NOT already a per-instance convex backend mirrors through ONE
// queue, built once from the env config and reused. The default engine is local-first SQLite wrapped by
// createConvexBackend (its own per-instance mirror); this shared queue is what any OTHER store path —
// today the JSON backend — delegates to, so there is exactly one mirror IMPLEMENTATION (createMirror,
// above) instead of a second path-keyed queue. Null — and zero network — when no team is configured,
// which is the guarded-off-by-default local engine.
let sharedMirror;
let sharedMirrorBuilt = false;
function sharedTeamMirror() {
  if (sharedMirrorBuilt) return sharedMirror;
  sharedMirrorBuilt = true;
  const config = convexConfig();
  sharedMirror = config && config.teamId ? createMirror(config) : null;
  return sharedMirror;
}

// True when a team deployment is actually configured to mirror to (a Convex URL AND a team id). The
// guard the boot path and the convex-sync compatibility shim read to stay fully local-only by default.
export function teamSyncEnabled() {
  const config = convexConfig();
  return !!(config && config.teamId);
}

// Enqueue a write / delete onto the one shared queue. Pure no-ops — and never load the network — when no
// team is configured. The JSON backend calls these so its mirror is the SAME queue the SQLite era uses.
export function enqueueDocument(collection, key, data) {
  const mirror = sharedTeamMirror();
  if (mirror) mirror.pushSet(collection, key, data);
}
export function enqueueDelete(collection, key) {
  const mirror = sharedTeamMirror();
  if (mirror) mirror.pushDelete(collection, key);
}

// Settle the shared queue (tests / graceful shutdown). A no-op when no team is configured.
export async function drainTeamMirror() {
  const mirror = sharedTeamMirror();
  if (mirror) await mirror.drain();
}

// Test seam: drop the memoized shared mirror so a test that toggles the env starts from a clean queue.
export function __resetTeamSync() {
  sharedMirror = undefined;
  sharedMirrorBuilt = false;
}

// Boot hydration entry: pull the team's shared documents into the local SQLite store so a fresh machine
// starts from shared state. This is the single caller the server boot uses (replacing the legacy
// convex-sync pull, which wrote raw .json beside the DB the engine actually reads). Guarded-off by
// default: with no team configured it returns `disabled` and never touches the network, so a local-only
// deployment stays silent and offline. Returns { pulled } / { pulled, disabled } / { pulled, error }.
export async function hydrateTeamDocuments(options = {}) {
  const config = convexConfig(options);
  if (!config || !config.teamId) return { pulled: 0, disabled: true };
  const backend = createConvexBackend(options);
  const result = await backend.hydrate();
  // A transport-level "fetch failed" is a configured-but-unreachable deployment (e.g. a CONVEX_URL left
  // in .env.local with no `npx convex dev` running), not a real sync error. Report it as disabled so the
  // boot log stays calm — the engine keeps running entirely from local SQLite.
  if (result && result.error && /fetch failed/i.test(result.error)) {
    return { pulled: 0, disabled: true, unreachable: true };
  }
  return result;
}

// Register with persistence at import time so `persistence({ backend: "convex" })` — and the env-driven
// auto-select when GTM_IDE_CONVEX_URL is set — can build this backend without an ESM import cycle.
registerConvexBackend(createConvexBackend);

// Re-exported so callers (and tests) can build the composite key the Convex table stores, and reason
// about the project singleton's address under that scheme.
export { convexKey, splitConvexKey, PROJECT_COLLECTION };
