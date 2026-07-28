// Durable founder follow-ups for a provider boundary. These are intentionally separate from
// provider answers and tool permissions: DecisionGate resolves the provider's exact request, while
// this ordered queue carries later founder direction to the next safe Work checkpoint.
import { randomUUID } from "node:crypto";
import { getVentureDoc, setVentureDoc, now } from "./venture-store.mjs";
import { appendConversationMessage } from "./conversation.mjs";
import { extendDirectionThread, getSemanticModel } from "./semantic-model-store.mjs";

const MAX_TURNS = 20;
const text = (value) => String(value ?? "").trim();

function read(ventureId, betId, options) {
  const bet = getVentureDoc(ventureId, "bets", betId, options);
  if (!bet) throw Object.assign(new Error(`No such effort: ${betId}`), { status: 404 });
  const work = bet.work && typeof bet.work === "object" ? bet.work : {};
  const turns = Array.isArray(work.queuedFounderTurns) ? work.queuedFounderTurns : [];
  return { bet, work, turns };
}

function write(ventureId, betId, bet, work, turns, options) {
  const stamp = now();
  setVentureDoc(ventureId, "bets", betId, {
    ...bet,
    work: { ...work, queuedFounderTurns: turns.slice(-MAX_TURNS) },
    updatedAt: stamp,
  }, options);
}

export function listQueuedFounderTurns(ventureId, betId, options = {}) {
  return read(ventureId, betId, options).turns
    .filter((turn) => turn?.state === "queued")
    .map((turn) => structuredClone(turn));
}

export function queueFounderTurn({ ventureId, betId, text: value, fromMessageId = null }, options = {}) {
  const content = text(value);
  if (!content) throw Object.assign(new Error("A queued founder turn needs text."), { status: 400 });
  const { bet, work, turns } = read(ventureId, betId, options);
  const stamp = now();
  const turn = {
    id: `founder-turn:${randomUUID()}`,
    text: content,
    fromMessageId: text(fromMessageId) || null,
    state: "queued",
    queuedAt: stamp,
    updatedAt: stamp,
  };
  write(ventureId, betId, bet, work, [...turns, turn], options);
  return structuredClone(turn);
}

export function editQueuedFounderTurn({ ventureId, betId, turnId, text: value }, options = {}) {
  const content = text(value);
  if (!content) throw Object.assign(new Error("A queued founder turn cannot be empty."), { status: 400 });
  const { bet, work, turns } = read(ventureId, betId, options);
  const index = turns.findIndex((turn) => turn?.id === turnId && turn.state === "queued");
  if (index < 0) throw Object.assign(new Error(`No such queued founder turn: ${turnId}`), { status: 404 });
  const next = [...turns];
  next[index] = { ...next[index], text: content, updatedAt: now() };
  write(ventureId, betId, bet, work, next, options);
  return structuredClone(next[index]);
}

export function removeQueuedFounderTurn({ ventureId, betId, turnId, reason = "removed" }, options = {}) {
  const { bet, work, turns } = read(ventureId, betId, options);
  const index = turns.findIndex((turn) => turn?.id === turnId && turn.state === "queued");
  if (index < 0) throw Object.assign(new Error(`No such queued founder turn: ${turnId}`), { status: 404 });
  const next = [...turns];
  next[index] = { ...next[index], state: "tombstoned", tombstoneReason: reason, updatedAt: now() };
  write(ventureId, betId, bet, work, next, options);
  return structuredClone(next[index]);
}

export function tombstoneQueuedFounderTurns({ ventureId, betId, reason }, options = {}) {
  const { bet, work, turns } = read(ventureId, betId, options);
  const stamp = now();
  const next = turns.map((turn) => turn?.state === "queued"
    ? { ...turn, state: "tombstoned", tombstoneReason: reason, updatedAt: stamp }
    : turn);
  write(ventureId, betId, bet, work, next, options);
  return next.filter((turn) => turn?.state === "tombstoned" && turn.updatedAt === stamp).length;
}

export function drainQueuedFounderTurns({ ventureId, betId }, options = {}) {
  const { bet, work, turns } = read(ventureId, betId, options);
  const queued = turns.filter((turn) => turn?.state === "queued");
  if (!queued.length) return null;
  const stamp = now();
  const ids = new Set(queued.map((turn) => turn.id));
  const next = turns.map((turn) => ids.has(turn?.id)
    ? { ...turn, state: "dispatched", dispatchedAt: stamp, updatedAt: stamp }
    : turn);
  write(ventureId, betId, bet, work, next, options);
  return `The founder queued these follow-ups while the provider was waiting. Apply them in order:\n${queued.map((turn) => `- ${turn.text}`).join("\n")}`;
}

export function captureProviderBoundaryFollowUp({
  ventureId, betId, threadRef, mode, message, founderMessageId,
}, options = {}) {
  if (mode !== "work" || !betId) return null;
  if (!getVentureDoc(ventureId, "bets", betId, options)?.work?.pendingProviderIntervention) return null;
  const queuedTurn = queueFounderTurn({ ventureId, betId, text: message, fromMessageId: founderMessageId }, options);
  return { act: "queued-follow-up", applied: "next-step", accepted: true, betId, threadRef, messageId: founderMessageId, queuedTurn };
}

export function recordInterventionTranscript(ventureId, item, decision, note, options = {}) {
  const threadRef = item?.effect?.continuation?.target?.threadRef ?? null;
  const threadId = String(threadRef ?? "").replace(/^thread:/, "");
  if (!threadRef || !getSemanticModel(ventureId, options).threads.some((thread) => thread.id === threadId && !thread.deletedAt)) return null;
  const permission = item.effect?.kind === "provider-permission";
  const normalized = String(note ?? "").trim();
  const content = permission
    ? normalized === "Allow once" ? "Allowed this tool once." : normalized === "Deny" || decision === "dismiss" ? "Denied this tool request." : `Answered the tool request: ${normalized}`
    : decision === "dismiss" ? "Dismissed the provider question." : normalized;
  if (!content) return null;
  const message = appendConversationMessage({ ventureId, role: "founder", betId: item.betId ?? null, content, target: { threadRef } }, options);
  extendDirectionThread(ventureId, threadRef, { messageRefs: [`conversation:${message.id}`], actor: { authority: "founder", id: "founder" } }, options);
  return message;
}
