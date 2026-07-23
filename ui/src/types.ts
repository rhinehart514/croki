export type FirmTeammateSoul = {
  name?: string | null;
  [key: string]: unknown;
};

export type FirmCrewMember = {
  ref: string;
  summonedAt: string;
  soul: FirmTeammateSoul | null;
};

export type FirmConfiguredAgent = {
  ref: string;
  name: string;
  label: string | null;
  perspective: string | null;
  activation: "direct" | "relevant" | "direct-or-relevant" | "watch";
  capabilities: { firmTools: boolean; additional: string[] };
  context: { scope: string; instructions: string | null };
  memory: { scope: string; instructions: string | null };
  runtime: { provider: string | null; model: string | null };
  budget: { maxSteps: number | null; dailySpendUsd: number | null };
  authority: { outwardEffects: "blocked" | "wall" };
  evaluation: { signals: string[]; instructions: string | null };
  [key: string]: unknown;
};

export type FirmConfigurationDiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
};

export type FirmConfiguration = {
  id: string;
  schemaVersion: number;
  revision: number;
  presentation: {
    participant: "teammate" | "employee" | "agent" | "direct-model" | "specialist" | "team" | "automation" | "custom";
    participantLabel: string;
    collectiveLabel: string;
  };
  defaults: { runtime: string | null; model: string | null; maxSteps: number };
  organization: {
    shape: string;
    instructions: string | null;
    relationships: Array<{ from: string; to: string; kind: string; label: string | null }>;
  };
  coordination: {
    mode: string;
    coordinatorRef: string | null;
    maxPasses?: number;
    protocols: string[];
    stopWhen: string[];
  };
  authority: { outwardEffects: "blocked" | "wall"; configurationChanges: "founder" };
  agents: FirmConfiguredAgent[];
  [key: string]: unknown;
};

export type FirmImageAttachment = { id: string; name: string; mediaType: string; size: number };
export type JourneyImportAttachment = {
  kind: "journey-import";
  importRef: string;
  name: string;
  mediaType: string;
  byteSize: number;
  digest: string;
};

export type FirmConversationMessage = {
  id: string;
  ventureId: string;
  role: "founder" | "teammate" | "agent" | "system";
  kind?: "message" | "handoff" | "configuration-proposal" | "configuration-receipt" | "proposal-assembly";
  content: string;
  attachments?: Array<FirmImageAttachment | JourneyImportAttachment>;
  teammateRef: string | null;
  betId: string | null;
  target?: {
    betId: string | null;
    workRef: string | null;
    teammateRefs: string[];
    architectureId?: string | null;
    architectureStepId?: string | null;
    architectureRevision?: number | null;
  } | null;
  coordination?: {
    requestedBy: string;
    protocol: string;
    question: string;
  } | null;
  changes?: {
    openedBetIds: string[];
    stagedBetIds: string[];
    wallBetIds: string[];
  } | null;
  configurationProposal?: {
    id: string | null;
    baseRevision: number;
    proposedRevision: number;
    summary: string | null;
    status?: "pending" | "applied";
    appliedRevision?: number | null;
    receiptId?: string | null;
    rationale?: string | null;
    diff?: FirmConfigurationDiffEntry[];
  } | null;
  configurationReceipt?: {
    id: string | null;
    revision: number;
    summary: string | null;
    source: string | null;
    diff?: FirmConfigurationDiffEntry[];
  } | null;
  proposalAssembly?: FirmProposalAssembly | null;
  runtime?: {
    id: string | null;
    label: string | null;
    auth: string | null;
    model: string | null;
    configurationRevision: number | null;
  } | null;
  // Present only on a teammate message that reports a joined market reply (evidence to cause). Links the
  // reported reply down to its outcome record so the founder can open the full receipt from the thread.
  outcomeReport?: {
    outcomeId: string;
    outcomeKind: string | null;
    channel: string | null;
    from: string | null;
  } | null;
  createdAt: string;
};

export type FirmActorRef = { authority: "founder" | "agent" | "host"; id: string; [key: string]: unknown };

