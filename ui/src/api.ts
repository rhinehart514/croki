import type {
  ConnectorMeta, Decisions, EngineState, GTMGraph, GTMProject, GTMRunResult,
  OperatorComparisonGroup, OperatorSession, OperatorSessionSummary,
  ScanPreview,
  ProjectSummary,
  GtmLibrary,
  GraphOperation, GTMContractAudit,
  ProductModel, ProductModelEdit,
  CapabilityServer, CapabilityInventory, SenderCredential, Person, CrossReferenceResult, ChannelFeed, DirectedFeed,
  ClarityObject, ClarityKind, Me, Team, TeamMember, TeamRole, BoardView,
  ChannelMeta, Input, ObjectGraphView, GTMItem, PendingInbox, ReplyAlert, GtmExperiment, OperatingView,
  ProductImplication, TerrainCrewRead, TerrainHypothesis, TerrainRead, TerrainView,
} from "@/types";
import { identityHeaders } from "@/lib/identity";
import type { MotionEfficiencyData } from "@/components/MotionEfficiencyTable";
import type {
  BranchWorkArtifactInput, ChangeGoalStatusInput, CreateGoalInput, CreateGoalRelationInput,
  CreateWorkArtifactInput, CreateWorkRelationshipInput, Goal, GoalListResponse, GoalRelation,
  GoalRelationHistoryResponse, GoalRelationListResponse, IncludeRetiredOptions, RestoreGoalRelationInput, RestoreWorkArtifactInput,
  RestoreWorkRelationshipInput, RestoreGoalInput, RetireGoalInput, RetireGoalRelationInput, RetireWorkArtifactInput,
  RetireWorkRelationshipInput, ReviseGoalInput, ReviseGoalRelationInput, ReviseWorkArtifactInput,
  ReviseWorkRelationshipInput, WorkArtifactHistoryResponse, WorkArtifactListResponse,
  WorkArtifactRevision, WorkRelationshipHistoryResponse, WorkRelationshipListResponse,
  WorkRelationshipRevision,
  ArchiveCanvasRegionInput, CanvasRegion, CanvasRegionListResponse, CreateCanvasRegionInput,
  ReviseCanvasRegionInput, CanvasStructureHistoryEntry, CanvasStructureHistoryMutationInput,
  CanvasStructureHistoryResponse,
  GoalConflictDecision, GoalConflictDecisionListResponse, RecordGoalConflictDecisionInput,
} from "@/openCanvasTypes";

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

async function del<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE", headers: { ...identityHeaders() } });
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((payload as { error?: string }).error || `${path} failed (${res.status}).`);
  return payload;
}

export const getFounderSession = () => get<{ authenticated: boolean }>("/api/founder-session");
export const unlockFounderSession = (code: string) => post<{ authenticated: true }>("/api/founder-session", { code });

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...identityHeaders() },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(payload.error || `${path} failed (${res.status}).`);
  return payload;
}

