import path from "node:path";

import { createBet } from "../../brain/src/firm/bet.mjs";
import { summon } from "../../brain/src/firm/crew.mjs";
import { createVenture, getVentureDoc, setVentureDoc } from "../../brain/src/firm/venture-store.mjs";

const FIXTURE_EPOCH = Date.parse("2026-07-14T08:00:00.000Z");
const LONG_COPY = [
  "Trace the buyer's exact language back to the repository evidence before changing the promise.",
  "Keep the counterexample, the staged difference, and the next reversible move readable together",
  "so a founder returning after a night away can understand the consequence without a walkthrough.",
].join(" ");

function at(offsetMinutes) {
  return new Date(FIXTURE_EPOCH + offsetMinutes * 60_000).toISOString();
}

function fixtureRepository(repository) {
  return path.resolve(repository ?? path.join(import.meta.dirname, "../../samples/acme-saas"));
}

function seedBet({ ventureId, id, intent, teammateRef, forkedFrom = null, events = [], staged = [], evidence = [], minute = 0 }, options) {
  const createdAt = at(minute);
  const bet = createBet({
    id,
    ventureId,
    intent,
    teammateRef,
    forkedFrom,
    joinKey: `join-${id}`,
    configurationRevision: 1,
    createdAt,
    updatedAt: createdAt,
    staged,
    evidence,
  });
  const durable = {
    ...bet,
    events: events.map((event, index) => ({ ...event, at: at(minute + index + 1) })),
  };
  setVentureDoc(ventureId, "bets", id, durable, options);
  return durable;
}

function seedWallItem({ ventureId, id, betId = null, workRef = null, purpose, effect, minute, blocksBet = null }, options) {
  const item = {
    id,
    ventureId,
    betId,
    workRef: workRef ?? id,
    configurationRevision: 1,
    purpose,
    blocksBet: blocksBet ?? purpose !== "review-outcome",
    effect,
    parkedAt: at(minute),
    decision: null,
    decidedAt: null,
    decidedBy: null,
    note: null,
    releasedAt: null,
    deployAuthorizedAt: null,
    deployAuthorizedBy: null,
  };
  setVentureDoc(ventureId, "decisions", id, item, options);
  return item;
}

function seedOutcome({ ventureId, id, betId = null, workRef = null, joinKey, outcomeKind, body, from, minute }, options) {
  const outcome = {
    type: "outcome",
    id,
    ventureId,
    betId,
    workRef,
    configurationRevision: 1,
    joinKey,
    outcomeKind,
    from,
    body,
    source: "fixture-connected-account",
    channel: "email",
    messageId: `message-${id}`,
    providerEventId: `provider-${id}`,
    providerSourceId: "fixture-inbox",
    observedAt: at(minute),
    attribution: betId ? "joined" : "unattributed",
    joined: Boolean(betId),
    structural: { channel: "email", outcomeKind, joined: Boolean(betId) },
    identifying: { betId, betIntent: null, from, body },
  };
  setVentureDoc(ventureId, "outcomes", id, outcome, options);
  if (betId) {
    const bet = getVentureDoc(ventureId, "bets", betId, options);
    setVentureDoc(ventureId, "bets", betId, {
      ...bet,
      evidence: [...(bet?.evidence ?? []), { type: "outcome", id }],
      updatedAt: at(minute),
    }, options);
  }
  return outcome;
}

function seedConversation(ventureId, entries, options) {
  return entries.map((entry, index) => {
    const message = {
      id: `${ventureId}-conversation-${String(index + 1).padStart(3, "0")}`,
      ventureId,
      role: entry.role,
      kind: "message",
      content: entry.content,
      teammateRef: entry.teammateRef ?? null,
      betId: entry.betId ?? null,
      changes: null,
      configurationProposal: null,
      configurationReceipt: null,
      runtime: entry.role === "teammate" ? {
        id: "fixture-runtime",
        label: "Fixture runtime",
        auth: "deterministic",
        model: "fixture-model",
        configurationRevision: 1,
      } : null,
      coordination: null,
      createdAt: at(entry.minute),
    };
    setVentureDoc(ventureId, "conversation", message.id, message, options);
    return message;
  });
}

