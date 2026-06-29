import type {
  ApplyReadiness, BuildResult, ConnectorMeta, Decisions, EngineState, GTMGraph, GTMProject, GTMRunResult,
  GTMRevision, GTMWorkspace, OperatorSession, OperatorSessionSummary,
  ScanReport, ScanPreview, ChannelRunDiff,
  WorkspaceSummary, ProjectSummary,
  ContextManifest, GtmLibrary,
  GraphOperation, GTMContractAudit,
  ProductModel, ProductModelEdit, ProductPinTargetKind,
  CapabilityServer, Person, CrossReferenceResult, ToolRegistryView, RegisteredTool, ChannelFeed, DirectedFeed,
  ClarityObject, ClarityKind, Me, Team, TeamMember, TeamRole,
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
export const scanRepository   = (repoPath: string, winEvent: string) =>
  post<ScanReport>("/api/scan", { repoPath, winEvent });

// The front-door scan preview: read the product, hand back the headline / stack / detected win event
// (with its file:line evidence) and an honest blind-attribution callout — what the founder sees BEFORE
// committing a goal. Returns the lightweight preview shape; degrades if the backend omits a field.
export const scanPreview = (repoPath: string, winEvent?: string) =>
  post<ScanPreview>("/api/scan", { repoPath, ...(winEvent ? { winEvent } : {}) });

// Native folder picker — the local server pops the OS folder dialog and returns the real path.
export const pickFolder = () =>
  post<{ path?: string; cancelled?: boolean; unsupported?: boolean; error?: string }>("/api/pick-folder", {});

export const buildTrackingFix = (report: ScanReport) =>
  post<BuildResult>("/api/build", { report });

// ── Durable workspace ───────────────────────────────────────────────────────
export const listWorkspaces = () =>
  get<{ workspaces: WorkspaceSummary[] }>("/api/workspaces");

export const openWorkspace = (repoPath: string, outcome: string) =>
  post<{ workspace: GTMWorkspace }>("/api/workspaces/open", { repoPath, outcome });

export const getWorkspace = (workspaceId: string) =>
  get<{ workspace: GTMWorkspace }>(`/api/workspaces/${workspaceId}`);

export const rescanWorkspace = (workspaceId: string) =>
  post<{ workspace: GTMWorkspace }>(`/api/workspaces/${workspaceId}/rescan`, {});

export const createWorkspaceRevision = (workspaceId: string) =>
  post<{ workspace: GTMWorkspace; revision: GTMRevision }>(
    `/api/workspaces/${workspaceId}/revisions`,
    {},
  );

export const reviewWorkspaceRevision = (
  workspaceId: string,
  revisionId: string,
  decision: "approve" | "reject",
  note = "",
) => post<{ workspace: GTMWorkspace; revision: GTMRevision }>(
  `/api/workspaces/${workspaceId}/revisions/${revisionId}/review`,
  { decision, note },
);

export const getRevisionReadiness = (workspaceId: string, revisionId: string) =>
  get<{ readiness: ApplyReadiness }>(
    `/api/workspaces/${workspaceId}/revisions/${revisionId}/readiness`,
  );

export const applyWorkspaceRevision = (
  workspaceId: string,
  revisionId: string,
  action: "apply" | "revert",
) => post<{ workspace: GTMWorkspace; revision: GTMRevision }>(
  `/api/workspaces/${workspaceId}/revisions/${revisionId}/${action}`,
  { confirm: true },
);

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

export const getPilotOutreachRecipe = () =>
  get<{ graph: GTMGraph }>("/api/graph/recipes/pilot-outreach");

// ── Artifacts — subagents & skills as real, fully-editable .md files ─────────
export type ArtifactType = "agent" | "skill";
export type ArtifactSummary = {
  type: ArtifactType; ref: string; name: string; description: string; tools: string; model: string;
};
export type ArtifactFile = {
  type: ArtifactType; ref: string; exists: boolean; content: string; meta: Record<string, string>;
};

export const listArtifacts = () =>
  get<{ agents: ArtifactSummary[]; skills: ArtifactSummary[] }>("/api/artifacts");

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
export type RunStreamEvent =
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
export const createOperatorSession = (projectId: string, goal: string, graphId?: string) =>
  post<{ session: OperatorSession; reused: boolean }>("/api/operator/sessions", {
    projectId, reuse: true, goal, graphId,
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
export const recordProductSignal = (input: {
  signalId: string;
  target: { kind: ProductPinTargetKind; id?: string | null };
  type?: string;
  summary?: string;
  observedAt?: string;
}) => post<{ productModel: ProductModel | null }>("/api/product-model/signal", input);

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

export const mergeProjects = (sourceIds: string[], targetId: string) =>
  post<{ activeProjectId: string | null; projects: ProjectSummary[] }>(
    "/api/projects/merge",
    { sourceIds, targetId },
  );

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

export const setActiveChannel = (channelId: string) =>
  setActiveWorkflow(channelId).then((result) => ({ activeChannelId: result.activeWorkflowId }));

export const compareChannelRuns = (channelId: string, before?: string, after?: string) => {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  if (after) params.set("after", after);
  const query = params.size ? `?${params.toString()}` : "";
  return get<{ diff: ChannelRunDiff }>(
    `/api/channels/${encodeURIComponent(channelId)}/runs/compare${query}`,
  );
};

// ── Identity + teams — the team space, members, and the release authority ──────
// Who am I and which teams am I in (personal team always exists). Identity rides on request headers
// from lib/identity; the server defaults to the founder when none are stamped.
export const getMe = () => get<Me>("/api/me");

export const listTeams = () =>
  get<{ teams: Array<{ id: string; name: string; memberCount: number; createdAt: string; updatedAt: string }> }>(
    "/api/teams",
  );

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

// ── Autonomous drive — one goal, the operator goes and does the work to the gate ──
// Launches a session primed to compose (if needed) and run the workflow to the shared founder gate,
// then stop. Never sends. The live event stream is read back via getOperatorSession polling.
export const operatorGo = (input: {
  goal: string;
  projectId?: string;
  teamId?: string;
  graphId?: string;
  model?: string;
  maxSteps?: number;
}) => post<{ session: OperatorSession; startedBy: { userId: string; name: string; email: string | null } }>(
  "/api/operator/go",
  input,
);

