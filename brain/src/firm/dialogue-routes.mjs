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
import { end as endBet, fork as forkBet } from "./bet.mjs";
import { setVentureDoc } from "./venture-store.mjs";
import { subscribeFirmEvents } from "./firm-events.mjs";
import { driveTeammate } from "./work-loop.mjs";
import { abortActiveDrive, listActiveDrives } from "./active-drives.mjs";
import { ensureDirectionThread, extendDirectionThread, getSemanticModel, setDirectionThreadLifecycle } from "./semantic-model-store.mjs";
import { checkAuthorizedObservations } from "./release-observation.mjs";

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function statusFor(err) {
  if (err?.code === "venture_not_found") return 404;
  if (err?.code === "founder_decision_forbidden") return 403;
  return Number.isInteger(err?.status) ? err.status : 400;
}

function participantAliases(configuration) {
  return new Map((configuration.agents ?? []).flatMap((agent) => [agent.ref, agent.name, agent.label]
    .filter(Boolean).map((alias) => [String(alias).toLocaleLowerCase(), agent.ref])));
}

function participantName(configuration, ref) {
  const participant = (configuration.agents ?? []).find((agent) => agent.ref === ref);
  return participant?.name ?? participant?.label ?? ref;
}

function mentionedParticipants(message, configuration) {
  const lower = String(message).toLocaleLowerCase();
  return [...new Set([...participantAliases(configuration)]
    .filter(([alias]) => new RegExp(`(^|\\W)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\W|$)`, "i").test(lower))
    .map(([, ref]) => ref))];
}

function appendThreadReply({ ventureId, threadRef, betId, teammateRef = null, content, options }) {
  const reply = appendConversationMessage({ ventureId, role: "teammate", teammateRef, betId, content, ...(threadRef ? { target: { threadRef } } : {}) }, options);
  if (threadRef) extendDirectionThread(ventureId, threadRef, { messageRefs: [`conversation:${reply.id}`] }, options);
  return reply;
}

function launchDrive({ drive, input, ventureId, threadRef, betId, teammateRef, options }) {
  let task;
  try {
    task = Promise.resolve(drive(input));
  } catch (error) {
    task = Promise.reject(error);
  }
  task.catch((error) => {
    try {
      const detail = error instanceof Error ? error.message : String(error);
      appendThreadReply({
        ventureId,
        threadRef,
        betId,
        teammateRef,
        content: `${teammateRef ?? "Drover"} could not continue this work: ${detail}`,
        options,
      });
    } catch {
      // The original drive failure is already terminal; reporting it must never create an unhandled rejection.
    }
  });
  return task;
}

function latestArtifactRef(ventureId, betId) {
  const bet = betId ? getVentureDoc(ventureId, "bets", betId) : null;
  const artifact = [...(bet?.staged ?? [])].reverse().find((item) => item?.id);
  return artifact ? `work:${artifact.id}` : null;
}

