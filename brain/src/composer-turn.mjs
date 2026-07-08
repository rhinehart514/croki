import { runClaudeQuery } from './agent-bridge.mjs';
import { buildComposerBriefing } from './composer-briefing.mjs';
import { classifyComposerIntent } from './composer-router.mjs';
import { resumeOperatorSession } from './operator-runtime.mjs';
import { getOperatorSession } from './operator-store.mjs';

export async function handleComposerTurn({ projectId, sessionId, text, hints }, runtime = {}) {
  const {
    classify = classifyComposerIntent,
    buildBriefing = buildComposerBriefing,
    resume = resumeOperatorSession,
    runClaudeQuery: query = runClaudeQuery,
    options = {},
  } = runtime;

  const classification = classify(text);
  const intent = classification.intent;

  if (intent === 'status') {
    const briefing = buildBriefing({ projectId }, options);
    return { handled: 'fast', intent: 'status', answer: briefing.summary, briefing };
  }

  if (intent === 'explain') {
    const answer = await buildExplainAnswer({ projectId, sessionId, text }, { query, options });
    return { handled: 'fast', intent: 'explain', answer };
  }

  const session = resume(sessionId, text, { hints, options });
  return {
    handled: 'drive',
    intent: intent === 'run' ? 'run' : 'act',
    grant: Boolean(classification.grant),
    session,
  };
}

async function buildExplainAnswer({ projectId, sessionId, text }, { query, options }) {
  const facts = assembleExplainFacts({ projectId, sessionId }, options);
  const fallback = facts.summary;
  try {
    const prompt = `A founder asked their go-to-market operator: "${text}"\n\n` +
      `Here is what the durable record shows:\n${facts.summary}\n\n` +
      `Answer the founder in plain language, in 1-3 short sentences. Do not invent facts beyond the record.`;
    const res = await query({ prompt, maxTurns: 1, allowedTools: [] });
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
