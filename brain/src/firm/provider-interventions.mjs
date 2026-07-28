// Provider-native questions and permission prompts become durable founder decisions. The park on the
// wall is the source of truth and is written for EVERY prompt — a crash, a restart, or a killed process
// recovers exactly as it always did. What changed is the callback: a streaming run holds its own prompt
// queue open (claude-stream.mjs createPromptQueue), so the provider's permission callback may legitimately
// stay pending. When the drive that raised the prompt is still live, the callback waits and the founder's
// answer resolves it IN PLACE — same turn, same session, warm context, no resume. With no live run, an
// ended run, or an absent founder, the original contract stands byte-for-byte: deny, end the turn, and
// resume the Thread/session after the answer. Permission grants are exact and one-shot.

import crypto from "node:crypto";
import { getVentureDoc } from "./venture-store.mjs";
import { findLiveRun } from "./work-loop-stream.mjs";
import { recordInterventionOpened } from "./work-journal-runtime.mjs";

// The founder's exact allow answer on a permission item (permissionEffect's first option). One string,
// used by both halves of the seam so an in-place allow and a resumed grant can never drift apart.
const ALLOW_ONCE = "Allow once";

// The message that ends the turn when nothing can hold the callback open. Unchanged wording: a run that
// falls back to this path behaves exactly as it did before the live-run seam existed.
const PARKED_MESSAGE = "Croki parked this request for the founder. End this turn and wait; the decision will arrive when this same session resumes.";

// How long a live run may hold its permission callback open waiting for the founder. Ten minutes is the
// same ceiling work-loop-drive-lease.mjs already spends waiting for a participant lease, so a pending
// prompt can never outlive the wait another drive is willing to spend on the same participant. It is long
// enough for a founder who stepped away from the desk and short enough that an absent founder never
// strands a run: on expiry the callback falls back to today's deny-and-resume, and the durable park is
// still queued for whenever the founder does answer.
const LIVE_INTERVENTION_WAIT_MS = 10 * 60 * 1000;

// An answer delivered in place must not ALSO be driven as a fresh continuation (routes.mjs
// resumeAnsweredIntervention). The marker is minted by the settle path and consumed once by
// driveTeammate; the window only has to cover one decide() → resume call, so it expires quickly rather
// than lingering to swallow a genuinely new founder direction with identical text.
const IN_PLACE_CONTINUATION_TTL_MS = 30_000;

// decisionRef -> the open callback's settle entry. The in-memory half of a durably parked intervention:
// it only remembers how to hand an answer back to a callback that is still open. A restart drops it,
// which is precisely the pre-streaming behavior — the park is still queued and the session still resumes.
const pendingLiveInterventions = new Map();
const inPlaceContinuations = new Map(); // continuation key -> expiry ms

export function __resetProviderInterventions() {
  pendingLiveInterventions.clear();
  inPlaceContinuations.clear();
}