/** A small unattended-return fixture. It is test-only and never imported by the product shell. */
export function createOvernightVentureFixture({ root, repository } = {}) {
  // Hand-built deterministic fixture crew: opt out of the founding-crew seed so crew counts stay exact.
  const options = { root, seedFoundingCrew: false };
  const venture = createVenture({
    id: "fixture-overnight-venture",
    name: "Overnight venture",
    repository: fixtureRepository(repository),
    createdAt: at(0),
    updatedAt: at(0),
  }, options);

  for (const [index, ref] of ["scout", "maker", "skeptic", "closer"].entries()) {
    summon(venture.id, ref, { name: ["Iris", "Moss", "Vale", "Nia"][index] }, options);
  }

  const bets = [
    seedBet({
      ventureId: venture.id,
      id: "overnight-bet-evidence",
      intent: "Ground the strongest buyer promise in repository truth",
      teammateRef: "scout",
      minute: 4,
      staged: [{ id: "artifact-brief", title: "Evidence brief", content: "README.md and pricing.ts point to a faster handoff, not a broader automation claim.", stagedAt: at(7) }],
      events: [
        { type: "started", detail: "Reading the bound repository" },
        { type: "tool_started", detail: "read_truth" },
        { type: "staged", detail: "Evidence brief" },
      ],
    }, options),
    seedBet({
      ventureId: venture.id,
      id: "overnight-bet-message",
      intent: "Test the repository-backed promise with operations leads",
      teammateRef: "maker",
      forkedFrom: "overnight-bet-evidence",
      minute: 12,
      evidence: [{
        type: "repository-citation",
        id: "src/handoff.ts",
        path: "src/handoff.ts",
        claim: "The weekly handoff is the narrow repository-backed promise.",
        excerpt: "export function prepareWeeklyHandoff()",
      }],
      staged: [{ id: "artifact-message", title: "Outbound note", body: "Your current handoff looks manual. Would the repository-backed shortcut be useful?", stagedAt: at(15) }],
      events: [
        { type: "started", detail: "Drafting from cited product truth" },
        { type: "tool_started", detail: "get_taste" },
        { type: "staged", detail: "Outbound note" },
      ],
    }, options),
    seedBet({
      ventureId: venture.id,
      id: "overnight-bet-counterexample",
      intent: "Find the buyer who should reject the first promise",
      teammateRef: "skeptic",
      forkedFrom: "overnight-bet-evidence",
      minute: 20,
      staged: [{ id: "artifact-counterexample", title: "Counterexample", content: "Teams without a recurring handoff do not feel this problem strongly enough.", stagedAt: at(22) }],
      events: [
        { type: "started", detail: "Looking for disconfirming evidence" },
        { type: "speak", detail: "The strongest counterexample is a team without a recurring handoff." },
        { type: "staged", detail: "Counterexample" },
      ],
    }, options),
    seedBet({
      ventureId: venture.id,
      id: "overnight-bet-partial",
      intent: "Prepare a narrower follow-up from the first reply",
      teammateRef: "closer",
      forkedFrom: "overnight-bet-message",
      minute: 28,
      staged: [{ id: "artifact-partial", title: "Partial follow-up", body: "The first two sentences are durable; recipient-specific proof is still missing.", stagedAt: at(30) }],
      events: [
        { type: "started", detail: "Preparing the follow-up" },
        { type: "staged", detail: "Partial follow-up saved before provider loss" },
        { type: "tool_failed", detail: "connected account unavailable after the partial artifact was staged" },
      ],
    }, options),
  ];

  const joined = seedOutcome({
    ventureId: venture.id,
    id: "overnight-outcome-joined",
    betId: "overnight-bet-message",
    joinKey: "join-overnight-bet-message",
    outcomeKind: "reply",
    body: "This is timely. Can you show how it handles the weekly handoff?",
    from: "buyer@example.com",
    minute: 45,
  }, options);
  const unattributed = seedOutcome({
    ventureId: venture.id,
    id: "overnight-outcome-unattributed",
    joinKey: "unknown-fixture-join",
    outcomeKind: "signal",
    body: "Someone forwarded the note internally, but the source cannot be joined to a bet yet.",
    from: "unknown",
    minute: 47,
  }, options);

  const wall = [
    seedWallItem({
      ventureId: venture.id,
      id: "overnight-wall-release-message",
      betId: "overnight-bet-message",
      purpose: "release",
      minute: 35,
      effect: { kind: "message", to: "buyer@example.com", body: "A repository-grounded invitation", joinKey: "join-overnight-bet-message" },
    }, options),
    seedWallItem({
      ventureId: venture.id,
      id: "overnight-wall-release-page",
      betId: "overnight-bet-counterexample",
      purpose: "release",
      minute: 36,
      effect: { kind: "page", destination: "private-preview", diff: "Narrow the promise to the recurring handoff." },
    }, options),
    seedWallItem({
      ventureId: venture.id,
      id: "overnight-wall-answer",
      betId: "overnight-bet-partial",
      purpose: "answer",
      minute: 37,
      effect: { question: "Which real customer may be named in the follow-up?" },
    }, options),
  ];

  seedConversation(venture.id, [
    { role: "founder", betId: "overnight-bet-evidence", content: "Find the narrowest product truth worth testing overnight.", minute: 2 },
    { role: "teammate", teammateRef: "scout", betId: "overnight-bet-evidence", content: "The repository supports a recurring-handoff promise; the broad automation claim is not evidenced.", minute: 11 },
    { role: "teammate", teammateRef: "closer", betId: "overnight-bet-partial", content: "I saved the useful half before the connected account went away. Nothing was sent.", minute: 32 },
  ], options);

  return {
    venture,
    bets,
    outcomes: [joined, unattributed],
    wall,
    expected: {
      inwardEvents: 12,
      stagedArtifacts: 4,
      wallItems: 3,
      wallPurposes: ["answer", "release"],
      heldOutwardActs: 2,
      failedPartialTurns: 1,
    },
  };
}

