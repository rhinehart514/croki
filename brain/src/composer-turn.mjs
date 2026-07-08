import { runClaudeQuery } from './agent-bridge.mjs';
import { buildComposerBriefing } from './composer-briefing.mjs';
import { classifyComposerIntent } from './composer-router.mjs';
import { resumeOperatorSession } from './operator-runtime.mjs';
import { getOperatorSession } from './operator-store.mjs';
import { getProductModel } from './product-model-store.mjs';

// The composer is chat-first, not a keyword switchboard. The classifier is DEMOTED to a fast shortcut
// that only fires on an UNAMBIGUOUS mechanical lookup — a confident, clearly-shaped status/explain ask,
// or a plain release grant / act imperative. Everything else — the low-confidence catch-all, a keyword
// buried in a longer conversational sentence — routes to a real multi-turn model turn grounded in the
// full cross-pipeline briefing, the product model, and the session history. This is where the founder
// actually talks to the crew; a keyword-only reply is the leash Wave 5 removes.

// A fast status/explain answer is trustworthy only when the classifier is confident the message is that
// mechanical shape. A LOW confidence (the 0.3 catch-all, or a keyword brushed mid-sentence) falls
// through to a real model turn. An UNDEFINED confidence is trusted (a caller/test that hands us a bare
// intent is asserting it deliberately) — only a numeric value BELOW the bar is demoted.
const FAST_STATUS_MIN = 0.75;
const FAST_EXPLAIN_MIN = 0.75;
const ACT_DRIVE_MIN = 0.6;

function belowBar(confidence, bar) {
  return typeof confidence === 'number' && Number.isFinite(confidence) && confidence < bar;
}

export async function handleComposerTurn({ projectId, sessionId, text, hints }, runtime = {}) {
  const {
    classify = classifyComposerIntent,
    buildBriefing = buildComposerBriefing,
    resume = resumeOperatorSession,
    runClaudeQuery: query = runClaudeQuery,
    productModel = getProductModel,
    options = {},
  } = runtime;

  const classification = classify(text, { hasPipelines: true });
  const intent = classification.intent;
  const confidence = classification.confidence;

  // Run stays on the autonomous drive — the founder asked the crew to ship to the gate.
  if (intent === 'run') {
    const session = resume(sessionId, text, { hints, options });
    return { handled: 'drive', intent: 'run', grant: Boolean(classification.grant), session };
  }

  // A confident act imperative drives; a LOW-confidence "act" (the classifier's catch-all) is really
  // ambiguous chat, so it falls through to a real conversational turn rather than silently building.
  if (intent === 'act' && !belowBar(confidence, ACT_DRIVE_MIN)) {
    const session = resume(sessionId, text, { hints, options });
    return { handled: 'drive', intent: 'act', grant: false, session };
  }

  // A plain, confident status ask: the crew writes the answer FROM the briefing as context, in its own
  // voice — not the raw deterministic summary string. The briefing still rides back for the UI.
  if (intent === 'status' && !belowBar(confidence, FAST_STATUS_MIN)) {
    const briefing = buildBriefing({ projectId }, options);
    const answer = await writeFromContext({
      text,
      contextLabel: 'the current state of every pipeline',
      context: briefing.summary,
      query,
    });
    return { handled: 'fast', intent: 'status', answer, briefing };
  }

  // A plain "why / what happened" ask: a real multi-turn model turn WITH read tools, grounded in the
  // durable record — no longer a single gagged, tool-less turn that mostly returned the fallback.
  if (intent === 'explain' && !belowBar(confidence, FAST_EXPLAIN_MIN)) {
    const answer = await buildExplainAnswer({ projectId, sessionId, text }, { query, options });
    return { handled: 'fast', intent: 'explain', answer };
  }

  // Everything else — the low-confidence catch-all and anything conversational — is a real chat turn:
  // the crew answers grounded in the full briefing, the product model, and the session history, with
  // read tools available. This is the default now, not the keyword exception.
  const answer = await buildConverseAnswer(
    { projectId, sessionId, text },
    { query, buildBriefing, productModel, options },
  );
  return { handled: 'fast', intent: 'converse', answer };
}

// Have the crew write the answer in plain language, grounded in a block of real context. Used by the
// status fast path so the reply is voiced, not a raw summary. Falls back to the raw context on any
// model miss so the founder always gets the real facts.
async function writeFromContext({ text, contextLabel, context, query }) {
  const fallback = context;
  try {
    const prompt = `A founder asked their go-to-market crew: "${text}"\n\n` +
      `Here is ${contextLabel} from the durable record:\n${context}\n\n` +
      `Answer in plain language, in 1-3 short sentences, in the crew's own voice. Do not invent facts beyond the record.`;
    const res = await query({ prompt, maxTurns: 1, allowedTools: [] });
    const out = res && typeof res.text === 'string' ? res.text.trim() : '';
    if (!out || (res && res.error)) return fallback;
    return out;
  } catch {
    return fallback;
  }
}

