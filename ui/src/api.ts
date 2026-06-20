import type {
  ApplyReadiness, BuildResult, ConnectorMeta, GTMGraph, GTMRunResult,
  GTMRevision, GTMWorkspace, Pipeline, PipelineRunResult, ScanReport,
  WorkspaceSummary,
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

// ── GTM Graph (DAG — new) ───────────────────────────────────────────────────
export const getGraphTemplate = () =>
  get<{ graph: GTMGraph; runs?: GTMRunResult[] }>("/api/graph/template");

export const saveGraph = (graph: GTMGraph) =>
  post<{ graph: GTMGraph; savedAt: string }>("/api/graph/save", { graph });

export const runGraph = (
  graph: GTMGraph,
  options: { targetNodeId?: string; approvals?: Record<string, boolean> } = {},
) => post<GTMRunResult>("/api/graph/run", { graph, ...options });

// ── Legacy pipeline (kept for backward compat) ──────────────────────────────
export const getPipelineTemplate = () =>
  get<{ pipeline: Pipeline }>("/api/pipeline/template");

export const runPipeline = (pipeline: Pipeline) =>
  post<PipelineRunResult>("/api/pipeline/run", { pipeline });
