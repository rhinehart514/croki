import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, LoaderCircle, Play, Sparkles, X,
} from "lucide-react";
import {
  applyGraphOperations as applyGraphOperationsApi,
  auditGraph,
  getConnectors,
  getEngineState,
  getContext,
  getLibrary,
  getGraphTemplate,
  getPilotOutreachRecipe,
  getOperatorSession,
  getProject,
  getOpportunities,
  listProjects,
  runGraph,
  activateProject,
  cancelOperatorSession,
  composeOpportunityChannel,
  createChannel,
  createProject,
  createOperatorSession,
  ideateStream,
  listOperatorSessions,
  resolveOperatorGate,
  resumeOperatorSession,
  runGraphStream,
  saveGraph,
  setActiveChannel,
  updateOpportunity,
} from "@/api";
import { ArtifactEditor } from "@/components/ArtifactEditor";
import { ComposerDock } from "@/components/ComposerDock";
import { GraphCanvas } from "@/components/GraphCanvas";
import { GoalLauncher } from "@/components/GoalLauncher";
import { NodeEditor } from "@/components/NodeEditor";
import { GtmExplorer } from "@/components/GtmExplorer";
import { buildIdeationCanvas, buildChannelDefaults, channelIdFromNode, type LaneState } from "@/lib/ideationGraph";
import { ProductUnderstanding } from "@/components/ProductUnderstanding";
import { ProjectPicker } from "@/components/ProjectPicker";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { SimulationPanel } from "@/components/SimulationPanel";
import { Button } from "@/components/ui/button";
import type {
  ChannelMeta, ConnectorMeta, ContextManifest, DataAdapter, Decisions, EngineState, GateDecision, GraphOperation, GtmLibrary, GTMContractAudit, GTMGraph, GTMNode, GTMOpportunity,
  GTMProject, GTMRunResult, NodeSelection, OperatorSession, OpportunityStudio as OpportunityStudioState, ProjectSummary,
} from "@/types";

type MainTab = "build" | "simulate" | "run";

// Health → band color, identical to the canvas node badge (GraphCanvas healthHex), so a
// node's health reads the same number and color on the canvas, in the editor, and in the rail.
function healthHex(health: number): string {
  if (health < 50) return "#dc2626";
  if (health < 70) return "#d97706";
  if (health < 85) return "#ca8a04";
  return "#16a34a";
}

// The context pill — the north star, made visible in the toolbar. It shows what the model
// actually receives, layer by layer, derived from the real assembled manifest (never a config
// percentage). Taste is shown even at 0 chars on purpose: an empty moat is a signal to the
// founder that nothing has been gated yet. Falls back to the old config-completeness % only
// before the manifest loads.
const CONTEXT_LAYERS: Array<{ key: string; label: string }> = [
  { key: "product", label: "product" },
  { key: "taste", label: "taste" },
  { key: "state", label: "state" },
];

