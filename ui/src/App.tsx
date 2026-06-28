import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, LoaderCircle, Play, ShieldCheck, Lightbulb, X,
} from "lucide-react";
import {
  applyGraphOperations as applyGraphOperationsApi,
  auditGraph,
  getConnectors,
  getCapabilities,
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
  getClarity,
  addClarity,
  removeClarity,
  listPeople,
  getChannelFeeds,
  getDirectedFeeds,
  deriveChannelFrom,
  listProjects,
  runGraph,
  runProgramStream,
  activateProject,
  deleteProject,
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
import { WorkspaceView } from "@/components/WorkspaceView";
import { AgentProfile, type AgentProfileView, type TeammateView } from "@/components/AgentProfile";
import { ComposerDock } from "@/components/ComposerDock";
import { ConnectCapability } from "@/components/ConnectCapability";
import { FloatingDock } from "@/components/FloatingDock";
import { GraphCanvas, type OperatorCursorState } from "@/components/GraphCanvas";
import { TeamOnboarding } from "@/components/TeamOnboarding";
import { convexEnabled, loadTeamIdentity, type TeamIdentity } from "@/lib/convex";
import { GoalLauncher } from "@/components/GoalLauncher";
import { NodeEditor } from "@/components/NodeEditor";
import { ProgramCanvas } from "@/components/ProgramCanvas";
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
import { GtmCanvas, type GtmCanvasModel } from "@/components/canvas/GtmCanvas";
import { CanvasCard } from "@/components/CanvasCard";
import { ClarityCard } from "@/components/ClarityCard";
import { PeopleLens } from "@/components/lenses/PeopleLens";
import { ExperimentMatrixLens } from "@/components/lenses/ExperimentMatrixLens";

// The views you can summon onto the GTM canvas as draggable cards — the agentic replacement for
// lens tabs. You pop one up, drag it, dismiss it; Claude can summon the same cards.
const SUMMON_GTM = [
  { id: "people", label: "People", desc: "Everyone your channels have touched, across the portfolio." },
  { id: "experiments", label: "Experiment matrix", desc: "ICP × claim × channel — the live hypotheses." },
];
import { ProjectPicker } from "@/components/ProjectPicker";
import { ProductEntry } from "@/components/ProductEntry";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { Button } from "@/components/ui/button";
import type {
  ChannelMeta, ConnectorMeta, ContextManifest, DataAdapter, Decisions, EngineState, GateDecision, GraphOperation, GtmLibrary, GTMContractAudit, GTMGraph, GTMNode, GTMOpportunity,
  GTMProject, GTMRunResult, NodeSelection, OperatorSession, OpportunityStudio as OpportunityStudioState, ProjectSummary,
  AgentCreationPolicy, AgentInstance, FeedbackSignal, OutcomeProgram,
  AgentEvaluation, DomainEvent, ProductModel, ProductModelEdit,
  CapabilityServer, CapabilityTool, Person, ChannelFeed, DirectedFeed,
  ClarityObject, ClarityKind, ComposerPosture,
} from "@/types";

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
  // The canvas IS the workspace. "projects" is the only other base view — the cold-start picker
  // before any product exists. Understand and Opportunities are no longer destinations that swap
  // the canvas out; they float OVER it as dismissable overlays (set via `overlay`), so the IDE is
  // never replaced. Channels live in the explorer, not a page.
  const [view, setView] = useState<"projects" | "canvas" | "start">("canvas");
  const [booted, setBooted] = useState(false);
  // True until the initial boot load resolves. Guards the canvas empty-state so a deep-link / reload
  // shows a calm "loading your workspace" instead of flashing the cold-start goal launcher for the
  // 1–2s before the project's graph arrives.
  const [booting, setBooting] = useState(true);
  const [overlay, setOverlay] = useState<"understand" | "product" | "capabilities" | null>(null);
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
  // The current project id, mirrored into a ref so URL-sync inside the `[]`-dep load callbacks can read
  // it without re-creating those callbacks every time the project changes.
  const activeProjectIdRef = useRef<string | null>(null);
  activeProjectIdRef.current = activeProject?.id ?? null;
  // The active project id, declared here (next to the ref) so the callbacks and effects below — which
  // depend on it — can all read it without hitting a temporal-dead-zone error.
  const activeProjectId = activeProject?.id ?? null;
  // The project a given operator session is locked to — threaded EXPLICITLY through every operator call
  // so the backend can reject (409) a session that drifted off the project on screen. The session's own
  // stored projectId is authoritative; the active project on screen is the fallback for legacy sessions.
  const operatorProjectId = (session: OperatorSession): string =>
    session.projectId ?? activeProjectIdRef.current ?? "";
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
  // The three-lane workspace overlay (workflows / skills / agents). Full-bleed over the canvas.
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  // The Problems popover — the engine's investigations, surfaced as a compact toolbar chip now that
  // the Problems rail section is gone with the explorer.
  const [problemsOpen, setProblemsOpen] = useState(false);
  // Program details — the inspector sheet (agents, measurement, learning) over the canvas. Lifted
  // here from ProgramCanvas so the FloatingDock's details toggle drives the same sheet.
  const [inspecting, setInspecting] = useState(false);
  // The active lens per mode — lifted out of the canvas shell so the ONE command dock owns the
  // switcher (one bar, not two). GTM defaults to engine on the overview and channel-flow with a
  // channel open; Product defaults to conceptual.
  // The base canvas per mode (no lens taxonomy): GTM shows the engine on the overview and a channel's
  // flow when one is open; Product shows the one object map. Everything else is summoned as a card.
  const [gtmLensId, setGtmLensId] = useState("engine");
  const [productLensId] = useState("conceptual");
  useEffect(() => {
    setGtmLensId(activeChannelId ? "channel-flow" : "engine");
  }, [activeChannelId]);
  // Summoned cards on the canvas — one per kind (summoning an open view is a no-op). Claude or the
  // composer + pops these up; they're draggable and dismissible.
  const [summoned, setSummoned] = useState<string[]>([]);
  const summonView = useCallback((kind: string) => {
    setSummoned((cur) => (cur.includes(kind) ? cur : [...cur, kind]));
  }, []);
  const dismissCard = useCallback((kind: string) => {
    setSummoned((cur) => cur.filter((k) => k !== kind));
  }, []);

  // Ideate — the composer's thinking posture, and the durable clarity it pins onto the canvas.
  const [composerPosture, setComposerPosture] = useState<ComposerPosture>("build");
  const [clarityItems, setClarityItems] = useState<ClarityObject[]>([]);
  // Pin an insight from the ideate conversation as a durable clarity card on the canvas.
  const pinClarity = useCallback(async (kind: ClarityKind, text: string) => {
    if (!activeProjectId || !text.trim()) return;
    try {
      const { item } = await addClarity(activeProjectId, kind, text.trim());
      setClarityItems((cur) => [...cur, item]);
    } catch { /* a failed pin is silent — the conversation is unaffected */ }
  }, [activeProjectId]);
  const dismissClarity = useCallback(async (itemId: string) => {
    setClarityItems((cur) => cur.filter((c) => c.id !== itemId));
    if (activeProjectId) { try { await removeClarity(activeProjectId, itemId); } catch { /* keep the optimistic removal */ } }
  }, [activeProjectId]);
  const [projectBusy, setProjectBusy] = useState(false);
  // Is a live Claude available? Drives the cold-start state — composing, ideating, and the operator
  // all need a signed-in subscription, so an unconnected founder gets a clear path, not a dead end.
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);

  // Graph state
  const [graph, setGraph] = useState<GTMGraph | null>(null);
  // One project, one canvas: every built workflow drawn as a labelled lane on the SAME canvas. This
  // is the project's home view; focusing a single workflow (clicking a lane, or the breadcrumb) loads
  // it into `graph` for editing/running through the existing single-graph machinery. Overview is the
  // active surface when this is set and nothing single is focused.
  // The portfolio-map overview is now a LENS of the GTM canvas, not a separately-assembled swimlane
  // graph. This flag says "show the project as the portfolio map" (no single channel focused).
  const [overviewActive, setOverviewActive] = useState(false);
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
  // The team layer (Convex). Null when running solo/local — the whole team flow is opt-in and only
  // engages when a deployment is configured (VITE_CONVEX_URL). Seeded from localStorage so a returning
  // teammate lands straight in the workspace, not back through onboarding.
  const [teamIdentity, setTeamIdentity] = useState<TeamIdentity | null>(() => loadTeamIdentity());
  const [connectors, setConnectors] = useState<ConnectorMeta[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityServer[]>([]);
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
  // The shared People object — durable identities promoted from real run entrants, read-only. Feeds
  // the GTM canvas's People lens (find-references / dedup) and is refreshed after each run promotes
  // new entrants.
  const [people, setPeople] = useState<Person[]>([]);
  // Undirected links between channels that share real entities — the feeds the engine view draws.
  const [channelFeeds, setChannelFeeds] = useState<ChannelFeed[]>([]);
  // Directional, founder-drawn feeds (one channel pulls another's output) — drawn as arrows.
  const [directedFeeds, setDirectedFeeds] = useState<DirectedFeed[]>([]);
  // Channels you're building — shown and switchable in the persistent co-pilot dock.
  const [channels, setChannels] = useState<ChannelMeta[]>([]);
  // Whether the project already has real workflows to show (built channels or compiled programs),
  // mirrored into a ref so the operator poll can read it without stale closure. Used to stop the
  // ideation board from auto-opening over a project that already has a populated canvas.
  const hasBuiltWorkflowsRef = useRef(false);
  hasBuiltWorkflowsRef.current = programs.length > 0 || channels.some((ch) => ch.nodeCount > 0);
  // The full-markdown editor for the real subagent/skill artifacts an open step runs.
  const [artifactEdit, setArtifactEdit] = useState<{ type: "agent" | "skill"; ref: string } | null>(null);
  // Which agent's profile is open — the centered "meet this teammate" sheet. Opening an agent shows
  // the person (role, mission, what it's learning, contract, guardrails), not the raw file. Editing
  // the source markdown is still one click away inside the sheet.
  const [agentProfileRef, setAgentProfileRef] = useState<string | null>(null);

  // The team rail in the profile: each born agent once, keyed by ref (latest version wins). These are
  // the personalized teammates working this product's outcomes, not the stock library.
  const agentTeam = useMemo<TeammateView[]>(() => {
    const byRef = new Map<string, AgentInstance>();
    for (const inst of agentInstances) {
      if (inst.status === "retired") continue;
      const prior = byRef.get(inst.ref);
      if (!prior || (inst.version ?? 0) > (prior.version ?? 0)) byRef.set(inst.ref, inst);
    }
    return [...byRef.values()].map((i) => ({ ref: i.ref, job: i.job }));
  }, [agentInstances]);

  // Assemble the open agent's profile from REAL data — a born instance (the personalized teammate) if
  // one matches the ref, otherwise a stock library agent (lighter, not personalized). Team-level
  // signal/eval counts are the genuine totals, never seeded.
  const agentProfileView = useMemo<AgentProfileView | null>(() => {
    if (!agentProfileRef) return null;
    const instances = agentInstances.filter((i) => i.ref === agentProfileRef);
    const instance = instances.find((i) => i.status === "active")
      ?? instances.sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
    const teamSignalCount = feedbackSignals.length;
    const teamEvalCount = agentEvaluations.length;
    if (instance) {
      const policy = agentPolicies.find((p) => p.id === instance.creationPolicyId) ?? null;
      return {
        ref: instance.ref,
        job: instance.job,
        personalized: true,
        status: instance.status,
        version: instance.version,
        inputContract: instance.inputContract ?? [],
        outputContract: instance.outputContract ?? [],
        policy,
        evaluationCount: agentEvaluations.filter((e) => e.agentInstanceId === instance.id).length,
        teamSignalCount,
        teamEvalCount,
      };
    }
    // Stock on-disk agent (clicked in the library, never born for an outcome): show what the
    // definition gives us, marked honestly as not yet personalized.
    const stock = library?.agents.find((a) => a.ref === agentProfileRef);
    return {
      ref: agentProfileRef,
      job: stock?.description ?? "A library agent. Open the source to see what it does.",
      personalized: false,
      inputContract: [],
      outputContract: [],
      policy: null,
      evaluationCount: 0,
      teamSignalCount,
      teamEvalCount,
    };
  }, [agentProfileRef, agentInstances, agentPolicies, agentEvaluations, feedbackSignals, library]);
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
      // Sync the URL to the focused workflow so a reload restores it instead of falling back to the
      // overview. A channel that belongs to a program writes the program deep link the boot parser
      // already understands.
      const programId = graphResponse.graph.outcomeProgramId;
      const projectId = activeProjectIdRef.current;
      if (projectId && programId) {
        window.history.replaceState(null, "", `/projects/${encodeURIComponent(projectId)}/programs/${encodeURIComponent(programId)}/canvas`);
      }
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setGraphRunning(false);
    }
  }, []);

  // Zoom out to the one-canvas overview: show the GTM canvas's portfolio-map lens — every built
  // channel as a tile — instead of a single focused workflow. Returns false when there's nothing to
  // show (no channels with nodes), so callers fall back to focusing a single workflow. The assembled
  // swimlane graph is gone; the portfolio lens reads the channel metas the founder already has.
  const loadProjectOverview = useCallback(async (channelsForProject: ChannelMeta[]): Promise<boolean> => {
    const built = channelsForProject.filter((ch) => ch.nodeCount > 0);
    if (!built.length) { setOverviewActive(false); return false; }
    setOverviewActive(true);
    setActiveChannelId(null);
    setActiveProgramId(null);
    setGraph(null);
    setSelection(null);
    setOverlay(null);
    setRunResult(null);
    setView("canvas");
    // Clear the URL back to the project root so a reload from the overview stays on the overview
    // (and doesn't re-focus the last program deep link). Skipped during boot, when the ref isn't set
    // yet and the URL is already root.
    const projectId = activeProjectIdRef.current;
    if (projectId) {
      window.history.replaceState(null, "", `/projects/${encodeURIComponent(projectId)}`);
    }
    return true;
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
      getCapabilities().then((r) => { if (live) setCapabilities(r.servers); }).catch(() => null);
      setChannels(projectResponse.project.channels);
      setActiveProjectState(projectResponse.project);
      setProjects(catalog.projects);
      setBooted(true);
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
      // Land on the one-canvas overview of every workflow, unless a deep link routed us to a specific
      // program (then honor it and focus that workflow). Falls through to the single-workflow focus
      // below when there's no overview to draw.
      if (!routedProgramId) {
        const wentOverview = await loadProjectOverview(projectResponse.project.channels);
        if (!live) return;
        if (wentOverview) {
          const engineResponse = await getEngineState();
          if (live) setEngine(engineResponse.engine);
          return;
        }
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
    }).catch(console.error).finally(() => { if (live) setBooting(false); });
    return () => { live = false; };
    // Boot runs once on mount; loadProjectOverview is a stable callback, listed to satisfy the linter.
  }, [loadProjectOverview]);

  // Restore the latest durable operator session for the active product. Re-runs
  // whenever the active product changes, so switching products in the top-left
  // swaps the Claude session to that product's own chat (or clears it if none).
  useEffect(() => {
    if (!activeProjectId) return;
    let live = true;
    listOperatorSessions(activeProjectId)
      .then(async ({ sessions }) => {
        if (!live) return;
        // The dock binds to the project's ONE durable conversation: prefer the active (non-terminal)
        // thread; fall back to the newest session so a just-finished one (which may still hold an
        // unresolved on-canvas proposal) stays on screen. Older terminal sessions are reopenable history.
        const TERMINAL = ["completed", "cancelled"];
        const active = sessions.find((s) => !TERMINAL.includes(s.status)) ?? sessions[0];
        if (!active) { setOperatorSession(null); return; }
        const response = await getOperatorSession(active.id, activeProjectId);
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

  // Load the shared People for the active project — the keystone object the People lens projects.
  // Re-fetched when the active product changes and after a run completes (a run promotes new
  // entrants into durable People on the backend). Read-only; cleared when no project is active.
  useEffect(() => {
    let live = true;
    if (!activeProjectId) { setPeople([]); return; }
    listPeople(activeProjectId)
      .then(({ people: loaded }) => { if (live) setPeople(loaded); })
      .catch(() => { if (live) setPeople([]); });
    return () => { live = false; };
  }, [activeProjectId, runResult]);

  // Load the durable clarity (pinned from Ideate sessions) for the active project.
  useEffect(() => {
    let live = true;
    if (!activeProjectId) { setClarityItems([]); return; }
    getClarity(activeProjectId)
      .then(({ items }) => { if (live) setClarityItems(items); })
      .catch(() => { if (live) setClarityItems([]); });
    return () => { live = false; };
  }, [activeProjectId]);

  // Load the channel feeds — the links the engine view draws between channels. Derived from the same
  // real shared state (People / Claims / Experiments), so re-fetched when the project or a run changes.
  const [feedsRefresh, setFeedsRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    if (!activeProjectId) { setChannelFeeds([]); setDirectedFeeds([]); return; }
    getChannelFeeds(activeProjectId)
      .then(({ feeds }) => { if (live) setChannelFeeds(feeds); })
      .catch(() => { if (live) setChannelFeeds([]); });
    getDirectedFeeds(activeProjectId)
      .then(({ feeds }) => { if (live) setDirectedFeeds(feeds); })
      .catch(() => { if (live) setDirectedFeeds([]); });
    return () => { live = false; };
  }, [activeProjectId, runResult, feedsRefresh]);

  // Drag-to-connect: the founder drew a feed on the engine canvas — wire `toChannelId` to pull
  // `fromChannelId`'s output, then refresh the feeds so the arrow appears. A view-control mutation
  // that only declares topology; nothing sends (the founder gate still gates every run).
  const handleDeriveChannel = useCallback(async (toChannelId: string, fromChannelId: string) => {
    try {
      await deriveChannelFrom(toChannelId, fromChannelId);
      setFeedsRefresh((n) => n + 1);
    } catch (err) {
      console.error("Failed to wire channel feed", err);
    }
  }, []);

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
        const response = await getOperatorSession(operatorSessionId, activeProjectId ?? undefined);
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
            // Auto-open the ideation board only when it's filling an otherwise-empty canvas: there are
            // freshly PROPOSED (undecided) channels AND the project has no built workflows yet. Once
            // real workflows exist (the overview has lanes to show), stale proposals from a past
            // ideation must not re-hijack the canvas on every boot.
            const hasProposedChannels = (opp.opportunities.items ?? []).some((i) => i.type === "channel" && i.status === "proposed");
            if (hasProposedChannels && !hasBuiltWorkflowsRef.current && !ideationAutoOpened.current) {
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
          // Run results render in place on the canvas nodes; a pending gate shows via the Approvals
          // count, and the step-by-step trace lives in the workbench debugger. No mode to switch to.
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
      const response = await resolveOperatorGate(operatorSession.id, operatorProjectId(operatorSession), { approvals: next });
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
      const response = await resolveOperatorGate(operatorSession.id, operatorProjectId(operatorSession), { approvals, decisions: next });
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

  // Drop several connected steps at once. "Review & stage" uses it to place the founder gate and the
  // staged-output node already wired in sequence, so the wall (every execute needs a gate upstream)
  // holds by construction instead of leaving the founder to add — and order — two blocks by hand.
  const handleAddChain = useCallback((specs: (Partial<GTMNode> & { label: string })[]) => {
    if (!graph || !specs.length) return;
    const startX = graph.nodes.reduce((maximum, node) => Math.max(maximum, node.position?.x ?? 0), 0) + 264;
    const stamp = Date.now().toString(36);
    const nodes = specs.map((spec, i) => {
      const base = spec.kind && spec.kind !== "tool" ? spec.kind : spec.category ?? "step";
      return {
        id: `${base}-${stamp}-${i}`, label: spec.label, position: { x: startX + i * 264, y: 0 },
        config: spec.config ?? {}, contract: spec.contract,
        ...(spec.kind && spec.kind !== "tool"
          ? { kind: spec.kind, category: spec.category ?? "generate", ref: spec.ref ?? "" }
          : { category: spec.category ?? "source", connector: spec.connector ?? "manual" }),
      } as GTMNode;
    });
    const ops: GraphOperation[] = [
      ...nodes.map((node) => ({ type: "add_node" as const, node })),
      ...nodes.slice(1).map((node, i) => ({
        type: "connect_nodes" as const,
        edge: { id: `e-${nodes[i].id}-${node.id}`, source: nodes[i].id, target: node.id, edgeType: "data" as const },
      })),
    ];
    void applyOperations(ops).then((next) => {
      if (next) setSelection(nodes[0].id);
    });
  }, [applyOperations, graph]);

  const refreshCapabilities = useCallback(() => {
    getCapabilities().then((r) => setCapabilities(r.servers)).catch(() => null);
  }, []);

  // Drop a connected MCP tool onto the canvas as a step. A read tool runs free (a single
  // enrich node). A write tool acts on the world, so it lands WITH a founder gate upstream —
  // the wall holds by construction, the same way "Review & stage" does, never a lone sender.
  const handleAddTool = useCallback((serverId: string, tool: CapabilityTool) => {
    const ref = `${serverId}/${tool.name}`;
    const config = { server: serverId, tool: tool.name, toolClass: tool.effectiveClass };
    if (tool.effectiveClass === "read") {
      handleAddNode({
        label: tool.name, kind: "mcp", category: "enrich", ref, config,
        contract: { accepts: [], emits: [] },
      });
      return;
    }
    handleAddChain([
      { label: "Founder review", category: "gate", connector: "default", config: {}, contract: { accepts: [], emits: ["approved", "gtmActionId"] } },
      { label: tool.name, kind: "mcp", category: "execute", ref, config, contract: { accepts: ["approved"], emits: ["gtmActionId", "executionStatus"] } },
    ]);
  }, [handleAddNode, handleAddChain]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    void applyOperations([{ type: "remove_node", nodeId }]).then((next) => {
      if (next) setSelection(null);
    });
  }, [applyOperations]);

  const handleDeleteEdges = useCallback((edgeIds: string[]) => {
    if (!edgeIds.length) return;
    void applyOperations(edgeIds.map((edgeId) => ({ type: "disconnect_nodes", edgeId })));
  }, [applyOperations]);

  // Clicking the empty canvas dismisses whatever's open — the in-card editor, the library picker, the
  // agent profile sheet, the Problems/Approvals popovers, the artifact editor. One gesture clears the
  // surface so the canvas is never left cluttered behind a thing you've moved on from.
  const dismissOverlays = useCallback(() => {
    setSelection(null);
    setLibraryPaletteOpen(false);
    setAgentProfileRef(null);
    setProblemsOpen(false);
    setApprovalsOpen(false);
    setArtifactEdit(null);
  }, []);

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
    // The composer is LOCKED to the project on screen — the project id is threaded explicitly and
    // `reuse: true` returns the project's one live thread instead of spawning a parallel conversation.
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    // Bind the new session to the program on screen so its program tools target that program, not
    // the newest one — the deterministic half of making the "Build the first agent" button reliable.
    const response = await createOperatorSession(projectId, goal, graph?.id, activeProgramId ?? undefined);
    operatorGraphRevision.current = response.session.graphRevision;
    operatorRunId.current = null;
    ideationAutoOpened.current = false; // a new goal may propose fresh flows to watch load
    setOperatorSession(response.session);
  }, [graph?.id, activeProgramId]);

  // One conversation: talking to Claude continues the live session, or starts a new one
  // when idle. The dock decides nothing about safety — App owns create vs. resume.
  const handleComposerSend = useCallback(async (text: string) => {
    // In the ideate posture, frame the turn so Claude THINKS WITH the founder — challenges
    // assumptions, gets clear — instead of eagerly composing a channel. Building stays a separate,
    // deliberate move. The framing rides on the message; the build posture sends the text as-is.
    const framed = composerPosture === "ideate"
      ? `[Ideate posture — think and discuss this with me: challenge my assumptions, surface what you know, help me get clear on the go-to-market. Do NOT compose or build a channel/workflow yet — this is thinking, not building.]\n\n${text}`
      : text;
    const s = operatorSession;
    const resumable = s && ["waiting_for_input", "interrupted", "failed"].includes(s.status);
    if (resumable && s) {
      const response = await resumeOperatorSession(s.id, operatorProjectId(s), framed);
      syncOperator(response.session);
    } else {
      await handleCommandSubmit(framed);
    }
  }, [operatorSession, handleCommandSubmit, syncOperator, composerPosture]);

  const handleProjectOpen = useCallback(async (projectId: string) => {
    setProjectBusy(true);
    setGraphError(null);
    try {
      await activateProject(projectId);
      setOperatorSession(null);
      setGraph(null);
      setActiveChannelId(null);
      const project = await refreshProjectScope();
      // Land on the one-canvas overview of every workflow. Only fall back to focusing a single
      // workflow when there's no overview to draw (a project with one or zero built workflows).
      const wentOverview = await loadProjectOverview(project.channels);
      if (!wentOverview) {
        const channelId = project.activeChannelId || project.channels[0]?.id;
        if (channelId) await loadChannel(channelId);
      }
      setView("canvas");
      setOverlay(null);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBusy(false);
    }
  }, [loadChannel, loadProjectOverview, refreshProjectScope]);

  // Remove a duplicate product. The switcher only offers it on non-active rows, so the active scope
  // never vanishes underfoot — a refresh of the project list is all that's needed.
  const handleProjectDelete = useCallback(async (projectId: string) => {
    setProjectBusy(true);
    setGraphError(null);
    try {
      await deleteProject(projectId);
      await refreshProjectScope();
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBusy(false);
    }
  }, [refreshProjectScope]);

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
      } else {
        // The program has no composed workflow yet — clear the previous program's graph, engine, and
        // runs so nothing stale (e.g. the motion chip, node health) carries over onto the "no
        // workflow composed yet" empty state.
        setGraph(null);
        setActiveChannelId(null);
        setFlowRuns([]);
        setRunResult(null);
        setEngine(null);
        setGraphSavedAt(null);
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
      const project = await refreshProjectScope();
      setView("canvas");
      // Hand the goal to the operator — it inspects the freshly-scanned product and composes the
      // system, exactly like the dogfood session did, so the stranger watches their OWN loop build.
      // The session is bound to the just-created project explicitly (the composer's project lock).
      const response = await createOperatorSession(project.id, input.goal);
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

  // Open the ideation canvas and stream it live: proposals first (each lane shows an honest
  // composing card — a shimmer spine plus the model's live reasoning, never a fake workflow), then
  // each channel's REAL model-composed graph streams in and builds out node by node in its lane.
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
        else if (ev.type === "thinking") {
          // Per-lane reasoning streams onto that lane's composing card; channel-less reasoning
          // (the ideation pass itself) stays in the global thinking strip.
          if (ev.channelId) {
            const cid = ev.channelId;
            setLaneStates((s) => {
              const cur = s[cid] ?? { status: "composing" as const, title: "" };
              if (cur.status === "ready") return s; // real graph already landed; don't reopen it
              return { ...s, [cid]: { ...cur, thinking: ((cur.thinking ?? "") + " " + ev.text).slice(-260) } };
            });
          } else {
            setIdeationThinking((t) => (t + " " + ev.text).slice(-600));
          }
        }
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
    const response = await cancelOperatorSession(operatorSession.id, operatorProjectId(operatorSession));
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
    () => buildIdeationCanvas(ideationChannels, laneStates).graph,
    [ideationChannels, laneStates],
  );
  const composedCount = useMemo(
    () => Object.values(laneStates).filter((s) => s.status === "ready").length,
    [laneStates],
  );
  const ideationLaneChannel = ideationLane
    ? ideationChannels.find((c) => c.id === ideationLane) ?? null
    : null;

  // The channel the operator session is bound to — surfaced as a quiet sub-label so the co-pilot
  // names the channel it's narrating. The composer is locked to the project, so there is no
  // "viewing a different channel" mismatch to warn about anymore.
  const boundChannel = operatorSession?.graphId
    ? channels.find((c) => c.graphId === operatorSession.graphId || c.id === operatorSession.graphId) ?? null
    : null;

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
  // Surface a staged proposal whenever the session HOLDS one — not only during the brief
  // waiting_for_proposal window. The operator stages the change and finishes its turn (status flips
  // to completed) while the proposal sits unresolved on the session; gating on waiting_for_proposal
  // stranded that change with no way to decide. The decision is the founder's to make whenever, so
  // the ghosts + cursor + inline ✓/✕/note persist until they resolve it. Cleared on resolve (the
  // backend nulls pendingProposal), so a resolved session shows nothing.
  const pendingProposal = operatorSession?.pendingProposal ?? null;
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

  // Staged reveal: the operator hands back a whole proposal at once, but the founder shouldn't see it
  // pop in fully formed — the new ghost nodes surface one at a time so the workflow visibly builds onto
  // the canvas. Reveal order follows the preview's node order (operation/topology order). This is a
  // client-side reveal of an already-staged proposal, not token-by-token model streaming — the "vibe up
  // to the gate" contract keeps proposals atomic and reviewable, so the build-in is presentational.
  const proposalRevealOrder = useMemo(() => {
    if (!proposalActive || !pendingProposal || !graph) return [] as string[];
    const current = new Set(graph.nodes.map((node) => node.id));
    return pendingProposal.preview.nodes.filter((node) => !current.has(node.id)).map((node) => node.id);
  }, [proposalActive, pendingProposal, graph]);
  const proposalRevealKey = proposalActive ? pendingProposal?.id ?? null : null;
  const [revealCount, setRevealCount] = useState(0);
  useEffect(() => {
    // Nothing to stage (no proposal, or a single node) → reveal everything at once.
    if (!proposalRevealKey || proposalRevealOrder.length <= 1) {
      setRevealCount(proposalRevealOrder.length);
      return;
    }
    setRevealCount(0);
    let count = 0;
    let timer = window.setTimeout(function tick() {
      count += 1;
      setRevealCount(count);
      if (count < proposalRevealOrder.length) timer = window.setTimeout(tick, 260);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [proposalRevealKey, proposalRevealOrder.length]);
  // The surfaced ghosts. Undefined once everything's in (or when no proposal is staging), so GraphCanvas
  // holds nothing back and the canvas reads normally.
  const revealedNodeIds = useMemo(() => {
    if (!proposalActive || proposalRevealOrder.length === 0 || revealCount >= proposalRevealOrder.length) {
      return undefined;
    }
    return new Set(proposalRevealOrder.slice(0, revealCount));
  }, [proposalActive, proposalRevealOrder, revealCount]);

  const handleResolveProposal = useCallback(async (accept: boolean, note?: string) => {
    if (!operatorSession) return;
    try {
      // Accept commits the exact staged ops server-side and bumps the graph revision; syncOperator
      // reloads the real graph. Discard drops them and resumes the operator. An optional note rides
      // along: on reject it's a redirect (Claude comes back and changes it); on accept it's a quiet
      // annotation the operator reads and the learning loop can later pick up.
      const response = await resolveOperatorProposal(operatorSession.id, operatorProjectId(operatorSession), accept, note);
      syncOperator(response.session);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    }
  }, [operatorSession, syncOperator]);

  // The live operator presence: Claude's cursor travels the canvas as it stages each node (camera
  // following), then rests on the lead ghost where the ✓/✕/note sits; when a run pauses at the
  // founder gate, the cursor points there instead. Null whenever there's no operator work on screen.
  const operatorCursor = useMemo<OperatorCursorState | null>(() => {
    if (proposalActive && proposalRevealOrder.length) {
      return {
        phase: revealCount < proposalRevealOrder.length ? "build" : "rest",
        revealOrder: proposalRevealOrder,
        revealCount,
        staged: proposalRevealOrder.length,
      };
    }
    if (operatorSession?.status === "waiting_for_gate" && operatorSession.pendingGate?.nodeIds?.length) {
      return { phase: "gate", revealOrder: [], revealCount: 0, staged: 0, gateNodeId: operatorSession.pendingGate.nodeIds[0] };
    }
    return null;
  }, [proposalActive, proposalRevealOrder, revealCount, operatorSession?.status, operatorSession?.pendingGate]);

  // ── View-control channel (composer → canvas) ──────────────────────────────────
  // The operator's current focus, DERIVED from session state — the stable decision node it's resting
  // on: a staged proposal's lead ghost (where the inline ✓/✕/note sits), or the node a paused run is
  // gated at. This drives the canvas the way an editor follows the cursor: the existing camera-follow
  // (OperatorCursor) frames it, and the selection sync below lights + selects it. It is NAVIGATION
  // ONLY — it never stages an op or crosses the gate (mutation stays the ghost+accept/reject channel).
  const operatorFocusNodeId = useMemo<string | null>(() => {
    if (proposalActive && proposalRevealOrder.length) return proposalRevealOrder[proposalRevealOrder.length - 1];
    if (operatorSession?.status === "waiting_for_gate" && operatorSession.pendingGate?.nodeIds?.length) {
      return operatorSession.pendingGate.nodeIds[0];
    }
    return null;
  }, [proposalActive, proposalRevealOrder, operatorSession?.status, operatorSession?.pendingGate]);

  // Sync the canvas selection to the operator's focus node so the founder's view tracks what Claude is
  // touching — selecting it lights the node (the selected highlight) and the camera frames it. Fires
  // only when the focus node CHANGES, so the founder can freely click elsewhere without being yanked
  // back, mirroring the camera-follow's grab-to-break escape. Read-only: setting selection never runs
  // or stages anything.
  useEffect(() => {
    if (operatorFocusNodeId) setSelection(operatorFocusNodeId);
  }, [operatorFocusNodeId]);

  // The GTM canvas model — one bag the GtmCanvas projects through its lenses. channel-flow reads the
  // graph/run/proposal/handler half; portfolio-map reads the channels + the shared ICP/claim half.
  // Both the single-channel mount and the overview mount pass this same model; only the default lens
  // differs. `graph` is null in overview (no channel focused), which lands channel-flow on its empty
  // state until a tile is clicked.
  const gtmCanvasModel = useMemo<GtmCanvasModel>(() => ({
    graph: displayGraph ?? graph,
    connectors,
    contractAudits,
    result: runResult,
    running: graphRunning,
    runningNodeId,
    selection,
    onSelect: setSelection,
    onPaneClick: dismissOverlays,
    proposedNodeIds,
    proposedEdgeIds,
    revealedNodeIds,
    proposalActive,
    operatorCursor,
    onResolveProposal: (accept) => void handleResolveProposal(accept),
    onSubmitReview: (id, d) => void submitGateReview(id, d),
    onApproveGate: (id) => void approveGate(id),
    onAddNode: handleAddNode,
    onConnectNodes: handleGraphConnect,
    onDeleteEdges: handleDeleteEdges,
    onLoadRecipe: handleLoadPilotRecipe,
    onNodePositionChange: handleNodePositionChange,
    onOpenLibrary: () => setLibraryPaletteOpen(true),
    channels,
    activeChannelId,
    subsystemHealth,
    icp: activeProject?.sharedContext.icp ?? {},
    claims: activeProject?.sharedContext.claims ?? [],
    people,
    experiments: activeProject?.sharedContext.experiments ?? [],
    channelFeeds,
    directedFeeds,
    onDeriveChannel: handleDeriveChannel,
    onOpenChannel: (channelId) => void loadChannel(channelId),
  }), [
    displayGraph, graph, connectors, contractAudits, runResult, graphRunning, runningNodeId, selection,
    dismissOverlays, proposedNodeIds, proposedEdgeIds, revealedNodeIds, proposalActive, operatorCursor,
    handleResolveProposal, submitGateReview, approveGate, handleAddNode, handleGraphConnect, handleDeleteEdges,
    handleLoadPilotRecipe, handleNodePositionChange, channels, activeChannelId, subsystemHealth, activeProject, loadChannel, people, channelFeeds, directedFeeds, handleDeriveChannel,
  ]);

  // First-run team setup. Gated on Convex being configured AND no team chosen yet, so a local/solo
  // install never sees it. All hooks above have already run, so this early return is rules-of-hooks safe.
  if (convexEnabled && !teamIdentity) {
    return <TeamOnboarding onDone={setTeamIdentity} />;
  }

  // Hard gate: nothing in the IDE is usable until a real codebase is grounded. Until the active
  // product has a scanned workspace, the only screen is the folder picker — point it at your product.
  const productGrounded = !!activeProject?.sharedContext?.repository?.workspaceId;
  const groundedProjects = projects.filter((p) => p.repo);
  if (booted && !productGrounded) {
    return (
      <ProductEntry
        busy={projectBusy}
        onStart={handleProductStart}
        onSeePortfolio={groundedProjects.length ? () => { void handleProjectOpen(groundedProjects[0].id); } : undefined}
      />
    );
  }

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
            onDelete={handleProjectDelete}
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
              held, in one calm bar floating top-center over the full-bleed canvas. Hidden while the
              ideation board is open: that board is a focused takeover with its own topbar (Re-ideate /
              Close / live "composing N/M" status), so the floating dock would collide with it. */}
          {view === "canvas" && !ideationOpen && !workspaceOpen ? (
            <FloatingDock
              projects={projects}
              activeProjectId={activeProject?.id ?? null}
              projectBusy={projectBusy}
              onSwitchProject={handleProjectOpen}
              onManageProjects={() => setView("projects")}
              onNewProduct={() => setView("start")}
              onDeleteProject={handleProjectDelete}
              programs={programs}
              channels={channels}
              activeProgramId={activeProgram?.id ?? null}
              activeChannelId={activeChannelId}
              onOpenProgram={(id) => { void handleProgramOpen(id); }}
              onOpenChannel={(id) => { setOverlay(null); setIdeationOpen(false); void loadChannel(id); }}
              onNewProgram={handleNewProgram}
              onIdeate={() => setComposerPosture("ideate")}
              onShowOverview={overviewActive ? () => { void loadProjectOverview(channels); } : undefined}
              overviewActive={overviewActive && !activeChannelId && !activeProgram}
              motionName={engine?.motion?.name ?? null}
              showGtmToggle={!!activeProject}
              productMode={overlay === "product"}
              onModeToggle={(v) => { if (v === "product") { setIdeationOpen(false); setOverlay("product"); } else { setOverlay(null); } }}
              summonItems={overlay === "product" ? undefined : SUMMON_GTM}
              onSummon={summonView}
              problems={problems}
              problemsOpen={problemsOpen}
              onToggleProblems={() => setProblemsOpen((v) => !v)}
              nodeForSubsystem={nodeForSubsystem}
              onJumpToNode={jumpToNode}
              pendingApprovals={pendingApprovals}
              approvalsOpen={approvalsOpen}
              onToggleApprovals={() => setApprovalsOpen((v) => !v)}
              graph={graph}
              audits={contractAudits}
              running={graphRunning}
              runningNodeId={runningNodeId}
              onRun={() => void (activeProgram ? executeProgram() : streamRun())}
              inspecting={inspecting}
              onToggleInspect={() => setInspecting((v) => !v)}
              onOpenWorkspace={() => setWorkspaceOpen(true)}
              session={operatorSession}
              connection={connection}
            />
          ) : null}

          {/* Summoned views — they pop up ON the canvas as draggable cards (the agentic replacement
              for lens tabs). One card per kind; drag by the head, dismiss with ×. */}
          {view === "canvas" && overlay !== "product" && summoned.map((kind, i) => {
            const item = SUMMON_GTM.find((s) => s.id === kind);
            return (
              <CanvasCard
                key={kind}
                title={item?.label ?? kind}
                onDismiss={() => dismissCard(kind)}
                initial={{ x: 150 + i * 46, y: 92 + i * 46 }}
                width={kind === "experiments" ? 640 : 440}
                height={kind === "experiments" ? 460 : 520}
              >
                {kind === "people" ? (
                  <PeopleLens people={gtmCanvasModel.people} channels={gtmCanvasModel.channels} selected={null} onSelect={() => { /* selection within a summoned card is local for now */ }} />
                ) : null}
                {kind === "experiments" ? (
                  <ExperimentMatrixLens experiments={gtmCanvasModel.experiments} claims={gtmCanvasModel.claims} icp={gtmCanvasModel.icp} channels={gtmCanvasModel.channels} selected={null} onSelect={() => {}} />
                ) : null}
              </CanvasCard>
            );
          })}

          {/* Clarity cards — the durable residue of Ideate sessions, pinned onto the canvas. Draggable
              and dismissible like any summoned card; persisted per-project. */}
          {view === "canvas" && overlay !== "product" && clarityItems.map((item, i) => (
            <CanvasCard
              key={item.id}
              title={item.kind === "icp" ? "ICP" : item.kind === "question" ? "Open question" : item.kind === "direction" ? "Direction" : "Claim"}
              onDismiss={() => { void dismissClarity(item.id); }}
              initial={{ x: 180 + ((i + summoned.length) % 4) * 50, y: 120 + ((i + summoned.length) % 4) * 50 }}
              width={380}
            >
              <ClarityCard item={item} />
            </CanvasCard>
          ))}
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
                    {projectBusy ? <LoaderCircle className="spin" /> : <Lightbulb />}
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
              onPaneClick={dismissOverlays}
              panelOpen={false}
              result={null}
              running={false}
              selection={selection}
              subsystemHealth={{}}
            />
          ) : overviewActive && !activeChannelId && !activeProgram ? (
            // One project, one canvas: the portfolio-map lens — every built channel as a tile.
            // Clicking a tile opens that channel's flow (the channel-flow lens). The portfolio map
            // REPLACES the old swimlane overview; the swimlane renderer inside GraphCanvas stays for
            // now and retires once the People / experiment lenses land (P10.3 steps 4–5).
            <GtmCanvas model={gtmCanvasModel} defaultLensId="engine" activeLensId={gtmLensId} onLensChange={setGtmLensId} chromeless />
          ) : activeProgram ? (
            <ProgramCanvas
              agents={agentInstances}
              evaluations={agentEvaluations}
              events={domainEvents}
              feedback={feedbackSignals}
              graph={graphBelongsToProgram(displayGraph, activeProgram) ? displayGraph : null}
              inspecting={inspecting}
              onInspectingChange={setInspecting}
              onBuildAgents={() => handleBuildAgents(activeProgram)}
              onSelectNode={setSelection}
              onPaneClick={dismissOverlays}
              operatorCursor={operatorCursor}
              people={people}
              proposedNodeIds={proposedNodeIds}
              proposedEdgeIds={proposedEdgeIds}
              revealedNodeIds={revealedNodeIds}
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
            // The single channel, through the GTM canvas: the channel-flow lens IS the GraphCanvas
            // (single-channel behavior unchanged), with the portfolio-map lens one tab away. The
            // blank-channel-guide for an empty graph now lives inside the channel-flow lens.
            <GtmCanvas model={gtmCanvasModel} defaultLensId="channel-flow" activeLensId={gtmLensId} onLensChange={setGtmLensId} chromeless />
          ) : operatorSession && (operatorSession.status === "ready" || operatorSession.status === "running") ? (
            // The operator is already composing the loop from the goal just given — never re-ask for
            // the goal here. Show a focused "building" state; the live work streams in the dock.
            <div className="building-state">
              <LoaderCircle className="spin" />
              <strong>Claude is building your loop</strong>
              <span>Reading {activeProject?.name ?? "your product"} and composing the system to chase your goal — it'll stop at your gate. Watch it work in the panel on the right.</span>
            </div>
          ) : (booting || projectBusy) ? (
            // Still resolving the workspace (initial boot, or switching products) — a calm loading
            // state, never the cold-start goal launcher flashing before the real graph arrives.
            <div className="building-state">
              <LoaderCircle className="spin" />
              <strong>Loading your workspace…</strong>
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

          {/* The operator proposal's accept/reject lives INLINE on the canvas now — Claude's cursor
              builds the change and rests on the lead ghost, where the ✓/✕/note sits (the "watch then
              decide" beat). The old distant bottom bar was removed so the decision happens where the
              change is, not at a separate surface. The starter-system bar below stays — those ghosts
              carry no inline controls. */}

          {/* Staged starter system — an accepted opportunity composed a system, ghosted on the
              canvas. Accept persists that exact graph and lands on its real channel; discard drops it. */}
          {compositionActive && pendingComposition && (
            <div className="loop-proposal-bar" role="region" aria-label="Staged starter system">
              <div className="loop-proposal-text">
                <strong>
                  <Lightbulb />
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

          {/* Capabilities — connect external MCP servers; the wall sorts each tool
              read (runs free) / write (behind your gate). Replaces the connector picker. */}
          {overlay === "capabilities" && (
            <div className="canvas-overlay" role="dialog" aria-modal="true">
              <div className="canvas-overlay-bar">
                <span className="canvas-overlay-title">Capabilities</span>
                <button className="canvas-overlay-close" onClick={() => { setOverlay(null); refreshCapabilities(); }} type="button" title="Back to the canvas">×</button>
              </div>
              <div className="canvas-overlay-body">
                <ConnectCapability onChange={refreshCapabilities} />
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
                activeLensId={productLensId}
                chromeless
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
              agentEvaluations={agentEvaluations}
              agentPolicies={agentPolicies}
              graph={graph}
              capabilities={capabilities}
              onAddCapability={(type, ref, label) => {
                handleAddNode({ label, kind: type, category: "generate", ref, contract: { accepts: [], emits: [] } });
                setLibraryPaletteOpen(false);
              }}
              onAddTool={(serverId, tool) => {
                handleAddTool(serverId, tool);
                setLibraryPaletteOpen(false);
              }}
              onManageTools={() => { setLibraryPaletteOpen(false); setOverlay("capabilities"); }}
              onOpenArtifact={(type, ref) => {
                // Opening an agent shows the teammate profile (the person); skills still open their file.
                if (type === "agent") { setLibraryPaletteOpen(false); setAgentProfileRef(ref); }
                else setArtifactEdit({ type, ref });
              }}
              onNewArtifact={handleNewArtifact}
            />
          ) : null}

          {/* The three-lane workspace — the "open file" index for the GTM codebase. Full-bleed over
              the canvas; opening a workflow loads it, opening a skill/agent opens its editor. */}
          {view === "canvas" && workspaceOpen ? (
            <WorkspaceView
              channels={channels}
              library={library}
              activeChannelId={activeChannelId}
              onOpenWorkflow={(id) => { setWorkspaceOpen(false); setOverlay(null); setIdeationOpen(false); void loadChannel(id); }}
              onOpenArtifact={(type, ref) => {
                setWorkspaceOpen(false);
                if (type === "agent") setAgentProfileRef(ref);
                else setArtifactEdit({ type, ref });
              }}
              onNewArtifact={(type) => { setWorkspaceOpen(false); handleNewArtifact(type); }}
              onNewWorkflow={() => { setWorkspaceOpen(false); handleOpenView("opportunities"); }}
              onClose={() => setWorkspaceOpen(false)}
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
          recede={proposalActive}
          boundChannelName={boundChannel?.name ?? null}
          onSend={handleComposerSend}
          onCancel={handleOperatorCancel}
          onReviewGate={(nodeId) => setSelection(nodeId)}
          contextManifest={contextManifest}
          onOpenGrounding={() => handleOpenView("understand")}
          onOpenPicture={() => handleOpenView("product")}
          onIdeate={() => setComposerPosture("ideate")}
          posture={composerPosture}
          onExitPosture={() => setComposerPosture("build")}
          onPin={(kind, text) => { void pinClarity(kind, text); }}
          onAddNode={activeProgram || graph ? handleAddNode : undefined}
          onAddChain={activeProgram || graph ? handleAddChain : undefined}
          onOpenLibrary={() => setLibraryPaletteOpen(true)}
          graph={graph}
          runningNodeId={runningNodeId}
        /> : null}
      </div>

      {/* The node editor lives in the program workbench's right panel (ProgramCanvas). This modal
          remains only for the bare-channel graph path, which has no workbench around it. */}
      {selectedNode && graph && !activeProgram && (
        <div className="node-detail-modal-backdrop">
          {/* A real button for click-outside-to-close — semantic and keyboard-reachable, sitting
              behind the dialog (which paints above it). Replaces a div with a mousedown handler. */}
          <button
            type="button"
            className="node-detail-modal-scrim"
            aria-label="Close the step editor"
            onClick={() => setSelection(null)}
          />
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

      <AgentProfile
        open={!!agentProfileView}
        view={agentProfileView}
        team={agentTeam}
        onClose={() => setAgentProfileRef(null)}
        onEditSource={(ref) => { setAgentProfileRef(null); setArtifactEdit({ type: "agent", ref }); }}
        onAddToCanvas={graph ? (ref) => {
          handleAddNode({ label: ref, kind: "agent", category: "generate", ref, contract: { accepts: [], emits: [] } });
          setAgentProfileRef(null);
        } : undefined}
        onSelectTeammate={(ref) => setAgentProfileRef(ref)}
      />
    </main>
  );
}