/** Two isolated Projects for exact return and warm A→B→A presentation receipts. */
export function createReturnContinuityFixture({ root, repository } = {}) {
  const primary = createOvernightVentureFixture({ root, repository });
  const otherVenture = createVenture({
    id: "fixture-return-project-b",
    name: "Return project B",
    repository: fixtureRepository(repository),
    createdAt: at(300),
    updatedAt: at(300),
  }, { root, seedFoundingCrew: false });
  return { ...primary, otherVenture };
}

/** A scale fixture for browser review and deterministic acceptance only. */
export function createDenseVentureFixture({ root, repository, ventureId, ventureName, betEventMinute } = {}) {
  // Hand-built deterministic fixture crew: opt out of the founding-crew seed so crew counts stay exact.
  const options = { root, seedFoundingCrew: false };
  const venture = createVenture({
    id: ventureId ?? "fixture-dense-venture",
    name: ventureName ?? "Dense venture",
    repository: fixtureRepository(repository),
    createdAt: at(0),
    updatedAt: at(0),
  }, options);

  const teammateRefs = Array.from({ length: 12 }, (_, index) => `teammate-${String(index + 1).padStart(2, "0")}`);
  teammateRefs.forEach((ref, index) => summon(venture.id, ref, { name: `Teammate ${String(index + 1).padStart(2, "0")}` }, options));

  const bets = [];
  for (let index = 0; index < 120; index += 1) {
    const number = String(index + 1).padStart(3, "0");
    const id = `dense-bet-${number}`;
    const chainIndex = index % 10;
    const forkedFrom = chainIndex === 0 ? null : `dense-bet-${String(index).padStart(3, "0")}`;
    const staged = index % 9 === 0
      ? [{
        id: `dense-artifact-${number}`,
        title: `Staged difference ${number}`,
        content: LONG_COPY,
        ownerRefs: [teammateRefs[index % teammateRefs.length]],
        contributorRefs: [teammateRefs[(index + 1) % teammateRefs.length]],
        stagedAt: at(index + 3),
      }, ...(index === 0 ? [{
        id: "dense-artifact-001-counterexample",
        title: "Counterexample from a second teammate",
        content: "A team without a recurring handoff should reject this promise.",
        ownerRefs: [teammateRefs[1]],
        contributorRefs: [teammateRefs[0], teammateRefs[2]],
        stagedAt: at(index + 4),
      }] : [])]
      : [];
    bets.push(seedBet({
      ventureId: venture.id,
      id,
      intent: `Bet ${number}: ${LONG_COPY}`,
      teammateRef: teammateRefs[index % teammateRefs.length],
      forkedFrom,
      // The bet timeline (and its event `at` stamps) rides `minute`. A cold dense fixture passes a large
      // negative base so every bet event is stale relative to any wall clock — the rank-and-reveal (SPEC C)
      // then collapses the quiet tail deterministically, not gated on when the test happens to run.
      minute: (betEventMinute ?? 0) + index + 1,
      staged,
      evidence: [{ type: "repository-citation", id: `src/fixture-${number}.ts`, path: `src/fixture-${number}.ts`, excerpt: LONG_COPY }],
      events: [{ type: "speak", detail: `Durable dense-fixture event ${number}` }],
    }, options));
  }

  const outcomes = [];
  for (let index = 0; index < 30; index += 1) {
    const number = String(index + 1).padStart(3, "0");
    outcomes.push(seedOutcome({
      ventureId: venture.id,
      id: `dense-outcome-${number}`,
      betId: `dense-bet-${number}`,
      workRef: index % 9 === 0 ? `dense-artifact-${number}` : null,
      joinKey: `join-dense-bet-${number}`,
      outcomeKind: index % 3 === 0 ? "reply" : index % 3 === 1 ? "objection" : "silence-window",
      body: `Market return ${number}. ${LONG_COPY}`,
      from: `market-${number}@example.com`,
      minute: 160 + index,
    }, options));
  }

  const purposes = ["release", "answer", "review-outcome", "end-bet"];
  const wall = [];
  for (let index = 0; index < 20; index += 1) {
    const number = String(index + 1).padStart(3, "0");
    const purpose = purposes[index % purposes.length];
    const betId = `dense-bet-${number}`;
    const effect = purpose === "release"
      ? { kind: "message", to: `buyer-${number}@example.com`, body: LONG_COPY, joinKey: `join-${betId}` }
      : purpose === "answer"
        ? { question: `Which constraint should shape dense bet ${number}? ${LONG_COPY}` }
        : purpose === "review-outcome"
          ? { kind: "outcome", outcome: outcomes[index % outcomes.length] }
          : { kind: "kill-proposal", reason: `The evidence no longer supports this line. ${LONG_COPY}` };
    wall.push(seedWallItem({
      ventureId: venture.id,
      id: `dense-wall-${number}`,
      betId,
      workRef: index % 9 === 0 ? `dense-artifact-${number}` : null,
      purpose,
      effect,
      blocksBet: purpose !== "review-outcome",
      minute: 200 + index,
    }, options));
  }

  seedConversation(venture.id, [
    { role: "founder", content: `Keep the portfolio legible under real density. ${LONG_COPY}`, minute: 1 },
    { role: "teammate", teammateRef: teammateRefs[0], betId: "dense-bet-001", content: `The wider firm remains available below the consequential return. ${LONG_COPY}`, minute: 230 },
  ], options);

  return {
    venture,
    teammateRefs,
    bets,
    outcomes,
    wall,
    expected: { teammates: 12, bets: 120, outcomes: 30, wallItems: 20, maxForkDepth: 9 },
  };
}

