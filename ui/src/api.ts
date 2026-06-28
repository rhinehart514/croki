import type {
  ApplyReadiness, BuildResult, ConnectorMeta, Decisions, EngineState, GTMGraph, GTMProject, GTMRunResult,
  GTMRevision, GTMWorkspace, OperatorSession, OperatorSessionSummary, PortfolioBrief,
  ScanReport, ChannelMeta, ChannelRunDiff, GTMNode, GTMEdge,
  WorkspaceSummary, ProjectSummary, OpportunityStudio, GTMOpportunity, DataAdapter,
  ContextManifest, GtmLibrary,
  GraphOperation, GTMContractAudit,
  OutcomeProgram, AgentCreationPolicy, AgentInstance, PersonalizationProfile, FeedbackSignal,
  AgentEvaluation, DomainEvent, ProductModel, ProductModelEdit, ProductPinTargetKind,
  CapabilityServer,
} from "@/types";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((payload as { error?: string }).error || `${path} failed (${res.status}).`);
  return payload;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
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

// ── Streaming ideation — workflows composed and streamed onto the canvas live ──
export type IdeateStreamEvent =
  | { type: "status"; message: string }
  | { type: "proposals"; channels: GTMOpportunity[]; agents: GTMOpportunity[] }
  | { type: "composing"; channelId: string; title: string }
  | { type: "thinking"; channelId: string | null; text: string }
  | { type: "workflow"; channelId: string; title: string; nodes: GTMNode[]; edges: GTMEdge[] }
  | { type: "workflow_error"; channelId: string; error: string }
  | { type: "done" }
  | { type: "error"; error: string };

// Ideate over SSE: proposals arrive first, then each channel's real composed graph streams in as
// it finishes. onEvent fires per frame; resolves when the stream ends.
export async function ideateStream(
  projectId: string,
  onEvent: (event: IdeateStreamEvent) => void,
): Promise<void> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok || !res.body) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Ideation stream failed (${res.status}).`);
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
        try { onEvent(JSON.parse(line.slice(6)) as IdeateStreamEvent); } catch { /* skip malformed frame */ }
      }
    }
  }
}

// ── Durable resident operator ────────────────────────────────────────────────
export const listOperatorSessions = (projectId?: string) =>
  get<{ sessions: OperatorSessionSummary[] }>(
    `/api/operator/sessions${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`,
  );

export const getOperatorSession = (sessionId: string) =>
  get<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}`);

export const createOperatorSession = (goal: string, graphId?: string, programId?: string) =>
  post<{ session: OperatorSession }>("/api/operator/sessions", { goal, graphId, programId });

export const resumeOperatorSession = (sessionId: string, input: string) =>
  post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/resume`, { input });

export const resolveOperatorGate = (
  sessionId: string,
  payload: { approvals?: Record<string, boolean>; decisions?: Decisions },
) => post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/gate`, payload);

