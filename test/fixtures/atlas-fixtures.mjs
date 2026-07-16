import path from "node:path";

import { createBet } from "../../brain/src/firm/bet.mjs";
import { summon } from "../../brain/src/firm/crew.mjs";
import { createVenture, setVentureDoc } from "../../brain/src/firm/venture-store.mjs";

const FIXTURE_EPOCH = Date.parse("2026-07-15T08:00:00.000Z");

function at(offsetMinutes) {
  return new Date(FIXTURE_EPOCH + offsetMinutes * 60_000).toISOString();
}

function fixtureRepository(repository) {
  return path.resolve(repository ?? path.join(import.meta.dirname, "../../samples/acme-saas"));
}

function architectureEnvelope({ ventureId, revision, intent, elements, connections = [], groups = [], evidenceAnnotations = [] }) {
  return {
    revision,
    current: {
      schemaVersion: 1,
      ventureId,
      revision,
      intent,
      elements,
      connections,
      groups,
      evidenceAnnotations,
      updatedAt: at(revision),
      updatedBy: { authority: "founder", id: "jacob" },
    },
    revisions: [],
    proposals: [],
  };
}

function provenance(minute = 0) {
  return { kind: "founder-authored", createdAt: at(minute) };
}

export function buildBuffaloAtlas({ dense = false } = {}) {
  const ventureId = "fixture-buffalo-projects";
  const elements = [
    {
      id: "arch-buffalo-department-champions",
      role: "concept",
      name: "Department champions",
      statement: "Possible human bridge into a sponsored cohort.",
      provenance: provenance(1),
    },
    {
      id: "arch-buffalo-referral-engine",
      role: "concept",
      name: "Referral engine",
      statement: "Visible work may give builders a natural reason to bring the next participant.",
      provenance: provenance(2),
    },
    {
      id: "arch-buffalo-project-drop",
      role: "concept",
      name: "Project drop",
      statement: "A builder starts with work worth advancing rather than a polished profile.",
      provenance: provenance(3),
    },
    {
      id: "arch-buffalo-loop-proof",
      role: "product-loop",
      name: "Work becomes credible proof",
      actor: "Recent graduate",
      entry: "Has something real to build",
      steps: [
        { id: "step-describe", label: "Describes the work", conceptRefs: ["arch-buffalo-project-drop"] },
        { id: "step-compose", label: "Enters a deliberately composed cohort" },
        { id: "step-work", label: "Performs real work" },
        { id: "step-proof", label: "Leaves credible proof" },
        { id: "step-return", label: "Finds collaborators or institutional opportunity" },
      ],
      value: "Credible proof and better collaborators",
      intendedChange: "Useful work begins before identity",
      repositoryRefs: ["repo:README.md"],
      provenance: provenance(4),
    },
    {
      id: "arch-buffalo-system-intake",
      role: "system",
      name: "Builder intake",
      does: "Turns a project worth advancing into a useful, comparable work description.",
      supportsProductRefs: ["arch-buffalo-loop-proof#step-describe"],
      repositoryRefs: ["repo:src/app/signup/actions.ts"],
      provenance: provenance(5),
    },
    {
      id: "arch-buffalo-system-cohort",
      role: "system",
      name: "Cohort composition",
      does: "Forms a deliberately useful working group around compatible real work.",
      supportsProductRefs: ["arch-buffalo-loop-proof#step-compose"],
      repositoryRefs: ["repo:README.md"],
      provenance: provenance(6),
    },
    {
      id: "arch-buffalo-system-proof",
      role: "system",
      name: "Work record and proof",
      does: "Turns atomic work entries into credible, reusable proof.",
      supportsProductRefs: ["arch-buffalo-loop-proof#step-proof"],
      repositoryRefs: ["repo:src/lib/attribution.ts"],
      provenance: provenance(7),
    },
    {
      id: "arch-buffalo-motion-graduate",
      role: "motion",
      name: "Project-first graduate entry",
      actor: "Recent graduate",
      entry: "A project worth advancing",
      value: "A matched working group and credible proof",
      systemIds: ["arch-buffalo-system-intake", "arch-buffalo-system-cohort", "arch-buffalo-system-proof"],
      productRefs: ["arch-buffalo-loop-proof"],
      repeatabilityClaim: "A qualified builder can enter through work, join a cohort, and create proof that attracts the next participant.",
      provenance: provenance(8),
    },
    {
      id: "arch-buffalo-motion-flagship",
      role: "motion",
      name: "Flagship proof acquisition",
      actor: "Builder with a visible project",
      entry: "A project whose progress can be made legible",
      value: "Public proof that attracts collaborators and partners",
      systemIds: ["arch-buffalo-system-proof", "arch-buffalo-system-cohort"],
      productRefs: ["arch-buffalo-loop-proof"],
      repeatabilityClaim: "Visible project work creates proof that recruits the next builder or institutional partner.",
      provenance: provenance(9),
    },
    {
      id: "arch-buffalo-motion-institutional",
      role: "motion",
      name: "Institution-backed cohort",
      actor: "Institutional program lead",
      entry: "Evidence that local builders are doing consequential work",
      value: "A sponsored path into a matched working cohort",
      systemIds: ["arch-buffalo-system-proof", "arch-buffalo-system-cohort"],
      productRefs: ["arch-buffalo-loop-proof"],
      repeatabilityClaim: "Credible work proof can open an institutional conversation that funds the next cohort.",
      provenance: provenance(10),
    },
    {
      id: "arch-buffalo-campaign-first-drops",
      role: "campaign",
      name: "First twenty project drops",
      audience: "Recent graduates with a project worth advancing",
      objective: "Produce qualified work descriptions before profile creation",
      primaryMotionId: "arch-buffalo-motion-graduate",
      motionIds: ["arch-buffalo-motion-graduate"],
      governingBetId: "buffalo-bet-project-first",
      supportingBetIds: [],
      measurement: {
        observation: "A qualified project is described before identity setup",
        window: "First twenty accepted project drops",
      },
      bounds: { startsAt: at(0), endsAt: null },
      provenance: provenance(11),
    },
  ];

  if (dense) {
    for (let index = 1; index <= 72; index += 1) {
      elements.push({
        id: `arch-buffalo-dense-concept-${String(index).padStart(3, "0")}`,
        role: "concept",
        name: `Founder question ${String(index).padStart(3, "0")}`,
        statement: `A deliberately long founder-authored question at the edge of the current focus, preserved without operational meaning ${index}.`,
        provenance: provenance(12 + index),
      });
    }
  }

  return architectureEnvelope({
    ventureId,
    revision: 7,
    intent: {
      statement: "Talented builders find the right people through credible work, not polished profiles.",
      constraints: ["Matched cohort remains the product center."],
    },
    elements,
    connections: [
      {
        id: "connection-buffalo-champions-institutional",
        fromRef: "architecture:arch-buffalo-department-champions",
        toRef: "architecture:arch-buffalo-motion-institutional",
        label: "may open the door to",
        assertion: "tentative",
        source: { kind: "founder-authored" },
      },
      {
        id: "connection-buffalo-referral-proof",
        fromRef: "architecture:arch-buffalo-referral-engine",
        toRef: "architecture:arch-buffalo-system-proof",
        label: "may compound from",
        assertion: "tentative",
        source: { kind: "founder-authored" },
      },
    ],
    groups: [
      {
        id: "group-buffalo-campus-door",
        name: "Campus distribution door",
        statement: "The first institutional opening, not the product ceiling.",
        memberRefs: [
          "architecture:arch-buffalo-department-champions",
          "architecture:arch-buffalo-motion-institutional",
        ],
      },
    ],
    evidenceAnnotations: [
      {
        id: "evidence-buffalo-project-drop-return",
        subjectRef: "architecture:arch-buffalo-motion-graduate",
        evidenceRef: "outcome:buffalo-outcome-project-drop",
        stance: "supports",
        basis: "captured-join",
        note: "Supports work-first entry for this observed sample; it does not establish motion-level causality.",
        appliedBy: { authority: "founder", id: "jacob" },
        appliedAt: at(50),
      },
    ],
  });
}

