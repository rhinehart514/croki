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

export type FirmConversationMessage = {
  id: string;
  ventureId: string;
  role: "founder" | "teammate" | "agent" | "system";
  kind?: "message" | "handoff" | "configuration-proposal" | "configuration-receipt" | "proposal-assembly";
  content: string;
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

export type ArchitectureRole = "concept" | "product-loop" | "system" | "motion" | "campaign";

export type FirmArchitectureProvenance = {
  kind: "founder-authored" | "repository-grounded" | "conversation-derived" | "teammate-proposed";
  createdAt?: string | null;
  sourceRefs?: string[];
};

export type FirmArchitectureElement = {
  id: string;
  role: ArchitectureRole;
  name: string;
  statement?: string | null;
  provenance?: FirmArchitectureProvenance;
  actor?: string | null;
  entry?: string | null;
  value?: string | null;
  intendedChange?: string | null;
  does?: string | null;
  repeatabilityClaim?: string | null;
  steps?: Array<{ id: string; label: string; conceptRefs?: string[] }>;
  systemIds?: string[];
  productRefs?: string[];
  supportsProductRefs?: string[];
  repositoryRefs?: string[];
  audience?: string | null;
  objective?: string | null;
  primaryMotionId?: string | null;
  motionIds?: string[];
  governingBetId?: string | null;
  governingBetSeed?: string | null;
  supportingBetIds?: string[];
  measurement?: { observation?: string | null; window?: string | null } | null;
  bounds?: { startsAt?: string | null; endsAt?: string | null } | null;
  live?: Record<string, unknown> | null;
};

export type FirmArchitectureConnection = {
  id: string;
  fromRef: string;
  toRef: string;
  label: string;
  assertion: "tentative" | "founder-asserted";
  source?: { kind?: string | null };
};

export type FirmArchitectureGroup = {
  id: string;
  name: string;
  statement?: string | null;
  memberRefs: string[];
};

export type FirmArchitecturePressure = {
  subjectRef?: string | null;
  subjectId?: string | null;
  reason: "held-release" | "challenged-claim" | "shared-system-contention" | "missing-product-capability" | "missing-evidence" | "founder-assertion-conflict" | "stale-source" | "blocked-work" | "unattributed-return";
  detail?: string | null;
};

export type FirmArchitectureJoin = {
  id?: string;
  architectureId?: string | null;
  campaignId?: string | null;
  motionId?: string | null;
  betId?: string | null;
  workRef?: string | null;
  wallItemId?: string | null;
  outcomeId?: string | null;
  basis?: "exact" | "contextual" | "founder-applied" | "inferred" | "unattributed" | string;
  causal?: false;
  motionIds?: string[];
  campaignIds?: string[];
  join?: { level?: string; basis?: string; causal?: false; [key: string]: unknown };
  title?: string | null;
  kind?: string | null;
  exact?: boolean;
  [key: string]: unknown;
};

export type FirmArchitectureDocument = {
  schemaVersion: number;
  ventureId: string;
  revision: number;
  intent: { statement: string; constraints?: string[] };
  elements: FirmArchitectureElement[];
  connections: FirmArchitectureConnection[];
  groups: FirmArchitectureGroup[];
  evidenceAnnotations: Array<{
    id: string;
    subjectRef: string;
    evidenceRef: string;
    stance: "supports" | "challenges";
    basis: "repository-citation" | "captured-join" | "founder-confirmed";
    note: string;
  }>;
  updatedAt?: string | null;
};

export type FirmArchitectureProjection = {
  ventureId: string;
  document: FirmArchitectureDocument;
  revision: number;
  elements: FirmArchitectureElement[];
  connections: FirmArchitectureConnection[];
  groups: FirmArchitectureGroup[];
  evidenceAnnotations: FirmArchitectureDocument["evidenceAnnotations"];
  pressure: FirmArchitecturePressure[];
  joins: {
    bets: FirmArchitectureJoin[];
    work: FirmArchitectureJoin[];
    wall: FirmArchitectureJoin[];
    outcomes: FirmArchitectureJoin[];
  };
  outline?: unknown[];
  omissions?: string[] | {
    historicalRevisions?: number | boolean;
    machinery?: boolean;
    unassignedBets?: number;
    [key: string]: unknown;
  };
  workingTheory?: FirmWorkingTheory | null;
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

export type FirmArchitectureIntent = {
  statement: string;
  constraints?: string[];
};

type FirmArchitectureProposalElementBase = {
  id: string;
  name: string;
  statement?: string | null;
  provenance?: FirmArchitectureProvenance;
};

export type FirmArchitectureProposalElement =
  | (FirmArchitectureProposalElementBase & { role: "concept" })
  | (FirmArchitectureProposalElementBase & {
      role: "product-loop";
      actor: string;
      entry: string;
      steps: Array<{ id: string; label: string; conceptRefs?: string[] }>;
      value: string;
      intendedChange: string;
    })
  | (FirmArchitectureProposalElementBase & {
      role: "system";
      does: string;
      supportsProductRefs?: string[];
      repositoryRefs?: string[];
    })
  | (FirmArchitectureProposalElementBase & {
      role: "motion";
      actor: string;
      entry: string;
      value: string;
      repeatabilityClaim: string;
      systemIds: string[];
      productRefs: string[];
    })
  | (FirmArchitectureProposalElementBase & {
      role: "campaign";
      audience: string;
      objective: string;
      primaryMotionId: string;
      motionIds: string[];
      supportingBetIds?: string[];
      measurement: { observation: string; window: string };
      bounds?: { startsAt?: string | null; endsAt?: string | null };
    } & (
      | { governingBetId: string; governingBetSeed?: never }
      | { governingBetId?: never; governingBetSeed: string }
    ));

export type FirmArchitectureEvidenceAnnotation = {
  id: string;
  subjectRef: string;
  evidenceRef: string;
  stance: "supports" | "challenges";
  basis: "repository-citation" | "captured-join" | "founder-confirmed";
  note: string;
};

export type FirmArchitectureOperation =
  | { op: "update-intent"; value: FirmArchitectureIntent }
  | { op: "create-element"; element: FirmArchitectureProposalElement }
  | { op: "update-element"; elementId: string; value: Partial<Omit<FirmArchitectureElement, "id" | "role">> }
  | { op: "change-role"; elementId: string; role: ArchitectureRole; fields?: Partial<Omit<FirmArchitectureElement, "id" | "role">> }
  | { op: "remove-element"; elementId: string }
  | { op: "create-connection"; connection: FirmArchitectureConnection }
  | { op: "update-connection"; connectionId: string; value: Partial<Omit<FirmArchitectureConnection, "id">> }
  | { op: "remove-connection"; connectionId: string }
  | { op: "create-group"; group: FirmArchitectureGroup }
  | { op: "update-group"; groupId: string; value: Partial<Omit<FirmArchitectureGroup, "id">> }
  | { op: "remove-group"; groupId: string }
  | { op: "apply-evidence"; evidence: FirmArchitectureEvidenceAnnotation }
  | { op: "remove-evidence"; evidenceId: string };

export type FirmArchitectureProposalStatus = "pending" | "accepted" | "partially-accepted" | "rejected";
export type FirmArchitectureProposalDecisionKind = "accept" | "partial" | "reject";

export type FirmProposalAssemblyEvent = {
  operationIndex: number;
  op: string;
  role?: ArchitectureRole;
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

export type FirmArchitectureProposal = {
  id: string;
  ventureId: string;
  baseRevision: number;
  intent: string;
  operations: FirmArchitectureOperation[];
  affectedExecutionContexts: string[];
  evidenceRefs: string[];
  unresolvedAssumptions: string[];
  expectedExecutionEffect: string | null;
  proposedBy: { authority: string; id: string };
  configurationRevision: number | null;
  status: FirmArchitectureProposalStatus;
  createdAt: string;
  decidedAt: string | null;
  decision: FirmArchitectureProposalDecisionKind | null;
  assemblyEvents?: FirmProposalAssemblyEvent[];
  reason?: string | null;
  decidedBy?: { authority: "founder"; id: string } | null;
  appliedRevision?: number | null;
};

export type FirmWorkingTheoryProposalRecord = Omit<FirmWorkingTheory, "status"> & {
  status: "current" | "superseded";
};

export type FirmArchitectureProposalRecord = FirmArchitectureProposal | FirmWorkingTheoryProposalRecord;

export type FirmDriveCompletion = {
  state: "complete" | "partial" | "stopped";
  grounding: { satisfied: boolean; sourceRefs: string[] };
  theory: { satisfied: boolean; theoryId: string | null };
  usefulWork: { satisfied: boolean; workRefs: string[] };
  missing: string[];
};

export type FirmArchitectureProposalDecision =
  | { decision: "accept"; reason?: string | null }
  | { decision: "reject"; reason?: string | null }
  | { decision: "partial"; operations: FirmArchitectureOperation[]; reason?: string | null };

export type FirmArchitectureRevisionReceipt = {
  id: string;
  revision: number;
  baseRevision: number;
  actor: { authority: "founder"; id: string };
  source: "proposal-acceptance" | "proposal-partial-acceptance" | "proposal-rejection" | string;
  proposalId?: string;
  reason: string | null;
  operations: FirmArchitectureOperation[];
  affectedTargets: string[];
  createdAt: string;
};

export type FirmArchitectureProposalsResponse = {
  proposals: FirmArchitectureProposalRecord[];
  revision: number;
};

export type FirmArchitectureProposalDecisionResponse = {
  proposal: FirmArchitectureProposal;
  architecture: FirmArchitectureDocument;
  revision: number;
  receipt: FirmArchitectureRevisionReceipt;
  affectedContexts?: string[];
  staleDrives?: unknown[];
};

export type FirmArchitectureSystemAcceptanceResponse = FirmArchitectureProposalDecisionResponse & {
  bets: FirmDurableBet[];
  campaigns: FirmArchitectureElement[];
  atomicity: "compensated-acceptance";
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
