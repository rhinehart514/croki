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

  it('status routes fast', async () => {
    let resumeCalls = 0;
    const runtime = {
      classify: () => ({ intent: 'status' }),
      buildBriefing: () => ({ summary: 'S' }),
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
    assert.equal(result.answer, 'S');
    assert.equal(result.briefing.summary, 'S');
    assert.equal(resumeCalls, 0);
  });

  it('explain routes fast with phrasing', async () => {
    const qCalls = [];
    let resumeCalls = 0;
    const runtime = {
      classify: () => ({ intent: 'explain' }),
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

  it('explain phrasing failure falls back deterministically', async () => {
    const runtime = {
      classify: () => ({ intent: 'explain' }),
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
      classify: () => ({ intent: 'explain' }),
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
    assert.deepEqual(Object.keys(calls[0][2]).sort(), ['hints', 'options']);
    assert.equal(calls[0][2].hints, hints);
    assert.equal(calls[0][2].options, options);
  });

  it('ambiguous defaults to drive', async () => {
    const calls = [];
    const resume = (...args) => {
      calls.push(args);
      return { sentinel: true };
    };

    const result = await handleComposerTurn(
      { projectId: 'p', sessionId: 's', text: 'maybe something' },
      { classify: () => ({ intent: 'act', confidence: 0.3 }), resume, options: {} },
    );

    assert.equal(result.handled, 'drive');
    assert.equal(result.intent, 'act');
    assert.equal(calls.length, 1);
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
      { classify: () => ({ intent: 'status' }), options },
    );

    const after = getOperatorSession(session.id, options);
    assert.equal(after.updatedAt, snapshot.updatedAt);
    assert.equal(after.status, snapshot.status);
    assert.equal(after.pendingGate, snapshot.pendingGate);
    assert.deepEqual(after.modelMessages, snapshot.modelMessages);
  });

  it('phrasing call carries no operator tools', async () => {
    const qCalls = [];
    const runtime = {
      classify: () => ({ intent: 'explain' }),
      runClaudeQuery: (arg) => {
        qCalls.push(arg);
        return { text: 'phrased', error: null };
      },
      options: {},
    };

    await handleComposerTurn(
      { projectId: 'p', sessionId: 's', text: 'explain the pause' },
      runtime,
    );

    assert.equal(qCalls.length, 1);
    assert.deepEqual(qCalls[0].allowedTools, []);
    assert.equal('mcpServers' in qCalls[0], false);
    assert.equal(qCalls[0].maxTurns, 1);
  });
});