const projectCollectionPath = (projectId: string, collection: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/${collection}`;

const projectRecordPath = (projectId: string, collection: string, recordId: string, action?: string) =>
  `${projectCollectionPath(projectId, collection)}/${encodeURIComponent(recordId)}${action ? `/${action}` : ""}`;

const withIncludeRetired = (path: string, options?: IncludeRetiredOptions) =>
  options?.includeRetired ? `${path}?includeRetired=true` : path;

// ── Open canvas authorities ─────────────────────────────────────────────────
// Persistence only: these calls cannot approve, release, execute, publish, or otherwise cross the wall.
export const listGoals = (projectId: string, options?: IncludeRetiredOptions) =>
  get<GoalListResponse>(withIncludeRetired(projectCollectionPath(projectId, "goals"), options));

export const getGoal = (projectId: string, goalId: string, options?: IncludeRetiredOptions) =>
  get<{ goal: Goal }>(withIncludeRetired(projectRecordPath(projectId, "goals", goalId), options));

export type ProductChangeReceipt = {
  id: string;
  projectId: string;
  status: "queued" | "building" | "failed" | "declined" | "ready-for-review" | "interrupted";
  title: string;
  provider: string | null;
  model: string | null;
  branch: string | null;
  worktree: string | null;
  baseCommit: string | null;
  capturedAt: string | null;
  safety: string;
  verification: string;
  diff: string | null;
  patchHash: string | null;
  truncated: boolean;
  reviewWorkspaceId: string | null;
  reviewRevisionId: string | null;
  reviewRevision: WorkspaceChangeRevision | null;
};

export const listProductChanges = (projectId: string) =>
  get<{ changes: ProductChangeReceipt[] }>(projectCollectionPath(projectId, "product-changes"));

export const discardProductChange = (projectId: string, receiptId: string) =>
  post<{ change: { id: string; projectId: string; status: "discarded"; discardedAt: string } }>(
    projectRecordPath(projectId, "product-changes", receiptId, "discard"), { confirm: true },
  );

export type ProductChangeProposal = {
  workspaceId: string;
  revision: { id: string; status: "proposed"; diff: string; sourceReceiptId: string; safety: string };
  deduped: boolean;
};

export const stageProductChangeProposal = (projectId: string, receiptId: string) =>
  post<{ proposal: ProductChangeProposal }>(projectRecordPath(projectId, "product-changes", receiptId, "stage"), {});

export const reviewProductChange = (projectId: string, receiptId: string, decision: "approve" | "reject") =>
  post<{ revision: WorkspaceChangeRevision }>(projectRecordPath(projectId, "product-changes", receiptId, "review"), { decision });
export const getProductChangeReadiness = (projectId: string, receiptId: string) =>
  get<{ readiness: WorkspaceApplyReadiness }>(projectRecordPath(projectId, "product-changes", receiptId, "readiness"));
export const applyProductChange = (projectId: string, receiptId: string) =>
  post<{ revision: WorkspaceChangeRevision }>(projectRecordPath(projectId, "product-changes", receiptId, "apply"), { confirm: true });

export type WorkspaceChangeRevision = {
  id: string; status: "proposed" | "approved" | "rejected" | "applying" | "applied" | "reverted" | "failed";
  diff: string; patchHash?: string; sourceReceiptId?: string; safety?: string; summary?: string;
};
export type WorkspaceApplyReadiness = { ready: boolean; reasons: string[]; sameBase: boolean; sourceStatus: string };
export const createGoal = (projectId: string, input: CreateGoalInput) =>
  post<{ goal: Goal }>(projectCollectionPath(projectId, "goals"), input);

export const reviseGoal = (projectId: string, goalId: string, input: ReviseGoalInput) =>
  patch<{ goal: Goal }>(projectRecordPath(projectId, "goals", goalId), input);

export const changeGoalStatus = (projectId: string, goalId: string, input: ChangeGoalStatusInput) =>
  post<{ goal: Goal }>(projectRecordPath(projectId, "goals", goalId, "status"), input);

export const retireGoal = (projectId: string, goalId: string, input: RetireGoalInput) =>
  post<{ goal: Goal }>(projectRecordPath(projectId, "goals", goalId, "retire"), input);

export const restoreGoal = (projectId: string, goalId: string, input: RestoreGoalInput) =>
  post<{ goal: Goal }>(projectRecordPath(projectId, "goals", goalId, "restore"), input);

export const listGoalRelations = (projectId: string, options?: IncludeRetiredOptions) =>
  get<GoalRelationListResponse>(withIncludeRetired(projectCollectionPath(projectId, "goal-relations"), options));

export const createGoalRelation = (projectId: string, input: CreateGoalRelationInput) =>
  post<{ relation: GoalRelation }>(projectCollectionPath(projectId, "goal-relations"), input);

export const reviseGoalRelation = (projectId: string, relationId: string, input: ReviseGoalRelationInput) =>
  patch<{ relation: GoalRelation }>(projectRecordPath(projectId, "goal-relations", relationId), input);

export const retireGoalRelation = (projectId: string, relationId: string, input: RetireGoalRelationInput) =>
  post<{ relation: GoalRelation }>(projectRecordPath(projectId, "goal-relations", relationId, "retire"), input);

export const getGoalRelation = (projectId: string, relationId: string, options?: IncludeRetiredOptions) =>
  get<{ relation: GoalRelation }>(withIncludeRetired(projectRecordPath(projectId, "goal-relations", relationId), options));

export const getGoalRelationHistory = (projectId: string, relationId: string) =>
  get<GoalRelationHistoryResponse>(projectRecordPath(projectId, "goal-relations", relationId, "history"));

export const restoreGoalRelation = (projectId: string, relationId: string, input: RestoreGoalRelationInput) =>
  post<{ relation: GoalRelation }>(projectRecordPath(projectId, "goal-relations", relationId, "restore"), input);

export const listCanvasRegions = (projectId: string, options?: IncludeRetiredOptions) =>
  get<CanvasRegionListResponse>(withIncludeRetired(projectCollectionPath(projectId, "canvas-regions"), options));

export const getCanvasRegion = (projectId: string, regionId: string, options?: IncludeRetiredOptions) =>
  get<{ region: CanvasRegion }>(withIncludeRetired(projectRecordPath(projectId, "canvas-regions", regionId), options));

export const createCanvasRegion = (projectId: string, input: CreateCanvasRegionInput) =>
  post<{ region: CanvasRegion }>(projectCollectionPath(projectId, "canvas-regions"), input);

export const reviseCanvasRegion = (projectId: string, regionId: string, input: ReviseCanvasRegionInput) =>
  patch<{ region: CanvasRegion }>(projectRecordPath(projectId, "canvas-regions", regionId), input);

export const archiveCanvasRegion = (projectId: string, regionId: string, input: ArchiveCanvasRegionInput) =>
  post<{ region: CanvasRegion }>(projectRecordPath(projectId, "canvas-regions", regionId, "archive"), input);

export const reopenCanvasRegion = (projectId: string, regionId: string, input: ArchiveCanvasRegionInput) =>
  post<{ region: CanvasRegion }>(projectRecordPath(projectId, "canvas-regions", regionId, "reopen"), input);

export const getCanvasStructureHistory = (projectId: string) =>
  get<CanvasStructureHistoryResponse>(projectCollectionPath(projectId, "canvas-history"));

export const undoCanvasStructure = (projectId: string, input: CanvasStructureHistoryMutationInput) =>
  post<{ history: CanvasStructureHistoryResponse; receipt: CanvasStructureHistoryEntry }>(
    projectRecordPath(projectId, "canvas-history", "undo"), input,
  );

export const redoCanvasStructure = (projectId: string, input: CanvasStructureHistoryMutationInput) =>
  post<{ history: CanvasStructureHistoryResponse; receipt: CanvasStructureHistoryEntry }>(
    projectRecordPath(projectId, "canvas-history", "redo"), input,
  );

export const listGoalConflictDecisions = (projectId: string) =>
  get<GoalConflictDecisionListResponse>(projectCollectionPath(projectId, "goal-conflict-decisions"));

export const getGoalConflictDecisionHistory = (projectId: string, conflictId: string) =>
  get<{ history: GoalConflictDecision[] }>(projectRecordPath(projectId, "goal-conflict-decisions", conflictId, "history"));

export const recordGoalConflictDecision = (projectId: string, conflictId: string, input: RecordGoalConflictDecisionInput) =>
  post<GoalConflictDecisionListResponse & { decision: GoalConflictDecision }>(
    projectRecordPath(projectId, "goal-conflict-decisions", conflictId), input,
  );

export const listWorkArtifacts = (projectId: string, options?: IncludeRetiredOptions) =>
  get<WorkArtifactListResponse>(withIncludeRetired(projectCollectionPath(projectId, "work-artifacts"), options));

export const getWorkArtifact = (projectId: string, artifactId: string, options?: IncludeRetiredOptions) =>
  get<{ artifact: WorkArtifactRevision }>(
    withIncludeRetired(projectRecordPath(projectId, "work-artifacts", artifactId), options),
  );

export const getWorkArtifactHistory = (projectId: string, artifactId: string, options?: IncludeRetiredOptions) =>
  get<WorkArtifactHistoryResponse>(
    withIncludeRetired(projectRecordPath(projectId, "work-artifacts", artifactId, "history"), options),
  );

export const createWorkArtifact = (projectId: string, input: CreateWorkArtifactInput) =>
  post<{ artifact: WorkArtifactRevision }>(projectCollectionPath(projectId, "work-artifacts"), input);

export const reviseWorkArtifact = (projectId: string, artifactId: string, input: ReviseWorkArtifactInput) =>
  patch<{ artifact: WorkArtifactRevision }>(projectRecordPath(projectId, "work-artifacts", artifactId), input);

export const branchWorkArtifact = (projectId: string, artifactId: string, input: BranchWorkArtifactInput) =>
  post<{ artifact: WorkArtifactRevision }>(
    projectRecordPath(projectId, "work-artifacts", artifactId, "branch"), input,
  );

export const retireWorkArtifact = (projectId: string, artifactId: string, input: RetireWorkArtifactInput) =>
  post<{ artifact: WorkArtifactRevision }>(
    projectRecordPath(projectId, "work-artifacts", artifactId, "retire"), input,
  );

export const restoreWorkArtifact = (projectId: string, artifactId: string, input: RestoreWorkArtifactInput) =>
  post<{ artifact: WorkArtifactRevision }>(
    projectRecordPath(projectId, "work-artifacts", artifactId, "restore"), input,
  );

export const applyCanvasProposal = (projectId: string, artifactId: string, input: { expectedArtifactRevision: number; idempotencyKey: string }) =>
  post<{ artifact: WorkArtifactRevision; structureReceipt?: CanvasStructureHistoryEntry; deduped: boolean }>(
    projectRecordPath(projectId, "work-artifacts", artifactId, "apply-proposal"), input,
  );

export const listWorkRelationships = (projectId: string, options?: IncludeRetiredOptions) =>
  get<WorkRelationshipListResponse>(
    withIncludeRetired(projectCollectionPath(projectId, "work-relationships"), options),
  );

export const getWorkRelationship = (projectId: string, relationshipId: string, options?: IncludeRetiredOptions) =>
  get<{ relationship: WorkRelationshipRevision }>(
    withIncludeRetired(projectRecordPath(projectId, "work-relationships", relationshipId), options),
  );

export const getWorkRelationshipHistory = (
  projectId: string, relationshipId: string, options?: IncludeRetiredOptions,
) => get<WorkRelationshipHistoryResponse>(
  withIncludeRetired(projectRecordPath(projectId, "work-relationships", relationshipId, "history"), options),
);

export const createWorkRelationship = (projectId: string, input: CreateWorkRelationshipInput) =>
  post<{ relationship: WorkRelationshipRevision }>(projectCollectionPath(projectId, "work-relationships"), input);

export const reviseWorkRelationship = (
  projectId: string, relationshipId: string, input: ReviseWorkRelationshipInput,
) => patch<{ relationship: WorkRelationshipRevision }>(
  projectRecordPath(projectId, "work-relationships", relationshipId), input,
);

export const retireWorkRelationship = (
  projectId: string, relationshipId: string, input: RetireWorkRelationshipInput,
) => post<{ relationship: WorkRelationshipRevision }>(
  projectRecordPath(projectId, "work-relationships", relationshipId, "retire"), input,
);

export const restoreWorkRelationship = (
  projectId: string, relationshipId: string, input: RestoreWorkRelationshipInput,
) => post<{ relationship: WorkRelationshipRevision }>(
  projectRecordPath(projectId, "work-relationships", relationshipId, "restore"), input,
);

// ── Engine OS ───────────────────────────────────────────────────────────────
export const getEngineState = (channelId?: string) =>
  get<{ engine: EngineState }>(`/api/engine${channelId ? `?channel=${encodeURIComponent(channelId)}` : ""}`);

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

// The bundled sample product — lets a stranger with no instrumented repo try the scan on real code
// that reproduces the attribution gap. Returns the absolute path the server resolved, plus the win
// event to scan for; the UI feeds these into the same scanPreview → createProject flow a real repo uses.
export const getSampleProduct = () =>
  get<{ repoPath: string; winEvent: string; name: string; blurb: string }>("/api/sample-product");

// ── Connector registry ──────────────────────────────────────────────────────
export const getConnectors = () =>
  get<{ connectors: ConnectorMeta[] }>("/api/connectors");

// ── Capabilities (external MCP servers) ──────────────────────────────────────
export const getCapabilities = () =>
  get<{ servers: CapabilityServer[] }>("/api/capabilities");

// The LIVE capability inventory — the real tools/agents/skills the crew can reach right now, from the
// runtime, not a hardcoded brand list. Returns null when the backend hasn't produced this endpoint yet
// (or errors), so every caller degrades to the suggested-connections catalog — render-if-present.
export const getCapabilityInventory = (): Promise<CapabilityInventory | null> =>
  get<CapabilityInventory>("/api/capabilities/inventory").catch(() => null);

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

// ── Sender credentials (BYO keys — connect your own Gmail as the sender) ──────
// A pasted credential the founder connects so an approved send has a key to use. Never loosens the
// wall — the gate still governs every send. The token never comes back; the server redacts on read.
export const getCredentials = () =>
  get<{ credentials: SenderCredential[] }>("/api/credentials");

export const connectSender = (input: { provider: string; token: string; label?: string }) =>
  post<{ credential: SenderCredential; credentials: SenderCredential[] }>("/api/credentials", input);

// Durable Gmail connect — the founder pastes their Google "Desktop app" OAuth client id + secret, and the
// server runs the loopback consent flow (opens Google in the browser) and banks a refresh token. This call
// resolves only when the founder finishes consent, so it can take a while; the secrets never come back.
export const connectGmailOAuth = (input: { clientId: string; clientSecret: string }) =>
  post<{ credential: SenderCredential; credentials: SenderCredential[] }>("/api/credentials/gmail/connect", input);

export const removeSender = (provider: string) =>
  fetch(`/api/credentials/${encodeURIComponent(provider)}`, { method: "DELETE", headers: { ...identityHeaders() } })
    .then((r) => r.json() as Promise<{ removed: boolean; credentials: SenderCredential[] }>);

// ── GTM Graph (DAG — zoom 3) ────────────────────────────────────────────────
// EXPLICIT PROJECT SCOPE (brain/src/routes/graph.mjs): every ownership-resolving graph route now resolves
// the owning project from `projectId` (body) or `project` (query) and rejects cross-project or ambiguous
// access. So the UI ALWAYS sends the owning project id — never relying on global active-project inference
// or unique ownership. `projectId` is a REQUIRED argument on each of these so no unscoped call can compile.
export const getGraphTemplate = (channelId: string | undefined, projectId: string) => {
  const params = new URLSearchParams();
  if (channelId) params.set("channel", channelId);
  params.set("project", projectId);
  return get<{ graph: GTMGraph; runs?: GTMRunResult[] }>(`/api/graph/template?${params.toString()}`);
};

export const saveGraph = (graph: GTMGraph, projectId: string) =>
  post<{ graph: GTMGraph; savedAt: string; projectId?: string }>("/api/graph/save", { graph, projectId });

export const applyGraphOperations = (graph: GTMGraph, operations: GraphOperation[]) =>
  post<{ graph: GTMGraph; changes: Array<{ type: string; detail: string }> }>(
    "/api/graph/operations",
    { graph, operations },
  );

export const auditGraph = (graph: GTMGraph, runResult?: GTMRunResult | null) =>
  post<{ audits: Record<string, GTMContractAudit> }>("/api/graph/audit", { graph, runResult });

// Fill each node/edge with a one-line "why" (Explain mode). Idempotent server-side: no model call when
// the graph is already annotated; `force` re-explains. Reasons over the real shape only — never invents
// product facts, never runs the workflow. Returns the persisted graph with `rationale` merged on.
export const explainGraph = (graphId: string, projectId: string, force = false) =>
  post<{ graph: GTMGraph }>("/api/graph/explain", { graphId, force, projectId });

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

// `projectId` is required in the run options — the run route resolves graph ownership from it and rejects
// cross-project runs, so a run can never fire against another project's graph by unique-ownership inference.
export const runGraph = (
  graph: GTMGraph,
  options: {
    projectId: string;
    targetNodeId?: string;
    approvals?: Record<string, boolean>;
    decisions?: Decisions;
    resumeRunId?: string;
  },
) => post<GTMRunResult>("/api/graph/run", { graph, ...options });

// Run a SINGLE node — the "run just this step" loop. Hits the same node-run route the full run uses
// (POST /api/graph/run with targetNodeId), so only this node executes and its produced items come back
// on result.nodes[nodeId]. The wall is untouched: an execute node still stops at its gate. Takes the
// live in-memory graph (not a stored id) so it runs exactly what's on the canvas, edits included.
export const runWorkflowNode = (graph: GTMGraph, nodeId: string, projectId: string) =>
  runGraph(graph, { projectId, targetNodeId: nodeId });

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
  options: { projectId: string; targetNodeId?: string; approvals?: Record<string, boolean>; decisions?: Decisions; resumeRunId?: string },
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
  get<{ sessions: OperatorSessionSummary[]; comparisonGroups: OperatorComparisonGroup[] }>(
    `/api/operator/sessions${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`,
  );

// Scope the read to the project the canvas is showing — the backend rejects (409) a session that does
// not belong to that project, which is what lets the composer lock to the project with no drift band-aid.
export const getOperatorSession = (sessionId: string, projectId?: string) =>
  get<{ session: OperatorSession }>(
    `/api/operator/sessions/${sessionId}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`,
  );

// Permanently delete a chat from the founder's history. Scoped to the project so a chat can only be
// removed from the product it belongs to. A running chat is refused (409) — stop it first.
export const deleteOperatorSession = (sessionId: string, projectId?: string) =>
  del<{ deleted: boolean; id: string }>(
    `/api/operator/sessions/${encodeURIComponent(sessionId)}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`,
  );

// One durable conversation per project. `reuse: true` returns the project's live (non-terminal) thread
// when one exists (`reused: true`) instead of spawning a parallel session, and only creates a fresh one
// (`reused: false`) when there is none — so the dock can only ever talk about the project on screen.
// `fresh: true` (the "New channel" action) starts an unbound session so it composes an ADDITIONAL
// pipeline for the product instead of re-driving the active one.
// `context` binds a fresh composition to a canvas object without making it required — the operator route
// (brain/src/routes/operator.mjs) reads questionId / participantRefs / productRefs and threads them into
// the session's grounding. A direct pipeline still composes with no context (questions stay optional).
export type OperatorSessionContext = {
  questionId?: string | null;
  participantRefs?: string[];
  productRefs?: string[];
  surface?: "terrain" | "pipeline";
  lens?: "canvas";
  focusRef?: string | null;
  contextRefs?: string[];
  threadRef?: string | null;
};
export const createOperatorSession = (
  projectId: string, goal: string, graphId?: string, fresh?: boolean, context?: OperatorSessionContext, model?: string,
  reuse?: boolean,
) =>
  post<{ session: OperatorSession; reused: boolean }>("/api/operator/sessions", {
    projectId, reuse: reuse ?? !fresh, goal, graphId: fresh ? undefined : graphId, fresh,
    ...(model ? { model } : {}),
    ...(context?.questionId ? { questionId: context.questionId } : {}),
    ...(context?.participantRefs?.length ? { participantRefs: context.participantRefs } : {}),
    ...(context?.productRefs?.length ? { productRefs: context.productRefs } : {}),
    ...(context?.surface ? { surface: context.surface } : {}),
    ...(context?.lens ? { lens: context.lens } : {}),
    ...(context?.focusRef ? { focusRef: context.focusRef } : {}),
    ...(context?.contextRefs?.length ? { contextRefs: context.contextRefs } : {}),
    ...(context?.threadRef ? { threadRef: context.threadRef } : {}),
  });

export const handoffOperatorSession = (
  sessionId: string,
  projectId: string,
  target: "auto" | "claude" | "codex",
  expectedRevision: number,
  model?: string,
) => post<{ session: OperatorSession }>(`/api/operator/sessions/${encodeURIComponent(sessionId)}/handoff`, {
  projectId,
  target,
  expectedRevision,
  idempotencyKey: `handoff:${sessionId}:${expectedRevision}:${target}:${model ?? "default"}`,
  ...(model ? { model } : {}),
});

export const askBothOperatorRuntimes = (
  sessionId: string,
  projectId: string,
  expectedRevision: number,
) => post<{ branches: OperatorSession[]; branchGroupId: string }>(
  `/api/operator/sessions/${encodeURIComponent(sessionId)}/ask-both`,
  {
    projectId,
    expectedRevision,
    idempotencyKey: `ask-both:${sessionId}:${expectedRevision}`,
  },
);

// Accept a product implication (docs/production-direction/06 §Product implication). The route
// (brain/src/routes/measure.mjs → outcome-implications/:id/accept) is now fully server-derived: it DERIVES
// the one allowlisted add_node proposal from trusted outcome lineage, requires browser + owner authority,
// and returns the pending-proposal review session. It NEVER applies a graph mutation, and it REJECTS any
// client-supplied graphId or operations. So the client may send ONLY the founder's wording (optional) —
// never a graph id, never operations. A proposed or already-staged implication both go through this door;
// staged returns the existing session (deduped).
export type ImplicationAcceptBody = { wording?: string };
export type ImplicationAcceptResult = {
  implication: ProductImplication & Record<string, unknown>;
  sessionId: string;
  proposal: unknown;
  decision?: unknown;
  deduped: boolean;
};
export const acceptProductImplication = (projectId: string, implicationId: string, body?: ImplicationAcceptBody) =>
  post<ImplicationAcceptResult>(
    `/api/projects/${encodeURIComponent(projectId)}/outcome-implications/${encodeURIComponent(implicationId)}/accept`,
    { projectId, ...(body?.wording?.trim() ? { wording: body.wording.trim() } : {}) },
  );

// Advisory @-mention steering a founder message can carry: the specific teammates (crew refs) and
// capabilities the founder named in the composer. Optional and never a contract — the backend folds it
// into the operator's context so composition PREFERS the named crew, but a run is never blocked on it.
export type OperatorHints = {
  teammates?: string[];
  capabilities?: string[];
};

export const resumeOperatorSession = (
  sessionId: string,
  projectId: string,
  input: string,
  hints?: OperatorHints,
  context?: OperatorSessionContext,
) =>
  post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/resume`, {
    projectId,
    input,
    ...(hints ? { hints } : {}),
    ...(context?.surface ? { surface: context.surface } : {}),
    ...(context?.lens ? { lens: context.lens } : {}),
    ...(context?.focusRef ? { focusRef: context.focusRef } : {}),
    ...(context?.contextRefs?.length ? { contextRefs: context.contextRefs } : {}),
  });

export const resolveOperatorGate = (
  sessionId: string,
  projectId: string,
  payload: { approvals?: Record<string, boolean>; decisions?: Decisions; deployConfirmed?: boolean },
) => post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/gate`, { projectId, ...payload });

// Mid-run steer — a founder message delivered to a RUNNING or gated session WITHOUT resuming or releasing
// anything. It redirects the crew's course; it never sends. The backend folds the message into the live
// session's context and returns the updated session. Distinct from resume (which advances a paused
// session) and from the gate (which releases). Never touches the wall.
export const steerOperatorSession = (
  sessionId: string,
  projectId: string,
  input: string,
  hints?: OperatorHints,
) =>
  // The backend steer route reads the steering note off `note` (its param name), and `hints` for the
  // @-mentioned crew. `projectId` is the session-ownership guard. The founder's typed message is the note.
  post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/steer`, {
    projectId,
    note: input,
    ...(hints ? { hints } : {}),
  });

