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
// state. Revisioned writes preserve their local CAS base and advance atomically in Convex; a losing
// offline edit stays local and is reported as a sync conflict instead of overwriting the winner. Boot
// hydration likewise replaces local state only when the remote revision is provably newer. If Convex
// is unreachable the engine keeps working entirely from SQLite — sync remains best-effort.
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
import { isDeepStrictEqual } from "node:util";

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

function documentRevision(value) {
  const revision = value && typeof value === "object" ? value.revision : null;
  return Number.isInteger(revision) && revision >= 0 ? revision : null;
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
function createMirror({ url, teamId, identity, client: injectedClient, now, onConflict, onAccepted, isBlocked }) {
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

  // Preserve per-document operation order. CAS revisions cannot be coalesced: if local revisions 1 and
  // 2 are produced before a flush, Convex must observe both bases rather than only revision 2.
  const pending = new Map(); // convexKey -> Array<{ op, data?, expectedRevision? }>
  const conflicts = [];
  const blockedKeys = new Set();
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
    let compareAndSetRef;
    try {
      [client, setRef, removeRef, compareAndSetRef] = await Promise.all([
        getClient(),
        functionRef("documents:set"),
        functionRef("documents:remove"),
        functionRef("documents:compareAndSet"),
      ]);
    } catch (err) {
      requeue(batch);
      warnPush(err);
      return;
    }
    for (let keyIndex = 0; keyIndex < batch.length; keyIndex += 1) {
      const [key, entries] = batch[keyIndex];
      if (blockedKeys.has(key) || isBlocked?.(key)) {
        blockedKeys.add(key);
        for (const entry of entries) retainConflict({
          key,
          kind: "push",
          op: entry.op,
          expectedRevision: entry.expectedRevision ?? null,
          reason: "unresolved-predecessor-conflict",
          currentRevision: null,
          at: timestamp(),
        });
        continue;
      }
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
        const entry = entries[entryIndex];
        try {
          let result;
          if (entry.op === "delete") {
            result = await client.mutation(removeRef, {
              teamId,
              key,
              ...(Number.isInteger(entry.expectedRevision) ? { expectedRevision: entry.expectedRevision } : {}),
            });
          } else {
            const args = {
              teamId,
              key,
              data: entry.data,
              updatedAt: timestamp(),
              updatedBy: identity,
            };
            result = Number.isInteger(entry.expectedRevision)
              ? await client.mutation(compareAndSetRef, {
                ...args,
                expectedRevision: entry.expectedRevision,
                expectedData: entry.baseData,
              })
              : await client.mutation(setRef, args);
          }
          if (result?.status === "conflict" || result?.status === "invalid") {
            const conflictRecord = {
              key,
              kind: "push",
              op: entry.op,
              expectedRevision: entry.expectedRevision ?? null,
              reason: result.reason ?? result.status,
              currentRevision: result.currentRevision ?? null,
              at: timestamp(),
            };
            blockedKeys.add(key);
            retainConflict(conflictRecord);
            // Later operations for this key were built on the rejected local state. A matching numeric
            // revision on the winning branch could make one appear valid (or let a queued delete erase
            // it), so quarantine the dependent suffix rather than sending it.
            for (const dependent of entries.slice(entryIndex + 1)) retainConflict({
              key,
              kind: "push",
              op: dependent.op,
              expectedRevision: dependent.expectedRevision ?? null,
              reason: "predecessor-conflict",
              currentRevision: result.currentRevision ?? null,
              at: timestamp(),
            });
            break;
          } else if (entry.op === "set" && Number.isInteger(entry.data?.revision)) {
            try {
              onAccepted?.({ key, revision: entry.data.revision, at: timestamp(), status: result?.status ?? "accepted" });
            } catch { /* cursor evidence cannot break a completed remote write */ }
          }
        } catch (err) {
          // Transport/runtime failure: restore this operation and everything after it. Structured CAS
          // conflicts are intentionally not retried; retrying a stale base can never make it valid.
          requeue([[key, entries.slice(entryIndex)], ...batch.slice(keyIndex + 1)]);
          warnPush(err);
          return;
        }
      }
    }
  }

  function requeue(batch) {
    for (const [key, entries] of batch) {
      const newer = pending.get(key) ?? [];
      pending.set(key, [...entries, ...newer]);
    }
  }
  function warnPush(err) {
    if (warnedPush) return;
    warnedPush = true;
    console.warn(`[convex-backend] push failed, continuing local-only: ${err?.message ?? err}`);
  }
  function retainConflict(record) {
    conflicts.push(record);
    try { onConflict?.(record); } catch { /* sync safety reporting cannot break writes */ }
  }

  return {
    pushSet(collection, key, data, expectedRevision, baseData) {
      const composite = convexKey(collection, key);
      if (blockedKeys.has(composite) || isBlocked?.(composite)) {
        blockedKeys.add(composite);
        retainConflict({
          key: composite,
          kind: "push",
          op: "set",
          expectedRevision: expectedRevision ?? null,
          reason: "unresolved-predecessor-conflict",
          currentRevision: null,
          at: timestamp(),
        });
        return;
      }
      const queue = pending.get(composite) ?? [];
      queue.push({ op: "set", data, expectedRevision, baseData });
      pending.set(composite, queue);
      scheduleFlush();
    },
    pushDelete(collection, key, expectedRevision) {
      const composite = convexKey(collection, key);
      if (blockedKeys.has(composite) || isBlocked?.(composite)) {
        blockedKeys.add(composite);
        retainConflict({
          key: composite,
          kind: "push",
          op: "delete",
          expectedRevision: expectedRevision ?? null,
          reason: "unresolved-predecessor-conflict",
          currentRevision: null,
          at: timestamp(),
        });
        return;
      }
      const queue = pending.get(composite) ?? [];
      queue.push({ op: "delete", expectedRevision });
      pending.set(composite, queue);
      scheduleFlush();
    },
    getConflicts() {
      return structuredClone(conflicts);
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
        let skipped = 0;
        const hydrationConflicts = [];
        for (const doc of docs) {
          const { collection, key } = splitConvexKey(doc.key);
          if (!collection || !key) continue;
          const result = sink(collection, key, doc.data);
          if (result?.conflict) {
            skipped += 1;
            const conflictRecord = {
              key: doc.key,
              kind: "hydration",
              at: timestamp(),
              ...result,
              remoteData: doc.data,
            };
            hydrationConflicts.push(conflictRecord);
            blockedKeys.add(doc.key);
            try { onConflict?.(conflictRecord); } catch { /* local state already remains untouched */ }
          } else if (result?.skipped) {
            skipped += 1;
          } else {
            pulled += 1;
          }
        }
        return { pulled, skipped, conflicts: hydrationConflicts };
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
//   - compareAndSet preserves the local revision guard and mirrors only a successful local commit.
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
    ? createMirror({
      ...config,
      client: options.client,
      now: options.now,
      onConflict(record) {
        // Conflict receipts are local-only evidence. They deliberately bypass the wrapper so recording
        // a failed mirror operation cannot recursively enqueue another mirror operation.
        local.set("sync-conflicts", encodeURIComponent(record.key), {
          ...record,
          teamId: config.teamId,
          identity: config.identity,
          status: "unresolved",
        });
      },
      onAccepted(record) {
        local.set("sync-cursors", encodeURIComponent(record.key), {
          ...record,
          teamId: config.teamId,
          identity: config.identity,
        });
      },
      isBlocked(composite) {
        const receipt = typeof local.getFresh === "function"
          ? local.getFresh("sync-conflicts", encodeURIComponent(composite))
          : local.get("sync-conflicts", encodeURIComponent(composite));
        return receipt?.status === "unresolved";
      },
    })
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
      const current = typeof local.getFresh === "function"
        ? local.getFresh(collection, key)
        : local.get(collection, key);
      const stored = local.set(collection, key, data);
      if (mirror) {
        const nextRevision = documentRevision(stored);
        if (nextRevision !== null && nextRevision >= 1) {
          const expectedRevision = nextRevision - 1;
          const baseData = documentRevision(current) === expectedRevision ? current : null;
          mirror.pushSet(collection, key, stored, expectedRevision, baseData);
        } else {
          mirror.pushSet(collection, key, stored);
        }
      }
      return stored;
    },
    compareAndSet(collection, key, expectedRevision, data) {
      const baseData = typeof local.getFresh === "function"
        ? local.getFresh(collection, key)
        : local.get(collection, key);
      const stored = local.compareAndSet(collection, key, expectedRevision, data);
      if (mirror) mirror.pushSet(collection, key, stored, expectedRevision, baseData);
      return stored;
    },
    setIfAbsent(collection, key, data) {
      const result = local.setIfAbsent(collection, key, data);
      if (result.inserted && mirror) {
        const revision = documentRevision(result.value);
        if (revision !== null && revision >= 1) {
          mirror.pushSet(collection, key, result.value, revision - 1, null);
        } else {
          mirror.pushSet(collection, key, result.value);
        }
      }
      return result;
    },
    list(collection) {
      return local.list(collection);
    },
    listSyncConflicts() {
      return local.list("sync-conflicts");
    },
    delete(collection, key) {
      const current = typeof local.getFresh === "function"
        ? local.getFresh(collection, key)
        : local.get(collection, key);
      const removed = local.delete(collection, key);
      if (mirror) mirror.pushDelete(collection, key, documentRevision(current));
      return removed;
    },
    // Boot hydration: pull the team's shared documents into the local backend so a fresh machine starts
    // from shared state. Best-effort; a no-op when there is no team. Returns { pulled } / { pulled, error }.
    async hydrate() {
      if (!mirror) return { pulled: 0 };
      return mirror.pull((collection, key, data) => {
        const composite = convexKey(collection, key);
        const cursorKey = encodeURIComponent(composite);
        const current = typeof local.getFresh === "function"
          ? local.getFresh(collection, key)
          : local.get(collection, key);
        const remoteRevision = documentRevision(data);
        if (current == null) {
          local.set(collection, key, data);
          if (remoteRevision !== null) local.set("sync-cursors", cursorKey, {
            key: composite,
            revision: remoteRevision,
            at: new Date().toISOString(),
            status: "hydrated",
            teamId: config.teamId,
            identity: config.identity,
          });
          return { written: true };
        }
        if (isDeepStrictEqual(current, data)) {
          if (remoteRevision !== null) local.set("sync-cursors", cursorKey, {
            key: composite,
            revision: remoteRevision,
            at: new Date().toISOString(),
            status: "observed",
            teamId: config.teamId,
            identity: config.identity,
          });
          return { skipped: true, reason: "already-current" };
        }
        const localRevision = documentRevision(current);
        const cursor = typeof local.getFresh === "function"
          ? local.getFresh("sync-cursors", cursorKey)
          : local.get("sync-cursors", cursorKey);
        // A higher number is safe to hydrate only when the local document still equals the last remote-
        // confirmed revision. Without this ancestry cursor, two offline branches can have different
        // revision numbers and numeric ordering would silently erase one branch.
        if (localRevision !== null && remoteRevision !== null
          && remoteRevision > localRevision && cursor?.revision === localRevision) {
          local.set(collection, key, data);
          local.set("sync-cursors", cursorKey, {
            key: composite,
            revision: remoteRevision,
            at: new Date().toISOString(),
            status: "hydrated",
            teamId: config.teamId,
            identity: config.identity,
          });
          return { written: true };
        }
        return {
          conflict: true,
          reason: localRevision === remoteRevision ? "same-revision-diverged" : "local-not-proven-stale",
          localRevision,
          remoteRevision,
        };
      });
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
// guard the boot path and local reads to stay fully local-only by default.
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
export function enqueueDelete(collection, key, expectedRevision) {
  const mirror = sharedTeamMirror();
  if (mirror) mirror.pushDelete(collection, key, expectedRevision);
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
// the retired compatibility pull, which wrote raw .json beside the DB the engine actually reads). Guarded-off by
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