export function buildDenialShieldAtlas() {
  const ventureId = "fixture-denialshield";
  return architectureEnvelope({
    ventureId,
    revision: 4,
    intent: {
      statement: "Dental practices prevent avoidable insurance denials before claims leave the office.",
      constraints: ["Consultant judgment remains visible where product evidence is incomplete."],
    },
    elements: [
      {
        id: "arch-denial-loop-clean-claim",
        role: "product-loop",
        name: "A clean claim gets paid",
        actor: "Dental revenue lead",
        entry: "A claim is ready for submission",
        steps: [
          { id: "step-check", label: "Checks denial risk" },
          { id: "step-fix", label: "Fixes missing evidence" },
          { id: "step-submit", label: "Submits a clean claim" },
          { id: "step-learn", label: "Learns from payer response" },
        ],
        value: "Fewer preventable denials and faster payment",
        intendedChange: "Denial prevention happens before submission",
        repositoryRefs: ["repo:README.md"],
        provenance: provenance(1),
      },
      {
        id: "arch-denial-system-preflight",
        role: "system",
        name: "Claim preflight",
        does: "Checks claim evidence against known denial patterns before submission.",
        supportsProductRefs: ["arch-denial-loop-clean-claim#step-check"],
        repositoryRefs: ["repo:src/lib/analytics-server.ts"],
        provenance: provenance(2),
      },
      {
        id: "arch-denial-system-consultant",
        role: "system",
        name: "Consultant review",
        does: "Resolves ambiguous claim risks and teaches the practice what to fix.",
        supportsProductRefs: ["arch-denial-loop-clean-claim#step-fix"],
        repositoryRefs: ["repo:README.md"],
        provenance: provenance(3),
      },
      {
        id: "arch-denial-motion-product-led",
        role: "motion",
        name: "Self-serve denial preflight",
        actor: "Practice revenue lead",
        entry: "Uploads one claim before submission",
        value: "An immediately safer claim",
        systemIds: ["arch-denial-system-preflight"],
        productRefs: ["arch-denial-loop-clean-claim"],
        repeatabilityClaim: "A useful first preflight creates a reason to check the next claim.",
        provenance: provenance(4),
      },
      {
        id: "arch-denial-motion-consultant-led",
        role: "motion",
        name: "Consultant-led denial recovery",
        actor: "Dental consultant",
        entry: "Finds a practice with recurring avoidable denials",
        value: "A corrected claim and a reusable prevention habit",
        systemIds: ["arch-denial-system-preflight", "arch-denial-system-consultant"],
        productRefs: ["arch-denial-loop-clean-claim"],
        repeatabilityClaim: "Consultant diagnosis can turn one recovery into ongoing preflight adoption.",
        provenance: provenance(5),
      },
      {
        id: "arch-denial-campaign-five-practices",
        role: "campaign",
        name: "Five-practice preflight pilot",
        audience: "Independent dental practices with recurring insurance denials",
        objective: "Observe whether one prevented denial creates repeat weekly use",
        primaryMotionId: "arch-denial-motion-consultant-led",
        motionIds: ["arch-denial-motion-consultant-led", "arch-denial-motion-product-led"],
        governingBetId: "denial-bet-first-save",
        supportingBetIds: [],
        measurement: {
          observation: "A practice runs another claim without consultant prompting",
          window: "Within two weeks of the first prevented denial",
        },
        bounds: { startsAt: at(0), endsAt: at(20_160) },
        provenance: provenance(6),
      },
    ],
    evidenceAnnotations: [
      {
        id: "evidence-denial-repeat-check",
        subjectRef: "architecture:arch-denial-motion-product-led",
        evidenceRef: "outcome:denial-outcome-repeat-check",
        stance: "challenges",
        basis: "captured-join",
        note: "The practice valued the correction but did not return without consultant prompting.",
        appliedBy: { authority: "founder", id: "jacob" },
        appliedAt: at(61),
      },
    ],
  });
}

