import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { handleComposerTurn } from '../src/composer-turn.mjs';
import { createOperatorSession, getOperatorSession } from '../src/operator-store.mjs';

const MISSING_SESSION_FALLBACK =
  "I don't have a record for that conversation yet, so there's nothing to explain.";

describe('composer turn fast lane', () => {
  let parent = null;

  afterEach(() => {
    if (parent) fs.rmSync(parent, { recursive: true, force: true });
    parent = null;
  });

  it('status routes fast — the crew writes the answer FROM the briefing as context (Wave 5)', async () => {
    let resumeCalls = 0;
    const qCalls = [];
    const runtime = {
      classify: () => ({ intent: 'status', confidence: 0.9 }),
      buildBriefing: () => ({ summary: 'S' }),
      // The status answer is now MODEL-written from the briefing, not the raw summary string.
      runClaudeQuery: (arg) => { qCalls.push(arg); return { text: 'Two drafts are waiting at your gate.', error: null }; },
      resume: () => {
        resumeCalls += 1;
        return {};
      },
      options: {},
    };

    const result = await handleComposerTurn(
      { projectId: 'p', sessionId: 's', text: 'status' },
      runtime,
    );

    assert.equal(result.handled, 'fast');
    assert.equal(result.intent, 'status');
    assert.equal(result.answer, 'Two drafts are waiting at your gate.');
    assert.equal(result.briefing.summary, 'S', 'the raw briefing still rides back for the UI');
    assert.match(qCalls[0].prompt, /S/, 'the briefing summary is handed to the model as context');
    assert.equal(resumeCalls, 0);
  });

  it('status model miss falls back to the raw briefing summary', async () => {
    const runtime = {
      classify: () => ({ intent: 'status', confidence: 0.9 }),
      buildBriefing: () => ({ summary: 'S' }),
      runClaudeQuery: () => ({ text: '', error: 'boom' }),
      options: {},
    };
    const result = await handleComposerTurn({ projectId: 'p', sessionId: 's', text: 'status' }, runtime);
    assert.equal(result.answer, 'S', 'a model miss still gives the founder the real facts');
  });

  it('explain routes fast with phrasing', async () => {
    const qCalls = [];
    let resumeCalls = 0;
    const runtime = {
      classify: () => ({ intent: 'explain', confidence: 0.9 }),
      runClaudeQuery: (arg) => {
        qCalls.push(arg);
        return { text: 'phrased', error: null };
      },
      resume: () => {
        resumeCalls += 1;
        return {};
      },
      options: {},
    };

    const result = await handleComposerTurn(
      { projectId: 'p', sessionId: 's', text: 'why did that happen?' },
      runtime,
    );

    assert.equal(result.handled, 'fast');
    assert.equal(result.answer, 'phrased');
    assert.equal(qCalls.length, 1);
    assert.equal(typeof qCalls[0].prompt, 'string');
    assert.match(qCalls[0].prompt, /why did that happen\?/);
    assert.equal(resumeCalls, 0);
  });

  it('explain runs a multi-turn model call WITH read tools (Wave 5 — no longer 1-turn tool-less)', async () => {
    const qCalls = [];
    const runtime = {
      classify: () => ({ intent: 'explain', confidence: 0.9 }),
      runClaudeQuery: (arg) => { qCalls.push(arg); return { text: 'because the gate paused it', error: null }; },
      options: {},
    };
    await handleComposerTurn({ projectId: 'p', sessionId: 's', text: 'why did it stop?' }, runtime);
    assert.equal(qCalls.length, 1);
    assert.ok(qCalls[0].maxTurns > 1, 'multi-turn, not the old single gagged turn');
    // No forced allowedTools:[] — the crew keeps its default read toolset so it can look things up.
    assert.equal('allowedTools' in qCalls[0], false, 'explain no longer forces an empty toolset');
  });

  it('explain phrasing failure falls back deterministically', async () => {
    const runtime = {
      classify: () => ({ intent: 'explain', confidence: 0.9 }),
      runClaudeQuery: () => ({ text: '', error: 'Reached maximum number of turns (1)' }),
      options: {},
    };

    const result = await handleComposerTurn(
      { projectId: 'p', sessionId: 'missing-session', text: 'explain this' },
      runtime,
    );

    assert.equal(result.handled, 'fast');
    assert.equal(result.answer, MISSING_SESSION_FALLBACK);
    assert.ok(result.answer.length > 0);
    assert.doesNotMatch(result.answer, /maximum number of turns/i);
  });

  it('explain when query throws', async () => {
    const runtime = {
      classify: () => ({ intent: 'explain', confidence: 0.9 }),
      runClaudeQuery: () => {
        throw new Error('raw model failure');
      },
      options: {},
    };

    const result = await handleComposerTurn(
      { projectId: 'p', sessionId: 'missing-session', text: 'what happened?' },
      runtime,
    );

    assert.equal(result.handled, 'fast');
    assert.equal(result.answer, MISSING_SESSION_FALLBACK);
    assert.doesNotMatch(result.answer, /raw model failure/i);
  });

  it('act delegates unchanged', async () => {
    const calls = [];
    const sentinel = { sentinel: true };
    const hints = { teammates: ['x'] };
    const options = {};
    const resume = (...args) => {
      calls.push(args);
      return sentinel;
    };

    const result = await handleComposerTurn(
      { projectId: 'p', sessionId: 's', text: 'add a step', hints },
      { classify: () => ({ intent: 'act' }), resume, options },
    );

    assert.equal(result.handled, 'drive');
    assert.equal(result.session, sentinel);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 's');
    assert.equal(calls[0][1], 'add a step');
    assert.equal(calls[0][2].hints, hints);
    assert.equal(calls[0][2].options, options);
  });

  it('run delegates identically', async () => {
    const calls = [];
    const hints = { teammates: ['x'] };
    const options = {};
    const resume = (...args) => {
      calls.push(args);
      return { sentinel: true };
    };

    const result = await handleComposerTurn(
      { projectId: 'p', sessionId: 's', text: 'go', hints },
      { classify: () => ({ intent: 'run', grant: true }), resume, options },
    );

    assert.equal(result.handled, 'drive');
    assert.equal(result.grant, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 's');
    assert.equal(calls[0][1], 'go');
    assert.deepEqual(Object.keys(calls[0][2]).sort(), ['hints', 'options', 'requiredMutation']);
    assert.equal(calls[0][2].hints, hints);
    assert.equal(calls[0][2].options, options);
    assert.equal(calls[0][2].requiredMutation, 'run');
  });

  it('a LOW-confidence act (the catch-all) is a real chat turn, not a silent build (Wave 5)', async () => {
    // This is the core inversion: the classifier's 0.3 "act" fallthrough used to drive the autonomous
    // builder on ambiguous chat. Now it routes to a real conversational model turn instead.
    let resumeCalls = 0;
    const qCalls = [];
    const result = await handleComposerTurn(
      { projectId: 'p', sessionId: 's', text: 'maybe something' },
      {
        classify: () => ({ intent: 'act', confidence: 0.3 }),
        resume: () => { resumeCalls += 1; return { sentinel: true }; },
        runClaudeQuery: (arg) => { qCalls.push(arg); return { text: 'Tell me more about what you want to try.', error: null }; },
        buildBriefing: () => ({ summary: 'nothing waiting' }),
        productModel: () => null,
        options: {},
      },
    );

    assert.equal(result.handled, 'fast');
    assert.equal(result.intent, 'converse');
    assert.equal(result.answer, 'Tell me more about what you want to try.');
    assert.equal(resumeCalls, 0, 'ambiguous chat never silently drives the builder');
    assert.ok(qCalls[0].maxTurns > 1, 'a real multi-turn chat turn');
  });

  it('a CONFIDENT act still drives the builder', async () => {
    const calls = [];
    const result = await handleComposerTurn(
      { projectId: 'p', sessionId: 's', text: 'add a weekly digest step' },
      { classify: () => ({ intent: 'act', confidence: 0.88 }), resume: (...a) => { calls.push(a); return { sentinel: true }; }, options: {} },
    );
    assert.equal(result.handled, 'drive');
    assert.equal(result.intent, 'act');
    assert.equal(calls.length, 1);
  });

  it('the general conversational turn grounds in briefing + product model + history', async () => {
    const qCalls = [];
    const result = await handleComposerTurn(
      { projectId: 'p', sessionId: 's', text: 'what do you think the strongest angle is?' },
      {
        classify: () => ({ intent: 'act', confidence: 0.3 }),
        runClaudeQuery: (arg) => { qCalls.push(arg); return { text: 'The attribution-gap angle bites hardest.', error: null }; },
        buildBriefing: () => ({ summary: '2 drafts waiting' }),
        productModel: () => ({ name: 'RodentRadar', description: 'monitored pest feed', icp: { description: 'food facilities' } }),
        getOperatorSession: () => ({ events: [{ title: 'Drafted 2 items' }] }),
        options: {},
      },
    );
    assert.equal(result.intent, 'converse');
    const p = qCalls[0].prompt;
    assert.match(p, /2 drafts waiting/, 'the briefing grounds the turn');
    assert.match(p, /RodentRadar/, 'the product model grounds the turn');
  });

  it('resume throw propagates', async () => {
    const resume = () => {
      throw new Error('Resolve the founder gate before resuming');
    };

    await assert.rejects(
      () => handleComposerTurn(
        { projectId: 'p', sessionId: 's', text: 'add a step' },
        { classify: () => ({ intent: 'act' }), resume, options: {} },
      ),
      /Resolve the founder gate before resuming/,
    );
  });

  it('no-write gate-wall proof', async () => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gtm-composer-turn-'));
    const options = { root: parent };
    const projectId = 'p';
    const session = createOperatorSession({ goal: 'Check the pipeline', projectId }, options);
    const before = getOperatorSession(session.id, options);
    const snapshot = {
      updatedAt: before.updatedAt,
      status: before.status,
      pendingGate: before.pendingGate,
      modelMessages: before.modelMessages,
    };

    await handleComposerTurn(
      { projectId, sessionId: session.id, text: 'status' },
      {
        classify: () => ({ intent: 'status', confidence: 0.9 }),
        // A query double keeps the status turn from spawning a real subprocess; a read-only turn
        // never mutates the session either way — the point of this proof.
        runClaudeQuery: () => ({ text: 'nothing waiting', error: null }),
        options,
      },
    );

    const after = getOperatorSession(session.id, options);
    assert.equal(after.updatedAt, snapshot.updatedAt);
    assert.equal(after.status, snapshot.status);
    assert.equal(after.pendingGate, snapshot.pendingGate);
    assert.deepEqual(after.modelMessages, snapshot.modelMessages);
  });

  it('the status fast turn stays a single tool-less turn (a bare summary rephrase, not a lookup)', async () => {
    const qCalls = [];
    const runtime = {
      classify: () => ({ intent: 'status', confidence: 0.9 }),
      buildBriefing: () => ({ summary: 'S' }),
      runClaudeQuery: (arg) => { qCalls.push(arg); return { text: 'phrased', error: null }; },
      options: {},
    };
    await handleComposerTurn({ projectId: 'p', sessionId: 's', text: 'status' }, runtime);
    assert.equal(qCalls.length, 1);
    assert.deepEqual(qCalls[0].allowedTools, [], 'status rephrase needs no tools — the briefing is the context');
    assert.equal(qCalls[0].maxTurns, 1);
  });
});
