import type { WorkProtocolState, WorkThreadProjection } from "./work-protocol";

const CACHE_VERSION = 1;
const CACHE_PREFIX = "drover:work-projection-cache:v1:";
const MAX_CACHE_BYTES = 1_500_000;

type CachedWorkProjection = {
  version: typeof CACHE_VERSION;
  ventureId: string;
  cursor: number;
  projectionRevision: number;
  threads: WorkThreadProjection[];
  work: WorkProtocolState["work"];
};

function key(ventureId: string, threadRef?: string | null) {
  return `${CACHE_PREFIX}${encodeURIComponent(ventureId)}:${encodeURIComponent(threadRef ?? "")}`;
}

function validProjection(cache: CachedWorkProjection, ventureId: string) {
  if (
    cache.version !== CACHE_VERSION
    || cache.ventureId !== ventureId
    || !Number.isSafeInteger(cache.cursor)
    || cache.cursor < 0
    || !Number.isSafeInteger(cache.projectionRevision)
    || cache.projectionRevision < 0
    || !Array.isArray(cache.threads)
  ) return false;
  if (!cache.work || cache.work.value.ventureId !== ventureId) return false;
  return cache.threads.every((thread) => (
    thread.value.ventureId === ventureId
    && thread.value.thread.threadRef === thread.threadRef
    && Number.isSafeInteger(thread.revision)
    && thread.revision >= 0
  ));
}

export function readWorkProtocolCache(ventureId: string, threadRef?: string | null) {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key(ventureId, threadRef)) ?? "null");
    if (!parsed || !validProjection(parsed as CachedWorkProjection, ventureId)) return null;
    const cache = parsed as CachedWorkProjection;
    return {
      cursor: cache.cursor,
      projectionRevision: cache.projectionRevision,
      threads: Object.fromEntries(cache.threads.map((thread) => [thread.threadRef, thread])),
      work: cache.work,
    };
  } catch {
    return null;
  }
}

export function writeWorkProtocolCache(
  state: WorkProtocolState,
  threadRef?: string | null,
) {
  if (typeof localStorage === "undefined" || !state.work) return;
  if (Object.keys(state.pending).length > 0) return;
  const threads = threadRef && state.threads[threadRef] ? [state.threads[threadRef]] : [];
  const cache: CachedWorkProjection = {
    version: CACHE_VERSION,
    ventureId: state.ventureId,
    cursor: state.cursor,
    projectionRevision: state.projectionRevision,
    threads,
    work: state.work,
  };
  try {
    const serialized = JSON.stringify(cache);
    if (new TextEncoder().encode(serialized).byteLength > MAX_CACHE_BYTES) return;
    localStorage.setItem(key(state.ventureId, threadRef), serialized);
  } catch {
    // The live in-memory projection remains coherent when storage is unavailable or full.
  }
}
