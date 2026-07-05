import type {
  ConnectorMeta, Decisions, EngineState, GTMGraph, GTMProject, GTMRunResult,
  OperatorSession, OperatorSessionSummary,
  ScanPreview,
  ProjectSummary,
  ContextManifest, GtmLibrary,
  GraphOperation, GTMContractAudit,
  ProductModel, ProductModelEdit,
  CapabilityServer, Person, CrossReferenceResult, ToolRegistryView, RegisteredTool, ChannelFeed, DirectedFeed,
  ClarityObject, ClarityKind, Me, Team, TeamMember, TeamRole, BoardView,
  ChannelMeta, Input, ObjectGraphView, GTMItem,
} from "@/types";
import { identityHeaders } from "@/lib/identity";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...identityHeaders() },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((payload as { error?: string }).error || `${path} failed (${res.status}).`);
  return payload;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { ...identityHeaders() } });
  if (!res.ok) throw new Error(`${path} failed (${res.status}).`);
  return res.json() as Promise<T>;
}

// ── Engine OS ───────────────────────────────────────────────────────────────
export const getEngineState = (channelId?: string) =>
  get<{ engine: EngineState }>(`/api/engine${channelId ? `?channel=${encodeURIComponent(channelId)}` : ""}`);

// ── Context substrate (the multiplier, made visible) ──────────────────────────
export const getContext = (channelId?: string) =>
  get<{ channelId: string; manifest: ContextManifest; text: string }>(
    `/api/context${channelId ? `?channel=${encodeURIComponent(channelId)}` : ""}`
  );

// ── The library — subagents and skills on disk (parts of GTM engineering) ─────
export const getLibrary = () => get<GtmLibrary>("/api/library");

// ── Funnel ──────────────────────────────────────────────────────────────────
// The front-door scan preview: read the product, hand back the headline / stack / detected win event
// (with its file:line evidence) and an honest blind-attribution callout — what the founder sees BEFORE
// committing a goal. Returns the lightweight preview shape; degrades if the backend omits a field.
export const scanPreview = (repoPath: string, winEvent?: string) =>
  post<ScanPreview>("/api/scan", { repoPath, ...(winEvent ? { winEvent } : {}) });

// Native folder picker — the local server pops the OS folder dialog and returns the real path.
export const pickFolder = () =>
  post<{ path?: string; cancelled?: boolean; unsupported?: boolean; error?: string }>("/api/pick-folder", {});

// ── Connector registry ──────────────────────────────────────────────────────
export const getConnectors = () =>
  get<{ connectors: ConnectorMeta[] }>("/api/connectors");

// ── Capabilities (external MCP servers) ──────────────────────────────────────
export const getCapabilities = () =>
  get<{ servers: CapabilityServer[] }>("/api/capabilities");

export const connectCapability = (input: {
  id?: string; name: string; url?: string; trust?: string; demo?: boolean;
  command?: string; args?: string[]; tools?: { name: string; description?: string; annotations?: Record<string, unknown> }[];
}) => post<{ server: CapabilityServer }>("/api/capabilities/connect", input);

// Reclassify a tool across the wall. Loosening (write→read) needs confirm:true, or the
// server answers 409 with needsConfirm so the UI can ask deliberately.
export const reclassifyCapabilityTool = (serverId: string, tool: string, lane: "read" | "write", confirm = false) =>
  post<{ server: CapabilityServer; loosenedWall: boolean }>(
    `/api/capabilities/${encodeURIComponent(serverId)}/reclassify`, { tool, lane, confirm },
  );

export const removeCapability = (serverId: string) =>
  fetch(`/api/capabilities/${encodeURIComponent(serverId)}`, { method: "DELETE" })
    .then((r) => r.json() as Promise<{ servers: CapabilityServer[] }>);

// ── GTM Graph (DAG — zoom 3) ────────────────────────────────────────────────
export const getGraphTemplate = (channelId?: string) =>
  get<{ graph: GTMGraph; runs?: GTMRunResult[] }>(
    `/api/graph/template${channelId ? `?channel=${encodeURIComponent(channelId)}` : ""}`,
  );

export const saveGraph = (graph: GTMGraph) =>
  post<{ graph: GTMGraph; savedAt: string }>("/api/graph/save", { graph });

