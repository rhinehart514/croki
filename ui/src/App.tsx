import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, LoaderCircle, Lock, Play, ShieldCheck, Users, X,
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
  getGraphTemplate,
  getPilotOutreachRecipe,
  getOperatorSession,
  getProject,
  getClarity,
  addClarity,
  removeClarity,
  listPeople,
  findReferences,
  getPerson,
  getChannelFeeds,
  getDirectedFeeds,
  deriveChannelFrom,
  listProjects,
  runGraph,
  activateProject,
  deleteProject,
  cancelOperatorSession,
  createProject,
  createOperatorSession,
  listOperatorSessions,
  resolveOperatorGate,
  resolveOperatorProposal,
  resumeOperatorSession,
  runGraphStream,
  saveGraph,
  setActiveWorkflow,
  getProductModel,
  deriveProductModel,
  reviseProductModel,
} from "@/api";
// Heavy overlay/panel components are split into their own chunks and loaded on demand the first time
// the founder opens them, so they stay out of the initial app chunk. Each is named-exported, so the
// dynamic import maps the named export onto the default React.lazy expects.
const ArtifactEditor = lazy(() => import("@/components/ArtifactEditor").then((m) => ({ default: m.ArtifactEditor })));
const WorkspaceView = lazy(() => import("@/components/WorkspaceView").then((m) => ({ default: m.WorkspaceView })));
const AgentProfile = lazy(() => import("@/components/AgentProfile").then((m) => ({ default: m.AgentProfile })));
const ConnectCapability = lazy(() => import("@/components/ConnectCapability").then((m) => ({ default: m.ConnectCapability })));
import type { AgentProfileView, TeammateView } from "@/components/AgentProfile";
import { ComposerDock } from "@/components/ComposerDock";
import { FloatingDock } from "@/components/FloatingDock";
import { type OperatorCursorState } from "@/components/GraphCanvas";
import { TeamOnboarding } from "@/components/TeamOnboarding";
import { convexEnabled, loadTeamIdentity, type TeamIdentity } from "@/lib/convex";
import { GoalLauncher } from "@/components/GoalLauncher";
import { OperatorDriveState } from "@/components/OperatorDriveState";
const TeamSpace = lazy(() => import("@/components/TeamSpace").then((m) => ({ default: m.TeamSpace })));
import { getMe, canApprove as canApproveApi } from "@/api";
import { getIdentity, FOUNDER_USER_ID, type ActingIdentity } from "@/lib/identity";
import type { Me } from "@/types";
import { NodeEditor } from "@/components/NodeEditor";
// GtmExplorer (the old left rail) is intentionally no longer rendered — channel navigation moved to
// the FloatingDock's channel switcher, the Library to LibraryPalette, the feeds into ComposerDock,
// Problems to the dock. The breadcrumb switchers, mode lenses, Problems, Approvals, Simulate and Run
// all live in FloatingDock now, so App no longer imports them directly.
const LibraryPalette = lazy(() => import("@/components/LibraryPalette").then((m) => ({ default: m.LibraryPalette })));
import { statusLabel } from "@/lib/status";
import { healthHex } from "@/lib/health";
import { itemKey } from "@/lib/itemKey";
const ProductUnderstanding = lazy(() => import("@/components/ProductUnderstanding").then((m) => ({ default: m.ProductUnderstanding })));
const ProductCanvas = lazy(() => import("@/components/ProductCanvas").then((m) => ({ default: m.ProductCanvas })));
import { GtmCanvas, type GtmCanvasModel } from "@/components/canvas/GtmCanvas";
import { CanvasCard } from "@/components/CanvasCard";
import { ClarityCard } from "@/components/ClarityCard";
import { PeopleLens } from "@/components/lenses/PeopleLens";
import { ExperimentMatrixLens } from "@/components/lenses/ExperimentMatrixLens";
import { ReferencesPanel, type ReferenceKind } from "@/components/ReferencesPanel";
import { ToolForge } from "@/components/ToolForge";
import { IssuesCard } from "@/components/IssuesCard";

