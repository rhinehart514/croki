// ─── Funnel scan types ───────────────────────────────────────────────────────

export type EvidenceState = "proven" | "gap" | "blind" | "inferred";

export type Citation = {
  label: string;
  file: string;
  line: number;
  text: string;
  key?: string;
};

export type FunnelStage = {
  id: string;
  label: string;
  state: EvidenceState;
  description: string;
  citations: Citation[];
};

export type TrackingGap = {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  status: EvidenceState;
  summary: string;
  recommendation: string;
  citations: Citation[];
};

export type ScanReport = {
  schemaVersion: number;
  repo: string;
  scannedAt: string;
  filesScanned: number;
  stack: string[];
  headline: string;
  analytics: { wired: boolean; providers: string[]; citations: Citation[] };
  attribution: { captured: boolean; keys: string[]; citations: Citation[] };
  winEvent: {
    name: string; found: boolean; properties: string[];
    attributionProperties: string[]; citations: Citation[];
  };
  funnel: {
    stages: FunnelStage[];
    edges: Array<{ id: string; source: string; target: string; state: EvidenceState }>;
  };
  gaps: TrackingGap[];
};

export type BuildResult = {
  ok: boolean; branch: string; worktree: string;
  baseCommit?: string;
  status: string; diffStat: string; diff: string; summary: string;
  error?: string | null;
};

// ─── Durable repository-backed GTM workspace ────────────────────────────────

export type WorkflowStatus = "ready" | "waiting" | "complete" | "blocked" | "failed";

export type WorkspaceStep = {
  id: "inspect" | "diagnose" | "propose" | "review" | "apply" | "verify";
  label: string;
  status: WorkflowStatus;
  description: string;
};

export type RevisionStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "applied"
  | "reverted"
  | "failed";

export type GTMRevision = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RevisionStatus;
  reportScannedAt: string;
  gapId: string | null;
  evidence: Citation[];
  baseCommit?: string;
  branch: string;
  worktree: string;
  worktreeStatus: string;
  diffStat: string;
  diff: string;
  summary: string;
  error?: string | null;
  review?: {
    decision: "approve" | "reject";
    note: string;
    decidedAt: string;
  };
  appliedAt?: string;
  revertedAt?: string;
};

export type WorkspaceDecision = {
  id: string;
  createdAt: string;
  type: string;
  revisionId?: string;
  decision?: string;
  note?: string;
  summary: string;
};

export type WorkspaceRun = {
  id: string;
  type: "inspection" | "verification";
  createdAt: string;
  headline: string;
  report: ScanReport;
};

export type GTMWorkspace = {
  schemaVersion: number;
  id: string;
  name: string;
  repo: string;
  outcome: string;
  createdAt: string;
  updatedAt: string;
  report: ScanReport;
  revisions: GTMRevision[];
  decisions: WorkspaceDecision[];
  runs: WorkspaceRun[];
  workflow: WorkspaceStep[];
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  repo: string;
  outcome: string;
  updatedAt: string;
  headline: string;
  revisionCount: number;
};

export type ApplyReadiness = {
  ready: boolean;
  sourceHead: string;
  sourceStatus: string;
  sameBase: boolean;
  reasons: string[];
};

// ─── Channel meta (project endpoint) ─────────────────────────────────────────

export type ChannelMeta = {
  id: string;
  name: string;
  kind: string;
  objective: string;
  graphId: string;
  enabled: boolean;
  status: "idle" | "error" | "done" | "waiting";
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  pendingGates: number;
  nodeCount: number;
  runCount: number;
  graphRevision: number;
};

export type SharedContext = {
  version: number;
  updatedAt: string | null;
  repository: Record<string, unknown>;
  product: { name: string; description: string; valueProps: string[]; claims: unknown[] };
  positioning: Record<string, unknown>;
  icp: Record<string, unknown>;
  founderTaste: Record<string, unknown>;
  contacts: Record<string, unknown>;
  outcomes: unknown[];
  experiments: unknown[];
  artifacts: unknown[];
  productFeedback: unknown[];
};

