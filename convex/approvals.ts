import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// The gate approval queue — the first reactive multiplayer surface. The brain publishes a row when a
// run reaches the founder gate; approvers see it live (useQuery) on the web/phone and resolve it.
// This MIRRORS the local gate. Resolving here records the team decision and unblocks the owning
// machine's poll; the staged action still happens behind the local wall, never from the cloud.

export const pending = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) =>
    ctx.db
      .query("approvals")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamId).eq("status", "pending"),
      )
      .collect(),
});

// Upsert by (sessionId, nodeId) so re-publishing the same gate doesn't pile up duplicates.
export const publish = mutation({
  args: {
    teamId: v.id("teams"),
    projectId: v.string(),
    sessionId: v.string(),
    graphId: v.optional(v.string()),
    nodeId: v.string(),
    title: v.string(),
    summary: v.optional(v.string()),
    stagedCount: v.number(),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("approvals")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const match = existing.find((a) => a.nodeId === args.nodeId && a.status === "pending");
    if (match) {
      await ctx.db.patch(match._id, {
        title: args.title,
        summary: args.summary,
        stagedCount: args.stagedCount,
        updatedAt: args.createdAt,
      });
      return match._id;
    }
    return ctx.db.insert("approvals", {
      ...args,
      status: "pending",
      updatedAt: args.createdAt,
    });
  },
});

export const decide = mutation({
  args: {
    approvalId: v.id("approvals"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    decidedBy: v.string(),
    note: v.optional(v.string()),
    decidedAt: v.string(),
  },
  handler: async (ctx, { approvalId, decision, decidedBy, note, decidedAt }) => {
    await ctx.db.patch(approvalId, {
      status: decision,
      decidedBy,
      note,
      updatedAt: decidedAt,
    });
    return null;
  },
});

// The owning machine polls this to learn a teammate resolved a gate from the web.
export const forSession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) =>
    ctx.db
      .query("approvals")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect(),
});