export const cancelOperatorSession = (sessionId: string, projectId: string) =>
  post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/cancel`, { projectId });

// Veto-as-loop: the founder sends ONE staged item back to the crew with a note. The operator re-drives
// to rework just that item and returns it to the gate — nothing is released. Not a reject; a rework.
export const refineOperatorGate = (
  sessionId: string,
  projectId: string,
  payload: { gateNodeId: string; itemKey: string; founderNote: string },
) => post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/gate-refine`, { projectId, ...payload });

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

// ── Composer fast lane — the session-optional briefing read + the intent-routed turn ──────────────
// The briefing is the read-only cross-pipeline snapshot shaped for ComposerDock's `briefing` prop
// (eyebrow / rows / summary). Reading it never drives, resumes, sends, or creates anything.
export type ComposerBriefingRow = { id: string; name: string; state: "needs" | "work" | "quiet"; what: string };
export type ComposerBriefing = { eyebrow: string; rows: ComposerBriefingRow[]; summary: string };
export const getComposerBriefing = (projectId?: string) =>
  get<ComposerBriefing>(`/api/operator/briefing${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`);

// The intent-routed turn. status|explain answer FAST (mode:"fast") without spawning the drive; act|run
// (mode:"drive") either resume the live session server-side (allowDrive && a resumable sessionId) or hand
// back session:null so the client creates a fresh session on its own untouched path. THE WALL is untouched.
export type ComposerTurnResult =
  | { mode: "fast"; intent: "status" | "explain"; answer: string; briefing?: unknown }
  | { mode: "drive"; intent: "act" | "run"; session: OperatorSession | null };