function seedBetAndReality({ venture, betInput, releasedWork, pendingWork, outcome, options }) {
  const architectureRevision = betInput.architectureRevision;
  const bet = {
    ...createBet({
      ...betInput,
      ventureId: venture.id,
      createdAt: at(betInput.minute),
      updatedAt: at(betInput.minute),
      staged: [releasedWork, pendingWork].filter(Boolean),
    }),
    architectureRevision,
    events: [
      { type: "started", detail: "Direction inherited the selected architecture context.", at: at(betInput.minute + 1) },
      { type: "staged", detail: releasedWork.title, at: at(betInput.minute + 2) },
    ],
  };
  setVentureDoc(venture.id, "bets", bet.id, bet, options);

  const releasedReceipt = {
    id: `${bet.id}-released-receipt`,
    ventureId: venture.id,
    betId: bet.id,
    workRef: releasedWork.id,
    architectureRevision,
    configurationRevision: 1,
    purpose: "release",
    blocksBet: true,
    effect: releasedWork.effect,
    parkedAt: at(betInput.minute + 3),
    decision: "release",
    decidedAt: at(betInput.minute + 4),
    decidedBy: "founder",
    note: "Released from the exact staged work.",
    releasedAt: at(betInput.minute + 4),
    deployAuthorizedAt: null,
    deployAuthorizedBy: null,
  };
  setVentureDoc(venture.id, "decisions", releasedReceipt.id, releasedReceipt, options);

  let pendingReceipt = null;
  if (pendingWork) {
    pendingReceipt = {
      id: `${bet.id}-pending-wall`,
      ventureId: venture.id,
      betId: bet.id,
      workRef: pendingWork.id,
      architectureRevision,
      configurationRevision: 1,
      purpose: "release",
      blocksBet: true,
      effect: pendingWork.effect,
      parkedAt: at(betInput.minute + 5),
      decision: null,
      decidedAt: null,
      decidedBy: null,
      note: null,
      releasedAt: null,
      deployAuthorizedAt: null,
      deployAuthorizedBy: null,
    };
    setVentureDoc(venture.id, "decisions", pendingReceipt.id, pendingReceipt, options);
  }

  const durableOutcome = {
    type: "outcome",
    id: outcome.id,
    ventureId: venture.id,
    betId: bet.id,
    workRef: releasedWork.id,
    architectureRevision,
    configurationRevision: 1,
    joinKey: bet.joinKey,
    outcomeKind: outcome.kind,
    from: outcome.from,
    body: outcome.body,
    source: "fixture-connected-account",
    channel: "email",
    messageId: `message-${outcome.id}`,
    providerEventId: `provider-${outcome.id}`,
    providerSourceId: "fixture-inbox",
    observedAt: at(betInput.minute + 20),
    attribution: "joined",
    joined: true,
    structural: { channel: "email", outcomeKind: outcome.kind, joined: true },
    identifying: { betId: bet.id, betIntent: bet.intent, from: outcome.from, body: outcome.body },
  };
  setVentureDoc(venture.id, "outcomes", durableOutcome.id, durableOutcome, options);
  setVentureDoc(venture.id, "bets", bet.id, {
    ...bet,
    evidence: [...bet.evidence, { type: "outcome", id: durableOutcome.id }],
    updatedAt: durableOutcome.observedAt,
  }, options);
  return { bet, releasedReceipt, pendingReceipt, outcome: durableOutcome };
}