async function dispatchParticipantCommand({ ventureId, configuration, message, betId, threadRef, founderMessageId, res, deps }) {
  const critique = /\bcritique\b/i.test(message);
  const parallel = /\b(independently|side[ -]by[ -]side|separate (?:approaches|attempts)|both try)\b/i.test(message);
  const involve = /^\s*(?:have|ask|let)\b/i.test(message) && /\b(join|help|inspect|explore|work|try|critique|review)\b/i.test(message);
  if (!critique && !parallel && !involve) return false;

  let participants = mentionedParticipants(critique ? message.split(/\bcritique\b/i)[0] : message, configuration);
  if (parallel && participants.length === 0 && (configuration.agents ?? []).length === 2) {
    participants = configuration.agents.map((agent) => agent.ref);
  }
  const required = parallel ? 2 : 1;
  if (participants.length !== required || !betId || !threadRef) {
    const note = !threadRef || !betId
      ? "Which active thread and work should I use for that request?"
      : parallel
        ? "Which two participants should try this independently?"
        : "Which participant should take that request?";
    appendThreadReply({ ventureId, threadRef, betId, content: note, options: deps.appendOptions });
    json(res, 200, { act: parallel ? "parallel-attempts" : critique ? "critique" : "involve-participant", messageId: founderMessageId, note, needsFounderJudgment: true });
    return true;
  }

  const drive = deps.driveTeammate ?? driveTeammate;
  if (parallel) {
    const parent = getVentureDoc(ventureId, "bets", betId);
    if (!parent) throw Object.assign(new Error(`No such effort: ${betId}`), { status: 404 });
    const attempts = participants.map((teammateRef) => {
      const attempt = forkBet(parent, `${message} — independent attempt by ${teammateRef}`, { teammateRef, configurationRevision: configuration.revision });
      setVentureDoc(ventureId, "bets", attempt.id, attempt, deps.appendOptions);
      return attempt;
    });
    appendThreadReply({ ventureId, threadRef, betId, content: `${participants.join(" and ")} are trying this independently in the same thread.`, options: deps.appendOptions });
    for (const attempt of attempts) launchDrive({
      drive,
      input: {
        ventureId, teammateRef: attempt.teammateRef, betId: attempt.id, goal: message, initiatedBy: "founder",
        recordInitiation: false, originMessageRef: founderMessageId, target: { threadRef, betId: attempt.id },
        options: deps.appendOptions ?? {}, deps: deps.workLoopDeps ?? {},
      },
      ventureId, threadRef, betId: attempt.id, teammateRef: attempt.teammateRef, options: deps.appendOptions,
    });
    json(res, 202, { act: "parallel-attempts", accepted: true, messageId: founderMessageId, threadRef, attempts: attempts.map((attempt) => ({ betId: attempt.id, teammateRef: attempt.teammateRef })) });
    return true;
  }

  const teammateRef = participants[0];
  const workRef = critique ? latestArtifactRef(ventureId, betId) : null;
  if (critique && !workRef) {
    const note = "I could not find a returned artifact in this thread to critique. Which work do you mean?";
    appendThreadReply({ ventureId, threadRef, betId, content: note, options: deps.appendOptions });
    json(res, 200, { act: "critique", messageId: founderMessageId, note, needsFounderJudgment: true });
    return true;
  }
  appendThreadReply({ ventureId, threadRef, betId, teammateRef, content: `${teammateRef} is ${critique ? "critiquing the returned work" : "joining this thread"}.`, options: deps.appendOptions });
  launchDrive({
    drive,
    input: {
      ventureId, teammateRef, betId, goal: message, initiatedBy: "founder", recordInitiation: false,
      originMessageRef: founderMessageId, target: { threadRef, betId, ...(workRef ? { workRef } : {}) },
      options: deps.appendOptions ?? {}, deps: deps.workLoopDeps ?? {},
    },
    ventureId, threadRef, betId, teammateRef, options: deps.appendOptions,
  });
  json(res, 202, { act: critique ? "critique" : "involve-participant", accepted: true, messageId: founderMessageId, threadRef, teammateRef, workRef });
  return true;
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
  const threadRef = trimOrNull(body?.threadRef);
  const workTurn = body?.mode === "work";
  const contextTurn = body?.mode === "context";
  const runtime = workTurn ? trimOrNull(body?.runtime) : null;
  const model = workTurn ? trimOrNull(body?.model) : null;
  const workRef = trimOrNull(body?.workRef);
  const workflowSketch = body?.workflowSketch === true;
  const artifactSectionTitle = trimOrNull(body?.artifactSection?.title);
  const artifactSectionIndex = Number.isInteger(body?.artifactSection?.index) && body.artifactSection.index >= 0
    ? body.artifactSection.index
    : null;
  const artifactSection = artifactSectionTitle && artifactSectionIndex != null
    ? { title: artifactSectionTitle.slice(0, 240), index: artifactSectionIndex }
    : null;
  const subjectRefs = Array.isArray(body?.subjectRefs)
    ? [...new Set(body.subjectRefs.map(trimOrNull).filter(Boolean))]
    : [];
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

  if (threadRef) {
    if (subjectRefs.length) throw Object.assign(new Error("subjectRefs are only accepted when forming a new contextual thread."), { status: 400 });
    const threadId = threadRef.replace(/^thread:/, "");
    const ownsThread = getSemanticModel(ventureId).threads.some((thread) => thread.id === threadId && thread.id !== "venture-root");
    if (!ownsThread) throw Object.assign(new Error(`No such direction thread: ${threadId}`), { status: 404 });
  }
  if (artifactSection && (!threadRef || !workRef)) {
    throw Object.assign(new Error("An artifact section correction needs its exact Thread and durable work reference."), { status: 400 });
  }

  // The founder's own message is recorded first — it is the authority every dispatch below rests on.
  const founderMessage = appendConversationMessage({ ventureId, role: "founder", content: message, betId, ...(threadRef ? { target: { threadRef } } : {}) }, deps.appendOptions);
  if (threadRef) extendDirectionThread(ventureId, threadRef, { messageRefs: [`conversation:${founderMessage.id}`], actor: { authority: "founder", id: "founder" } }, deps.appendOptions);

  // Observation is founder-invoked work, too. Keep reply capture on the conversation surface instead
  // of reviving an ambient scheduler or hiding it behind a GTM dashboard. The poll is read-only until
  // real provider evidence is found; recordOutcome owns the exact evidence join and dedupe.
  if (/\b(check|look for|scan|refresh)\b[\s\S]*\b(replies|responses|returned evidence|market evidence)\b/i.test(message)) {
    const result = await (deps.checkObservations ?? checkAuthorizedObservations)(ventureId, deps.appendOptions ?? {}, deps);
    const returned = (result.ingested ?? []).filter((entry) => !entry.deduped).length;
    const note = returned > 0
      ? `${returned} new ${returned === 1 ? "market return was" : "market returns were"} joined to the work that caused it.`
      : result.reason ?? `I checked ${result.polled ?? 0} released ${result.polled === 1 ? "conversation" : "conversations"}. No new evidence returned.`;
    appendThreadReply({ ventureId, threadRef, betId, content: note, options: deps.appendOptions });
    json(res, 200, { act: "observe", betId, threadRef, messageId: founderMessage.id, note, evidence: result });
    return;
  }

  const stopMatch = message.match(/^\s*stop\s+(.+?)[.!]?\s*$/i);
  if (stopMatch) {
    const requested = stopMatch[1].trim().toLocaleLowerCase();
    const aliases = participantAliases(configuration);
    const requestedRef = String(aliases.get(requested) ?? requested).toLocaleLowerCase();
    const model = getSemanticModel(ventureId);
    const threadRuns = model.runs.filter((run) => !threadRef || run.threadRef === threadRef);
    const threadRunIds = new Set(threadRuns.map((run) => run.id));
    const threadBetIds = new Set(threadRuns.flatMap((run) => run.betRefs ?? []).map((ref) => String(ref).replace(/^bet:/, "")));
    const matches = listActiveDrives(ventureId).filter((drive) => (
      !threadRef || threadRunIds.has(drive.id) || (drive.betId && threadBetIds.has(drive.betId))
    ) && String(drive.teammateRef).toLocaleLowerCase() === requestedRef);
    if (matches.length !== 1) {
      const note = matches.length ? `I found more than one active ${stopMatch[1]} run. Which one should I stop?` : `I could not find an active ${stopMatch[1]} run in this thread.`;
      appendThreadReply({ ventureId, threadRef, betId, content: note, options: deps.appendOptions });
      json(res, 200, { act: "stop-run", betId, messageId: founderMessage.id, note, needsFounderJudgment: true });
      return;
    }
    const stopped = abortActiveDrive({ ventureId, driveId: matches[0].id });
    appendThreadReply({ ventureId, threadRef, teammateRef: stopped.teammateRef, betId: stopped.betId, content: `Stop requested for ${participantName(configuration, stopped.teammateRef)}. The rest of this thread is still active.`, options: deps.appendOptions });
    json(res, 200, { act: "stop-run", betId: stopped.betId, messageId: founderMessage.id, stoppedRunRef: `run:${stopped.id}` });
    return;
  }

  if (await dispatchParticipantCommand({ ventureId, configuration, message, betId, threadRef, founderMessageId: founderMessage.id, res, deps })) return;

  const { act, steerText } = await classifyDialogueAct({ message, effortSummary: summary }, deps.dialogueDeps ?? {});

  // A section selected in the artifact is already an exact work correction. Preserve the founder's
  // words in the transcript, but do not make a general dialogue classifier rediscover that scope.
  if (artifactSection) {
    return dispatchNewDirection(ventureId, configuration, message, res, deps, founderMessage.id, threadRef, subjectRefs, runtime, model, "new-direction", { betId, workRef, workflowSketch, artifactSection });
  }

  if (act === "steer") {
    if (workTurn) return dispatchNewDirection(ventureId, configuration, message, res, deps, founderMessage.id, threadRef, subjectRefs, runtime, model, "new-direction", { betId, workRef, workflowSketch, artifactSection });
    if (!betId) {
      // A steer with no effort to steer is just a new direction — route it.
      return dispatchNewDirection(ventureId, configuration, message, res, deps, founderMessage.id, threadRef, subjectRefs);
    }
    enqueueSteer({ ventureId, betId, text: steerText ?? message, fromMessageId: founderMessage.id });
    json(res, 200, { act: "steer", betId, applied: "next-step", messageId: founderMessage.id });
    return;
  }

  if (act === "answer") {
    return dispatchNewDirection(ventureId, configuration, message, res, deps, founderMessage.id, threadRef, subjectRefs, runtime, model, contextTurn ? "answer" : "new-direction", { betId, workRef, workflowSketch, artifactSection });
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
    if (threadRef) setDirectionThreadLifecycle(ventureId, threadRef, "closed", { actor: { authority: "founder", id: "founder" } }, deps.appendOptions);
    appendThreadReply({ ventureId, threadRef, teammateRef: bet.teammateRef ?? null, betId, content: "Closing this thread — we've learned enough.", options: deps.appendOptions });
    json(res, 200, { act: threadRef ? "close-thread" : "close", betId, threadRef, ended: true, messageId: founderMessage.id });
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
    return dispatchNewDirection(ventureId, configuration, message, res, deps, founderMessage.id, threadRef, subjectRefs, runtime, model, "new-direction", { betId, workRef, workflowSketch, artifactSection });
  }

  json(res, 200, { act, betId, messageId: founderMessage.id });
}

