import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The Convex schema is the team's shared GTM brain-state. The engine stays local-first and
// synchronous (it reads/writes ~/.gtm-ide on each machine); these tables are its shared MIRROR, so
// a team works one set of programs, graphs, runs, gate decisions and taste together. Nothing here
// replaces the local gate — the wall still holds on each machine; this only syncs the state around
// it. See brain/src/convex-sync.mjs for the write-behind/pull syncer.
export default defineSchema({
  // The unit of shared state. Everything (the project catalog and every per-project store) is
  // scoped to one team.
  teams: defineTable({
    name: v.string(),
    slug: v.string(),
    inviteCode: v.string(), // join-by-code, used by the onboarding flow
    createdBy: v.string(), // member identity (email for now; becomes the auth subject later)
    createdAt: v.string(),
  })
    .index("by_slug", ["slug"])
    .index("by_invite", ["inviteCode"]),

  // Who belongs to a team and what they may do. `role` is load-bearing: only an owner/approver may
  // resolve a founder gate (the one action that reaches the outside world). builder edits the graph
  // up to the gate; viewer watches.
  members: defineTable({
    teamId: v.id("teams"),
    identity: v.string(), // email for now
    name: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("approver"),
      v.literal("builder"),
      v.literal("viewer"),
    ),
    joinedAt: v.string(),
  })
    .index("by_team", ["teamId"])
    .index("by_identity", ["identity"])
    .index("by_team_identity", ["teamId", "identity"]),

  // THE THIN LAYER. Every file-backed store document is mirrored as one row, keyed by its path
  // relative to the local store root (e.g. "project.json", "programs/rodentradar.json",
  // "operator-sessions/op-….json"). This one table backs the engine's entire durable state with no
  // per-store schema — the engine never learns about Convex; the syncer pushes here on write and
  // pulls back on boot. `data` is exactly the JSON the store serialized. last-write-wins by
  // `updatedAt` keeps two machines convergent without a merge engine (per-document granularity).
  documents: defineTable({
    teamId: v.id("teams"),
    key: v.string(),
    data: v.any(),
    updatedAt: v.string(), // ISO timestamp the local write happened
    updatedBy: v.string(),
  })
    .index("by_team_key", ["teamId", "key"])
    .index("by_team", ["teamId"]),

  // The first reactive multiplayer surface: the gate approval queue. When a run stages something
  // behind the founder gate, the brain publishes it here so any approver can review it from the web
  // or their phone — the one moment a teammate genuinely needs off their own dev machine. This
  // MIRRORS the local gate; it never sends. Resolving here records the decision; the local engine
  // still performs the staged action behind its own wall.
  approvals: defineTable({
    teamId: v.id("teams"),
    projectId: v.string(),
    sessionId: v.string(),
    graphId: v.optional(v.string()),
    nodeId: v.string(),
    title: v.string(),
    summary: v.optional(v.string()),
    stagedCount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    decidedBy: v.optional(v.string()),
    note: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_team_status", ["teamId", "status"])
    .index("by_session", ["sessionId"]),
});
