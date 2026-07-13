import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";
import { now } from "./store-fs.mjs";

// Team identity + membership. Local-first stays the base: a single founder is a team of one with no
// login wall. This store models multiple members and roles so the parallel Convex sync layer can make
// the multiplayer real — but nothing here authenticates anyone. Real multi-user auth rides on Convex
// in the other lane; here identity is data plus a resolver that defaults to one founder.
const SCHEMA_VERSION = 1;
const COLLECTION = "teams";

// Roles, least to most. owner and approver can clear founder gates; member cannot. The set is open to
// extension (Convex may add finer roles), but these three are the durable floor the gate lane builds on.
export const TEAM_ROLES = ["owner", "approver", "member"];
const APPROVER_ROLES = new Set(["owner", "approver"]);

// The single local founder. With no Convex and no signed-in user, every request resolves to this one
// identity, so a solo founder never sees a login wall and existing single-user behavior is untouched.
export const FOUNDER_USER_ID = "founder";
const FOUNDER_USER = {
  userId: FOUNDER_USER_ID,
  name: "Founder",
  email: null,
};

// Each founder gets a personal team of one, created on demand. Its id is derived from the user id so it
// is stable across restarts and the same every time we resolve it — never a fresh random team per boot.
function personalTeamId(userId) {
  return `personal-${safeId(userId)}`;
}

function safeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return TEAM_ROLES.includes(value) ? value : "member";
}

function normalizeMember(raw) {
  const userId = String(raw?.userId || "").trim();
  if (!userId) throw new Error("A team member requires a userId.");
  return {
    userId,
    name: String(raw?.name || userId).trim(),
    email: raw?.email ? String(raw.email).trim() : null,
    role: normalizeRole(raw?.role),
  };
}

export function createTeam(input = {}, options = {}) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("A team name is required.");
  const createdAt = now();
  const id = input.id
    ? safeId(input.id)
    : `team-${createdAt.replace(/\D/g, "").slice(0, 14)}-${crypto.randomBytes(4).toString("hex")}`;
  // The creator (or the founder by default) seeds the team as its owner, so a fresh team always has
  // exactly one member who can approve. Any extra members passed in are normalized alongside.
  const owner = normalizeMember({
    ...(input.owner ?? resolveCurrentUser(options)),
    role: "owner",
  });
  const extra = Array.isArray(input.members)
    ? input.members.map(normalizeMember).filter((m) => m.userId !== owner.userId)
    : [];
  const team = {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    members: [owner, ...extra],
    createdAt,
    updatedAt: createdAt,
  };
  persistence(options).set(COLLECTION, safeId(id), team);
  return team;
}

export function saveTeam(team, options = {}) {
  const updated = { ...team, schemaVersion: SCHEMA_VERSION, updatedAt: now() };
  persistence(options).set(COLLECTION, safeId(updated.id), updated);
  return updated;
}

export function getTeam(teamId, options = {}) {
  const team = persistence(options).get(COLLECTION, safeId(teamId));
  if (!team) throw new Error(`Team not found: ${teamId}`);
  return team;
}

// Like getTeam but returns null instead of throwing — used by the personal-team resolver, which must
// be able to ask "does this team exist yet?" without an exception.
function findTeam(teamId, options = {}) {
  return persistence(options).get(COLLECTION, safeId(teamId)) ?? null;
}