/**
 * A dense venture whose bet events are COLD — stamped far in the past so none reads as recently-changed at
 * any wall clock. This is the deterministic ground for the SPEC C rank-and-reveal browser assertion: with a
 * hundred quiet directions the structure-band ranker keeps only the always-surfaced few and folds the rest
 * into territory cluster glyphs, while every node stays in the array feeding the outline (Law 4).
 */
export function createColdDenseVentureFixture({ root, repository } = {}) {
  return createDenseVentureFixture({
    root,
    repository,
    ventureId: "fixture-cold-dense-venture",
    ventureName: "Cold dense venture",
    // ~2 years of minutes before the fixture epoch: every bet event is far outside the 7-day recency window.
    betEventMinute: -1_000_000,
  });
}

/** A compact four-purpose wall fixture for authority and recovery journeys. */
export function createWallVentureFixture({ root, repository } = {}) {
  // Hand-built deterministic fixture crew: opt out of the founding-crew seed so crew counts stay exact.
  const options = { root, seedFoundingCrew: false };
  const venture = createVenture({
    id: "fixture-wall-venture",
    name: "Wall venture",
    repository: fixtureRepository(repository),
    createdAt: at(0),
    updatedAt: at(0),
  }, options);

  summon(venture.id, "steward", { name: "Ari" }, options);
  const bets = [
    seedBet({
      ventureId: venture.id,
      id: "wall-bet-release",
      intent: "Hold the exact private preview until the founder reviews it",
      teammateRef: "steward",
      minute: 2,
      staged: [{ id: "wall-preview", title: "Private preview", content: LONG_COPY, stagedAt: at(4) }],
      events: [{ type: "stage_outward", detail: "Private preview held before publication" }],
    }, options),
    seedBet({
      ventureId: venture.id,
      id: "wall-bet-answer",
      intent: "Ask for the one constraint the repository cannot answer",
      teammateRef: "steward",
      minute: 6,
      events: [{ type: "speak", detail: "A founder judgment is required" }],
    }, options),
    seedBet({
      ventureId: venture.id,
      id: "wall-bet-outcome",
      intent: "Learn from the attributable buyer reply",
      teammateRef: "steward",
      minute: 10,
      events: [{ type: "speak", detail: "The market return was joined to this bet" }],
    }, options),
    seedBet({
      ventureId: venture.id,
      id: "wall-bet-end",
      intent: "End a disproven line only through the founder",
      teammateRef: "steward",
      minute: 14,
      events: [{ type: "speak", detail: "The evidence no longer supports this line" }],
    }, options),
    seedBet({
      ventureId: venture.id,
      id: "wall-bet-deploy",
      intent: "Ship only through a verified repository deploy contract",
      teammateRef: "steward",
      minute: 16,
      events: [{ type: "stage_outward", detail: "Deploy held because no repository command was verified" }],
    }, options),
  ];

  const outcome = seedOutcome({
    ventureId: venture.id,
    id: "wall-outcome-joined",
    betId: "wall-bet-outcome",
    joinKey: "join-wall-bet-outcome",
    outcomeKind: "reply",
    body: "The narrower promise is useful; the broader one is not credible.",
    from: "buyer@example.com",
    minute: 18,
  }, options);

  const wall = [
    seedWallItem({
      ventureId: venture.id,
      id: "wall-purpose-release",
      betId: "wall-bet-release",
      purpose: "release",
      minute: 20,
      effect: {
        kind: "message",
        subject: "Private preview",
        destination: "founder-approved preview audience",
        body: LONG_COPY,
      },
    }, options),
    seedWallItem({
      ventureId: venture.id,
      id: "wall-purpose-answer",
      betId: "wall-bet-answer",
      purpose: "answer",
      minute: 21,
      effect: { question: "Which customer constraint may shape this bet?" },
    }, options),
    seedWallItem({
      ventureId: venture.id,
      id: "wall-purpose-review-outcome",
      betId: "wall-bet-outcome",
      purpose: "review-outcome",
      blocksBet: false,
      minute: 22,
      effect: { kind: "outcome", outcome },
    }, options),
    seedWallItem({
      ventureId: venture.id,
      id: "wall-purpose-end-bet",
      betId: "wall-bet-end",
      purpose: "end-bet",
      minute: 23,
      effect: { kind: "kill-proposal", reason: "The repository and buyer return both contradict this line." },
    }, options),
    seedWallItem({
      ventureId: venture.id,
      id: "wall-purpose-deploy",
      betId: "wall-bet-deploy",
      purpose: "release",
      minute: 24,
      effect: {
        kind: "deploy",
        title: "Deploy to production",
        destination: "production",
        deployUnavailableReason: "Name an existing package.json deploy script before authorizing this deploy.",
      },
    }, options),
  ];

  return {
    venture,
    bets,
    outcomes: [outcome],
    wall,
    expected: { wallItems: 5, wallPurposes: ["answer", "end-bet", "release", "review-outcome"] },
  };
}

