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
  connector?: string;          // headless connector id
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  agentPrompt?: string;
  // venture-style: what does this node own?
  sourceOfTruth?: string[];    // e.g. ["contacts", "signals"]
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
  connector?: string;
  ok: boolean;
  items: GTMItem[];
  meta?: Record<string, unknown>;
  error?: string;
  blocked?: boolean;
  // gate-specific: pending founder review
  pendingReview?: boolean;
};

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
  feedbackEdges?: Array<{ source: string; target: string; label?: string }>;
  storedRunCount?: number;
  storedAt?: string;
  error?: string;
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
