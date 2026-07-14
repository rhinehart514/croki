// product-routes.mjs — the firm's HTTP surface for fork-is-a-worktree (F4/integration pass). Thin,
// venture-scoped, fails closed — same posture as routes.mjs's wall surface, just for the
// product-change contract: fork/list/stage are teammate-driven (no founder wall — they only ever
// stage local isolated work, never touch the source repo), while review/apply/revert/discard are
// founder-only writes gated by authorizeFounderWriteForRequest BEFORE product-change-decide.mjs's own
// store-layer actor check ever runs — the same two-layer shape wall.mjs's decide() already proves
// (browser-session guard at the door, a resolved-actor check one layer down). Mirrors the
// founder-wall + agent-stamp-rejection + cross-venture-404 tests from wall-routes.test.mjs.
//
// This file is new (not routes.mjs, which is builder-f3's F3 wall surface) and appended to
// server.mjs's ROUTE_GROUPS separately — nothing here edits routes.mjs, wall.mjs, market.mjs,
// heat.mjs, or work-loop*.mjs.

import path from "node:path";
import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/session-guard.mjs";
import { forkProductBet, listBetProductChanges, stageProductBetForReview, getWorkspace } from "./product-change.mjs";
import {
  reviewProductBetChange,
  inspectProductBetChangeReadiness,
  applyProductBetChange,
  revertProductBetChange,
  discardProductBetChange,
} from "./product-change-decide.mjs";
import { getVentureDoc, setVentureDoc } from "./venture-store.mjs";

function fail(res, err) {
  json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
}

// The store/queue options this route's calls need — resolved from GTM_IDE_HOME exactly the way
// friction.mjs's own resolveFrictionQueueDir() does, so a test that isolates GTM_IDE_HOME (the same
// convention wall-routes.test.mjs already uses) gets a genuinely isolated queue and store, and
// production with no override falls through to the real product home and the real repo. Every
// product-change* function this file calls takes `options` as a trailing bag, exactly like every
// other store in this tree.
function firmOptions() {
  const home = process.env.GTM_IDE_HOME;
  return home ? { root: home, queueDir: path.join(home, "dogfood", "queue") } : {};
}

// A workspace is venture-scoped through the bet that opened it (product-change-workspace.mjs stamps
// ventureId/betId onto every workspace at openBetWorkspace time) — this is the fail-closed check
// every workspace/revision route below runs before touching anything, so venture B's workspace id
// can never be reached through venture A's URL. Same 404 shape as wall.mjs's assertItemInVenture.
function assertWorkspaceInVenture(workspace, ventureId, workspaceId) {
  if (!workspace || workspace.ventureId !== ventureId) {
    const error = new Error(`No such product-change workspace in this venture: ${workspaceId}`);
    error.status = 404;
    throw error;
  }
}

// The founder actor this route resolved for the request — never read from the request body, only
// ever derived from having already cleared authorizeFounderWriteForRequest. Passed on to the
// store-layer actor check in product-change-decide.mjs, which still independently refuses anything
// not stamped "founder" — the route clearing its guard is not a substitute for that second check,
// it is what makes the second check always pass for a genuinely authorized caller and always refuse
// for anything else that might call the store functions directly (a test, a future MCP door).
const FOUNDER_ACTOR = "founder";

