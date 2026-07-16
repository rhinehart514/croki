// grants.mjs — trust as remembered dialogue, projected into a plain readable venture file.
//
// FIRM-SPEC / build contract §4A.3: "You can send these yourself now" persists as a grant attached to
// an ACT TYPE, checked before an outward act waits at the wall. Trust lives in the conversation (trust
// = remembered dialogue); the `grants` collection is its durable, revocable projection — NOT a control
// surface, NOT a policy object, and NOT a new authority. A grant only ever skips the WAIT for a
// matching act type; it NEVER mints the wall's OUTWARD_RELEASE capability, and the release still flows
// through the host-issued path (wall.mjs). Deploy keeps its second authorization regardless of any
// grant (invariant §5.8: a trust grant never mints host authority).
//
// A grant is created only from a founder conversation message that says so (dialogue-act.mjs classifies
// it as a standing "you can do this yourself" approve). The classifier proposes; the founder's own
// message is the authority — exactly the same discipline as ending work (invariant §5.9).

import crypto from "node:crypto";
import { getVentureDoc, listVentureDocs, now, setVentureDoc } from "./venture-store.mjs";

const GRANTS_COLLECTION = "grants";

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// Derive the act type an effect belongs to — DETERMINISTIC, host-owned (never a model call). An act
// type is the coarse channel/kind an outward effect uses, the unit a founder blesses ("outreach like
// this"). We key on the effect's own `kind` plus its `channel` when present, both already carried by
// every parked effect (see wall.mjs park() and work-loop-tools.mjs stage_outward). Deploy is its own
// act type and is deliberately NEVER auto-skippable (see grantSkipsWait below): the derivation still
// returns it so a founder file reads honestly, but the guard refuses to let a grant skip a deploy.
export function actTypeForEffect(effect) {
  if (!effect || typeof effect !== "object") return null;
  const kind = trimOrNull(effect.kind);
  const channel = trimOrNull(effect.channel);
  if (!kind && !channel) return null;
  // "send" is an alias of "message" in the executor dispatch (effect-executors.mjs); normalize so a
  // grant blessed on one spelling matches the other. The act type is <kind>[:<channel>], lowercased.
  const normalizedKind = kind === "send" ? "message" : (kind ?? "effect");
  const base = channel ? `${normalizedKind}:${channel}` : normalizedKind;
  return base.toLowerCase();
}

// Deploy is never skippable by a grant — the build contract and invariant §5.8/§FIRM-SPEC keep deploy's
// second explicit founder authorization regardless of any standing trust. A grant on any deploy-shaped
// act type is inert at the guard (it may still be recorded as a founder's stated intent, but it can
// never skip the wait).
function isNeverSkippable(actType) {
  return typeof actType === "string" && actType.split(":")[0] === "deploy";
}

export function listGrants(ventureId, options = {}) {
  return listVentureDocs(ventureId, GRANTS_COLLECTION, options)
    .sort((a, b) => String(a.grantedAt).localeCompare(String(b.grantedAt)));
}

// The live (non-revoked) grants only — what the guard actually checks against.
export function liveGrants(ventureId, options = {}) {
  return listGrants(ventureId, options).filter((grant) => grant.revoked !== true);
}

function grantId() {
  const stamp = now().replace(/\D/g, "").slice(0, 17);
  return `grant-${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

// Record a grant — the durable projection of a founder message that blessed an act type. `actType` is
// the coarse channel/kind the founder said they trust; `fromMessageId` links the grant back to the
// conversation message that is its real authority. Re-granting a live act type is idempotent: the
// existing live grant is returned rather than duplicated, so a founder repeating themselves never
// stacks records. A previously revoked grant of the same act type is re-created fresh (a new record),
// so the readable file shows the full history of trust given, taken, and given again.
export function recordGrant({ ventureId, actType, fromMessageId = null, grantedBy = "founder" } = {}, options = {}) {
  const venture = trimOrNull(ventureId);
  if (!venture) throw new Error("recordGrant() needs a ventureId.");
  const type = trimOrNull(actType)?.toLowerCase();
  if (!type) throw new Error("recordGrant() needs an actType to remember.");
  const existing = liveGrants(venture, options).find((grant) => grant.actType === type);
  if (existing) return existing;
  const grant = {
    id: grantId(),
    type: "grant",
    ventureId: venture,
    actType: type,
    grantedAt: now(),
    grantedBy: trimOrNull(grantedBy) ?? "founder",
    fromMessageId: trimOrNull(fromMessageId),
    revoked: false,
  };
  setVentureDoc(venture, GRANTS_COLLECTION, grant.id, grant, options);
  return grant;
}

// Revoke a grant by act type — a plain readable-file change (the build contract's acceptance: "revoking
// is a plain readable-file change"). Flips every live grant of that act type to revoked; returns the
// revoked records. A missing grant is a harmless no-op (nothing to take back).
export function revokeGrant({ ventureId, actType } = {}, options = {}) {
  const venture = trimOrNull(ventureId);
  if (!venture) throw new Error("revokeGrant() needs a ventureId.");
  const type = trimOrNull(actType)?.toLowerCase();
  if (!type) throw new Error("revokeGrant() needs an actType.");
  const revoked = [];
  for (const grant of liveGrants(venture, options)) {
    if (grant.actType !== type) continue;
    const updated = { ...grant, revoked: true, revokedAt: now() };
    setVentureDoc(venture, GRANTS_COLLECTION, grant.id, updated, options);
    revoked.push(updated);
  }
  return revoked;
}

// THE GUARD CHECK (deterministic). Before an outward effect parks at the wall, ask: does a live,
// non-revoked grant match this effect's act type? If yes AND the act type is not a never-skippable one
// (deploy), the act may proceed WITHOUT WAITING — the founder pre-authorized it by remembered dialogue.
// This returns only whether the WAIT is skipped; it never returns or mints the release capability. The
// caller (work-loop-tools.mjs stage_outward) still routes a skipped act through the host-issued release
// path, now founder-pre-authorized. A non-matching act type, or any deploy, returns { skip: false } and
// the effect parks normally.
export function grantSkipsWait(ventureId, effect, options = {}) {
  const actType = actTypeForEffect(effect);
  if (!actType) return { skip: false, actType: null, grant: null };
  if (isNeverSkippable(actType)) return { skip: false, actType, grant: null, neverSkippable: true };
  const grant = liveGrants(ventureId, options).find((entry) => entry.actType === actType) ?? null;
  return { skip: Boolean(grant), actType, grant };
}