function trim(value, max = 4_000) {
  return String(value ?? "").trim().slice(0, max);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function providerPermissionKey(toolName, input = {}) {
  return crypto.createHash("sha256")
    .update(JSON.stringify([trim(toolName, 200), canonical(input)]))
    .digest("hex");
}

export function normalizeProviderQuestions(input = {}) {
  const questions = Array.isArray(input?.questions) ? input.questions : [];
  return questions.slice(0, 4).flatMap((candidate, index) => {
    const question = trim(candidate?.question);
    if (!question) return [];
    const options = Array.isArray(candidate?.options)
      ? candidate.options.slice(0, 4).flatMap((option) => {
          const label = trim(option?.label, 120);
          return label ? [{
            label,
            description: trim(option?.description, 1_000) || null,
            preview: trim(option?.preview, 8_000) || null,
          }] : [];
        })
      : [];
    return [{
      id: `question-${index + 1}`,
      header: trim(candidate?.header, 120) || `Question ${index + 1}`,
      question,
      options,
      multiSelect: candidate?.multiSelect === true,
    }];
  });
}

function questionEffect(input, continuation, provider) {
  const questions = normalizeProviderQuestions(input);
  const question = questions.length
    ? questions.map((entry) => `${entry.header}: ${entry.question}`).join("\n\n")
    : "Claude needs your direction before it can continue.";
  return {
    kind: "provider-question",
    provider,
    question,
    questions,
    ...(questions.length === 1 && !questions[0].multiSelect
      ? { options: questions[0].options.map((option) => option.label) }
      : {}),
    continuation,
  };
}

function permissionSummary(toolName, input, prompt = {}) {
  return trim(input?.command, 2_000)
    || trim(input?.file_path ?? input?.path ?? prompt?.blockedPath, 1_000)
    || trim(input?.url, 1_000)
    || trim(prompt?.description, 2_000)
    || `Use ${trim(toolName, 200)}`;
}

function permissionEffect(toolName, input, prompt, continuation, provider) {
  return {
    kind: "provider-permission",
    provider,
    toolName: trim(toolName, 200),
    permissionKey: providerPermissionKey(toolName, input),
    title: trim(prompt?.title, 1_000) || `${provider} wants to use ${trim(prompt?.displayName ?? toolName, 200)}`,
    displayName: trim(prompt?.displayName ?? toolName, 200),
    description: trim(prompt?.description, 2_000) || null,
    decisionReason: trim(prompt?.decisionReason, 2_000) || null,
    exactAction: permissionSummary(toolName, input, prompt),
    options: [ALLOW_ONCE, "Deny"],
    continuation,
  };
}

// The founder's decision as the provider's own callback result. An allowed permission runs the exact
// input the founder saw. Everything else denies with the founder's exact words: the loop keeps its
// context and learns the answer instead of dying. A question is never fabricated into an allow — Croki
// does not synthesize a selection on the founder's behalf — so its answer rides the same denial channel.
function founderReply({ isQuestion, input, decision, note }) {
  if (decision !== "answer") {
    return { behavior: "deny", message: "The founder dismissed this request. Continue without it and do not ask again." };
  }
  if (isQuestion) {
    return { behavior: "deny", message: `The founder answered: ${note}\n\nContinue this turn with that answer; do not ask again.` };
  }
  if (note === ALLOW_ONCE) return { behavior: "allow", updatedInput: input };
  return { behavior: "deny", message: `The founder declined this exact request (${note}). Continue without it and do not retry the same request.` };
}

function continuationKey({ ventureId, teammateRef, betId, threadRef, workScopeRef, goal }) {
  return JSON.stringify([
    trim(ventureId, 200), trim(teammateRef, 200), trim(betId, 200),
    trim(threadRef, 200), trim(workScopeRef, 200), trim(goal),
  ]);
}

function markInPlaceContinuation(item, note) {
  const continuation = item?.effect?.continuation ?? {};
  const key = continuationKey({
    ventureId: item?.ventureId,
    teammateRef: continuation.teammateRef,
    betId: item?.betId,
    threadRef: continuation.target?.threadRef,
    workScopeRef: continuation.target?.workScopeRef,
    goal: note,
  });
  inPlaceContinuations.set(key, Date.now() + IN_PLACE_CONTINUATION_TTL_MS);
  return key;
}

// consumeInPlaceContinuation — driveTeammate's one-shot check. True means this exact founder answer was
// already delivered into a live turn, so driving it again would fork a second run over the same Thread.
export function consumeInPlaceContinuation({ ventureId, teammateRef, betId = null, target = null, goal }) {
  const key = continuationKey({
    ventureId, teammateRef, betId,
    threadRef: target?.threadRef, workScopeRef: target?.workScopeRef, goal,
  });
  const expiresAt = inPlaceContinuations.get(key);
  if (expiresAt == null) return false;
  inPlaceContinuations.delete(key);
  return expiresAt > Date.now();
}

// waitForFounderInPlace — hold the provider's permission callback open on the promise the SDK awaits, so
// the founder's answer lands inside the same warm turn. The durable park was already written by the
// caller; this only decides whether the callback waits for it or ends the turn the old way.
function waitForFounderInPlace({ decisionRef, itemId, ventureId, isQuestion, input, clearPause, signal, waitMs, options }) {
  return new Promise((resolve) => {
    const finish = (reply) => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onEnded);
      resolve(reply);
    };
    // The founder's exclusive right to end active work outranks a pending prompt, and so does the wait
    // ceiling. Both leave the park queued exactly as a crash would, and both return the unchanged
    // deny-and-resume message — the answer, whenever it comes, resumes this same session.
    const onEnded = () => {
      if (!pendingLiveInterventions.delete(decisionRef)) return;
      finish({ behavior: "deny", message: PARKED_MESSAGE });
    };
    // Deliberately not unref'd: while a founder decision is genuinely outstanding the process has work to
    // do, and every settle path (answer, end-work, expiry) clears it, so it can never outlive the prompt.
    const timer = setTimeout(onEnded, waitMs);
    signal?.addEventListener?.("abort", onEnded, { once: true });
    pendingLiveInterventions.set(decisionRef, {
      // claim() runs synchronously inside wall.decide(), before it writes the receipt. Removing the entry
      // here is the one-shot claim: a second answer finds nothing to claim and takes the durable path.
      // Delivery waits one microtask — long enough for decide() to finish writing the work record and the
      // decided item — and then VERIFIES that durable write. If the decision never landed (a throw between
      // the claim and saveItem), nothing is delivered, the marker is dropped, and the entry re-arms for the
      // founder's next answer. The open callback can therefore never hold an answer the durable park does not.
      claim: (decision, note, marker) => {
        const entry = pendingLiveInterventions.get(decisionRef);
        if (!entry) return false;
        pendingLiveInterventions.delete(decisionRef);
        queueMicrotask(() => {
          const stored = getVentureDoc(ventureId, "decisions", itemId, options);
          if (stored?.decision == null) {
            if (marker) inPlaceContinuations.delete(marker);
            pendingLiveInterventions.set(decisionRef, entry);
            return;
          }
          clearPause();
          finish(founderReply({ isQuestion, input, decision, note }));
        });
        return true;
      },
    });
  });
}