export type FirmSemanticObject = {
  id: string;
  type: string;
  name: string;
  statement: string;
  properties: Record<string, unknown>;
  assertion: "tentative" | "founder-asserted";
  provenance?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type FirmSemanticRelationship = {
  id: string;
  fromRef: string;
  toRef: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
  assertion: "tentative" | "founder-asserted";
  sourceRefs: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type FirmModelBranch = {
  id: string;
  ventureId: string;
  name: string;
  question: string;
  baseModelRevision: number;
  parentBranchRef: string | null;
  scopeRefs: string[];
  threadRefs: string[];
  sourceRefs: string[];
  createdBy: FirmActorRef;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedBy: FirmActorRef | null;
};

export type FirmModelChange = {
  id: string;
  branchRef: string;
  targetFamily: "objects" | "relationships";
  targetRef: string | null;
  operation: "create" | "update" | "remove";
  baseDigest: string | null;
  proposedRecord?: FirmSemanticObject | FirmSemanticRelationship;
  patch?: Record<string, unknown>;
  rationale: string;
  sourceRefs: string[];
  supersedesRef: string | null;
  proposedBy: FirmActorRef;
  createdAt: string;
  updatedAt: string;
};

export type FirmModelMergeReceipt = {
  id: string;
  branchRef: string;
  selectedChangeRefs: string[];
  resolvedConflicts: Record<string, unknown>[];
  previousModelRevision: number;
  resultingModelRevision: number;
  actor: FirmActorRef & { authority: "founder" };
  reason: string;
  createdAt: string;
};

export type FirmWorkScope = {
  id: string;
  ventureId: string;
  originThreadRef: string;
  originMessageRef: string;
  objective: string;
  subjectRefs: string[];
  branchRefs: string[];
  allowedInwardEffects: string[];
  wakeOnEvidenceRefs: string[];
  resumeOnRestart: boolean;
  spendPolicyRef: string | null;
  stopConditions: string[];
  createdAt: string;
  revokedAt: string | null;
  revokedBy: FirmActorRef | null;
};

export type OutwardActionReceipt = {
  id: string;
  ventureId: string;
  kind: string;
  subjectRefs: string[];
  branchRefs: string[];
  motionRefs: string[];
  productDeltaRefs: string[];
  workRefs: string[];
  decisionRef: string;
  executedAt: string | null;
  executorReceipt: Record<string, unknown> | null;
  executionLease?: { id: string; startedAt: string; startedBy: string } | null;
  executionAttempts: Array<{ id: string; attemptedAt: string; ok: boolean; adapter: string | null; error: string | null; needsReconnect: boolean }>;
  lastExecutionError: string | null;
  needsReconnect: boolean;
  observationRefs: string[];
  outcomeRefs: string[];
  preparedMaterial: Record<string, unknown> | null;
  expectedReturn: Record<string, unknown> | null;
};

export type OutwardObservation = {
  id: string;
  actionRef: string;
  source: "http" | "gmail-thread";
  target: { url?: string; threadId?: string };
  purpose: string;
  startsAt: string;
  endsAt: string;
  returnConditions: Array<Record<string, unknown>>;
  grantedAt: string;
  revokedAt: string | null;
  lastCheckedAt: string | null;
  lastResult: { state: "returned" | "silence" | "failed"; error?: string; checkedAt: string; facts?: Record<string, unknown> | null } | null;
};

export type OutwardReturnEvidence = {
  id: string;
  actionRef: string;
  observationContractRef: string;
  state: "returned" | "silence";
  source: string;
  target: { url?: string; threadId?: string };
  facts: Record<string, unknown>;
  observedAt: string;
};

export type FirmSemanticModel = {
  schemaVersion: 3;
  ventureId: string;
  revision: number;
  objects: FirmSemanticObject[];
  relationships: FirmSemanticRelationship[];
  modelBranches: FirmModelBranch[];
  modelChanges: FirmModelChange[];
  modelMergeReceipts: FirmModelMergeReceipt[];
  workScopes: FirmWorkScope[];
  outwardActions: OutwardActionReceipt[];
  [key: string]: unknown;
};

export type FirmModelBranchProjection = {
  ventureId: string;
  currentRevision: number;
  branch: FirmModelBranch;
  changes: FirmModelChange[];
  conflicts: Array<{ changeRef: string; targetRef: string | null; expectedDigest: string | null; actualDigest: string | null }>;
  current: { objects: FirmSemanticObject[]; relationships: FirmSemanticRelationship[] };
  proposed: { objects: FirmSemanticObject[]; relationships: FirmSemanticRelationship[] };
};

export type MarketMovementIndex = {
  ventureId: string;
  revision: number;
  actions: Array<OutwardActionReceipt & {
    state: "needs-founder" | "prepared" | "execution-failed" | "execution-unknown" | "in-world" | "observation-failed" | "silent" | "returned";
    observations?: OutwardObservation[];
    latestObservation?: OutwardObservation | null;
    latestOutcome?: OutwardReturnEvidence | null;
    compatibility?: Record<string, unknown>;
  }>;
  modelBranches: FirmModelBranch[];
  liveWork: Array<Record<string, unknown>>;
};

export type FirmTraceabilityGap =
  | { kind: "unsupported-claim"; objectRef: string; type: string | null; territory: "product" | "gtm" | null; statement?: string | null; reason: string }
  | { kind: "unsupported-link"; relationshipId: string; fromRef: string; toRef: string; pair: string | null; reason: string }
  | { kind: "unexpressed-capability"; objectRef: string; type: string | null; statement?: string | null; reason: string }
  | { kind: "disconnected-evidence"; evidenceRef: string; state?: string; reason: string };

export type FirmVentureTraceability = {
  traceLinks: unknown[];
  relationshipLinks: unknown[];
  insightLinks: unknown[];
  gaps: FirmTraceabilityGap[];
  gapsByKind: {
    unsupportedClaims: FirmTraceabilityGap[];
    unexpressedCapabilities: FirmTraceabilityGap[];
    disconnectedEvidence: FirmTraceabilityGap[];
  };
};

export type FirmWorkingTheorySubject = {
  id: string;
  name: string;
  statement: string;
  assertion: "tentative";
  sourceRefs: string[];
  conversationRefs: string[];
  workRefs: string[];
};

export type FirmWorkingTheoryRelationship = {
  id: string;
  fromRef: `theory:${string}`;
  toRef: `theory:${string}`;
  label: string;
  assertion: "tentative";
  sourceRefs: string[];
};

export type FirmWorkingTheory = {
  id: string;
  ventureId: string;
  mode: "working-theory";
  status: "current";
  supersedes: string | null;
  baseRevision: number;
  intent: string;
  subjects: FirmWorkingTheorySubject[];
  relationships: FirmWorkingTheoryRelationship[];
  anchors: Array<{
    subjectRef: `theory:${string}` | `theory-relationship:${string}`;
    sourceRefs: string[];
  }>;
  sources: Array<{
    ref: string;
    kind: "repository";
    path: string;
    startLine: number;
    endLine: number;
    excerpt: string;
    digest: string;
    observedAt: string;
  }>;
  conversationRefs: string[];
  createdAt: string;
  proposedBy: { authority: string; id: string };
};

export type FirmProposalAssemblyEvent = {
  operationIndex: number;
  op: string;
  role?: string;
  elementId?: string;
  label: string;
  validated: true;
  at: string;
};

export type FirmProposalAssembly = {
  proposalId: string;
  baseRevision: number;
  events: FirmProposalAssemblyEvent[];
};

export type FirmDriveCompletion = {
  state: "complete" | "partial" | "stopped";
  grounding: { satisfied: boolean; sourceRefs: string[] };
  theory: { satisfied: boolean; theoryId: string | null };
  usefulWork: { satisfied: boolean; workRefs: string[] };
  missing: string[];
};

export type FirmOutcome = {
  type: "outcome";
  id: string;
  betId?: string | null;
  workRef?: string | null;
  configurationRevision?: number | null;
  attribution?: "joined" | "unattributed";
  outcomeKind: string | null;
  from: string | null;
  body: string | null;
  source: string | null;
  channel: string | null;
  providerEventId?: string | null;
  providerSourceId?: string | null;
  observedAt: string;
  joined: boolean;
  [key: string]: unknown;
};

export type FirmBetPosition = "live" | "at-wall" | "ended";

export type FirmWorkflowStage = {
  id: string;
  label: string;
  kind: "opened" | "event" | "staged" | "gate" | "outcome" | "settled" | string;
  state: "done" | "running" | "gate" | "queued";
  teammateRef?: string | null;
  runningTeammateRef?: string | null;
  since?: string | null;
  at?: string | null;
  eventId?: string | null;
  workRef?: string | null;
  durationMs?: number;
  costUsd?: number;
};

export type FirmStagedArtifact = {
  id?: string;
  title?: string | null;
  content?: unknown;
  ownerRefs?: string[];
  contributorRefs?: string[];
  configurationRevision?: number | null;
  stagedAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
};

export type FirmDurableBet = {
  id: string;
  ventureId: string;
  intent: string;
  forkedFrom: string | null;
  teammateRef: string | null;
  configurationRevision?: number | null;
  refs: Array<{ type: string | null; id: string }>;
  evidence: unknown[];
  staged: FirmStagedArtifact[];
  joinKey: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  endedBy: string | null;
  learning: string | null;
  events?: Array<{
    id?: string;
    type: string;
    detail?: string | null;
    at: string;
    stepIndex?: number;
    durationMs?: number;
    costUsd?: number;
  }>;
  architectureRevision?: number | null;
  architectureTarget?: { id: string; stepId?: string | null } | null;
  campaignId?: string | null;
  [key: string]: unknown;
};

export type FirmBet = FirmDurableBet & {
  workflow?: FirmWorkflowStage[];
  machineryCounts?: Array<{ label: string; count: number }>;
  workflowMeasurementWindow?: string | null;
  position: FirmBetPosition;
  stagedCount: number;
  latestOutcome: FirmOutcome | null;
};

export type FirmWallSummary = {
  count: number;
  oldestParkedAt: string | null;
};

export type FirmPlacement = {
  positions: Record<string, { x: number; y: number }>;
  revision: number;
};

export type FirmLens = {
  ventureId: string;
  crew: FirmCrewMember[];
  bets: FirmBet[];
  outcomes?: FirmOutcome[];
  wallItems?: Array<{
    id: string;
    ventureId: string;
    betId: string | null;
    workRef?: string | null;
    purpose: "release" | "answer" | "review-outcome" | "end-bet";
    blocksBet: boolean;
    effect: Record<string, unknown>;
    parkedAt: string;
    decision: string | null;
    deployAuthorizedAt?: string | null;
    configurationRevision?: number | null;
  }>;
  wall: FirmWallSummary;
  placement: FirmPlacement;
  configuration?: FirmConfiguration;
};
