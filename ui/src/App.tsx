import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, LoaderCircle, Play, ShieldCheck, Sparkles, X,
} from "lucide-react";
import {
  applyGraphOperations as applyGraphOperationsApi,
  auditGraph,
  getConnectors,
  getEngineState,
  getConnection,
  type ConnectionStatus,
  getContext,
  getLibrary,
  getPrograms,
  getGraphTemplate,
  getPilotOutreachRecipe,
  getOperatorSession,
  getProject,
  getOpportunities,
  listProjects,
  runGraph,
  runProgramStream,
  activateProject,
  cancelOperatorSession,
  composeOpportunityChannel,
  previewOpportunityChannel,
  createProject,
  createOperatorSession,
  ideateStream,
  listOperatorSessions,
  resolveOperatorGate,
  resolveOperatorProposal,
  resumeOperatorSession,
  runGraphStream,
  saveGraph,
  setActiveWorkflow,
  updateOpportunity,
  getProductModel,
  deriveProductModel,
  reviseProductModel,
} from "@/api";
import { ArtifactEditor } from "@/components/ArtifactEditor";
import { ComposerDock } from "@/components/ComposerDock";
import { FloatingDock } from "@/components/FloatingDock";
import { GraphCanvas } from "@/components/GraphCanvas";
import { GoalLauncher } from "@/components/GoalLauncher";
import { NodeEditor } from "@/components/NodeEditor";
import { ProgramCanvas, type ProgramCanvasMode } from "@/components/ProgramCanvas";
// GtmExplorer (the old left rail) is intentionally no longer rendered — outcome navigation moved to
// the FloatingDock's OutcomeSwitcher, the Library to LibraryPalette, the feeds into ComposerDock,
// Problems to the dock. The breadcrumb switchers, mode lenses, Problems, Approvals, Simulate and Run
// all live in FloatingDock now, so App no longer imports them directly.
import { LibraryPalette } from "@/components/LibraryPalette";
import { buildIdeationCanvas, buildChannelDefaults, channelIdFromNode, type LaneState } from "@/lib/ideationGraph";
import { statusLabel } from "@/lib/status";
import { healthHex } from "@/lib/health";
import { itemKey } from "@/lib/itemKey";
import { findProgramForGraph, graphBelongsToProgram, programGraphId } from "@/lib/program";
import { ProductUnderstanding } from "@/components/ProductUnderstanding";
import { ProductCanvas } from "@/components/ProductCanvas";
import { ProjectPicker } from "@/components/ProjectPicker";
import { ProductEntry } from "@/components/ProductEntry";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { SimulationPanel } from "@/components/SimulationPanel";
import { Button } from "@/components/ui/button";
import type {
  ChannelMeta, ConnectorMeta, ContextManifest, DataAdapter, Decisions, EngineState, GateDecision, GraphOperation, GtmLibrary, GTMContractAudit, GTMGraph, GTMNode, GTMOpportunity,
  GTMProject, GTMRunResult, NodeSelection, OperatorSession, OpportunityStudio as OpportunityStudioState, ProjectSummary,
  AgentCreationPolicy, AgentInstance, FeedbackSignal, OutcomeProgram,
  AgentEvaluation, DomainEvent, ProductModel, ProductModelEdit,
} from "@/types";

type MainTab = ProgramCanvasMode;

// Health → band color, identical to the canvas node badge (GraphCanvas healthHex), so a
// node's health reads the same number and color on the canvas, in the editor, and in the rail.
// First non-empty string among loosely-typed item fields. Staged gate items carry free-form keys
// (draft_note, suggested_subject_line, grounding_citation…) typed as unknown, so the review surface
// reads them defensively rather than asserting a fixed shape.
function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v;
  return null;
}