export type GTMProject = {
  id: string;
  name: string;
  activeChannelId: string | null;
  sharedContext: SharedContext;
  channels: ChannelMeta[];
  opportunities?: OpportunityStudio;
};

export type ProjectSummary = {
  id: string;
  name: string;
  repo: string | null;
  outcome: string | null;
  headline: string | null;
  channelCount: number;
  opportunityCount: number;
  updatedAt: string;
};

export type ProductUnderstanding = {
  generatedAt: string;
  productName: string;
  repository: string;
  winEvent: ScanReport["winEvent"];
  headline: string;
  stack: string[];
  filesScanned: number;
  evidenceState: EvidenceState;
  evidence: Citation[];
  blindSpots: Array<{
    id: string;
    title: string;
    summary: string;
    status: EvidenceState;
    evidence: Citation[];
  }>;
};

export type OpportunityStatus = "proposed" | "accepted" | "rejected" | "deferred";
export type OpportunityOrigin = "derived" | "speculative";
export type DataAdapter = {
  type: "manual" | "csv" | "api";
  label?: string;
  items?: Array<Record<string, unknown>>;
  csv?: string;
  endpoint?: string;
  method?: "GET" | "POST";
  arrayField?: string;
};

export type GTMOpportunity = {
  id: string;
  type: "channel" | "agent";
  origin: OpportunityOrigin;
  status: OpportunityStatus;
  title: string;
  objective: string;
  rationale: string;
  confidence: "high" | "medium" | "low";
  evidence: Citation[];
  createdAt: string;
  updatedAt: string;
  input?: DataAdapter;
  output?: DataAdapter;
  selectedAgentIds?: string[];
  provider?: "claude" | "codex";
  model?: string;
  ref?: string;
  prompt?: string;
  composedChannelId?: string;
};

export type OpportunityIdeationMeta = {
  ok: boolean;
  blank: boolean;
  error: string | null;
  proposed: number;
  kept: number;
};

export type OpportunityStudio = {
  generatedAt: string | null;
  sourceContextVersion: number | null;
  understanding?: ProductUnderstanding | null;
  ideation?: OpportunityIdeationMeta | null;
  items: GTMOpportunity[];
};

export type PortfolioBrief = {
  generatedAt: string;
  project: { id: string; name: string };
  sharedContextVersion: number;
  grounding: Record<string, unknown>;
  positioning: Record<string, unknown>;
  icp: Record<string, unknown>;
  channels: Array<{
    id: string;
    name: string;
    kind: string;
    objective: string;
    runCount: number;
    lastRunId: string | null;
    lastRunAt: string | null;
    ok: boolean | null;
    pendingGates: number;
    counts: Record<string, number>;
  }>;
  observedOutcomes: Array<Record<string, unknown>>;
  outcomeCounts: Record<string, Record<string, number>>;
  experiments: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  productFeedback: Array<Record<string, unknown>>;
  recommendations: string[];
};

export type ChannelRunDiff = {
  beforeRunId: string;
  afterRunId: string;
  beforeRevision: number | null;
  afterRevision: number | null;
  graphChanges: Array<Record<string, unknown>>;
  resultChanges: Array<{
    nodeId: string;
    before: { ok: boolean; itemCount: number; pendingReview: boolean; error: string | null } | null;
    after: { ok: boolean; itemCount: number; pendingReview: boolean; error: string | null } | null;
  }>;
  summary: string;
};

// ─── GTM Graph — node categories ─────────────────────────────────────────────
//
// Follows venture doctrine: complete structure, partial activation, local state.
// Node categories map to venture's node taxonomy:
//   resource  → connector declarations (visual, not executed)
//   source    → find/import work nodes
//   context   → ICP, persona, product reference nodes (floating, referenced via context edges)
//   enrich    → enrichment work nodes
//   filter    → score/dedup/segment work nodes
//   generate  → draft/sequence generation work nodes
//   gate      → founder gates (execution stops here pending approval)
//   execute   → send/log/schedule nodes (approval-required per connector manifest)
//   measure   → outcome capture preserved in local graph run history