export const applyGraphOperations = (graph: GTMGraph, operations: GraphOperation[]) =>
  post<{ graph: GTMGraph; changes: Array<{ type: string; detail: string }> }>(
    "/api/graph/operations",
    { graph, operations },
  );

export const auditGraph = (graph: GTMGraph, runResult?: GTMRunResult | null) =>
  post<{ audits: Record<string, GTMContractAudit> }>("/api/graph/audit", { graph, runResult });

// ── Artifacts — subagents & skills as real, fully-editable .md files ─────────
export type ArtifactType = "agent" | "skill";
type ArtifactFile = {
  type: ArtifactType; ref: string; exists: boolean; content: string; meta: Record<string, string>;
};

export const getArtifact = (type: ArtifactType, ref: string) =>
  get<ArtifactFile>(`/api/artifact?type=${type}&ref=${encodeURIComponent(ref)}`);

export const saveArtifact = (type: ArtifactType, ref: string, content: string) =>
  post<{ ok: boolean; type: ArtifactType; ref: string; path: string }>(
    "/api/artifact/save", { type, ref, content },
  );

export const runGraph = (
  graph: GTMGraph,
  options: {
    targetNodeId?: string;
    approvals?: Record<string, boolean>;
    decisions?: Decisions;
    resumeRunId?: string;
  } = {},
) => post<GTMRunResult>("/api/graph/run", { graph, ...options });

// Streaming run events — one per step, so the flow animates and content reveals live.
type RunStreamEvent =
  | { type: "run_start"; nodeIds: string[] }
  | { type: "node_start"; nodeId: string; category?: string; kind?: string; label?: string }
  | { type: "node_done"; nodeId: string; result: GTMRunResult["nodes"][string] }
  | { type: "run_done"; result: GTMRunResult }
  | { type: "run_error"; error: string };

// Run the graph over SSE, calling onEvent for each step. Returns when the stream ends.
export async function runGraphStream(
  graph: GTMGraph,
  options: { targetNodeId?: string; approvals?: Record<string, boolean>; decisions?: Decisions; resumeRunId?: string },
  onEvent: (event: RunStreamEvent) => void,
): Promise<void> {
  const res = await fetch("/api/graph/run/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, ...options }),
  });
  if (!res.ok || !res.body) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Run stream failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) {
        try { onEvent(JSON.parse(line.slice(6)) as RunStreamEvent); } catch { /* skip malformed frame */ }
      }
    }
  }
}

// ── Durable resident operator ────────────────────────────────────────────────
export const listOperatorSessions = (projectId?: string) =>
  get<{ sessions: OperatorSessionSummary[] }>(
    `/api/operator/sessions${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`,
  );

// Scope the read to the project the canvas is showing — the backend rejects (409) a session that does
// not belong to that project, which is what lets the composer lock to the project with no drift band-aid.
export const getOperatorSession = (sessionId: string, projectId?: string) =>
  get<{ session: OperatorSession }>(
    `/api/operator/sessions/${sessionId}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`,
  );

// One durable conversation per project. `reuse: true` returns the project's live (non-terminal) thread
// when one exists (`reused: true`) instead of spawning a parallel session, and only creates a fresh one
// (`reused: false`) when there is none — so the dock can only ever talk about the project on screen.
// `fresh: true` (the "New channel" action) starts an unbound session so it composes an ADDITIONAL
// pipeline for the product instead of re-driving the active one.
export const createOperatorSession = (projectId: string, goal: string, graphId?: string, fresh?: boolean) =>
  post<{ session: OperatorSession; reused: boolean }>("/api/operator/sessions", {
    projectId, reuse: !fresh, goal, graphId: fresh ? undefined : graphId, fresh,
  });

export const resumeOperatorSession = (sessionId: string, projectId: string, input: string) =>
  post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/resume`, { projectId, input });

export const resolveOperatorGate = (
  sessionId: string,
  projectId: string,
  payload: { approvals?: Record<string, boolean>; decisions?: Decisions },
) => post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/gate`, { projectId, ...payload });