// The live run must be THIS drive's own: another Thread's run cannot answer a prompt it never raised.
function liveRunHoldsQueue(ventureId, betId, liveRun) {
  if (!liveRun?.driveId) return false;
  return findLiveRun({ ventureId, betId, threadRef: liveRun.threadRef })?.driveId === liveRun.driveId;
}

export function createProviderInterventionHandler({
  ventureId, betId = null, configurationRevision = null, architectureRevision = null,
  architectureTarget = null, continuation, provider = "Claude Code", getWork, putWork,
  park, appendEvent = null, liveRun = null, waitMs = LIVE_INTERVENTION_WAIT_MS, options = {},
}) {
  return async ({ toolName, input = {}, prompt = {} }) => {
    const isQuestion = toolName === "AskUserQuestion";
    const key = isQuestion
      ? providerPermissionKey(toolName, normalizeProviderQuestions(input))
      : providerPermissionKey(toolName, input);
    const work = getWork();
    if (!isQuestion && work?.nativePermissionGrant?.permissionKey === key) {
      putWork({ ...work, nativePermissionGrant: null, pendingProviderIntervention: null });
      return { behavior: "allow", updatedInput: input };
    }
    if (work?.pendingProviderIntervention?.key === key) {
      return { behavior: "deny", message: "Croki is already waiting for the founder to resolve this exact request." };
    }
    const effect = isQuestion
      ? questionEffect(input, continuation, provider)
      : permissionEffect(toolName, input, prompt, continuation, provider);
    const queueItem = await park({
      ventureId, betId, purpose: "answer", configurationRevision, architectureRevision,
      architectureTarget, effect,
    }, options);
    const pausedFor = isQuestion
      ? `Waiting for the founder to answer: ${effect.question}`
      : `Waiting for the founder to decide whether to ${effect.exactAction}.`;
    const decisionRef = `decision:${queueItem.id}`;
    putWork({ ...getWork(), pausedFor, pendingProviderIntervention: { key, decisionRef } });
    recordInterventionOpened(ventureId, queueItem, options);
    appendEvent?.(isQuestion ? effect.question : effect.title);
    // The park above already happened; only now does the callback choose how to wait for it. Without a
    // live run holding this drive's prompt queue there is nothing to keep warm, so the turn ends as before.
    if (!liveRunHoldsQueue(ventureId, betId, liveRun)) return { behavior: "deny", message: PARKED_MESSAGE };
    return waitForFounderInPlace({
      decisionRef,
      itemId: queueItem.id,
      ventureId,
      isQuestion,
      input,
      // The drive owns this work record; clearing its own pause keeps the next checkpoint from
      // resurrecting a wait the founder already resolved. Another intervention's pause is left alone.
      clearPause: () => {
        const current = getWork();
        if (current?.pendingProviderIntervention?.decisionRef !== decisionRef) return;
        putWork({ ...current, pausedFor: null, pendingProviderIntervention: null });
      },
      signal: liveRun.signal ?? null,
      waitMs,
      options,
    });
  };
}