export type GTMNodeCategory =
  | "resource"   // MCP/API connection declaration — visual only
  | "source"     // find, import
  | "context"    // ICP, persona, product — floating reference
  | "enrich"     // Clay, Clearbit, deep research
  | "filter"     // score, dedup, segment
  | "generate"   // draft, subject, sequence
  | "gate"       // founder review — execution pauses
  | "execute"    // Gmail send, LinkedIn, CRM log, Calendar
  | "measure";   // reply/outcome capture, attribution

// Three edge types (venture doctrine: distinguish data flow from reference from feedback)
export type GTMEdgeType =
  | "data"       // prospect records flow left → right (solid)
  | "context"    // reference/context — node reads from another without consuming it (dashed)
  | "feedback";  // explicit future-learning relationship; not executed automatically

export type GTMNode = {
  id: string;
  category: GTMNodeCategory;
  // The open node model. "tool" (or absent) is a registered connector — the category
  // path. "agent" / "skill" / "code" are open steps the agent composes; they carry a
  // `ref` (the subagent, skill, or transform name) instead of a connector.
  kind?: "tool" | "agent" | "skill" | "code";
  ref?: string;
  connector?: string;          // headless connector id
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  agentPrompt?: string;
  // venture-style: what does this node own?
  sourceOfTruth?: string[];    // e.g. ["contacts", "signals"]
  contract?: GTMNodeContract;
};

export type GTMNodeContract = {
  accepts?: string[];
  emits?: string[];
  minItems?: number;
};

export type GTMContractState = "ready" | "none" | "waiting" | "blocked" | "satisfied" | "blind";

export type GTMContractAudit = {
  state: GTMContractState;
  message: string;
  missingFields: string[];
  requiredFields?: string[];
  promisedFields?: string[];
  availableFields?: string[];
  itemCount?: number;
};

export type GTMEdge = {
  id: string;
  source: string;
  target: string;
  edgeType: GTMEdgeType;
  label?: string;
};

// The full graph (replaces Pipeline)
export type GTMGraph = {
  id: string;
  name: string;
  version: string;
  revision?: number;
  kind?: string;
  objective?: string;
  sharedContextVersion?: number;
  nodes: GTMNode[];
  edges: GTMEdge[];
  // venture-style store reference
  store?: {
    path: string;              // local .gtm/ path
    runs: number;              // how many runs have completed
    lastRunAt?: string;
  };
};

// ─── Execution types ──────────────────────────────────────────────────────────

// An item flowing through the graph — prospect, contact, signal, or draft
export type GTMItem = {
  type: "prospect" | "contact" | "signal" | "draft" | "context";
  id?: string;
  // contact fields
  name?: string;
  url?: string;
  email?: string;
  linkedin?: string;
  summary?: string;
  // scoring
  score?: number | null;
  fit?: boolean | null;
  fitReasons?: string[];
  // enrichment
  enriched?: boolean;
  company?: string;
  title?: string;
  // generation
  draft?: string | null;
  subject?: string | null;
  channel?: string;
  // gate/execute
  gated?: boolean;
  approved?: boolean;
  approvalStatus?: "approved" | "rejected" | "pending";
  editedFrom?: string | null;
  sentAt?: string | null;
  // provenance (venture doctrine: every item has a source pointer)
  source?: {
    tool: string;
    pointer?: string;
    fetchedAt?: string;
    tag: "observed" | "inferred" | "blind";
  };
  // free additional fields
  [key: string]: unknown;
};