export const cancelOperatorSession = (sessionId: string, projectId: string) =>
  post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/cancel`, { projectId });

// Accept or discard a graph change the operator staged for review (the on-canvas ghost proposal). An
// optional note rides along — a reject note is a redirect (Claude changes it), an accept note a quiet
// annotation the operator reads and the learning loop can later pick up.
export const resolveOperatorProposal = (sessionId: string, projectId: string, accept: boolean, note?: string) =>
  post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/proposal`, { projectId, accept, note });

// The founder resolves an ideate pause: kill the weak ideas, pick the strong ones to build. A FOUNDER
// act — the operator generated the ideas but never decides which become work. Picking resumes the
// operator to build each kept idea through its pre-wired compose_and_run (and wires it back to the idea
// so the run's outcome closes the loop); killing banks an IdeaKill the next ideation round learns from.
export const resolveOperatorIdeas = (
  sessionId: string,
  projectId: string,
  payload: { build?: string[]; kill?: string[]; mode?: "directions" | "build" },
) => post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/ideas`, { projectId, ...payload });

// The founder picks one of the candidate pipeline shapes an ambiguous goal produced. A FOUNDER act:
// the operator sketched the candidates but never ran them — this resumes it to build the chosen shape
// through the existing compose_and_run, still stopping at the founder gate. `pick` is the candidate id.
export const resolveOperatorCandidates = (
  sessionId: string,
  projectId: string | undefined,
  pick: string,
) => post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/candidates`, { projectId, pick });

// ── The outcome door — record what actually happened ──────────────────────────
// After the gate releases work, the founder records the real result (a reply, a meeting, a purchase)
// keyed off the staged item's joinKey. The server joins it back to the run + path that produced it and
// lands a Result the outcome report then reads. This records what ALREADY happened — it never sends,
// publishes, or runs anything, so the wall is untouched. `source` defaults to a founder-entered note.
export const recordOutcome = (
  projectId: string,
  outcome: { joinKey: string; outcomeKind: string; value?: number | null; source?: string; observedAt?: string },
) => post<{ result: { id: string; joinKey: string; outcomeKind: string | null }; joined: boolean }>(
  `/api/projects/${encodeURIComponent(projectId)}/outcomes`,
  outcome,
);

// ── Living Product Picture — the founder-editable interpretation aggregate ─────
// Read the current projected model; edits persist through the three domain commands (NOT a raw
// sharedContext patch), which is what keeps the picture on its own append-only event log so edits
// accumulate and version instead of overwriting.
export const getProductModel = () =>
  get<{ productModel: ProductModel | null }>("/api/product-model");

// First-draft generation — the server injects the live createClaudeProductModeler generator.
export const deriveProductModel = () =>
  post<{ productModel: ProductModel | null }>("/api/product-model/derive", {});

// A founder edit (or an accepted re-derivation): the editable bags are whitelisted, version bumps,
// the lineage is preserved. Re-fetch after to reflect the new version.
export const reviseProductModel = (edit: ProductModelEdit) =>
  post<{ productModel: ProductModel | null }>("/api/product-model/revise", edit);

// The "living" stroke: pin an already-persisted FeedbackSignal onto a specific element.
// ── Connection status — is a live Claude available for compose/ideate/operator ──
export type ConnectionStatus = { connected: boolean; label: string | null; reason: string | null };
export const getConnection = () => get<ConnectionStatus>("/api/connection");


// ── Project (channels list) ──────────────────────────────────────────────────
export async function getProject(): Promise<{ project: GTMProject }> {
  const res = await fetch("/api/project");
  if (!res.ok) throw new Error("Project endpoint not available");
  return res.json() as Promise<{ project: GTMProject }>;
}

export const listProjects = () =>
  get<{ activeProjectId: string | null; projects: ProjectSummary[] }>("/api/projects");

export const createProject = (input: { name?: string; repoPath: string; outcome: string }) =>
  post<{ project: GTMProject; activeProjectId: string }>("/api/projects", input);