// The views you can summon onto the GTM canvas as draggable cards — the agentic replacement for
// lens tabs. You pop one up, drag it, dismiss it; Claude can summon the same cards.
// Only canvas-work surfaces summon now. The admin surfaces (workspace, team, self-built tools) moved
// out of this junk drawer into a single Settings overlay reached from the dock's gear.
const SUMMON_GTM = [
  { id: "terminal", label: "Terminal", desc: "A live shell on the canvas — run commands by hand, pipe the output into the graph." },
  { id: "query", label: "Query", desc: "Interrogate your own data — everyone your channels touched, filtered and sorted live." },
  { id: "web", label: "Web", desc: "A research browser on the canvas — pull up a prospect's site while you work." },
  { id: "experiments", label: "Experiment matrix", desc: "ICP × claim × channel — the live hypotheses." },
];
import { ProjectPicker } from "@/components/ProjectPicker";
import { ProductEntry } from "@/components/ProductEntry";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { Button } from "@/components/ui/button";
import type {
  ChannelMeta, ConnectorMeta, ContextManifest, Decisions, EngineState, GateDecision, GraphOperation, GtmLibrary, GTMContractAudit, GTMGraph, GTMNode,
  GTMProject, GTMRunResult, NodeSelection, OperatorSession, ProjectSummary,
  ProductModel, ProductModelEdit,
  CapabilityServer, CapabilityTool, Person, CrossReferenceResult, ChannelFeed, DirectedFeed,
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
// A deep link routes by project only now (channels are plain flows; there is no separate program
// surface). /projects/:id activates that project; the project's active channel decides the focus.
function projectRouteFromLocation() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)(?:\/.*)?$/);
  if (!match) return null;
  return { projectId: decodeURIComponent(match[1]) };
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
  const [overlay, setOverlay] = useState<"understand" | "product" | "capabilities" | "settings" | null>(null);
  // Which Settings section is showing — the three admin surfaces (workspace index, team + release
  // roles, self-built tools) live behind one overlay now, switched by these tabs.
  const [settingsTab, setSettingsTab] = useState<"workspace" | "team" | "tools">("workspace");
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
  // The living product picture — the founder-editable INTERPRETATION aggregate, loaded alongside the
  // active project. Edits persist through the domain commands (revise/derive) then re-fetch.
  const [productModel, setProductModel] = useState<ProductModel | null>(null);
  const [productModelBusy, setProductModelBusy] = useState(false);
  // Bumped to summon the Claude co-pilot — a new channel is born by telling Claude the goal, not by
  // filling a form, so "New channel" opens and focuses the chat.
  const [composerFocus, setComposerFocus] = useState(0);
  // The Approvals panel — the founder gate's first-class home. Opens from the toolbar badge.
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  // The Issues panel — the system's problem list, now a first-class always-present indicator on the
  // dock (no longer a summoned card). Opens from its toolbar badge, mutually exclusive with Approvals.
  const [issuesOpen, setIssuesOpen] = useState(false);
  // "Propose the whole GTM system" — the portfolio composer overlay (compose-only, never sends).
  // Who I am + my teams, and the space I'm acting in (stamped on requests via lib/identity). The
  // founder personal space is the default; switching in TeamSpace re-scopes my release authority.
  const [me, setMe] = useState<Me | null>(null);
  const [acting, setActing] = useState<ActingIdentity>(getIdentity());
  // Whether the acting user may RELEASE a gate on the session's owning team (owner/approver yes,
  // member no). Drives the role-gated release control in the approval queue. Defaults true for the
  // solo founder (personal space) so nothing changes for a single-player install.
  const [canReleaseGate, setCanReleaseGate] = useState(true);
  // The summoned Library palette — opened from the canvas "+ Add step" control, replacing the old
  // left-rail Library now that the rail is dissolved.
  const [libraryPaletteOpen, setLibraryPaletteOpen] = useState(false);
  // The Problems popover — the engine's investigations, surfaced as a compact toolbar chip now that
  // the Problems rail section is gone with the explorer. The Issues indicator (its own dock button +
  // the issuesOpen panel) is the visible home for these now; this setter is kept because several
  // handlers still defensively close the legacy popover state.
  const [, setProblemsOpen] = useState(false);
  // The base canvas per mode (no lens taxonomy): GTM shows the engine on the overview and a channel's
  // flow when one is open, chosen by channel state alone (no GTM lens state); Product drives its one
  // lens from the command dock. Everything else is summoned as a card.
  const [productLensId] = useState("conceptual");
  // Summoned cards on the canvas — one per kind (summoning an open view is a no-op). Claude or the
  // composer + pops these up; they're draggable and dismissible.
  const [summoned, setSummoned] = useState<string[]>([]);
  const summonView = useCallback((kind: string) => {
    setSummoned((cur) => (cur.includes(kind) ? cur : [...cur, kind]));
  }, []);
  const dismissCard = useCallback((kind: string) => {
    setSummoned((cur) => cur.filter((k) => k !== kind));
  }, []);

  // Find references — the canvas moat made reachable. Selecting a person / experiment on a lens opens
  // a drill-down of every place that entity appears across channels (plus the Person detail). Read-only.
  const [reference, setReference] = useState<{
    kind: ReferenceKind; id: string; loading: boolean;
    result: CrossReferenceResult | null; person: Person | null;
  } | null>(null);
  const openReference = useCallback((kind: ReferenceKind, id: string) => {
    if (!activeProjectId || !id) return;
    setReference({ kind, id, loading: true, result: null, person: null });
    void (async () => {
      try {
        const result = await findReferences(activeProjectId, kind, id);
        let person: Person | null = result.person ?? null;
        if (kind === "person" && !person) {
          try { person = (await getPerson(activeProjectId, id)).person; } catch { /* detail optional */ }
        }
        setReference((cur) => (cur && cur.kind === kind && cur.id === id ? { ...cur, loading: false, result, person } : cur));
      } catch {
        setReference((cur) => (cur && cur.kind === kind && cur.id === id ? { ...cur, loading: false } : cur));
      }
    })();
  }, [activeProjectId]);

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
  // The "Connect Claude" banner is a soft nudge, not a wall: dismiss it and keep exploring the canvas,
  // library, and any existing product without a live subscription. The connection state itself stays
  // live (the model dot still reads "not connected"), so building still names the path when you reach it.
  const [connectBannerDismissed, setConnectBannerDismissed] = useState(false);

  // Graph state
  const [graph, setGraph] = useState<GTMGraph | null>(null);
  // One project, one canvas: every built workflow drawn as a labelled lane on the SAME canvas. This
  // is the project's home view; focusing a single workflow (clicking a lane, or the breadcrumb) loads
  // it into `graph` for editing/running through the existing single-graph machinery. Overview is the
  // active surface when this is set and nothing single is focused.
  // The portfolio-map overview is now a LENS of the GTM canvas, not a separately-assembled swimlane
  // graph. This flag says "show the project as the portfolio map" (no single channel focused).
  const [overviewActive, setOverviewActive] = useState(false);
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
  // The full-markdown editor for the real subagent/skill artifacts an open step runs.
  const [artifactEdit, setArtifactEdit] = useState<{ type: "agent" | "skill"; ref: string } | null>(null);
  // Which agent's profile is open — the centered "meet this teammate" sheet. Opening an agent shows
  // the person (role, mission, what it's learning, contract, guardrails), not the raw file. Editing
  // the source markdown is still one click away inside the sheet.
  const [agentProfileRef, setAgentProfileRef] = useState<string | null>(null);

  // The team rail in the profile: the stock on-disk GTM agents. There is no personalized-agent foundry
  // anymore — agents are the library definitions.
  const agentTeam = useMemo<TeammateView[]>(
    () => (library?.agents ?? []).map((a) => ({ ref: a.ref, job: a.description })),
    [library],
  );

  // Assemble the open agent's profile from the stock on-disk library agent (clicked in the library).
  const agentProfileView = useMemo<AgentProfileView | null>(() => {
    if (!agentProfileRef) return null;
    const stock = library?.agents.find((a) => a.ref === agentProfileRef);
    return {
      ref: agentProfileRef,
      job: stock?.description ?? "A library agent. Open the source to see what it does.",
    };
  }, [agentProfileRef, library]);
  const operatorGraphRevision = useRef<number | null>(null);
  const operatorRunId = useRef<string | null>(null);
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
    getMe().then(setMe).catch(() => {});
  }, []);

  // Resolve whether the acting user may release the gate on the session's owning team. The team is the
  // session's stored teamId; the personal team (solo founder) always returns canApprove=true server-side.
  // Re-runs when the session, its team, or the acting user changes. With no team to check (no session
  // yet, or acting as the founder), release stays open.
  const sessionTeamId = operatorSession?.teamId ?? null;
  useEffect(() => {
    let live = true;
    if (!sessionTeamId) { setCanReleaseGate(true); return; }
    canApproveApi(sessionTeamId, acting.userId || FOUNDER_USER_ID)
      .then(({ canApprove }) => { if (live) setCanReleaseGate(canApprove); })
      .catch(() => { if (live) setCanReleaseGate(true); });
    return () => { live = false; };
  }, [sessionTeamId, acting.userId]);

  // The acting space changed in TeamSpace — refresh "me" (membership/role may have moved) and let the
  // identity-stamped reads re-resolve on the next poll.
  const handleTeamChange = useCallback((identity: ActingIdentity) => {
    setActing(identity);
    getMe().then(setMe).catch(() => {});
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
      // Sync the URL to the focused project so a reload restores it instead of falling back to the
      // overview. Channels are plain flows now — the URL routes by project; the project's active
      // channel (persisted server-side via setActiveWorkflow above) decides the focus on reload.
      const projectId = activeProjectIdRef.current;
      if (projectId) {
        window.history.replaceState(null, "", `/projects/${encodeURIComponent(projectId)}`);
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
    setGraph(null);
    setSelection(null);
    setOverlay(null);
    setRunResult(null);
    setView("canvas");
    // Clear the URL back to the project root so a reload from the overview stays on the overview.
    // Skipped during boot, when the ref isn't set yet and the URL is already root.
    const projectId = activeProjectIdRef.current;
    if (projectId) {
      window.history.replaceState(null, "", `/projects/${encodeURIComponent(projectId)}`);
    }
    return true;
  }, []);

  const refreshProjectScope = useCallback(async () => {
    const [catalog, projectResponse] = await Promise.all([listProjects(), getProject()]);
    setProjects(catalog.projects);
    setActiveProjectState(projectResponse.project);
    setChannels(projectResponse.project.channels);
    return projectResponse.project;
  }, []);

  // Boot
  useEffect(() => {
    let live = true;
    Promise.all([getProject(), getConnectors(), listProjects()]).then(async ([initialProjectResponse, connectorResponse, initialCatalog]) => {
      if (!live) return;
      const route = projectRouteFromLocation();
      let projectResponse = initialProjectResponse;
      let catalog = initialCatalog;
      if (route?.projectId && route.projectId !== projectResponse.project.id) {
        await activateProject(route.projectId).catch(() => null);
        [projectResponse, catalog] = await Promise.all([getProject(), listProjects()]);
        if (!live) return;
      }
      // The route only carries a project now (handled above by activateProject); the project's own
      // active channel decides the focus.
      void route;
      const channelId = projectResponse.project.activeChannelId
        || projectResponse.project.channels[0]?.id;
      setConnectors(connectorResponse.connectors);
      getCapabilities().then((r) => { if (live) setCapabilities(r.servers); }).catch(() => null);
      setChannels(projectResponse.project.channels);
      setActiveProjectState(projectResponse.project);
      setProjects(catalog.projects);
      setBooted(true);
      if (!live) return;
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
      // Land on the one-canvas overview of every channel. Falls through to the single-channel focus
      // below when there's no overview to draw.
      const wentOverview = await loadProjectOverview(projectResponse.project.channels);
      if (!live) return;
      if (wentOverview) {
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
      const bootRuns = graphResponse.runs ?? [];
      setFlowRuns(bootRuns);
      // Hydrate the latest run on first paint too, so the channel you land on shows its real state
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
  // The cold-start front door is showing: no overview, no channel graph, no active operator
  // session, not mid-boot. When this is true the GoalLauncher owns the screen and the docked
  // co-pilot must stay hidden — otherwise both inputs stack (the cancelled-session overlap bug).
  const showGoalLauncher =
    !(overviewActive && !activeChannelId) &&
    !graph &&
    !["ready", "running", "failed", "blocked"].includes(operatorSessionStatus ?? "") &&
    !booting &&
    !projectBusy;
  useEffect(() => {
    if (!operatorSessionId || !operatorSessionStatus
      || ["completed", "blocked", "failed", "cancelled"].includes(operatorSessionStatus)) return;
    let live = true;
    const poll = async () => {
      try {
        const response = await getOperatorSession(operatorSessionId, activeProjectId ?? undefined);
        if (!live) return;
        syncOperator(response.session);
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
  }, [activeProjectId, operatorSessionId, operatorSessionStatus, syncOperator]);

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
    // The gate decision resumes the channel graph run — it reuses the exact staged items rather than
    // re-running discovery/draft behind the founder's back.
    await executeGraph(undefined, next, decisions, runResult?.runId);
  }, [approvals, decisions, executeGraph, operatorSession, runResult?.runId, syncOperator]);

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
    // The gate review resumes the channel graph run with the exact staged items reused.
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
      // Workbench surfaces (terminal/query/web) are used in place — don't yank open the node-detail
      // editor on drop. Pipeline steps still auto-select so the founder lands in their config.
      if (next && node.kind !== "terminal" && node.kind !== "query" && node.kind !== "web") setSelection(newId);
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

  // Set by "New channel": the next goal starts a fresh, unbound session that composes another pipeline.
  const freshPipelineIntent = useRef(false);

  const handleCommandSubmit = useCallback(async (goal: string) => {
    // The composer is LOCKED to the project on screen — the project id is threaded explicitly and
    // `reuse: true` returns the project's one live thread instead of spawning a parallel conversation.
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    // "New channel" intent → start a FRESH, unbound session so compose_and_run builds an ADDITIONAL
    // pipeline for the product instead of re-driving the one on screen. One-shot; reset after use.
    const fresh = freshPipelineIntent.current;
    freshPipelineIntent.current = false;
    // Bind the new session to the channel graph on screen so its tools target that graph.
    const response = await createOperatorSession(projectId, goal, fresh ? undefined : graph?.id, fresh);
    operatorGraphRevision.current = response.session.graphRevision;
    operatorRunId.current = null;
    setOperatorSession(response.session);
  }, [graph?.id]);

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
    // A pending "New channel" intent must compose fresh, never resume the prior conversation.
    const resumable = !freshPipelineIntent.current && s && ["waiting_for_input", "interrupted", "failed"].includes(s.status);
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

  // "New channel" — there's no form; a channel is born from the conversation. Surface the canvas,
  // leave any open overlay, and summon the co-pilot focused.
  const handleNewChannel = useCallback(() => {
    // Build ANOTHER pipeline for this product: detach the active pipeline + conversation so the next
    // goal composes a fresh channel that joins the others on the overview, and focus the composer.
    freshPipelineIntent.current = true;
    setOverlay(null);
    setView("canvas");
    setActiveChannelId(null);
    setGraph(null);
    setOperatorSession(null);
    setComposerFocus((n) => n + 1);
  }, []);

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
  // The Issues badge must count what the Issues panel actually shows: engine investigations PLUS
  // failing contract audits (waiting/blocked/blind). Mirrors IssuesCard's issueCount — otherwise the
  // badge reads "2" and opens to six. Keep this filter in sync with IssuesCard.
  const issueCount = useMemo(() => {
    const auditCount = (graph?.nodes ?? []).filter((n) => {
      const a = contractAudits[n.id];
      return !!a && ["waiting", "blocked", "blind"].includes(a.state);
    }).length;
    return problems.length + auditCount;
  }, [graph, contractAudits, problems]);
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
  // shared by the dock's "what Claude reads" strip, so all entry points drive the same overlay state.
  const handleOpenView = useCallback((v: "understand" | "product" | "canvas") => {
    if (v === "understand") setOverlay("understand");
    else if (v === "product") setOverlay("product");
    else setOverlay(null);
  }, []);


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
  // Every OTHER channel holding drafts at its gate — so the queue is a real cross-channel home for
  // the founder gate, not just the one run on screen. Each row opens that channel and rehydrates its
  // run, surfacing its staged drafts in this same panel. Derived from real pending-gate counts.
  const otherChannelGates = useMemo(
    () => channels.filter((ch) => (ch.pendingGates ?? 0) > 0 && ch.id !== activeChannelId),
    [channels, activeChannelId],
  );

  // The space label on the dock's Team chip — the personal space reads "Personal", a real team reads
  // its name. The personal team is the first in /api/me's list (acting.teamId null → personal).
  const personalTeamId = me?.teams[0]?.id ?? null;
  const actingTeamId = acting.teamId ?? personalTeamId;
  const teamLabel = !actingTeamId || actingTeamId === personalTeamId
    ? "Personal"
    : me?.teams.find((t) => t.id === actingTeamId)?.name ?? "Team";
  // The acting user's role in the space, for the queue header (e.g. "you're an Approver").
  const myRole = me?.teams.find((t) => t.id === actingTeamId)?.role ?? null;

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
  const displayGraph = proposalActive && pendingProposal
    ? pendingProposal.preview
    : graph;
  const proposedNodeIds = useMemo(() => {
    if (proposalActive && pendingProposal && graph) {
      const current = new Set(graph.nodes.map((node) => node.id));
      return new Set(pendingProposal.preview.nodes.filter((node) => !current.has(node.id)).map((node) => node.id));
    }
    return undefined;
  }, [proposalActive, pendingProposal, graph]);
  const proposedEdgeIds = useMemo(() => {
    if (proposalActive && pendingProposal && graph) {
      const current = new Set(graph.edges.map((edge) => edge.id));
      return new Set(pendingProposal.preview.edges.filter((edge) => !current.has(edge.id)).map((edge) => edge.id));
    }
    return undefined;
  }, [proposalActive, pendingProposal, graph]);

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
      {/* The left explorer rail is dissolved: the canvas IS the interface. Channel navigation moved to
          the ChannelSwitcher in the top bar, the Library to a summoned palette on the canvas, the
          "what Claude reads" feeds into the dock, and Problems to a toolbar chip. The canvas now fills
          the body. */}
      <div className={`loop-body canvas-full ${view !== "canvas" ? "studio-mode" : ""}`}>
        {/* Center — the canvas IS the workspace. Only the cold-start picker replaces it. */}
        <section className="loop-canvas-area">
          {/* The floating control dock — every control the old top toolbar held, in one calm bar
              floating top-center over the full-bleed canvas. */}
          {view === "canvas" ? (
            <FloatingDock
              projects={projects}
              activeProjectId={activeProject?.id ?? null}
              projectBusy={projectBusy}
              onSwitchProject={handleProjectOpen}
              onManageProjects={() => setView("projects")}
              onNewProduct={() => setView("start")}
              onDeleteProject={handleProjectDelete}
              channels={channels}
              activeChannelId={activeChannelId}
              onOpenChannel={(id) => { setOverlay(null); void loadChannel(id); }}
              onNewChannel={handleNewChannel}
              onIdeate={() => setComposerPosture("ideate")}
              onShowOverview={overviewActive ? () => { void loadProjectOverview(channels); } : undefined}
              overviewActive={overviewActive && !activeChannelId}
              motionName={engine?.motion?.name ?? null}
              showGtmToggle={!!activeProject}
              productMode={overlay === "product"}
              onModeToggle={(v) => { if (v === "product") { setOverlay("product"); } else { setOverlay(null); } }}
              summonItems={overlay === "product" ? undefined : SUMMON_GTM}
              onOpenSettings={() => { setOverlay("settings"); setProblemsOpen(false); setApprovalsOpen(false); setIssuesOpen(false); }}
              // Summon routes by kind: Terminal drops a live workbench surface IN canvas space (it pans
              // and zooms with the graph, and its output can feed the pipeline); the rest pop onto the
              // canvas as draggable cards. The admin surfaces moved to the Settings overlay.
              onSummon={(id) => {
                if (id === "terminal") { handleAddNode({ label: "Terminal", kind: "terminal", category: "source", config: {} }); return; }
                if (id === "query") { handleAddNode({ label: "Query", kind: "query", category: "source", config: {} }); return; }
                if (id === "web") { handleAddNode({ label: "Web", kind: "web", category: "source", config: {} }); return; }
                summonView(id);
              }}
              pendingApprovals={pendingApprovals}
              approvalsOpen={approvalsOpen}
              onToggleApprovals={() => { setApprovalsOpen((v) => !v); setProblemsOpen(false); setIssuesOpen(false); }}
              problems={issueCount}
              issuesOpen={issuesOpen}
              onToggleIssues={() => { setIssuesOpen((v) => !v); setApprovalsOpen(false); setProblemsOpen(false); }}
              onCloseMenus={() => { setProblemsOpen(false); setApprovalsOpen(false); setIssuesOpen(false); }}
              graph={graph}
              running={graphRunning}
              runningNodeId={runningNodeId}
              onRun={() => void streamRun()}
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
                  <PeopleLens people={gtmCanvasModel.people} channels={gtmCanvasModel.channels} selected={reference?.kind === "person" ? reference.id : null} onSelect={(id) => openReference("person", id)} />
                ) : null}
                {kind === "experiments" ? (
                  <ExperimentMatrixLens experiments={gtmCanvasModel.experiments} claims={gtmCanvasModel.claims} icp={gtmCanvasModel.icp} channels={gtmCanvasModel.channels} selected={reference?.kind === "experiment" ? reference.id : null} onSelect={(id) => openReference("experiment", id)} />
                ) : null}
                {kind === "tools" && activeProjectId ? (
                  <ToolForge projectId={activeProjectId} />
                ) : null}
              </CanvasCard>
            );
          })}

          {/* Find references — the cross-channel drill-down for a selected person / experiment, opened
              from a lens. A draggable opaque CanvasCard like the summoned views; read-only. */}
          {view === "canvas" && overlay !== "product" && reference && (
            <CanvasCard
              key="references"
              title="Find references"
              subtitle={reference.kind}
              onDismiss={() => setReference(null)}
              initial={{ x: 220, y: 120 }}
              width={420}
              height={560}
            >
              <ReferencesPanel
                kind={reference.kind}
                result={reference.result}
                person={reference.person}
                loading={reference.loading}
                channels={gtmCanvasModel.channels}
                onOpenChannel={(channelId) => void loadChannel(channelId)}
              />
            </CanvasCard>
          )}

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
          ) : overviewActive && !activeChannelId ? (
            // One project, one canvas: every built channel as a tile on the engine/portfolio overview.
            // Clicking a tile opens that channel's flow (the channel-flow lens).
            <GtmCanvas model={gtmCanvasModel} activeLensId="engine" chromeless />
          ) : graph ? (
            // The single channel, through the GTM canvas: the channel-flow lens IS the GraphCanvas
            // (single-channel behavior unchanged), with the portfolio-map lens one tab away. The
            // blank-channel-guide for an empty graph now lives inside the channel-flow lens.
            <GtmCanvas model={gtmCanvasModel} activeLensId="channel-flow" chromeless />
          ) : operatorSession && ["ready", "running", "failed", "blocked"].includes(operatorSession.status) ? (
            // The operator is driving the loop from the goal just given (or stopped trying). Never
            // re-ask for the goal here, and never show an opaque spinner: the operator's live
            // reasoning and the brief it's composing stream right here, and a failure/block surfaces
            // its reason with a way to pick the loop back up.
            <OperatorDriveState
              session={operatorSession}
              productName={activeProject?.name ?? "your product"}
              onResume={() => void handleComposerSend("Continue.")}
              onStartOver={() => void handleOperatorCancel()}
            />
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
              focusSignal={composerFocus}
              onSubmitGoal={(g) => void handleComposerSend(g)}
              // "Ideate channels for me" is a do-it action, not a mode flip on a hidden dock: kick
              // off an ideate-framed session right now. The screen leaves the launcher for the live
              // operator drive state, so the click has a visible result. The kickoff is self-framing
              // because composerPosture is still "build" in this tick's closure.
              onIdeate={() => {
                setComposerPosture("ideate");
                void handleComposerSend(
                  "Ideate go-to-market channels for this product. Read what it does, then think with me: propose a few distinct channels worth running and challenge anything weak. Don't compose or build a channel yet — let's get clear first.",
                );
              }}
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

          {/* No live Claude — a soft, dismissible nudge, not a wall. Composing/ideating/the operator need
              a signed-in subscription, so we name the path; but you can dismiss this and keep looking
              around the canvas, library, and any existing product meanwhile. */}
          {connection && !connection.connected && !connectBannerDismissed && (
            <div className="loop-connect-banner" role="status">
              <AlertTriangle />
              <div className="loop-connect-text">
                <strong>Connect Claude to build</strong>
                <span>Composing, ideating, and the operator run on your Claude subscription. Run <code>claude</code> in your terminal to sign in, or set <code>CLAUDE_CODE_OAUTH_TOKEN</code>. You can keep exploring the canvas, library, and any existing product meanwhile.</span>
              </div>
              <button
                className="loop-connect-dismiss"
                onClick={() => setConnectBannerDismissed(true)}
                type="button"
                title="Dismiss — keep exploring without Claude"
                aria-label="Dismiss"
              >
                <X />
              </button>
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
              change is, not at a separate surface. */}

          {/* Product grounding floats OVER the canvas center — the IDE frame (explorer +
              assistant) stays visible, so it's part of the canvas, not a separate page. Its
              "Ideate channels" hands off to the composer's ideate posture. */}
          {overlay === "understand" && activeProject && (
            <div className="canvas-overlay" role="dialog" aria-modal="true">
              <div className="canvas-overlay-bar">
                <span className="canvas-overlay-title">Product grounding</span>
                <button className="canvas-overlay-close" onClick={() => setOverlay(null)} type="button" title="Back to the canvas">×</button>
              </div>
              <div className="canvas-overlay-body">
                <Suspense fallback={null}>
                  <ProductUnderstanding
                    busy={projectBusy}
                    onGenerate={() => { setOverlay(null); setComposerPosture("ideate"); }}
                    project={activeProject}
                  />
                </Suspense>
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
                <Suspense fallback={null}>
                  <ConnectCapability onChange={refreshCapabilities} />
                </Suspense>
              </div>
            </div>
          )}

          {/* Product mode — the living picture as a full React Flow canvas, the same visual language
              as the GTM graph. It fills the workspace (the explorer + assistant frame stay), so
              flipping GTM↔Product swaps the canvas, not the whole page. The editable INTERPRETATION
              layer on top of the cited truth. */}
          {overlay === "product" && activeProject && (
            <div className="canvas-overlay canvas-overlay-flush" role="region" aria-label="Product mode">
              <Suspense fallback={null}>
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
              </Suspense>
            </div>
          )}

          {/* Settings — the admin surfaces evicted from the Summon junk drawer: the workspace index,
              the team and its release roles, and the self-built tools. Three tabs in one opaque
              overlay; it reuses the standalone admin panels, so the bar owns the title + close and the
              panels render flush. Nothing here sends. */}
          {overlay === "settings" && (
            <div className="canvas-overlay settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
              <div className="canvas-overlay-bar">
                <div className="settings-overlay-tabs" role="tablist" aria-label="Settings sections">
                  {([
                    { id: "workspace", label: "Workspace" },
                    { id: "team", label: "Team" },
                    { id: "tools", label: "Self-built tools" },
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={settingsTab === tab.id}
                      className={`settings-overlay-tab ${settingsTab === tab.id ? "active" : ""}`}
                      onClick={() => setSettingsTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button className="canvas-overlay-close" onClick={() => setOverlay(null)} type="button" title="Back to the canvas">×</button>
              </div>
              <div className="canvas-overlay-body">
                <div className="settings-overlay-panel">
                  {settingsTab === "workspace" ? (
                    <Suspense fallback={null}>
                      <WorkspaceView
                        channels={channels}
                        library={library}
                        activeChannelId={activeChannelId}
                        onOpenWorkflow={(id) => { setOverlay(null); void loadChannel(id); }}
                        onOpenArtifact={(type, ref) => {
                          setOverlay(null);
                          if (type === "agent") setAgentProfileRef(ref);
                          else setArtifactEdit({ type, ref });
                        }}
                        onNewArtifact={(type) => { setOverlay(null); handleNewArtifact(type); }}
                        onNewWorkflow={() => { setOverlay(null); setComposerPosture("ideate"); }}
                        onClose={() => setOverlay(null)}
                      />
                    </Suspense>
                  ) : null}
                  {settingsTab === "team" ? (
                    <Suspense fallback={null}>
                      <TeamSpace onClose={() => setOverlay(null)} onTeamChange={handleTeamChange} />
                    </Suspense>
                  ) : null}
                  {settingsTab === "tools" ? (
                    activeProjectId ? (
                      <ToolForge projectId={activeProjectId} />
                    ) : (
                      <p className="settings-overlay-empty">Open a product to see its self-built tools.</p>
                    )
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* The summoned Library — the canvas "+ Add step" control opens this glass palette. It
              replaces the dissolved left-rail Library: the on-disk agents and skills, each draggable
              onto the canvas or added with one click. Anchored top-left near the Add control;
              self-closes on Escape / outside-click. */}
          {view === "canvas" && libraryPaletteOpen ? (
            <Suspense fallback={null}>
            <LibraryPalette
              open={libraryPaletteOpen}
              onClose={() => setLibraryPaletteOpen(false)}
              library={library}
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
            </Suspense>
          ) : null}

        </section>

        {/* ── Issues panel — the system's problem list, opened from the always-present dock indicator.
            What used to be a card you had to summon yourself: every engine investigation and pipeline
            contract gap, each row handing the problem to Claude to fix or jumping to the node that owns
            it. Opaque, twin of the Approvals panel; the two are mutually exclusive. */}
        {issuesOpen && view === "canvas" ? (
          <aside className="loop-issues-panel" role="dialog" aria-label="Issues" aria-modal="false">
            <header className="loop-issues-head">
              <div className="loop-issues-head-title">
                <AlertTriangle />
                <strong>Issues</strong>
                {issueCount > 0 ? <span className="loop-issues-count">{issueCount}</span> : null}
              </div>
              <button className="loop-issues-close" onClick={() => setIssuesOpen(false)} type="button" aria-label="Close issues">
                <X />
              </button>
            </header>
            <div className="loop-issues-body">
              <IssuesCard
                problems={problems}
                audits={contractAudits}
                graph={graph}
                nodeForSubsystem={nodeForSubsystem}
                onFix={(instruction) => { setIssuesOpen(false); void handleComposerSend(instruction); }}
                onJump={(nodeId) => { setIssuesOpen(false); jumpToNode(nodeId); }}
              />
            </div>
          </aside>
        ) : null}

        {/* ── Approvals panel — the founder gate's first-class home ─────────
            Listed: every gated draft the run on screen is holding, with its evidence and a way to
            act. Quiet honest state when nothing is pending. Modeled on a source-control review list:
            the badge counts, this panel resolves. */}
        {approvalsOpen && view === "canvas" ? (
          <aside className="loop-approvals-panel" role="dialog" aria-label="Approvals" aria-modal="false">
            <header className="loop-approvals-head">
              <div className="loop-approvals-head-title">
                <ShieldCheck />
                <strong>Founder gate</strong>
                {pendingApprovals > 0 ? <span className="loop-approvals-count">{pendingApprovals}</span> : null}
              </div>
              <button className="loop-approvals-close" onClick={() => setApprovalsOpen(false)} type="button" aria-label="Close approvals">
                <X />
              </button>
            </header>
            {/* Who's acting, and whether they can release — the team layer made plain. A member sees
                why the release controls are off; an owner/approver sees the green "you can release". */}
            <div className={`loop-approvals-authority ${canReleaseGate ? "can" : "cannot"}`}>
              <Users />
              <span className="loop-approvals-authority-space">{teamLabel}</span>
              <span className="loop-approvals-authority-dot" aria-hidden>·</span>
              <span className="loop-approvals-authority-role">
                {myRole ? `you're ${myRole === "approver" ? "an" : "a"} ${myRole}` : "you"}
              </span>
              <span className={`loop-approvals-authority-flag ${canReleaseGate ? "can" : "cannot"}`}>
                {canReleaseGate ? "can release" : "view only"}
              </span>
            </div>
            <div className="loop-approvals-body">
              {approvalItems.length === 0 && otherChannelGates.length === 0 ? (
                <div className="loop-approvals-empty">
                  <ShieldCheck />
                  <strong>Nothing waiting</strong>
                  <p>
                    Nothing has reached the gate. When a run stages a draft to send, publish, or charge,
                    it stops here for your approval first — nothing leaves the building without it.
                  </p>
                </div>
              ) : approvalItems.map((gate) => (
                <section className="loop-approvals-gate" key={gate.nodeId}>
                  <div className="loop-approvals-gate-head">
                    <strong>{gate.label}</strong>
                    <span>{gate.items.length} draft{gate.items.length === 1 ? "" : "s"} staged</span>
                  </div>
                  {/* Pattern / bulk release: approve every still-undecided draft in this gate at once,
                      for a high-volume run. Role-gated like every release; hidden once one or zero
                      drafts remain undecided. */}
                  {gate.items.length > 1 && canReleaseGate ? (() => {
                    const undecided = gate.items.filter((item, i) => !decisions[gate.nodeId]?.[itemKey(item, i)]?.decision);
                    if (undecided.length < 2) return null;
                    return (
                      <button
                        className="loop-approvals-bulk"
                        type="button"
                        onClick={() => {
                          const batch: Record<string, GateDecision> = {};
                          gate.items.forEach((item, i) => {
                            const k = itemKey(item, i);
                            if (!decisions[gate.nodeId]?.[k]?.decision) batch[k] = { decision: "approve" };
                          });
                          void submitGateReview(gate.nodeId, batch);
                        }}
                      >
                        <Check size={13} /> Approve all {undecided.length} matching
                      </button>
                    );
                  })() : null}
                  {gate.items.length === 0 ? (
                    <p className="loop-approvals-gate-note">Staged content loads when this gate's run is open.</p>
                  ) : gate.items.map((item, i) => {
                    // The drafter emits draft_note / suggested_subject_line / founder_name /
                    // grounding_citation; older connectors emit draft / subject / name. Read both so a
                    // real staged note shows its full subject, body, and the evidence for WHY this person.
                    const key = itemKey(item, i);
                    const subject = pickStr(item.suggested_subject_line, item.subject, item.founder_name, item.name, item.handle, item.type) ?? "Staged action";
                    const body = pickStr(item.draft_note, item.draft, item.message, item.summary, item.text, item.content, item.verdictWhy, item.highestLeverageFix, item.recommendation);
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
                      ) : !canReleaseGate ? (
                        // Role wall: a member can read the queue but cannot release. The control is
                        // disabled with a plain reason, not hidden — so the wall is legible, not silent.
                        <div className="loop-approvals-locked">
                          <Lock size={12} />
                          <span>Only an owner or approver on {teamLabel} can release this. Ask a teammate to approve.</span>
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

              {/* Cross-channel queue: every other channel holding drafts at its gate. The founder
                  gate's home spans the whole portfolio, not just the run on screen — open one and its
                  staged drafts rehydrate into this panel for review. */}
              {otherChannelGates.length > 0 ? (
                <section className="loop-approvals-elsewhere">
                  <div className="loop-approvals-elsewhere-head">
                    Waiting in {otherChannelGates.length === 1 ? "another channel" : "other channels"}
                  </div>
                  {otherChannelGates.map((ch) => (
                    <button
                      key={ch.id}
                      className="loop-approvals-elsewhere-row"
                      type="button"
                      onClick={() => void loadChannel(ch.id)}
                      title={`Open ${ch.name} to review its staged drafts`}
                    >
                      <span className="loop-approvals-elsewhere-dot" aria-hidden />
                      <span className="loop-approvals-elsewhere-name">{ch.name}</span>
                      <span className="loop-approvals-elsewhere-count">
                        {ch.pendingGates} at gate
                      </span>
                    </button>
                  ))}
                </section>
              ) : null}
            </div>
          </aside>
        ) : null}

        {/* Persistent Claude co-pilot — channels + conversation + composer. Docked whenever a
            channel or run is in play, but hidden behind the cold-start GoalLauncher so the two
            input surfaces never stack. */}
        {view === "canvas" && !showGoalLauncher ? <ComposerDock
          session={operatorSession}
          running={graphRunning}
          floating={false}
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
          onAddNode={graph ? handleAddNode : undefined}
          onAddChain={graph ? handleAddChain : undefined}
          onOpenLibrary={() => setLibraryPaletteOpen(true)}
          graph={graph}
          runningNodeId={runningNodeId}
        /> : null}
      </div>

      {/* The node editor modal — the channel graph's step editor, opened by selecting a node. */}
      {selectedNode && graph && (
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
        <Suspense fallback={null}>
          <ArtifactEditor
            type={artifactEdit.type}
            refName={artifactEdit.ref}
            open={!!artifactEdit}
            onClose={() => setArtifactEdit(null)}
          />
        </Suspense>
      )}

      {agentProfileView && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </main>
  );
}