function seedConversation(venture, target, options) {
  const message = {
    id: `${venture.id}-conversation-001`,
    ventureId: venture.id,
    role: "founder",
    kind: "message",
    content: "Keep the product truth, market route, and exact consequence readable together.",
    teammateRef: null,
    betId: target.betId,
    target: {
      kind: "architecture",
      id: target.architectureId,
      stepId: null,
      architectureRevision: target.architectureRevision,
    },
    coordination: null,
    changes: null,
    configurationProposal: null,
    configurationReceipt: null,
    runtime: null,
    createdAt: at(3),
  };
  setVentureDoc(venture.id, "conversation", message.id, message, options);
}

export function createAtlasPortfolioFixture({ root, repository, dense = false } = {}) {
  const options = { root };
  const repo = fixtureRepository(repository);
  const venture = createVenture({
    id: "fixture-buffalo-projects",
    name: "Buffalo Projects",
    repository: repo,
    createdAt: at(0),
    updatedAt: at(50),
  }, options);
  const unrelatedVenture = createVenture({
    id: "fixture-denialshield",
    name: "DenialShield",
    repository: repo,
    createdAt: at(1),
    updatedAt: at(61),
  }, options);

  summon(venture.id, "architect", { name: "Mara" }, options);
  summon(venture.id, "maker", { name: "Sable" }, options);
  summon(unrelatedVenture.id, "consultant", { name: "Iris" }, options);

  const buffaloArchitecture = buildBuffaloAtlas({ dense });
  const denialArchitecture = buildDenialShieldAtlas();
  setVentureDoc(venture.id, "architecture", "atlas", buffaloArchitecture, options);
  setVentureDoc(unrelatedVenture.id, "architecture", "atlas", denialArchitecture, options);

  const buffaloReality = seedBetAndReality({
    venture,
    options,
    betInput: {
      id: "buffalo-bet-project-first",
      intent: "Project drop converts better than profile creation",
      teammateRef: "maker",
      configurationRevision: 1,
      architectureRevision: 7,
      refs: [
        { type: "architecture", id: "arch-buffalo-campaign-first-drops" },
        { type: "architecture", id: "arch-buffalo-motion-graduate" },
      ],
      evidence: [{ type: "repository-citation", id: "README.md", path: "README.md", excerpt: "Repository fixture evidence." }],
      joinKey: "join-buffalo-project-first",
      minute: 20,
    },
    releasedWork: {
      id: "buffalo-work-project-drop-v1",
      title: "Project-drop invitation v1",
      content: "Describe the work you are trying to advance before creating a profile.",
      ownerRefs: ["maker"],
      contributorRefs: ["architect"],
      configurationRevision: 1,
      architectureRevision: 7,
      stagedAt: at(22),
      effect: {
        kind: "message",
        to: "graduate@example.com",
        body: "Describe the work you are trying to advance before creating a profile.",
        joinKey: "join-buffalo-project-first",
      },
    },
    pendingWork: {
      id: "buffalo-work-project-drop-v2",
      title: "Project-drop invitation v2",
      content: "A narrower invitation using the returned builder language.",
      ownerRefs: ["maker"],
      contributorRefs: ["architect"],
      configurationRevision: 1,
      architectureRevision: 7,
      stagedAt: at(25),
      effect: {
        kind: "message",
        to: "second-graduate@example.com",
        body: "Bring the project you want to make real; start with the work.",
        joinKey: "join-buffalo-project-first-v2",
      },
    },
    outcome: {
      id: "buffalo-outcome-project-drop",
      kind: "reply",
      from: "graduate@example.com",
      body: "I described the project before I thought about making a profile.",
    },
  });

  const denialReality = seedBetAndReality({
    venture: unrelatedVenture,
    options,
    betInput: {
      id: "denial-bet-first-save",
      intent: "One prevented denial creates repeat weekly use",
      teammateRef: "consultant",
      configurationRevision: 1,
      architectureRevision: 4,
      refs: [
        { type: "architecture", id: "arch-denial-campaign-five-practices" },
        { type: "architecture", id: "arch-denial-motion-consultant-led" },
      ],
      evidence: [{ type: "repository-citation", id: "README.md", path: "README.md", excerpt: "Repository fixture evidence." }],
      joinKey: "join-denial-first-save",
      minute: 30,
    },
    releasedWork: {
      id: "denial-work-risk-review-v1",
      title: "First claim risk review",
      content: "The missing attachment would have caused an avoidable denial.",
      ownerRefs: ["consultant"],
      contributorRefs: [],
      configurationRevision: 1,
      architectureRevision: 4,
      stagedAt: at(32),
      effect: {
        kind: "message",
        to: "practice@example.com",
        body: "Attach the missing evidence before this claim leaves the office.",
        joinKey: "join-denial-first-save",
      },
    },
    pendingWork: {
      id: "denial-work-follow-up-v2",
      title: "Second-claim follow-up",
      content: "Ask the practice to run the next claim through preflight without consultant prompting.",
      ownerRefs: ["consultant"],
      contributorRefs: [],
      configurationRevision: 1,
      architectureRevision: 4,
      stagedAt: at(35),
      effect: {
        kind: "message",
        to: "practice@example.com",
        body: "Try the next claim through preflight before our follow-up.",
        joinKey: "join-denial-first-save-v2",
      },
    },
    outcome: {
      id: "denial-outcome-repeat-check",
      kind: "reply",
      from: "practice@example.com",
      body: "The correction helped, but we waited for the consultant before checking the next claim.",
    },
  });

  seedConversation(venture, {
    betId: buffaloReality.bet.id,
    architectureId: "arch-buffalo-motion-graduate",
    architectureRevision: 7,
  }, options);
  seedConversation(unrelatedVenture, {
    betId: denialReality.bet.id,
    architectureId: "arch-denial-motion-consultant-led",
    architectureRevision: 4,
  }, options);

  return {
    venture,
    ventures: [venture, unrelatedVenture],
    unrelatedVenture,
    architecture: buffaloArchitecture,
    unrelatedArchitecture: denialArchitecture,
    reality: buffaloReality,
    unrelatedReality: denialReality,
    expected: {
      buffalo: {
        revision: 7,
        concepts: dense ? 75 : 3,
        productLoops: 1,
        systems: 3,
        motions: 3,
        campaigns: 1,
        sharedSystemId: "arch-buffalo-system-proof",
        sharedSystemMotionIds: ["arch-buffalo-motion-graduate", "arch-buffalo-motion-flagship", "arch-buffalo-motion-institutional"],
        trace: [
          "arch-buffalo-system-proof",
          "arch-buffalo-motion-graduate",
          "arch-buffalo-campaign-first-drops",
          "buffalo-bet-project-first",
          "buffalo-work-project-drop-v1",
          "buffalo-outcome-project-drop",
        ],
      },
      denialShield: {
        revision: 4,
        productLoops: 1,
        systems: 2,
        motions: 2,
        campaigns: 1,
        sharedSystemId: "arch-denial-system-preflight",
      },
    },
  };
}

export function createDenseAtlasPortfolioFixture(options = {}) {
  return createAtlasPortfolioFixture({ ...options, dense: true });
}

export function createEmptyAtlasFixture({ root, repository } = {}) {
  const venture = createVenture({
    id: "fixture-empty-atlas",
    name: "Unshaped venture",
    repository: fixtureRepository(repository),
    createdAt: at(0),
    updatedAt: at(0),
  }, { root });
  return {
    venture,
    ventures: [venture],
    expected: { revision: 0, elements: 0, bets: 0, wall: 0, outcomes: 0 },
  };
}