export const composerTurn = (input: {
  projectId?: string;
  sessionId?: string;
  input: string;
  hints?: OperatorHints;
  allowDrive?: boolean;
  surface?: "terrain" | "pipeline";
  lens?: "canvas";
  focusRef?: string | null;
  contextRefs?: string[];
}) => post<ComposerTurnResult>("/api/operator/turn", input);

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

// ── Design taste — the founder's front-end house style, made persistent ────────
// TASTE, not the gate: setting a house style, a feeling, or flagging a reference screen never sends,
// publishes, or approves anything. It only shapes what a visual agent reads before it drafts, so the
// crew stops always falling back to the built-in "Warm Calm" defaults. Reads fall back to the seeded
// house style when a project has saved nothing yet, so this surface is never blank.
export type DesignDimension = { principle: string; grounded: boolean };
export type DesignReference = {
  id: string;
  source: "mobbin" | "url";
  label: string;
  url: string | null;
  dimensions: string[];
  proves: string;
};
export type DesignState = {
  projectId: string;
  houseStyle: string;
  feeling: string;
  dimensions: Record<string, DesignDimension>;
  references: DesignReference[];
  updatedAt: string;
};

export const getDesignState = () => get<{ designState: DesignState }>("/api/design-state");

// Persist an edited house style / feeling / dimensions / references. projectId is FORCED to the active
// project server-side, so a client value is ignored — one project can never overwrite another's taste.
export const saveDesignState = (body: {
  houseStyle?: string;
  feeling?: string;
  dimensions?: Record<string, { principle?: string }>;
  references?: DesignReference[];
}) => post<{ designState: DesignState }>("/api/design-state", body);

