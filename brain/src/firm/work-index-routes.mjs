// Venture-scoped production work index. Reads join canonical and live state; the only write advances a
// founder-owned review cursor to the exact consequence currently visible, with stale writes rejected.

import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { abortActiveDrive, listActiveDrives } from "./active-drives.mjs";
import { emitFirmEvent } from "./firm-events.mjs";
import { deleteDirectionThread, getSemanticModel, markDirectionThreadReviewed, setDirectionThreadName, setDirectionThreadPinned } from "./semantic-model-store.mjs";
import { buildThreadTimeline } from "./thread-timeline.mjs";
import { buildWorkIndex } from "./work-index.mjs";
import { listWorkScopes, revokeWorkScope } from "./work-scopes.mjs";
import { editQueuedFounderTurn, removeQueuedFounderTurn, tombstoneQueuedFounderTurns } from "./founder-turn-queue.mjs";
import { recordMatchingRunTombstones } from "./work-journal-runtime.mjs";

function statusFor(error) {
  if (error?.code === "venture_not_found" || error?.code === "semantic_model_missing_ref") return 404;
  if (error?.code === "founder_decision_forbidden") return 403;
  return Number.isInteger(error?.status) ? error.status : 400;
}

export default async function handle({ req, res, url }) {
  const indexMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/work-index$/);
  if (req.method === "GET" && indexMatch) {
    try {
      const ventureId = decodeURIComponent(indexMatch[1]);
      json(res, 200, { workIndex: buildWorkIndex(ventureId, { query: url.searchParams.get("q") ?? "" }) });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const timelineMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/threads\/([^/]+)\/timeline$/);
  if (req.method === "GET" && timelineMatch) {
    try {
      const ventureId = decodeURIComponent(timelineMatch[1]);
      const threadId = decodeURIComponent(timelineMatch[2]);
      json(res, 200, { timeline: buildThreadTimeline(ventureId, threadId) });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const pinMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/threads\/([^/]+)\/pin$/);
  if (req.method === "PUT" && pinMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Pinning a thread");
      const ventureId = decodeURIComponent(pinMatch[1]);
      const threadId = decodeURIComponent(pinMatch[2]);
      const body = await readBody(req);
      if (typeof body?.pinned !== "boolean") throw Object.assign(new Error("Pinning needs a boolean pinned value."), { status: 400 });
      const threadRef = `thread:${threadId}`;
      setDirectionThreadPinned(ventureId, threadRef, body.pinned, { actor: { authority: "founder", id: "founder" } });
      const after = buildWorkIndex(ventureId);
      emitFirmEvent(ventureId, "timeline", { threadRef });
      json(res, 200, { item: after.items.find((entry) => entry.threadRef === threadRef), workIndex: after });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const nameMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/threads\/([^/]+)\/name$/);
  if (req.method === "PUT" && nameMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Renaming a thread");
      const ventureId = decodeURIComponent(nameMatch[1]);
      const threadId = decodeURIComponent(nameMatch[2]);
      const body = await readBody(req);
      const threadRef = `thread:${threadId}`;
      setDirectionThreadName(ventureId, threadRef, body?.name, { actor: { authority: "founder", id: "founder" } });
      const after = buildWorkIndex(ventureId);
      emitFirmEvent(ventureId, "timeline", { threadRef });
      json(res, 200, { item: after.items.find((entry) => entry.threadRef === threadRef), workIndex: after });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const followUpMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/threads\/([^/]+)\/follow-ups\/([^/]+)$/);
  if ((req.method === "PUT" || req.method === "DELETE") && followUpMatch) {
    try {
      authorizeFounderWriteForRequest(req, req.method === "PUT" ? "Editing a queued founder turn" : "Removing a queued founder turn");
      const ventureId = decodeURIComponent(followUpMatch[1]);
      const threadId = decodeURIComponent(followUpMatch[2]);
      const turnId = decodeURIComponent(followUpMatch[3]);
      const body = await readBody(req);
      const threadRef = `thread:${threadId}`;
      const model = getSemanticModel(ventureId);
      const thread = model.threads.find((entry) => entry.id === threadId && !entry.deletedAt);
      if (!thread) throw Object.assign(new Error(`No such direction thread: ${threadId}`), { status: 404 });
      const betIds = [...new Set([
        ...(thread.subjectRefs ?? []),
        ...model.runs.filter((run) => run.threadRef === threadRef).flatMap((run) => run.betRefs ?? []),
      ].filter((ref) => String(ref).startsWith("bet:")).map((ref) => String(ref).replace(/^bet:/, "")))];
      const betId = String(body?.betId ?? url.searchParams.get("betId") ?? "");
      if (!betId || !betIds.includes(betId)) throw Object.assign(new Error("That queued turn does not belong to this Thread."), { status: 404 });
      const turn = req.method === "PUT"
        ? editQueuedFounderTurn({ ventureId, betId, turnId, text: body?.text })
        : removeQueuedFounderTurn({ ventureId, betId, turnId, reason: "removed-by-founder" });
      emitFirmEvent(ventureId, "timeline", { threadRef, queuedFounderTurn: turn.id });
      json(res, 200, { turn });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const deleteMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/threads\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Deleting a chat and stopping its work");
      const ventureId = decodeURIComponent(deleteMatch[1]);
      const threadId = decodeURIComponent(deleteMatch[2]);
      const threadRef = `thread:${threadId}`;
      const model = getSemanticModel(ventureId);
      const thread = model.threads.find((entry) => entry.id === threadId && !entry.deletedAt);
      if (!thread || threadId === "venture-root") {
        throw Object.assign(new Error(`No such direction thread: ${threadId}`), { code: "semantic_model_missing_ref", status: 404 });
      }

      const runs = model.runs.filter((run) => run.threadRef === threadRef);
      const runIds = new Set(runs.map((run) => run.id));
      const betIds = new Set([
        ...(thread.subjectRefs ?? []),
        ...runs.flatMap((run) => run.betRefs ?? []),
      ].filter((ref) => String(ref).startsWith("bet:")).map((ref) => String(ref).replace(/^bet:/, "")));
      const active = listActiveDrives(ventureId).filter((drive) => runIds.has(drive.id) || (drive.betId && betIds.has(drive.betId)));
      const unsafe = active.find((drive) => !drive.abortSupported);
      if (unsafe) {
        throw Object.assign(new Error(`${unsafe.runtime} cannot safely stop this chat yet, so Croki did not delete it.`), { code: "thread_delete_stop_unsupported", status: 409 });
      }

      // Tombstone first: no new continuation may target this Thread once deletion begins. Existing live
      // transports are then cancelled and every restartable authority rooted here is revoked.
      recordMatchingRunTombstones(ventureId, {
        threadRef,
        reasonCode: "thread-deleted",
        authorityRef: threadRef,
      });
      deleteDirectionThread(ventureId, threadRef, { actor: { authority: "founder", id: "founder" } });
      for (const betId of betIds) tombstoneQueuedFounderTurns({
        ventureId,
        betId,
        reason: "thread-deleted",
      });
      const revokedWorkScopeRefs = [];
      for (const scope of listWorkScopes(ventureId).filter((entry) => entry.originThreadRef === threadRef && !entry.revokedAt)) {
        revokeWorkScope({
          ventureId,
          scopeId: scope.id,
          reason: "The founder deleted the originating chat.",
          actor: { authority: "founder", id: "founder" },
        });
        revokedWorkScopeRefs.push(`work-scope:${scope.id}`);
      }
      const stoppedRunRefs = [];
      for (const drive of active) {
        try {
          abortActiveDrive({ ventureId, driveId: drive.id });
          stoppedRunRefs.push(`run:${drive.id}`);
        } catch (error) {
          // A drive that settled between discovery and cancellation is already stopped. Any other
          // failure is consequential and must remain visible rather than being mistaken for success.
          if (error?.status !== 404) throw error;
        }
      }
      const workIndex = buildWorkIndex(ventureId);
      emitFirmEvent(ventureId, "timeline", { threadRef, deleted: true });
      json(res, 200, { deleted: true, threadRef, stoppedRunRefs, revokedWorkScopeRefs, workIndex });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error), ...(error?.code ? { code: error.code } : {}) });
    }
    return true;
  }

  const reviewMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/work-index\/([^/]+)\/reviewed-through$/);
  if (req.method === "PUT" && reviewMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Reviewing returned work");
      const ventureId = decodeURIComponent(reviewMatch[1]);
      const threadId = decodeURIComponent(reviewMatch[2]);
      const body = await readBody(req);
      const requested = String(body?.reviewedThrough ?? "").trim();
      const before = buildWorkIndex(ventureId);
      const item = before.items.find((entry) => entry.threadRef === `thread:${threadId}`);
      if (!item) throw Object.assign(new Error(`No such direction thread: ${threadId}`), { code: "semantic_model_missing_ref", status: 404 });
      if (!requested || requested !== item.latestMeaningfulEvent.ref) {
        throw Object.assign(new Error("Work changed since this review began."), { code: "work_index_stale_review", status: 409 });
      }
      markDirectionThreadReviewed(
        ventureId,
        item.threadRef,
        requested,
        { actor: { authority: "founder", id: "founder" } },
      );
      const after = buildWorkIndex(ventureId);
      json(res, 200, { item: after.items.find((entry) => entry.threadRef === item.threadRef), workIndex: after });
    } catch (error) {
      json(res, statusFor(error), { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  return false;
}
