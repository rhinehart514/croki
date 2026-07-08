import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyComposerIntent } from '../src/composer-router.mjs';

const runCommands = [
  'run it',
  'run it to my gate',
  'run to the gate',
  'run the pipeline',
  'go',
  'go ahead',
  'go for it',
  "let's go",
  'ship it',
  'ship it to the gate',
  'kick it off',
  'send it to the gate',
];

const statusMessages = [
  'where is everything?',
  "what's waiting at my gate",
  'status',
  "what's pending",
  'what needs me right now',
  'catch me up',
  "show me what's left",
  'where are we on Buffalo',
];

const explainMessages = [
  'why did the RodentRadar draft get rejected',
  'what happened on the last run',
  'what did we learn',
  'explain the gate decision',
  'how come nothing moved on Buffalo',
  'walk me through what changed',
];

const actMessages = [
  'add a follow-up step to the pipeline',
  'build me a cold email pipeline',
  'change the gate to trusted',
  'wire the research agent into Buffalo',
  'draft a LinkedIn sequence',
  'rename this pipeline',
  'remove the enrich step',
];

test('run commands classify to run with grant', () => {
  for (const message of runCommands) {
    const result = classifyComposerIntent(message);

    assert.equal(result.intent, 'run', message);
    assert.equal(result.grant, true, message);
  }
});

test('run precision keeps near misses out of run', () => {
  const cases = [
    ["go check what's waiting", 'status'],
    ['where is this run going', 'status'],
    ['build a pipeline that ships weekly', 'act'],
  ];

  for (const [message, intent] of cases) {
    const result = classifyComposerIntent(message);

    assert.equal(result.intent, intent, message);
    assert.equal(result.grant, false, message);
  }
});

test('status messages classify to status without grant', () => {
  for (const message of statusMessages) {
    const result = classifyComposerIntent(message);

    assert.equal(result.intent, 'status', message);
    assert.equal(result.grant, false, message);
  }
});

test('explain messages classify to explain without grant', () => {
  for (const message of explainMessages) {
    const result = classifyComposerIntent(message);

    assert.equal(result.intent, 'explain', message);
    assert.equal(result.grant, false, message);
  }
});

test('act messages classify to act without grant', () => {
  for (const message of actMessages) {
    const result = classifyComposerIntent(message);

    assert.equal(result.intent, 'act', message);
    assert.equal(result.grant, false, message);
  }
});

test('polite imperatives with trailing question marks classify to act', () => {
  const messages = [
    'can you add a step?',
    'could you rebuild the outreach flow?',
    'would you swap the gate connector?',
  ];

  for (const message of messages) {
    const result = classifyComposerIntent(message);

    assert.equal(result.intent, 'act', message);
    assert.equal(result.grant, false, message);
  }
});

test('ambiguous defaults classify to act without grant', () => {
  const messages = ['make it better', 'the thing', 'hmm', 'not sure yet'];

  for (const message of messages) {
    const result = classifyComposerIntent(message);

    assert.equal(result.intent, 'act', message);
    assert.equal(result.grant, false, message);
  }
});

test('empty and non-string inputs classify to act with zero confidence', () => {
  const messages = ['', '   ', null, undefined, 123, {}];

  for (const message of messages) {
    assert.doesNotThrow(() => classifyComposerIntent(message));

    const result = classifyComposerIntent(message);
    assert.equal(result.intent, 'act');
    assert.equal(result.grant, false);
    assert.equal(result.confidence, 0);
  }
});

test('act precedence beats explain and status when an imperative is present', () => {
  const messages = [
    "why isn't this working - just rebuild it",
    "what's waiting, and add a step while you're at it",
  ];

  for (const message of messages) {
    const result = classifyComposerIntent(message);

    assert.equal(result.intent, 'act', message);
    assert.equal(result.grant, false, message);
  }
});

test('classification is deterministic, synchronous, and defensive', () => {
  const first = classifyComposerIntent('where is everything?');
  const second = classifyComposerIntent('where is everything?');

  assert.deepEqual(first, second);
  assert.notEqual(typeof first.then, 'function');

  assert.doesNotThrow(() => classifyComposerIntent('x'.repeat(50000)));
  assert.doesNotThrow(() => classifyComposerIntent('?!.,;'));
  assert.doesNotThrow(() => classifyComposerIntent('unicode says hello 👋🏽'));
});

test('wall invariants hold across the corpus', () => {
  const corpus = [
    ...runCommands,
    "go check what's waiting",
    'where is this run going',
    'build a pipeline that ships weekly',
    ...statusMessages,
    ...explainMessages,
    ...actMessages,
    'can you add a step?',
    'could you rebuild the outreach flow?',
    'would you swap the gate connector?',
    'make it better',
    'the thing',
    'hmm',
    'not sure yet',
    '',
    '   ',
    null,
    undefined,
    123,
    {},
    "why isn't this working - just rebuild it",
    "what's waiting, and add a step while you're at it",
    'x'.repeat(50000),
    '?!.,;',
    'unicode says hello 👋🏽',
  ];
  const intents = new Set(['status', 'explain', 'act', 'run']);

  for (const message of corpus) {
    const result = classifyComposerIntent(message);

    assert.equal(intents.has(result.intent), true, String(message));
    assert.equal(typeof result.grant, 'boolean', String(message));
    assert.equal(result.confidence >= 0 && result.confidence <= 1, true, String(message));

    if (result.grant === true) {
      assert.equal(result.intent, 'run', String(message));
    }
  }
});

test('ctx can only downgrade run and status when there are no pipelines', () => {
  const downgradedRun = classifyComposerIntent('run it', { hasPipelines: false });
  assert.equal(downgradedRun.intent, 'act');
  assert.equal(downgradedRun.grant, false);

  const plainRun = classifyComposerIntent('run it');
  assert.equal(plainRun.intent, 'run');
  assert.equal(plainRun.grant, true);

  const downgradedStatus = classifyComposerIntent('where is everything?', {
    hasPipelines: false,
  });
  assert.equal(downgradedStatus.intent, 'act');
  assert.equal(downgradedStatus.grant, false);
}
);