// Flag one reference screen (a Mobbin curation or a live URL). It joins the project's library and
// re-marks whatever dimensions it anchors as grounded.
export const addDesignReference = (reference: {
  label: string;
  url?: string | null;
  note?: string;
  source?: "mobbin" | "url";
  dimensions?: string[];
  proves?: string;
}) => post<{ designState: DesignState }>("/api/design-state/references", { reference });

// ── Signal weights — the founder-tunable path-ranking judgment ──────────────────
// Path ranking scores GTM paths as a weighted sum of seven signals; HOW they trade off is a strategic
// judgment the founder owns. Reading returns the active table plus the key order and seed defaults so
// the surface can render a tuner. Saving persists a tuned table for the active project (projectId is
// forced server-side). Pure taste — it tunes ordering only, sends/publishes/charges nothing.
export type SignalWeights = Record<string, number>;
export const getSignalWeights = () =>
  get<{ weights: SignalWeights; keys: string[]; defaults: SignalWeights }>("/api/signal-weights");

export const saveSignalWeights = (weights: SignalWeights) =>
  fetch("/api/signal-weights", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...identityHeaders() },
    body: JSON.stringify({ weights }),
  }).then(async (res) => {
    const payload = (await res.json().catch(() => ({}))) as { weights?: SignalWeights; error?: string };
    if (!res.ok) throw new Error(payload.error || `Saving weights failed (${res.status}).`);
    return payload as { weights: SignalWeights };
  });

