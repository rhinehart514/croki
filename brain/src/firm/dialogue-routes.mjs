// dialogue-routes.mjs — the conversation IS the operating handle (build contract Phase 4 + Phase 5).
//
// Two thin, venture-scoped, fail-closed surfaces, kept out of the shared work-routes/lens-routes files
// so this phase stays additive:
//
//   POST /api/ventures/:id/conversation/reply
//     A founder reply in the thread, interpreted as dialogue rather than buttons (§4A.2). The reply is
//     classified in the context of the effort it answers into ONE act — steer / approve /
//     approve-standing / close / new-direction — and dispatched to the EXISTING seams:
//       steer          → enqueue onto the effort's pendingSteer (§2.7); reaches the next run as context
//       close          → end the effort (founder-only; this route already established founder authority)
//       approve        → surface the exact act waiting at the gate for the founder's own release (the
//                        UNCHANGED wall path — this route never releases/sends anything itself)
//       approve-standing → record a trust grant for the act type (§4A.3) AND surface the waiting act
//       new-direction  → route to the claiming teammate (§4A.1) and start one drive
//     The classifier only PROPOSES the act; the founder's own message is the authority (invariant §5.9:
//     only the founder ends work; §5.5: the wall's release authority is untouched — a grant skips only
//     the WAIT, never the release capability, and nothing here executes an outbound act).
//
//   GET /api/ventures/:id/events   (text/event-stream)
//     The Phase 5 SSE push: a data-free "something changed" stream so a present founder sees work
//     stream without the 900 ms poll storm. The poll stays as the reconnect fallback (client hook).
//
// Direction routing for a FRESH direction (the composer's primary path) is applied in work-routes.mjs
// where the drive already starts; this file owns the review-reply dispatch and the event stream.

import { json, readBody } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { getFirmConfiguration } from "./configuration.mjs";
import { getVentureDoc, listVentureDocs } from "./venture-store.mjs";
import { appendConversationMessage } from "./conversation.mjs";
import { classifyDialogueAct } from "./dialogue-act.mjs";
import { enqueueSteer } from "./work-loop-steer.mjs";
import { recordGrant, actTypeForEffect } from "./grants.mjs";
import { routeDirection } from "./direction-routing.mjs";
import { end as endBet } from "./bet.mjs";
import { setVentureDoc } from "./venture-store.mjs";
import { subscribeFirmEvents } from "./firm-events.mjs";
import { driveTeammate } from "./work-loop.mjs";

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function statusFor(err) {
  if (err?.code === "venture_not_found") return 404;
  if (err?.code === "founder_decision_forbidden") return 403;
  return Number.isInteger(err?.status) ? err.status : 400;
}

// A small, bounded effort summary the classifier reads the reply against — the effort's intent and
// whether an act is currently waiting at its gate. Never the whole effort.
function effortSummary(ventureId, betId) {
  const bet = betId ? getVentureDoc(ventureId, "bets", betId) : null;
  if (!bet) return null;
  const waitingItem = listVentureDocs(ventureId, "decisions")
    .find((item) => item.betId === bet.id && item.decision == null && item.purpose === "release");
  return {
    betId: bet.id,
    intent: bet.intent ?? null,
    ended: Boolean(bet.endedAt),
    waitingActType: waitingItem ? actTypeForEffect(waitingItem.effect) : null,
    waitingItemId: waitingItem?.id ?? null,
  };
}

