import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Teams + membership — the identity layer the onboarding flow drives. Identity is an email string
// for now (the local signed-in user); when Convex Auth lands this becomes the auth subject and these
// functions read it from ctx.auth instead of taking it as an argument.

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "team"
  );
}

export const create = mutation({
  args: {
    name: v.string(),
    identity: v.string(),
    displayName: v.string(),
    inviteCode: v.string(),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    let slug = slugify(args.name);
    // Keep slugs unique with a numeric suffix so two "Acme" teams don't collide.
    let n = 1;
    while (
      await ctx.db
        .query("teams")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
    ) {
      n += 1;
      slug = `${slugify(args.name)}-${n}`;
    }
    const teamId = await ctx.db.insert("teams", {
      name: args.name,
      slug,
      inviteCode: args.inviteCode,
      createdBy: args.identity,
      createdAt: args.createdAt,
    });
    await ctx.db.insert("members", {
      teamId,
      identity: args.identity,
      name: args.displayName,
      role: "owner",
      joinedAt: args.createdAt,
    });
    return { teamId, slug };
  },
});

// Join an existing team by its invite code (the second onboarding path). Idempotent: re-joining
// returns the existing membership instead of duplicating it.
export const joinByCode = mutation({
  args: {
    inviteCode: v.string(),
    identity: v.string(),
    displayName: v.string(),
    joinedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teams")
      .withIndex("by_invite", (q) => q.eq("inviteCode", args.inviteCode))
      .unique();
    if (!team) throw new Error("No team matches that invite code.");
    const already = await ctx.db
      .query("members")
      .withIndex("by_team_identity", (q) =>
        q.eq("teamId", team._id).eq("identity", args.identity),
      )
      .unique();
    if (!already) {
      await ctx.db.insert("members", {
        teamId: team._id,
        identity: args.identity,
        name: args.displayName,
        role: "builder",
        joinedAt: args.joinedAt,
      });
    }
    return { teamId: team._id, slug: team.slug, name: team.name };
  },
});

// Every team the signed-in person belongs to — what the team switcher and first-run check read.
export const listForIdentity = query({
  args: { identity: v.string() },
  handler: async (ctx, { identity }) => {
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_identity", (q) => q.eq("identity", identity))
      .collect();
    const teams = await Promise.all(
      memberships.map(async (m) => {
        const team = await ctx.db.get(m.teamId);
        return team ? { ...team, role: m.role } : null;
      }),
    );
    return teams.filter(Boolean);
  },
});

export const get = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => ctx.db.get(teamId),
});

export const listMembers = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) =>
    ctx.db
      .query("members")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect(),
});
