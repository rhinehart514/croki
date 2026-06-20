import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Check, ChevronRight, CircleDot, Command, GitBranch,
  History, LoaderCircle, Play, RefreshCw, ScanLine, Sparkles,
  Target, TerminalSquare, Wrench,
} from "lucide-react";
import {
  applyWorkspaceRevision,
  createWorkspaceRevision,
  getConnectors,
  getGraphTemplate,
  getRevisionReadiness,
  getWorkspace,
  listWorkspaces,
  openWorkspace,
  rescanWorkspace,
  reviewWorkspaceRevision,
  runGraph,
  saveGraph,
} from "@/api";
import { ChangeSetPanel } from "@/components/ChangeSetPanel";
import { CitationList } from "@/components/CitationList";
import { GraphCanvas } from "@/components/GraphCanvas";
import { NodeEditor } from "@/components/NodeEditor";
import { ReportCanvas } from "@/components/ReportCanvas";
import { WorkspaceRail } from "@/components/WorkspaceRail";
import { Button } from "@/components/ui/button";
import type {
  ApplyReadiness, ConnectorMeta, FunnelStage, GTMGraph, GTMRevision,
  GTMRunResult, GTMWorkspace, NodeSelection, WorkspaceSummary,
} from "@/types";

const DEFAULT_REPO = "~/Buffalo-Projects";
const DEFAULT_OUTCOME = "project_created";
type AppMode = "workspace" | "graph";

function StateMark({ state }: { state: string }) {
  return (
    <span className={`state-mark state-${state}`}>
      {state === "proven" || state === "complete" ? <Check /> : <AlertTriangle />}
      {state}
    </span>
  );
}

function latestRevision(workspace: GTMWorkspace | null) {
  return workspace?.revisions.at(-1) ?? null;
}