function ContextPill({ manifest, fallbackPct }: { manifest: ContextManifest | null; fallbackPct: number }) {
  if (!manifest) {
    return (
      <div className="loop-context-badge" title="Assembled model context (loading)">
        <span className="loop-context-dot" style={{ background: fallbackPct > 60 ? "var(--proven)" : "var(--gap)" }} />
        Context {fallbackPct}%
      </div>
    );
  }
  const byName = new Map((manifest.providers ?? []).map((p) => [p.name, p] as const));
  const total = manifest.totalChars ?? 0;
  const tasteChars = byName.get("taste")?.chars ?? 0;
  const title = `What Claude receives for this channel: ${manifest.contributingProviders ?? 0} providers, ${total} chars assembled. `
    + (tasteChars > 0 ? "Taste is shaping runs." : "Taste is empty — gate a draft to start the learning loop.");
  return (
    <div className="loop-context-badge" title={title}>
      <span className="loop-context-dot" style={{ background: total > 0 ? "var(--proven)" : "var(--gap)" }} />
      Context
      {CONTEXT_LAYERS.map(({ key, label }) => {
        const chars = byName.get(key)?.chars ?? 0;
        return (
          <span key={key} style={{ marginLeft: 8, opacity: chars > 0 ? 1 : 0.45, fontVariantNumeric: "tabular-nums" }}>
            {label} {chars}
          </span>
        );
      })}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>("build");
  // The canvas IS the workspace. "projects" is the only other base view — the cold-start picker
  // before any product exists. Understand and Opportunities are no longer destinations that swap
  // the canvas out; they float OVER it as dismissable overlays (set via `overlay`), so the IDE is
  // never replaced. Channels live in the explorer, not a page.
  const [view, setView] = useState<"projects" | "canvas">("canvas");
  const [overlay, setOverlay] = useState<"understand" | null>(null);
  // Ideation runs IN the canvas: each proposed channel is drawn as its own workflow, multiple
  // workflows laid out in lanes on one canvas. The chat narrates; clicking a lane builds it.
  const [ideationOpen, setIdeationOpen] = useState(false);
  const [ideationLane, setIdeationLane] = useState<string | null>(null); // selected channel id
  // Per-channel compose status, filled live as the ideation stream lands each real workflow.
  const [laneStates, setLaneStates] = useState<Record<string, LaneState>>({});
  const [ideationStatus, setIdeationStatus] = useState<string | null>(null);
  const [ideationThinking, setIdeationThinking] = useState<string>(""); // live model reasoning
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProjectState] = useState<GTMProject | null>(null);
  const [opportunityStudio, setOpportunityStudio] = useState<OpportunityStudioState | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);

  // Graph state
  const [graph, setGraph] = useState<GTMGraph | null>(null);
  const [runResult, setRunResult] = useState<GTMRunResult | null>(null);
  const [graphRunning, setGraphRunning] = useState(false);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [selection, setSelection] = useState<NodeSelection>(null);
  const [connectors, setConnectors] = useState<ConnectorMeta[]>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [decisions, setDecisions] = useState<Decisions>({});
  const [graphSavedAt, setGraphSavedAt] = useState<string | null>(null);
  const [flowRuns, setFlowRuns] = useState<GTMRunResult[]>([]);
  const [contractAudits, setContractAudits] = useState<Record<string, GTMContractAudit>>({});
  // Engine state powers inline node health and the Problems rail.
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [contextManifest, setContextManifest] = useState<ContextManifest | null>(null);
  const [library, setLibrary] = useState<GtmLibrary | null>(null);
  const [operatorSession, setOperatorSession] = useState<OperatorSession | null>(null);
  // Channels you're building — shown and switchable in the persistent co-pilot dock.
  const [channels, setChannels] = useState<ChannelMeta[]>([]);
  // The full-markdown editor for the real subagent/skill artifacts an open step runs.
  const [artifactEdit, setArtifactEdit] = useState<{ type: "agent" | "skill"; ref: string } | null>(null);
  const operatorGraphRevision = useRef<number | null>(null);
  const operatorRunId = useRef<string | null>(null);
  // Guards the one-time auto-open of the ideation canvas when an operator run first proposes flows.
  const ideationAutoOpened = useRef<boolean>(false);
  const nodeModalRef = useRef<HTMLElement | null>(null);
  const nodeModalCloseRef = useRef<HTMLButtonElement | null>(null);

  const loadEngine = useCallback((channelId: string | null = activeChannelId) => {
    getEngineState(channelId ?? undefined).then((res) => setEngine(res.engine)).catch(console.error);
    // Refresh the assembled-context manifest alongside the engine: a run changes taste and state,
    // so the context pill must move with the loop, not lag it.
    getContext(channelId ?? undefined).then((res) => setContextManifest(res.manifest)).catch(console.error);
  }, [activeChannelId]);

  // Keep the context pill in sync with the active channel, even when the channel changes through
  // paths that don't call loadEngine (channel switch, operator hand-off).
  useEffect(() => {
    if (!activeChannelId) return;
    let live = true;
    getContext(activeChannelId).then((res) => { if (live) setContextManifest(res.manifest); }).catch(console.error);
    return () => { live = false; };
  }, [activeChannelId]);

  // The library (subagents + skills on disk) is product-wide; load it once for the explorer.
  useEffect(() => {
    getLibrary().then(setLibrary).catch(console.error);
  }, []);

  const loadChannel = useCallback(async (channelId: string) => {
    setGraphRunning(true);
    setGraphError(null);
    try {
      const [graphResponse, engineResponse] = await Promise.all([
        getGraphTemplate(channelId),
        getEngineState(channelId),
        setActiveChannel(channelId),
      ]);
      setActiveChannelId(channelId);
      setGraph(graphResponse.graph);
      setFlowRuns(graphResponse.runs ?? []);
      setRunResult(null);
      setSelection(null);
      setApprovals({});
      setDecisions({});
      setGraphSavedAt(graphResponse.graph.store?.lastRunAt ?? null);
      setEngine(engineResponse.engine);
      setView("canvas");
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setGraphRunning(false);
    }
  }, []);

  const refreshProjectScope = useCallback(async () => {
    const [catalog, projectResponse] = await Promise.all([listProjects(), getProject()]);
    const studioResponse = await getOpportunities(projectResponse.project.id).catch(() => ({ opportunities: null }));
    setProjects(catalog.projects);
    setActiveProjectState(projectResponse.project);
    setChannels(projectResponse.project.channels);
    setOpportunityStudio(studioResponse.opportunities);
    return projectResponse.project;
  }, []);

  // Boot
  useEffect(() => {
    let live = true;
    Promise.all([getProject(), getConnectors(), listProjects()]).then(async ([projectResponse, connectorResponse, catalog]) => {
      if (!live) return;
      const channelId = projectResponse.project.activeChannelId || projectResponse.project.channels[0]?.id;
      setConnectors(connectorResponse.connectors);
      setChannels(projectResponse.project.channels);
      setActiveProjectState(projectResponse.project);
      setProjects(catalog.projects);
      getOpportunities(projectResponse.project.id).then((response) => {
        if (live) setOpportunityStudio(response.opportunities);
      }).catch(() => {});
      if (!channelId) {
        // A product with no channels still lands on the canvas (its empty state guides the first
        // move); only a total cold start (no workspace) shows the product picker.
        setView(projectResponse.project.sharedContext.repository.workspaceId ? "canvas" : "projects");
        const engineResponse = await getEngineState();
        if (live) setEngine(engineResponse.engine);
        return;
      }
      const [graphResponse, engineResponse] = await Promise.all([
        getGraphTemplate(channelId),
        getEngineState(channelId),
      ]);
      if (!live) return;
      setActiveChannelId(channelId);
      setGraph(graphResponse.graph);
      setFlowRuns(graphResponse.runs ?? []);
      setEngine(engineResponse.engine);
    }).catch(console.error);
    return () => { live = false; };
  }, []);

  // Restore the latest durable operator session for the active product. Re-runs
  // whenever the active product changes, so switching products in the top-left
  // swaps the Claude session to that product's own chat (or clears it if none).
  const activeProjectId = activeProject?.id ?? null;
  useEffect(() => {
    if (!activeProjectId) return;
    let live = true;
    listOperatorSessions(activeProjectId)
      .then(async ({ sessions }) => {
        if (!live) return;
        const latest = sessions[0];
        if (!latest) { setOperatorSession(null); return; }
        const response = await getOperatorSession(latest.id);
        if (!live) return;
        setOperatorSession(response.session);
        operatorGraphRevision.current = response.session.graphRevision;
      })
      .catch(() => {});
    return () => { live = false; };
  }, [activeProjectId]);

  const syncOperator = useCallback((next: OperatorSession) => {
    setOperatorSession(next);
    if (operatorGraphRevision.current !== next.graphRevision) {
      operatorGraphRevision.current = next.graphRevision;
      if (activeChannelId !== next.graphId) setActiveChannelId(next.graphId);
      void getGraphTemplate(next.graphId).then((response) => {
        setGraph(response.graph);
        setFlowRuns(response.runs ?? []);
        setGraphSavedAt(response.graph.store?.lastRunAt ?? null);
      });
    }
    const pendingRun = next.pendingGate?.runResult;
    if (pendingRun && operatorRunId.current !== pendingRun.runId) {
      operatorRunId.current = pendingRun.runId;
      setRunResult(pendingRun);
      setFlowRuns((current) => [...current.filter((run) => run.runId !== pendingRun.runId), pendingRun].slice(-10));
      const gateId = next.pendingGate?.nodeIds[0];
      if (gateId) setSelection(gateId);
      loadEngine();
    }
  }, [activeChannelId, loadEngine]);

  // Active sessions are executed server-side. Polling keeps the event trail and
  // graph in lockstep even if the panel is closed and reopened.
  const operatorSessionId = operatorSession?.id ?? null;
  const operatorSessionStatus = operatorSession?.status ?? null;
  useEffect(() => {
    if (!operatorSessionId || !operatorSessionStatus
      || ["completed", "blocked", "failed", "cancelled"].includes(operatorSessionStatus)) return;
    let live = true;
    const poll = async () => {
      try {
        const response = await getOperatorSession(operatorSessionId);
        if (!live) return;
        syncOperator(response.session);
        // While Claude is thinking, surface the flows it's proposing — open the ideation canvas the
        // moment channels appear, so the founder watches workflows load instead of an empty canvas.
        if (activeProjectId && !operatorRunId.current) {
          const opp = await getOpportunities(activeProjectId).catch(() => null);
          if (live && opp?.opportunities) {
            setOpportunityStudio(opp.opportunities);
            const hasChannels = (opp.opportunities.items ?? []).some((i) => i.type === "channel" && i.status !== "rejected");
            if (hasChannels && !ideationAutoOpened.current) {
              ideationAutoOpened.current = true;
              setIdeationOpen(true);
            }
          }
        }
      } catch {
        // Preserve the last durable state; the next poll may recover.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 900);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [operatorSessionId, operatorSessionStatus, syncOperator]);

  // Graph actions
  const executeGraph = useCallback(async (
    targetNodeId?: string,
    nextApprovals: Record<string, boolean> = approvals,
    nextDecisions: Decisions = decisions,
    resumeRunId?: string,
  ) => {
    if (!graph) return;
    setGraphRunning(true);
    setRunningNodeId(targetNodeId ?? null);
    setGraphError(null);
    try {
      const result = await runGraph(graph, {
        targetNodeId,
        approvals: nextApprovals,
        decisions: nextDecisions,
        resumeRunId,
      });
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
      loadEngine(graph?.id ?? activeChannelId); // a run updates the ledger → refresh health + problems
    }
  }, [activeChannelId, approvals, decisions, graph, loadEngine]);

  // Streaming run — the full loop, animated. Each step lights up as it runs and its
  // content lands the moment it succeeds, instead of one batch at the end.
  const streamRun = useCallback(async () => {
    if (!graph) return;
    setGraphRunning(true);
    setRunningNodeId(null);
    setGraphError(null);
    setRunResult({ runId: `live-${Date.now()}`, graphId: graph.id, ok: false, nodes: {}, executionOrder: [], pendingGates: [], feedbackEdges: [] });
    try {
      await runGraphStream(graph, { approvals, decisions }, (ev) => {
        if (ev.type === "node_start") {
          setRunningNodeId(ev.nodeId);
        } else if (ev.type === "node_done") {
          setRunningNodeId((cur) => (cur === ev.nodeId ? null : cur));
          // Merge this step's result in live so its card count + the detail panel update now.
          setRunResult((cur) => cur ? { ...cur, nodes: { ...cur.nodes, [ev.nodeId]: ev.result } } : cur);
          // Reveal what this step just produced — the panel fills with its content as it succeeds.
          if (ev.result.items?.length || ev.result.pendingReview) setSelection(ev.nodeId);
        } else if (ev.type === "run_done") {
          const result = ev.result;
          setRunResult(result);
          setFlowRuns((current) => [...current, result].slice(-10));
          if (result.storedRunCount !== undefined) {
            setGraph((current) => current ? {
              ...current,
              store: { path: current.store?.path ?? `.gtm/flows/${current.id}.json`, runs: result.storedRunCount ?? 0, lastRunAt: result.storedAt },
            } : current);
          }
          // Land on the gate (or first problem) so the staged content is revealed — the climax.
          const land = result.pendingGates[0]
            ?? Object.entries(result.nodes).find(([, n]) => !n.ok)?.[0];
          if (land) setSelection(land);
          if (!result.ok && !result.pendingGates.length) setGraphError(result.error || "One or more steps need attention.");
        } else if (ev.type === "run_error") {
          setGraphError(ev.error);
        }
      });
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setGraphRunning(false);
      setRunningNodeId(null);
      loadEngine(graph?.id ?? activeChannelId);
    }
  }, [activeChannelId, approvals, decisions, graph, loadEngine]);

  const approveGate = useCallback(async (nodeId: string) => {
    const next = { ...approvals, [nodeId]: true };
    setApprovals(next);
    if (operatorSession?.status === "waiting_for_gate" && operatorSession.pendingGate?.nodeIds.includes(nodeId)) {
      const response = await resolveOperatorGate(operatorSession.id, { approvals: next });
      syncOperator(response.session);
      return;
    }
    await executeGraph(undefined, next, decisions, runResult?.runId);
  }, [approvals, decisions, executeGraph, operatorSession, runResult?.runId, syncOperator]);

  // Per-item founder review: record approve/reject/edit decisions for a gate
  // node, then re-run so they flow into the run ledger and shape the next run.
  const submitGateReview = useCallback(async (
    nodeId: string,
    nodeDecisions: Record<string, GateDecision>,
  ) => {
    const next: Decisions = { ...decisions, [nodeId]: { ...(decisions[nodeId] ?? {}), ...nodeDecisions } };
    setDecisions(next);
    if (operatorSession?.status === "waiting_for_gate" && operatorSession.pendingGate?.nodeIds.includes(nodeId)) {
      const response = await resolveOperatorGate(operatorSession.id, { approvals, decisions: next });
      syncOperator(response.session);
      return;
    }
    await executeGraph(undefined, approvals, next, runResult?.runId);
  }, [decisions, approvals, executeGraph, operatorSession, runResult?.runId, syncOperator]);

  const persistGraph = useCallback(async () => {
    if (!graph) return;
    setGraphRunning(true);
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
    if (!graph) return;
    const timer = window.setTimeout(() => {
      auditGraph(graph, runResult)
        .then((response) => setContractAudits(response.audits))
        .catch((error) => setGraphError(error instanceof Error ? error.message : String(error)));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [graph, runResult]);

  const applyOperations = useCallback(async (operations: GraphOperation[]) => {
    if (!graph) return null;
    try {
      const response = await applyGraphOperationsApi(graph, operations);
      setGraph(response.graph);
      setGraphSavedAt(null);
      setGraphError(null);
      return response.graph;
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [graph]);

  // ── Drag-and-drop editing of the workflow Claude generated (un-gatekeeping) ──
  // Wire a data edge by dragging between node handles.
  const handleGraphConnect = useCallback((source: string, target: string) => {
    if (!source || !target || source === target) return;
    if (graph?.edges.some((edge) => edge.source === source && edge.target === target)) return;
    void applyOperations([{
      type: "connect_nodes",
      edge: { id: `e-${source}-${target}-${Date.now().toString(36)}`, source, target, edgeType: "data" },
    }]);
  }, [applyOperations, graph]);

  // Drop a new step onto the canvas — a real data source (scrape/leads/CSV/CRM) or any open step.
  const handleAddNode = useCallback((spec: Partial<GTMNode> & { label: string }) => {
    if (!graph) return;
    const base = spec.kind && spec.kind !== "tool" ? spec.kind : spec.category ?? "step";
    const newId = `${base}-${Date.now().toString(36)}`;
    const x = graph.nodes.reduce((maximum, node) => Math.max(maximum, node.position?.x ?? 0), 0) + 264;
    const node = {
      id: newId, label: spec.label, position: { x, y: 0 }, config: spec.config ?? {}, contract: spec.contract,
      ...(spec.kind && spec.kind !== "tool"
        ? { kind: spec.kind, category: spec.category ?? "generate", ref: spec.ref ?? "" }
        : { category: spec.category ?? "source", connector: spec.connector ?? "manual" }),
    } as GTMNode;
    void applyOperations([{ type: "add_node", node }]).then((next) => {
      if (next) setSelection(newId);
    });
  }, [applyOperations, graph]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    void applyOperations([{ type: "remove_node", nodeId }]).then((next) => {
      if (next) setSelection(null);
    });
  }, [applyOperations]);

  const handleDeleteEdges = useCallback((edgeIds: string[]) => {
    if (!edgeIds.length) return;
    void applyOperations(edgeIds.map((edgeId) => ({ type: "disconnect_nodes", edgeId })));
  }, [applyOperations]);

  const handleLoadPilotRecipe = useCallback(async () => {
    if (!graph) return;
    try {
      const response = await getPilotOutreachRecipe();
      setGraph({
        ...response.graph,
        id: graph.id,
        name: graph.name,
        revision: (graph.revision ?? 0) + 1,
        store: graph.store,
      });
      setGraphSavedAt(null);
      setSelection("input-metros");
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    }
  }, [graph]);

  const handleCommandSubmit = useCallback(async (goal: string) => {
    const response = await createOperatorSession(goal, graph?.id);
    operatorGraphRevision.current = response.session.graphRevision;
    operatorRunId.current = null;
    ideationAutoOpened.current = false; // a new goal may propose fresh flows to watch load
    setOperatorSession(response.session);
  }, [graph?.id]);

  // One conversation: talking to Claude continues the live session, or starts a new one
  // when idle. The dock decides nothing about safety — App owns create vs. resume.
  const handleComposerSend = useCallback(async (text: string) => {
    const s = operatorSession;
    const resumable = s && ["waiting_for_input", "interrupted", "failed"].includes(s.status);
    if (resumable && s) {
      const response = await resumeOperatorSession(s.id, text);
      syncOperator(response.session);
    } else {
      await handleCommandSubmit(text);
    }
  }, [operatorSession, handleCommandSubmit, syncOperator]);

  const handleCreateChannel = useCallback(async (name: string, objective: string) => {
    const result = await createChannel({ name, objective });
    const project = await getProject();
    setChannels(project.project.channels);
    await loadChannel(result.channel.id);
  }, [loadChannel]);

  const handleProjectOpen = useCallback(async (projectId: string) => {
    setProjectBusy(true);
    setGraphError(null);
    try {
      await activateProject(projectId);
      setOperatorSession(null);
      setGraph(null);
      setActiveChannelId(null);
      const project = await refreshProjectScope();
      const channelId = project.activeChannelId || project.channels[0]?.id;
      if (channelId) await loadChannel(channelId);
      setView("canvas");
      setOverlay(null);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBusy(false);
    }
  }, [loadChannel, refreshProjectScope]);

  const handleProjectCreate = useCallback(async (input: { name?: string; repoPath: string; outcome: string }) => {
    setProjectBusy(true);
    setGraphError(null);
    try {
      await createProject(input);
      setOperatorSession(null);
      setGraph(null);
      setActiveChannelId(null);
      await refreshProjectScope();
      setView("canvas");
      setOverlay("understand");
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBusy(false);
    }
  }, [refreshProjectScope]);

  const handleOpportunityUpdate = useCallback(async (opportunityId: string, patch: Partial<GTMOpportunity>) => {
    if (!activeProject) return;
    const response = await updateOpportunity(activeProject.id, opportunityId, patch);
    setOpportunityStudio((current) => current ? {
      ...current,
      items: current.items.map((item) => item.id === opportunityId ? response.opportunity : item),
    } : current);
  }, [activeProject]);

  const handleOpportunityCompose = useCallback(async (input: {
    channelOpportunityId: string;
    agentOpportunityIds: string[];
    input: DataAdapter;
    output: DataAdapter;
  }) => {
    if (!activeProject) return;
    setProjectBusy(true);
    setGraphError(null);
    try {
      const response = await composeOpportunityChannel(activeProject.id, input);
      await refreshProjectScope();
      await loadChannel(response.channel.id);
      setOverlay(null);
      setIdeationOpen(false); // composed → land on the new channel's canvas
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBusy(false);
    }
  }, [activeProject, loadChannel, refreshProjectScope]);

  // Open the ideation canvas and stream it live: proposals first (synth placeholders appear at
  // once), then each channel's REAL model-composed graph streams in and swaps its lane. The
  // founder watches workflows build onto the canvas one at a time.
  const startIdeation = useCallback(async () => {
    if (!activeProject) return;
    setOverlay(null);
    setIdeationOpen(true);
    setIdeationLane(null);
    setLaneStates({});
    setIdeationThinking("");
    setIdeationStatus("Ideating channels from grounded reality…");
    setProjectBusy(true);
    try {
      await ideateStream(activeProject.id, (ev) => {
        if (ev.type === "status") setIdeationStatus(ev.message);
        else if (ev.type === "thinking") setIdeationThinking((t) => (t + " " + ev.text).slice(-600));
        else if (ev.type === "proposals") {
          setOpportunityStudio((cur) => cur
            ? { ...cur, items: [...ev.channels, ...ev.agents] }
            : { generatedAt: new Date().toISOString(), sourceContextVersion: null, items: [...ev.channels, ...ev.agents] });
          setLaneStates(Object.fromEntries(ev.channels.map((c) => [c.id, { status: "composing", title: c.title } as LaneState])));
          setIdeationStatus(`${ev.channels.length} channels proposed · composing each workflow…`);
        } else if (ev.type === "composing") {
          setLaneStates((s) => ({ ...s, [ev.channelId]: { ...(s[ev.channelId] ?? { title: ev.title }), status: "composing", title: ev.title } }));
        } else if (ev.type === "workflow") {
          setLaneStates((s) => ({ ...s, [ev.channelId]: { status: "ready", title: ev.title, nodes: ev.nodes, edges: ev.edges } }));
        } else if (ev.type === "workflow_error") {
          setLaneStates((s) => ({ ...s, [ev.channelId]: { ...(s[ev.channelId] ?? { title: "" }), status: "error", error: ev.error } }));
        } else if (ev.type === "done") {
          setIdeationStatus(null);
          setIdeationThinking("");
        } else if (ev.type === "error") {
          setGraphError(ev.error);
        }
      });
      await refreshProjectScope();
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBusy(false);
      setIdeationStatus(null);
    }
  }, [activeProject, refreshProjectScope]);

  // The agents a proposed channel points at (its pinned set, else all proposed agents) — the
  // judgment steps drawn into its workflow lane and accepted when the lane is built.
  const agentsFor = useCallback((channel: GTMOpportunity): GTMOpportunity[] => {
    const agents = (opportunityStudio?.items ?? []).filter((i) => i.type === "agent");
    return channel.selectedAgentIds?.length
      ? agents.filter((a) => channel.selectedAgentIds!.includes(a.id))
      : agents;
  }, [opportunityStudio]);

  // Build one lane's workflow for real: accept it + its agents, compose, land on its canvas.
  const handleBuildChannel = useCallback(async (channel: GTMOpportunity) => {
    await buildChannelDefaults(channel, agentsFor(channel), handleOpportunityUpdate, handleOpportunityCompose);
  }, [agentsFor, handleOpportunityUpdate, handleOpportunityCompose]);

  const handleOperatorCancel = useCallback(async () => {
    if (!operatorSession) return;
    const response = await cancelOperatorSession(operatorSession.id);
    syncOperator(response.session);
  }, [operatorSession, syncOperator]);

  // Derived
  const hasUnsaved = !graphSavedAt;
  const selectedNode = useMemo(
    () => graph?.nodes.find((n) => n.id === selection) ?? null,
    [graph, selection],
  );
  const selectedNodeResult = selectedNode ? runResult?.nodes[selectedNode.id] : null;
  const selectedNodeAudit = selectedNode
    ? contractAudits[selectedNode.id] ?? selectedNodeResult?.contractAudit
    : null;
  // The engine subsystem behind this node — the source of the canvas health badge.
  // Surfacing it in the editor explains the number instead of leaving it a bare figure.
  const selectedNodeSubsystem = selectedNode
    ? engine?.subsystems.find((s) => s.id === selectedNode.category) ?? null
    : null;

  useEffect(() => {
    if (!selectedNode) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusClose = window.requestAnimationFrame(() => nodeModalCloseRef.current?.focus());
    const handleModalKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelection(null);
        return;
      }
      if (event.key !== "Tab" || !nodeModalRef.current) return;
      const focusable = Array.from(nodeModalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleModalKeys);
    return () => {
      window.cancelAnimationFrame(focusClose);
      window.removeEventListener("keydown", handleModalKeys);
      previousFocus?.focus();
    };
  }, [selectedNode]);

  // The ideation canvas: every proposed channel drawn as its own workflow, in stacked lanes.
  const ideationChannels = useMemo(
    () => (opportunityStudio?.items ?? []).filter((i) => i.type === "channel" && i.status !== "rejected"),
    [opportunityStudio],
  );
  const ideationGraph = useMemo(
    () => buildIdeationCanvas(ideationChannels, agentsFor, laneStates).graph,
    [ideationChannels, agentsFor, laneStates],
  );
  const composedCount = useMemo(
    () => Object.values(laneStates).filter((s) => s.status === "ready").length,
    [laneStates],
  );
  const ideationLaneChannel = ideationLane
    ? ideationChannels.find((c) => c.id === ideationLane) ?? null
    : null;

  // The channel the operator session is bound to, and whether the founder is currently
  // viewing a different one. The co-pilot narrates one channel's work; surface which.
  const boundChannel = operatorSession?.graphId
    ? channels.find((c) => c.graphId === operatorSession.graphId || c.id === operatorSession.graphId) ?? null
    : null;
  const viewingMismatch = !!operatorSession?.graphId && !!graph && operatorSession.graphId !== graph.id;

  // Subsystem id === node category, so this keys real health onto each node.
  const subsystemHealth = useMemo(
    () => Object.fromEntries(
      (engine?.subsystems ?? []).map((s) => [s.id, { health: s.health, issue: s.activeIssues[0] }]),
    ),
    [engine],
  );

  // Jump from a Problems-rail row to the node that fixes it.
  const jumpToNode = useCallback((nodeId: string) => {
    setView("canvas");
    setSelection(nodeId);
  }, []);

  const contextSignals = activeProject ? [
    !!activeProject.sharedContext.repository.repo,
    !!activeProject.sharedContext.repository.outcome,
    Array.isArray(activeProject.sharedContext.repository.evidence)
      && activeProject.sharedContext.repository.evidence.length > 0,
    !!opportunityStudio?.generatedAt,
    !!(activeProject.sharedContext.positioning.promise || activeProject.sharedContext.positioning.category),
  ] : [];
  const contextPct = contextSignals.length
    ? Math.round((contextSignals.filter(Boolean).length / contextSignals.length) * 100)
    : 0;

  const runCount = graph?.store?.runs ?? flowRuns.length;

  return (
    <main className="loop-shell">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <header className="loop-toolbar">
        <div className="loop-toolbar-left">
          <button className="loop-brand" onClick={() => setView("canvas")} type="button" title="Back to the canvas">
            <span className="loop-brand-mark">G</span>
            <span className="loop-brand-name">GTM IDE</span>
          </button>
          <span className="loop-toolbar-sep">/</span>
          <ProjectSwitcher
            projects={projects}
            activeProjectId={activeProject?.id ?? null}
            busy={projectBusy}
            onSwitch={handleProjectOpen}
            onManage={() => setView("projects")}
          />
          <span className="loop-toolbar-sep">/</span>
          <span className="loop-toolbar-crumb loop-toolbar-crumb-active">
            {view === "projects" ? "Products" : graph?.name ?? "Canvas"}
          </span>
          {view === "canvas" && graph ? (
            <span className={`loop-draft-badge ${hasUnsaved ? "unsaved" : "saved"}`}>
              {hasUnsaved ? "Draft" : "Saved"}
            </span>
          ) : null}
        </div>

        <nav className="loop-tabs">
          {view === "canvas" && graph
            ? (["build", "simulate", "run"] as MainTab[]).map((tab) => (
                <button
                  key={tab}
                  className={`loop-tab ${activeTab === tab ? "loop-tab-active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                  type="button"
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))
            : null}
        </nav>

        <div className="loop-toolbar-right">
          <ContextPill manifest={contextManifest} fallbackPct={contextPct} />
          <div className={`loop-model-btn ${operatorSession ? "operator-present" : ""}`}>
            <span className={`loop-model-dot ${operatorSession ? "live" : ""}`} />
            {operatorSession
              ? `Claude · ${operatorSession.status.replaceAll("_", " ")}`
              : "Claude · subscription"}
          </div>
          {view === "canvas" ? <Button
            className="loop-simulate-btn"
            disabled={graphRunning || !graph || graph.nodes.length === 0}
            onClick={() => { setActiveTab("simulate"); void streamRun(); }}
            type="button"
          >
            {graphRunning && !runningNodeId ? (
              <LoaderCircle className="spin" />
            ) : (
              <Play className="loop-play-icon" />
            )}
            Simulate
          </Button> : null}
          {view === "canvas" ? <Button
            className="loop-run-btn"
            disabled={graphRunning || !graph || graph.nodes.length === 0}
            onClick={() => void streamRun()}
            type="button"
          >
            {graphRunning ? <LoaderCircle className="spin" /> : null}
            Run loop
          </Button> : null}
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className={`loop-body ${view === "projects" ? "studio-mode" : ""}`}>
        {/* The Explorer is the persistent IDE nav. Understand and Opportunities are not pages —
            they open as overlays OVER the canvas, so the IDE frame is never swapped out. */}
        {view !== "projects" ? (
          <GtmExplorer
            channels={channels}
            activeChannelId={activeChannelId}
            currentView={ideationOpen ? "opportunities" : overlay ?? "canvas"}
            onOpenChannel={(id) => { setOverlay(null); setIdeationOpen(false); void loadChannel(id); }}
            onCreateChannel={handleCreateChannel}
            onOpenArtifact={(type, ref) => setArtifactEdit({ type, ref })}
            onOpenView={(v) => { if (v === "opportunities") startIdeation(); else if (v === "understand") { setIdeationOpen(false); setOverlay("understand"); } else { setOverlay(null); setIdeationOpen(false); } }}
            library={library}
            contextManifest={contextManifest}
            engine={engine}
            graph={graph}
            onJumpToNode={jumpToNode}
          />
        ) : null}

        {/* Center — the canvas IS the workspace. Only the cold-start picker replaces it. */}
        <section className="loop-canvas-area">
          {view === "projects" ? (
            <ProjectPicker
              activeProjectId={activeProject?.id ?? null}
              busy={projectBusy}
              onCreate={handleProjectCreate}
              onOpen={handleProjectOpen}
              projects={projects}
            />
          ) : ideationOpen ? (
            // Ideation runs ON the canvas: each proposed channel is a workflow, drawn in its own
            // lane. Multiple workflows on one canvas. Click a lane, then build it for real.
            <>
              {ideationChannels.length > 0 ? (
                <GraphCanvas
                  connectors={connectors}
                  graph={ideationGraph}
                  variant="ideation"
                  onSelect={(id) => setIdeationLane(channelIdFromNode(id))}
                  result={null}
                  running={false}
                  selection={null}
                  subsystemHealth={{}}
                />
              ) : (
                <div className="canvas-empty">
                  <strong>{projectBusy ? "Ideating workflows…" : "No channels yet"}</strong>
                  <span>{projectBusy
                    ? (ideationStatus ?? "Reading your product and the cited evidence, proposing channels.")
                    : "Re-ideate to propose channels for this product."}</span>
                </div>
              )}
              <div className="ideation-topbar">
                <div className="ideation-topbar-title">
                  <span className="ideation-board-eyebrow">Ideating channels</span>
                  <strong>
                    {ideationStatus && ideationChannels.length > 0
                      ? `Composing workflows · ${composedCount}/${ideationChannels.length} model-composed`
                      : ideationStatus
                        ? ideationStatus
                        : `${ideationChannels.length} workflow${ideationChannels.length !== 1 ? "s" : ""} · ${composedCount} model-composed`}
                  </strong>
                </div>
                <div className="ideation-topbar-actions">
                  <button className="loop-save-chip" disabled={projectBusy} onClick={() => void startIdeation()} type="button">Re-ideate</button>
                  <button className="loop-save-chip" onClick={() => { setIdeationOpen(false); setIdeationLane(null); }} type="button">Close</button>
                </div>
              </div>
              {ideationThinking ? (
                <div className="ideation-thinking" aria-live="polite">
                  <span className="ideation-thinking-dot" />
                  <span className="ideation-thinking-text">{ideationThinking}</span>
                </div>
              ) : null}
              {ideationLaneChannel ? (
                <div className="ideation-buildbar">
                  <div className="ideation-buildbar-text">
                    <strong>{ideationLaneChannel.title}</strong>
                    <span>{ideationLaneChannel.objective}</span>
                  </div>
                  <Button
                    disabled={projectBusy}
                    onClick={() => void handleBuildChannel(ideationLaneChannel)}
                    type="button"
                  >
                    {projectBusy ? <LoaderCircle className="spin" /> : <Sparkles />}
                    Build this workflow
                  </Button>
                </div>
              ) : null}
            </>
          ) : graph ? (
            <>
              <GraphCanvas
                connectors={connectors}
                contractAudits={contractAudits}
                graph={graph}
                onAddNode={handleAddNode}
                onConnectNodes={handleGraphConnect}
                onDeleteEdges={handleDeleteEdges}
                onLoadRecipe={handleLoadPilotRecipe}
                onNodePositionChange={handleNodePositionChange}
                onSelect={setSelection}
                panelOpen={false}
                result={runResult}
                running={graphRunning}
                runningNodeId={runningNodeId}
                selection={selection}
                subsystemHealth={subsystemHealth}
              />
              {graph.nodes.length === 0 ? (
                <div className="blank-channel-guide">
                  <strong>Shape this channel from the outcome backward</strong>
                  <span>Tell Claude what this motion should accomplish, or add the first node yourself. Nothing has been chosen for you.</span>
                </div>
              ) : null}
            </>
          ) : (
            // No channel selected yet — the goal-driven front door (say what you want, in words).
            <GoalLauncher
              productName={activeProject?.name ?? "Your product"}
              busy={projectBusy}
              onSubmitGoal={(g) => void handleComposerSend(g)}
              onIdeate={startIdeation}
              onLoadRecipe={handleLoadPilotRecipe}
            />
          )}

          {/* Toolbar overlay: zoom controls at top-left */}
          {view === "canvas" && graph && (
            <div className="loop-graph-actions">
              <button
                className={`loop-save-chip ${graphSavedAt ? "saved" : ""}`}
                disabled={graphRunning}
                onClick={() => void persistGraph()}
                type="button"
              >
                {graphRunning ? <LoaderCircle className="spin" style={{ width: 11 }} /> : (graphSavedAt ? <Check style={{ width: 11 }} /> : null)}
                {graphSavedAt ? "Saved" : "Save"}
              </button>
              {runCount > 0 && (
                <span className="loop-run-chip">
                  {runCount} run{runCount !== 1 ? "s" : ""}
                </span>
              )}
              {runResult && (
                <button
                  className="loop-save-chip"
                  onClick={() => { setRunResult(null); setSelection(null); setGraphError(null); setApprovals({}); setDecisions({}); }}
                  type="button"
                >
                  Clear run
                </button>
              )}
            </div>
          )}

          {/* Error banner */}
          {graphError && (
            <div className="loop-error-banner" role="alert">
              <AlertTriangle />
              <span>{graphError}</span>
            </div>
          )}

          {/* Product grounding floats OVER the canvas center — the IDE frame (explorer +
              assistant) stays visible, so it's part of the canvas, not a separate page. Its
              "Ideate channels" hands off to the canvas ideation board. */}
          {overlay === "understand" && activeProject && (
            <div className="canvas-overlay" role="dialog" aria-modal="true">
              <div className="canvas-overlay-bar">
                <span className="canvas-overlay-title">Product grounding</span>
                <button className="canvas-overlay-close" onClick={() => setOverlay(null)} type="button" title="Back to the canvas">×</button>
              </div>
              <div className="canvas-overlay-body">
                <ProductUnderstanding
                  busy={projectBusy}
                  onGenerate={startIdeation}
                  project={activeProject}
                  studio={opportunityStudio}
                />
              </div>
            </div>
          )}

        </section>

        {/* Persistent Claude co-pilot — channels + conversation + composer, always docked */}
        {view !== "projects" ? <ComposerDock
          session={operatorSession}
          running={graphRunning}
          boundChannelName={boundChannel?.name ?? null}
          viewingMismatch={viewingMismatch}
          onSend={handleComposerSend}
          onCancel={handleOperatorCancel}
          onReviewGate={(nodeId) => setSelection(nodeId)}
          onReturnToChannel={boundChannel ? () => void loadChannel(boundChannel.id) : undefined}
        /> : null}
      </div>

      {selectedNode && graph && (
        <div
          className="node-detail-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelection(null);
          }}
        >
          <section
            aria-label={`${selectedNode.label} step editor`}
            aria-modal="true"
            className="node-detail-workspace"
            ref={nodeModalRef}
            role="dialog"
          >
            <header className="node-detail-workspace-header">
              <div className="node-detail-heading">
                <div className="node-detail-breadcrumb">
                  <span>{graph.name}</span>
                  <span aria-hidden="true">/</span>
                  <span>
                    {selectedNode.kind && selectedNode.kind !== "tool"
                      ? selectedNode.kind
                      : selectedNode.category}
                  </span>
                </div>
                <div className="node-detail-title-row">
                  <h1>{selectedNode.label}</h1>
                  <div className="node-detail-statuses">
                    <span className={`node-detail-status ${selectedNodeResult ? selectedNodeResult.ok ? "ok" : "error" : "idle"}`}>
                      {selectedNodeResult ? selectedNodeResult.ok ? "Healthy" : "Needs attention" : "Not run"}
                    </span>
                    {selectedNodeSubsystem && selectedNodeSubsystem.health > 0 ? (
                      <span
                        className="node-detail-status node-detail-health"
                        style={{ color: healthHex(selectedNodeSubsystem.health), borderColor: healthHex(selectedNodeSubsystem.health) }}
                        title="Derived from your scan, run ledger, and connectors — the same figure on the canvas node"
                      >
                        Health {selectedNodeSubsystem.health}
                      </span>
                    ) : null}
                    {selectedNodeAudit ? (
                      <span className={`node-detail-status contract-${selectedNodeAudit.state}`}>
                        {selectedNodeAudit.state === "none" ? "No contract" : `Contract ${selectedNodeAudit.state}`}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p>
                  {selectedNode.kind && selectedNode.kind !== "tool"
                    ? `${selectedNode.kind.charAt(0).toUpperCase() + selectedNode.kind.slice(1)} step${selectedNode.ref ? ` using ${selectedNode.ref}` : ""}`
                    : `${selectedNode.category.charAt(0).toUpperCase() + selectedNode.category.slice(1)} step${selectedNode.connector ? ` using ${selectedNode.connector}` : ""}`}
                </p>
              </div>
              <div className="node-detail-actions">
                <Button
                  className="secondary-button node-detail-run"
                  disabled={runningNodeId === selectedNode.id}
                  onClick={() => void executeGraph(selectedNode.id)}
                  type="button"
                >
                  {runningNodeId === selectedNode.id ? <LoaderCircle className="spin" /> : <Play />}
                  {runningNodeId === selectedNode.id ? "Running…" : "Run step"}
                </Button>
                <button
                  aria-label="Close step editor"
                  className="node-detail-close"
                  onClick={() => setSelection(null)}
                  ref={nodeModalCloseRef}
                  type="button"
                >
                  <X />
                </button>
              </div>
            </header>
            <NodeEditor
              key={selection ?? "none"}
              connectors={connectors}
              contractAudits={contractAudits}
              subsystem={selectedNodeSubsystem}
              flowRuns={flowRuns}
              graph={graph}
              onApproveGate={(id) => void approveGate(id)}
              onSubmitReview={(id, d) => void submitGateReview(id, d)}
              onRunNode={(id) => void executeGraph(id)}
              onUpdateGraph={updateGraph}
              onOpenArtifact={(type, ref) => setArtifactEdit({ type, ref })}
              onDeleteNode={handleDeleteNode}
              runResult={runResult}
              runningNodeId={runningNodeId}
              selection={selection}
            />
          </section>
        </div>
      )}

      {/* ── Artifact editor — full markdown for the subagent/skill a step runs ── */}
      {artifactEdit && (
        <ArtifactEditor
          type={artifactEdit.type}
          refName={artifactEdit.ref}
          open={!!artifactEdit}
          onClose={() => setArtifactEdit(null)}
        />
      )}

      {/* ── Simulation drawer ─────────────────────────────────────────────── */}
      <SimulationPanel
        flowRuns={flowRuns}
        graph={graph}
        open={activeTab === "simulate"}
        result={runResult}
        running={graphRunning}
        onClose={() => setActiveTab("build")}
        onSelectRun={(run) => {
          setRunResult(run);
          setSelection(run.pendingGates[0] ?? Object.keys(run.nodes)[0] ?? null);
        }}
      />
    </main>
  );
}