// ── Reallocation tunables — the aggressiveness knobs the founder owns (Area 3) ──
// LEARN's reallocation loop is governed by three taste-call numbers beside signal-weights: the
// observation floor, the tilt clamp, and the daily probe cap. Same read/write shape as signal-weights.
export type ReallocationTunables = Record<string, number>;
export const getReallocationTunables = () =>
  get<{ tunables: ReallocationTunables; keys: string[]; defaults: ReallocationTunables }>(
    "/api/reallocation-tunables",
  );

export const saveReallocationTunables = (tunables: ReallocationTunables) =>
  fetch("/api/reallocation-tunables", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...identityHeaders() },
    body: JSON.stringify({ tunables }),
  }).then(async (res) => {
    const payload = (await res.json().catch(() => ({}))) as {
      tunables?: ReallocationTunables;
      error?: string;
    };
    if (!res.ok) throw new Error(payload.error || `Saving tunables failed (${res.status}).`);
    return payload as { tunables: ReallocationTunables };
  });

// ── Reallocation receipt — the Overdrive card the batch renders (Area 3) ────────
// What the machine tilted, why, from which outcomes, plus the motions flagged as starved. Pure read;
// overturnable, never a hidden policy. `applied` is false and weights === base when nothing is measured.
export type ReallocationReceipt = {
  projectId: string;
  applied: boolean;
  base: Record<string, number>;
  weights: Record<string, number>;
  tilt: Record<string, number>;
  reasons: string[];
  working: Array<{
    motionKind: string;
    motionRef: string | null;
    observed: number;
    outcomesByKind: Record<string, number>;
  }>;
  starved: Array<{ motionKind: string; motionRef: string | null; staged: number; measured: number; reason: string }>;
  minObservations: number;
};
export const getReallocation = () => get<ReallocationReceipt>("/api/reallocation");

// ── Connection status — is a live AI runtime available for compose/ideate/operator ──
// Drover runs on whichever local AI subscription the founder already has: Codex (ChatGPT
// login) or Claude (Anthropic login). Per-provider readiness is reported in `runtimes`;
// the top-level fields stay for the parent gate (`connected`) and the toolbar (`label`).
//
// `runtimes` is OPTIONAL on purpose: it's backward-compatible with the legacy single-runtime
// backend that returned only { connected, label, reason }. When the resident-runtime backend
// is live it fills `runtimes` with one redacted readiness row per provider; until then the UI
// falls back to a static Codex + Claude choice built from the top-level `connected` flag.
export type RuntimeReadiness = {
  id: string;               // stable runtime id (e.g. "codex", "claude-code", "anthropic")
  provider?: string;        // provider-neutral group (e.g. "codex" | "claude" | "anthropic"); derived from id when absent
  label: string;            // human label for this runtime
  connected: boolean;       // is this provider signed in and ready
  reason: string | null;    // redacted, provider-specific reason when not connected (never a raw error)
};
export type ConnectionStatus = {
  connected: boolean;       // is ANY runtime ready — the parent gate keys off this
  label: string | null;     // the selected/ready runtime's label, for the toolbar
  reason: string | null;    // legacy single-reason field, retained for back-compat
  selectedRuntime?: string | null;
  runtimes?: RuntimeReadiness[];
};
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

// ── Pending-decision inbox — everything waiting on the founder across EVERY product and pipeline ─────
// No projectId spans all products (the dock badge's cross-pipeline view); a projectId scopes to one.
// A read-only projection: reading it never approves, routes, or advances anything.
export const getPendingInbox = (projectId?: string) =>
  get<PendingInbox>(`/api/pending-inbox${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`);

// ── Reply alert + decide-together (rail 5 push) ──────────────────────────────
// Read the full decide-together payload for one real reply — the reply, its joined context, and the
// machine's suggested next move. Read-only: fetching it never auto-replies, routes, or runs.
export const getReplyAlert = (projectId: string, inputId: string) =>
  get<{ projectId: string; alert: ReplyAlert }>(
    `/api/projects/${encodeURIComponent(projectId)}/reply-alerts/${encodeURIComponent(inputId)}`,
  );

// ── Mutation-from-a-loser (rail 2) ───────────────────────────────────────────
// Propose a variant off a killed/failed experiment — a new open experiment mutated off the loser, for
// the founder to greenlight. NEVER auto-kills the loser, NEVER runs the variant; this only appends a
// proposed experiment. Returns the proposed variant.
export const proposeVariantFromLoser = (projectId: string, experimentId: string) =>
  post<{ projectId: string; artifact: WorkArtifactRevision; experiment: GtmExperiment; variant: GtmExperiment; created: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}/propose-variant`,
    {},
  );

// ── Outside-trigger → proposed experiment (fourth birth source) ──────────────
// Propose an experiment off a qualifying outside-trigger input, for the founder to greenlight. NEVER
// runs the experiment or routes the input into a live channel; this only appends a proposal and stamps
// the input as routed-to-proposal. Returns the proposed experiment.
export const proposeExperimentFromTrigger = (projectId: string, inputId: string) =>
  post<{ projectId: string; artifact: WorkArtifactRevision; experiment: GtmExperiment; input: unknown; created: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/inputs/${encodeURIComponent(inputId)}/propose-experiment`,
    {},
  );