export function listTeams(options = {}) {
  return persistence(options).list(COLLECTION)
    .filter((team) => team && team.id)
    .map((team) => ({
      id: team.id,
      name: team.name,
      memberCount: team.members?.length ?? 0,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function listMembers(teamId, options = {}) {
  return getTeam(teamId, options).members ?? [];
}

// Add a member, or update the role/name/email of an existing one (matched by userId). Idempotent on
// userId so adding the same person twice promotes their role rather than duplicating them.
export function addMember(teamId, member, options = {}) {
  const team = getTeam(teamId, options);
  const normalized = normalizeMember(member);
  const members = team.members ?? [];
  const exists = members.some((m) => m.userId === normalized.userId);
  const nextMembers = exists
    ? members.map((m) => (m.userId === normalized.userId ? { ...m, ...normalized } : m))
    : [...members, normalized];
  return saveTeam({ ...team, members: nextMembers }, options);
}

export function removeMember(teamId, userId, options = {}) {
  const team = getTeam(teamId, options);
  const members = (team.members ?? []).filter((m) => m.userId !== userId);
  if (!members.some((m) => m.role === "owner")) {
    throw new Error("A team must keep at least one owner.");
  }
  return saveTeam({ ...team, members }, options);
}

export function getMember(teamId, userId, options = {}) {
  return (getTeam(teamId, options).members ?? []).find((m) => m.userId === userId) ?? null;
}

export function memberRole(teamId, userId, options = {}) {
  return getMember(teamId, userId, options)?.role ?? null;
}

// The gate lane's authority check: can this user clear a founder gate on this team? Owner and approver
// can; member cannot; a non-member cannot. The gate itself still owns the wall — this only answers who
// is allowed to stand at it.
export function canApprove(teamId, userId, options = {}) {
  const role = memberRole(teamId, userId, options);
  return role ? APPROVER_ROLES.has(role) : false;
}

// The teams a user belongs to, across the catalog. Drives the "my teams" view.
export function teamsForUser(userId, options = {}) {
  return persistence(options).list(COLLECTION)
    .filter((team) => team && team.id && (team.members ?? []).some((m) => m.userId === userId))
    .map((team) => {
      const member = team.members.find((m) => m.userId === userId);
      return {
        id: team.id,
        name: team.name,
        role: member?.role ?? null,
        memberCount: team.members.length,
        updatedAt: team.updatedAt,
      };
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

// The current-user resolver. NO password, NO auth library — that rides on Convex in the other lane.
// Identity is data: by default the local founder, or a user supplied through a request header / env
// when one is present (so the Convex lane can stamp the acting user without changing this contract).
//   request.headers["x-gtm-user"] / ["x-gtm-user-name"] / ["x-gtm-user-email"]
//   process.env.GTM_IDE_USER_ID / GTM_IDE_USER_NAME / GTM_IDE_USER_EMAIL
export function resolveCurrentUser(options = {}) {
  const headers = options.request?.headers ?? options.headers ?? {};
  const headerId = headers["x-gtm-user"] ?? headers["X-Gtm-User"];
  const headerName = headers["x-gtm-user-name"] ?? headers["X-Gtm-User-Name"];
  const headerEmail = headers["x-gtm-user-email"] ?? headers["X-Gtm-User-Email"];
  const userId = String(options.userId || headerId || process.env.GTM_IDE_USER_ID || "").trim();
  if (!userId) return { ...FOUNDER_USER };
  return {
    userId,
    name: String(headerName || process.env.GTM_IDE_USER_NAME || userId).trim(),
    email: (headerEmail || process.env.GTM_IDE_USER_EMAIL)
      ? String(headerEmail || process.env.GTM_IDE_USER_EMAIL).trim()
      : null,
  };
}

// Get-or-create a user's personal team — the default team every project falls back to so an
// ownership reference is never dangling. Stable id, owner = the user, created lazily on first ask.
export function ensurePersonalTeam(user, options = {}) {
  const resolved = user?.userId ? normalizeMember({ ...user, role: "owner" }) : { ...FOUNDER_USER, role: "owner" };
  const id = personalTeamId(resolved.userId);
  const existing = findTeam(id, options);
  if (existing) return existing;
  return createTeam({
    id,
    name: `${resolved.name}'s workspace`,
    owner: resolved,
  }, options);
}

// The default team id a project/session is owned by when none is set: the current user's personal team.
export function defaultTeamId(options = {}) {
  return ensurePersonalTeam(resolveCurrentUser(options), options).id;
}