// The context pill — the north star, made visible in the toolbar. It shows what the model
// actually receives, layer by layer, derived from the real assembled manifest (never a config
// percentage). Taste is shown even at 0 chars on purpose: an empty moat is a signal to the
// founder that nothing has been gated yet. Falls back to the old config-completeness % only
// before the manifest loads.
function programRouteFromLocation() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/programs\/([^/]+)\/canvas\/?$/);
  if (!match) return null;
  return {
    projectId: decodeURIComponent(match[1]),
    programId: decodeURIComponent(match[2]),
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>("design");
  // The canvas IS the workspace. "projects" is the only other base view — the cold-start picker
  // before any product exists. Understand and Opportunities are no longer destinations that swap
  // the canvas out; they float OVER it as dismissable overlays (set via `overlay`), so the IDE is
  // never replaced. Channels live in the explorer, not a page.
  const [view, setView] = useState<"projects" | "canvas" | "start">("canvas");
  const [overlay, setOverlay] = useState<"understand" | "product" | null>(null);
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
  // The living product picture — the founder-editable INTERPRETATION aggregate, loaded alongside the
  // active project. Edits persist through the domain commands (revise/derive) then re-fetch.
  const [productModel, setProductModel] = useState<ProductModel | null>(null);
  const [productModelBusy, setProductModelBusy] = useState(false);
  const [programs, setPrograms] = useState<OutcomeProgram[]>([]);
  const [activeProgramId, setActiveProgramId] = useState<string | null>(null);
  const [agentPolicies, setAgentPolicies] = useState<AgentCreationPolicy[]>([]);
  const [agentInstances, setAgentInstances] = useState<AgentInstance[]>([]);
  const [agentEvaluations, setAgentEvaluations] = useState<AgentEvaluation[]>([]);
  const [feedbackSignals, setFeedbackSignals] = useState<FeedbackSignal[]>([]);
  const [domainEvents, setDomainEvents] = useState<DomainEvent[]>([]);
  // Bumped to summon the Claude co-pilot — a program is created by telling Claude the outcome,
  // not by filling a form, so "New program" opens and focuses the chat.
  const [composerFocus, setComposerFocus] = useState(0);
  // The Approvals panel — the founder gate's first-class home. Opens from the toolbar badge.
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  // The summoned Library palette — opened from the canvas "+ Add step" control, replacing the old
  // left-rail Library now that the rail is dissolved.
  const [libraryPaletteOpen, setLibraryPaletteOpen] = useState(false);
  // The Problems popover — the engine's investigations, surfaced as a compact toolbar chip now that
  // the Problems rail section is gone with the explorer.
  const [problemsOpen, setProblemsOpen] = useState(false);
  // Program details — the inspector sheet (agents, measurement, learning) over the canvas. Lifted
  // here from ProgramCanvas so the FloatingDock's details toggle drives the same sheet.
  const [inspecting, setInspecting] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  // Is a live Claude available? Drives the cold-start state — composing, ideating, and the operator
  // all need a signed-in subscription, so an unconnected founder gets a clear path, not a dead end.
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);

  // Graph state
  const [graph, setGraph] = useState<GTMGraph | null>(null);
  // A starter system staged from an accepted opportunity: composed but NOT yet persisted, shown
  // ghosted on the canvas (mirrors the operator's pendingProposal) until the founder accepts or
  // discards. `input` is what the apply path replays; `preview` is the would-be graph.
  const [pendingComposition, setPendingComposition] = useState<{
    input: {
      channelOpportunityId: string;
      agentOpportunityIds: string[];
      input: DataAdapter;
      output: DataAdapter;
    };
    name: string;
    objective: string;
    preview: GTMGraph;
  } | null>(null);
  const [runResult, setRunResult] = useState<GTMRunResult | null>(null);
  const [graphRunning, setGraphRunning] = useState(false);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [selection, setSelection] = useState<NodeSelection>(null);
  const [connectors, setConnectors] = useState<ConnectorMeta[]>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [decisions, setDecisions] = useState<Decisions>({});
  // The draft currently being edited in the gate review (the "edit-then-approve" path). One at a time.
  const [editingDraft, setEditingDraft] = useState<{ key: string; text: string } | null>(null);
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
    getConnection().then(setConnection).catch(() => {});
  }, []);

  const loadChannel = useCallback(async (channelId: string) => {
    setGraphRunning(true);
    setGraphError(null);
    try {
      const [graphResponse, engineResponse] = await Promise.all([
        getGraphTemplate(channelId),
        getEngineState(channelId),
        setActiveWorkflow(channelId),
      ]);
      setActiveChannelId(channelId);
      setGraph(graphResponse.graph);
      setActiveProgramId(graphResponse.graph.outcomeProgramId ?? null);
      const priorRuns = graphResponse.runs ?? [];
      setFlowRuns(priorRuns);
      // Rehydrate the latest persisted run so opening an outcome shows its REAL state — the node
      // results on the canvas, the impact strip, and any drafts staged at its gate. Without this a
      // completed run (one fired headlessly via the API, or in a prior session) was invisible: the
      // gate's staged drafts sat in the ledger but never reached the review surface.
      setRunResult(priorRuns.length ? priorRuns[priorRuns.length - 1] : null);
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
    const programResponse = await getPrograms(projectResponse.project.id).catch(() => null);
    setProjects(catalog.projects);
    setActiveProjectState(projectResponse.project);
    setChannels(projectResponse.project.channels);
    setOpportunityStudio(studioResponse.opportunities);
    setPrograms(programResponse?.programs ?? []);
    setAgentPolicies(programResponse?.policies ?? []);
    setAgentInstances(programResponse?.foundry.instances ?? []);
    setAgentEvaluations(programResponse?.foundry.evaluations ?? []);
    setFeedbackSignals(programResponse?.feedback.signals ?? []);
    setDomainEvents(programResponse?.events ?? []);
    return projectResponse.project;
  }, []);

  // Boot
  useEffect(() => {
    let live = true;
    Promise.all([getProject(), getConnectors(), listProjects()]).then(async ([initialProjectResponse, connectorResponse, initialCatalog]) => {
      if (!live) return;
      const route = programRouteFromLocation();
      let projectResponse = initialProjectResponse;
      let catalog = initialCatalog;
      if (route?.projectId && route.projectId !== projectResponse.project.id) {
        await activateProject(route.projectId).catch(() => null);
        [projectResponse, catalog] = await Promise.all([getProject(), listProjects()]);
        if (!live) return;
      }
      let channelId = projectResponse.project.activeChannelId
        || projectResponse.project.channels[0]?.id;
      setConnectors(connectorResponse.connectors);
      setChannels(projectResponse.project.channels);
      setActiveProjectState(projectResponse.project);
      setProjects(catalog.projects);
      getOpportunities(projectResponse.project.id).then((response) => {
        if (live) setOpportunityStudio(response.opportunities);
      }).catch(() => {});
      const programResponse = await getPrograms(projectResponse.project.id).catch(() => null);
      if (!live) return;
      const routedProgramId = route?.projectId === projectResponse.project.id ? route.programId : null;
      const selectedProgram = programResponse?.programs.find((program) => program.id === routedProgramId)
        ?? findProgramForGraph(programResponse?.programs ?? [], channelId)
        ?? programResponse?.programs[0]
        ?? null;
      setPrograms(programResponse?.programs ?? []);
      setAgentPolicies(programResponse?.policies ?? []);
      setAgentInstances(programResponse?.foundry.instances ?? []);
      setAgentEvaluations(programResponse?.foundry.evaluations ?? []);
      setFeedbackSignals(programResponse?.feedback.signals ?? []);
      setDomainEvents(programResponse?.events ?? []);
      setActiveProgramId(selectedProgram?.id ?? null);
      channelId = programGraphId(selectedProgram) ?? channelId;
      if (!channelId) {
        // A product with no channels still lands on the canvas (its empty state guides the first
        // move); only a total cold start (no workspace) shows the product picker.
        // A founder with no scanned product lands on the one-prompt front door (point at your
        // product, say your goal), not the dense cockpit — the project-aware stranger entry.
        setView(projectResponse.project.sharedContext.repository.workspaceId ? "canvas" : "start");
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
      setActiveProgramId(graphResponse.graph.outcomeProgramId ?? selectedProgram?.id ?? null);
      const bootRuns = graphResponse.runs ?? [];
      setFlowRuns(bootRuns);
      // Hydrate the latest run on first paint too, so the outcome you land on shows its real state
      // (node results, staged drafts) without needing a manual click to re-open it.
      setRunResult(bootRuns.length ? bootRuns[bootRuns.length - 1] : null);
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

  // Load the current living product picture whenever the active product changes. The model is
  // per-project, so it's fetched alongside the project and cleared when none is active. The clear
  // and the fetch both land in async callbacks, never synchronously in the effect body.
  useEffect(() => {
    let live = true;
    const load = activeProjectId
      ? getProductModel().then(({ productModel: model }) => model).catch(() => null)
      : Promise.resolve(null);
    void load.then((model) => { if (live) setProductModel(model); });
    return () => { live = false; };
  }, [activeProjectId]);

  // Derive a first draft (or re-derive) from the scan grounding — the server injects the live
  // generator. Re-fetch after so the surface reflects the new version.
  const handleDeriveProductModel = useCallback(async () => {
    if (!activeProject) return;
    setProductModelBusy(true);
    try {
      const { productModel: model } = await deriveProductModel();
      setProductModel(model);
    } finally {
      setProductModelBusy(false);
    }
  }, [activeProject]);

  // A founder edit — persists the changed bag through ReviseProductModel (its own append-only event
  // log → a new version), then re-fetches so the surface shows the persisted version.
  const handleReviseProductModel = useCallback(async (edit: ProductModelEdit) => {
    if (!activeProject) return;
    setProductModelBusy(true);
    try {
      await reviseProductModel(edit);
      const { productModel: model } = await getProductModel();
      setProductModel(model);
    } finally {
      setProductModelBusy(false);
    }
  }, [activeProject]);

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
        // But never hijack the canvas when the founder is already focused on a program (or reviewing
        // a proposal): pre-existing channels on the project must not yank them out of their work.
        if (activeProjectId && !operatorRunId.current && !activeProgramId) {
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
  }, [activeProjectId, activeProgramId, operatorSessionId, operatorSessionStatus, syncOperator]);

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
      // Select only a genuinely-failed node — never auto-open the gate's editor on a review submit
      // (that yanked a modal open after every approve). A pending gate or a downstream node blocked
      // *by* that pause is not a failure to jump to.
      const firstProblem = Object.entries(result.nodes).find(([, node]) => !node.ok && !node.pendingReview && !node.blocked)?.[0];
      if (firstProblem) setSelection(firstProblem);
      // Pausing at the founder gate is the spine, not a failure — only alert on a real error.
      if (!result.ok && !result.pendingGates.length) setGraphError(result.error || "One or more steps need attention.");
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setGraphRunning(false);
      setRunningNodeId(null);
      loadEngine(graph?.id ?? activeChannelId); // a run updates the ledger → refresh health + problems
      void refreshProjectScope();
    }
  }, [activeChannelId, approvals, decisions, graph, loadEngine, refreshProjectScope]);

  // The flagship "Run Program" now streams node-by-node like the raw-graph path — each step lights
  // up as it runs and its content lands the moment it succeeds, then run_done carries the program
  // summary (learning signals, next agent versions) for tab routing.
  const executeProgram = useCallback(async (
    nextApprovals: Record<string, boolean> = approvals,
    nextDecisions: Decisions = decisions,
    // Resume the exact reviewed run by default so a gate decision reuses the staged artifacts
    // instead of re-running discovery/draft behind the founder's back. A fresh "Run Program"
    // passes undefined to start clean.
    resumeRunId: string | undefined = runResult?.runId,
  ) => {
    if (!activeProject || !activeProgramId) return;
    setGraphRunning(true);
    setRunningNodeId(null);
    setGraphError(null);
    setRunResult({ runId: `live-${Date.now()}`, graphId: graph?.id ?? "", ok: false, nodes: {}, executionOrder: [], pendingGates: [], feedbackEdges: [] });
    try {
      await runProgramStream(activeProject.id, activeProgramId, { approvals: nextApprovals, decisions: nextDecisions, resumeRunId }, (ev) => {
        if (ev.type === "node_start") {
          setRunningNodeId(ev.nodeId);
        } else if (ev.type === "node_done") {
          setRunningNodeId((cur) => (cur === ev.nodeId ? null : cur));
          setRunResult((cur) => cur ? { ...cur, nodes: { ...cur.nodes, [ev.nodeId]: ev.result } } : cur);
          if (ev.result.items?.length || ev.result.pendingReview) setSelection(ev.nodeId);
        } else if (ev.type === "run_done") {
          const result = ev.result;
          setRunResult(result);
          setFlowRuns((current) => [...current, result].slice(-10));
          if (result.pendingGates[0]) setActiveTab("review");
          else if (ev.nextVersions.length || ev.feedbackSignals > 0) setActiveTab("learning");
          else setActiveTab("run");
          if (!result.ok && !result.pendingGates.length) setGraphError(result.error || "One or more steps need attention.");
        } else if (ev.type === "run_error") {
          setGraphError(ev.error);
        }
      });
      await refreshProjectScope();
      loadEngine(graph?.id ?? activeChannelId);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setGraphRunning(false);
      setRunningNodeId(null);
    }
  }, [activeChannelId, activeProgramId, activeProject, approvals, decisions, graph, loadEngine, refreshProjectScope, runResult]);

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
      void refreshProjectScope();
    }
  }, [activeChannelId, approvals, decisions, graph, loadEngine, refreshProjectScope]);

  const approveGate = useCallback(async (nodeId: string) => {
    const next = { ...approvals, [nodeId]: true };
    setApprovals(next);
    if (operatorSession?.status === "waiting_for_gate" && operatorSession.pendingGate?.nodeIds.includes(nodeId)) {
      const response = await resolveOperatorGate(operatorSession.id, { approvals: next });
      syncOperator(response.session);
      return;
    }
    // In a program, the gate decision must resume the PROGRAM run (program-runtime owns resume + the
    // learning loop). Routing it through the raw-graph path re-ran discovery and banked junk feedback.
    if (activeProgramId) { await executeProgram(next, decisions, runResult?.runId); return; }
    await executeGraph(undefined, next, decisions, runResult?.runId);
  }, [approvals, decisions, executeGraph, executeProgram, activeProgramId, operatorSession, runResult?.runId, syncOperator]);

  // Per-item founder review: record approve/reject/edit decisions for a gate
  // node, then resume so they flow into the run ledger and shape the next run.
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
    // Program gate review resumes the program run (exact staged items reused, full domain loop runs);
    // the raw-graph path is only for a standalone channel graph.
    if (activeProgramId) { await executeProgram(approvals, next, runResult?.runId); return; }
    await executeGraph(undefined, approvals, next, runResult?.runId);
  }, [decisions, approvals, executeGraph, executeProgram, activeProgramId, operatorSession, runResult?.runId, syncOperator]);

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
    // Bind the new session to the program on screen so its program tools target that program, not
    // the newest one — the deterministic half of making the "Build the first agent" button reliable.
    const response = await createOperatorSession(goal, graph?.id, activeProgramId ?? undefined);
    operatorGraphRevision.current = response.session.graphRevision;
    operatorRunId.current = null;
    ideationAutoOpened.current = false; // a new goal may propose fresh flows to watch load
    setOperatorSession(response.session);
  }, [graph?.id, activeProgramId]);

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

  const handleProjectOpen = useCallback(async (projectId: string) => {
    setProjectBusy(true);
    setGraphError(null);
    try {
      await activateProject(projectId);
      setOperatorSession(null);
      setGraph(null);
      setActiveChannelId(null);
      const project = await refreshProjectScope();
      const channelId = project.activeChannelId
        || project.channels[0]?.id;
      if (channelId) await loadChannel(channelId);
      setView("canvas");
      setOverlay(null);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBusy(false);
    }
  }, [loadChannel, refreshProjectScope]);

  const handleProgramOpen = useCallback(async (programId: string) => {
    const program = programs.find((item) => item.id === programId);
    if (!program || !activeProject) return;
    setProjectBusy(true);
    setGraphError(null);
    try {
      setActiveProgramId(program.id);
      setSelection(null);
      setOverlay(null);
      setIdeationOpen(false);
      setView("canvas");
      const graphId = programGraphId(program);
      if (graphId) {
        await setActiveWorkflow(graphId);
        setActiveChannelId(graphId);
      } else if (program.channelId) {
        await setActiveWorkflow(program.channelId);
        setActiveChannelId(program.channelId);
      }
      if (graphId) {
        const [graphResponse, engineResponse] = await Promise.all([
          getGraphTemplate(graphId),
          getEngineState(graphId),
        ]);
        setGraph(graphResponse.graph);
        setFlowRuns(graphResponse.runs ?? []);
        setRunResult(null);
        setEngine(engineResponse.engine);
        setGraphSavedAt(graphResponse.graph.store?.lastRunAt ?? null);
      }
      window.history.replaceState(null, "", `/projects/${encodeURIComponent(activeProject.id)}/programs/${encodeURIComponent(program.id)}/canvas`);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBusy(false);
    }
  }, [activeProject, programs]);

  // "New program" / "Start your first program" — there's no form; a program is born from the
  // conversation. Surface the canvas, leave any open overlay, and summon the co-pilot focused.
  const handleNewProgram = useCallback(() => {
    setOverlay(null);
    setIdeationOpen(false);
    setView("canvas");
    setComposerFocus((n) => n + 1);
  }, []);

  // The canvas says "this program needs agents" — this performs it. Sends a program-scoped
  // instruction to the operator (derive needs → build the agent), which is design-time and
  // reversible (the gate still holds), then opens the chat so the founder watches it work.
  const handleBuildAgents = useCallback((program: OutcomeProgram) => {
    const instruction = `Build the first agent for the program "${program.name}". Derive what agent this program needs from the product, then create the personalized agent and compose its workflow up to the founder gate.`;
    setComposerFocus((n) => n + 1);
    void handleComposerSend(instruction);
  }, [handleComposerSend]);

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

  // The one-prompt front door: point at a product (scan), then the goal becomes the operator's
  // durable goal, which composes the loop to the gate — the whole stranger path in one action.
  const handleProductStart = useCallback(async (input: { repoPath: string; outcome: string; goal: string }) => {
    setProjectBusy(true);
    setGraphError(null);
    try {
      await createProject({ repoPath: input.repoPath, outcome: input.outcome });
      setOperatorSession(null);
      setGraph(null);
      setActiveChannelId(null);
      await refreshProjectScope();
      setView("canvas");
      // Hand the goal to the operator — it inspects the freshly-scanned product and composes the
      // system, exactly like the dogfood session did, so the stranger watches their OWN loop build.
      const response = await createOperatorSession(input.goal);
      operatorGraphRevision.current = response.session.graphRevision;
      operatorRunId.current = null;
      setOperatorSession(response.session);
      setComposerFocus((n) => n + 1);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
      setView("start");
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

  // Accepting an opportunity no longer persists-and-switches immediately. It PREVIEWS the composed
  // system (no persistence) and drops it onto the canvas as a ghost the founder accepts or discards —
  // the same stage-then-gate move the operator already uses for graph edits.
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
      const preview = await previewOpportunityChannel(activeProject.id, input);
      setPendingComposition({
        input,
        name: preview.name,
        objective: preview.objective,
        preview: {
          id: "composition-preview",
          name: preview.name,
          version: "preview",
          nodes: preview.graph.nodes,
          edges: preview.graph.edges,
        },
      });
      setOverlay(null);
      setIdeationOpen(false); // leave the studio/board; the ghost system now sits on the canvas
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBusy(false);
    }
  }, [activeProject]);

  // Accept the staged system: persist the EXACT previewed graph (the apply path replays its
  // nodes/edges, never re-running the model), then land on the new channel's real canvas.
  const handleAcceptComposition = useCallback(async () => {
    if (!activeProject || !pendingComposition) return;
    setProjectBusy(true);
    setGraphError(null);
    try {
      const response = await composeOpportunityChannel(activeProject.id, {
        ...pendingComposition.input,
        graph: { nodes: pendingComposition.preview.nodes, edges: pendingComposition.preview.edges },
      });
      setPendingComposition(null);
      await refreshProjectScope();
      await loadChannel(response.channel.id);
      setOverlay(null);
      setIdeationOpen(false);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBusy(false);
    }
  }, [activeProject, pendingComposition, loadChannel, refreshProjectScope]);

  const handleDiscardComposition = useCallback(() => {
    setPendingComposition(null);
    setGraphError(null);
  }, []);

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
    setIdeationStatus("Ideating workflows from grounded reality…");
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

  // Author a new subagent or skill from the UI: name it, then open the editor on a fresh ref. The
  // artifact has no file yet — the editor's save creates ~/.claude/{agents,skills}/<ref>, so this is
  // the in-product authoring entry the three-lane workspace will eventually grow from.
  const handleNewArtifact = useCallback((type: "agent" | "skill") => {
    const raw = window.prompt(`Name the new ${type} (kebab-case, e.g. ${type === "agent" ? "gtm-lead-scout" : "positioning"})`);
    const ref = raw?.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    if (ref) setArtifactEdit({ type, ref });
  }, []);

  const handleOperatorCancel = useCallback(async () => {
    if (!operatorSession) return;
    const response = await cancelOperatorSession(operatorSession.id);
    syncOperator(response.session);
  }, [operatorSession, syncOperator]);

  // Derived
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
  const activeProgram = useMemo(
    () => programs.find((program) => program.id === activeProgramId)
      ?? findProgramForGraph(programs, graph?.id)
      ?? null,
    [activeProgramId, graph?.id, programs],
  );
  const programRuns = useMemo(
    () => graphBelongsToProgram(graph, activeProgram) ? flowRuns : [],
    [activeProgram, flowRuns, graph],
  );

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

  // The ranked Problems across the system — the engine's investigations, surfaced now as a toolbar
  // chip + popover (the explorer rail's Problems section moved here when the rail dissolved). An empty
  // graph has no nodes to fault, so it shows no problems even if the engine carries stale signals.
  const problems = useMemo(
    () => (graph?.nodes.length === 0 ? [] : engine?.investigations ?? []),
    [graph, engine],
  );
  // Some subsystems (learn) have no node of their own — route to the gate, where founder decisions
  // are recorded, so a problem never dead-ends. Mirrors GtmExplorer's nodeForSubsystem.
  const nodeForSubsystem = useCallback((subsystem: string) => {
    const ROUTE_FALLBACK: Record<string, string> = { learn: "gate" };
    return graph?.nodes.find((n) => n.category === subsystem)
      ?? (ROUTE_FALLBACK[subsystem] ? graph?.nodes.find((n) => n.category === ROUTE_FALLBACK[subsystem]) : null)
      ?? null;
  }, [graph]);

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
    setProblemsOpen(false);
  }, []);

  // The single "open a side view" router the dissolved explorer rail used for its foot buttons. Now
  // shared by the OutcomeSwitcher's "Ideate" action and the dock's "what Claude reads" strip, so all
  // entry points drive the same overlay/ideation state.
  const handleOpenView = useCallback((v: "opportunities" | "understand" | "product" | "canvas") => {
    if (v === "opportunities") void startIdeation();
    else if (v === "understand") { setIdeationOpen(false); setOverlay("understand"); }
    else if (v === "product") { setIdeationOpen(false); setOverlay("product"); }
    else { setOverlay(null); setIdeationOpen(false); }
  }, [startIdeation]);


  const runCount = graph?.store?.runs ?? flowRuns.length;

  // ── Approvals — the founder gate, surfaced ────────────────────────────────
  // The cross-system count is real pending-gate data from each channel's ledger. The panel itself
  // lists the gate nodes waiting in the run on screen (the operator's pending gate, or the last run's
  // pendingGates), each with the staged drafts it is holding — never fabricated. If nothing is
  // pending, the panel shows the honest quiet state.
  const approvalItems = useMemo(() => {
    const gateNodeIds = operatorSession?.status === "waiting_for_gate"
      ? operatorSession.pendingGate?.nodeIds ?? []
      : runResult?.pendingGates ?? [];
    return gateNodeIds.map((nodeId) => {
      const node = graph?.nodes.find((n) => n.id === nodeId) ?? null;
      const result = runResult?.nodes[nodeId] ?? null;
      return { nodeId, label: node?.label ?? nodeId, items: result?.items ?? [] };
    });
  }, [operatorSession, runResult, graph]);
  // The badge counts the real drafts staged in the loaded outcome's run when one is open; it only
  // falls back to the cross-channel meta count (which can lag a headless run) when nothing is loaded.
  const loadedDrafts = approvalItems.reduce((sum, gate) => sum + gate.items.length, 0);
  const pendingApprovals = loadedDrafts > 0
    ? loadedDrafts
    : channels.reduce((sum, ch) => sum + (ch.pendingGates ?? 0), 0);

  // On-canvas proposals: when the operator stages a graph change, render the would-be graph with the
  // new nodes/edges ghosted and let the founder accept or discard. "Vibe up to the gate" now covers
  // the agent editing the graph too — nothing it proposes lands until the founder accepts on-canvas.
  const pendingProposal = operatorSession?.status === "waiting_for_proposal" ? operatorSession.pendingProposal ?? null : null;
  const proposalActive = !!(pendingProposal && graph && pendingProposal.graphId === graph.id);
  // The operator's graph-edit proposal and an opportunity's staged starter system are mutually
  // exclusive on the canvas; the operator proposal (an edit to a loaded graph) wins when both exist.
  const compositionPreview = pendingComposition?.preview ?? null;
  const compositionActive = !!(compositionPreview && !proposalActive);
  const displayGraph = proposalActive && pendingProposal
    ? pendingProposal.preview
    : compositionActive
      ? compositionPreview
      : graph;
  const proposedNodeIds = useMemo(() => {
    if (proposalActive && pendingProposal && graph) {
      const current = new Set(graph.nodes.map((node) => node.id));
      return new Set(pendingProposal.preview.nodes.filter((node) => !current.has(node.id)).map((node) => node.id));
    }
    // A whole new system staged from an accepted opportunity — every node is a ghost until applied.
    if (compositionActive && compositionPreview) {
      return new Set(compositionPreview.nodes.map((node) => node.id));
    }
    return undefined;
  }, [proposalActive, pendingProposal, graph, compositionActive, compositionPreview]);
  const proposedEdgeIds = useMemo(() => {
    if (proposalActive && pendingProposal && graph) {
      const current = new Set(graph.edges.map((edge) => edge.id));
      return new Set(pendingProposal.preview.edges.filter((edge) => !current.has(edge.id)).map((edge) => edge.id));
    }
    if (compositionActive && compositionPreview) {
      return new Set(compositionPreview.edges.map((edge) => edge.id));
    }
    return undefined;
  }, [proposalActive, pendingProposal, graph, compositionActive, compositionPreview]);

  const handleResolveProposal = useCallback(async (accept: boolean) => {
    if (!operatorSession) return;
    try {
      // Accept commits the exact staged ops server-side and bumps the graph revision; syncOperator
      // reloads the real graph. Discard drops them and resumes the operator.
      const response = await resolveOperatorProposal(operatorSession.id, accept);
      syncOperator(response.session);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    }
  }, [operatorSession, syncOperator]);

  return (
    <main className={`loop-shell ${view === "canvas" ? "canvas-bleed" : ""}`}>
      {/* ── Toolbar ──────────────────────────────────────────────────────────
          The canvas view is full-bleed: the global top toolbar is gone there, and every control it
          held moves into the FloatingDock that floats top-center over the canvas (rendered below in
          the canvas area). The toolbar survives only for the non-canvas views (the product picker /
          cold-start), where it carries the product switcher and the breadcrumb. */}
      {view !== "canvas" ? (
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
            onNewProduct={() => setView("start")}
          />
          <span className="loop-toolbar-sep">/</span>
          {/* Non-canvas views (product picker / cold-start) get only the static crumb — every other
              control moved to the FloatingDock that floats over the canvas. */}
          <span className="loop-toolbar-crumb loop-toolbar-crumb-active">
            {view === "projects" ? "Products" : "New product"}
          </span>
        </div>

        <div className="loop-toolbar-right">
          <div
            className={`loop-model-btn ${operatorSession ? "operator-present" : ""} ${connection && !connection.connected ? "disconnected" : ""}`}
            title={connection && !connection.connected ? connection.reason ?? "Claude is not connected." : connection?.label ?? undefined}
          >
            <span className={`loop-model-dot ${operatorSession ? "live" : ""} ${connection && !connection.connected ? "off" : ""}`} />
            {operatorSession
              ? `Claude · ${statusLabel(operatorSession.status)}`
              : connection && !connection.connected
                ? "Claude · not connected"
                : "Claude · subscription"}
          </div>
        </div>
      </header>
      ) : null}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {/* The left explorer rail is dissolved: the canvas IS the interface. Outcome navigation moved to
          the OutcomeSwitcher in the top bar, the Library to a summoned palette on the canvas, the
          "what Claude reads" feeds into the dock, and Problems to a toolbar chip. The canvas now fills
          the body. */}
      <div className={`loop-body canvas-full ${view !== "canvas" ? "studio-mode" : ""}`}>
        {/* Center — the canvas IS the workspace. Only the cold-start picker replaces it. */}
        <section className="loop-canvas-area">
          {/* The floating control dock — every control the old top toolbar and program sub-header
              held, in one calm bar floating top-center over the full-bleed canvas. */}
          {view === "canvas" ? (
            <FloatingDock
              projects={projects}
              activeProjectId={activeProject?.id ?? null}
              projectBusy={projectBusy}
              onSwitchProject={handleProjectOpen}
              onManageProjects={() => setView("projects")}
              onNewProduct={() => setView("start")}
              programs={programs}
              channels={channels}
              activeProgramId={activeProgram?.id ?? null}
              activeChannelId={activeChannelId}
              onOpenProgram={(id) => { void handleProgramOpen(id); }}
              onOpenChannel={(id) => { setOverlay(null); setIdeationOpen(false); void loadChannel(id); }}
              onNewProgram={handleNewProgram}
              onIdeate={() => handleOpenView("opportunities")}
              showGtmToggle={!!activeProject}
              productMode={overlay === "product"}
              onModeToggle={(v) => { if (v === "product") { setIdeationOpen(false); setOverlay("product"); } else { setOverlay(null); } }}
              mode={activeTab}
              onModeChange={setActiveTab}
              problems={problems}
              problemsOpen={problemsOpen}
              onToggleProblems={() => setProblemsOpen((v) => !v)}
              nodeForSubsystem={nodeForSubsystem}
              onJumpToNode={jumpToNode}
              pendingApprovals={pendingApprovals}
              approvalsOpen={approvalsOpen}
              onToggleApprovals={() => setApprovalsOpen((v) => !v)}
              graph={graph}
              running={graphRunning}
              runningNodeId={runningNodeId}
              onSimulate={() => { setActiveTab("simulation"); if (!activeProgram) void streamRun(); }}
              onRun={() => void (activeProgram ? executeProgram() : streamRun())}
              inspecting={inspecting}
              onToggleInspect={() => setInspecting((v) => !v)}
              session={operatorSession}
              connection={connection}
            />
          ) : null}
          {view === "start" ? (
            <ProductEntry
              busy={projectBusy}
              onStart={handleProductStart}
              onSeePortfolio={projects.length ? () => setView("projects") : undefined}
            />
          ) : view === "projects" ? (
            <ProjectPicker
              activeProjectId={activeProject?.id ?? null}
              busy={projectBusy}
              onCreate={handleProjectCreate}
              onNewProduct={() => setView("start")}
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
                  <strong>{projectBusy ? "Ideating workflows…" : "No workflows yet"}</strong>
                  <span>{projectBusy
                    ? (ideationStatus ?? "Reading your product and the cited evidence, proposing workflows.")
                    : "Re-ideate to propose workflows for this product."}</span>
                </div>
              )}
              <div className="ideation-topbar">
                <div className="ideation-topbar-title">
                  <span className="ideation-board-eyebrow">Ideating workflows</span>
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
          ) : compositionActive ? (
            // A starter system staged from an accepted opportunity — drawn ghosted on the canvas
            // (read-only) until the founder accepts or discards it in the bar below.
            <GraphCanvas
              connectors={connectors}
              contractAudits={contractAudits}
              graph={displayGraph ?? compositionPreview!}
              proposedNodeIds={proposedNodeIds}
              proposedEdgeIds={proposedEdgeIds}
              onSelect={setSelection}
              panelOpen={false}
              result={null}
              running={false}
              selection={selection}
              subsystemHealth={{}}
            />
          ) : activeProgram ? (
            <ProgramCanvas
              agents={agentInstances}
              evaluations={agentEvaluations}
              events={domainEvents}
              feedback={feedbackSignals}
              graph={graphBelongsToProgram(displayGraph, activeProgram) ? displayGraph : null}
              mode={activeTab}
              inspecting={inspecting}
              onInspectingChange={setInspecting}
              onBuildAgents={() => handleBuildAgents(activeProgram)}
              onSelectNode={setSelection}
              proposedNodeIds={proposedNodeIds}
              proposedEdgeIds={proposedEdgeIds}
              proposalActive={proposalActive}
              onResolveProposal={(accept) => void handleResolveProposal(accept)}
              onSubmitReview={(id, d) => void submitGateReview(id, d)}
              onApproveGate={(id) => void approveGate(id)}
              onNodePositionChange={handleNodePositionChange}
              onConnectNodes={handleGraphConnect}
              onDeleteEdges={handleDeleteEdges}
              onAddNode={handleAddNode}
              onLoadRecipe={handleLoadPilotRecipe}
              onOpenLibrary={() => setLibraryPaletteOpen(true)}
              focusDebug={null}
              policies={agentPolicies}
              program={activeProgram}
              runResult={runResult}
              running={graphRunning}
              runningNodeId={runningNodeId}
              runs={programRuns}
              selection={selection}
              connectors={connectors}
              subsystemHealth={subsystemHealth}
              contractAudits={contractAudits}
              nodeEditor={{
                flowRuns,
                subsystem: selectedNodeSubsystem,
                onApproveGate: (id) => void approveGate(id),
                onSubmitReview: (id, d) => void submitGateReview(id, d),
                onRunNode: (id) => void executeGraph(id),
                onUpdateGraph: updateGraph,
                onOpenArtifact: (type, ref) => setArtifactEdit({ type, ref }),
                onDeleteNode: handleDeleteNode,
                onClose: () => setSelection(null),
              }}
            />
          ) : graph ? (
            <>
              <GraphCanvas
                connectors={connectors}
                contractAudits={contractAudits}
                graph={displayGraph ?? graph}
                proposedNodeIds={proposedNodeIds}
                proposedEdgeIds={proposedEdgeIds}
                proposalActive={proposalActive}
                onResolveProposal={(accept) => void handleResolveProposal(accept)}
                onSubmitReview={(id, d) => void submitGateReview(id, d)}
                onApproveGate={(id) => void approveGate(id)}
                onAddNode={handleAddNode}
                onConnectNodes={handleGraphConnect}
                onDeleteEdges={handleDeleteEdges}
                onLoadRecipe={handleLoadPilotRecipe}
                onNodePositionChange={handleNodePositionChange}
                onOpenLibrary={() => setLibraryPaletteOpen(true)}
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
          ) : operatorSession && (operatorSession.status === "ready" || operatorSession.status === "running") ? (
            // The operator is already composing the loop from the goal just given — never re-ask for
            // the goal here. Show a focused "building" state; the live work streams in the dock.
            <div className="building-state">
              <LoaderCircle className="spin" />
              <strong>Claude is building your loop</strong>
              <span>Reading {activeProject?.name ?? "your product"} and composing the system to chase your goal — it'll stop at your gate. Watch it work in the panel on the right.</span>
            </div>
          ) : (
            // No channel selected yet and nothing composing — the goal-driven front door.
            <GoalLauncher
              productName={activeProject?.name ?? "Your product"}
              busy={projectBusy}
              onSubmitGoal={(g) => void handleComposerSend(g)}
              onIdeate={startIdeation}
              onLoadRecipe={handleLoadPilotRecipe}
            />
          )}

          {/* Toolbar overlay: zoom controls at top-left */}
          {view === "canvas" && graph && !activeProgram && !compositionActive && (
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

          {/* Cold start — no live Claude. Compose/ideate/operator all need a signed-in subscription,
              so name the path to connect instead of letting the founder hit a raw error mid-action. */}
          {connection && !connection.connected && (
            <div className="loop-connect-banner" role="status">
              <AlertTriangle />
              <div className="loop-connect-text">
                <strong>Connect Claude to build</strong>
                <span>Composing, ideating, and the operator run on your Claude subscription. Run <code>claude</code> in your terminal to sign in, or set <code>CLAUDE_CODE_OAUTH_TOKEN</code>. You can still explore the canvas, library, and any existing program meanwhile.</span>
              </div>
            </div>
          )}

          {/* Error banner */}
          {graphError && (
            <div className="loop-error-banner" role="alert">
              <AlertTriangle />
              <span>{graphError}</span>
            </div>
          )}

          {/* On-canvas proposal review — Claude staged a graph change; the new nodes/edges are
              ghosted on the canvas and the founder accepts or discards here. */}
          {proposalActive && pendingProposal && (
            <div className="loop-proposal-bar" role="region" aria-label="Proposed graph changes">
              <div className="loop-proposal-text">
                <strong>
                  <Sparkles />
                  Claude proposes {pendingProposal.changes.length} change{pendingProposal.changes.length === 1 ? "" : "s"}
                </strong>
                <span>{pendingProposal.rationale}</span>
              </div>
              <div className="loop-proposal-actions">
                <button className="loop-proposal-discard" disabled={graphRunning} onClick={() => void handleResolveProposal(false)} type="button">
                  Discard
                </button>
                <button className="loop-proposal-accept" disabled={graphRunning} onClick={() => void handleResolveProposal(true)} type="button">
                  <Check /> Accept change{pendingProposal.changes.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          )}

          {/* Staged starter system — an accepted opportunity composed a system, ghosted on the
              canvas. Accept persists that exact graph and lands on its real channel; discard drops it. */}
          {compositionActive && pendingComposition && (
            <div className="loop-proposal-bar" role="region" aria-label="Staged starter system">
              <div className="loop-proposal-text">
                <strong>
                  <Sparkles />
                  Starter system: {pendingComposition.name}
                </strong>
                <span>{pendingComposition.objective} · {pendingComposition.preview.nodes.length} node{pendingComposition.preview.nodes.length === 1 ? "" : "s"} staged. Nothing is saved until you accept.</span>
              </div>
              <div className="loop-proposal-actions">
                <button className="loop-proposal-discard" disabled={projectBusy} onClick={handleDiscardComposition} type="button">
                  Discard
                </button>
                <button className="loop-proposal-accept" disabled={projectBusy} onClick={() => void handleAcceptComposition()} type="button">
                  {projectBusy ? <LoaderCircle className="spin" /> : <Check />} Accept system
                </button>
              </div>
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

          {/* Product mode — the living picture as a full React Flow canvas, the same visual language
              as the GTM graph. It fills the workspace (the explorer + assistant frame stay), so
              flipping GTM↔Product swaps the canvas, not the whole page. The editable INTERPRETATION
              layer on top of the cited truth. */}
          {overlay === "product" && activeProject && (
            <div className="canvas-overlay canvas-overlay-flush" role="region" aria-label="Product mode">
              <ProductCanvas
                model={productModel}
                busy={productModelBusy}
                productName={activeProject.name}
                onDerive={handleDeriveProductModel}
                onRevise={handleReviseProductModel}
                onExitToGtm={() => setOverlay(null)}
              />
            </div>
          )}

          {/* The summoned Library — the canvas "+ Add step" control opens this glass palette. It
              replaces the dissolved left-rail Library: the personalized agents born for THIS outcome
              first, then the on-disk agents and skills, each draggable onto the canvas or added with
              one click. Anchored top-left near the Add control; self-closes on Escape / outside-click. */}
          {view === "canvas" ? (
            <LibraryPalette
              open={libraryPaletteOpen}
              onClose={() => setLibraryPaletteOpen(false)}
              library={library}
              agentInstances={activeProgram ? agentInstances.filter((i) => i.programId === activeProgram.id) : []}
              graph={graph}
              onAddCapability={(type, ref, label) => {
                handleAddNode({ label, kind: type, category: "generate", ref, contract: { accepts: [], emits: [] } });
                setLibraryPaletteOpen(false);
              }}
              onOpenArtifact={(type, ref) => setArtifactEdit({ type, ref })}
              onNewArtifact={handleNewArtifact}
            />
          ) : null}

        </section>

        {/* ── Approvals panel — the founder gate's first-class home ─────────
            Listed: every gated draft the run on screen is holding, with its evidence and a way to
            act. Quiet honest state when nothing is pending. Modeled on a source-control review list:
            the badge counts, this panel resolves. */}
        {approvalsOpen && view === "canvas" ? (
          <aside className="loop-approvals-panel" role="dialog" aria-label="Approvals" aria-modal="false">
            <header className="loop-approvals-head">
              <div className="loop-approvals-head-title">
                <ShieldCheck />
                <strong>Approvals</strong>
                {pendingApprovals > 0 ? <span className="loop-approvals-count">{pendingApprovals}</span> : null}
              </div>
              <button className="loop-approvals-close" onClick={() => setApprovalsOpen(false)} type="button" aria-label="Close approvals">
                <X />
              </button>
            </header>
            <div className="loop-approvals-body">
              {approvalItems.length === 0 ? (
                <div className="loop-approvals-empty">
                  <ShieldCheck />
                  <strong>Nothing waiting</strong>
                  <p>
                    {pendingApprovals > 0
                      ? `${pendingApprovals} draft${pendingApprovals === 1 ? " is" : "s are"} gated in other systems. Open that outcome to review ${pendingApprovals === 1 ? "it" : "them"}.`
                      : "Nothing has reached the gate. When a run stages a draft to send, publish, or charge, it stops here for your approval first — nothing leaves the building without it."}
                  </p>
                </div>
              ) : approvalItems.map((gate) => (
                <section className="loop-approvals-gate" key={gate.nodeId}>
                  <div className="loop-approvals-gate-head">
                    <strong>{gate.label}</strong>
                    <span>{gate.items.length} draft{gate.items.length === 1 ? "" : "s"} staged</span>
                  </div>
                  {gate.items.length === 0 ? (
                    <p className="loop-approvals-gate-note">Staged content loads when this gate's run is open.</p>
                  ) : gate.items.map((item, i) => {
                    // The drafter emits draft_note / suggested_subject_line / founder_name /
                    // grounding_citation; older connectors emit draft / subject / name. Read both so a
                    // real staged note shows its full subject, body, and the evidence for WHY this person.
                    const key = itemKey(item, i);
                    const subject = pickStr(item.suggested_subject_line, item.subject, item.founder_name, item.name, item.handle, item.type) ?? "Staged action";
                    const body = pickStr(item.draft_note, item.draft, item.message, item.summary);
                    const evidence = pickStr(item.grounding_citation, item.icpFitRationale, item.fitRationale, item.nowTrigger);
                    // Discovery motions stage a prospect (no message yet); outbound stages a drafted note.
                    // The gate card adapts to whatever's staged so every motion stays reviewable.
                    const trigger = pickStr(item.nowTrigger, item.now_trigger);
                    const who = pickStr(item.role, item.title, item.company);
                    const sourceUrl = pickStr(item.sourceUrl, item.url, item.founder_github_or_url);
                    const decided = decisions[gate.nodeId]?.[key]?.decision;
                    const wasEdited = !!decisions[gate.nodeId]?.[key]?.editedDraft;
                    const editing = editingDraft?.key === key;
                    return (
                    <article className={`loop-approvals-item ${decided ? `is-${decided}` : ""}`} key={key}>
                      <div className="loop-approvals-item-text">
                        <strong>{subject}</strong>
                        {editing ? (
                          <textarea
                            className="loop-approvals-edit"
                            value={editingDraft.text}
                            onChange={(e) => setEditingDraft({ key, text: e.target.value })}
                            rows={7}
                            autoFocus
                          />
                        ) : body ? (
                          <p className="loop-approvals-body">{body}</p>
                        ) : (
                          <div className="loop-approvals-prospect">
                            {trigger ? <p><span className="k">Now:</span> {trigger}</p> : null}
                            {who ? <p><span className="k">Who:</span> {who}</p> : null}
                            {sourceUrl ? <p><span className="k">Source:</span> {sourceUrl}</p> : null}
                          </div>
                        )}
                        {evidence ? <p className="loop-approvals-evidence">Why them: {evidence}</p> : null}
                      </div>
                      {/* Per-draft review IS the diff — one human at a time, and the decision banks taste.
                          Approve / edit-then-approve / reject each record a per-item decision that flows
                          into the run ledger and shapes the next run's drafter. */}
                      {decided ? (
                        <div className={`loop-approvals-decided is-${decided}`}>
                          {decided === "approve" ? "Approved" : "Rejected"}{wasEdited ? " · your edit banked" : ""}
                        </div>
                      ) : editing ? (
                        <div className="loop-approvals-item-actions">
                          <button className="appr-approve" type="button"
                            onClick={() => { void submitGateReview(gate.nodeId, { [key]: { decision: "approve", editedDraft: editingDraft.text } }); setEditingDraft(null); }}>
                            Save &amp; approve
                          </button>
                          <button className="appr-ghost" type="button" onClick={() => setEditingDraft(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div className="loop-approvals-item-actions">
                          <button className="appr-approve" type="button"
                            onClick={() => void submitGateReview(gate.nodeId, { [key]: { decision: "approve" } })}>
                            Approve
                          </button>
                          <button className="appr-edit" type="button"
                            onClick={() => setEditingDraft({ key, text: body ?? "" })}>
                            Edit
                          </button>
                          <button className="appr-reject" type="button"
                            onClick={() => void submitGateReview(gate.nodeId, { [key]: { decision: "reject" } })}>
                            Reject
                          </button>
                        </div>
                      )}
                    </article>
                    );
                  })}
                </section>
              ))}
            </div>
          </aside>
        ) : null}

        {/* Persistent Claude co-pilot — channels + conversation + composer, always docked */}
        {view === "canvas" ? <ComposerDock
          session={operatorSession}
          running={graphRunning}
          floating={!!activeProgram && !ideationOpen}
          focusSignal={composerFocus}
          boundChannelName={boundChannel?.name ?? null}
          viewingMismatch={viewingMismatch}
          onSend={handleComposerSend}
          onCancel={handleOperatorCancel}
          onReviewGate={(nodeId) => setSelection(nodeId)}
          onReturnToChannel={boundChannel ? () => void loadChannel(boundChannel.id) : undefined}
          contextManifest={contextManifest}
          onOpenGrounding={() => handleOpenView("understand")}
          onOpenPicture={() => handleOpenView("product")}
          onIdeate={() => handleOpenView("opportunities")}
        /> : null}
      </div>

      {/* The node editor lives in the program workbench's right panel (ProgramCanvas). This modal
          remains only for the bare-channel graph path, which has no workbench around it. */}
      {selectedNode && graph && !activeProgram && (
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
        open={activeTab === "simulation" && !activeProgram}
        result={runResult}
        running={graphRunning}
        onClose={() => setActiveTab("design")}
        onSelectRun={(run) => {
          setRunResult(run);
          setSelection(run.pendingGates[0] ?? Object.keys(run.nodes)[0] ?? null);
        }}
      />
    </main>
  );
}
