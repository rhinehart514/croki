// Reply alert + decide-together — the PUSH half of rail 5 (EXPERIMENT-MACHINE-SPEC: "On a real reply,
// the machine alerts the founder and they decide together").
//
// Today a real reply lands unrouted in the pending inbox as a PULL affordance only — it sits there until
// the founder happens to look. This module adds the PUSH half: the moment a real reply arrives, it
// surfaces an ALERT that opens a DECIDE-TOGETHER moment — the reply, the context it joins to (which
// experiment / lead / run / pipeline it belongs to), and the machine's SUGGESTED next move — where the
// FOUNDER decides WITH the machine. The founder's choice is theirs; the machine only alerts and suggests.
//
// HARD GUARANTEE: this NEVER auto-replies, never sends, never routes, never runs. It is a READ-ONLY
// projection over the durable inputs log — exactly like pending-inbox.mjs — plus a plain suggestion
// string. It writes NOTHING. The founder's decide-together action happens on its own existing surface
// (route the reply into a pipeline, reply by hand, set aside); this module produces the alert that brings
// them there, never the send. An alert is the ONE push the spec wants (rail 5) — a decide-together
// moment on a real reply, not nagging.
//
// This is NOT a new schema/enum/role taxonomy (anti-cage): the "kinds" below are a low, open read of the
// input's own kind string to tell a real reply apart from a commit or a star, not a closed ontology the
// engine branches on for correctness. A kind that did not exist yesterday still reads as a reply if it
// carries reply-shaped words; anything ambiguous is simply not alerted (left as a quiet pull-inbox item).

import { listUnroutedInputs } from "./inputs-store.mjs";
import { loadProject, getProjectChannels } from "./project-store.mjs";

// The reply-shaped words. A real REPLY is a two-way, human response to something the machine put out — a
// reply, a response, a message back, a meeting/booking, an objection. This is an OPEN read of the input's
// kind (and a light peek at the payload), NOT a closed enum: it decides "is this the kind of signal that
// deserves a founder alert", and the ambiguous ones fall through to the quiet pull inbox rather than
// firing a push the founder didn't want.
const REPLY_WORDS = ["reply", "response", "responded", "replied", "message", "meeting", "booked", "objection", "answered"];

// Is this captured input a real reply worth alerting on? Reads the input's OWN kind/source/payload — a
// commit, a star, a signup, a fork are events but not two-way replies, so they do not push an alert
// (they stay in the pull inbox / feed the trigger-proposal path). Deterministic; no model call.
export function isReply(input) {
  if (!input || typeof input !== "object") return false;
  const kind = String(input.kind ?? "").toLowerCase();
  if (REPLY_WORDS.some((word) => kind.includes(word))) return true;
  // Some connectors label the event generically (kind "inbound"/"email") but the payload names it a
  // reply (e.g. an inReplyTo header, a direction field). A light, explicit peek — never a fuzzy guess.
  const payload = input.payload ?? {};
  if (payload.inReplyTo || payload.replyTo || payload.threadId) return true;
  const direction = String(payload.direction ?? "").toLowerCase();
  if (direction === "inbound" || direction === "reply") return true;
  return false;
}

// Resolve the CONTEXT a reply joins to — which experiment / lead / pipeline / run it belongs to — from
// records already present, never invented. The reply's payload may carry the joinKey minted on the item
// it responds to (outcome-ingest.mjs), or a threadId / messageId; we surface whatever is present so the
// decide-together panel can show "this reply is on <pipeline>, to <lead>". A reply that joins to nothing
// is still alerted — the context is honestly blank, never fabricated.
function resolveContext(input, { projectId, options }) {
  const payload = input.payload ?? {};
  const joinKey = String(payload.joinKey ?? payload.join_key ?? "").trim() || null;
  const from = String(payload.from ?? payload.sender ?? payload.email ?? payload.lead ?? "").trim() || null;
  const threadId = String(payload.threadId ?? payload.thread_id ?? "").trim() || null;
  const runId = String(payload.runId ?? payload.run_id ?? "").trim() || null;
  const statedPipelineId = String(
    payload.pipelineId ?? payload.pipeline_id ?? payload.graphId ?? payload.graph_id ?? payload.channelId ?? "",
  ).trim() || null;

  // Best-effort pipeline name from the input's own source/kind against the project's channels — the same
  // tolerant read pending-inbox uses. Missing → null, never a guessed name.
  let pipelineName = null;
  let pipelineId = null;
  try {
    const project = loadProject({ ...options, projectId });
    const channels = getProjectChannels(project, options);
    const tokens = new Set([
      statedPipelineId,
      String(input.source ?? "").toLowerCase(),
      String(input.kind ?? "").toLowerCase(),
    ].filter(Boolean));
    const match = channels.find((c) => tokens.has(String(c.graphId ?? ""))
      || tokens.has(String(c.id ?? ""))
      || tokens.has(String(c.kind ?? "").toLowerCase()));
    if (match) { pipelineName = match.name ?? null; pipelineId = match.id ?? null; }
  } catch {
    /* honest blank on any read failure */
  }

  // If the sender supplied an explicit pipeline/path but the project catalog has not registered a matching
  // channel, preserve the id and keep the name blank. That is honest context and still lets the canvas try
  // to focus the right work instead of discarding the join.
  return { joinKey, from, threadId, runId, pipelineId: pipelineId ?? statedPipelineId, pipelineName };
}