async function handleReply(ventureId, req, res, deps) {
  authorizeFounderWriteForRequest(req, "Replying in the conversation");
  const configuration = getFirmConfiguration(ventureId); // fail-closed venture existence
  const body = await readBody(req);
  const message = trimOrNull(body?.message);
  const betId = trimOrNull(body?.betId);
  if (!message) {
    const error = new Error("A conversation reply needs a message.");
    error.status = 400;
    throw error;
  }

  const summary = betId ? effortSummary(ventureId, betId) : null;
  if (betId && !summary) {
    const error = new Error(`No such effort in this venture: ${betId}`);
    error.status = 404;
    throw error;
  }

  // The founder's own message is recorded first — it is the authority every dispatch below rests on.
  const founderMessage = appendConversationMessage({ ventureId, role: "founder", content: message, betId }, deps.appendOptions);

  const { act, steerText } = await classifyDialogueAct({ message, effortSummary: summary }, deps.dialogueDeps ?? {});

  if (act === "steer") {
    if (!betId) {
      // A steer with no effort to steer is just a new direction — route it.
      return dispatchNewDirection(ventureId, configuration, message, res, deps, founderMessage.id);
    }
    enqueueSteer({ ventureId, betId, text: steerText ?? message, fromMessageId: founderMessage.id });
    json(res, 200, { act: "steer", betId, applied: "next-step", messageId: founderMessage.id });
    return;
  }

  if (act === "close") {
    if (!betId) {
      const error = new Error("Closing needs the effort being closed.");
      error.status = 400;
      throw error;
    }
    const bet = getVentureDoc(ventureId, "bets", betId);
    if (!bet) { const e = new Error(`No such effort: ${betId}`); e.status = 404; throw e; }
    // Only the founder ends work (invariant §5.9 / FIRM-SPEC rail 2). This route already established
    // founder authority above; end() itself enforces the founder-actor label. The classifier merely
    // proposed "close" — the founder's message is what ends it.
    const ended = endBet(bet, "founder", { learning: message });
    setVentureDoc(ventureId, "bets", ended.id, ended, deps.appendOptions);
    appendConversationMessage({
      ventureId, role: "teammate", teammateRef: bet.teammateRef ?? null, betId,
      content: "Stopping this — we've learned enough.",
    }, deps.appendOptions);
    json(res, 200, { act: "close", betId, ended: true, messageId: founderMessage.id });
    return;
  }

  if (act === "approve" || act === "approve-standing") {
    let grant = null;
    if (act === "approve-standing" && summary?.waitingActType) {
      // A standing approval blesses the act type going forward (§4A.3). This is remembered dialogue
      // projected into the grants file; it NEVER mints the wall's release capability.
      grant = recordGrant({ ventureId, actType: summary.waitingActType, fromMessageId: founderMessage.id });
    }
    // The release itself stays the founder's own wall act through the UNCHANGED wall path — this route
    // surfaces the waiting item for that release and never executes an outbound act (invariant §5.5).
    json(res, 200, {
      act,
      betId,
      waitingItemId: summary?.waitingItemId ?? null,
      grant: grant ? { actType: grant.actType, grantedAt: grant.grantedAt } : null,
      messageId: founderMessage.id,
      note: summary?.waitingItemId ? "Release this at the gate to send it." : "Nothing is waiting at the gate for this effort.",
    });
    return;
  }

  if (act === "new-direction") {
    return dispatchNewDirection(ventureId, configuration, message, res, deps, founderMessage.id);
  }

  json(res, 200, { act, betId, messageId: founderMessage.id });
}

async function dispatchNewDirection(ventureId, configuration, direction, res, deps, fromMessageId) {
  const routed = await routeDirection({ direction, configuration }, deps.routingDeps ?? {});
  // A fresh, never-configured firm forms its first participant on the first direction — the same
  // founding-teammate fallback work-routes.mjs uses. Otherwise a firm with no claimable participant
  // refuses rather than inventing an activation path.
  const teammateRef = routed.teammateRef
    ?? (configuration?.revision === 1 && configuration.agents.length === 0 ? "founding-teammate" : null);
  if (!teammateRef) {
    const error = new Error("This firm has no configured participant to take the direction.");
    error.status = 409;
    throw error;
  }
  const why = routed.why ?? "Taking this one.";
  // The claim is visible in the thread with a one-line why, BEFORE work begins (§4A.1).
  appendConversationMessage({
    ventureId, role: "teammate", teammateRef, content: why,
  }, deps.appendOptions);
  const drive = deps.driveTeammate ?? driveTeammate;
  const result = await drive({
    ventureId, teammateRef, goal: direction, initiatedBy: "founder",
    // The founder direction was already recorded above, so the work loop must not write it again.
    recordInitiation: false,
    options: deps.appendOptions ?? {}, deps: deps.workLoopDeps ?? {},
  });
  json(res, 200, {
    act: "new-direction",
    teammateRef,
    why,
    fromMessageId,
    outcome: result.outcome,
    messages: result.messages,
  });
}

// The SSE stream: one long-lived response per subscribed client. Writes an initial comment to open the
// stream, a retry hint, then one small JSON line per firm event for this venture. Cleaned up on close.
function handleEventStream(ventureId, req, res) {
  getFirmConfiguration(ventureId); // fail-closed: unknown venture throws before the stream opens
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
  res.write("retry: 3000\n\n");
  const unsubscribe = subscribeFirmEvents(ventureId, (event) => {
    try {
      res.write(`event: ${event.kind}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch { /* a write to a closed socket is harmless; close handler unsubscribes */ }
  });
  // A periodic heartbeat keeps intermediaries from idling the connection closed; unref'd so it never
  // pins shutdown.
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* closed */ }
  }, 25_000);
  heartbeat.unref?.();
  const close = () => { clearInterval(heartbeat); unsubscribe(); };
  req.on("close", close);
  req.on("error", close);
}

export default async function handle({ req, res, url, deps = {} }) {
  const replyMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/conversation\/reply$/);
  if (req.method === "POST" && replyMatch) {
    const ventureId = decodeURIComponent(replyMatch[1]);
    try {
      await handleReply(ventureId, req, res, deps);
    } catch (err) {
      json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const eventsMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/events$/);
  if (req.method === "GET" && eventsMatch) {
    const ventureId = decodeURIComponent(eventsMatch[1]);
    try {
      handleEventStream(ventureId, req, res);
    } catch (err) {
      json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