export default async function handle({ req, res, url }) {
  const listMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/bets\/([^/]+)\/product-changes$/);
  if (req.method === "GET" && listMatch) {
    const ventureId = decodeURIComponent(listMatch[1]);
    const betId = decodeURIComponent(listMatch[2]);
    try {
      json(res, 200, { changes: listBetProductChanges(ventureId, betId, firmOptions()) });
    } catch (err) { fail(res, err); }
    return true;
  }

  const forkMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/bets\/([^/]+)\/product-changes\/fork$/);
  if (req.method === "POST" && forkMatch) {
    const ventureId = decodeURIComponent(forkMatch[1]);
    const betId = decodeURIComponent(forkMatch[2]);
    try {
      const body = await readBody(req);
      const enqueued = forkProductBet({ ventureId, betId, intent: body?.intent }, firmOptions());
      json(res, 200, { file: enqueued.file, status: enqueued.status, capturedAt: enqueued.capturedAt });
    } catch (err) { fail(res, err); }
    return true;
  }

  // Stage: not founder-walld at the door — it only ever moves a ready-for-review diff into a review
  // revision + parks it at the wall (F3's own door then gates the actual release). `bet` in the body
  // is the caller's already-loaded bet object (the same convention stageProductBetForReview takes in
  // process — this route trusts the caller to have loaded it, exactly as wall.mjs trusts a caller's
  // resolved ventureId/itemId rather than re-deriving them).
  const stageMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/bets\/([^/]+)\/product-changes\/([^/]+)\/stage$/);
  if (req.method === "POST" && stageMatch) {
    const ventureId = decodeURIComponent(stageMatch[1]);
    const betId = decodeURIComponent(stageMatch[2]);
    const file = decodeURIComponent(stageMatch[3]);
    try {
      const options = firmOptions();
      const bet = getVentureDoc(ventureId, "bets", betId, options);
      if (!bet) throw Object.assign(new Error(`No such bet: ${betId}`), { status: 404 });
      const { bet: updatedBet, workspaceId, revision } = await stageProductBetForReview(bet, file, options);
      setVentureDoc(ventureId, "bets", updatedBet.id, updatedBet, options);
      json(res, 200, { workspaceId, revision });
    } catch (err) { fail(res, err); }
    return true;
  }

  const readinessMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/product-change-workspaces\/([^/]+)\/revisions\/([^/]+)\/readiness$/);
  if (req.method === "GET" && readinessMatch) {
    const ventureId = decodeURIComponent(readinessMatch[1]);
    const workspaceId = decodeURIComponent(readinessMatch[2]);
    const revisionId = decodeURIComponent(readinessMatch[3]);
    try {
      const options = firmOptions();
      const workspace = getWorkspace(workspaceId, options);
      assertWorkspaceInVenture(workspace, ventureId, workspaceId);
      json(res, 200, { readiness: inspectProductBetChangeReadiness(workspaceId, revisionId, options) });
    } catch (err) { fail(res, err); }
    return true;
  }

  const reviewMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/product-change-workspaces\/([^/]+)\/revisions\/([^/]+)\/review$/);
  if (req.method === "POST" && reviewMatch) {
    const ventureId = decodeURIComponent(reviewMatch[1]);
    const workspaceId = decodeURIComponent(reviewMatch[2]);
    const revisionId = decodeURIComponent(reviewMatch[3]);
    try {
      authorizeFounderWriteForRequest(req, "Reviewing a product change");
      const options = firmOptions();
      const workspace = getWorkspace(workspaceId, options);
      assertWorkspaceInVenture(workspace, ventureId, workspaceId);
      const body = await readBody(req);
      const revision = reviewProductBetChange(workspaceId, revisionId, FOUNDER_ACTOR, { decision: body?.decision, note: body?.note ?? null }, options);
      json(res, 200, { revision });
    } catch (err) { fail(res, err); }
    return true;
  }

  const applyMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/product-change-workspaces\/([^/]+)\/revisions\/([^/]+)\/apply$/);
  if (req.method === "POST" && applyMatch) {
    const ventureId = decodeURIComponent(applyMatch[1]);
    const workspaceId = decodeURIComponent(applyMatch[2]);
    const revisionId = decodeURIComponent(applyMatch[3]);
    try {
      authorizeFounderWriteForRequest(req, "Applying a product change");
      const options = firmOptions();
      const workspace = getWorkspace(workspaceId, options);
      assertWorkspaceInVenture(workspace, ventureId, workspaceId);
      const body = await readBody(req);
      const revision = applyProductBetChange(workspaceId, revisionId, FOUNDER_ACTOR, { confirm: body?.confirm === true }, options);
      json(res, 200, { revision });
    } catch (err) { fail(res, err); }
    return true;
  }

  const revertMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/product-change-workspaces\/([^/]+)\/revisions\/([^/]+)\/revert$/);
  if (req.method === "POST" && revertMatch) {
    const ventureId = decodeURIComponent(revertMatch[1]);
    const workspaceId = decodeURIComponent(revertMatch[2]);
    const revisionId = decodeURIComponent(revertMatch[3]);
    try {
      authorizeFounderWriteForRequest(req, "Reverting a product change");
      const options = firmOptions();
      const workspace = getWorkspace(workspaceId, options);
      assertWorkspaceInVenture(workspace, ventureId, workspaceId);
      const body = await readBody(req);
      const revision = revertProductBetChange(workspaceId, revisionId, FOUNDER_ACTOR, { confirm: body?.confirm === true }, options);
      json(res, 200, { revision });
    } catch (err) { fail(res, err); }
    return true;
  }

  const discardMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/bets\/([^/]+)\/product-changes\/([^/]+)\/discard$/);
  if (req.method === "POST" && discardMatch) {
    const ventureId = decodeURIComponent(discardMatch[1]);
    const betId = decodeURIComponent(discardMatch[2]);
    const file = decodeURIComponent(discardMatch[3]);
    try {
      authorizeFounderWriteForRequest(req, "Discarding an isolated product change");
      const options = firmOptions();
      const body = await readBody(req);
      const result = discardProductBetChange(ventureId, betId, file, FOUNDER_ACTOR, { confirm: body?.confirm === true }, options);
      json(res, 200, { result });
    } catch (err) { fail(res, err); }
    return true;
  }

  return false;
}
