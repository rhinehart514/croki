import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// The generic key→JSON store that mirrors the local file-backed stores. The brain's syncer
// (convex-backend.mjs) calls `set` on every local write and `list`/`get` on boot to hydrate a machine.
// Keys are store paths relative to the local root, so they're identical across machines.

export const get = query({
  args: { teamId: v.id("teams"), key: v.string() },
  handler: async (ctx, { teamId, key }) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_team_key", (q) => q.eq("teamId", teamId).eq("key", key))
      .unique();
    return doc ? { key: doc.key, data: doc.data, updatedAt: doc.updatedAt } : null;
  },
});

// Every mirrored document for a team, optionally narrowed to a path prefix (e.g. "programs/").
// The syncer pulls the whole set on boot to hydrate a fresh machine.
export const list = query({
  args: { teamId: v.id("teams"), prefix: v.optional(v.string()) },
  handler: async (ctx, { teamId, prefix }) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const scoped = prefix ? docs.filter((d) => d.key.startsWith(prefix)) : docs;
    return scoped.map((d) => ({ key: d.key, data: d.data, updatedAt: d.updatedAt }));
  },
});

function documentRevision(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const revision = (data as { revision?: unknown }).revision;
  return Number.isInteger(revision) && (revision as number) >= 0 ? revision as number : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number:NaN";
    if (Object.is(value, -0)) return "number:-0";
    return `number:${String(value)}`;
  }
  if (typeof value === "string") return `string:${JSON.stringify(value)}`;
  if (typeof value === "boolean") return `boolean:${value}`;
  if (value === null) return "null";
  return `${typeof value}:${String(value)}`;
}

// Compatibility upsert for stores that do not yet use compare-and-set. Versioned documents are still
// protected: they may only advance one revision, and a same-revision retry is accepted only when it is
// byte-for-byte idempotent. `updatedAt` remains metadata, never a concurrency authority. Unversioned
// documents retain the legacy timestamp behavior until their owning store adopts revisions.
export const set = mutation({
  args: {
    teamId: v.id("teams"),
    key: v.string(),
    data: v.any(),
    updatedAt: v.string(),
    updatedBy: v.string(),
  },
  handler: async (ctx, { teamId, key, data, updatedAt, updatedBy }) => {
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_team_key", (q) => q.eq("teamId", teamId).eq("key", key))
      .unique();
    if (existing) {
      const currentRevision = documentRevision(existing.data);
      const nextRevision = documentRevision(data);
      if (currentRevision !== null || nextRevision !== null) {
        if (currentRevision === null || nextRevision === null) {
          return { status: "conflict" as const, reason: "revision-shape-changed", currentRevision };
        }
        if (nextRevision === currentRevision) {
          if (canonicalJson(existing.data) === canonicalJson(data)) {
            return { status: "unchanged" as const, revision: currentRevision };
          }
          return { status: "conflict" as const, reason: "same-revision-diverged", currentRevision };
        }
        if (nextRevision !== currentRevision + 1) {
          return { status: "conflict" as const, reason: "stale-or-skipped-revision", currentRevision };
        }
      } else if (existing.updatedAt && updatedAt < existing.updatedAt) {
        return { status: "ignored" as const, reason: "older-unversioned-write" };
      }
      await ctx.db.patch(existing._id, { data, updatedAt, updatedBy });
      return { status: "updated" as const, revision: nextRevision };
    }
    await ctx.db.insert("documents", { teamId, key, data, updatedAt, updatedBy });
    return { status: "inserted" as const, revision: documentRevision(data) };
  },
});

// Atomic remote CAS. Convex mutations serialize this lookup and patch, so two machines that both
// edited revision N cannot both publish revision N+1. The winner advances; the loser receives a
// structured conflict and its local copy remains available for explicit reconciliation.
export const compareAndSet = mutation({
  args: {
    teamId: v.id("teams"),
    key: v.string(),
    expectedRevision: v.number(),
    expectedData: v.optional(v.any()),
    data: v.any(),
    updatedAt: v.string(),
    updatedBy: v.string(),
  },
  handler: async (ctx, { teamId, key, expectedRevision, expectedData, data, updatedAt, updatedBy }) => {
    const nextRevision = documentRevision(data);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || nextRevision !== expectedRevision + 1) {
      return { status: "invalid" as const, reason: "revision-must-advance-by-one" };
    }
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_team_key", (q) => q.eq("teamId", teamId).eq("key", key))
      .unique();
    if (!existing) {
      if (expectedRevision !== 0) {
        return { status: "conflict" as const, reason: "missing-base", currentRevision: 0 };
      }
      await ctx.db.insert("documents", { teamId, key, data, updatedAt, updatedBy });
      return { status: "inserted" as const, revision: nextRevision };
    }
    const currentRevision = documentRevision(existing.data);
    if (currentRevision === nextRevision && canonicalJson(existing.data) === canonicalJson(data)) {
      return { status: "unchanged" as const, revision: currentRevision };
    }
    if (expectedData === undefined || canonicalJson(existing.data) !== canonicalJson(expectedData)) {
      return { status: "conflict" as const, reason: "base-content-diverged", currentRevision };
    }
    if (currentRevision !== expectedRevision) {
      return { status: "conflict" as const, reason: "stale-base", currentRevision };
    }
    await ctx.db.patch(existing._id, { data, updatedAt, updatedBy });
    return { status: "updated" as const, revision: nextRevision };
  },
});

export const remove = mutation({
  args: { teamId: v.id("teams"), key: v.string(), expectedRevision: v.optional(v.number()) },
  handler: async (ctx, { teamId, key, expectedRevision }) => {
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_team_key", (q) => q.eq("teamId", teamId).eq("key", key))
      .unique();
    if (!existing) return { status: "unchanged" as const };
    const currentRevision = documentRevision(existing.data);
    if (currentRevision !== null && expectedRevision !== currentRevision) {
      return { status: "conflict" as const, reason: "stale-delete", currentRevision };
    }
    await ctx.db.delete(existing._id);
    return { status: "removed" as const };
  },
});