// The machine's SUGGESTED next move — a plain-language suggestion the founder decides WITH, never an
// action taken. It is a suggestion string, not a command: the founder reads it and chooses. Grounded in
// what the reply actually is (a warm lead re-entering the loop, an objection to weigh) — never a promise
// the machine will act.
function suggestNextMove(input, context) {
  const kind = String(input.kind ?? "").toLowerCase();
  const who = context.from ? ` from ${context.from}` : "";
  if (kind.includes("objection")) {
    return `An objection came back${who}. Decide together: address it, or note it as signal against this bet.`;
  }
  if (kind.includes("meeting") || kind.includes("booked")) {
    return `A meeting reply came back${who} — a warm lead. Decide together: how to follow through before it goes cold.`;
  }
  return `A real reply came back${who} — a warm lead. Decide together: reply, route it into the pipeline, or set it aside. Nothing is sent until you say so.`;
}

// One decide-together alert for a reply — the reply, its joined context, and the suggested move. It is a
// projection over the input record; it holds no action and can take none.
function replyAlert(input, { projectId, projectName, options }) {
  const context = resolveContext(input, { projectId, options });
  const payload = input.payload ?? {};
  const body = String(payload.body ?? payload.text ?? payload.message ?? payload.snippet ?? "").trim() || null;
  return {
    id: `reply-alert:${projectId}:${input.id}`,
    inputId: input.id,
    projectId,
    projectName: projectName ?? null,
    kind: input.kind ?? "reply",
    source: input.source ?? null,
    receivedAt: input.receivedAt ?? null,
    // The reply itself — what came back, and who from (read from payload, never invented).
    reply: { from: context.from, body, threadId: context.threadId },
    // The context it joins to — which pipeline/lead/run. Honestly blank when it joins to nothing.
    context,
    // The machine's suggestion the founder decides WITH. A string, never an action.
    suggestedMove: suggestNextMove(input, context),
  };
}

// Every real reply currently waiting in a project's inbox, as decide-together alerts. Pure read over the
// unrouted inputs log — the SAME durable state pending-inbox reads. Never routes, replies, or runs. A
// non-reply signal (commit/star/signup) is not included; it stays a quiet pull-inbox item.
export function projectReplyAlerts({ projectId = "default", projectName = null } = {}, options = {}) {
  let unrouted = [];
  try {
    unrouted = listUnroutedInputs(projectId, { ...options, projectId });
  } catch {
    return [];
  }
  return unrouted
    .filter(isReply)
    .map((input) => replyAlert(input, { projectId, projectName, options }))
    // Most-recent reply first — a just-arrived reply pushes to the top of the alert.
    .sort((a, b) => String(b.receivedAt ?? "").localeCompare(String(a.receivedAt ?? "")));
}

// The full decide-together payload for ONE reply alert, by input id — what the panel reads to render the
// reply + context + suggested move + the founder's choice. Read-only; returns null if the input is gone
// or is not a reply (nothing to decide together on).
export function getReplyAlert({ projectId = "default", inputId } = {}, options = {}) {
  const unrouted = listUnroutedInputs(projectId, { ...options, projectId });
  const input = unrouted.find((i) => i.id === inputId);
  if (!input || !isReply(input)) return null;
  let projectName = null;
  try { projectName = loadProject({ ...options, projectId })?.name ?? null; } catch { /* honest blank */ }
  return replyAlert(input, { projectId, projectName, options });
}