async function dispatchNewDirection(ventureId, configuration, direction, res, deps, fromMessageId, threadRef = null, subjectRefs = [], runtime = null, model = null, responseAct = "new-direction", material = {}) {
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
  const exactThreadRef = threadRef ?? ensureDirectionThread(ventureId, {
    name: direction,
    originMessageRef: fromMessageId,
    identityKey: fromMessageId,
    subjectRefs,
    actor: { authority: "founder", id: "founder" },
  }, deps.appendOptions).threadRef;
  // The claim is visible in the thread with a one-line why, BEFORE work begins (§4A.1).
  appendThreadReply({ ventureId, threadRef: exactThreadRef, betId: null, teammateRef, content: why, options: deps.appendOptions });
  const drive = deps.driveTeammate ?? driveTeammate;
  launchDrive({
    drive,
    input: {
      ventureId, teammateRef, goal: direction, initiatedBy: "founder",
      ...(material.workRef && material.betId ? { betId: material.betId } : {}),
      // The founder direction was already recorded above, so the work loop must not write it again — but its
      // id still becomes the run's originMessageRef so founder intent → run stays an exact join.
      recordInitiation: false,
      originMessageRef: fromMessageId ?? null,
      target: {
        threadRef: exactThreadRef,
        ...(subjectRefs.length ? { subjectRefs } : {}),
        ...(material.betId ? { betId: material.betId } : {}),
        ...(material.workRef ? { workRef: material.workRef } : {}),
        ...(material.workflowSketch ? { workflowSketch: true } : {}),
        ...(material.artifactSection ? { artifactSection: material.artifactSection } : {}),
      },
      ...(runtime ? { runtime } : {}),
      ...(model ? { model } : {}),
      options: deps.appendOptions ?? {}, deps: deps.workLoopDeps ?? {},
    },
    ventureId, threadRef: exactThreadRef, betId: null, teammateRef, options: deps.appendOptions,
  });
  json(res, 202, {
    act: responseAct,
    accepted: true,
    teammateRef,
    why,
    threadRef: exactThreadRef,
    fromMessageId,
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