export default function App() {
  const [mode, setMode] = useState<AppMode>("workspace");

  // Repository-backed workspace state
  const [repoPath, setRepoPath] = useState(DEFAULT_REPO);
  const [outcome, setOutcome] = useState(DEFAULT_OUTCOME);
  const [workspace, setWorkspace] = useState<GTMWorkspace | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceSelection, setWorkspaceSelection] = useState("step:diagnose");
  const [workspaceBusy, setWorkspaceBusy] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ApplyReadiness | null>(null);
  const [readinessFor, setReadinessFor] = useState<string | null>(null);

  // General GTM graph state
  const [graph, setGraph] = useState<GTMGraph | null>(null);
  const [runResult, setRunResult] = useState<GTMRunResult | null>(null);
  const [graphRunning, setGraphRunning] = useState(false);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [selection, setSelection] = useState<NodeSelection>(null);
  const [connectors, setConnectors] = useState<ConnectorMeta[]>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [graphSavedAt, setGraphSavedAt] = useState<string | null>(null);
  const [flowRuns, setFlowRuns] = useState<GTMRunResult[]>([]);

  const refreshWorkspaceList = useCallback(async () => {
    const response = await listWorkspaces();
    setWorkspaces(response.workspaces);
  }, []);

  const setActiveWorkspace = useCallback((next: GTMWorkspace) => {
    setWorkspace(next);
    setRepoPath(next.repo);
    setOutcome(next.outcome);
    setWorkspaceError(null);
    setReadiness(null);
    setReadinessFor(null);
  }, []);

  const openCurrentWorkspace = useCallback(async () => {
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      const { workspace: next } = await openWorkspace(repoPath, outcome);
      setActiveWorkspace(next);
      setWorkspaceSelection("step:diagnose");
      await refreshWorkspaceList();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  }, [outcome, refreshWorkspaceList, repoPath, setActiveWorkspace]);

  const openSavedWorkspace = useCallback(async (workspaceId: string) => {
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      const { workspace: next } = await getWorkspace(workspaceId);
      setActiveWorkspace(next);
      setWorkspaceSelection("step:diagnose");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  }, [setActiveWorkspace]);

  const verifyWorkspace = useCallback(async () => {
    if (!workspace) return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      const { workspace: next } = await rescanWorkspace(workspace.id);
      setActiveWorkspace(next);
      setWorkspaceSelection("step:verify");
      await refreshWorkspaceList();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  }, [refreshWorkspaceList, setActiveWorkspace, workspace]);

  const proposeRevision = useCallback(async () => {
    if (!workspace) return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      const { workspace: next, revision } = await createWorkspaceRevision(workspace.id);
      setActiveWorkspace(next);
      setWorkspaceSelection(`revision:${revision.id}`);
      await refreshWorkspaceList();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  }, [refreshWorkspaceList, setActiveWorkspace, workspace]);

  const reviewRevision = useCallback(async (
    revisionId: string,
    decision: "approve" | "reject",
    note: string,
  ) => {
    if (!workspace) return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      const { workspace: next } = await reviewWorkspaceRevision(workspace.id, revisionId, decision, note);
      setActiveWorkspace(next);
      setWorkspaceSelection(`revision:${revisionId}`);
      await refreshWorkspaceList();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  }, [refreshWorkspaceList, setActiveWorkspace, workspace]);

  const changeRevision = useCallback(async (revisionId: string, action: "apply" | "revert") => {
    if (!workspace) return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      const { workspace: next } = await applyWorkspaceRevision(workspace.id, revisionId, action);
      setActiveWorkspace(next);
      setWorkspaceSelection(`revision:${revisionId}`);
      await refreshWorkspaceList();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  }, [refreshWorkspaceList, setActiveWorkspace, workspace]);

  const executeGraph = useCallback(async (
    targetNodeId?: string,
    nextApprovals: Record<string, boolean> = approvals,
  ) => {
    if (!graph) return;
    setGraphRunning(true);
    setRunningNodeId(targetNodeId ?? null);
    setGraphError(null);
    try {
      const result = await runGraph(graph, { targetNodeId, approvals: nextApprovals });
      setRunResult(result);
      setFlowRuns((current) => [...current, result].slice(-10));
      if (result.storedRunCount !== undefined) {
        setGraph((current) => current ? {
          ...current,
          store: {
            path: current.store?.path ?? `.gtm/flows/${current.id}.json`,
            runs: result.storedRunCount ?? 0,
            lastRunAt: result.storedAt,
          },
        } : current);
      }
      const firstProblem = result.pendingGates[0]
        ?? Object.entries(result.nodes).find(([, node]) => !node.ok)?.[0]
        ?? targetNodeId;
      if (firstProblem) setSelection(firstProblem);
      if (!result.ok) setGraphError(result.error || "One or more steps need attention.");
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setGraphRunning(false);
      setRunningNodeId(null);
    }
  }, [approvals, graph]);

  const approveGate = useCallback(async (nodeId: string) => {
    const next = { ...approvals, [nodeId]: true };
    setApprovals(next);
    await executeGraph(undefined, next);
  }, [approvals, executeGraph]);

  const persistGraph = useCallback(async () => {
    if (!graph) return;
    setGraphRunning(true);
    setGraphError(null);
    try {
      const response = await saveGraph(graph);
      setGraph(response.graph);
      setGraphSavedAt(response.savedAt);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setGraphRunning(false);
    }
  }, [graph]);

  const handleNodePositionChange = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setGraphSavedAt(null);
    setGraph((current) => current ? {
      ...current,
      nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, position } : node),
    } : current);
  }, []);

  const updateGraph = useCallback((next: GTMGraph) => {
    setGraph(next);
    setGraphSavedAt(null);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([
      openWorkspace(DEFAULT_REPO, DEFAULT_OUTCOME),
      listWorkspaces(),
      getGraphTemplate(),
      getConnectors(),
    ]).then(([workspaceResponse, workspaceList, graphResponse, connectorResponse]) => {
      if (!live) return;
      setActiveWorkspace(workspaceResponse.workspace);
      setWorkspaces(workspaceList.workspaces);
      setGraph(graphResponse.graph);
      setFlowRuns(graphResponse.runs ?? []);
      setConnectors(connectorResponse.connectors);
    }).catch((error) => {
      if (live) setWorkspaceError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (live) setWorkspaceBusy(false);
    });
    return () => { live = false; };
  }, [setActiveWorkspace]);

  const selectedRevision = useMemo<GTMRevision | null>(() => {
    if (!workspaceSelection.startsWith("revision:") || !workspace) return null;
    const revisionId = workspaceSelection.slice("revision:".length);
    return workspace.revisions.find((revision) => revision.id === revisionId) ?? null;
  }, [workspace, workspaceSelection]);

  useEffect(() => {
    let live = true;
    if (!workspace || !selectedRevision || selectedRevision.status !== "approved") return () => { live = false; };
    getRevisionReadiness(workspace.id, selectedRevision.id)
      .then(({ readiness: next }) => {
        if (!live) return;
        setReadiness(next);
        setReadinessFor(selectedRevision.id);
      })
      .catch((error) => { if (live) setWorkspaceError(error instanceof Error ? error.message : String(error)); });
    return () => { live = false; };
  }, [selectedRevision, workspace]);

  const report = workspace?.report ?? null;
  const gap = report?.gaps[0] ?? null;
  const selectedStepId = workspaceSelection.startsWith("step:")
    ? workspaceSelection.slice("step:".length)
    : null;

  const selectedFunnelStage = useMemo<FunnelStage | null>(() => {
    if (!report || !selectedStepId?.startsWith("funnel:")) return null;
    return report.funnel.stages.find((stage) => stage.id === selectedStepId.slice(7)) ?? null;
  }, [report, selectedStepId]);

  const selectedNodeCategory = useMemo(() => {
    if (!graph || !selection) return null;
    return graph.nodes.find((node) => node.id === selection)?.category ?? null;
  }, [graph, selection]);

  const resourceConnectors = useMemo(
    () => connectors.filter((connector) =>
      connector.category === "resource"
      && graph?.nodes.some((node) => node.category === "resource" && node.connector === connector.id)
    ),
    [connectors, graph],
  );

  const graphSuccessfulNodes = runResult
    ? Object.values(runResult.nodes).filter((node) => node.ok).length
    : 0;

  return (
    <main className="app-shell">
      <header className="toolbar">
        <div className="brand"><span className="brand-mark"><Command /></span><span>GTM IDE</span></div>
        <div className="toolbar-divider" />
        <div className="mode-tabs" aria-label="Product mode">
          <button className={`mode-tab ${mode === "workspace" ? "mode-tab-active" : ""}`}
            onClick={() => setMode("workspace")} type="button">
            <ScanLine />Workspace
          </button>
          <button className={`mode-tab ${mode === "graph" ? "mode-tab-active" : ""}`}
            onClick={() => setMode("graph")} type="button">
            <Target />Flow library
          </button>
        </div>
        <div className="toolbar-spacer" />
        {mode === "workspace" && workspace ? (
          <div className="scan-meta"><CircleDot />{workspace.outcome} · {workspace.runs.length} proofs · {workspace.revisions.length} changes</div>
        ) : null}
        {mode === "graph" && graph ? (
          <div className="scan-meta"><CircleDot />{runResult ? `${graphSuccessfulNodes} nodes ok` : `${graph.name} · ${graph.nodes.length} nodes`}</div>
        ) : null}
      </header>

      <section className="workspace">
        <aside className="left-panel">
          {mode === "workspace" ? (
            <>
              <div className="panel-heading"><Sparkles /><span>Repository workspace</span></div>
              <form className="scan-form" onSubmit={(event) => { event.preventDefault(); void openCurrentWorkspace(); }}>
                <label>Repository<input value={repoPath} onChange={(event) => setRepoPath(event.target.value)} /></label>
                <label>GTM outcome<input value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label>
                <Button disabled={workspaceBusy} type="submit">
                  {workspaceBusy ? <LoaderCircle className="spin" /> : <Play />}
                  {workspaceBusy ? "Working locally…" : "Open workspace"}
                </Button>
              </form>
              {workspaceError ? (
                <div className="error-message" role="alert"><AlertTriangle />
                  <div><strong>Workspace needs attention</strong><p>{workspaceError}</p></div>
                </div>
              ) : null}
              <WorkspaceRail
                busy={workspaceBusy}
                onOpenWorkspace={(id) => void openSavedWorkspace(id)}
                onSelectRevision={(id) => setWorkspaceSelection(`revision:${id}`)}
                onSelectStep={(id) => setWorkspaceSelection(`step:${id}`)}
                selected={workspaceSelection}
                workspace={workspace}
                workspaces={workspaces}
              />
            </>
          ) : (
            <>
              <div className="panel-heading"><Target /><span>Flow library</span></div>
              <div className="pipeline-controls">
                <Button className="run-pipeline-btn" disabled={graphRunning || !graph}
                  onClick={() => void executeGraph()} type="button">
                  {graphRunning ? <LoaderCircle className="spin" /> : <Play />}
                  {graphRunning ? "Running flow…" : "Run full flow"}
                </Button>
                <Button className="secondary-button" disabled={graphRunning || !graph}
                  onClick={() => void persistGraph()} type="button">
                  <Check />{graphSavedAt ? "Flow saved" : "Save flow"}
                </Button>
              </div>
              {graphError ? (
                <div className="error-message" role="alert"><AlertTriangle />
                  <div><strong>Flow needs attention</strong><p>{graphError}</p></div>
                </div>
              ) : null}
              {graph ? (
                <div className="mirror-summary">
                  <div className="agent-message"><span className="agent-dot" />
                    <p>{graph.name} · {graph.nodes.length} nodes · {graph.store?.runs ?? 0} preserved runs</p>
                  </div>
                  {runResult ? (
                    <dl className="signal-list">
                      <div><dt>Successful</dt><dd>{graphSuccessfulNodes}</dd></div>
                      <div><dt>Blocked</dt><dd>{Object.values(runResult.nodes).filter((node) => node.blocked).length}</dd></div>
                      <div><dt>Review gates</dt><dd>{runResult.pendingGates.length}</dd></div>
                    </dl>
                  ) : null}
                </div>
              ) : null}
              {resourceConnectors.length ? (
                <section className="connector-status">
                  <div className="panel-heading"><span>Resources</span></div>
                  <div className="connector-list">
                    {resourceConnectors.map((connector) => (
                      <div className="connector-row" key={`${connector.category}:${connector.id}`}>
                        <span className={`connector-dot ${connector.configured && !connector.stub ? "ready" : "missing"}`} />
                        <span className="connector-name">{connector.name}</span>
                        {connector.stub
                          ? <span className="connector-key-hint">not implemented</span>
                          : !connector.configured && connector.envKey
                            ? <span className="connector-key-hint">{connector.envKey}</span>
                            : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              {flowRuns.length ? (
                <section className="rail-section">
                  <div className="rail-section-title"><History />Preserved runs</div>
                  <div className="recent-workspaces">
                    {[...flowRuns].reverse().slice(0, 5).map((run) => (
                      <button key={run.runId} onClick={() => {
                        setRunResult(run);
                        setSelection(run.pendingGates[0] ?? Object.keys(run.nodes)[0] ?? null);
                      }} type="button">
                        <strong>{run.targetNodeId ? `Step · ${run.targetNodeId}` : "Full flow"}</strong>
                        <span>{run.ok ? "Complete" : "Needs attention"} · {run.runId}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </aside>

        <section className="main-stage">
          <div className="canvas-header">
            <div>
              {mode === "workspace" ? (
                <><span>Grounded GTM outcome</span><small>Evidence, proposed code, decisions, and verification stay connected.</small></>
              ) : (
                <><span>General GTM flow</span><small>Run the whole flow or inspect and run one step at a time.</small></>
              )}
            </div>
            {mode === "workspace" && gap ? <StateMark state={gap.status} /> : null}
            {mode === "graph" && runResult ? <StateMark state={runResult.ok ? "complete" : "gap"} /> : null}
          </div>
          <div className="canvas">
            {mode === "workspace" ? (
              report ? (
                <ReportCanvas
                  onSelect={(id) => setWorkspaceSelection(`step:funnel:${id}`)}
                  report={report}
                  selectedId={selectedStepId?.startsWith("funnel:") ? selectedStepId.slice(7) : "flow"}
                />
              ) : (
                <div className="empty-canvas"><ScanLine /><strong>Open a repository to prove its measurable outcome.</strong></div>
              )
            ) : graph ? (
              <GraphCanvas
                connectors={connectors}
                graph={graph}
                onNodePositionChange={handleNodePositionChange}
                onSelect={setSelection}
                result={runResult}
                running={graphRunning}
                selection={selection}
              />
            ) : (
              <div className="empty-canvas"><Target /><strong>Loading the flow library…</strong></div>
            )}
          </div>
          <div className="console">
            <div className="panel-heading"><TerminalSquare /><span>{mode === "workspace" ? "Proof log" : "Run log"}</span></div>
            <div className={`console-line ${!workspace && !runResult ? "muted" : ""}`}>
              <span className="prompt">›</span>
              {mode === "workspace" ? (
                <span>{report?.headline ?? "Waiting for a repository workspace."}</span>
              ) : (
                <span>{graphRunning
                  ? runningNodeId ? `Running ${runningNodeId} and its dependencies…` : "Running the complete flow…"
                  : runResult ? `${runResult.runId} · ${runResult.ok ? "complete" : "attention required"}`
                    : "Select a node to inspect it, or run the complete flow."}</span>
              )}
            </div>
          </div>
        </section>

        <aside className="right-panel">
          {mode === "workspace" ? (
            selectedRevision ? (
              <>
                <div className="panel-heading"><GitBranch /><span>Change review</span></div>
                <ChangeSetPanel
                  busy={workspaceBusy}
                  error={workspaceError}
                  onApply={() => void changeRevision(selectedRevision.id, "apply")}
                  onRevert={() => void changeRevision(selectedRevision.id, "revert")}
                  onReview={(decision, note) => void reviewRevision(selectedRevision.id, decision, note)}
                  onVerify={() => void verifyWorkspace()}
                  readiness={readinessFor === selectedRevision.id ? readiness : null}
                  revision={selectedRevision}
                />
              </>
            ) : (
              <WorkspaceInspector
                busy={workspaceBusy}
                gap={gap}
                latest={latestRevision(workspace)}
                onCreateRevision={() => void proposeRevision()}
                onOpenRevision={(id) => setWorkspaceSelection(`revision:${id}`)}
                onVerify={() => void verifyWorkspace()}
                report={report}
                selectedFunnelStage={selectedFunnelStage}
                selectedStepId={selectedStepId}
                workspace={workspace}
              />
            )
          ) : (
            <>
              <div className="panel-heading"><Target /><span>{
                selectedNodeCategory === "context" ? "Context editor"
                  : selectedNodeCategory === "resource" ? "Resource"
                    : selectedNodeCategory === "gate" ? "Review gate"
                      : selection ? "Step inspector" : "Step inspector"
              }</span></div>
              <NodeEditor
                connectors={connectors}
                graph={graph}
                onApproveGate={(id) => void approveGate(id)}
                onRunNode={(id) => void executeGraph(id)}
                onUpdateGraph={updateGraph}
                runResult={runResult}
                runningNodeId={runningNodeId}
                selection={selection}
              />
            </>
          )}
        </aside>
      </section>
    </main>
  );
}

function WorkspaceInspector({
  workspace,
  report,
  gap,
  latest,
  selectedStepId,
  selectedFunnelStage,
  busy,
  onCreateRevision,
  onOpenRevision,
  onVerify,
}: {
  workspace: GTMWorkspace | null;
  report: GTMWorkspace["report"] | null;
  gap: GTMWorkspace["report"]["gaps"][number] | null;
  latest: GTMRevision | null;
  selectedStepId: string | null;
  selectedFunnelStage: FunnelStage | null;
  busy: boolean;
  onCreateRevision: () => void;
  onOpenRevision: (id: string) => void;
  onVerify: () => void;
}) {
  if (!workspace || !report) {
    return <div className="detail-empty"><ScanLine /><p>Open a repository workspace to begin.</p></div>;
  }

  if (selectedFunnelStage) {
    return (
      <>
        <div className="panel-heading"><ScanLine /><span>Stage evidence</span></div>
        <div className="detail-content">
          <StateMark state={selectedFunnelStage.state} />
          <h1>{selectedFunnelStage.label}</h1>
          <p>{selectedFunnelStage.description}</p>
          <div className="detail-section"><h2>Proof</h2><CitationList citations={selectedFunnelStage.citations} /></div>
        </div>
      </>
    );
  }

  const step = workspace.workflow.find((item) => item.id === selectedStepId)
    ?? workspace.workflow.find((item) => item.id === "diagnose");

  return (
    <>
      <div className="panel-heading">
        {step?.id === "verify" ? <RefreshCw /> : step?.id === "review" ? <History /> : <ScanLine />}
        <span>{step?.label ?? "Outcome diagnosis"}</span>
      </div>
      <div className="detail-content">
        <StateMark state={step?.status ?? gap?.status ?? "blind"} />
        <h1>{step?.id === "diagnose" ? gap?.title ?? "Outcome is instrumented" : step?.label}</h1>
        <p>{step?.description}</p>

        {step?.id === "inspect" ? (
          <>
            <dl className="signal-list">
              <div><dt>Files inspected</dt><dd>{report.filesScanned.toLocaleString()}</dd></div>
              <div><dt>Analytics</dt><dd>{report.analytics.providers.join(", ") || "not proven"}</dd></div>
              <div><dt>Source keys</dt><dd>{report.attribution.keys.join(", ") || "none"}</dd></div>
              <div><dt>Win properties</dt><dd>{report.winEvent.properties.join(", ") || "none"}</dd></div>
            </dl>
            <div className="detail-section"><h2>Repository evidence</h2>
              <CitationList citations={[...report.attribution.citations.slice(0, 3), ...report.winEvent.citations.slice(0, 3)]} />
            </div>
          </>
        ) : null}

        {step?.id === "diagnose" && gap ? (
          <>
            <div className="recommendation"><span>Next change</span><p>{gap.recommendation}</p></div>
            <div className="detail-section"><h2>Proof</h2><CitationList citations={gap.citations} /></div>
          </>
        ) : null}

        {step?.id === "propose" ? (
          <>
            <div className="recommendation">
              <span>Safety boundary</span>
              <p>The agent works in an isolated branch and worktree. Nothing is committed, pushed, or deployed.</p>
            </div>
            <Button disabled={busy || gap?.status !== "proven"} onClick={onCreateRevision} type="button">
              {busy ? <LoaderCircle className="spin" /> : <Wrench />}
              {busy ? "Creating change set…" : "Create grounded change set"}
            </Button>
          </>
        ) : null}

        {["review", "apply"].includes(step?.id ?? "") && latest ? (
          <button className="finding-row selected" onClick={() => onOpenRevision(latest.id)} type="button">
            <span><strong>{latest.status}</strong><small>{latest.summary}</small></span><ChevronRight />
          </button>
        ) : null}

        {step?.id === "verify" ? (
          <>
            <Button disabled={busy} onClick={onVerify} type="button">
              {busy ? <LoaderCircle className="spin" /> : <RefreshCw />}
              {busy ? "Verifying…" : "Rerun repository proof"}
            </Button>
            <div className="history-list">
              {[...workspace.runs].reverse().map((run) => (
                <div key={run.id}><strong>{run.type}</strong><span>{new Date(run.createdAt).toLocaleString()}</span><p>{run.headline}</p></div>
              ))}
            </div>
          </>
        ) : null}

        {workspace.decisions.length ? (
          <div className="detail-section">
            <h2>Decision history</h2>
            <div className="history-list">
              {[...workspace.decisions].reverse().slice(0, 6).map((decision) => (
                <div key={decision.id}><strong>{decision.decision ?? decision.type}</strong><span>{new Date(decision.createdAt).toLocaleString()}</span><p>{decision.note || decision.summary}</p></div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