// A compact venture shaped for the ?shell=canvas resting read: a genuine Product+GTM split (a staged
// product change biases its bet to the Product territory; prose drafts bias theirs to GTM), distinct work
// kinds (a diff renders as a product change, prose as a draft — so the cards do not read as duplicate
// stickies), and one card held at the wall so rank-and-reveal has something to surface first at rest.
const CANVAS_DIFF = [
  "diff --git a/src/pricing.ts b/src/pricing.ts",
  "@@ -1,3 +1,3 @@",
  "-export const monthlyPrice = 9;",
  "+export const monthlyPrice = 12;",
].join("\n");

export function createCanvasVentureFixture({ root, repository } = {}) {
  const options = { root, seedFoundingCrew: false };
  const venture = createVenture({
    id: "fixture-canvas-venture",
    name: "Canvas venture",
    repository: fixtureRepository(repository),
    createdAt: at(0),
    updatedAt: at(0),
  }, options);

  for (const [index, ref] of ["scout", "maker", "closer"].entries()) {
    summon(venture.id, ref, { name: ["Iris", "Moss", "Nia"][index] }, options);
  }

  const bets = [
    // Product territory: a staged code change is built product value.
    seedBet({
      ventureId: venture.id,
      id: "canvas-bet-pricing",
      intent: "Raise the monthly price to reflect the narrower promise",
      teammateRef: "maker",
      minute: 4,
      staged: [{ id: "canvas-artifact-pricing", content: `## Raise the price to $12\n\n${CANVAS_DIFF}`, stagedAt: at(6) }],
      events: [{ type: "staged", detail: "Pricing change staged" }],
    }, options),
    // GTM territory: a prose draft is go-to-market work.
    seedBet({
      ventureId: venture.id,
      id: "canvas-bet-launch",
      intent: "Invite operations leads to the repository-backed preview",
      teammateRef: "scout",
      minute: 8,
      staged: [{ id: "canvas-artifact-launch", content: "## Launch email to operations leads\n\nYour weekly handoff still looks manual — would the repository-backed shortcut help?", stagedAt: at(10) }],
      events: [{ type: "staged", detail: "Launch email staged" }],
    }, options),
    // GTM territory, held at the wall: the card rank-and-reveal surfaces first at rest.
    seedBet({
      ventureId: venture.id,
      id: "canvas-bet-headline",
      intent: "Rewrite the landing headline around the recurring handoff",
      teammateRef: "closer",
      minute: 12,
      staged: [{ id: "canvas-artifact-headline", content: "## Rewrite the landing headline\n\nLead with the recurring handoff, not broad automation.", stagedAt: at(14) }],
      events: [{ type: "stage_outward", detail: "Headline held before publication" }],
    }, options),
  ];

  const wall = [
    seedWallItem({
      ventureId: venture.id,
      id: "canvas-wall-headline",
      betId: "canvas-bet-headline",
      workRef: "canvas-artifact-headline",
      purpose: "release",
      minute: 20,
      effect: { kind: "page", destination: "private-preview", diff: "Narrow the headline to the recurring handoff." },
    }, options),
  ];

  return {
    venture,
    bets,
    wall,
    expected: { bets: 3, stagedArtifacts: 3, wallItems: 1, territories: ["gtm", "product"] },
  };
}

// A freshly created venture with no bets, no crew, no staged work — the empty canvas state. The plane
// must still read as named geography: the intent hub takes the venture name, both territory kickers
// render, and the composer offers first directions. No lorem, no tutorial checklist (spec empty state).
export function createEmptyCanvasVentureFixture({ root, repository } = {}) {
  const options = { root, seedFoundingCrew: false };
  const venture = createVenture({
    id: "fixture-empty-canvas-venture",
    name: "Empty canvas venture",
    repository: fixtureRepository(repository),
    createdAt: at(0),
    updatedAt: at(0),
  }, options);
  return { venture, bets: [], wall: [], expected: { bets: 0, territories: ["gtm", "product"] } };
}

export { LONG_COPY as DENSE_FIXTURE_LONG_COPY };