export const cancelOperatorSession = (sessionId: string) =>
  post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/cancel`, {});

// Accept or discard a graph change the operator staged for review (the on-canvas ghost proposal). An
// optional note rides along — a reject note is a redirect (Claude changes it), an accept note a quiet
// annotation the operator reads and the learning loop can later pick up.
export const resolveOperatorProposal = (sessionId: string, accept: boolean, note?: string) =>
  post<{ session: OperatorSession }>(`/api/operator/sessions/${sessionId}/proposal`, { accept, note });

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

export const getOpportunities = (projectId: string) =>
  get<{ opportunities: OpportunityStudio }>(
    `/api/projects/${encodeURIComponent(projectId)}/opportunities`,
  );

export const getPrograms = (projectId: string) =>
  get<{
    programs: OutcomeProgram[];
    policies: AgentCreationPolicy[];
    foundry: {
      instances: AgentInstance[];
      profiles: PersonalizationProfile[];
      evaluations: AgentEvaluation[];
    };
    feedback: { signals: FeedbackSignal[] };
    events: DomainEvent[];
  }>(`/api/projects/${encodeURIComponent(projectId)}/programs`);

export const runProgram = (
  projectId: string,
  programId: string,
  options: { targetNodeId?: string; approvals?: Record<string, boolean>; decisions?: Decisions; resumeRunId?: string } = {},
) => post<{
  programId: string;
  graphId: string;
  programStatus: string;
  storedRunCount: number;
  feedbackSignals: number;
  evaluations: number;
  nextVersions: Array<{ policyId: string; agentInstanceId: string; previousInstanceId: string | null; version: number }>;
  result: GTMRunResult;
}>(`/api/projects/${encodeURIComponent(projectId)}/programs/${encodeURIComponent(programId)}/run`, options);

// Program run over SSE — the program canvas streams node-by-node like the raw-graph path. run_done
// carries the program summary (status, learning signals, next agent versions) the batch endpoint did.
export type ProgramRunStreamEvent =
  | { type: "node_start"; nodeId: string; category?: string; kind?: string; label?: string }
  | { type: "node_done"; nodeId: string; result: GTMRunResult["nodes"][string] }
  | {
      type: "run_done";
      result: GTMRunResult;
      programStatus: string;
      storedRunCount: number;
      feedbackSignals: number;
      evaluations: number;
      nextVersions: Array<{ policyId: string; agentInstanceId: string; previousInstanceId: string | null; version: number }>;
    }
  | { type: "run_error"; error: string };

export async function runProgramStream(
  projectId: string,
  programId: string,
  options: { approvals?: Record<string, boolean>; decisions?: Decisions; resumeRunId?: string },
  onEvent: (event: ProgramRunStreamEvent) => void,
): Promise<void> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/programs/${encodeURIComponent(programId)}/run/stream`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options) },
  );
  if (!res.ok || !res.body) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Program run stream failed (${res.status}).`);
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
        try { onEvent(JSON.parse(line.slice(6)) as ProgramRunStreamEvent); } catch { /* skip malformed frame */ }
      }
    }
  }
}

export const generateOpportunities = (projectId: string) =>
  post<{ opportunities: OpportunityStudio }>(
    `/api/projects/${encodeURIComponent(projectId)}/opportunities/generate`,
    {},
  );

export const updateOpportunity = (
  projectId: string,
  opportunityId: string,
  patch: Partial<GTMOpportunity>,
) => post<{ opportunity: GTMOpportunity }>(
  `/api/projects/${encodeURIComponent(projectId)}/opportunities/${encodeURIComponent(opportunityId)}`,
  { patch },
);

// Preview a composition WITHOUT persisting: returns the would-be graph (nodes/edges) so the founder
// can review it ghosted on the canvas before anything lands. Mirrors the operator's stage-then-gate
// proposal. The apply path below (composeOpportunityChannel) persists the exact previewed graph.
export const previewOpportunityChannel = (
  projectId: string,
  input: {
    channelOpportunityId: string;
    agentOpportunityIds: string[];
    name?: string;
    objective?: string;
    input?: DataAdapter;
    output?: DataAdapter;
  },
) => post<{ channelOpportunityId: string; name: string; objective: string; graph: { nodes: GTMNode[]; edges: GTMEdge[] } }>(
  `/api/projects/${encodeURIComponent(projectId)}/compose/preview`,
  input,
);

export const composeOpportunityChannel = (
  projectId: string,
  input: {
    channelOpportunityId: string;
    agentOpportunityIds: string[];
    name?: string;
    objective?: string;
    input?: DataAdapter;
    output?: DataAdapter;
    // When present, the apply path persists this exact previewed graph instead of re-composing —
    // the model is never re-run behind the founder's back on accept.
    graph?: { nodes: GTMNode[]; edges: GTMEdge[] };
  },
) => post<{ channel: ChannelMeta; program: OutcomeProgram; agents: Array<{ instance: AgentInstance; policy: AgentCreationPolicy; profile: PersonalizationProfile }>; graph: GTMGraph }>(
  `/api/projects/${encodeURIComponent(projectId)}/compose`,
  input,
);

export const setActiveWorkflow = (workflowId: string) =>
  post<{ activeWorkflowId: string; activeChannelId?: string }>("/api/project/active-workflow", { workflowId });

export const setActiveChannel = (channelId: string) =>
  setActiveWorkflow(channelId).then((result) => ({ activeChannelId: result.activeWorkflowId }));

export const createWorkflow = (input: { name: string; objective: string; kind?: string }) =>
  post<{ workflow: ChannelMeta; channel?: ChannelMeta }>("/api/program-workflows", input)
    .then((result) => ({ workflow: result.workflow ?? result.channel! }));

export const createChannel = (input: { name: string; objective: string; kind?: string }) =>
  createWorkflow(input).then((result) => ({ channel: result.workflow }));

export const duplicateWorkflow = (workflowId: string, input: { name: string; objective?: string }) =>
  post<{ workflow?: ChannelMeta; channel?: ChannelMeta }>(
    `/api/program-workflows/${encodeURIComponent(workflowId)}/duplicate`,
    input,
  ).then((result) => ({ workflow: result.workflow ?? result.channel! }));

export const duplicateChannel = (channelId: string, input: { name: string; objective?: string }) =>
  duplicateWorkflow(channelId, input).then((result) => ({ channel: result.workflow }));

export const updateWorkflow = (
  workflowId: string,
  patch: Partial<Pick<ChannelMeta, "name" | "objective" | "kind" | "enabled">>,
) => post<{ workflow?: ChannelMeta; channel?: ChannelMeta }>(
  `/api/program-workflows/${encodeURIComponent(workflowId)}/update`,
  patch,
).then((result) => ({ workflow: result.workflow ?? result.channel! }));

export const updateChannel = (
  channelId: string,
  patch: Partial<Pick<ChannelMeta, "name" | "objective" | "kind" | "enabled">>,
) => updateWorkflow(channelId, patch).then((result) => ({ channel: result.workflow }));

export const getPortfolioBrief = () =>
  get<{ brief: PortfolioBrief }>("/api/project/brief");

export const createPortfolioBriefArtifact = () =>
  post<{ artifact: Record<string, unknown>; sharedContextVersion: number }>(
    "/api/project/artifacts/portfolio-brief",
    {},
  );

export const compareChannelRuns = (channelId: string, before?: string, after?: string) => {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  if (after) params.set("after", after);
  const query = params.size ? `?${params.toString()}` : "";
  return get<{ diff: ChannelRunDiff }>(
    `/api/channels/${encodeURIComponent(channelId)}/runs/compare${query}`,
  );
};

