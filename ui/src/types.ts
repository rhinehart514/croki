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
  // ── Question-altitude enrichment (docs/production-direction/06). All optional and additive: the
  // current server omits them, and the question focus degrades to its honest "nothing recorded yet"
  // states. A founder-pinned question reuses this same record and stable id (doc 06 §Questions); these
  // fields carry its focus state without a second store. Populated by the canvas projection when the
  // parallel backend lands it; never fabricated on the client.
  status?: "open" | "answered" | "archived";
  updatedAt?: string;
  // The teammate positions around this question — each a distinct, attributable claim with its own
  // evidence, uncertainty, recommendation, and falsifier. Disagreement is preserved as separate
  // entries, NEVER blended into one summary (doc 05 §Disagreement is a feature).
  positions?: TeammatePosition[];
  // Evidence gathered for/against, kept distinct by stance (doc 06 §Evidence behavior).
  evidence?: QuestionEvidence[];
  // What is still unknown, sitting visibly beyond the current evidence (doc 09 question altitude).
  unknowns?: string[];
  // Founder calls stamped where they settled or redirected this question — a receipt, not a second
  // decision authority (doc 04 §Founder decisions). Answering a question never approves execution.
  decisions?: FounderDecisionReceipt[];
  // The crew and product elements this question involves (teammate/product ref ids). Used to bind context
  // when the founder turns the question into a pipeline. Present on the normalized canvas projection.
  participantRefs?: string[];
  productRefs?: string[];
};

// One teammate's attributable position on a question. Every teammate contribution answers: what I
// believe, what supports it, what I'm uncertain about, what I'd do next, and what would change my
// mind (doc 05 §Teammate contract). Faces mean authorship, never decoration.
export type TeammatePosition = {
  ref: string;                 // the teammate's stable agent ref (drives its face + profile)
  claim: string;               // what this teammate believes
  evidenceRefs?: string[];     // ids into the question's evidence, or plain source pointers
  uncertainty?: string | null; // what it is unsure about
  recommendation?: string | null; // what it would do next
  // The falsifier — "what would change my mind." The spec-native evidence action hangs off this: it is
  // the concrete, gatherable thing that would move the position. Null when the teammate stated none.
  falsifier?: string | null;
  // Refs of teammates this position directly contradicts — drawn as separate branches, never merged.
  disagreesWith?: string[];
  provenance?: OperatingProvenance | null;
};

export type QuestionEvidence = {
  id: string;
  stance: "supporting" | "challenging";
  claim: string;
  // Provenance label — the same five the host enforces structurally (doc 06 §Evidence behavior).
  tag: "observed" | "researched" | "founder-stated" | "inferred" | "speculative";
  ref?: string | null;         // file:line, market source, person, artifact, or outcome pointer
};