export type GTMNodeResult = {
  nodeId: string;
  category: GTMNodeCategory;
  kind?: "tool" | "agent" | "skill" | "code";
  connector?: string;
  ok: boolean;
  items: GTMItem[];
  meta?: Record<string, unknown>;
  error?: string;
  blocked?: boolean;
  // gate-specific: pending founder review
  pendingReview?: boolean;
  contractAudit?: GTMContractAudit;
};

export type GraphOperation =
  | { type: "set_graph_name"; name: string }
  | { type: "add_node"; node: GTMNode }
  | { type: "remove_node"; nodeId: string }
  | { type: "update_node"; nodeId: string; patch: Partial<GTMNode> }
  | { type: "connect_nodes"; edge: GTMEdge }
  | { type: "disconnect_nodes"; edgeId: string };

export type GTMRunResult = {
  runId: string;
  graphId: string;
  ok: boolean;
  // results keyed by node id
  nodes: Record<string, GTMNodeResult>;
  // ordered execution sequence (topological, skipping resource nodes)
  executionOrder: string[];
  // which nodes are pending gate approval
  pendingGates: string[];
  targetNodeId?: string | null;
  resumedFromRunId?: string | null;
  feedbackEdges?: Array<{ source: string; target: string; label?: string }>;
  // Loop memory: how many prior founder decisions shaped this run.
  memoryApplied?: { approved: number; rejected: number; edits: number } | null;
  storedRunCount?: number;
  storedAt?: string;
  error?: string;
};

// ─── Context substrate manifest (the multiplier, made visible) ────────────────
//
// What the context engine assembled for a model call: which grounding providers contributed,
// how much, and which stayed blank. The host records it per agent step (on the node result meta)
// and exposes it per channel via GET /api/context. It is the instrument behind the context pill
// and the per-step inspector — never a fabricated number, always derived from real assembly.

export type ContextProviderEntry = {
  name: string;
  enabled: boolean;
  contributed: boolean;
  layer?: string;
  chars?: number;
  error?: string;
  meta?: Record<string, unknown>;
};

export type ContextManifest = {
  intent?: string | null;
  assembledAt?: string;
  totalChars?: number;
  contributingProviders?: number;
  providers?: ContextProviderEntry[];
};

// ─── The library — real GTM-engineering artifacts on disk ────────────────────
export type LibraryAgent = { ref: string; description: string };
export type LibrarySkill = { name: string; description: string };
export type GtmLibrary = { agents: LibraryAgent[]; skills: LibrarySkill[] };

// ─── Founder gate decisions (the loop's learning signal) ─────────────────────

// One decision on one drafted item. An edit is an approve that carries the
// founder's rewritten draft.
export type GateDecision = {
  decision: "approve" | "reject";
  editedDraft?: string;
};

// nodeId → (itemKey → decision). Keyed to match itemKey() / brain draftKey().
export type Decisions = Record<string, Record<string, GateDecision>>;

// ─── Durable resident GTM operator ───────────────────────────────────────────

export type OperatorStatus =
  | "ready"
  | "running"
  | "waiting_for_gate"
  | "waiting_for_input"
  | "interrupted"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

export type OperatorEvent = {
  id: string;
  createdAt: string;
  type: string;
  title: string;
  detail?: string | null;
  data?: Record<string, unknown> | null;
};

export type OperatorSessionSummary = {
  id: string;
  goal: string;
  graphId: string;
  projectId?: string | null;
  workspaceId?: string | null;
  status: OperatorStatus;
  createdAt: string;
  updatedAt: string;
  summary?: string | null;
  error?: string | null;
};

export type OperatorSession = OperatorSessionSummary & {
  schemaVersion: number;
  model: string;
  startedAt?: string | null;
  completedAt?: string | null;
  stepCount: number;
  maxSteps: number;
  graphRevision: number;
  lastRunId?: string | null;
  pendingQuestion?: { question: string; reason: string } | null;
  pendingGate?: {
    runId: string;
    nodeIds: string[];
    runResult: GTMRunResult;
  } | null;
  events: OperatorEvent[];
};