// The general conversational turn: a real multi-turn model call grounded in the full cross-pipeline
// briefing, the product model, and the recent session history — with read tools available so the crew
// can look things up. This replaces routing every non-keyword message into a rigid intent.
async function buildConverseAnswer({ projectId, sessionId, text }, { query, buildBriefing, productModel, options }) {
  const briefing = safe(() => buildBriefing({ projectId }, options));
  const model = safe(() => productModel(projectId || 'default', options));
  const history = recentHistory(sessionId, options);
  const fallback = (briefing && briefing.summary)
    || "I'm here — tell me what you want to do and I'll get the crew on it.";
  try {
    const parts = [
      `You are the founder's go-to-market crew, talking with them in the composer. Answer their message`,
      `directly and in plain language, in the crew's own voice. You have read tools if you need to look`,
      `something up. Never claim to have sent, published, or approved anything — the founder releases at`,
      `the gate. Do not invent product facts, customers, or metrics.`,
      `\nFounder's message:\n${text}`,
      briefing ? `\nWhere every pipeline stands right now:\n${briefing.summary}` : '',
      model ? `\nThe product you serve (its model):\n${compactModel(model)}` : '',
      history ? `\nRecent moments in this conversation:\n${history}` : '',
    ].filter(Boolean);
    const res = await query({ prompt: parts.join('\n'), maxTurns: 6 });
    const out = res && typeof res.text === 'string' ? res.text.trim() : '';
    if (!out || (res && res.error)) return fallback;
    return out;
  } catch {
    return fallback;
  }
}

async function buildExplainAnswer({ projectId, sessionId, text }, { query, options }) {
  const facts = assembleExplainFacts({ projectId, sessionId }, options);
  const fallback = facts.summary;
  try {
    const prompt = `A founder asked their go-to-market crew: "${text}"\n\n` +
      `Here is what the durable record shows:\n${facts.summary}\n\n` +
      `Answer the founder in plain language, in 1-3 short sentences, in the crew's own voice. You have` +
      ` read tools if you need to check the record. Do not invent facts beyond it.`;
    // Multi-turn WITH read tools (was a single tool-less turn) — the crew can actually look things up.
    const res = await query({ prompt, maxTurns: 4 });
    const out = res && typeof res.text === 'string' ? res.text.trim() : '';
    if (!out || (res && res.error)) return fallback;
    return out;
  } catch {
    return fallback;
  }
}

function assembleExplainFacts({ projectId, sessionId }, options = {}) {
  let session = null;
  try {
    session = getOperatorSession(sessionId, options);
  } catch {
    session = null;
  }
  const lastRunId = session && session.lastRunId ? session.lastRunId : null;
  const events = session && Array.isArray(session.events) ? session.events : [];
  const recentEvents = events.slice(-5);
  const summary = composeExplainSummary(session, recentEvents);
  return { session, lastRunId, recentEvents, summary };
}

// A short plain-text digest of the recent conversation, so the general chat turn has continuity.
function recentHistory(sessionId, options) {
  const session = safe(() => getOperatorSession(sessionId, options));
  if (!session || !Array.isArray(session.events)) return '';
  const lines = session.events.slice(-6)
    .map((e) => (e && e.title ? `- ${e.title}${e.detail ? `: ${e.detail}` : ''}` : ''))
    .filter(Boolean);
  return lines.join('\n');
}

// A lean plain-words view of the product model for grounding — never the whole record.
function compactModel(model) {
  const bits = [];
  if (model.name) bits.push(`Product: ${model.name}`);
  const desc = model.description || model.summary || model.oneLiner;
  if (desc) bits.push(String(desc));
  const icp = model.icp?.description || model.icp?.buyer || model.buyer;
  if (icp) bits.push(`Ideal customer: ${icp}`);
  return bits.length ? bits.join(' — ') : JSON.stringify(model).slice(0, 400);
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function composeExplainSummary(session, recentEvents) {
  if (!session) {
    return "I don't have a record for that conversation yet, so there's nothing to explain.";
  }
  const label = session.goal || session.standingBrief || 'This pipeline';
  const parts = [];
  if (session.summary) parts.push(String(session.summary));
  else parts.push(`${label} is currently ${humanStatus(session.status)}.`);
  const last = recentEvents[recentEvents.length - 1];
  if (last && last.title) {
    parts.push(`The last thing that happened: ${last.title}${last.detail ? ` — ${last.detail}` : ''}.`);
  }
  return parts.join(' ');
}

function humanStatus(status) {
  const map = {
    ready: 'ready to keep going',
    running: 'working',
    completed: 'finished',
    cancelled: 'cancelled',
    failed: 'stopped after an error',
    waiting_for_gate: 'waiting at your gate',
    waiting_for_input: 'waiting for your answer',
    waiting_for_proposal: 'waiting for you to review graph changes',
    waiting_for_ideas: 'waiting for you to pick ideas',
    waiting_for_candidates: 'waiting for you to pick a pipeline',
  };
  return map[status] || (status ? String(status) : 'idle');
}