export const getObjectGraph = (projectId: string) =>
  get<ObjectGraphView>(`/api/projects/${encodeURIComponent(projectId)}/object-graph`);

// ── The operating view — the one Operator lens read over the whole fleet (Area 6) ──────────────────────
// Every motion as a uniform lane, the shared objects drawn once with lane ties, the parked-at-gate state,
// and each lane's efficiency row. A pure cross-fleet read: it composes existing reads, never writes, never
// triggers a run, never gates one. Scoped to one project.
export const getOperatingView = (projectId?: string) =>
  get<OperatingView>(`/api/operating-view${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`);

// The deterministic terrain read never spends a model call. Null is the integration fallback while an
// older backend exposes only /api/operating-view; the existing woven canvas remains available in that case.
export const getTerrainView = (projectId: string): Promise<TerrainView | null> =>
  get<TerrainView>(`/api/projects/${encodeURIComponent(projectId)}/terrain`).catch(() => null);

// A rented, provider-neutral overlay read. It changes no product, pipeline, graph, gate, or outcome state.
export const readTerrain = (projectId: string, input: { model?: string; focusRef?: string } = {}) =>
  post<TerrainRead>(`/api/projects/${encodeURIComponent(projectId)}/terrain/read`, input);

export const askTerrainCrew = (projectId: string, hypothesis: TerrainHypothesis, model?: string) =>
  post<TerrainCrewRead>(`/api/projects/${encodeURIComponent(projectId)}/terrain/crew`, {
    hypothesis,
    ...(model ? { model } : {}),
  });

// ── The one per-motion efficiency table (Area 7) ───────────────────────────────────────────────────────
// deriveMotionEfficiency: every real outcome aggregated by the motion that earned it (a shape-derived
// kind), honest-unmeasured never a fabricated rate. The same rows the Operator lens's lanes read. Pure
// read: it never writes, sends, or gates. The row/table shape lives on the presentational component.
export const getMotionEfficiency = (projectId: string) =>
  get<MotionEfficiencyData>(`/api/projects/${encodeURIComponent(projectId)}/motion-efficiency`);

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

// ── What happened — the latest run's real numbers, in founder language ─────────────────────────────
// Derived read-only from real state; null when no run has happened, and every outcome bucket stays null
// where nothing joined back (never a fake zero). Revenue is not tracked at this layer, so it is null.
export type RunSummary = {
  sent: number | null;
  replies: number | null;
  calls: number | null;
  signups: number | null;
  paid: number | null;
  // A recorded "no response yet" — the sent items that drew silence. An honest negative signal, not a
  // fabricated number; null until the founder marks at least one item as no-response.
  noReply: number | null;
  revenue: number | null;
  note: string | null;
};

export const getRunSummary = (projectId: string) =>
  get<{ run: RunSummary | null }>(`/api/projects/${encodeURIComponent(projectId)}/run-summary`);

