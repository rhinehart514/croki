const ACT_IMPERATIVE = [
  'add',
  'build',
  'change',
  'wire',
  'draft',
  'rename',
  'remove',
  'create',
  'make',
  'swap',
  'rebuild',
  'delete',
  'connect',
  'set up',
  'edit',
  'write',
  'compose',
  'tweak',
  'adjust',
  'replace',
  'insert',
  'hook up',
  'promote',
  'prepare',
  'stage',
  'turn this into',
  'turn that into',
];

const RELEASE_GRANT = [
  'run it',
  'run it to my gate',
  'run it to the gate',
  'run to my gate',
  'run to the gate',
  'run the pipeline',
  'run this',
  'run this to the gate',
  'go',
  'go ahead',
  'go for it',
  "let's go",
  'lets go',
  'ship it',
  'ship it to the gate',
  'kick it off',
  'send it to the gate',
  'send it',
  'launch it',
];

const STATUS_VOCAB = [
  'status',
  'where is',
  'where are',
  "where's",
  "what's waiting",
  'whats waiting',
  'what is waiting',
  "what's pending",
  'whats pending',
  "what's left",
  'whats left',
  'what needs me',
  'what needs my',
  'catch me up',
  'caught up',
  'show me what',
  'pending',
  'waiting',
  'anything waiting',
  "what's next",
  'whats next',
  "what's up",
  'where do things stand',
  'where does everything stand',
  'everything stand',
  'things stand',
  'how are things',
  "how's everything",
  'hows everything',
  'brief me',
  'update me',
  'rundown',
  'what do i need to',
];

const EXPLAIN_VOCAB = [
  'why',
  'what happened',
  'what did we learn',
  'what did i learn',
  'explain',
  'how come',
  'walk me through',
  'what changed',
  'reason',
  'rationale',
  'how did',
  'what went wrong',
  'help me understand',
];

const FILLER_PREFIX = [
  'ok',
  'okay',
  'yes',
  'yep',
  'yeah',
  'sure',
  'please',
  'now',
  'alright',
  'cool',
];

const INTENTS = new Set(['status', 'explain', 'act', 'run']);
const ACT_PATTERNS = ACT_IMPERATIVE.map((phrase) => [
  phrase,
  phrasePattern(phrase),
]);
const STATUS_PATTERNS = STATUS_VOCAB.map((phrase) => phrasePattern(phrase));
const EXPLAIN_PATTERNS = EXPLAIN_VOCAB.map((phrase) => phrasePattern(phrase));
const QUESTION_OPENER_PATTERN =
  /^(?:who|what|when|where|why|which|how|whose|whom|is|are|do|does|did|can|could|should|would|will)\b/;

export function classifyComposerIntent(text, ctx = {}) {
  const normalized = normalizeMessage(text);

  if (!normalized) {
    return result('act', 0);
  }

  if (isActImperative(normalized)) {
    return result('act', 0.88);
  }

  if (isReleaseGrant(normalized)) {
    return applyContextDowngrade(result('run', 0.94), ctx);
  }

  if (matchesAny(normalized, STATUS_PATTERNS)) {
    return applyContextDowngrade(
      result('status', isQuestionShaped(normalized) ? 0.84 : 0.76),
      ctx,
    );
  }

  if (matchesAny(normalized, EXPLAIN_PATTERNS)) {
    return result('explain', isQuestionShaped(normalized) ? 0.84 : 0.78);
  }

  return result('act', 0.3);
}

function normalizeMessage(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function isQuestionShaped(normalized) {
  return normalized.endsWith('?') || QUESTION_OPENER_PATTERN.test(normalized);
}

function isActImperative(normalized) {
  // Explanation-shaped questions can mention an action as their subject without asking the crew to do it.
  // Keep those conversational unless the founder gives a separate concrete command.
  if (/^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:help me understand|explain|walk me through)\b/.test(normalized)) {
    return false;
  }
  if (/^make it better[.!?]*$/.test(normalized)) return false;

  // "Help me get/find/win..." is a concrete objective even though "help me understand..." is not.
  if (/\bhelp me (?:get|find|reach|win|land)\s+\S/.test(normalized)) return true;

  return ACT_PATTERNS.some(([phrase, pattern]) => {
    if (!pattern.test(normalized)) {
      return false;
    }

    if (phrase === 'draft' && /\bdraft\s+get\b/.test(normalized)) {
      return false;
    }

    return true;
  });
}

function isReleaseGrant(normalized) {
  const command = stripRunPunctuation(stripLeadingFillers(normalized));
  return RELEASE_GRANT.includes(command);
}

function stripLeadingFillers(message) {
  let remaining = stripRunPunctuation(message);
  let moved = true;

  while (moved) {
    moved = false;

    for (const filler of FILLER_PREFIX) {
      const pattern = new RegExp(`^${escapeRegex(filler)}(?:[.!?,;:]+)?\\s+`);
      if (pattern.test(remaining)) {
        remaining = stripRunPunctuation(remaining.replace(pattern, ''));
        moved = true;
        break;
      }
    }
  }

  return remaining;
}

function stripRunPunctuation(message) {
  return message.trim().replace(/^[.!?,;:]+/, '').replace(/[.!?,;:]+$/, '').trim();
}

function matchesAny(normalized, patterns) {
  return patterns.some((pattern) => pattern.test(normalized));
}

function phrasePattern(phrase) {
  return new RegExp(`\\b${escapeRegex(phrase)}\\b`);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyContextDowngrade(classification, ctx) {
  if (
    ctx &&
    typeof ctx === 'object' &&
    ctx.hasPipelines === false &&
    (classification.intent === 'run' || classification.intent === 'status')
  ) {
    return result('act', 0.3);
  }

  return classification;
}

function result(intent, confidence) {
  const safeIntent = INTENTS.has(intent) ? intent : 'act';
  return {
    intent: safeIntent,
    grant: safeIntent === 'run',
    confidence: clampConfidence(confidence),
  };
}

function clampConfidence(confidence) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return 0;
  }

  if (confidence < 0) {
    return 0;
  }

  if (confidence > 1) {
    return 1;
  }

  return confidence;
}