// A stamped founder-decision receipt — the append-only audit index over the existing feedback/gate/
// taste authority (doc 04 §Founder decisions). Never a second generic decision store on the client.
export type FounderDecisionReceipt = {
  id: string;
  kind: string;                // open string: "branch", "made-the-call", "accepted-implication", …
  wording: string;             // the founder's exact words or the selected value
  createdAt: string;
  supersedesId?: string | null;
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
  contacts: Record<string, unknown>;
  // Structured claims — the source of truth `product.claims` projects from.
  claims: Claim[];
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
  // The model's own plain-language account of what it figured out on this step — "what I learned / why I
  // did this". Surfaced on the opened card as a short "what [teammate] figured out" beat. Absent on
  // deterministic (tool/code) steps and on any run the backend didn't stamp it on — render-if-present.
  reasoning?: string;
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
  | "waiting_for_candidates"
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
  threadRef?: string | null;
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
  worker?: { runtime: "auto" | "claude" | "codex"; model: string | null };
  parentSessionId?: string | null;
  branchGroupId?: string | null;
  handoffRevision?: number;
  handoffs?: Array<{
    id: string;
    from: { runtime: "auto" | "claude" | "codex"; model: string | null };
    to: { runtime: "claude" | "codex"; model: string };
    contextRefs: Array<{ type: string; id: string }>;
    focusRef?: { type: string; id: string } | null;
    createdAt: string;
    blocking: false;
  }>;
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

// Durable read projection reconstructed from independently attributable Ask-both branch sessions.
// It carries no selection, winner, merge, cancellation, or approval state.
export type OperatorComparisonGroup = {
  branchGroupId: string;
  parentSessionId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  branches: OperatorSession[];
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

// ─── Live capability inventory (the real "what your crew can reach" roster) ─────
// What the crew can actually reach RIGHT NOW — the live tools (from connected MCP servers), agents, and
// skills, straight from the runtime instead of a hardcoded brand list. The `lane` mirrors the wall: a
// "read" tool runs free, a "write" one acts only behind the gate. Render-if-present: when the backend
// hasn't produced this yet, the surfaces fall back to the suggested-connections catalog.
export type CapabilityInventoryTool = { serverId: string; toolName: string; lane: "read" | "write" };
export type CapabilityInventoryAgent = { ref: string; label: string };
export type CapabilityInventory = {
  tools: CapabilityInventoryTool[];
  agents: CapabilityInventoryAgent[];
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

// ─── Reallocation receipt — the Overdrive batch card (GTM-MACHINE.md Area 3) ────
//
// The plain-language object the founder's batch/gate stream renders as a correctable receipt: what the
// machine tilted toward, drawn from which real outcomes, plus the motions flagged as drawing nothing —
// all overturnable, never a hidden policy. Mirrors reallocationReceipt() in brain/src/reallocation.mjs
// EXACTLY (and the ReallocationReceipt payload in api.ts). `applied` is false and `weights === base`
// when nothing cleared the observation floor. Additive-only — no existing type changes.

// One motion the machine is leaning toward: it cleared the floor and earned outcomes at/above the
// product's average. `outcomesByKind` is its provenance — the real wins, by kind, that earned the lean.
export type ReallocationWorkingMotion = {
  motionKind: string;
  motionRef: string | null;
  observed: number;
  outcomesByKind: Record<string, number>;
};

// One motion flagged for the founder's call: staged real work, measured nothing. FLAGGED, never cut —
// `reason` is the plain-count receipt ("41 actions staged, 0 measured"). The founder keeps or pauses it.
export type ReallocationStarvedMotion = {
  motionKind: string;
  motionRef: string | null;
  staged: number;
  measured: number;
  reason: string;
};

export type ReallocationReceiptData = {
  projectId: string;
  applied: boolean;
  base: Record<string, number>;
  weights: Record<string, number>;
  tilt: Record<string, number>;
  reasons: string[];
  working: ReallocationWorkingMotion[];
  starved: ReallocationStarvedMotion[];
  minObservations: number;
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

// ─── The multi-modal gate delta (GateDeltaCard) ──────────────────────────────
//
// One approval card that renders the CHANGE a motion staged, whatever kind it is: an outbound draft is a
// body, a programmatic page is a rendered sample, an in-repo product change is a diff. All three are the
// same object on screen — the difference is only what the delta pane shows. The card never fabricates: a
// field that isn't present simply doesn't render. Provenance (which run / which grounding) shows on
// inspection where the host supplies it.
//
// This type is a READ-ONLY projection the integrator builds from a staged gate item; the card decides
// nothing about the wall — it only surfaces the delta and routes the founder's call back out through the
// same approve / send-back / ship handlers the gate already owns.

export type GateDeltaKind = "outbound" | "page" | "change";

// One file changed by a code-native motion, named for the pill above the diff. `additions`/`deletions`
// are the real line counts when the host computed them; null when only the raw diff is known.
export type GateDeltaFile = {
  path: string;
  additions?: number | null;
  deletions?: number | null;
};

// The change named in a pill for a code-native delta: a plain verb ("Add", "Edit", "Generate") and the
// object it acts on ("per-city listing pages", "share link on every sale page"). Derived by the host from
// the motion shape — never typed by the founder, never a closed enum.
export type GateDeltaChange = {
  verb: string;
  object: string;
};

// A sampled rendered page for a programmatic-page motion: its route and the self-contained HTML the
// generator emits for it. The card renders it inline in a sandboxed, script-less iframe — the same
// read-only preview used by the gate. `sampledFrom`/`total` say honestly "3 of 1,240 real pages",
// because the gate shows a sample of a generator's output, never the whole minted corpus.
export type GateDeltaPage = {
  route: string;
  html: string;
  label?: string | null;
};

// The delta a single staged item carries, normalized to one shape the card can render regardless of
// motion kind. Exactly one of `body` / `pages` / `diff` is the primary pane; the others stay null.
export type GateDelta = {
  kind: GateDeltaKind;
  // A founder-plain headline for the change and the one-line consequence of a yes (mirrors the gate's
  // plainLanguageTitle / whatYourYesDoes). Both optional — the card falls back to the subject.
  title: string;
  whatYourYesDoes?: string | null;
  // Which lane / motion staged this, in plain words ("Per-city pages", "Estate-company outreach"), and
  // the receipt on inspection — which run produced it, what grounding it stood on. Provenance is the part
  // a screenshot can't clone, so it's always available to open, never fabricated.
  motionLabel?: string | null;
  provenance?: string | null;

  // ── outbound ──: the verbatim message being sent. Never paraphrased by the card.
  body?: string | null;
  // The offer/deal the draft rides, shown so the founder reviews the copy against it. Optional.
  offer?: string | null;

  // ── page ──: sampled rendered pages from a generator. `pages` is the sample; `sampledFrom` is how many
  // were shown and `total` how many the generator would mint, so the card can say "3 of 1,240".
  pages?: GateDeltaPage[] | null;
  sampledFrom?: number | null;
  total?: number | null;

  // ── change (code-native) ──: the in-repo product change. `diff` is the unified diff text (verbatim from
  // git), `files` names the touched files for the pill row, `change` names the change itself, and
  // `summary` is the model's plain account of what it did. `deployConfirmable` marks this as needing the
  // heavier second authorization: an approve alone stages it; a yes here must also carry deployConfirmed.
  diff?: string | null;
  diffStat?: string | null;
  files?: GateDeltaFile[] | null;
  change?: GateDeltaChange | null;
  summary?: string | null;
  // Whether the delta is code-native and needs the SECOND authorization to go live. When true the card
  // renders the heavier "Ship it live" confirm; when false/absent a plain approve releases it.
  deployConfirmable?: boolean;
  // The ship path in plain words for the confirm copy ("opens a pull request on your repo",
  // "deploys to Vercel"). Optional — falls back to a neutral "ships it live".
  shipPath?: string | null;

  // Whether a real send/ship transport is wired, so the card's action copy is honest about what a yes
  // does (send for real vs stage on the machine). Never changes the wall — only the words.
  transportConnected?: boolean;
};

// The decision the card hands back. For outbound/page it's a plain approve/send-back/edit. For a
// code-native change, an "approve" stages the change; a "ship" carries deployConfirmed:true — the
// explicit SECOND authorization the deploy connector requires. `editedBody` rides an outbound edit.
export type GateDeltaDecision = {
  decision: "approve" | "send-back" | "ship";
  deployConfirmed?: boolean;
  editedBody?: string;
  note?: string;
};

// The persisted receipt an already-decided delta collapses to — the chip that stays in the transcript
// ("Sent", "Shipped", "Sent back") so the decision reads as a durable record, not a vanished action.
export type GateDeltaReceipt = "sent" | "shipped" | "sent-back";

// ─── The operating view — one Operator lens over the whole fleet (GTM-MACHINE.md Area 6) ─────────────
//
// A pure cross-fleet READ: every go-to-market motion drawn as a uniform lane, the shared objects the
// lanes both touched drawn once with ties between them, the plan's not-yet-run motions as proposed
// lanes, and the pending founder decisions tagged to the lane they belong to. Composed by the backend
// from getEngineState (stages + health), the touch ledger (shared objects), deriveMotionEfficiency
// (the outcome rows), project status (parked state), and getPendingInbox — never re-derived on the
// client, never seeded. An outbound lane, a programmatic-page lane, and a product-change lane are the
// SAME shape here on purpose: one visual grammar, color for STATE only. Mirrors
// brain/src/operating-view.mjs getOperatingView({ projectId }).

// Where a health number / derived state came from — the receipt shown on inspection. `basis` names the
// derivation in plain words ("from 3 outcomes on this motion"); the ids let the lens route to the real
// run/outcome. Every OperatingLane health and OperatingObject bucket carries one; a bet with no signal
// reads honestly ("no signal yet") rather than borrowing confidence it hasn't earned.
export type OperatingProvenance = {
  basis: string;
  runId?: string | null;
  outcomeId?: string | null;
  probe?: string | null;
  // "grounded" = derived from a real run/outcome/probe reading; "bet" = a proposed-but-unmeasured
  // motion or object with no observation behind it yet. The lens renders the two visibly differently.
  kind: "grounded" | "bet";
};

// One stage on a lane's emergent stage strip — the plain-language step name getEngineState derived for
// THIS motion (an outbound lane and a page lane get their own stages, never a shared skeleton). `state`
// is the derived flow state; `active` marks the one currently working (its label is spoken on the lane).
export type OperatingStage = {
  id: string;
  label: string;
  state: "done" | "active" | "waiting" | "blind" | "idle";
  active?: boolean;
};

// One measured-efficiency reading for a lane, straight from deriveMotionEfficiency — honest-unmeasured
// (measured 0, coverage null) never a fabricated rate. Rendered as tabular numbers that hold still.
export type OperatingEfficiency = {
  motionKind: string | null;
  staged: number;
  measured: number;
  coverage: number | null;
  outcomesByKind: Record<string, number>;
  lastOutcomeAt: string | null;
};

// One motion, drawn as a uniform lane. `runState` lights the lane and, when parked, routes one click to
// the real gate. `proposed` marks an Area 4 plan lane that isn't running yet (rendered as a proposed-
// state lane in the same grammar). `objectKeys` ties the lane to the shared objects it has touched.
export type OperatingLane = {
  channelId: string;
  name: string;
  motionKind: string | null;
  // The lane's derived health (same figure the engine node badge shows) + where it came from.
  health: number;
  healthProvenance: OperatingProvenance;
  stages: OperatingStage[];
  efficiency: OperatingEfficiency | null;
  // Live/parked state — the ONLY place color earns its use on a lane. "parked" = a run waiting at the
  // founder gate (the lane pulses; one click flies to it). "running" = a live run. "idle" = at rest.
  runState: "running" | "parked" | "idle" | "error";
  // When parked: the pending decision this lane routes to (its id in the inbox, and the gate location).
  parked?: { decisionId: string; sessionId: string | null; pipelineId: string | null; waitingSince: string | null } | null;
  // A not-yet-run plan motion (Area 4) rendered in the same grammar as a proposed lane. `origin` mirrors
  // the plan's derived-vs-speculative label so a grounded code-native motion looks different from a bet.
  proposed?: boolean;
  origin?: "derived" | "speculative";
  rationale?: string | null;
  // The shared-object keys this lane has touched — the tie endpoints the map draws.
  objectKeys: string[];
};

// One shared object drawn ONCE — a person, a keyword+geo, a page, a partner, a proposed change. `lanes`
// are the lane channelIds that touched it (2+ = the money-shot tie: "one person, many motions"). The
// emergent bucket is derived at read time (deriveFunnel), never a stored state. `touchCount` reads the
// touch ledger so the map can say "never worked twice".
export type OperatingObject = {
  objectKey: string;
  kind: string;
  label: string | null;
  bucket: "seen" | "in_flight" | "handled" | "suppressed";
  lanes: string[];
  motionCount: number;
  touchCount: number;
  lastSeenAt: string | null;
  provenance: OperatingProvenance;
};

// The woven projection (docs/INTERTWINED-CANVAS.md §2) — the same lanes + objects emitted as one graph of
// three synthetic families: object nodes (drawn once), tie edges (a lane's touch of an object, carrying the
// ledger verb + a derived anchor step), and kind clusters (lanes grouped by shape-derived motion name). All
// render-time projections, never persisted. Computed server-side (where the touch ledger lives) and attached
// to the operating view so the intertwined canvas gets real ties without a second round trip.
export type WovenObjectNode = {
  id: string;                 // "obj:<objectKey>"
  objectKey: string;
  kind: string | null;
  label: string | null;
  bucket: OperatingObject["bucket"] | null;
  motionCount: number;        // degree — v2 sizes on this
  touchCount: number;
  draw: boolean;              // the 2+-touch rule: true iff motionCount >= 2
  provenance: OperatingProvenance | null;
  laneKeys: string[];
  anchorMeanX: number | null; // mean-X of its ties' anchors (v1 chip placement)
};
export type WovenTie = {
  id: string;                 // "tie:<channelId>:<objectKey>"
  channelId: string;
  objectKey: string;
  verb: string | null;        // real, from the ledger
  runId: string | null;
  anchorStepId: string | null;// the lane's last data-producing step / gate (raw, unnamespaced)
  anchorX: number | null;
  drawn: boolean;             // mirrors the object's draw
};
export type WovenKindCluster = {
  id: string;                 // "kind:<motionKind>"
  motionKind: string;
  laneKeys: string[];
  laneCount: number;
};
// ── The canonical canvas projection (brain/src/woven-graph.mjs → projectCanvas). This is the ONE
// authoritative shape for stable product/question/outcome/decision/pipeline anchors and the durable
// relationships between them. The UI consumes THIS (operatingView.woven.canvas) when present and falls
// back to raw clarity/records otherwise. A ref is `{type,id}`; an anchor carries the real record `body`.
export type WovenRef = { type: string | null; id: string };

// The canonical product-market terrain contracts. The deterministic view is a read-only projection over
// existing authorities; the rented read is an ephemeral overlay. Terrain hypotheses are addressable
// context, not durable strategy records.
export type TerrainIssue = {
  owner?: string | null;
  code?: string | null;
  message: string;
  ref?: WovenRef | null;
};

export type TerrainObservation = {
  id: string;
  claim: string;
  label?: string;
  provenance: "observed" | "founder-stated";
  evidenceRefs: WovenRef[];
  productRefs?: WovenRef[];
  source?: string | null;
};

export type TerrainHypothesis = {
  id: string;
  stance: "opening" | "tension" | "hypothesis";
  title: string;
  claim: string;
  whyItMatters: string;
  provenance: "inferred" | "speculative";
  evidenceRefs: WovenRef[];
  productRefs: WovenRef[];
  marketRefs: WovenRef[];
  counterEvidenceRefs: WovenRef[];
  unknown: string | null;
  falsifier: string | null;
  suggestedMove: {
    title: string;
    intendedEffect: string;
    measurementIntent: string | null;
  } | null;
  crewRefs: WovenRef[];
};

export type TerrainView = {
  schemaVersion: 1;
  projectId: string;
  generatedAt: string;
  state: { kind: "ready" | "partial" | "empty"; stale: boolean; issues: TerrainIssue[] };
  product: {
    projectRef: WovenRef;
    repository: { path: string | null; winEvent: string | null };
    truths: TerrainObservation[];
    modelRef: WovenRef | null;
  };
  hypotheses: TerrainHypothesis[];
  questions: WovenRef[];
  moves: WovenRef[];
  outcomes: WovenRef[];
  implications: WovenRef[];
  crew: WovenRef[];
  relationships: WovenCanvasRelationship[];
  geometry: WovenCanvas["geometry"];
};

export type TerrainRead = {
  schemaVersion: 1;
  id: string;
  projectId: string;
  generatedAt: string;
  inputFingerprint: string;
  runtime: { id: string; model: string | null };
  hypotheses: TerrainHypothesis[];
};

export type TerrainCrewPosition = {
  id: string;
  participantRef: string;
  claim: string;
  uncertainty: string | null;
  recommendation: string | null;
  falsifier: string | null;
  evidenceRefs: WovenRef[];
  disagreesWith: string[];
};

export type TerrainCrewRead = {
  schemaVersion: 1;
  projectId: string;
  hypothesisRef: WovenRef;
  generatedAt: string;
  runtime: { id: string; model: string | null };
  positions: TerrainCrewPosition[];
};
// Anchor kinds the backend emits: "product" | "product-truth" | "product-model" | "product-<element>" |
// "teammate" | "question" | "pipeline" | "path" | "run" | "founder-decision" | "pinned-signal" |
// "outcome" (and, forward-compatibly, "product-implication"/"implication" once the backend adds them).
export type WovenCanvasAnchor = {
  id: string;                 // "anchor:<type>:<id>"
  ref: WovenRef;
  kind: string;               // open string — never a closed enum
  label: string;
  body: unknown;              // the authoritative record (question, outcome, product-truth, …)
  facets?: Record<string, unknown>;
  capabilities?: Record<string, boolean>;
  authority: { owner: string; id: string; projectId: string; revision?: number; updatedAt: string | null };
};
export type WovenCanvasRelationship = {
  id: string;
  source: WovenRef;
  target: WovenRef;
  kind: string;               // "returns-to" | "serves" | "involves" | "about" | "contributed-to" | …
  label?: string;
  resolved: boolean;
  receipt?: unknown;
  capabilities?: Record<string, boolean>;
  disposition?: "proposed" | "accepted";
  authority: { owner: string; id?: string; projectId: string; revision?: number; updatedAt?: string | null };
};
export type WovenGoalConflict = {
  id: string;
  kind: "shared-object";
  objectRef: WovenRef;
  goalRefs: WovenRef[];
  goalCount: number;
  status: "needs-founder" | "resolved";
  blocking: false;
  summary: string;
  detail: string;
  provenance: "derived";
  basis: unknown[];
  resolution?: import("@/openCanvasTypes").GoalConflictDecision;
};
// The canonical joined-outcome projection carried on the canvas (brain/src/woven-graph.mjs → projectCanvas
// `outcomes`). Its fields are AUTHORITATIVE — kind/channelId/lineage are computed by the backend; the UI
// consumes them verbatim rather than re-deriving from anchors + relationships.
export type WovenCanvasOutcome = {
  id: string;
  ref: WovenRef;
  body: string | null;
  kind: JoinedOutcome["kind"];   // outcomeDisplayKind — the backend's own classification
  label: string;
  status?: string;
  outcomeKind?: string | null;
  value?: number | null;
  observedAt?: string | null;
  channelId?: string | null;     // the pipeline it returns to (item.channel) — preserved exactly
  questionId?: string | null;
  productRefs?: string[];         // already flattened to ids by the backend
  crewRefs?: string[];
  runId?: string | null;
  authority?: unknown;
  lineage?: unknown;             // runRef / pathRef / questionRef / productRefs / … — preserved verbatim
};
// The canonical product-implication projection (projectCanvas `implications`).
export type WovenCanvasImplication = {
  id: string;
  ref: WovenRef;
  body: string | null;
  text: string;
  status: "proposed" | "staged";
  observedAt?: string | null;
  sourceOutcomeId?: string | null;
  questionId?: string | null;
  productRefs?: string[];
  disposition: "proposed" | "accepted";
  // The server-derived review descriptor (brain woven-graph → implications[].review). Preserved for
  // status/display/dedupe ONLY — it is never client-executable authority; the accept route derives the
  // real graph target and operations server-side and rejects any client graphId/operations.
  review?: unknown;
  authority?: unknown;
  lineage?: {
    questionRef?: WovenRef | null;
    productRefs?: WovenRef[];
    participantRefs?: WovenRef[];
    decisionRefs?: WovenRef[];
    proposalRef?: { type: string; id: string } | null;
    // Typed pipeline/graph the backend will review the change against — display/dedupe only, not executable.
    pipelineRef?: WovenRef | null;
    graphRef?: WovenRef | null;
    attribution?: unknown;
  };
};

export type WovenCanvas = {
  anchors: WovenCanvasAnchor[];
  relationships: WovenCanvasRelationship[];
  regions?: Array<{
    id: string;
    projectId: string;
    title: string;
    purpose?: string | null;
    memberRefs: WovenRef[];
    position: { x: number; y: number };
    size: { width: number; height: number };
    collapsed: boolean;
    founderPlaced: boolean;
    revision: number;
    archivedAt?: string;
  }>;
  conflicts?: WovenGoalConflict[];
  // The canonical joined outcomes + product implications, computed by the backend. Present on the current
  // projection; when absent (an older server) the UI falls back to reading the anchor bodies.
  outcomes?: WovenCanvasOutcome[];
  implications?: WovenCanvasImplication[];
  state: { kind: "empty" | "partial" | "ready"; stale: boolean; issues: unknown[] };
          geometry: {
    namespace: string;
    revision: number;
    positions: Record<string, { x: number; y: number }>;
    collapsedGroups?: unknown[];
    pinnedCrew?: unknown[];
    viewport?: unknown;
    updatedAt?: string | null;
  } | null;
};

// The canonical backend question body carried on a "question" anchor (brain/src/clarity-store.mjs →
// projectQuestions). The UI normalizes this into what QuestionFocus renders.
export type CanvasQuestionBody = {
  id: string;
  kind?: "question";
  text: string;
  note?: string;
  status?: "open" | "answered" | "archived";
  createdAt?: string;
  updatedAt?: string;
  pinned?: boolean;
  positions?: CanvasPosition[];
  relevantParticipantRefs?: WovenRef[];
  participantRefs?: WovenRef[];
  productRefs?: WovenRef[];
  evidenceRefs?: WovenRef[];
  backlinks?: WovenRef[];
};

// A teammate's attributable position on a question — the REAL backend shape (normalizePosition):
// participantRef is a `{type,id}` ref (its id is the teammate ref), and the belief is `statement`.
export type CanvasPosition = {
  id: string;
  questionId: string;
  participantRef?: WovenRef;
  statement: string;
  relation?: string;          // stance, e.g. "supporting" / "challenging" — open string
  uncertainty?: string | null;
  unknowns?: string[] | string | null;
  recommendation?: string | null;
  falsifier?: string | null;
  evidenceRefs?: WovenRef[];
  provenance?: string | null;
  createdAt?: string | null;
};

// The canonical backend product-implication (brain/src/gtm-store.mjs → productImplicationProjection).
export type CanvasImplicationBody = {
  id: string;
  kind: "product-change";
  status: "proposed" | "staged";
  body: string;               // the implication text, in plain words
  sourceOutcomeId: string;
  sourceLearningId?: string | null;
  questionId?: string | null;
  productRefs?: WovenRef[];
  participantRefs?: WovenRef[];
  proposalRef?: { type: string; id: string } | null;
  observedAt?: string | null;
  graphId?: string | null;    // present only when the backend attaches the target graph
  operations?: unknown[];     // present only when the backend attaches reviewable product-change ops
};

export type WovenGraph = {
  projectId: string;
  objectNodes: WovenObjectNode[];
  ties: WovenTie[];
  kindClusters: WovenKindCluster[];
  laneKinds: Record<string, string[]>;              // laneKey → every kind it belongs to (2+ = blended)
  collapsedByLane: Record<string, { count: number; objectKeys: string[] }>;
  // The stable-anchor canvas projection, attached by the backend alongside the object/tie weaving.
  // Additive: when absent the UI degrades to raw clarity/records; when present it is the canonical source.
  canvas?: WovenCanvas | null;
  stats: {
    objectCount: number; drawnObjectCount: number; collapsedObjectCount: number;
    tieCount: number; drawnTieCount: number; kindCount: number;
  };
};

export type OperatingView = {
  projectId: string;
  // Real lanes first (running / parked / idle), then proposed plan lanes. The lens keeps this order but
  // the founder can reorder (drag-organize moved here from the old merged-lane overview).
  lanes: OperatingLane[];
  // The shared map: every touched object once, with ties to the lanes that touched it.
  objects: OperatingObject[];
  // The pending founder decisions across the fleet — the same rows getPendingInbox returns, so the lens
  // can pulse the right lane and route a click to the real gate.
  pending: PendingDecision[];
  // Whether the plan lanes are older than the last scan (Area 4's staleness flag) — the lens shows a
  // quiet "plan older than your last scan" marker, never auto-refreshes.
  planStale?: boolean;
  generatedAt: string;
  // The woven projection over the same lanes + objects (docs/INTERTWINED-CANVAS.md §2). Present when the
  // backend could build it; absent → the canvas degrades to the raw lanes/objects.
  woven?: WovenGraph | null;
  // ── Canvas projection enrichment (docs/production-direction/04, 06, 07). All optional and additive —
  // the current server omits them and every consuming surface degrades to an honest empty state. These
  // are projections/references over existing truth, run, feedback, clarity, and outcome authorities,
  // never new stored bodies on the client. Populated as the parallel backend projection work lands.
  //
  // Founder-pinned questions as durable canvas anchors (the clarity record, extended). Unpinned/
  // transient crew questions stay run artifacts and never appear here.
  questions?: ClarityObject[];
  // Joined outcomes that returned toward a run/question/product/crew (doc 07 §Outcome return).
  outcomes?: JoinedOutcome[];
  // Model-proposed product implications awaiting the founder's accept/edit/dismiss/defer (doc 06
  // §Product implication). A projection, never an applied change.
  implications?: ProductImplication[];
};

// A joined outcome — references the run/item/path that produced it and returns spatially toward the
// pipeline, question, product element, and contributing crew (doc 07 §Outcome return). Never reports a
// gate approval as market success; an unjoined signal stays explicitly unattributed.
export type JoinedOutcome = {
  id: string;
  // What class of outcome this is — kept honest and distinct (doc 07 §Measurement).
  kind: "sent" | "observed-response" | "product-activation" | "business-outcome" | "founder-entered" | "unmeasured";
  label: string;               // plain-words summary of what came back
  value?: number | null;
  observedAt?: string | null;
  channelId?: string | null;   // the pipeline it returns to
  questionId?: string | null;  // the question it reopens, when any
  productRefs?: string[];       // product-model elements it touches
  crewRefs?: string[];          // teammates it credits
  runId?: string | null;
};

// A product implication: a model-owned hypothesis over an outcome/signal, initially unaccepted. On the
// canvas it begins as a dashed proposed return edge from the outcome to the affected product truth.
// Accepting it stages a founder-reviewable product-change pipeline; it never silently edits code.
export type ProductImplication = {
  id: string;
  text: string;                // the hypothesis, in plain words
  sourceOutcomeId?: string | null;
  productRefs?: string[];
  questionId?: string | null;
  disposition?: "proposed" | "accepted" | "edited" | "dismissed" | "deferred";
  // Raw backend status ("proposed" | "staged") and the server-derived review descriptor, preserved for
  // display/status/dedupe. NEVER executable client authority: the accept route is fully server-derived.
  status?: "proposed" | "staged";
  review?: unknown;
};