// ─── Connector registry types ─────────────────────────────────────────────────

export type ConnectorMeta = {
  id: string;
  name: string;
  category: GTMNodeCategory;
  description: string;
  envKey: string | null;
  stub?: boolean;
  configured: boolean;
  // venture-style: what operations does this connector allow/block/require approval for?
  allowed?: string[];
  blocked?: string[];
  approvalRequired?: string[];
};

// ─── Canvas selection ─────────────────────────────────────────────────────────

// A selected node id (or null for nothing selected)
export type NodeSelection = string | null;

// ─── GTM Engine OS ────────────────────────────────────────────────────────────

export type SubsystemId =
  | "research" | "context" | "source" | "enrich" | "filter"
  | "generate" | "gate" | "execute" | "measure" | "learn";

export type AgentStatus = "idle" | "investigating" | "monitoring" | "running";
export type FindingType = "opportunity" | "regression" | "finding";
export type ImpactLevel = "high" | "medium" | "low";

export type AgentFinding = {
  id: string;
  type: FindingType;
  summary: string;
  subsystem: SubsystemId;
  priority: ImpactLevel;
  createdAt: string;
};

export type Investigation = {
  id: string;
  subsystem: SubsystemId;
  // Derived subsystem health (same figure the canvas node badge shows). Rendered in
  // the Problems rail so one number describes a subsystem everywhere.
  health: number;
  problem: string;
  evidence: string[];
  confidence: number;
  impact: ImpactLevel;
  recommendation: string;
  nextActions: string[];
  status: "open" | "in-progress" | "resolved";
};

export type Experiment = {
  id: string;
  goal: string;
  hypothesis: string;
  status: "draft" | "running" | "complete" | "paused";
  results?: string;
  affectedSubsystems: SubsystemId[];
};

export type EngineSubsystem = {
  id: SubsystemId;
  label: string;
  health: number;
  throughput: number;
  confidence: number;
  agentStatus: AgentStatus;
  activeIssues: string[];
  suggestedActions: string[];
  // True when health/confidence are computed from real state (scan + run
  // ledger), false when the subsystem is still seeded mock data.
  derived?: boolean;
};

export type EngineAgent = {
  id: string;
  label: string;
  subsystem: SubsystemId;
  status: AgentStatus;
  currentWork?: string;
  confidence?: number;
  expectedImpact?: ImpactLevel;
};

export type EngineState = {
  subsystems: EngineSubsystem[];
  agents: EngineAgent[];
  topRecommendations: string[];
  investigations: Investigation[];
  experiments: Experiment[];
  recentFindings: AgentFinding[];
};

// ─── Legacy pipeline types (kept for backward compat in any remaining tests) ──

export type PipelineStageType = "icp" | "find" | "enrich" | "score" | "draft" | "gate";

export type PipelineStage = {
  id: string;
  type: PipelineStageType;
  label: string;
  connector: string;
  config: Record<string, unknown>;
  agentPrompt?: string;
};

export type Channel = {
  id: string;
  label: string;
  stages: PipelineStage[];
};

export type IcpDefinition = {
  query: string;
  geography?: string;
  industry?: string;
  keywords?: string[];
};

export type Pipeline = {
  id?: string;
  name?: string;
  icp: IcpDefinition;
  channels: Channel[];
  context?: Record<string, unknown>;
};

export type Prospect = GTMItem;

export type PipelineStageResult = {
  stageId: string;
  channelId: string;
  type: PipelineStageType;
  connector?: string;
  ok: boolean;
  items: GTMItem[];
  meta?: Record<string, unknown>;
  error?: string;
};

export type ChannelResult = {
  channelId: string;
  label: string;
  ok: boolean;
  stages: PipelineStageResult[];
};

export type PipelineRunResult = {
  ok: boolean;
  channels: ChannelResult[];
  error?: string;
};