export const activateProject = (projectId: string) =>
  post<{ project: GTMProject; activeProjectId: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/activate`,
    {},
  );

// One project per repo. Remove a duplicate (purges its stores) or fold several into one (no record
// lost). Both return the refreshed project list so the switcher re-renders.
export async function deleteProject(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
  const payload = (await res.json().catch(() => ({}))) as { activeProjectId?: string | null; projects?: ProjectSummary[]; error?: string };
  if (!res.ok) throw new Error(payload.error || `Delete failed (${res.status}).`);
  return payload as { activeProjectId: string | null; projects: ProjectSummary[] };
}

// ── People — the keystone shared object (read-only; promoted from real runs) ──
export const listPeople = (projectId: string) =>
  get<{ projectId: string; people: Person[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/people`,
  );

// ── Clarity — the durable residue of an Ideate (thinking-posture) conversation ──
export const getClarity = (projectId: string) =>
  get<{ items: ClarityObject[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/clarity`,
  );

export const addClarity = (projectId: string, kind: ClarityKind, text: string, note?: string) =>
  post<{ item: ClarityObject }>(
    `/api/projects/${encodeURIComponent(projectId)}/clarity`,
    { kind, text, note },
  );

export const removeClarity = async (projectId: string, itemId: string): Promise<{ ok: boolean }> => {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/clarity/${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
  );
  return res.json();
};

// ── Channel feeds — undirected links between channels that share real entities ──
export const getChannelFeeds = (projectId: string) =>
  get<{ feeds: ChannelFeed[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/channel-feeds`,
  );

// ── Directed feeds — founder-drawn links where one channel pulls another's output ──
export const getDirectedFeeds = (projectId: string) =>
  get<{ feeds: DirectedFeed[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/directed-feeds`,
  );

// Wire `channelId`'s source to pull from `sourceChannelId` (drag-to-connect on the engine canvas).
export const deriveChannelFrom = (channelId: string, sourceChannelId: string) =>
  post<{ ok: boolean; channelId: string; sourceChannelId: string; sourceNodeId: string }>(
    `/api/channels/${encodeURIComponent(channelId)}/derive`,
    { sourceChannelId },
  );

export const getPerson = (projectId: string, personId: string) =>
  get<{ projectId: string; person: Person }>(
    `/api/projects/${encodeURIComponent(projectId)}/people/${encodeURIComponent(personId)}`,
  );

// ── GTM Board — the nine belief layers, a pure read of real state ──────────────
export const getBoard = (projectId: string) =>
  get<BoardView>(`/api/projects/${encodeURIComponent(projectId)}/board`);

export const getObjectGraph = (projectId: string) =>
  get<ObjectGraphView>(`/api/projects/${encodeURIComponent(projectId)}/object-graph`);

// Apply typed, validated graph mutations (add / promote / update / retire a block). The host normalizes
// each op, re-asserts the Wall, saves, and hands back the refreshed graph + recommendation — the same
// shape getObjectGraph returns, so callers can drop the response straight back into the canvas. Used by
// drag-to-create: dropping a block posts a single `add_node` op for a fresh loose card Claude can fill.
export type ObjectGraphNodeOperation = {
  type: "add_node";
  node: {
    id?: string;
    // Optional: a loose (draft) card can be genuinely untyped — the backend only requires a type on
    // typed/execution/outcome nodes. Drag-to-create always passes a palette type; an ideated draft may
    // land with none until the founder types it.
    type?: string;
    domain?: string;
    maturity?: "loose" | "typed" | "execution" | "outcome";
    statement: string;
    origin?: string;
    payload?: Record<string, unknown>;
  };
};
// A provenance link joining two cards (source → target). Every edge carries a `basis` receipt (the
// server rejects a basis-less edge), so a founder-drawn join records why it exists, in plain words.
export type ObjectGraphEdgeOperation = {
  type: "add_edge";
  edge: {
    id?: string;
    source: string;
    target: string;
    type: string;
    status?: string;
    basis?: { ref: string; preview?: string; kind?: string }[];
    confidence?: number;
    label?: string;
  };
};
export type ObjectGraphOperation = ObjectGraphNodeOperation | ObjectGraphEdgeOperation;
export const applyObjectGraphOperations = (
  projectId: string,
  operations: ObjectGraphOperation[],
) => post<{ projectId: string; changes: { type: string; detail: string }[] } & ObjectGraphView>(
  `/api/projects/${encodeURIComponent(projectId)}/object-graph`,
  { operations },
);

// Per-card ideation: given a source card and a plain target ("triggers", "messages"), the server runs
// the SAME live grounded Claude generator the /ideas/round route uses and hands back a few decidable
// candidate cards. Persists nothing — a candidate becomes a real draft card only when the founder adds
// it (via applyObjectGraphOperations above). Each candidate is a founder-language statement plus the
// object type the target (or the idea's own words) implies (null is fine — a loose, untyped draft).
export type ObjectCandidate = { id: string; statement: string; type: string | null; rationale: string | null };
export const ideateObjectCandidates = (
  projectId: string,
  body: { target: string; sourceNodeId?: string },
) => post<{ candidates: ObjectCandidate[] }>(
  `/api/projects/${encodeURIComponent(projectId)}/object-graph/ideate`,
  body,
);

// ── The five-primitive cockpit — Goal, Bet, Move, Run, Learning, all in founder language ───────────
// Derived read-only from real state; every part is honest-empty (null / []) where there is no signal,
// and bestMove is null when there is not enough signal to name one. "How sure we are" is the four-word
// solidity scale (guessed / researched / observed / gated); the move-proposal evidence scale is the
// three market-evidence words (no "gated").
export type Solidity = "guessed" | "researched" | "observed" | "gated";
export type Sureness = "low" | "medium" | "high";

export type CockpitBet = {
  statement: string;
  solidity: Solidity;
  sure: Sureness;
  basis: string | null;
};

export type CockpitState = {
  goal: { text: string; metric: string | null; target: string | null; timeframe: string | null } | null;
  bets: CockpitBet[];
  bestMove: {
    headline: string;
    why: string;
    doToday: string;
    winIf: string;
    killIf: string;
    upgrade: string;
  } | null;
  latestRun: {
    sent: number | null;
    replies: number | null;
    calls: number | null;
    paid: number | null;
    revenue: number | null;
    note: string | null;
  } | null;
  learnings: { statement: string; sure: Sureness; action: string | null }[];
  upgrades: string[];
};

export type MoveProposal = {
  statement: string;
  bet: string;
  evidence: "guessed" | "researched" | "observed";
  risk: string;
  action: string;
};

export const getCockpit = (projectId: string) =>
  get<{ state: CockpitState }>(`/api/projects/${encodeURIComponent(projectId)}/cockpit`);

export const getMoves = (projectId: string) =>
  get<{ moves: MoveProposal[] }>(`/api/projects/${encodeURIComponent(projectId)}/moves`);

// Record what actually happened on a run, in the founder's own words. `happened` is a plain label
// (optionally an object with a count); `learned` is the lesson. Writes a Result + Learning; never sends.
// Named distinctly from recordOutcome (the joinKey-keyed result above) — this is the founder's plain
// post-run "what happened / what did we learn" loop-closer.
export const recordFounderOutcome = (
  projectId: string,
  body: { runId?: string | null; happened: string | { label: string; count?: number }; learned?: string },
) => post<{ ok: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/outcome`, body);

// The agent's face — what a teammate has BECOME, all derived from real run history. A fresh agent
// reads honestly (hasRuns false, "no runs yet"), never a fabricated number.
export type AgentLearning = {
  hasRuns: boolean;
  runCount: number;
  counts: { approved: number; rejected: number; edits: number };
  lastEdits: { from: string; to: string }[];
  voice: string;
  note: string | null;
};
export const getAgentLearning = (projectId: string, ref: string) =>
  get<{ profile: AgentLearning }>(
    `/api/projects/${encodeURIComponent(projectId)}/agents/${encodeURIComponent(ref)}/profile`,
  );

// The bench — the whole roster as one lens over the run ledger. Each row is the compact face of an
// agent's real track record; a never-run agent reads honestly (hasRuns false, "no runs yet"). The
// profile sheet still fetches the full record (edits + voice) on click.
export type AgentBenchRow = {
  ref: string;
  job: string;
  hasRuns: boolean;
  runCount: number;
  counts: { approved: number; rejected: number; edits: number };
  note: string | null;
};
export const getAgentBench = (projectId: string) =>
  get<{ bench: AgentBenchRow[] }>(`/api/projects/${encodeURIComponent(projectId)}/bench`);

// The market picture, built one layer at a time. researchMarketLayer returns a spread of real
// alternatives for the NEXT buyer facet, grounded in what's already settled — and persists nothing.
// The founder picks (or writes) one; saveMarketObject commits just that one to the graph.
export type MarketCandidate = {
  kind: string;
  statement: string;
  solidity?: string | null;
  declaredSolidity?: string | null;
  evidence?: unknown[];
  [k: string]: unknown;
};
export const researchMarketLayer = (projectId: string, kind?: string | null, upstream?: unknown[]) =>
  post<{ projectId: string; ok: boolean; kind: string; candidates: MarketCandidate[]; count: number; meta: { connected?: boolean } & Record<string, unknown> }>(
    `/api/projects/${encodeURIComponent(projectId)}/market-layer`,
    { kind: kind ?? null, ...(upstream ? { upstream } : {}) },
  );
export const saveMarketObject = (projectId: string, object: MarketCandidate) =>
  post<{ projectId: string; object: MarketCandidate }>(
    `/api/projects/${encodeURIComponent(projectId)}/market-object`,
    { object },
  );

// Persist the founder's canvas layout (per-project sidecar keyed by node id — projection state,
// never knowledge). Merged server-side, so partial position maps are fine.
export const saveObjectGraphPositions = (
  projectId: string,
  positions: Record<string, { x: number; y: number }>,
) => post<{ ok: boolean }>(
  `/api/projects/${encodeURIComponent(projectId)}/object-graph/positions`,
  { positions },
);

// The compiled run and its staged gate. `gate.items` each wrap the raw staged item under `.item` (which
// carries a stable `gtmActionId`), plus a stable `actionId` and its current approval status.
type CompiledRun = { id: string; status: string; gateState?: { status?: string } };
export type CompiledGate = {
  runId: string | null;
  status: string;
  awaitingReview: number;
  measurementWeakness?: unknown;
  items: Array<{ actionId: string; joinKey: string | null; approvalStatus: string; item: GTMItem }>;
};

export const compileObjectGraphPath = (
  projectId: string,
  input: { pathId?: string; runPlan?: Record<string, unknown>; input?: Record<string, unknown>; output?: Record<string, unknown> },
) => post<{ projectId: string; run: CompiledRun; gate: CompiledGate; measurementWeakness?: unknown; runPlan?: unknown }>(
  `/api/projects/${encodeURIComponent(projectId)}/object-graph/compile`,
  input,
);

// Approve a staged compiled run at the founder gate: the per-item decisions release it through the same
// engine, staging the approved items locally. Nothing sends. Returns the resolved run + refreshed gate.
export const approveRun = (
  projectId: string,
  runId: string,
  decisions: Record<string, { decision: "approve" | "reject"; editedDraft?: string }>,
) => post<{ projectId: string; run: CompiledRun; gate: CompiledGate; ok: boolean; pendingGates: string[] }>(
  `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/approve`,
  { decisions },
);

// ── The rebuilt GTM-engine rituals the founder invokes on the active project ──
// "Where does X appear across channels" — the cross-reference / find-references query for a
// person / icp / claim / experiment.
export const findReferences = (
  projectId: string,
  kind: "person" | "icp" | "claim" | "experiment",
  id?: string,
) => {
  const params = new URLSearchParams({ kind });
  if (id) params.set("id", id);
  return get<CrossReferenceResult>(
    `/api/projects/${encodeURIComponent(projectId)}/references?${params.toString()}`,
  );
};

// ── Self-built tools — the founder-gated tool-birth → registry leg ─────────────
// Pending proposals are deterministic procedures crystallized from repeated runs (gated, never
// auto-born); registered tools are the callable ones a founder has approved.
export const getToolProposals = (projectId: string) =>
  get<ToolRegistryView>(`/api/projects/${encodeURIComponent(projectId)}/tool-proposals`);

// Birth a tool from a pending proposal — a FOUNDER action. Requires authored code + a test; the
// server gate refuses anything else.
export const approveToolBirth = (
  projectId: string,
  proposalId: string,
  body: { code: string; test: string; name?: string; description?: string; decisionNote?: string },
) =>
  post<{ tool: RegisteredTool; registry: unknown; alreadyRegistered: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/tool-proposals/${encodeURIComponent(proposalId)}/approve`,
    body,
  );

export const setActiveWorkflow = (workflowId: string) =>
  post<{ activeWorkflowId: string; activeChannelId?: string }>("/api/project/active-workflow", { workflowId });

// ── Identity + teams — the team space, members, and the release authority ──────
// Who am I and which teams am I in (personal team always exists). Identity rides on request headers
// from lib/identity; the server defaults to the founder when none are stamped.
export const getMe = () => get<Me>("/api/me");

export const createTeam = (input: { name: string; members?: Array<{ userId: string; name?: string; email?: string; role?: TeamRole }> }) =>
  post<{ team: Team }>("/api/teams", input);

export const getTeamMembers = (teamId: string) =>
  get<{ members: TeamMember[] }>(`/api/teams/${encodeURIComponent(teamId)}/members`);

export const addTeamMember = (
  teamId: string,
  member: { userId: string; name?: string; email?: string; role?: TeamRole },
) => post<{ team: Team; members: TeamMember[] }>(`/api/teams/${encodeURIComponent(teamId)}/members`, member);

// Whether a user may release a founder gate on a team (owner/approver yes, member/non-member no).
export const canApprove = (teamId: string, userId: string) =>
  get<{ teamId: string; userId: string; canApprove: boolean }>(
    `/api/teams/${encodeURIComponent(teamId)}/can-approve/${encodeURIComponent(userId)}`,
  );

// ── Channel autonomy ladder — the per-channel standing approval (founder-only) ──
// Promote a channel UP the ladder (draft → trusted → autonomous): an explicit founder act that banks a
// `blessedPattern` the gate then auto-applies to clean items while still escalating exceptions.
// Promote refuses "draft" as a target — to drop a channel back, use revoke. The gate node never leaves
// the graph; this is standing approval, never the wall's removal.
export const promoteChannel = (
  projectId: string,
  channelId: string,
  body: { autonomy: "trusted" | "autonomous"; blessedPattern: { note?: string; [key: string]: unknown } },
) =>
  post<{ channel: ChannelMeta }>(
    `/api/projects/${encodeURIComponent(projectId)}/channels/${encodeURIComponent(channelId)}/promote`,
    body,
  );

// Revoke — drop a channel back to "draft" in one call, instantly reverting to hold-everything at the
// gate and clearing the standing pattern. Always available; a founder can pull trust the moment a run
// surprises them.
export const revokeChannel = (projectId: string, channelId: string) =>
  post<{ channel: ChannelMeta }>(
    `/api/projects/${encodeURIComponent(projectId)}/channels/${encodeURIComponent(channelId)}/revoke`,
    {},
  );

// ── Microproduct build-and-ship door — the deployable twin of compose_and_run ───
// A goal in; a read-only producer cuts a working artifact from the real product and the host composes a
// graph whose deploy step sits behind a founder gate. The run STOPS at the gate (pause:true). This call
// NEVER deploys — the live ship happens only when the founder approves at the gate.
export const composeMicroproduct = (projectId: string, body: { goal: string; title?: string }) =>
  post<{ session: OperatorSession; staged: unknown; pause: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/microproduct`,
    body,
  );

// ── Ambient inputs inbox — captured world-signals + the founder's per-input routing ──
// Read the durable, append-only log of "something happened out there" (optionally filtered). The one
// write per item is the founder's decision: route it into a channel, or set it aside. markRouted only
// records the decision — it never runs, sends, or auto-approves.
export const getInputs = (
  projectId: string,
  opts: { status?: string; kind?: string; source?: string } = {},
) => {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.kind) params.set("kind", opts.kind);
  if (opts.source) params.set("source", opts.source);
  const query = params.size ? `?${params.toString()}` : "";
  return get<{ projectId: string; inputs: Input[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/inputs${query}`,
  );
};

export const routeInput = (
  projectId: string,
  body: { inputId: string; routedTo: string } | { inputId: string; ignore: true },
) =>
  post<{ input: Input }>(
    `/api/projects/${encodeURIComponent(projectId)}/inputs/route`,
    body,
  );