function claimInPlaceIntervention(item, decision, note) {
  const entry = pendingLiveInterventions.get(`decision:${item?.id}`);
  if (!entry) return false;
  return entry.claim(decision, note, decision === "answer" ? markInPlaceContinuation(item, note) : null);
}

export function applyProviderInterventionDecision(work, item, decision, note, decidedAt) {
  const effect = item?.effect ?? {};
  const providerIntervention = effect.kind === "provider-question" || effect.kind === "provider-permission";
  const pausedFor = decision === "answer"
    ? `The founder answered: ${note}`
    : "The founder dismissed the pending question.";
  if (!providerIntervention) return { ...work, pausedFor, pendingProviderIntervention: null };
  // One coherent path: the founder's answer settles the durable park HERE, and the same call claims the
  // open callback if this drive is still live. A settled-in-place answer mints no grant — the grant only
  // exists so a COLD resume can re-allow the exact request, and this answer was already spent inside the
  // live turn. That is what keeps one answer from being applied twice.
  const settledInPlace = claimInPlaceIntervention(item, decision, note);
  const allowOnce = !settledInPlace && effect.kind === "provider-permission" && decision === "answer" && note === ALLOW_ONCE;
  return {
    ...work,
    pausedFor,
    pendingProviderIntervention: null,
    nativePermissionGrant: allowOnce
      ? { permissionKey: effect.permissionKey, decisionRef: `decision:${item.id}`, grantedAt: decidedAt }
      : null,
  };
}

export function buildWorkLoopProviderIntervention({
  ventureId, targetBetId, teammateRef, selection, effectiveModel, effectiveEffort, directSdk,
  target, driveRun, activeDrive, workScopeRef, configuration, architectureContext, options,
  getWork, putWork, park, appendEvent, waitMs = LIVE_INTERVENTION_WAIT_MS,
}) {
  const continuation = {
    teammateRef,
    runId: driveRun?.runId ?? activeDrive?.id ?? null,
    runtime: selection.adapter.id,
    model: effectiveModel,
    effort: effectiveEffort,
    directSdk,
    target: {
      ...(target ?? {}),
      threadRef: driveRun?.threadRef ?? target?.threadRef ?? null,
      ...(workScopeRef ? { workScopeRef } : {}),
    },
  };
  return {
    continuation,
    handler: createProviderInterventionHandler({
      ventureId,
      betId: targetBetId,
      configurationRevision: configuration.revision,
      architectureRevision: architectureContext?.architectureRevision ?? null,
      architectureTarget: target?.architectureId
        ? { id: target.architectureId, stepId: target.architectureStepId ?? null }
        : null,
      continuation,
      provider: selection.adapter.label,
      getWork,
      putWork,
      park,
      appendEvent,
      // The identity work-loop-stream.mjs registers this drive's live run under (buildStreamSeam uses the
      // same threadRef precedence), plus the founder's own end-work signal.
      liveRun: activeDrive
        ? {
            driveId: activeDrive.id,
            threadRef: target?.threadRef ?? driveRun?.threadRef ?? null,
            signal: activeDrive.signal ?? null,
          }
        : null,
      waitMs,
      options,
    }),
  };
}
