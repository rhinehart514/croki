// ─── Funnel scan types ───────────────────────────────────────────────────────

type EvidenceState = "proven" | "gap" | "blind" | "inferred";

export type Citation = {
  label: string;
  file: string;
  line: number;
  text: string;
  key?: string;
};

type FunnelStage = {
  id: string;
  label: string;
  state: EvidenceState;
  description: string;
  citations: Citation[];
};

type TrackingGap = {
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

// The lightweight preview the front-door scan returns: enough to SHOW a stranger what the product
// learned about their code before they commit a goal. Separate from the full ScanReport (which the
// durable workspace keeps) — this is the contract the /api/scan front door returns. Every field is
// optional-tolerant: the preview degrades gracefully if the backend omits one.
export type ScanPreview = {
  headline?: string;
  stack?: string[];
  // The server returns the full structured win event (name/found/citations). The string
  // form is the legacy front-door shape; ScanPreview.tsx tolerates both, so the type does too.
  winEvent?: ScanReport["winEvent"] | string | null;
  winEventEvidence?: Citation[];
  blindAttribution?: { blind: boolean; reason?: string };
  productLine?: string;
  // The full unflattened scanRepo() output rides along for any field the lane also needs.
  report?: ScanReport;
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
  // What the last run actually produced — the "results back" signal surfaced on the engine
  // overview so produced items land next to the strategy that earned them. Null until first run;
  // derived from real node output, never seeded.
  lastRunResult: { produced: number; byCategory: Record<string, number> } | null;
  // Where this channel sits on the autonomy ladder. "draft" (default) holds every staged item at the
  // gate; "trusted"/"autonomous" carry a founder-blessed pattern the gate auto-applies to clean items
  // while still escalating exceptions. Set ONLY by an explicit founder promotion, never by a run.
  autonomy?: "draft" | "trusted" | "autonomous";
  // The standing approval the gate applies once a channel is promoted — a one-line recipe banked by the
  // founder. Null/absent while the channel is at draft.
  blessedPattern?: { note?: string; [key: string]: unknown } | null;
  // This pipeline's own offer/deal in the founder's words — an open shape carrying at minimum a
  // plain-words statement, plus whatever extra fields the composer attached. Absent when the pipeline
  // states none; the project-level shared offer is then the standing default.
  offer?: { statement: string; [key: string]: unknown } | null;
};

// ─── Input — one captured world-signal in the ambient inbox ───────────────────
// A durable, append-only record that "something happened out there" (a commit, a signup, a reply, a
// star, a CSV row), stamped with the provenance that carried it. It lands "unrouted" and just sits
// until the founder routes it into a channel or sets it aside — ingestion never runs or sends. Mirrors
// brain/src/inputs-store.mjs.
export type Input = {
  id: string;
  projectId: string;
  kind: string;
  source: string;
  payload: Record<string, unknown>;
  provenance: Record<string, unknown> | null;
  receivedAt: string;
  status: "unrouted" | "routed" | "ignored";
  routedTo: string | null;
};

// ─── Pending decision inbox ──────────────────────────────────────────────────
// One thing waiting on the founder, whatever it is, in a single uniform shape. Aggregated across every
// product and pipeline by the backend projection (brain/src/pending-inbox.mjs) — a read-only view over
// operator sessions and unrouted signals, never a new stored object. Acting on an item happens on its
// own existing surface (the gate bloom, the ghost proposal, the ideate pause, the inbox card); this is
// the queue that routes the founder there.
export type PendingDecisionKind =
  | "gate" | "proposal" | "ideas" | "candidates" | "question" | "blocked" | "failed" | "signal";

export type PendingDecision = {
  id: string;
  kind: PendingDecisionKind;
  projectId: string | null;
  projectName: string | null;
  pipelineId: string | null;
  pipelineName: string | null;
  sessionId: string | null;
  inputId: string | null;
  title: string | null;
  summary: string | null;
  optionCount?: number;
  waitingSince: string | null;
};

export type PendingInbox = {
  projectId: string | null;
  total: number;
  byKind: Partial<Record<PendingDecisionKind, number>>;
  decisions: PendingDecision[];
};

// ─── ChannelFeed — two channels linked by the real entities they share ───────
// The engine view draws channels as nodes and "feeds" between them. There is no stored "channel A
// produces, channel B consumes"; the honest derivation is that two channels are LINKED when they
// touch the same real Person, Claim, or Experiment. Undirected, one feed per channel pair, derived
// from cross-reference.mjs. Mirrors brain/src/cross-reference.mjs deriveChannelFeeds.
export type ChannelFeed = {
  fromChannel: string;
  toChannel: string;
  sharedPeople: number;
  sharedClaims: number;
  sharedExperiments: number;
  total: number;
  label: string;
};

// A DIRECTIONAL feed the founder drew on the engine canvas: `toChannel` pulls `fromChannel`'s output
// (the "derived source" mode — fromChannel's last run feeds toChannel's input). Mirrors
// brain/src/cross-reference.mjs deriveDirectedFeeds.
export type DirectedFeed = {
  fromChannel: string;
  toChannel: string;
  sourceNodeId: string;
};

// ─── Claim — a structured, first-class shared object ─────────────────────────
//
// Claims are structured objects (the source of truth); `product.claims` is a derived flat string[]
// projection (back-compat) every legacy reader still consumes. Provenance follows the one-directional
// truth valve: an evidence-free "derived" claim is demoted to "speculative"; a "founder" claim is the
// founder's own assertion and is never demoted. Mirrors brain/src/project-store.mjs.
export type ClaimProvenance = "derived" | "speculative" | "founder";

export type Claim = {
  id: string;
  text: string;
  provenance: ClaimProvenance;
  evidence: Citation[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

// ─── Clarity — the durable residue of an Ideate (thinking-posture) conversation ──
// Ideate is the composer in a thinking posture: it produces UNDERSTANDING, not channels. The
// insights it sharpens get PINNED as durable, draggable clarity cards on the canvas — and ground
// every downstream channel. Four kinds (the founder's set):
//   claim     — a sharp reusable statement about buyer/market/positioning
//   direction — a named GTM direction being considered but not yet built
//   icp       — a sharpening of who the real buyer is
//   question  — an honest open loose end to come back to
export type ClarityKind = "claim" | "direction" | "icp" | "question";
export type ClarityObject = {
  id: string;
  kind: ClarityKind;
  text: string;
  note?: string;
  createdAt: string;
};

// The composer's stance. "build" is the normal vibe-to-the-gate composer; "ideate" is the thinking
// posture — discuss and get clear, do not eagerly compose a channel.
export type ComposerPosture = "build" | "ideate";

// ─── Experiment — the shared operational hypothesis (sharedContext.experiments) ─
//
// One live hypothesis bound to a channel: which claim/variable it tests, what's held constant, the
// success signal, status, and the variant-vs-control pair. Distinct from the engine-OS `Experiment`
// type (which models the engine's own A/B affordance with goal/affectedSubsystems) — this is the GTM
// object the experiment-matrix lens grids by ICP × claim × channel. Mirrors the brain shape.
export type GtmExperiment = {
  id: string;
  channelId?: string | null;
  hypothesis?: string;
  variable?: string;
  heldConstant?: string;
  successSignal?: string;
  status?: string;
  result?: string | null;
  variant?: string;
  control?: string;
  // The experiment may carry the claim/ICP it tests so the matrix can place it without guessing.
  claimId?: string | null;
  icp?: string | null;
  // The strategic layer this experiment tests. OPEN string (never an enum); defaults to "channels".
  targetLayer?: string;
  // The arms under test. A channel is one arm KIND, so a single-channel run carries one channel arm.
  // `tally` is the arm's real run result, attached by the board from that channel's run ledger (never
  // invented) so the arm-comparison diagram races on grounded numbers.
  arms?: {
    id: string;
    label?: string;
    kind: string;
    channelId?: string | null;
    value?: unknown;
    tally?: { runs: number; staged: number; approved: number; rejected: number };
  }[];
  // The founder's resolution. Set ONLY by the founder, NEVER derived — a re-run must never write it.
  verdict?: {
    decision: "keep" | "kill" | "double-down";
    winningArmId?: string | null;
    decidedAt: string;
    decidedBy: string;
  };
  // Where a resolved verdict writes its belief back (which layer, which belief path).
  updates?: { layer: string; beliefPath: string };
  // Whether this experiment was derived from a run or stated by the founder.
  origin?: "derived" | "stated";
};

export type SharedContext = {
  version: number;
  updatedAt: string | null;
  repository: Record<string, unknown>;
  // product.claims is now a DERIVED flat string[] view of the structured top-level `claims` below.
  product: { name: string; description: string; valueProps: string[]; claims: string[] };
  positioning: Record<string, unknown>;
  icp: Record<string, unknown>;
  // The project-level standing offer (price / unit / terms) — the default deal every pipeline's
  // drafts carry unless the pipeline states its own (ChannelMeta.offer).
  offer?: { price?: string; unit?: string; terms?: string; alternatives?: string[]; status?: string };
  founderTaste: FounderTaste;
  contacts: Record<string, unknown>;
  // Structured claims — the source of truth `product.claims` projects from.
  claims: Claim[];
  outcomes: unknown[];
  experiments: GtmExperiment[];
  artifacts: unknown[];
  productFeedback: unknown[];
};

// ─── Person — the keystone shared object, promoted from real run entrants ─────
//
// A durable, project-scoped, shared identity. The same human is ONE Person across channels because
// identity collapses to a single stable key. Each appearance records where they surfaced and the
// per-appearance why-now trigger that found them there. Real GTM state derived from runs, never
// seeded, never sends. Mirrors brain/src/person-store.mjs.
export type PersonAppearance = {
  channelId: string | null;
  runId: string | null;
  role: string;
  trigger: string | null;
  at: string;
};

export type Person = {
  id: string;
  projectId: string;
  identityKey: string;
  name: string | null;
  org: string | null;
  handle: string | null;
  email: string | null;
  domain: string | null;
  appearances: PersonAppearance[];
  firstSeenAt: string;
  lastSeenAt: string;
};

// ─── Cross-reference — "where does X appear across channels" ──────────────────
// The result of GET /api/projects/:id/references?kind=&id=. References are the per-appearance /
// per-channel hits; the loosely-shaped `references` rows vary by kind (an appearance, a channel hit).
export type CrossReference = {
  where: string;
  channelId?: string | null;
  channelName?: string;
  runId?: string | null;
  role?: string;
  trigger?: string | null;
  at?: string;
  experimentId?: string;
  variable?: string | null;
};

export type CrossReferenceResult = {
  kind: string;
  id: string | null;
  references: CrossReference[];
  referenceCount: number;
  channelIds: string[];
  channelCount: number;
  person?: Person | null;
  experiment?: GtmExperiment | null;
  claim?: string | null;
  claimId?: string | null;
  icp?: Record<string, unknown>;
};

export type GTMProject = {
  id: string;
  name: string;
  activeChannelId: string | null;
  sharedContext: SharedContext;
  channels: ChannelMeta[];
};

// Founder taste has a stable shape from its producer (project sharedContext); type it instead of
// leaving it as a bag. It is read by SharedContext below.
export type FounderTaste = {
  approvedPatterns?: string[];
  rejectedPatterns?: string[];
  edits?: unknown[];
  policies?: string[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  repo: string | null;
  outcome: string | null;
  headline: string | null;
  channelCount: number;
  updatedAt: string;
};

// ─── Living Product Picture — the founder-editable interpretation aggregate ────
//
// Interpretation, not truth: the product's core objects (things), how they relate, what users are
// trying to do, the key states — generated by rented intelligence, edited by the founder, pinned
// with real-world signals. Persisted on its own append-only event log (DeriveProductModel /
// ReviseProductModel / RecordProductSignal); the host stamps ids/versions/provenance.
export type ProductModelProvenance = "derived" | "speculative";

export type ProductThing = {
  id: string;
  name: string;
  kind: string;
  summary: string;
  evidence: Citation[];
  provenance: ProductModelProvenance;
};

export type ProductRelationship = {
  id: string;
  from: string;
  to: string;
  label: string;
  summary: string;
  provenance: ProductModelProvenance;
};

export type ProductUserGoal = {
  id: string;
  actor: string;
  goal: string;
  outcome: string;
  relatedThings: string[];
  provenance: ProductModelProvenance;
};

export type ProductStateElement = {
  id: string;
  thingId: string;
  name: string;
  summary: string;
  provenance: ProductModelProvenance;
};

// IA layer — a parent-linked hierarchy (the sitemap/tree).
export type ProductIaNode = {
  id: string;
  name: string;
  summary: string;
  parentId: string;
  relatedThings: string[];
  evidence: Citation[];
  provenance: ProductModelProvenance;
};

// Workflow layer — a named flow of ordered steps.
type ProductWorkflowStep = {
  id: string;
  label: string;
  summary: string;
};

export type ProductWorkflow = {
  id: string;
  name: string;
  actor: string;
  summary: string;
  steps: ProductWorkflowStep[];
  evidence: Citation[];
  provenance: ProductModelProvenance;
};

// Interaction layer — states/screens (nodes) + transitions (edges).
export type ProductInteraction = {
  id: string;
  name: string;
  kind: string;
  summary: string;
  evidence: Citation[];
  provenance: ProductModelProvenance;
};

export type ProductTransition = {
  id: string;
  from: string;
  to: string;
  trigger: string;
  summary: string;
  provenance: ProductModelProvenance;
};

type ProductPinTargetKind = "thing" | "relationship" | "goal" | "state" | "model";

export type ProductPinnedSignal = {
  id: string;
  signalId: string;
  target: { kind: ProductPinTargetKind; id: string | null };
  type: string;
  summary: string;
  observedAt: string;
};

export type ProductModelGroundingRef = {
  evidenceState: EvidenceState | null;
  citationCount: number;
  scannedAt: string | null;
};

export type ProductModel = {
  id: string;
  lineageId?: string;
  previousModelId?: string | null;
  version: number;
  projectId: string;
  generatedBy: "claude" | "blank" | "founder";
  groundingRef: ProductModelGroundingRef;
  things: ProductThing[];
  relationships: ProductRelationship[];
  userGoals: ProductUserGoal[];
  states: ProductStateElement[];
  ia: ProductIaNode[];
  workflows: ProductWorkflow[];
  interactions: ProductInteraction[];
  transitions: ProductTransition[];
  pinnedSignals: ProductPinnedSignal[];
  createdAt: string;
  updatedAt: string;
};

// The founder-editable bags handed to ReviseProductModel. pinnedSignals is NOT here — signals
// arrive only through RecordProductSignal (the founder edits the model; the world edits signals).
export type ProductModelEdit = {
  things?: ProductThing[];
  relationships?: ProductRelationship[];
  userGoals?: ProductUserGoal[];
  states?: ProductStateElement[];
  ia?: ProductIaNode[];
  workflows?: ProductWorkflow[];
  interactions?: ProductInteraction[];
  transitions?: ProductTransition[];
  generatedBy?: "claude" | "blank" | "founder";
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
  // path. "agent" / "skill" / "code" / "mcp" are open steps the agent composes; they carry a
  // `ref` (the subagent, skill, or transform name) instead of a connector. "switch" is a
  // conditional router — no ref, no category; it splits traffic via per-edge predicates.
  // Workbench surfaces — human-operated, canvas-space, category "source", no ref. "terminal" = a live
  // shell (committed output feeds the graph); "query" = reads the project's own data; "web" = a research
  // browser. See terminal-server.mjs and the workbench node components.
  kind?: "tool" | "agent" | "skill" | "code" | "mcp" | "switch" | "terminal" | "query" | "web";
  // What this node emits — OPEN, never a closed enum (E3.1). "message" | "artifact" | "dataset" |
  // "signal" | "none" are hints, not the limit; the composer may invent others. Engine must not
  // privilege "message".
  outputKind?: string;
  ref?: string;
  connector?: string;          // headless connector id
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  agentPrompt?: string;
  // venture-style: what does this node own?
  sourceOfTruth?: string[];    // e.g. ["contacts", "signals"]
  contract?: GTMNodeContract;
  // Slice 4 — ghost/proposed: a node Claude has PROPOSED but that isn't real yet. Set only on the
  // client-staged preview (App merges these into the display graph); a committed node never carries it.
  // Rendered translucent/dashed with an inline accept/reject the founder resolves in place.
  proposed?: boolean;
  // Why-this-shape: one plain sentence the composer wrote for why this step exists and why it sits
  // where it does. Additive and optional — captured at compose time, or filled on demand by the
  // explain path. Surfaced only in the canvas's Explain mode; a graph without it renders as before.
  rationale?: string;
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

// The fixed op vocabulary a switch edge predicate may use (mirrors the engine's applyPredicate).
type GTMEdgePredicateOp =
  | "exists" | "missing" | "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";

// A routing rule carried by a data edge leaving a "switch" node: only items where
// item[field] <op> value holds take this branch. Omitted op defaults to "exists".
export type GTMEdgePredicate = {
  field: string;
  op?: GTMEdgePredicateOp;
  value?: unknown;
};

export type GTMEdge = {
  id: string;
  source: string;
  target: string;
  edgeType: GTMEdgeType;
  label?: string;
  // Conditional routing: present on a switch's outgoing data edges. Filters which items cross.
  predicate?: GTMEdgePredicate;
  // Living-grammar visual weight (0–1): how much live volume/conviction this edge carries.
  // Derived from the run ledger, never authored. Drives stroke-width in the canvas (Phase 3).
  conviction?: number;
  // Slice 4 — ghost/proposed: an edge Claude has PROPOSED but that isn't real yet. Set only on the
  // client-staged preview; a committed edge never carries it. Rendered dashed with an inline
  // accept/reject when both its endpoints are already real (an edge hanging off a ghost node commits
  // or drops together with that node).
  proposed?: boolean;
  // Why-this-order: one plain sentence for why this ordering (source → target) exists. Additive and
  // optional; surfaced as a rationale pill on the edge in the canvas's Explain mode.
  rationale?: string;
};

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
  // plain-language framing stamped at gate staging (never the outbound body — that stays verbatim).
  // A founder-plain headline and a one-line "what your yes does". Null when translation didn't run.
  plainLanguageTitle?: string | null;
  whatYourYesDoes?: string | null;
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
  kind?: "tool" | "agent" | "skill" | "code" | "mcp";
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
// founder's rewritten draft. A "refine" is a veto that is NOT a dead end: it hands the item back to the
// crew in the Composer with the founder's note, and the reworked draft returns to the gate.
export type GateDecision = {
  decision: "approve" | "reject" | "refine";
  editedDraft?: string;
  founderNote?: string;
};

// nodeId → (itemKey → decision). Keyed to match itemKey() / brain draftKey().
export type Decisions = Record<string, Record<string, GateDecision>>;

// One completed step in the gate's "reel" — what a teammate DID on this run, derived from a real executed
// node (never narrated). teammate is the plain role name (agentPersona), verb+object a plain past-tense
// phrase ("mapped", "buyer segments"), count the real item tally when one reads naturally.
export type ReelStep = {
  teammate: string;
  verb: string;
  object: string;
  count: number | null;
};

// ─── Durable resident GTM operator ───────────────────────────────────────────

export type OperatorStatus =
  | "ready"
  | "running"
  | "waiting_for_gate"
  | "waiting_for_proposal"
  | "waiting_for_ideas"
  | "waiting_for_input"
  | "interrupted"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

// One surviving idea the operator paused with, awaiting the founder's kill/keep verdict. Pre-wired so a
// pick drops straight into compose_and_run. what/upside/risk are the generator's own free words for
// what kind of move it is and the honest for/against; take is the critic's one plain sentence.
export type PendingIdea = {
  id: string;
  angle?: string | null;
  pitch: string;
  what?: string | null;
  upside?: string | null;
  risk?: string | null;
  take?: string | null;
  barScore?: number | null;
  buildWiring?: { kind?: string; goal?: string; title?: string } | null;
};

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
  // The team that owns this session's gate. Release is authorized against this team (owner/approver
  // may release; a member may not). Null/absent → the founder's personal space (solo founder releases).
  teamId?: string | null;
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
  // A graph change the operator staged for founder review — rendered on the canvas as ghost
  // nodes/edges with accept/discard. `preview` is the full would-be graph; `changes` are the
  // human-readable per-operation summaries.
  pendingProposal?: {
    id: string;
    graphId: string;
    baseRevision: number;
    rationale: string;
    operations: GraphOperation[];
    changes: Array<{ type: string; detail: string }>;
    preview: GTMGraph;
  } | null;
  // The surviving ideas the operator paused with for the founder to kill/keep (the ideate move). Present
  // only while status is "waiting_for_ideas". `cut` is the ideas the bar set aside, each with its plain
  // cut reason — nothing is culled out of sight, and the founder can bring one back.
  pendingIdeas?: {
    goal: string;
    ideas: PendingIdea[];
    cut?: Array<{ id: string; pitch: string; what?: string | null; reason?: string | null }>;
    killedCount?: number;
    distinctiveness?: unknown;
    regenerated?: boolean;
  } | null;
  events: OperatorEvent[];
};

// ─── Team & identity types ────────────────────────────────────────────────────

export type TeamRole = "owner" | "approver" | "member";

export type TeamMember = {
  userId: string;
  name: string;
  email: string | null;
  role: TeamRole;
};

// The current user plus the teams they belong to (from /api/me). A personal team always exists.
export type Me = {
  user: { userId: string; name: string; email: string | null };
  teams: Array<{ id: string; name: string; role: TeamRole; memberCount: number; updatedAt: string }>;
};

export type Team = {
  id: string;
  name: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
  schemaVersion?: number;
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
type FindingType = "opportunity" | "regression" | "finding";
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
  // The motion's emergent identity — a shape-derived name ("Outbound loop", "Content loop") and the
  // real stages, so the UI can show WHAT KIND of go-to-market this is without any fixed enum. Null on
  // a project-wide (no-graph) engine read.
  motion: { name: string; stages: string[] } | null;
  agents: EngineAgent[];
  topRecommendations: string[];
  investigations: Investigation[];
  experiments: Experiment[];
  recentFindings: AgentFinding[];
};

// The legacy pipeline types (Pipeline/Channel/PipelineStage/Prospect/…) were removed here — the
// open node model (GTMGraph) replaced them. The brain's legacy cold-outbound runner is retired in
// the same pass.

// ── Capabilities (external MCP servers Claude calls) ──────────────────────────
// A tool a connected MCP server brings, with the host's read/write verdict and any
// founder override. The wall stands on `effectiveClass`.
export type CapabilityTool = {
  name: string;
  description?: string;
  class: "read" | "write";          // the machine's verdict — never lost
  reason: string;
  source: "annotation" | "name" | "default" | "quarantine";
  declaredReadOnly: boolean | null;
  declaredDestructive: boolean | null;
  override: "read" | "write" | null; // the founder's deliberate move across the wall
  effectiveClass: "read" | "write";
};

export type CapabilityServer = {
  id: string;
  name: string;
  url: string;
  trust: "verified" | "community" | "untrusted";
  auth: { status: "authed" | "expired" | "none"; method: string | null };
  connectedAt: string;
  updatedAt: string;
  read: CapabilityTool[];
  write: CapabilityTool[];
  defaultedCount: number;
  overrideCount: number;
  toolCount: number;
};

// ─── Sender credentials (BYO keys) ─────────────────────────────────────────────
// The REDACTED view of a founder-pasted send credential — provider, label, when, and whether a token
// is present. The token itself never crosses to the client (credential-store redacts on every read).
export type SenderCredential = {
  provider: string;
  label: string | null;
  savedAt: string;
  hasToken: boolean;
  // How the sender is connected. "oauth" is the durable loopback flow (banked refresh token — never needs
  // a re-paste); "token" is a pasted access token that expires in ~1h. Absent on older records → treat as
  // "token". The secrets themselves never cross to the client.
  authType?: "oauth" | "token";
};

// ─── GTM Board ────────────────────────────────────────────────────────────────
// The nine belief layers getBoard() returns — the EXACT LayerBelief shape from brain/src/board.mjs.
// A pure read of real state: a layer with no signal reports belief=null, confidence=0, status="blind"
// rather than a confident fake. The board never gates or triggers a run.

export type BoardPhase = "Strategy" | "Motion" | "Loop";
type BoardGroundingMode = "stated" | "gated" | "derived";
type BoardLayerStatus = "blind" | "assumed" | "testing" | "validated";

export type LayerBelief = {
  // The layer key (icp, trigger, positioning, offer, channels, artifacts, people, measure, learn).
  layer: string;
  phase: BoardPhase;
  // The founder's current belief at this layer, or null when nothing is grounded yet.
  belief: string | null;
  groundingMode: BoardGroundingMode;
  confidence: number; // 0-100, derived from real signal
  status: BoardLayerStatus;
  experiments: GtmExperiment[];
  evidence: string[];
};

export type BoardView = {
  projectId: string;
  layers: LayerBelief[];
  groups: Record<BoardPhase, LayerBelief[]>;
};

// How solid a claim is, on the shared evidence ladder (strongest first). An open label — the UI must
// treat an unknown value gracefully, never reject it.
type Solidity = "observed" | "researched" | "inferred" | "speculative" | (string & {});

export type EvidenceRecord = {
  claim: string | null;
  source: string | null;
  solidity: Solidity | null;
  capturedAt?: string | null;
  notes?: string | null;
};

export type ObjectGraphSourceRef = {
  kind: string;
  ref: string;
  preview: string;
  at: string;
};

export type ObjectGraphWeakness = {
  id: string;
  kind: string;
  statement: string;
  detectedFrom: ObjectGraphSourceRef[];
  detectedAt: string;
  signal: Record<string, unknown>;
  threshold: string;
  severity: number | null;
  status: "open" | "repairing" | "repaired" | "dismissed";
  repair: { verb: string; statement: string; targetNodeId: string | null; compilable: boolean } | null;
  resolution: { at: string; by: string; ref: string | null } | null;
};

export type ObjectGraphNode = {
  schemaVersion: number;
  id: string;
  projectId: string | null;
  domain: string | null;
  type: string | null;
  maturity: "loose" | "typed" | "execution" | "outcome";
  statement: string;
  evidence: EvidenceRecord[];
  solidity: string | null;
  confidence: number | null;
  weaknesses: ObjectGraphWeakness[];
  weaknessReport?: Record<string, "fired" | "clear" | "unmeasured">;
  sources: ObjectGraphSourceRef[];
  origin: string;
  originRef: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type ObjectGraphEdge = {
  schemaVersion: number;
  id: string;
  projectId: string | null;
  source: string;
  target: string;
  type: string;
  status: "proposed" | "confirmed" | "swapped" | "challenged" | "suppressed" | "removed";
  basis: ObjectGraphSourceRef[];
  confidence: number;
  label?: string;
  createdAt: string;
  updatedAt: string;
};

export type ObjectGraphPathRecommendation = {
  pathId: string;
  name?: string;
  nodeIds: string[];
  edgeIds: string[];
  score: number;
  signals: Record<string, number>;
  weakestLink: { nodeId: string; weakness: ObjectGraphWeakness; signal: number } | null;
};

export type ObjectGraphView = {
  projectId: string;
  positions?: Record<string, { x: number; y: number }>;
  graph: {
    schemaVersion: number;
    projectId: string;
    nodes: ObjectGraphNode[];
    edges: ObjectGraphEdge[];
    revision: number;
    updatedAt: string;
  };
  recommendation: {
    rankedPaths: ObjectGraphPathRecommendation[];
    highlighted: ObjectGraphPathRecommendation[];
    reason?: string;
    weights?: Record<string, number>;
  };
};