// Record what actually happened on a run, in the founder's own words. `happened` is a plain label
// (optionally an object with a count); `learned` is the lesson. Writes a Result + Learning; never sends.
// Named distinctly from recordOutcome (the joinKey-keyed result above) — this is the founder's plain
// post-run "what happened / what did we learn" loop-closer.
export const recordFounderOutcome = (
  projectId: string,
  body: { runId?: string | null; happened: string | { label: string; count?: number }; learned?: string },
) => post<{ ok: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/outcome`, body);

// The bench — the whole roster as one lens over the run ledger. Each row is the compact face of an
// agent's real track record; a never-run agent reads honestly (hasRuns false, "no runs yet"). The
// profile sheet still fetches the full record (edits + voice) on click.
export type AgentBenchRow = {
  ref: string;
  job: string;
  // A founder-chosen display name (a teammate built via the crew "+"); empty for composed-pipeline agents,
  // which fall back to their derived role.
  name?: string;
  hasRuns: boolean;
  runCount: number;
  counts: { approved: number; rejected: number; edits: number };
  note: string | null;
};
export const getAgentBench = (projectId: string) =>
  get<{ bench: AgentBenchRow[] }>(`/api/projects/${encodeURIComponent(projectId)}/bench`);

// "+ build a teammate with Claude": compose drafts one from a sentence (nothing written), add persists the
// accepted draft as a real agent file and puts it on this project's crew so it shows up immediately.
export type ImportedLesson = { patternKey: string; text: string; why: string; source: string };
export type CrewDraft = {
  ref: string; name: string; description: string; systemPrompt: string; markdown: string;
  // Present only on a draft imported from an OpenClaw workspace: the earned lessons that seed the
  // template soul on accept, and the read-only-reduced toolset.
  source?: string;
  importedPromoted?: ImportedLesson[];
  importedScratch?: ImportedLesson[];
  tools?: { allowed: string[]; dropped: string[] };
};
// One endpoint, three moves: fresh from a sentence (description), refine an in-progress draft (current +
// instruction, ref held stable), or fork an existing teammate (baseRef + instruction).
export type ComposeCrewInput = {
  description?: string;
  instruction?: string;
  baseRef?: string;
  current?: { ref: string; name: string; description: string; systemPrompt: string };
};
export const composeCrewMember = (projectId: string, input: ComposeCrewInput) =>
  post<{ draft: CrewDraft }>(`/api/projects/${encodeURIComponent(projectId)}/crew/compose`, input);
export const addCrewMember = (
  projectId: string,
  draft: { ref: string; name: string; description: string; systemPrompt: string; importedPromoted?: ImportedLesson[]; importedScratch?: ImportedLesson[] },
) =>
  post<{ ok: boolean; member: { ref: string; description: string } }>(`/api/projects/${encodeURIComponent(projectId)}/crew/add`, draft);

// A teammate's founder-facing card: its real track record and the lessons it has learned FROM the
// founder, all in plain words. `learned` is what's already permanent; `stillFiguring` is what it's
// still watching; `ready` is what has earned a graduation and awaits the founder's one tap. Every
// counter is a real signal — a teammate with no history reads name:null and zeros, never a fake number.
export type CrewLesson = { text: string; why: string };
export type CrewReadyLesson = CrewLesson & { patternKey: string };
export type CrewMemberProfile = {
  name: string | null;
  record: { runs: number; sent: number; replies: number; wins: number };
  learned: CrewLesson[];
  stillFiguring: CrewLesson[];
  ready: CrewReadyLesson[];
  // ── Teammate-position enrichment (docs/production-direction/05 §Teammate contract). All optional and
  // additive: the current server omits them and the sidecar shows honest empties. When a question is
  // focused, App passes the teammate's position on it so the sidecar reads its belief, uncertainty,
  // recommendation, and — the part that makes the crew feel alive — "what would change my mind."
  //
  // The falsifier: the concrete, gatherable thing that would move this teammate off its position. Drives
  // the spec-native "What would change your mind?" evidence action. Null when the teammate stated none.
  falsifier?: string | null;
  // The teammate's current position on the focused question (belief + next move), when one is focused.
  position?: { claim: string; uncertainty?: string | null; recommendation?: string | null } | null;
  // When and where the founder last taught this teammate — a stamped lesson receipt, not a live label.
  lastTaughtAt?: string | null;
};
export const getCrewMemberProfile = (projectId: string, ref: string) =>
  get<{ profile: CrewMemberProfile }>(
    `/api/projects/${encodeURIComponent(projectId)}/crew/${encodeURIComponent(ref)}/profile`,
  );
// The founder's blessing (make a ready lesson permanent) and its "not yet" (set it aside). Both return
// the fresh founder-view so the card updates in place.
export const promoteCrewLearning = (projectId: string, ref: string, patternKey: string) =>
  post<{ profile: CrewMemberProfile }>(
    `/api/projects/${encodeURIComponent(projectId)}/crew/${encodeURIComponent(ref)}/promote`, { patternKey },
  );
export const dismissCrewLearning = (projectId: string, ref: string, patternKey: string) =>
  post<{ profile: CrewMemberProfile }>(
    `/api/projects/${encodeURIComponent(projectId)}/crew/${encodeURIComponent(ref)}/dismiss`, { patternKey },
  );

// Import an OpenClaw agent workspace into a teammate draft (nothing persisted until add). Send a single
// combined paste (text) or the per-file object; the draft comes back with its earned lessons attached.
export const importOpenClawTeammate = (
  projectId: string,
  input: { text?: string; files?: { soul?: string; agents?: string; memory?: string; tools?: string; learnings?: string }; dirPath?: string },
) =>
  post<{ draft: CrewDraft }>(`/api/projects/${encodeURIComponent(projectId)}/crew/import`, input);

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
  options: { expectedRevision: number; idempotencyKey: string },
) => post<{ projectId: string; positions: Record<string, { x: number; y: number }>; savedAt: string; geometry: { revision: number } }>(
  `/api/projects/${encodeURIComponent(projectId)}/object-graph/positions`,
  { positions, ...options },
);

export const saveObjectGraphGeometry = (
  projectId: string,
  geometry: { positions?: Record<string, { x: number; y: number }>; viewport?: { x: number; y: number; zoom: number } | null },
  options: { expectedRevision: number; idempotencyKey: string },
) => post<{ projectId: string; positions: Record<string, { x: number; y: number }>; savedAt: string; geometry: { revision: number; viewport?: { x: number; y: number; zoom: number } | null } }>(
  `/api/projects/${encodeURIComponent(projectId)}/object-graph/positions`,
  { geometry, ...options },
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

// Greenlight a staged experiment to RUN its internal/prep work — one founder click, DISTINCT from the
// outward gate above. It starts the experiment's local/prep steps running while every genuinely-outward
// step (send/publish/deploy/charge) stays pending at the founder gate exactly as today. It never approves
// an outward item — the wall is untouched. Returns the resolved run, the refreshed gate, and a summary of
// what started vs what is still held.
export const greenlightRun = (
  projectId: string,
  runId: string,
) => post<{
  projectId: string;
  run: CompiledRun;
  gate: CompiledGate;
  greenlight: { startedInternal: number; heldOutward: number; note: string };
  ok: boolean;
  pendingGates: string[];
}>(
  `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/greenlight`,
  {},
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

// ── Self-observed failure log — Drover watching its OWN runs ──────────────────────
// The founder surface reads the auto-logged failure queue (the same dogfood/queue reportFriction writes,
// grouped by dedup signature). GET /api/friction returns this shape (the route groups + splits the raw
// queue). This is the FROZEN contract every lane depends on — the route builds it, the panel consumes it.
//
// One distinct failure = one group, keyed by signature. `occurrences` is bumped in place when the same
// failure recurs (dedup), so a group is one bug seen N times, not N rows. `failureClass` splits a real bug
// (self_inflicted) from a retry-clears-it condition (transient); the surface defaults to self_inflicted
// with transient behind a filter. Every field is honest — a missing piece is null, never invented.
export type FailureClass = "self_inflicted" | "transient";
export type FailureCategory = "run-crash" | "run-stall" | "node-error" | "bad-output";

export type FailureGroup = {
  signature: string;            // the stable dedup key (category|errorKind|node|graph)
  category: FailureCategory | string;
  failureClass: FailureClass;   // self_inflicted (a real bug) vs transient (retry/reset clears it)
  errorKind: string | null;     // normalized token: code_throw, timeout, unparseable_output, limit, …
  occurrences: number;          // how many times this exact failure has been seen (dedup count)
  firstSeen: string | null;     // ISO — when this signature first appeared
  lastSeen: string | null;      // ISO — the newest occurrence (the sort key, newest first)
  pipeline: string | null;      // graph label or id — which pipeline it happened in
  step: string | null;          // node label — which step failed (null for a crash/stall)
  errorSnippet: string | null;  // the trimmed raw error/output line (monospace on the surface)
  file: string;                 // the queue file basename (the item's identity)
  status: string;               // "open" while it still needs a fix
};

export type FailureLogView = {
  groups: FailureGroup[];       // one per distinct signature, newest lastSeen first
  selfInflictedCount: number;   // distinct self_inflicted groups (the default view)
  transientCount: number;       // distinct transient groups (behind the filter)
};

// Read the self-observed failure log. GET /api/friction returns the richer grouped shape above (the route
// extends listFrictionQueue's raw reports into groups). Read-only; never triggers a run.
export const getFailureLog = (projectId?: string | null) => get<FailureLogView>(
  `/api/friction${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`,
);
