import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// The generic key→JSON store that mirrors the local file-backed stores. The brain's syncer
// (convex-sync.mjs) calls `set` on every local write and `list`/`get` on boot to hydrate a machine.
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

// Upsert one document. last-write-wins: a write older than what's stored is ignored, so a slow
// background push can never clobber a newer one from another machine.
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
      if (existing.updatedAt && updatedAt < existing.updatedAt) return existing._id;
      await ctx.db.patch(existing._id, { data, updatedAt, updatedBy });
      return existing._id;
    }
    return await ctx.db.insert("documents", { teamId, key, data, updatedAt, updatedBy });
  },
});

export const remove = mutation({
  args: { teamId: v.id("teams"), key: v.string() },
  handler: async (ctx, { teamId, key }) => {
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_team_key", (q) => q.eq("teamId", teamId).eq("key", key))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});
