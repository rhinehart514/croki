import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, Inbox, LoaderCircle, X,
} from "lucide-react";
import {
  applyGraphOperations as applyGraphOperationsApi,
  auditGraph,
  getConnectors,
  getEngineState,
  getConnection,
  type ConnectionStatus,
  getLibrary,
  getAgentBench,
  type AgentBenchRow,
  getRunSummary,
  type RunSummary,
  recordOutcome,
  getGraphTemplate,
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
  runWorkflowNode,
  activateProject,
  deleteProject,
  cancelOperatorSession,
  createProject,
  createOperatorSession,
  composerTurn,
  getComposerBriefing,
  listOperatorSessions,
  resolveOperatorGate,
  refineOperatorGate,
  resolveOperatorCandidates,
  resolveOperatorProposal,
  resumeOperatorSession,
  steerOperatorSession,
  runGraphStream,
  saveGraph,
  setActiveWorkflow,
  getProductModel,
  deriveProductModel,
  composeMicroproduct,
  promoteChannel,
  revokeChannel,
  getPendingInbox,
  getOperatingView,
  getMotionEfficiency,
  getReallocation,
  saveReallocationTunables,
  getReallocationTunables,
  getCredentials,
} from "@/api";
import type { OperatorHints, ComposerBriefing, ComposerTurnResult } from "@/api";
// Heavy overlay/panel components are split into their own chunks and loaded on demand the first time
// the founder opens them, so they stay out of the initial app chunk. Each is named-exported, so the
// dynamic import maps the named export onto the default React.lazy expects.
const ArtifactEditor = lazy(() => import("@/components/ArtifactEditor").then((m) => ({ default: m.ArtifactEditor })));
const WorkspaceView = lazy(() => import("@/components/WorkspaceView").then((m) => ({ default: m.WorkspaceView })));
const AgentProfile = lazy(() => import("@/components/AgentProfile").then((m) => ({ default: m.AgentProfile })));
const OutcomeCapture = lazy(() => import("@/components/OutcomeCapture"));
const ConnectCapability = lazy(() => import("@/components/ConnectCapability").then((m) => ({ default: m.ConnectCapability })));
const ConnectSender = lazy(() => import("@/components/ConnectSender").then((m) => ({ default: m.ConnectSender })));
const DesignTaste = lazy(() => import("@/components/DesignTaste").then((m) => ({ default: m.DesignTaste })));
const SignalWeights = lazy(() => import("@/components/SignalWeights").then((m) => ({ default: m.SignalWeights })));
// The aggressiveness knobs (Area 3, decided-question 4) — the observation floor, the ranking-tilt clamp,
// and the daily paid-probe cap — sit beside SignalWeights as visible, founder-tunable values.
const AggressivenessTunables = lazy(() => import("@/components/AggressivenessTunables").then((m) => ({ default: m.AggressivenessTunables })));
// The per-motion efficiency table (Area 7) — the Measure surface's honest "which motion is working" read,
// the same rows the Operator lens's lanes consume. Rendered inside the outcome/measure surface.
const MotionEfficiencyTable = lazy(() => import("@/components/MotionEfficiencyTable").then((m) => ({ default: m.MotionEfficiencyTable })));
// The Overdrive reallocation receipt (Area 3) — the correctable batch card: what the machine leaned
// toward and the motions it flagged as drawing nothing. Rendered atop the "waiting on you" batch.
const ReallocationBatchCard = lazy(() => import("@/components/ReallocationBatchCard").then((m) => ({ default: m.ReallocationBatchCard })));
import type { AgentProfileView, TeammateView } from "@/components/AgentProfile";
import { ComposerDock } from "@/components/ComposerDock";
import { FloatingDock } from "@/components/FloatingDock";
import { LeftRail, type StepDragPayload } from "@/components/LeftRail";
import { CAP_STAGE_CATEGORY } from "@/lib/capabilities";
import { type OperatorCursorState } from "@/components/GraphCanvas";
import { setGhostResolve } from "@/lib/ghostResolve";
import { TeamOnboarding } from "@/components/TeamOnboarding";
import { convexEnabled, loadTeamIdentity, type TeamIdentity } from "@/lib/convex";
import { GoalLauncher } from "@/components/GoalLauncher";
import { OperatorDriveState } from "@/components/OperatorDriveState";
const TeamSpace = lazy(() => import("@/components/TeamSpace").then((m) => ({ default: m.TeamSpace })));
import { canApprove as canApproveApi } from "@/api";
import { getIdentity, FOUNDER_USER_ID, type ActingIdentity } from "@/lib/identity";
// GtmExplorer (the old left rail) is intentionally no longer rendered — channel navigation moved to
// the FloatingDock's channel switcher, the feeds into ComposerDock, Problems to the dock. The
// breadcrumb switchers, mode lenses, Problems, Approvals, Simulate and Run all live in FloatingDock
// now. The hand-pick pickers were removed — Claude composes what a pipeline needs.
import { statusLabel } from "@/lib/status";
import { humanizeOperatorSession } from "@/lib/operatorLanguage";
import { itemKey } from "@/lib/itemKey";
import { gateItemView, channelOfferLine, type GatePromote, type GateReplayDecision } from "@/lib/gateItem";
import { agentPersona } from "@/lib/agentPersona";
import { STEP_DRAG_MIME } from "@/lib/objectPalette";
const ProductUnderstanding = lazy(() => import("@/components/ProductUnderstanding").then((m) => ({ default: m.ProductUnderstanding })));
import { GtmCanvas, type GtmCanvasModel } from "@/components/canvas/GtmCanvas";
import { sessionCandidates, type Candidate } from "@/lib/sessionCandidates";
import type { WovenFocus } from "@/lib/wovenOverlay";
import { CanvasHistoryControl } from "@/components/CanvasHistoryControl";
import { useCanvasHistory, describeOperations, describeGraphDiff } from "@/lib/canvasHistory";
import { ProductEntryColumn } from "@/components/ProductEntryColumn";
import { CanvasCard } from "@/components/CanvasCard";
import { ClarityCard } from "@/components/ClarityCard";
import { ExperimentMatrixLens } from "@/components/lenses/ExperimentMatrixLens";
import type { CanvasSubject } from "@/lib/cardDetail";
import { ReferencesPanel, type ReferenceKind } from "@/components/ReferencesPanel";
import { IssuesCard } from "@/components/IssuesCard";
import { InputsInbox } from "@/components/InputsInbox";
import { DecisionInbox } from "@/components/DecisionInbox";
import { MicroproductFace, type Microproduct } from "@/components/MicroproductFace";
import { MarketLayers } from "@/components/MarketLayers";

// The views you can summon onto the GTM canvas as draggable cards — the agentic replacement for
// lens tabs. You pop one up, drag it, dismiss it; Claude can summon the same cards.
// Only canvas-work surfaces summon now. The admin surfaces (workspace, team, self-built tools) moved
// out of this junk drawer into a single Settings overlay reached from the dock's gear.
const SUMMON_GTM = [
  { id: "terminal", label: "Terminal", desc: "A live shell on the canvas. Run commands by hand and pipe the output into the graph." },
  { id: "query", label: "Query", desc: "Interrogate your own data: everyone your pipelines touched, filtered and sorted live." },
  { id: "web", label: "Web", desc: "A research browser on the canvas. Pull up a prospect's site while you work." },
  { id: "experiments", label: "Experiment matrix", desc: "ICP × claim × pipeline: your live hypotheses." },
  { id: "inbox", label: "Inbox", desc: "Every world-signal that came in (a commit, a signup, a reply), captured and waiting for you to route or set aside." },
  { id: "microproduct", label: "Microproduct", desc: "Cut a working artifact from your product for a goal. It stages behind your gate; nothing deploys until you approve." },
  { id: "market", label: "Market picture", desc: "Build your buyer picture one layer at a time (ICP, pain, trigger, offer), picking from real alternatives at each." },
];

// Pull the built microproduct preview out of the staged run the compose door returns. The producer's
// artifact (spec + files) and a built preview (entry file + file list) ride the staged gate item — the
// run's summarized nodes carry them through verbatim. We scan every node's items for the one that is a
// microproduct (it has artifactFiles), then use the entry page's full HTML as the inline preview so
// MicroproductFace can render the real page in a sandboxed iframe with no served URL. Defensive by
// construction: `staged` is typed `unknown`, so every hop is shape-checked and a miss degrades to null
// (the face simply shows "No preview yet"), never a throw.
// Lay out a picked candidate's shape for the assembling preview. Candidate nodes often arrive without
// real positions (0,0); step them left-to-right by their longest incoming chain so a fork still moves
// rightward and the preview reads as a pipeline, not a pile. The real built graph carries its own layout
// and replaces this within seconds, so this only has to look like a flow while it assembles.
function layoutAssemblingShape(nodes: GTMNode[], edges: GTMEdge[]): GTMNode[] {
  const hasReal = nodes.some((n) => n.position && (n.position.x !== 0 || n.position.y !== 0));
  if (hasReal) return nodes;
  const incoming = new Map<string, string[]>();
  for (const n of nodes) incoming.set(n.id, []);
  for (const e of edges) if (incoming.has(e.target)) incoming.get(e.target)!.push(e.source);
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ins = incoming.get(id) ?? [];
    const d = ins.length ? Math.max(...ins.map((s) => depthOf(s, seen) + 1)) : 0;
    depth.set(id, d);
    return d;
  };
  const perDepth = new Map<number, number>();
  return nodes.map((n) => {
    const d = depthOf(n.id, new Set());
    const row = perDepth.get(d) ?? 0;
    perDepth.set(d, row + 1);
    return { ...n, position: { x: 80 + d * 280, y: 120 + row * 150 } };
  });
}

type StagedFile = { path?: unknown; contents?: unknown };
type StagedMicroproductItem = {
  artifactSpec?: { name?: unknown; summary?: unknown; entry?: unknown } | null;
  artifactFiles?: unknown;
  preview?: { entry?: unknown } | null;
};
function extractMicroproductPreview(
  staged: unknown,
): { name: string | null; summary: string | null; previewHtml: string | null } | null {
  if (!staged || typeof staged !== "object") return null;
  const nodes = (staged as { nodes?: Record<string, { items?: unknown[] }> }).nodes;
  if (!nodes || typeof nodes !== "object") return null;
  for (const node of Object.values(nodes)) {
    for (const raw of node?.items ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as StagedMicroproductItem;
      const files = (Array.isArray(item.artifactFiles) ? item.artifactFiles : []) as StagedFile[];
      if (!files.length) continue; // not the microproduct item
      const entryName =
        (typeof item.preview?.entry === "string" && item.preview.entry) ||
        (typeof item.artifactSpec?.entry === "string" && item.artifactSpec.entry) ||
        "index.html";
      const isHtml = (p: unknown) => typeof p === "string" && /\.html?$/i.test(p);
      const entryFile =
        files.find((f) => f.path === entryName) ??
        files.find((f) => isHtml(f.path)) ??
        files[0];
      const previewHtml =
        entryFile && isHtml(entryFile.path) && typeof entryFile.contents === "string"
          ? entryFile.contents
          : null;
      return {
        name: typeof item.artifactSpec?.name === "string" ? item.artifactSpec.name : null,
        summary: typeof item.artifactSpec?.summary === "string" ? item.artifactSpec.summary : null,
        previewHtml,
      };
    }
  }
  return null;
}
import { ProjectPicker } from "@/components/ProjectPicker";
import { ProductEntry } from "@/components/ProductEntry";
import { ConnectClaude } from "@/components/ConnectClaude";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import type {
  ChannelMeta, ConnectorMeta, Decisions, EngineState, GateDecision, GateDeltaDecision, GraphOperation, GtmLibrary, GTMContractAudit, GTMEdge, GTMGraph, GTMItem, GTMNode, GTMNodeCategory,
  GTMProject, GTMRunResult, NodeSelection, OperatorSession, OperatorSessionSummary, ProjectSummary,
  ProductModel,
  Person, CrossReferenceResult, ChannelFeed, DirectedFeed,
  ClarityObject, ClarityKind, ComposerPosture,
  PendingDecision, PendingInbox, OperatingView,
} from "@/types";

// Health → band color, identical to the canvas node badge (GraphCanvas healthHex), so a
// node's health reads the same number and color on the canvas, in the editor, and in the rail.
// First non-empty string among loosely-typed item fields. Staged gate items carry free-form keys
// (draft_note, suggested_subject_line, grounding_citation…) typed as unknown, so the review surface
// reads them defensively rather than asserting a fixed shape.
// gateItemView is shared from "@/lib/gateItem" so the founder gate and the on-canvas gate review
// render from one normalized view and can never disagree about a draft.

// The context pill — the north star, made visible in the toolbar. It shows what the model
// actually receives, layer by layer, derived from the real assembled manifest (never a config
// percentage). Taste is shown even at 0 chars on purpose: an empty moat is a signal to the
// founder that nothing has been gated yet. Falls back to the old config-completeness % only
// before the manifest loads.
// A deep link routes by project only now (channels are plain flows; there is no separate channel-graph
// surface). /projects/:id activates that project; the project's active channel decides the focus.
function projectRouteFromLocation() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)(?:\/.*)?$/);
  if (!match) return null;
  return { projectId: decodeURIComponent(match[1]) };
}

// Where a rail drag was released, in canvas (flow) coordinates. The drop fires on the canvas-area
// wrapper, which sits ABOVE React Flow, so its projection hook isn't in scope — instead read the flow's
// own viewport transform straight off the DOM (`matrix(scale,0,0,scale,tx,ty)` on .react-flow__viewport)
// and invert it: screenPoint → (screenPoint − paneOrigin − translate) / scale. The node is nudged up-left
// by roughly half a collapsed card so it lands centered under the cursor, not hanging off its corner.
// Returns undefined when no flow is mounted (empty canvas) — the caller then appends at a default spot.
function flowPositionFromDrop(event: React.DragEvent): { x: number; y: number } | undefined {
  const container = (event.currentTarget as HTMLElement).querySelector(".react-flow") as HTMLElement | null;
  const viewport = container?.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!container || !viewport) return undefined;
  const rect = container.getBoundingClientRect();
  const transform = window.getComputedStyle(viewport).transform;
  const m = transform && transform !== "none" ? new DOMMatrixReadOnly(transform) : new DOMMatrixReadOnly();
  const scale = m.a || 1;
  const x = (event.clientX - rect.left - m.e) / scale;
  const y = (event.clientY - rect.top - m.f) / scale;
  return { x: x - 116, y: y - 34 };
}

export default function App() {
  // The canvas IS the workspace. "projects" is the only other base view — the cold-start picker
  // before any product exists. Understand and Ideas are no longer destinations that swap
  // the canvas out; they float OVER it as dismissable overlays (set via `overlay`), so the IDE is
  // never replaced. Channels live in the explorer, not a page.
  const [view, setView] = useState<"projects" | "canvas" | "start">("canvas");
  // The canvas is the runnable pipeline — the Steps surface (GraphCanvas). The former Story ("move")
  // altitude and its Move/Engineer toggle were removed; Steps is now the whole canvas.
  const [booted, setBooted] = useState(false);
  // True until the initial boot load resolves. Guards the canvas empty-state so a deep-link / reload
  // shows a calm "loading your workspace" instead of flashing the cold-start goal launcher for the
  // 1–2s before the project's graph arrives.
  const [booting, setBooting] = useState(true);
  const [overlay, setOverlay] = useState<"understand" | "settings" | null>(null);
  // Which Settings section is showing — the three admin surfaces (workspace index, team + release
  // roles, self-built tools) live behind one overlay now, switched by these tabs.
  const [settingsTab, setSettingsTab] = useState<"workspace" | "team" | "tools">("workspace");
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  // Which canvas lens is on screen: "operator" = the fleet-wide operating view (the default many-motion
  // view), "engineer" = the single-motion pipeline editor. Focusing a lane or a parked gate drops into
  // Engineer; the whole-operation view is Operator.
  const [canvasLens, setCanvasLens] = useState<"operator" | "engineer">("operator");
  // The intertwined canvas's view state (docs/INTERTWINED-CANVAS.md) — the projection axis (objects = the
  // moat view, type = the forms/spread view) and the focus-to-trace selection. Pure view state; nothing
  // persists. The canvas OPENS on the broad type/forms map, drilling to the object axis as you focus.
  const [wovenAxis, setWovenAxis] = useState<"objects" | "type">("type");
  const [wovenFocus, setWovenFocus] = useState<WovenFocus>(null);
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
  // True while the crew is reading the product in the background — either the auto-read that fires when a
  // project with no picture becomes active, or a founder's manual re-read. Drives the "reading your
  // product…" live state on the product panel so an empty panel never reads as a dead void.
  const [productDeriving, setProductDeriving] = useState(false);
  // Whether the founder has connected a REAL send transport (their own Gmail, or a connected endpoint).
  // Read once; used only to make the gate honest about what a "yes" does — "sends via your connected
  // Gmail/endpoint" vs "stages locally". This never loosens the wall; every send still waits at the gate.
  const [transportConnected, setTransportConnected] = useState(false);
  // Bumped to summon the Claude co-pilot — a new channel is born by telling Claude the goal, not by
  // filling a form, so "New channel" opens and focuses the chat.
  const [composerFocus, setComposerFocus] = useState(0);
  // The canvas↔chat tie: a node the founder handed to Claude from the canvas. While set, the composer
  // shows it as the subject chip and the next message is framed with that node's context, so "make this
  // shorter" / "why did this come up empty" resolves to a real canvas object — no describing it by hand.
  const [composerSubject, setComposerSubject] = useState<CanvasSubject | null>(null);
  // The Issues panel — the system's problem list, now a first-class always-present indicator on the
  // dock (no longer a summoned card). Opens from its toolbar badge, mutually exclusive with Approvals.
  const [issuesOpen, setIssuesOpen] = useState(false);
  // The pending-decision inbox — everything waiting on the founder across EVERY product and pipeline,
  // polled cross-project (independent of the focused session) so a run reaching the gate or dying in a
  // pipeline you're not looking at still bumps the dock badge. The panel is toggled from that badge and
  // is mutually exclusive with Issues (at most one dock popover open at a time).
  const [pendingInbox, setPendingInbox] = useState<PendingInbox | null>(null);
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  // The space I'm acting in (stamped on requests via lib/identity). The founder personal space is the
  // default; switching in TeamSpace re-scopes my release authority (resolved via canApproveApi below).
  const [acting, setActing] = useState<ActingIdentity>(getIdentity());
  // Whether the acting user may RELEASE a gate on the session's owning team (owner/approver yes,
  // member no). Drives the role-gated release control in the approval queue. Defaults true for the
  // solo founder (personal space) so nothing changes for a single-player install.
  const [canReleaseGate, setCanReleaseGate] = useState(true);
  // The Problems popover — the engine's investigations, surfaced as a compact toolbar chip now that
  // the Problems rail section is gone with the explorer. The Issues indicator (its own dock button +
  // the issuesOpen panel) is the visible home for these now; this setter is kept because several
  // handlers still defensively close the legacy popover state.
  const [, setProblemsOpen] = useState(false);
  // The base canvas per mode (no lens taxonomy): GTM shows the engine on the overview and a channel's
  // flow when one is open, chosen by channel state alone (no GTM lens state); Product drives its one
  // lens from the command dock. Everything else is summoned as a card.
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
  // A disconnected founder never reaches the canvas — the hard first-run gate (ConnectClaude, below)
  // stands in front of the whole workspace until Claude is signed in, replacing the old soft banner.
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);

  // Graph state — held per pipeline so every pipeline's full graph can coexist on one merged canvas
  // (switching pipelines becomes a camera pan, never a reload). `channelGraphs` is the source of
  // truth; `graph` stays a thin derived view onto the CENTERED pipeline (`activeChannelId`) so the
  // ~40 existing call sites below that read a single `graph` (selection, run, mutation, audit...)
  // keep working completely unchanged.
  const [channelGraphs, setChannelGraphs] = useState<Map<string, GTMGraph>>(new Map());
  // Structural-edit history for the working canvas graph — the undo/redo foundation. Founder edits
  // (add/move/connect/delete) and crew edits (the operator revising the board) both record here, so any
  // structural move is reversible. `recordEdit`/`undoEdit`/`redoEdit` are stable; the read helpers track
  // history state. Scoped to graph structure only — never runs, sends, or gate decisions.
  const { record: recordEdit, undo: undoEdit, redo: redoEdit, canUndo, canRedo, entriesFor } = useCanvasHistory();
  // A synchronous mirror of channelGraphs so async callbacks (operator poll) can read the pre-edit
  // snapshot without listing channelGraphs as a dependency (which would churn the polling effect).
  const channelGraphsRef = useRef(channelGraphs);
  channelGraphsRef.current = channelGraphs;
  const graph = useMemo(
    () => (activeChannelId ? channelGraphs.get(activeChannelId) ?? null : null),
    [channelGraphs, activeChannelId],
  );
  // Explicit per-channel write — for the few call sites that load/replace a SPECIFIC channel's graph
  // and must not depend on `activeChannelId` (which may not have caught up yet in the same tick).
  const setChannelGraph = useCallback((channelId: string, data: GTMGraph | null) => {
    setChannelGraphs((prev) => {
      const copy = new Map(prev);
      if (data === null) copy.delete(channelId); else copy.set(channelId, data);
      return copy;
    });
  }, []);
  // Compat shim: every OTHER existing call site mutates "the current graph" (add/delete a node, save
  // notes, record a run result) without naming a channel explicitly. Those all run while a channel is
  // already focused, so writing into `channelGraphs` keyed by `activeChannelId` is safe and drop-in —
  // this preserves every one of `setGraph`'s ~15 existing call sites verbatim.
  const setGraph = useCallback((updater: GTMGraph | null | ((current: GTMGraph | null) => GTMGraph | null)) => {
    if (!activeChannelId) return;
    setChannelGraphs((prev) => {
      const current = prev.get(activeChannelId) ?? null;
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next === current) return prev;
      const copy = new Map(prev);
      if (next === null) copy.delete(activeChannelId); else copy.set(activeChannelId, next);
      return copy;
    });
  }, [activeChannelId]);
  // One project, one canvas: every built workflow drawn as a labelled lane on the SAME canvas. This
  // is the project's home view; focusing a single workflow (clicking a lane, or the breadcrumb) loads
  // it into `graph` for editing/running through the existing single-graph machinery. Overview is the
  // active surface when this is set and nothing single is focused.
  // The engine overview is now a LENS of the GTM canvas, not a separately-assembled swimlane
  // graph. This flag says "show the project as the engine overview" (no single channel focused).
  const [overviewActive, setOverviewActive] = useState(false);
  // Run results, held per pipeline for the same reason graphs are (channelGraphs, above) — every
  // lane on the merged canvas shows its OWN real health/item counts, not just the centered one's.
  // `runResult`/`setRunResult` stay a thin derived view + compat shim so the several existing call
  // sites below (a run completing, streaming node results in, "Clear run") keep working unchanged.
  const [channelRunResults, setChannelRunResults] = useState<Map<string, GTMRunResult | null>>(new Map());
  const runResult = useMemo(
    () => (activeChannelId ? channelRunResults.get(activeChannelId) ?? null : null),
    [channelRunResults, activeChannelId],
  );
  const setChannelRunResult = useCallback((channelId: string, data: GTMRunResult | null) => {
    setChannelRunResults((prev) => {
      const copy = new Map(prev);
      if (data === null) copy.delete(channelId); else copy.set(channelId, data);
      return copy;
    });
  }, []);
  const setRunResult = useCallback((updater: GTMRunResult | null | ((current: GTMRunResult | null) => GTMRunResult | null)) => {
    if (!activeChannelId) return;
    setChannelRunResults((prev) => {
      const current = prev.get(activeChannelId) ?? null;
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next === current) return prev;
      const copy = new Map(prev);
      if (next === null) copy.delete(activeChannelId); else copy.set(activeChannelId, next);
      return copy;
    });
  }, [activeChannelId]);
  const [graphRunning, setGraphRunning] = useState(false);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [selection, setSelection] = useState<NodeSelection>(null);
  // Select a node that belongs to a specific pipeline (defaults to the currently FOCUSED one, `graph`)
  // — the common case, since a run result, a jump-from-Problems, or a newly added node all name a bare
  // id from whichever channel's graph is already on screen. Namespaces it `channelId::nodeId` so it
  // resolves correctly against the merged canvas's rendered node ids (React Flow's own store there is
  // keyed by that namespaced id, not the bare one) — a no-op prefix when there's no pipeline to attach
  // to. Callers reacting to a channel that's ALSO changing this tick (e.g. syncOperator) must pass the
  // channelId explicitly — `graph`/`activeChannelId` haven't caught up within the same synchronous call.
  const selectInGraph = useCallback((nodeId: string, channelId?: string | null) => {
    const cid = channelId ?? graph?.id ?? null;
    setSelection(cid ? `${cid}::${nodeId}` : nodeId);
  }, [graph]);
  // The team layer (Convex). Null when running solo/local — the whole team flow is opt-in and only
  // engages when a deployment is configured (VITE_CONVEX_URL). Seeded from localStorage so a returning
  // teammate lands straight in the workspace, not back through onboarding.
  const [teamIdentity, setTeamIdentity] = useState<TeamIdentity | null>(() => loadTeamIdentity());
  const [connectors, setConnectors] = useState<ConnectorMeta[]>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [decisions, setDecisions] = useState<Decisions>({});
  const [graphSavedAt, setGraphSavedAt] = useState<string | null>(null);
  const [flowRuns, setFlowRuns] = useState<GTMRunResult[]>([]);
  const [contractAudits, setContractAudits] = useState<Record<string, GTMContractAudit>>({});
  // Engine state powers inline node health and the Problems rail.
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [library, setLibrary] = useState<GtmLibrary | null>(null);
  // The bench — every agent's track record derived from the run ledger. Loaded once per project and
  // reused by both the bench surface and the crew strip's approved-count badges.
  const [bench, setBench] = useState<AgentBenchRow[] | null>(null);
  // "What happened" — the latest run's real numbers, derived read-only from the engine. It folds onto
  // the canvas (the single home) as a compact strip; there is no separate cockpit surface anymore.
  // `outcomeOpen` gates the manual "what happened / what did we learn" loop-closer.
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [operatorSession, setOperatorSession] = useState<OperatorSession | null>(null);
  // The host-computed opening briefing (cross-pipeline snapshot), fetched from the server and handed to
  // ComposerDock's `briefing` prop — it overrides the dock's client-derived-from-roster fallback.
  const [composerBriefing, setComposerBriefing] = useState<ComposerBriefing | null>(null);
  // Every pipeline the founder is running for this product, as lightweight summaries — the source for
  // the composer's chat tabs. The backend already drives these sessions in parallel; this is the UI
  // catching up to that. `operatorSession` stays the single ACTIVE conversation (all the gate / proposal
  // / polling wiring keys off it, untouched); the roster is purely additive, refreshed alongside it.
  const [sessionRoster, setSessionRoster] = useState<OperatorSessionSummary[]>([]);
  // Tabs the founder has CLOSED. Close has no backend delete (a pipeline stays alive server-side), so a
  // closed tab is a client-side view dismissal: rosterForDock filters these out. It naturally resets on a
  // product switch (the roster re-seeds), so a still-alive pipeline honestly reappears on product re-entry.
  const [dismissedTabs, setDismissedTabs] = useState<Set<string>>(new Set());
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

  // The team rail in the profile: this product's own crew, scoped by the bench (the ~8 agents actually
  // on this product), not the entire global agents folder. The bench is already loaded and scoped below.
  const agentTeam = useMemo<TeammateView[]>(
    () => (bench ?? []).map((a) => ({ ref: a.ref, job: a.job })),
    [bench],
  );

  // Assemble the open agent's profile — prefer the crew job (scoped to this product) and fall back to
  // the stock on-disk library description only when the agent isn't on the bench.
  const agentProfileView = useMemo<AgentProfileView | null>(() => {
    if (!agentProfileRef) return null;
    const crew = (bench ?? []).find((a) => a.ref === agentProfileRef);
    const stock = library?.agents.find((a) => a.ref === agentProfileRef);
    return { ref: agentProfileRef, job: crew?.job || stock?.description || "" };
  }, [agentProfileRef, bench, library]);
  const operatorGraphRevision = useRef<number | null>(null);
  const operatorRunId = useRef<string | null>(null);

  const loadEngine = useCallback((channelId: string | null = activeChannelId) => {
    getEngineState(channelId ?? undefined).then((res) => setEngine(res.engine)).catch(console.error);
  }, [activeChannelId]);

  // The library (subagents + skills on disk) is product-wide; load it once for the explorer.
  useEffect(() => {
    getLibrary().then(setLibrary).catch(console.error);
    getConnection().then(setConnection).catch(() => {});
  }, []);

  // The bench's derived track record, per project, for the crew strip's approved-count badges. The
  // bench SURFACE fetches its own fresh copy on open; this is the always-available copy for the canvas.
  // Bumped after a teammate is built and added, so the bench refetches and the new face appears.
  const [benchNonce, setBenchNonce] = useState(0);
  const refreshBench = useCallback(() => setBenchNonce((n) => n + 1), []);
  useEffect(() => {
    if (!activeProjectId) { setBench(null); return; }
    let live = true;
    getAgentBench(activeProjectId).then((r) => { if (live) setBench(r.bench); }).catch(() => { if (live) setBench(null); });
    return () => { live = false; };
  }, [activeProjectId, benchNonce]);

  // The run summary, fetched whenever the founder is on the canvas (and after an outcome is logged, so
  // the loop visibly compounds). Honest null when no run has happened yet.
  const refreshRunSummary = useCallback(() => {
    if (!activeProjectId) return;
    getRunSummary(activeProjectId).then((r) => setRunSummary(r.run)).catch(() => setRunSummary(null));
  }, [activeProjectId]);
  useEffect(() => {
    if (view !== "canvas" || !activeProjectId) return;
    let live = true;
    getRunSummary(activeProjectId).then((r) => { if (live) setRunSummary(r.run); }).catch(() => { if (live) setRunSummary(null); });
    return () => { live = false; };
  }, [view, activeProjectId]);

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

  // The acting space changed in TeamSpace — re-scope identity so the release-authority check and the
  // identity-stamped reads re-resolve on the next poll.
  const handleTeamChange = useCallback((identity: ActingIdentity) => {
    setActing(identity);
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
      setChannelGraph(channelId, graphResponse.graph);
      const priorRuns = graphResponse.runs ?? [];
      setFlowRuns(priorRuns);
      // Rehydrate the latest persisted run so opening an outcome shows its REAL state — the node
      // results on the canvas, the impact strip, and any drafts staged at its gate. Without this a
      // completed run (one fired headlessly via the API, or in a prior session) was invisible: the
      // gate's staged drafts sat in the ledger but never reached the review surface.
      setChannelRunResult(channelId, priorRuns.length ? priorRuns[priorRuns.length - 1] : null);
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
  }, [setChannelGraph, setChannelRunResult]);

  // "Open this pipeline" on the merged canvas — a camera pan, never a reload. `loadChannel` above
  // (network fetch + engine refresh + URL sync) is still exactly right the FIRST time a pipeline is
  // opened; once it's cached in `channelGraphs` (every built pipeline is, within moments of project
  // load — see the batch effect above), switching to it is instant and local: move focus, bump the
  // pan signal, leave every other channel's cached state untouched.
  // panSignal drives the canvas camera: a channelId alone flies to that pipeline's lane; adding a nodeId
  // flies to that specific node. The token forces a re-fire even when the target repeats.
  const [panSignal, setPanSignal] = useState<{ channelId: string; token: number; nodeId?: string } | null>(null);
  const focusChannel = useCallback((channelId: string) => {
    if (!channelGraphs.has(channelId)) { void loadChannel(channelId); return; }
    setOverlay(null);
    setOverviewActive(false);
    setSelection(null);
    setActiveChannelId(channelId);
    setPanSignal((prev) => ({ channelId, token: (prev?.token ?? 0) + 1 }));
    const projectId = activeProjectIdRef.current;
    if (projectId) window.history.replaceState(null, "", `/projects/${encodeURIComponent(projectId)}`);
    void setActiveWorkflow(channelId).catch(() => {}); // best-effort — persists the founder's focus server-side
  }, [channelGraphs, loadChannel]);
  // Fly the camera to a specific node without opening its editor — the "chat drives the canvas" move
  // lands you looking AT the step, in place, not inside a modal.
  const flyToNode = useCallback((nodeId: string, channelId: string) => {
    setOverlay(null);
    setPanSignal((prev) => ({ channelId, nodeId, token: (prev?.token ?? 0) + 1 }));
  }, []);
  // Deterministic canvas navigation from the composer: "go to / show me / focus / open <X>" resolves X
  // against the REAL pipeline names and node labels — no model call (nav is code's job, not judgment).
  // Pure: returns the camera target or null, with NO side effect, so the composer can ask "is this a
  // navigation command?" (to allow it even mid-run) without moving the canvas.
  const resolveCanvasCommand = useCallback((raw: string): { channelId: string; nodeId?: string } | null => {
    const m = raw.trim().match(/^(?:go to|show me|take me to|jump to|navigate to|focus(?: on)?|open|find)\s+(.+?)[\s.?!]*$/i);
    if (!m) return null;
    const q = m[1].trim().toLowerCase().replace(/^(the|my|our|this)\s+/, "").trim();
    if (q.length < 2) return null;
    // Stage words resolve to a node CATEGORY (like "gate" always did), so "go to the measure step" /
    // "source" / "send step" land even though the node's real label is something like "Log qualification…".
    const qBase = q.replace(/\s+(step|node|stage)$/, "").trim();
    const CATEGORY_ALIASES: Record<string, GTMNodeCategory> = {
      gate: "gate", "founder gate": "gate",
      measure: "measure", measurement: "measure", measures: "measure",
      source: "source", sources: "source", seed: "source",
      send: "execute", execute: "execute", ship: "execute", deploy: "execute",
      enrich: "enrich", enrichment: "enrich",
      filter: "filter", qualify: "filter", qualification: "filter",
      draft: "generate", generate: "generate", write: "generate",
    };
    const catAlias = CATEGORY_ALIASES[qBase];
    // Node search: the focused pipeline first, then every other pipeline on the canvas.
    const graphs: { g: GTMGraph; cid: string }[] = [];
    if (graph) graphs.push({ g: graph, cid: activeChannelId ?? graph.id });
    for (const [cid, g] of channelGraphs.entries()) if (!graph || g.id !== graph.id) graphs.push({ g, cid });
    // Exact pipeline name wins first (so "show me restaurant outbound" flies to the pipeline, not a node).
    const exactChan = channels.find((c) => c.name.toLowerCase() === q);
    if (exactChan) return { channelId: exactChan.id };
    for (const { g, cid } of graphs) {
      const hit = g.nodes.find((n) => {
        if (catAlias) return n.category === catAlias;
        // Match what the founder SEES: an agent node's card shows its persona role ("Prospect
        // Researcher"), not the raw node.label ("PCO Prospect Research"). Match both, either direction.
        const shown = (n.kind === "agent" && n.ref ? agentPersona(n.ref, n.label).role : n.label ?? "").toLowerCase();
        const label = (n.label ?? "").toLowerCase();
        return shown === q || label === q || shown.includes(q) || q.includes(shown) || label.includes(q);
      });
      if (hit) return { channelId: cid, nodeId: hit.id };
    }
    const chan = channels.find((c) => { const n = c.name.toLowerCase(); return n.includes(q) || q.includes(n); });
    if (chan) return { channelId: chan.id };
    return null;
  }, [channels, graph, channelGraphs, activeChannelId]);
  // Execute a resolved command (the side effect). Returns true when it moved the canvas.
  const runCanvasCommand = useCallback((raw: string): boolean => {
    const t = resolveCanvasCommand(raw);
    if (!t) return false;
    if (t.nodeId) flyToNode(t.nodeId, t.channelId); else focusChannel(t.channelId);
    return true;
  }, [resolveCanvasCommand, flyToNode, focusChannel]);
  // The composer's predicate: a navigation command steers the canvas and is allowed EVEN while Claude is
  // working (it never reaches the operator). Not in the ideate posture, where every message is thinking.
  const isCanvasCommand = useCallback((raw: string): boolean =>
    composerPosture !== "ideate" && resolveCanvasCommand(raw) !== null,
  [resolveCanvasCommand, composerPosture]);
  // Hand a node to Claude as the chat subject — from the node card or its editor. Closes the modal (if
  // open) and focuses the composer, so you land in the chat talking about that exact step. Canvas ↔ chat.
  const askClaudeAbout = useCallback((node: GTMNode) => {
    setComposerSubject({ id: node.id, label: node.label, kind: node.kind && node.kind !== "tool" ? node.kind : node.category });
    setSelection(null);
    setComposerFocus((f) => f + 1);
  }, []);

  // Re-target the composer to a Related card from the composer's own card face: point composerSubject at
  // that card (light identity only). Flipping subjectId makes the object graph select that card and emit
  // its full detail back up, which re-scopes the card face — the founder walks the graph without the
  // composer closing. The panel is already open, so this never collapses it.
  const handleRetargetSubject = useCallback((rel: { id: string; name: string }) => {
    setComposerSubject({ id: rel.id, label: rel.name, kind: "block", detail: null });
  }, []);

  // Zoom out to the one-canvas overview: show the GTM canvas's engine-overview lens — every built
  // channel as a tile — instead of a single focused workflow. Returns false when there's nothing to
  // show (no channels with nodes), so callers fall back to focusing a single workflow. The assembled
  // swimlane graph is gone; the overview lens reads the channel metas the founder already has.
  //
  // Unfocusing here only clears WHICH channel is centered (`activeChannelId`) — it never evicts a
  // channel's graph from `channelGraphs`. Every loaded pipeline stays cached so the merged canvas
  // can keep rendering all of them at once even while the overview/board is on screen.
  const loadProjectOverview = useCallback(async (channelsForProject: ChannelMeta[]): Promise<boolean> => {
    const built = channelsForProject.filter((ch) => ch.nodeCount > 0);
    if (!built.length) { setOverviewActive(false); return false; }
    setOverviewActive(true);
    setActiveChannelId(null);
    // Returning to the whole operation resets the lens to Operator — the default many-motion view — so a
    // prior forced-Engineer focus (from opening a lane or a gate) doesn't stick on the overview.
    setCanvasLens("operator");
    setSelection(null);
    setOverlay(null);
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

  // Batch-load every OTHER built pipeline's graph too, not just the centered one — the merged canvas
  // (the literal one-coordinate-space unification) needs every lane's real nodes to render them all
  // at once. Fires whenever the channel list changes, so a newly composed pipeline folds in without a
  // manual switch; skips anything already cached, so this never refetches on an unrelated re-render.
  useEffect(() => {
    const missing = channels.filter((c) => c.nodeCount > 0 && !channelGraphs.has(c.id));
    if (!missing.length) return;
    let live = true;
    void Promise.all(
      missing.map((c) => getGraphTemplate(c.id)
        .then((r) => [c.id, r.graph, r.runs ?? []] as const)
        .catch(() => null)),
    ).then((results) => {
      if (!live) return;
      const loaded = results.filter((r): r is readonly [string, GTMGraph, GTMRunResult[]] => r !== null);
      if (!loaded.length) return;
      setChannelGraphs((prev) => {
        const copy = new Map(prev);
        for (const [id, g] of loaded) copy.set(id, g);
        return copy;
      });
      // Every lane needs its own last-run health too — same response, no extra fetch.
      setChannelRunResults((prev) => {
        const copy = new Map(prev);
        for (const [id, , runs] of loaded) if (runs.length) copy.set(id, runs[runs.length - 1]);
        return copy;
      });
    });
    return () => { live = false; };
  }, [channels, channelGraphs]);

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
        // Land on the canvas — the map IS home now. The Best Next Move floats over it as a hero card,
        // so the founder still gets one thing to do next without the graph being hidden behind a scroll.
        if (live && projectResponse.project.sharedContext.repository.workspaceId) setView("canvas");
        return;
      }
      const [graphResponse, engineResponse] = await Promise.all([
        getGraphTemplate(channelId),
        getEngineState(channelId),
      ]);
      if (!live) return;
      setActiveChannelId(channelId);
      setChannelGraph(channelId, graphResponse.graph);
      const bootRuns = graphResponse.runs ?? [];
      setFlowRuns(bootRuns);
      // Hydrate the latest run on first paint too, so the channel you land on shows its real state
      // (node results, staged drafts) without needing a manual click to re-open it.
      setChannelRunResult(channelId, bootRuns.length ? bootRuns[bootRuns.length - 1] : null);
      setEngine(engineResponse.engine);
      // Land on the canvas, the focused channel's map already loaded, the Best Next Move floating over it.
      if (projectResponse.project.sharedContext.repository.workspaceId) setView("canvas");
    }).catch(console.error).finally(() => { if (live) setBooting(false); });
    return () => { live = false; };
    // Boot runs once on mount; loadProjectOverview/setChannelGraph are stable callbacks, listed to
    // satisfy the linter.
  }, [loadProjectOverview, setChannelGraph, setChannelRunResult]);

  // Refresh the chat-tab roster — every pipeline conversation for the active product, as summaries.
  // Cheap (no per-session detail fetch), so it's safe to call on the operator poll tick and after any
  // create/switch. Keeps the tab dots (working / needs-you / done) honest for pipelines that aren't the
  // one on screen, which is the whole point of running several at once.
  const refreshRoster = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    try {
      const { sessions } = await listOperatorSessions(projectId);
      setSessionRoster(sessions);
    } catch { /* a roster refresh failure is non-fatal — the active conversation is unaffected */ }
    try {
      setComposerBriefing(await getComposerBriefing(projectId));
    } catch { /* the briefing read is non-fatal — the dock falls back to its client-derived one */ }
  }, []);

  // Restore the latest durable operator session for the active product. Re-runs
  // whenever the active product changes, so switching products in the top-left
  // swaps the Claude session to that product's own chat (or clears it if none).
  useEffect(() => {
    if (!activeProjectId) return;
    let live = true;
    setComposerBriefing(null);
    listOperatorSessions(activeProjectId)
      .then(async ({ sessions }) => {
        if (!live) return;
        setSessionRoster(sessions); // seed the tab roster with every pipeline for this product
        getComposerBriefing(activeProjectId).then((b) => { if (live) setComposerBriefing(b); }).catch(() => {});
        // The dock OPENS on the project's most-live conversation: prefer the active (non-terminal)
        // thread; fall back to the newest session so a just-finished one (which may still hold an
        // unresolved on-canvas proposal) stays on screen. The others are reachable on their tabs.
        const TERMINAL = ["completed", "cancelled"];
        const active = sessions.find((s) => !TERMINAL.includes(s.status)) ?? sessions[0];
        if (!active) { setOperatorSession(null); return; }
        const response = await getOperatorSession(active.id, activeProjectId);
        if (!live) return;
        setOperatorSession(humanizeOperatorSession(response.session));
        operatorGraphRevision.current = response.session.graphRevision;
      })
      .catch(() => {});
    return () => { live = false; };
  }, [activeProjectId]);

  // Load the current living product picture whenever the active product changes. The model is
  // per-project, so it's fetched alongside the project and cleared when none is active. If the picture
  // is still empty (a freshly-scanned product the background derive hasn't filled in yet), kick a
  // read and poll a couple times, showing the "reading your product…" live state until it lands.
  // The clear, the fetch, and the derive all run in async callbacks, never synchronously in the effect body.
  const productHasContent = useCallback(
    (m: ProductModel | null) => !!m && ((m.things?.length ?? 0) > 0 || (m.userGoals?.length ?? 0) > 0),
    [],
  );
  useEffect(() => {
    let live = true;
    if (!activeProjectId) { setProductModel(null); setProductDeriving(false); return; }
    (async () => {
      const first = await getProductModel().then(({ productModel: m }) => m).catch(() => null);
      if (!live) return;
      setProductModel(first);
      if (productHasContent(first)) return;
      // Nothing derived yet — read the product in the background, then refetch a few times so the panel
      // fills the moment the picture is ready. deriveProductModel is idempotent server-side; this never
      // sends or publishes anything.
      setProductDeriving(true);
      try {
        const derived = await deriveProductModel().then(({ productModel: m }) => m).catch(() => null);
        if (!live) return;
        if (productHasContent(derived)) { setProductModel(derived); return; }
        // The derive returned blank (or is still settling) — poll the read a couple times before giving up.
        for (let i = 0; i < 3 && live; i += 1) {
          await new Promise((r) => setTimeout(r, 1200));
          if (!live) return;
          const again = await getProductModel().then(({ productModel: m }) => m).catch(() => null);
          if (!live) return;
          if (productHasContent(again)) { setProductModel(again); return; }
          if (again) setProductModel(again);
        }
      } finally {
        if (live) setProductDeriving(false);
      }
    })();
    return () => { live = false; };
  }, [activeProjectId, productHasContent]);

  // Manual re-read — an explicit refresh of the product picture. Reads the product again and refetches
  // the picture. Idempotent, read-only-to-the-world: never sends or publishes.
  const handleRereadProduct = useCallback(async () => {
    if (!activeProjectId || productDeriving) return;
    setProductDeriving(true);
    try {
      const derived = await deriveProductModel().then(({ productModel: m }) => m).catch(() => null);
      if (productHasContent(derived)) { setProductModel(derived); return; }
      const refreshed = await getProductModel().then(({ productModel: m }) => m).catch(() => null);
      setProductModel(refreshed);
    } finally {
      setProductDeriving(false);
    }
  }, [activeProjectId, productDeriving, productHasContent]);

  // Read whether a real send transport is connected — a founder-connected Gmail, or a connected http
  // endpoint. Only the gate lead copy reads this, to say honestly what a "yes" does. Re-read when the
  // active product changes (credentials are founder-owned/universal, but the Settings tab may have just
  // connected one). Read-only; touches nothing about the wall.
  useEffect(() => {
    let live = true;
    getCredentials()
      .then(({ credentials }) => {
        if (!live) return;
        setTransportConnected(
          credentials.some((c) => c.provider === "gmail" || c.provider === "http_endpoint"),
        );
      })
      .catch(() => { if (live) setTransportConnected(false); });
    return () => { live = false; };
  }, [activeProjectId, overlay]);

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

  const syncOperator = useCallback((raw: OperatorSession) => {
    const next = humanizeOperatorSession(raw); // one seam: run state becomes founder language here
    setOperatorSession(next);
    if (operatorGraphRevision.current !== next.graphRevision) {
      operatorGraphRevision.current = next.graphRevision;
      if (activeChannelId !== next.graphId) setActiveChannelId(next.graphId);
      void getGraphTemplate(next.graphId).then((response) => {
        // A crew edit: the operator revised the board server-side. Record the structural delta so the
        // founder can undo an agent move exactly like their own. `describeGraphDiff` returns null when
        // nothing structural changed (a pure run/store refresh), so those never land in the history.
        const prevGraph = channelGraphsRef.current.get(next.graphId);
        if (prevGraph) {
          const label = describeGraphDiff(prevGraph, response.graph);
          if (label) recordEdit(next.graphId, { label, actor: { by: "claude" }, before: prevGraph, after: response.graph });
        }
        setChannelGraph(next.graphId, response.graph);
        setFlowRuns(response.runs ?? []);
        setGraphSavedAt(response.graph.store?.lastRunAt ?? null);
      });
    }
    const pendingRun = next.pendingGate?.runResult;
    if (pendingRun && operatorRunId.current !== pendingRun.runId) {
      operatorRunId.current = pendingRun.runId;
      setChannelRunResult(next.graphId, pendingRun);
      setFlowRuns((current) => [...current.filter((run) => run.runId !== pendingRun.runId), pendingRun].slice(-10));
      const gateId = next.pendingGate?.nodeIds[0];
      if (gateId) selectInGraph(gateId, next.graphId);
      loadEngine();
    }
  }, [activeChannelId, loadEngine, setChannelGraph, setChannelRunResult, selectInGraph, recordEdit]);

  // Active sessions are executed server-side. Polling keeps the event trail and
  // graph in lockstep even if the panel is closed and reopened.
  const operatorSessionId = operatorSession?.id ?? null;
  const operatorSessionStatus = operatorSession?.status ?? null;
  // The cold-start front door is showing: no project open at all, no channel graph, no active operator
  // session, not mid-boot. When this is true the GoalLauncher owns the screen and the docked co-pilot
  // must stay hidden — otherwise both inputs stack (the cancelled-session overlap bug). Now that the GTM
  // map is the default canvas for ANY open project, the launcher only owns the screen when no project is
  // open; on the map the composer (the harness) stays docked, so this keys off activeProjectId.
  const showGoalLauncher =
    !activeProjectId &&
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
    // Tighter cadence while the crew is actively driving so its reasoning and each node landing read as
    // live, not laggy; back off to a calm tick once it's paused at a decision (gate/input/ideas), where
    // updates are founder-driven and a fast poll would just burn requests.
    const interval = operatorSessionStatus === "running" ? 400 : 900;
    const timer = window.setInterval(() => void poll(), interval);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [activeProjectId, operatorSessionId, operatorSessionStatus, syncOperator]);

  // Keep the chat-tab dots live for pipelines that AREN'T the active conversation: a calm 4s refresh of
  // the roster while any of them is still in flight. Gated on a derived boolean (not the roster array) so
  // it doesn't re-arm on every refresh; stops entirely once every pipeline has settled, so an idle
  // product polls nothing. The active tab doesn't wait on this — it's merged live below.
  const anyRosterLive = sessionRoster.some(
    (s) => !["completed", "cancelled", "blocked", "failed"].includes(s.status),
  );
  useEffect(() => {
    if (!activeProjectId || !anyRosterLive) return;
    const timer = window.setInterval(() => void refreshRoster(), 4000);
    return () => window.clearInterval(timer);
  }, [activeProjectId, anyRosterLive, refreshRoster]);

  // The roster the composer tabs render. Tabs are for the pipelines you're RUNNING RIGHT NOW, not a
  // graveyard of every past conversation — so this keeps only the still-in-flight sessions (working or
  // waiting on you), plus the active one even if it just went terminal (your current chat keeps its
  // tab). The active row is overlaid with the LIVE session (fresh status + goal) and guaranteed present
  // before the first roster fetch lands; the rest catch up on the 4s cadence above.
  const rosterForDock = useMemo<OperatorSessionSummary[]>(() => {
    const LIVE = new Set([
      "running", "ready",
      "waiting_for_gate", "waiting_for_proposal", "waiting_for_ideas", "waiting_for_input",
      "interrupted", "blocked",
    ]);
    const rows = sessionRoster
      .filter((s) => LIVE.has(s.status) || s.id === operatorSession?.id)
      // A closed tab drops out — UNLESS it's the active thread on screen (you can't hide the conversation
      // you're currently reading out from under yourself; closing the active one switches away first).
      .filter((s) => !dismissedTabs.has(s.id) || s.id === operatorSession?.id)
      .map((s) =>
        s.id === operatorSession?.id
          ? { ...s, status: operatorSession.status, goal: operatorSession.goal, summary: operatorSession.summary ?? s.summary }
          : s,
      );
    if (operatorSession && !rows.some((s) => s.id === operatorSession.id)) {
      rows.unshift({
        id: operatorSession.id, goal: operatorSession.goal, graphId: operatorSession.graphId,
        projectId: operatorSession.projectId, workspaceId: operatorSession.workspaceId,
        status: operatorSession.status, createdAt: operatorSession.createdAt,
        updatedAt: operatorSession.updatedAt, summary: operatorSession.summary, error: operatorSession.error,
      });
    }
    return rows;
  }, [sessionRoster, operatorSession, dismissedTabs]);

  // Cross-project pending-decision poll — the notification. It reads what's waiting on the founder
  // across EVERY product and pipeline, NOT just the focused session, so a run that reaches the gate or
  // dies while the founder is looking elsewhere still lights the dock badge. Slower cadence than the
  // focused-session poll (this is a badge, not a live thread). Runs for the whole app lifetime.
  const refreshPendingInbox = useCallback(async () => {
    try {
      const inbox = await getPendingInbox();
      setPendingInbox(inbox);
    } catch {
      // Keep the last known count; the next tick may recover.
    }
  }, []);
  useEffect(() => {
    let live = true;
    const tick = async () => { if (live) await refreshPendingInbox(); };
    void tick();
    const timer = window.setInterval(() => void tick(), 4000);
    return () => { live = false; window.clearInterval(timer); };
  }, [refreshPendingInbox]);
  const pendingCount = pendingInbox?.total ?? 0;
  const pendingDecisions = pendingInbox?.decisions ?? [];

  // The operating view — the ONE Operator lens read (Area 6). A pure cross-fleet projection the lens
  // renders: every motion as a uniform lane, the shared objects drawn once with lane ties, the parked-
  // at-gate state. Scoped to the active project, polled on the same cadence as the inbox so a lane's
  // pulse and a parked count stay live. Reading it never sends, runs, or gates.
  const [operatingView, setOperatingView] = useState<OperatingView | null>(null);
  const refreshOperatingView = useCallback(async () => {
    if (!activeProjectId) { setOperatingView(null); return; }
    try {
      setOperatingView(await getOperatingView(activeProjectId));
    } catch {
      // Keep the last known view; the next tick may recover.
    }
  }, [activeProjectId]);
  useEffect(() => {
    let live = true;
    const tick = async () => { if (live) await refreshOperatingView(); };
    void tick();
    const timer = window.setInterval(() => void tick(), 4000);
    return () => { live = false; window.clearInterval(timer); };
  }, [refreshOperatingView]);

  // What the woven canvas opens on (docs/INTERTWINED-CANVAS.md decision 2): whatever NEEDS you — if a lane
  // is parked at a gate, open on the object axis focused on that lane so its crossings light immediately;
  // otherwise the broad GTM-forms map (the type axis, fully zoomed out). Runs once per project open (keyed
  // on the project), never fighting a founder's later toggle.
  const openedWovenForProject = useRef<string | null>(null);
  useEffect(() => {
    if (!activeProjectId || !operatingView) return;
    if (openedWovenForProject.current === activeProjectId) return;
    openedWovenForProject.current = activeProjectId;
    const parked = operatingView.lanes.find((l) => l.runState === "parked");
    if (parked) {
      setWovenAxis("objects");
      setWovenFocus({ kind: "lane", channelId: parked.channelId });
    } else {
      setWovenAxis("type");
      setWovenFocus(null);
    }
  }, [activeProjectId, operatingView]);

  // The per-motion efficiency table (Area 7) — the Measure surface's "which motion is working" read.
  // Fetched on demand when the outcome/measure surface opens, so recording a result and seeing what it
  // moved sit together. Pure read; never sends.
  const [motionEfficiency, setMotionEfficiency] = useState<Awaited<ReturnType<typeof getMotionEfficiency>> | null>(null);
  const refreshMotionEfficiency = useCallback(async () => {
    if (!activeProjectId) { setMotionEfficiency(null); return; }
    try { setMotionEfficiency(await getMotionEfficiency(activeProjectId)); } catch { /* keep last */ }
  }, [activeProjectId]);

  // The reallocation receipt (Area 3, the Overdrive card) — what the machine leaned toward, from which
  // real outcomes, plus the motions flagged as drawing nothing. Loaded when the "waiting on you" batch
  // opens; overturnable, never a hidden policy. Pure read; nothing here sends or auto-kills a motion.
  const [reallocation, setReallocation] = useState<Awaited<ReturnType<typeof getReallocation>> | null>(null);
  // The founder's persisted call on the current receipt (Overdrive: a correction after the fact). Held in
  // the client for the session; overturning re-tunes the ranking weights to base through the tunables save.
  const [reallocationDecision, setReallocationDecision] = useState<"accepted" | "overturned" | null>(null);
  const refreshReallocation = useCallback(async () => {
    try { setReallocation(await getReallocation()); } catch { /* keep last */ }
    setReallocationDecision(null);
  }, []);

  // Overturn the lean (Overdrive: the founder's correction after the fact). The tilt is advisory — it
  // shapes compose grounding and ranking but is never persisted over the founder's saved weights — so
  // overturning it holds the machine at the founder's own base leaning: re-save the current base weights,
  // which zeroes any accumulated drift, and record the call as a receipt chip. Never sends.
  const overturnReallocation = useCallback(async () => {
    try {
      if (reallocation?.base) {
        const { tunables } = await getReallocationTunables();
        // Re-affirm the founder's base: saving the current tunables re-anchors the ranking to the
        // founder's weights, so the advisory lean stops accumulating. (The base weights themselves live in
        // the signal-weights surface; this confirms the aggressiveness table the lean runs inside.)
        await saveReallocationTunables(tunables);
      }
    } catch { /* the receipt still records the founder's call even if the re-anchor read fails */ }
    setReallocationDecision("overturned");
  }, [reallocation]);

  const acceptReallocation = useCallback(() => {
    // Let the lean stand — the Overdrive default. Persist the founder's call as a receipt chip.
    setReallocationDecision("accepted");
  }, []);

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
      if (firstProblem) selectInGraph(firstProblem, graph.id);
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
  }, [activeChannelId, approvals, decisions, graph, loadEngine, refreshProjectScope, setGraph, setRunResult, selectInGraph]);

  // Run JUST ONE step — the "run a small thing" loop. Unlike executeGraph (which resolves a gate or
  // runs the whole loop and then jumps to the first problem), this keeps the node you clicked selected
  // so its produced items land inside its own open detail view — "that's what you see when you click on
  // it." Uses the dedicated single-node run; nothing sends (an execute step still stops at its gate).
  const runNode = useCallback(async (nodeId: string) => {
    if (!graph) return;
    setGraphRunning(true);
    setRunningNodeId(nodeId);
    setGraphError(null);
    try {
      const result = await runWorkflowNode(graph, nodeId);
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
      // Honest failure: surface a real step error, but a paused/blocked gate is the spine, not a fault.
      const node = result.nodes[nodeId];
      if (node && !node.ok && !node.pendingReview && !node.blocked) {
        setGraphError(node.error || "This step needs attention.");
      }
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    } finally {
      setGraphRunning(false);
      setRunningNodeId(null);
      loadEngine(graph?.id ?? activeChannelId); // a run updates the ledger → refresh health + problems
      void refreshProjectScope();
    }
  }, [activeChannelId, graph, loadEngine, refreshProjectScope, setGraph, setRunResult]);

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
          if (ev.result.items?.length || ev.result.pendingReview) selectInGraph(ev.nodeId, graph.id);
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
          if (land) selectInGraph(land, graph.id);
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
  }, [activeChannelId, approvals, decisions, graph, loadEngine, refreshProjectScope, setGraph, setRunResult, selectInGraph]);

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

  // Veto-as-loop: the founder sends ONE staged item back to the crew with a note. This routes the item +
  // note into the operator session (which re-drives to rework just that item and returns it to the gate)
  // and opens the Composer so the rework reads as a crew conversation. Nothing is released — not a reject,
  // a rework. Only fires while a run is paused at the gate; otherwise there's no session to hand it to.
  const refineGateItem = useCallback(async (item: GTMItem, note: string) => {
    if (!operatorSession || operatorSession.status !== "waiting_for_gate") return;
    const gateNodeId = operatorSession.pendingGate?.nodeIds?.[0];
    if (!gateNodeId) return;
    const gateItems = runResult?.nodes[gateNodeId]?.items ?? [];
    const idx = gateItems.indexOf(item);
    const key = itemKey(item, idx >= 0 ? idx : 0);
    const response = await refineOperatorGate(
      operatorSession.id,
      operatorProjectId(operatorSession),
      { gateNodeId, itemKey: key, founderNote: note },
    );
    syncOperator(response.session);
    // Surface the rework: open/focus the Composer so the crew picking this back up reads as a conversation.
    setComposerFocus((f) => f + 1);
  }, [operatorSession, runResult, syncOperator]);

  // Area 5 MOVE 1 — the founder's call on a code-native staged item (a microproduct, an in-repo change, a
  // page generator), routed through the multi-modal gate delta. An "approve" resolves the gate and stages
  // the change (the deploy connector still refuses to ship without the second yes). A "ship" resolves the
  // SAME gate but carries `deployConfirmed:true` — the explicit second authorization the deploy connector
  // requires (deploy.mjs GUARD 2). The route forwards the whole body, so deployConfirmed reaches the
  // connector only on a real founder ship. Nothing is invented or auto-filled: an approve never ships.
  const decideGateDelta = useCallback(async (
    _item: GTMItem,
    key: string,
    decision: GateDeltaDecision,
  ) => {
    if (!operatorSession || operatorSession.status !== "waiting_for_gate") return;
    const gateNodeId = operatorSession.pendingGate?.nodeIds?.[0];
    if (!gateNodeId) return;
    const nextApprovals = { ...approvals, [gateNodeId]: true };
    // Approve and ship both bank an approve on this item; ship additionally carries the deploy second
    // authorization. An edited body rides an outbound edit (a change/page item won't carry one).
    const itemDecision: GateDecision = decision.editedBody != null
      ? { decision: "approve", editedDraft: decision.editedBody }
      : { decision: "approve" };
    const nextDecisions: Decisions = {
      ...decisions,
      [gateNodeId]: { ...(decisions[gateNodeId] ?? {}), [key]: itemDecision },
    };
    setApprovals(nextApprovals);
    setDecisions(nextDecisions);
    const response = await resolveOperatorGate(
      operatorSession.id,
      operatorProjectId(operatorSession),
      {
        approvals: nextApprovals,
        decisions: nextDecisions,
        // The SECOND authorization — sent ONLY on a real ship. deploy.mjs refuses without it, so an
        // approve stages and a ship goes live. Never set on approve; never invented by the route.
        ...(decision.decision === "ship" && decision.deployConfirmed ? { deployConfirmed: true } : {}),
      },
    );
    syncOperator(response.session);
  }, [operatorSession, approvals, decisions, syncOperator]);

  // The outcome door on an approved gate card. After the founder releases an item, the real result comes
  // back later — a reply, a meeting, a purchase. This records THAT on the exact item the founder just
  // sent, joined by the item's durable provenance id (its Phase-5 joinKey when one was minted, else the
  // gtmActionId the gate stamps on every item), through the existing founder-entered outcome ingest. It
  // records what ALREADY happened; nothing sends. The run summary re-reads so the new result shows.
  const recordItemOutcome = useCallback(async (
    item: GTMItem,
    outcome: { outcomeKind: string; value?: number },
  ) => {
    if (!activeProjectId) return;
    const ids = item as { joinKey?: unknown; gtmActionId?: unknown };
    const joinKey = typeof ids.joinKey === "string" && ids.joinKey
      ? ids.joinKey
      : typeof ids.gtmActionId === "string" ? ids.gtmActionId : "";
    if (!joinKey) return;
    await recordOutcome(activeProjectId, { joinKey, outcomeKind: outcome.outcomeKind, value: outcome.value ?? null });
    refreshRunSummary();
  }, [activeProjectId, refreshRunSummary]);

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
  }, [graph, setGraph]);

  // `origin` distinguishes a genuine founder drag (undoable) from the automatic left-to-right relayout
  // the canvas pushes on every topology change (not undoable — it's layout, not a move the founder made).
  // Per-lane dragged positions on the merged (woven) canvas (docs/INTERTWINED-CANVAS.md scoped-in fix).
  // A drag on a NON-focused lane's node arrives namespaced `channelId::nodeId`; the focused `graph` isn't
  // its home, so we can't round-trip it through the graph store. We keep those drags here, keyed by the
  // namespaced id, and hand them to buildMergedFlowGraph so a live re-weave doesn't discard the manual drag.
  // Cleared per project open (openedWovenForProject also resets), so stale drags never haunt a new fleet.
  const [mergedDragOverrides, setMergedDragOverrides] = useState<Map<string, { x: number; y: number }>>(new Map());

  const handleNodePositionChange = useCallback((nodeId: string, position: { x: number; y: number }, origin?: "drag" | "layout") => {
    setGraphSavedAt(null);
    // A namespaced id is a merged-lane node; a drag on it persists in the per-lane override map (the focused
    // graph isn't its owner). Layout round-trips for the focused graph still flow through below.
    if (nodeId.includes("::")) {
      if (origin === "drag") {
        setMergedDragOverrides((cur) => { const next = new Map(cur); next.set(nodeId, position); return next; });
      }
      return;
    }
    if (origin === "drag" && graph) {
      const after: GTMGraph = { ...graph, nodes: graph.nodes.map((node) => node.id === nodeId ? { ...node, position } : node) };
      const label = describeGraphDiff(graph, after);
      if (label) {
        recordEdit(graph.id, { label, actor: { by: "you" }, before: graph, after });
        setChannelGraph(graph.id, after);
        return;
      }
    }
    setGraph((current) => current ? {
      ...current,
      nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, position } : node),
    } : current);
  }, [setGraph, graph, recordEdit, setChannelGraph]);

  const updateGraph = useCallback((next: GTMGraph) => {
    if (graph && graph.id === next.id) {
      const label = describeGraphDiff(graph, next);
      if (label) recordEdit(next.id, { label, actor: { by: "you" }, before: graph, after: next });
    }
    setGraph(next);
    setGraphSavedAt(null);
  }, [setGraph, graph, recordEdit]);

  // Undo / redo the working board. Restores the recorded snapshot directly into the active pipeline's
  // graph — this write bypasses the mutation handlers above, so an undo is never itself recorded as a
  // new edit. Structure only: runs, sends, and gate decisions are out of scope and untouched here.
  const handleUndoBoard = useCallback(() => {
    const edit = undoEdit(activeChannelId);
    if (!edit) return;
    setChannelGraph(edit.before.id, edit.before);
    setGraphSavedAt(null);
    setGraphError(null);
  }, [undoEdit, activeChannelId, setChannelGraph]);

  const handleRedoBoard = useCallback(() => {
    const edit = redoEdit(activeChannelId);
    if (!edit) return;
    setChannelGraph(edit.after.id, edit.after);
    setGraphSavedAt(null);
    setGraphError(null);
  }, [redoEdit, activeChannelId, setChannelGraph]);

  // Keyboard: ⌘Z / Ctrl+Z undoes the board, ⇧⌘Z / Ctrl+Shift+Z redoes. Only on the canvas, and never
  // when the founder is typing (a text field owns its own undo).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (view !== "canvas" || overlay) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      if (event.shiftKey) handleRedoBoard(); else handleUndoBoard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndoBoard, handleRedoBoard, view, overlay]);

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
    const before = graph; // snapshot BEFORE the await so undo restores exactly the pre-edit board
    try {
      const response = await applyGraphOperationsApi(before, operations);
      recordEdit(before.id, {
        label: describeOperations(operations, before),
        actor: { by: "you" },
        before,
        after: response.graph,
      });
      setGraph(response.graph);
      setGraphSavedAt(null);
      setGraphError(null);
      return response.graph;
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [graph, setGraph, recordEdit]);

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
  const handleAddNode = useCallback((spec: Partial<GTMNode> & { label: string }, opts?: { select?: boolean; position?: { x: number; y: number } }) => {
    // Whether landing the node also opens its editor. A node dropped onto the canvas (a teammate from
    // the rail) should land COLLAPSED and draggable — selecting it expands the in-card editor, which is
    // `nodrag`, so auto-selecting on drop is exactly why a just-dropped teammate couldn't be moved. The
    // founder drags it where they want, then clicks to configure. Palette adds still auto-select.
    const autoSelect = opts?.select ?? true;
    const base = spec.kind && spec.kind !== "tool" ? spec.kind : spec.category ?? "step";
    const newId = `${base}-${Date.now().toString(36)}`;
    const buildNode = (position: { x: number; y: number }) => ({
      id: newId, label: spec.label, position, config: spec.config ?? {}, contract: spec.contract,
      ...(spec.kind && spec.kind !== "tool"
        ? { kind: spec.kind, category: spec.category ?? "generate", ref: spec.ref ?? "" }
        : { category: spec.category ?? "source", connector: spec.connector ?? "manual" }),
    } as GTMNode);
    const isWorkbench = (kind?: string) => kind === "terminal" || kind === "query" || kind === "web";

    // No pipeline focused — the empty landing canvas or the multi-pipeline overview. Instead of
    // no-op'ing the drop, spin up a client-side scratch pipeline holding the dropped node, focus it in
    // Engineer mode, and select it. Now a founder can drop an agent and run it as a single step (the
    // in-card "Run step" posts this graph straight through /api/graph/run) without composing a pipeline
    // first. A dropped Crew agent is a generate node, not an execute node, so the gate wall stays intact.
    // Where the node lands: the exact canvas point the founder released the drag over (opts.position,
    // projected from the drop event), so a grabbed teammate/capability lands under the cursor — not
    // snapped to a fixed spot. Falls back to appending at the right of the graph when there's no drop
    // point (the click-to-add +Add gesture, or a projection that couldn't be computed).
    if (!graph) {
      const scratchId = `scratch-${Date.now().toString(36)}`;
      const scratchGraph: GTMGraph = { id: scratchId, name: "Scratch", version: "0", nodes: [buildNode(opts?.position ?? { x: 0, y: 0 })], edges: [] };
      setChannelGraph(scratchId, scratchGraph);
      setActiveChannelId(scratchId);
      setOverviewActive(false);
      if (autoSelect && !isWorkbench(spec.kind)) selectInGraph(newId, scratchId);
      return;
    }

    const fallback = { x: graph.nodes.reduce((maximum, node) => Math.max(maximum, node.position?.x ?? 0), 0) + 264, y: 0 };
    const node = buildNode(opts?.position ?? fallback);
    void applyOperations([{ type: "add_node", node }]).then((next) => {
      // Workbench surfaces (terminal/query/web) are used in place — don't yank open the node-detail
      // editor on drop. Other adds auto-select only when the caller asked (palette yes, canvas drop no).
      if (next && autoSelect && !isWorkbench(node.kind)) selectInGraph(newId, graph.id);
    });
  }, [applyOperations, graph, selectInGraph, setChannelGraph, setOverviewActive]);


  // Drag a Crew member or Skill from the left rail onto the canvas → add it as a pipeline step so the
  // founder watches it land. This handler acts ONLY on the step MIME, so any other drag passes straight
  // through untouched. If there is no active pipeline graph, handleAddNode no-ops and the drop is a
  // harmless miss.
  const onStepDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(STEP_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);
  const onStepDrop = useCallback((event: React.DragEvent) => {
    const raw = event.dataTransfer.getData(STEP_DRAG_MIME);
    if (!raw) return;
    event.preventDefault();
    // Land the node under the cursor. React Flow's drop projection isn't wired here (the drop target is
    // the outer canvas-area wrapper, above the flow), so read the flow's own viewport transform off the
    // DOM and invert it: the release point in screen space → the point in canvas space. Undefined when
    // no flow is mounted yet (empty canvas), where handleAddNode falls back to the origin / append.
    const position = flowPositionFromDrop(event);
    try {
      const payload = JSON.parse(raw) as StepDragPayload;
      // A capability lands as a stage step — its run-stage mapped to a graph category (find→source,
      // reach/publish→gated execute, …). A tool node keyed to the service; the founder wires it or asks
      // Claude. Like a teammate, it lands collapsed and draggable (select:false), never auto-opened.
      if (payload.kind === "capability") {
        const category = CAP_STAGE_CATEGORY[payload.stage] ?? "source";
        handleAddNode(
          { label: payload.name, category, connector: payload.id, ...(payload.gated ? { config: { gated: true } } : {}) },
          { select: false, position },
        );
        return;
      }
      const { kind, ref, label } = payload;
      if (!ref) return;
      // Land it collapsed and draggable — don't auto-open its editor. The founder places it, then
      // clicks to configure or talk to Claude about it.
      handleAddNode({ label: label || ref, kind, category: "generate", ref, contract: { accepts: [], emits: [] } }, { select: false, position });
    } catch { /* ignore malformed step payloads */ }
  }, [handleAddNode]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    void applyOperations([{ type: "remove_node", nodeId }]).then((next) => {
      if (next) setSelection(null);
    });
  }, [applyOperations]);

  const handleDeleteEdges = useCallback((edgeIds: string[]) => {
    if (!edgeIds.length) return;
    void applyOperations(edgeIds.map((edgeId) => ({ type: "disconnect_nodes", edgeId })));
  }, [applyOperations]);

  // Clicking the empty canvas dismisses whatever's open — the in-card editor, the agent profile
  // sheet, the Problems/Approvals popovers, the artifact editor. One gesture clears the surface so
  // the canvas is never left cluttered behind a thing you've moved on from.
  const dismissOverlays = useCallback(() => {
    setSelection(null);
    setAgentProfileRef(null);
    setProblemsOpen(false);
    setArtifactEdit(null);
  }, []);

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
    // Bind the new session to the channel graph on screen so its tools target that graph — UNLESS that
    // graph is an unsaved client-side scratch pipeline (a drop-and-run canvas the server has no record
    // of). Binding to it would fail the operator's flow lookup, so a scratch graph drives as an unbound
    // fresh composition instead: talking to Claude composes a real, persisted pipeline for the product.
    const isScratch = !!graph?.id?.startsWith("scratch-");
    const boundGraphId = fresh || isScratch ? undefined : graph?.id;
    const response = await createOperatorSession(projectId, goal, boundGraphId, fresh || isScratch);
    operatorGraphRevision.current = response.session.graphRevision;
    operatorRunId.current = null;
    setOperatorSession(response.session);
    void refreshRoster(); // a fresh pipeline gets its tab in the strip immediately
  }, [graph?.id, refreshRoster]);

  // One conversation: talking to Claude continues the live session, or starts a new one
  // when idle. The dock decides nothing about safety — App owns create vs. resume.
  const handleComposerSend = useCallback(async (text: string, hints?: OperatorHints): Promise<ComposerTurnResult | void> => {
    // Chat drives the canvas: a bare navigation command ("go to the gate") moves the camera and never
    // reaches Claude — it was steering, not a question. Anything else falls through to the operator.
    if (composerPosture !== "ideate" && runCanvasCommand(text)) return;
    // In the ideate posture, frame the turn so Claude THINKS WITH the founder — challenges
    // assumptions, gets clear — instead of eagerly composing a channel. Building stays a separate,
    // deliberate move. The framing rides on the message; the build posture sends the text as-is.
    // The canvas subject rides on the turn as plain context so "make this shorter" / "why is this empty"
    // resolves to the real node the founder is looking at, then clears — one turn, not a sticky mode.
    const withSubject = composerSubject
      ? `[The founder is pointing at the "${composerSubject.label}" ${composerSubject.kind} step on the canvas — treat "this / it / that" as that step.]\n\n${text}`
      : text;
    if (composerSubject) setComposerSubject(null);
    const framed = composerPosture === "ideate"
      ? `[Ideate posture — think and discuss this with me: challenge my assumptions, surface what you know, help me get clear on the go-to-market. Do NOT compose or build a pipeline/workflow yet — this is thinking, not building.]\n\n${withSubject}`
      : withSubject;
    const s = operatorSession;
    const projectId = s ? operatorProjectId(s) : (activeProjectIdRef.current ?? undefined);
    // Mid-run steer: while the crew is RUNNING or paused at the gate, the founder can still redirect them —
    // "focus on the enterprise segment", "drop the third draft" — without waiting for the run to finish and
    // without releasing anything. The message goes to the steer endpoint (never resume, never the gate), the
    // session syncs, and the crew adjusts course. Nothing sends. If the backend hasn't wired the steer
    // endpoint yet, this throws and the message surfaces an error rather than silently vanishing.
    if (s && (s.status === "running" || s.status === "waiting_for_gate")) {
      const response = await steerOperatorSession(s.id, operatorProjectId(s), framed, hints);
      syncOperator(response.session);
      return;
    }
    // A pending "New channel" intent must compose fresh, never resume the prior conversation.
    const resumable = !freshPipelineIntent.current && s && ["waiting_for_input", "interrupted", "failed"].includes(s.status);
    // Build posture routes through the intent-routed turn first: status/explain get a FAST answer with NO
    // session touched (the dock renders it inline); act/run with a resumable session are resumed server-side
    // (delegation) and synced once; act/run without one return drive+null and fall through to the untouched
    // create path below. Ideate posture always skips the fast lane so ideate conversations are unchanged.
    // A fresh-pipeline intent (the goal launcher / "new pipeline") ALSO skips this — otherwise the goal gets
    // intent-routed against the leftover session's id and swallowed as a "fast" answer, never composing.
    if (composerPosture !== "ideate" && !freshPipelineIntent.current) {
      const turn = await composerTurn({ projectId, sessionId: s?.id, input: framed, hints, allowDrive: !!(resumable && s) });
      if (turn.mode === "fast") return turn;
      if (turn.mode === "drive" && turn.session) { syncOperator(turn.session); return turn; }
    }
    if (resumable && s) {
      // The founder's @-mentioned crew rides along as advisory hints — composition prefers the named
      // teammates & capabilities, never a contract, never blocking (the backend folds it into context).
      const response = await resumeOperatorSession(s.id, operatorProjectId(s), framed, hints);
      syncOperator(response.session);
    } else {
      await handleCommandSubmit(framed);
    }
  }, [operatorSession, handleCommandSubmit, syncOperator, composerPosture, composerSubject, runCanvasCommand]);

  // Drag-to-wire-object (docs/INTERTWINED-CANVAS.md §4): dragging from a step onto an object chip or a kind
  // region is a STEER, never a literal targeting edge. The founder is saying "this motion should also cover
  // that person / place / this whole kind." We route it to the crew as a plain-words composer message scoped
  // to the source pipeline; the composer proposes the real steps and they render as dashed ghost nodes/ties
  // on that lane (the existing proposal path), which the founder accepts in place. The gate still stands in
  // front of anything it produces — this only proposes, it never sends.
  const handleWireObject = useCallback((sourceStepId: string, targetId: string) => {
    const channelId = sourceStepId.includes("::") ? sourceStepId.split("::")[0] : (activeChannelId ?? sourceStepId);
    // Focus the pipeline so the proposal lands where the founder is looking, then steer the crew.
    if (channelId) focusChannel(channelId);
    let ask: string;
    if (targetId.startsWith("obj:")) {
      const key = targetId.slice(4);
      const obj = operatingView?.objects.find((o) => o.objectKey === key);
      const name = obj?.label ?? key;
      ask = `Extend this motion to also cover ${name}${obj?.kind ? ` (a ${obj.kind})` : ""}. Propose the steps that would reach it, stopping at my gate — don't send anything.`;
    } else if (targetId.startsWith("kind:")) {
      const motionKind = targetId.slice(5);
      ask = `Extend this motion to also cover the ${motionKind} objects it doesn't touch yet. Propose the steps that would reach them, stopping at my gate — don't send anything.`;
    } else {
      return;
    }
    void handleComposerSend(ask);
  }, [activeChannelId, focusChannel, operatingView, handleComposerSend]);

  const handleProjectOpen = useCallback(async (projectId: string) => {
    setProjectBusy(true);
    setGraphError(null);
    try {
      await activateProject(projectId);
      setOperatorSession(null);
      setChannelGraphs(new Map());
      setMergedDragOverrides(new Map());
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

  // Act on a pending decision from the inbox: jump the founder to where they actually decide it. This
  // never decides anything itself — it opens the owning product (if it isn't already active), which the
  // session-restore effect follows by surfacing the paused session on its real surface (the gate bloom,
  // the ghost proposal, the ideate pause). A signal opens the inbox card in that product. The decision
  // still happens on the existing gate / review surface, unchanged.
  const openDecision = useCallback(async (d: PendingDecision) => {
    setDecisionsOpen(false);
    if (d.projectId && d.projectId !== activeProjectId) {
      await handleProjectOpen(d.projectId);
    }
    if (d.kind === "signal") summonView("inbox");
    void refreshPendingInbox();
  }, [activeProjectId, handleProjectOpen, summonView, refreshPendingInbox]);

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
    setOperatorSession(null);
    setComposerFocus((n) => n + 1);
  }, []);

  // Switch the active conversation to another pipeline's tab: load that session's full detail, make it
  // the one on screen, and FOLLOW it to its own pipeline graph on the canvas (so the tab and the board
  // agree). Best-effort on the graph — a session bound to a scratch/removed graph just switches the
  // conversation and leaves the canvas as-is. Never a create: this only moves between existing sessions.
  const switchSession = useCallback(async (id: string) => {
    const projectId = activeProjectIdRef.current;
    if (!id || id === operatorSession?.id) return;
    try {
      const response = await getOperatorSession(id, projectId ?? undefined);
      const next = humanizeOperatorSession(response.session);
      freshPipelineIntent.current = false; // a switch is not a "new pipeline" intent
      operatorGraphRevision.current = response.session.graphRevision;
      operatorRunId.current = null;
      setOperatorSession(next);
      const gid = response.session.graphId;
      if (gid && !gid.startsWith("scratch-")) {
        try { await loadChannel(gid); } catch { /* graph may be gone — keep the current canvas */ }
      }
    } catch { /* the switch failed (session gone / scope mismatch) — stay on the current conversation */ }
  }, [operatorSession?.id, loadChannel]);

  // The Operator lens keys a lane by its graphId (the touch ledger's motionId is the graphId, so lanes,
  // efficiency rows, and object ties all join on it). The canvas navigation, though, is keyed by the
  // channel's own id. This resolves a lane's graphId back to the channel.id the canvas focuses on; it
  // falls through to the value itself for a lane that already carries a plain id.
  const channelIdForLane = useCallback((laneChannelId: string) => {
    const match = channels.find((c) => c.graphId === laneChannelId || c.id === laneChannelId);
    return match?.id ?? laneChannelId;
  }, [channels]);

  // Operator lens → the real gate. A parked lane routes one click here: switch to the parked run's
  // session (so its staged items and gate bloom are the ones on screen), then fly the canvas to that
  // lane and drop into the Engineer lens where the gate review lives. Never approves or sends — it only
  // navigates to the founder's real decision.
  const flyToGate = useCallback(async (target: { decisionId: string; sessionId: string | null; pipelineId: string | null; channelId: string }) => {
    if (target.sessionId) await switchSession(target.sessionId);
    focusChannel(channelIdForLane(target.channelId));
    setCanvasLens("engineer");
  }, [switchSession, focusChannel, channelIdForLane]);

  // Operator lens → open a lane's pipeline in the single-motion editor (a quiet route off a tie or a
  // lane, never forced). Focus the pipeline and switch to the Engineer lens.
  const openLane = useCallback((laneChannelId: string) => {
    focusChannel(channelIdForLane(laneChannelId));
    setCanvasLens("engineer");
  }, [focusChannel, channelIdForLane]);

  const handleProjectCreate = useCallback(async (input: { name?: string; repoPath: string; outcome: string }) => {
    setProjectBusy(true);
    setGraphError(null);
    try {
      await createProject(input);
      setOperatorSession(null);
      setChannelGraphs(new Map());
      setMergedDragOverrides(new Map());
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
      setChannelGraphs(new Map());
      setMergedDragOverrides(new Map());
      setActiveChannelId(null);
      const project = await refreshProjectScope();
      setView("canvas");
      // The goal is now optional at the front door. When the founder gave one, hand it to the operator —
      // it inspects the freshly-scanned product and composes the system, so the stranger watches their OWN
      // loop build (bound to the just-created project explicitly, the composer's project lock). When they
      // DIDN'T, we ground and stop: the founder lands on the canvas and its goal launcher asks them there,
      // so nobody is forced to converge on a goal before they've looked around.
      if (input.goal.trim()) {
        const response = await createOperatorSession(project.id, input.goal);
        operatorGraphRevision.current = response.session.graphRevision;
        operatorRunId.current = null;
        setOperatorSession(response.session);
      }
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

  // Stop a running pipeline BY ID (not just the active one). Routes through the exact authorized cancel
  // path handleOperatorCancel uses — cancel ABANDONS a run (discarding any pending gate WITHOUT sending),
  // it never releases. If the stopped thread is the one on screen, sync it so the conversation reflects
  // the cancel; then refresh the roster so every tab's dot re-derives and the stopped one drops out.
  const handleSessionStop = useCallback(async (id: string) => {
    const row = rosterForDock.find((s) => s.id === id);
    const projectId = row?.projectId ?? activeProjectIdRef.current ?? "";
    const { session } = await cancelOperatorSession(id, projectId);
    if (id === operatorSession?.id) syncOperator(session);
    await refreshRoster();
  }, [rosterForDock, operatorSession, syncOperator, refreshRoster]);

  // Close a pipeline's tab — a client-side dismissal (no backend delete; the pipeline stays alive). If the
  // thread is still running or holds a pending gate, ChatTabs already required a two-tap confirm before
  // calling this, so here we STOP it (never leave a run that could still send in the background) and then
  // hide it. Closing the ACTIVE tab first falls the founder onto the next live tab (or the empty state).
  const handleSessionClose = useCallback((id: string) => {
    const row = rosterForDock.find((s) => s.id === id);
    // "working" in chat-tab terms — a live run. (waiting_for_* is "needs", already stopped, so it only
    // needs dismissing, not cancelling.) Keep this in sync with ComposerDock's chatTabState.
    const running = row?.status === "running" || row?.status === "ready";
    if (running) void handleSessionStop(id);
    setDismissedTabs((prev) => new Set(prev).add(id));
    if (id === operatorSession?.id) {
      const next = rosterForDock.find((s) => s.id !== id && !dismissedTabs.has(s.id));
      if (next) void switchSession(next.id);
      else handleNewChannel();
    }
  }, [rosterForDock, operatorSession, dismissedTabs, handleSessionStop, switchSession, handleNewChannel]);

  // Derived
  // `selection` may be a bare node id (the focused graph, single-channel behavior) or a merged-canvas
  // `channelId::nodeId` — resolve against that node's REAL owning graph either way, not just `graph`,
  // so a click doesn't have to wait a render for `activeChannelId` to catch up.
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
    selectInGraph(nodeId);
    setProblemsOpen(false);
  }, [selectInGraph]);

  const runCount = graph?.store?.runs ?? flowRuns.length;

  // ── The founder gate, surfaced on the canvas ─────────────────────────────
  // The gate now blooms in place on the canvas (GraphCanvas → GateReview) instead of a side panel. The
  // needs-you routing strip retired too: the L0 ground shows a "need you" pill on each pipeline that
  // has work at its gate, so the founder is routed by the objects themselves.

  // The channel whose gate the canvas is reviewing — the autonomy ladder hangs off it. Falls back to
  // the operator's bound channel when no single channel is focused.
  const gateChannel = useMemo<ChannelMeta | null>(
    () => channels.find((c) => c.id === activeChannelId) ?? boundChannel ?? null,
    [channels, activeChannelId, boundChannel],
  );

  // Promote-by-Replay evidence: the founder's real recent gate calls on the focused pipeline, replayed
  // on the gate before they hold to promote it up the autonomy ladder. Sourced from the live decision
  // map for the gate nodes in the run on screen (the current graph is the focused channel's, so its
  // recorded ✓/✕ ARE this pipeline's founder decisions); the subject is recovered from the run's staged
  // item when it still holds it, else omitted. Oldest→newest by decision order, capped at a dozen.
  // Empty when the founder hasn't decided any by hand yet — the gate then offers only revoke.
  const gateReplayDecisions = useMemo<GateReplayDecision[]>(() => {
    if (!gateChannel) return [];
    const graphNodeIds = new Set((graph?.nodes ?? []).map((n) => n.id));
    const out: GateReplayDecision[] = [];
    for (const [nodeId, perItem] of Object.entries(decisions)) {
      if (!graphNodeIds.has(nodeId) || !perItem) continue;
      const items = runResult?.nodes[nodeId]?.items ?? [];
      for (const [key, d] of Object.entries(perItem)) {
        // A "refine" is a rework routed to the crew, not an approve/reject — it never banks as a
        // replay-able pattern decision for the autonomy ladder.
        if (!d?.decision || d.decision === "refine") continue;
        const idx = items.findIndex((it, i) => itemKey(it, i) === key);
        out.push(idx >= 0 ? { decision: d.decision, subject: gateItemView(items[idx]).subject } : { decision: d.decision });
      }
    }
    return out.slice(-12);
  }, [gateChannel, graph, runResult, decisions]);

  // Promote / revoke the focused channel's autonomy — explicit founder acts. Both refresh project scope
  // so the ladder, the gate, and the channel meta re-read from durable state.
  const handlePromoteChannel = useCallback(async (level: "trusted" | "autonomous", note: string) => {
    if (!activeProjectId || !gateChannel) return;
    await promoteChannel(activeProjectId, gateChannel.id, { autonomy: level, blessedPattern: { note } });
    await refreshProjectScope();
  }, [activeProjectId, gateChannel, refreshProjectScope]);
  const handleRevokeChannel = useCallback(async () => {
    if (!activeProjectId || !gateChannel) return;
    await revokeChannel(activeProjectId, gateChannel.id);
    await refreshProjectScope();
  }, [activeProjectId, gateChannel, refreshProjectScope]);

  // Everything the on-canvas gate needs to run the promote/revoke gesture in place, bound to the
  // focused pipeline. Absent when no pipeline is focused — the gate then shows no promote affordance.
  const gatePromote = useMemo<GatePromote | undefined>(
    () => gateChannel
      ? { channel: gateChannel, canRelease: canReleaseGate, replayDecisions: gateReplayDecisions, onPromote: handlePromoteChannel, onRevoke: handleRevokeChannel }
      : undefined,
    [gateChannel, canReleaseGate, gateReplayDecisions, handlePromoteChannel, handleRevokeChannel],
  );

  // The deal the focused pipeline's staged work carries, shown on the gate's inline review: the
  // pipeline's own offer statement (plus any extra fields the composer attached), else the project's
  // standing offer as the default. Null when neither states one — the gate then shows no deal line.
  const gateOffer = useMemo<string | null>(() => {
    const own = channelOfferLine(gateChannel);
    if (own) return own;
    const shared = activeProject?.sharedContext?.offer;
    const parts = [shared?.price, shared?.unit, shared?.terms].map((v) => String(v ?? "").trim()).filter(Boolean);
    return parts.length ? parts.join(" / ") : null;
  }, [gateChannel, activeProject]);

  // The microproduct build door — a goal cuts a working artifact that STAGES behind the founder gate
  // (pause:true). Nothing deploys; the live ship happens only at the gate. Held in App state so the
  // summon card can show the staged face after composing.
  const [microproduct, setMicroproduct] = useState<Microproduct | null>(null);
  const [microproductGoal, setMicroproductGoal] = useState("");
  const [microproductBusy, setMicroproductBusy] = useState(false);
  const [microproductError, setMicroproductError] = useState<string | null>(null);
  const handleComposeMicroproduct = useCallback(async () => {
    if (!activeProjectId || !microproductGoal.trim() || microproductBusy) return;
    setMicroproductBusy(true);
    setMicroproductError(null);
    try {
      const r = await composeMicroproduct(activeProjectId, { goal: microproductGoal.trim() });
      // Thread the built preview off the staged gate item so the face shows the real page, not a
      // placeholder. The deploy graph always pauses at the founder gate, so this lands `staged`.
      const staged = extractMicroproductPreview(r.staged);
      setMicroproduct({
        id: r.session.id,
        name: staged?.name ?? microproductGoal.trim(),
        state: r.pause ? "staged" : "built",
        summary: staged?.summary ?? r.session.summary ?? null,
        previewHtml: staged?.previewHtml ?? null,
      });
    } catch (err) {
      setMicroproductError(err instanceof Error ? err.message : String(err));
    } finally {
      setMicroproductBusy(false);
    }
  }, [activeProjectId, microproductGoal, microproductBusy]);

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

  // ── Client-staged ghosts (slice 4): Claude's proposed canvas edits, held translucent until the ──
  // founder accepts each in place. Distinct from the operator's all-or-nothing `pendingProposal` above:
  // these are per-item, resolve without a backend round-trip, and carry `proposed: true` on the node/edge
  // itself (added only in the display merge). The operator path owns the ghost layer whenever it holds a
  // live proposal, so this stays dormant while `proposalActive`.
  const [stagedGhosts, setStagedGhosts] = useState<{ nodes: GTMNode[]; edges: GTMEdge[] } | null>(null);
  // Strip the transient ghost marker so a committed node/edge lands clean in the durable graph.
  const stripProposed = <T extends { proposed?: boolean }>(obj: T): T => {
    const copy = { ...obj };
    delete copy.proposed;
    return copy;
  };
  // Ghosts only make sense against the pipeline they were staged for; drop them if the founder navigates
  // to a different graph so they never render on the wrong canvas.
  const stagedGhostGraphId = useRef<string | null>(null);
  useEffect(() => {
    if (stagedGhosts && graph && stagedGhostGraphId.current && stagedGhostGraphId.current !== graph.id) {
      setStagedGhosts(null);
      stagedGhostGraphId.current = null;
    }
  }, [graph, stagedGhosts]);

  const ghostsLive = !proposalActive && !!graph && !!stagedGhosts && (stagedGhosts.nodes.length > 0 || stagedGhosts.edges.length > 0);
  const stagedGhostGraph = useMemo<GTMGraph | null>(() => {
    if (!ghostsLive || !graph || !stagedGhosts) return null;
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const edgeIds = new Set(graph.edges.map((e) => e.id));
    const ghostNodes = stagedGhosts.nodes.filter((n) => !nodeIds.has(n.id)).map((n) => ({ ...n, proposed: true }));
    const ghostEdges = stagedGhosts.edges.filter((e) => !edgeIds.has(e.id)).map((e) => ({ ...e, proposed: true }));
    return { ...graph, nodes: [...graph.nodes, ...ghostNodes], edges: [...graph.edges, ...ghostEdges] };
  }, [ghostsLive, graph, stagedGhosts]);

  // ── Pick-to-canvas assembling (felt-speed) ──────────────────────────────────────────────────────────
  // When the founder picks a candidate shape its nodes are ALREADY known, so we draw them onto the canvas
  // immediately as a translucent preview that reveals one node at a time — the founder watches their chosen
  // system take shape while the real build runs server-side, instead of a spinner then a pop at the gate.
  // Display-only: the pick already chose, so there are no per-node accept chips (proposalActive is false and
  // no ghostResolve is registered, so neither the proposal pill nor the ghost controls render). Honest —
  // every node shown is a node the picked shape defines. Cleared the instant the real built graph lands.
  const [assembling, setAssembling] = useState<{ nodes: GTMNode[]; edges: GTMEdge[]; key: string; baseGraphId: string | null } | null>(null);
  const assemblingGraph = useMemo<GTMGraph | null>(() => {
    if (!assembling) return null;
    const laid = layoutAssemblingShape(assembling.nodes, assembling.edges);
    return {
      id: "__assembling__",
      name: "Building…",
      version: "0",
      nodes: laid.map((n) => ({ ...n, proposed: true })),
      edges: assembling.edges.map((e) => ({ ...e, proposed: true })),
    };
  }, [assembling]);
  const assemblingOrder = useMemo(() => (assemblingGraph ? assemblingGraph.nodes.map((n) => n.id) : []), [assemblingGraph]);
  const [assemblingRevealCount, setAssemblingRevealCount] = useState(0);
  useEffect(() => {
    // Same staged reveal as the proposal path: surface the shape one node at a time so it visibly builds.
    if (!assembling || assemblingOrder.length <= 1) { setAssemblingRevealCount(assemblingOrder.length); return; }
    setAssemblingRevealCount(0);
    let count = 0;
    let timer = window.setTimeout(function tick() {
      count += 1;
      setAssemblingRevealCount(count);
      if (count < assemblingOrder.length) timer = window.setTimeout(tick, 220);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [assembling, assemblingOrder.length]);
  // Drop the preview the moment the real built pipeline is on the canvas — a graph whose id matches the
  // session's re-pointed graphId AND differs from whatever was focused when we started assembling (so a
  // rebuild on the already-active pipeline can't clear it before the new work lands). Swaps with no flash.
  useEffect(() => {
    if (assembling && graph && operatorSession?.graphId
      && graph.id === operatorSession.graphId && graph.id !== assembling.baseGraphId) {
      setAssembling(null);
    }
  }, [assembling, graph, operatorSession?.graphId]);
  // Safety: never let a preview stick if the build errors out without ever landing a matching graph.
  useEffect(() => {
    if (!assembling) return;
    const t = window.setTimeout(() => setAssembling(null), 25000);
    return () => window.clearTimeout(t);
  }, [assembling]);

  const displayGraph = proposalActive && pendingProposal
    ? pendingProposal.preview
    : (assemblingGraph ?? stagedGhostGraph ?? graph);

  // Stage a proposal onto the canvas as ghosts. THIS is the composer/Claude hook: when Claude proposes a
  // graph edit, it calls this with the new nodes/edges and the founder resolves them in place.
  // TODO(composer): wire ComposerDock / the operator so a "propose these steps" turn calls this directly
  // (today it's reachable through the window bridge below and the operator's own pendingProposal path).
  const stageGhostProposal = useCallback((nodes: GTMNode[], edges: GTMEdge[] = []) => {
    if ((!nodes || nodes.length === 0) && (!edges || edges.length === 0)) return;
    stagedGhostGraphId.current = graph?.id ?? null;
    setStagedGhosts((prev) => ({
      nodes: [...(prev?.nodes ?? []), ...(nodes ?? [])],
      edges: [...(prev?.edges ?? []), ...(edges ?? [])],
    }));
  }, [graph]);

  const acceptGhostNode = useCallback((nodeId: string) => {
    setStagedGhosts((prev) => {
      if (!prev) return prev;
      const node = prev.nodes.find((n) => n.id === nodeId);
      if (!node) return prev;
      const remainingNodes = prev.nodes.filter((n) => n.id !== nodeId);
      const stillGhost = new Set(remainingNodes.map((n) => n.id));
      // Commit this node plus any staged edge whose BOTH endpoints are now real (this node + the graph).
      const commitEdges = prev.edges.filter(
        (e) => (e.source === nodeId || e.target === nodeId) && !stillGhost.has(e.source) && !stillGhost.has(e.target),
      );
      const commitEdgeIds = new Set(commitEdges.map((e) => e.id));
      const remainingEdges = prev.edges.filter((e) => !commitEdgeIds.has(e.id));
      // Commit clean, real objects — the ghost `proposed` marker never lands in the durable graph.
      const ops: GraphOperation[] = [
        { type: "add_node", node: stripProposed(node) },
        ...commitEdges.map((edge) => ({ type: "connect_nodes", edge: stripProposed(edge) } as GraphOperation)),
      ];
      void applyOperations(ops);
      return remainingNodes.length || remainingEdges.length ? { nodes: remainingNodes, edges: remainingEdges } : null;
    });
  }, [applyOperations]);

  const rejectGhostNode = useCallback((nodeId: string) => {
    setStagedGhosts((prev) => {
      if (!prev) return prev;
      const nodes = prev.nodes.filter((n) => n.id !== nodeId);
      // Drop edges dangling off the discarded node too — they can never become real without it.
      const edges = prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      return nodes.length || edges.length ? { nodes, edges } : null;
    });
  }, []);

  const acceptGhostEdge = useCallback((edgeId: string) => {
    setStagedGhosts((prev) => {
      if (!prev) return prev;
      const staged = prev.edges.find((e) => e.id === edgeId);
      if (!staged) return prev;
      void applyOperations([{ type: "connect_nodes", edge: stripProposed(staged) }]);
      const edges = prev.edges.filter((e) => e.id !== edgeId);
      return prev.nodes.length || edges.length ? { nodes: prev.nodes, edges } : null;
    });
  }, [applyOperations]);

  const rejectGhostEdge = useCallback((edgeId: string) => {
    setStagedGhosts((prev) => {
      if (!prev) return prev;
      const edges = prev.edges.filter((e) => e.id !== edgeId);
      return prev.nodes.length || edges.length ? { nodes: prev.nodes, edges } : null;
    });
  }, []);

  // Publish the resolve handlers + the live staged sets to the canvas's ghost controls (a module store,
  // so no new prop threads through GtmCanvas). Cleared when nothing is staged.
  useEffect(() => {
    if (!ghostsLive || !stagedGhosts) {
      setGhostResolve(null);
      return;
    }
    setGhostResolve({
      acceptNode: acceptGhostNode,
      rejectNode: rejectGhostNode,
      acceptEdge: acceptGhostEdge,
      rejectEdge: rejectGhostEdge,
      stagedNodeIds: new Set(stagedGhosts.nodes.map((n) => n.id)),
      stagedEdgeIds: new Set(stagedGhosts.edges.map((e) => e.id)),
    });
    return () => setGhostResolve(null);
  }, [ghostsLive, stagedGhosts, acceptGhostNode, rejectGhostNode, acceptGhostEdge, rejectGhostEdge]);

  // Window bridge — the minimal, demonstrable composer seam until ComposerDock is wired. Claude (or a
  // quick manual test) calls window.__droverStageGhosts(nodes, edges) to preview a graph edit as ghosts.
  useEffect(() => {
    (window as unknown as { __droverStageGhosts?: (n: GTMNode[], e?: GTMEdge[]) => void }).__droverStageGhosts = stageGhostProposal;
    return () => { delete (window as unknown as { __droverStageGhosts?: unknown }).__droverStageGhosts; };
  }, [stageGhostProposal]);

  const proposedNodeIds = useMemo(() => {
    // The assembling preview is entirely proposed — every node draws translucent while it builds in.
    if (assemblingGraph) return new Set(assemblingGraph.nodes.map((node) => node.id));
    if (proposalActive && pendingProposal && graph) {
      const current = new Set(graph.nodes.map((node) => node.id));
      return new Set(pendingProposal.preview.nodes.filter((node) => !current.has(node.id)).map((node) => node.id));
    }
    // Client-staged ghosts get the same dashed "loop-node-proposed" styling via this set; the per-item
    // accept/reject rides the module store, not this all-or-nothing operator path.
    if (ghostsLive && stagedGhosts) return new Set(stagedGhosts.nodes.map((node) => node.id));
    return undefined;
  }, [assemblingGraph, proposalActive, pendingProposal, graph, ghostsLive, stagedGhosts]);
  const proposedEdgeIds = useMemo(() => {
    if (assemblingGraph) return new Set(assemblingGraph.edges.map((edge) => edge.id));
    if (proposalActive && pendingProposal && graph) {
      const current = new Set(graph.edges.map((edge) => edge.id));
      return new Set(pendingProposal.preview.edges.filter((edge) => !current.has(edge.id)).map((edge) => edge.id));
    }
    if (ghostsLive && stagedGhosts) return new Set(stagedGhosts.edges.map((edge) => edge.id));
    return undefined;
  }, [assemblingGraph, proposalActive, pendingProposal, graph, ghostsLive, stagedGhosts]);

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
    if (proposalActive && proposalRevealOrder.length > 0 && revealCount < proposalRevealOrder.length) {
      return new Set(proposalRevealOrder.slice(0, revealCount));
    }
    // The assembling preview reveals on the same staged cadence — hold back the not-yet-surfaced nodes.
    if (assemblingOrder.length > 0 && assemblingRevealCount < assemblingOrder.length) {
      return new Set(assemblingOrder.slice(0, assemblingRevealCount));
    }
    return undefined;
  }, [proposalActive, proposalRevealOrder, revealCount, assemblingOrder, assemblingRevealCount]);

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

  // The founder resolves an ideate pause: build the strong ideas, kill the weak ones. A founder act —
  // the operator generated and graded the ideas but never decides which become work. Building resumes
  // the operator to compose+run each pick (wired back to its idea); killing teaches the next round.
  // The founder picks one of the candidate pipeline shapes an ambiguous goal produced. The pick is the
  // founder act — it resumes the operator to build that one shape through compose_and_run, still
  // stopping at the founder gate. Nothing ran until this call.
  const resolveCandidatesAndSync = useCallback(async (pick: string, shape?: { nodes: GTMNode[]; edges: GTMEdge[] }) => {
    if (!operatorSession) return;
    // The picked shape is already in hand — draw it onto the canvas now so the founder watches it assemble
    // through the build, instead of a spinner. Cleared when the real built graph lands (or on error).
    if (shape && shape.nodes.length) setAssembling({ nodes: shape.nodes, edges: shape.edges ?? [], key: pick, baseGraphId: graph?.id ?? null });
    try {
      // The build runs on the SAME authorized path (resolveOperatorCandidates → compose_and_run →
      // executeGraphRun, pausing at the founder gate — nothing sends). What WI-C changes is only where
      // the founder LANDS: the picked candidate builds into its own pipeline graph, so we surface it as
      // its own chat thread instead of silently swapping the graph under the current one. Because the
      // resolve reuses this session id and re-points its graphId to the built pipeline, "the thread I was
      // picking in" simply becomes "the pipeline I built" — we refresh the roster so it reads as a real
      // tab, reset the switch-intent refs (mirroring switchSession — a focus, never a new-pipeline
      // intent), then let syncOperator load the built graph and follow it onto the canvas.
      const built = (await resolveOperatorCandidates(operatorSession.id, operatorProjectId(operatorSession), pick)).session;
      await refreshRoster(); // the built pipeline lands as a real row alongside any other live threads
      freshPipelineIntent.current = false;
      operatorRunId.current = null;
      syncOperator(built);
    } catch (error) {
      setAssembling(null); // the build failed — drop the preview rather than leave it hanging
      setGraphError(error instanceof Error ? error.message : String(error));
    }
  }, [operatorSession, syncOperator, refreshRoster, graph]);

  // Redirect mid-run from the cold-start watch surface: nudge the crew's course without stopping and
  // starting over. Routes through the steer path (never a resume, never a release — nothing crosses the
  // wall); the session syncs and the crew adjusts on its next turn.
  const handleDriveSteer = useCallback(async (note: string) => {
    const s = operatorSession;
    if (!s) return;
    try {
      const response = await steerOperatorSession(s.id, operatorProjectId(s), note);
      syncOperator(response.session);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error));
    }
  }, [operatorSession, syncOperator]);

  // The live operator presence: Claude's cursor travels the canvas as it stages each node (camera
  // following), then rests on the lead ghost where the ✓/✕/note sits. Once the pipeline is composed
  // and actually EXECUTING, the same cursor follows runningNodeId step by step — without this the
  // founder watches the chat narrate "Running X" with nothing visibly happening on the canvas. When a
  // run pauses at the founder gate, the cursor points there instead. Null when there's no operator
  // work on screen at all.
  const operatorCursor = useMemo<OperatorCursorState | null>(() => {
    if (proposalActive && proposalRevealOrder.length) {
      return {
        phase: revealCount < proposalRevealOrder.length ? "build" : "rest",
        revealOrder: proposalRevealOrder,
        revealCount,
        staged: proposalRevealOrder.length,
      };
    }
    if (graphRunning && runningNodeId) {
      return { phase: "run", revealOrder: [runningNodeId], revealCount: 1, staged: 0 };
    }
    if (operatorSession?.status === "waiting_for_gate" && operatorSession.pendingGate?.nodeIds?.length) {
      return { phase: "gate", revealOrder: [], revealCount: 0, staged: 0, gateNodeId: operatorSession.pendingGate.nodeIds[0] };
    }
    return null;
  }, [proposalActive, proposalRevealOrder, revealCount, graphRunning, runningNodeId, operatorSession?.status, operatorSession?.pendingGate]);

  // The live per-node narrator: the crew's own first-person heartbeat ("teammate_said" beats), keyed by
  // the node it was narrating. A running step then shows what its teammate is actually doing RIGHT NOW,
  // in the model's words, instead of an anonymous spinner. Latest beat per node wins (a later beat
  // supersedes an earlier one on the same step). Render-if-present: a beat without a nodeId is skipped,
  // and when the backend stamps none the map is empty and the card falls back to the plain spinner.
  const nodeBeats = useMemo<Record<string, string>>(() => {
    const events = operatorSession?.events ?? [];
    const out: Record<string, string> = {};
    for (const ev of events) {
      if (ev.type !== "teammate_said") continue;
      const nodeId = (ev.data as { nodeId?: unknown } | null)?.nodeId;
      if (typeof nodeId !== "string" || !nodeId) continue;
      const beat = (ev.detail ?? ev.title ?? "").trim();
      if (beat) out[nodeId] = beat; // events are chronological, so the last write is the newest beat
    }
    return out;
  }, [operatorSession?.events]);

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
    if (operatorFocusNodeId) selectInGraph(operatorFocusNodeId, operatorSession?.graphId ?? null);
  }, [operatorFocusNodeId, operatorSession?.graphId, selectInGraph]);

  // The GTM canvas model — one bag the GtmCanvas projects through its lenses. channel-flow reads the
  // graph/run/proposal/handler half; the engine overview reads the channels + the shared ICP/claim half.
  // Both the single-channel mount and the overview mount pass this same model; only the default lens
  // differs. `graph` is null in overview (no channel focused), which lands channel-flow on its empty
  // state until a tile is clicked.
  // The canvas click handler. On the merged canvas the id React Flow hands back is namespaced
  // `channelId::nodeId` (buildMergedFlowGraph) — the ONE place that unpacks it: snap focus to that
  // node's real owning pipeline (so every existing "act on the focused graph" handler above resolves
  // against the right channel), then store the id VERBATIM as selection, because NodeFocuser's
  // camera-center (`useReactFlow().getNode(selection)`) looks nodes up by that same rendered id.
  const handleCanvasSelect = useCallback((id: string) => {
    const sep = id.indexOf("::");
    if (sep !== -1) {
      const channelId = id.slice(0, sep);
      if (channelId !== activeChannelId) setActiveChannelId(channelId);
    }
    setSelection(id);
  }, [activeChannelId]);

  // The founder chose the node-flow diagram as Drover's primary canvas. It renders whenever there's a
  // graph to show: the explicitly focused pipeline, an ideation preview, or — when nothing is focused
  // yet (the landing/overview) — the first built pipeline, so opening a product lands you straight on
  // your pipelines as a merged node canvas instead of an empty board.
  const firstBuiltGraph = useMemo(() => {
    for (const c of channels) {
      if (c.nodeCount > 0) { const g = channelGraphs.get(c.id); if (g) return g; }
    }
    return null;
  }, [channels, channelGraphs]);
  const canvasGraph = displayGraph ?? graph ?? firstBuiltGraph;

  // The candidate pipeline SHAPES an ambiguous goal produced, read off the parked session. When present
  // (status "waiting_for_candidates"), the canvas shows them side by side for the founder to pick — never
  // the empty launcher. `assembling.key` holds the id of a shape already picked (its build is underway),
  // so the board can dim the roads not taken and read "Building…" on the chosen one.
  const canvasCandidates = useMemo(
    () => (operatorSession?.status === "waiting_for_candidates" ? sessionCandidates(operatorSession) : []),
    [operatorSession],
  );
  // Candidates folded into the ONE woven graph as dashed lanes (docs/INTERTWINED-CANVAS.md decision 4 —
  // the retired candidate board). Each candidate shape becomes a synthetic channel + graph in the merged
  // canvas, tagged in `candidateLaneIds` so GraphCanvas dashes every node and routes accept → pick. The
  // pick runs the SAME authorized build path the old board used (resolveCandidatesAndSync → compose_and_run
  // → the founder gate — nothing sends). Empty when the session isn't parked on candidates.
  const candidateLanes = useMemo(() => {
    if (!canvasCandidates.length) return null;
    const channels: ChannelMeta[] = [];
    const graphs = new Map<string, GTMGraph>();
    const ids = new Set<string>();
    const byLaneId = new Map<string, Candidate>();
    for (const c of canvasCandidates) {
      const laneId = `candidate:${c.id}`;
      ids.add(laneId);
      byLaneId.set(laneId, c);
      graphs.set(laneId, { id: laneId, name: c.label, version: "0", nodes: c.nodes, edges: c.edges });
      channels.push({
        id: laneId, name: c.label, kind: "candidate", objective: c.rationale, graphId: laneId,
        enabled: false, status: "idle", lastRunAt: null, lastRunOk: null, pendingGates: 0,
        nodeCount: c.nodes.length, runCount: 0, graphRevision: 0, lastRunResult: null,
      } as ChannelMeta);
    }
    return { channels, graphs, ids, byLaneId };
  }, [canvasCandidates]);

  // Pick a candidate lane → build it live (the founder act). Maps the synthetic lane id back to its shape.
  const handlePickCandidateLane = useCallback((laneId: string) => {
    const c = candidateLanes?.byLaneId.get(laneId);
    if (c) void resolveCandidatesAndSync(c.id, { nodes: c.nodes, edges: c.edges });
  }, [candidateLanes, resolveCandidatesAndSync]);

  // The merged fleet the woven canvas draws — real pipelines PLUS any candidate lanes, so candidates weave
  // into the one graph instead of taking over a separate board.
  const wovenMultiPipeline = useMemo(() => {
    if (!candidateLanes) return { channels, channelGraphs, channelRunResults, draggedByNode: mergedDragOverrides };
    const mergedChannels = [...channels, ...candidateLanes.channels];
    const mergedGraphs = new Map(channelGraphs);
    for (const [id, g] of candidateLanes.graphs) mergedGraphs.set(id, g);
    return { channels: mergedChannels, channelGraphs: mergedGraphs, channelRunResults, draggedByNode: mergedDragOverrides };
  }, [candidateLanes, channels, channelGraphs, channelRunResults, mergedDragOverrides]);

  // Which lens is actually on screen. Decided-question 5: the Operator lens replaces the old merged-lane
  // overview as the default MANY-motion view; the Engineer lens is the single-motion editor. So: a focused
  // single motion (activeChannelId set) is always Engineer; a founder who opened a lane/gate is put in
  // Engineer via canvasLens; otherwise, with more than one built pipeline, Operator is the default. A
  // product with zero or one pipeline has no fleet to operate, so it lands in Engineer (its landing/editor).
  const builtPipelineCount = channels.filter((c) => c.nodeCount > 0).length;
  const effectiveCanvasLens: "operator" | "engineer" =
    // Candidate shapes live as dashed lanes in the woven Operator canvas — force it so they weave in
    // (docs/INTERTWINED-CANVAS.md decision 4, the retired candidate board), never the single-motion editor.
    canvasCandidates.length > 0 ? "operator"
      : activeChannelId ? "engineer"
        : canvasLens === "engineer" ? "engineer"
          : builtPipelineCount >= 2 ? "operator"
            : "engineer";

  const gtmCanvasModel = useMemo<GtmCanvasModel>(() => ({
    projectId: activeProject?.id ?? null,
    graph: canvasGraph,
    connectors,
    contractAudits,
    result: runResult,
    running: graphRunning,
    runningNodeId,
    nodeBeats,
    selection,
    onSelect: handleCanvasSelect,
    onPaneClick: dismissOverlays,
    proposedNodeIds,
    proposedEdgeIds,
    revealedNodeIds,
    proposalActive,
    operatorCursor,
    onResolveProposal: (accept) => void handleResolveProposal(accept),
    // Return the promise (no `void`) so the canvas GateReview can await the release and surface a failure.
    onSubmitReview: (id, d) => submitGateReview(id, d),
    gatePromote,
    gateOffer,
    // Whether a real send transport is connected — the gate reads this to say honestly what a "yes"
    // does ("sends via your connected Gmail/endpoint" vs "stages locally"). Never loosens the wall.
    transportConnected,
    // The outcome door on approved cards — record a sent item's real result, then refresh the summary.
    onRecordOutcome: recordItemOutcome,
    // Veto-as-loop: send a staged item back to the crew to rework in the Composer.
    onRefineItem: refineGateItem,
    // Area 5 MOVE 1 — the code-native gate delta decision (approve stages / ship carries deployConfirmed).
    onDecideDelta: decideGateDelta,
    onApproveGate: (id) => void approveGate(id),
    onAskClaude: askClaudeAbout,
    // Crew faces on the step nodes open the same agent profile the old bottom strip did.
    onOpenAgentProfile: (ref: string) => setAgentProfileRef(ref),
    // The last run's real numbers ride the pipeline's Measure node (replaces the floating strip).
    runSummary,
    onAddNode: handleAddNode,
    onConnectNodes: handleGraphConnect,
    onDeleteEdges: handleDeleteEdges,
    onNodePositionChange: handleNodePositionChange,
    // The in-card node detail (GraphCanvas → NodeCardEditor): selecting a step expands its card in
    // place and shows Run + its produced output right there, instead of a modal takeover. Without this
    // bridge the in-card editor stays dark. onRunNode runs JUST that node and keeps it selected so the
    // output lands in the open card.
    nodeEditor: {
      flowRuns,
      subsystem: null,
      onApproveGate: (id: string) => void approveGate(id),
      onSubmitReview: (id: string, d: Record<string, GateDecision>) => void submitGateReview(id, d),
      onRunNode: (id: string) => void runNode(id),
      onUpdateGraph: updateGraph,
      onOpenArtifact: (type: "agent" | "skill", ref: string) => setArtifactEdit({ type, ref }),
      onDeleteNode: handleDeleteNode,
      onClose: () => setSelection(null),
    },
    multiPipeline: wovenMultiPipeline,
    panTo: panSignal,
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
    onOpenChannel: focusChannel,
    // Empty-canvas landing: focus the goal composer so a fresh product starts by stating an outcome.
    onComposeFirst: () => setComposerFocus((f) => f + 1),
    // ── Operator lens: the fleet-wide operating view (Area 6) ──
    operatingView,
    onFlyToGate: (t) => void flyToGate(t),
    onOpenLane: openLane,
    // ── The intertwined canvas (docs/INTERTWINED-CANVAS.md) ──
    woven: operatingView?.woven ?? null,
    wovenAxis,
    wovenFocus,
    onWovenAxisChange: setWovenAxis,
    onWovenSelect: setWovenFocus,
    onWireObject: handleWireObject,
    // Candidates as dashed lanes in the one graph (the retired candidate board).
    candidateLaneIds: candidateLanes?.ids,
    onPickCandidate: handlePickCandidateLane,
  }), [
    canvasGraph, connectors, contractAudits, runResult, graphRunning, runningNodeId, nodeBeats, selection,
    dismissOverlays, proposedNodeIds, proposedEdgeIds, revealedNodeIds, proposalActive, operatorCursor,
    handleResolveProposal, submitGateReview, approveGate, handleAddNode, handleGraphConnect, handleDeleteEdges,
    handleNodePositionChange, flowRuns, runNode, updateGraph, handleDeleteNode, channels, activeChannelId, subsystemHealth, activeProject, people, channelFeeds, directedFeeds, handleDeriveChannel, handleCanvasSelect, panSignal, focusChannel, askClaudeAbout, gatePromote, gateOffer, recordItemOutcome, refineGateItem, decideGateDelta, runSummary, transportConnected,
    operatingView, flyToGate, openLane,
    wovenAxis, wovenFocus, handleWireObject,
    wovenMultiPipeline, candidateLanes, handlePickCandidateLane,
  ]);

  // First-run team setup. Gated on Convex being configured AND no team chosen yet, so a local/solo
  // install never sees it. All hooks above have already run, so this early return is rules-of-hooks safe.
  if (convexEnabled && !teamIdentity) {
    return <TeamOnboarding onDone={setTeamIdentity} />;
  }

  // Hard first-run gate: Drover's intelligence runs on the founder's own Claude subscription, so with no
  // signed-in Claude the product can do no real work. Rather than a silent no-op behind a dismissible
  // banner, we stop here and walk the founder through connecting — the goal launcher, composer, ideation,
  // and operator are all unreachable until Claude answers, so no fake/blank intelligence is ever served.
  // The re-check flows a fresh connection status up to `setConnection`; the moment it reads connected this
  // early return stops firing and the app renders exactly as before. `connection` stays null until the
  // status resolves, so a connected founder never flashes this screen and their flow is unchanged.
  if (booted && connection && !connection.connected) {
    return <ConnectClaude connection={connection} onResult={setConnection} />;
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

  // The map is on screen (not the cold-start picker, the operator drive state, or an empty boot) — the
  // one condition under which the mode pill and the floated hero belong. Operator PAUSES
  // (waiting_for_ideas / waiting_for_gate) still show the map behind their overlay, so they keep it.
  const operatorDriving = !!operatorSession && ["ready", "running", "failed", "blocked"].includes(operatorSession.status);
  const gtmCanvasVisible = view === "canvas" && !overlay && !operatorDriving && !!(canvasGraph || activeProjectId);

  // The board-history trail for the focused pipeline — drives the undo/redo control's receipts list.
  const boardHistory = entriesFor(activeChannelId);

  // The "your stuff" rail sits beside the canvas whenever a product is open on the GTM canvas and no
  // full-screen overlay (Settings, Product mode, Understand) has taken over. It never covers the map;
  // it holds its own grid column, so the canvas reflows around it.
  const showLeftRail = view === "canvas" && !overlay && !!activeProjectId;

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
            <span className="loop-brand-name">Drover</span>
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
      <div className={`loop-body canvas-full ${view !== "canvas" ? "studio-mode" : ""} ${showLeftRail ? "has-rail" : ""}`}>
        {/* The "your stuff" rail — pipelines, crew, and skills in one opaque index beside the canvas.
            It holds the leading grid column so the canvas reflows around it and is never covered. */}
        {showLeftRail ? (
          <LeftRail
            channels={channels}
            activeChannelId={activeChannelId}
            bench={bench}
            projectId={activeProjectId}
            library={library}
            onLoadChannel={(id) => void loadChannel(id)}
            onNewChannel={handleNewChannel}
            onOpenAgent={(ref) => setAgentProfileRef(ref)}
            onCrewChanged={refreshBench}
            onOpenSkill={(name) => setArtifactEdit({ type: "skill", ref: name })}
            onNewSkill={() => handleNewArtifact("skill")}
          />
        ) : null}
        {/* Center — the canvas IS the workspace. Only the cold-start picker replaces it. The canvas-area
            wrapper is the drop target for Crew/Skill steps dragged from the rail (step MIME only). */}
        <section className="loop-canvas-area" onDragOver={onStepDragOver} onDrop={onStepDrop}>
          {/* What happened — the run's real numbers now ride the pipeline's Measure node (their single
              home on the canvas), so the floating strip no longer repeats them. What stays here is only
              the loop-closer: a low-emphasis door to log a real outcome, which refreshes the summary.
              It appears only once a run has happened. */}
          {view === "canvas" && !overlay && runSummary ? (
            <div className="run-strip run-strip--log-only" aria-label="Log what happened on your last run">
              <button type="button" className="run-strip-log" onClick={() => { setOutcomeOpen(true); void refreshMotionEfficiency(); }}>
                Log what happened →
              </button>
            </div>
          ) : null}

          {/* The loop-closer, floated over the map: an opaque panel over a soft scrim. Recording an
              outcome refreshes the run summary so the strip reflects the new result. Records only —
              nothing sends. */}
          {outcomeOpen && activeProjectId ? (
            <div
              className="outcome-float"
              role="dialog"
              aria-modal="true"
              aria-label="Log what happened"
              onClick={(e) => { if (e.target === e.currentTarget) setOutcomeOpen(false); }}
            >
              <div className="outcome-float-inner">
                <Suspense fallback={null}>
                  <OutcomeCapture
                    projectId={activeProjectId}
                    runId={activeChannelId ?? ""}
                    onDone={() => { setOutcomeOpen(false); refreshRunSummary(); void refreshMotionEfficiency(); }}
                  />
                </Suspense>
                {/* The Measure read: which motion actually earned the outcomes, honest about what's
                    unmeasured — the same per-motion rows the Operator lens's lanes show. */}
                <Suspense fallback={null}>
                  <MotionEfficiencyTable data={motionEfficiency} />
                </Suspense>
              </div>
            </div>
          ) : null}

          {/* Board history — undo/redo the working canvas plus the receipts trail of what the founder and
              Claude built. Bottom-left, clear of the top-center altitude control and the left product
              column. Both founder and crew structural edits are reversible here (never runs or sends). */}
          {gtmCanvasVisible && activeChannelId ? (
            <CanvasHistoryControl
              edits={boardHistory.edits}
              index={boardHistory.index}
              canUndo={canUndo(activeChannelId)}
              canRedo={canRedo(activeChannelId)}
              onUndo={handleUndoBoard}
              onRedo={handleRedoBoard}
            />
          ) : null}

          {/* The product's truth, pinned to the LEFT EDGE of the same canvas — where wins enter. The
              go-to-market flow reads left-to-right out of it. Opening it (or its "full picture" link)
              still leads to the deep Product view; this anchor is its always-present presence on the
              GTM canvas. First pass — the full merge of the Product canvas into these coordinates is a
              follow-up. */}
          {gtmCanvasVisible && activeProject ? (
            <ProductEntryColumn
              productName={activeProject.name}
              model={productModel}
              deriving={productDeriving}
              onReread={() => void handleRereadProduct()}
              // On the Operator lens — the fleet-wide operating view whose shared map is the centerpiece —
              // the product column starts collapsed to its thin tab so it doesn't hold a 300px gutter that
              // starves the map. The founder can still open "Where wins enter" any time; it just doesn't
              // crowd the operating surface by default. On the single-motion Engineer lens it stays open.
              defaultOpen={effectiveCanvasLens !== "operator"}
            />
          ) : null}

          {/* The floating control dock — every control the old top toolbar held, in one calm bar
              floating top-center over the full-bleed canvas. Kept over the canvas; hidden under the
              utility takeovers (Settings, Bench, Understand), which carry their own header + close, so
              the dock never collides with them. */}
          {view === "canvas" && !overlay ? (
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
              onOpenChannel={focusChannel}
              onNewChannel={handleNewChannel}
              onShowOverview={overviewActive ? () => { void loadProjectOverview(channels); } : undefined}
              overviewActive={overviewActive && !activeChannelId}
              motionName={engine?.motion?.name ?? null}
              // The Summon menu is retired from the dock — the eight-item card menu is no longer offered
              // behind a button. The card components still exist and still render when something summons
              // them (e.g. a signal opening the Inbox card); context-summon (cards appearing where the
              // founder clicks on the canvas) is a later canvas concern. So no summonItems / onSummon.
              onOpenSettings={() => { setOverlay("settings"); setProblemsOpen(false); setIssuesOpen(false); }}
              problems={issueCount}
              issuesOpen={issuesOpen}
              onToggleIssues={() => { setIssuesOpen((v) => !v); setDecisionsOpen(false); setProblemsOpen(false); }}
              pendingDecisions={pendingCount}
              decisionsOpen={decisionsOpen}
              onToggleDecisions={() => { setDecisionsOpen((v) => { const next = !v; if (next) { void refreshPendingInbox(); void refreshReallocation(); } return next; }); setIssuesOpen(false); setProblemsOpen(false); }}
              onCloseMenus={() => { setProblemsOpen(false); setIssuesOpen(false); setDecisionsOpen(false); }}
              graph={graph}
              running={graphRunning}
              runningNodeId={runningNodeId}
              onRun={() => void streamRun()}
            />
          ) : null}

          {/* Summoned views — they pop up ON the canvas as draggable cards (the agentic replacement
              for lens tabs). One card per kind; drag by the head, dismiss with ×. */}
          {view === "canvas" && summoned.map((kind, i) => {
            const item = SUMMON_GTM.find((s) => s.id === kind);
            return (
              <CanvasCard
                key={kind}
                title={item?.label ?? kind}
                onDismiss={() => dismissCard(kind)}
                initial={{ x: 150 + i * 46, y: 92 + i * 46 }}
                width={kind === "experiments" ? 640 : kind === "market" ? 468 : 440}
                height={kind === "experiments" ? 460 : kind === "market" ? 580 : 520}
              >
                {kind === "experiments" ? (
                  <ExperimentMatrixLens experiments={gtmCanvasModel.experiments} claims={gtmCanvasModel.claims} icp={gtmCanvasModel.icp} channels={gtmCanvasModel.channels} selected={reference?.kind === "experiment" ? reference.id : null} onSelect={(id) => openReference("experiment", id)} />
                ) : null}
                {kind === "inbox" && activeProjectId ? (
                  <InputsInbox projectId={activeProjectId} channels={channels} />
                ) : null}
                {kind === "market" && activeProjectId ? (
                  <MarketLayers projectId={activeProjectId} />
                ) : null}
                {kind === "microproduct" ? (
                  microproduct ? (
                    <div style={{ padding: 16, display: "flex", justifyContent: "center" }}>
                      <MicroproductFace microproduct={microproduct} />
                    </div>
                  ) : (
                    <div className="microproduct-compose">
                      <p className="microproduct-compose-lede">
                        Name a goal. A read-only producer cuts a working artifact from your product and stages
                        it behind your gate — nothing deploys until you approve there.
                      </p>
                      <textarea
                        className="microproduct-compose-input"
                        value={microproductGoal}
                        onChange={(e) => setMicroproductGoal(e.target.value)}
                        placeholder="e.g. a one-page ROI calculator for the pricing page"
                        rows={3}
                      />
                      {microproductError ? (
                        <p className="microproduct-compose-error">{microproductError}</p>
                      ) : null}
                      <button
                        type="button"
                        className="microproduct-compose-btn"
                        disabled={!activeProjectId || !microproductGoal.trim() || microproductBusy}
                        onClick={() => void handleComposeMicroproduct()}
                      >
                        {microproductBusy ? <LoaderCircle size={14} className="spin" /> : null}
                        {microproductBusy ? "Building…" : "Build microproduct"}
                      </button>
                    </div>
                  )
                ) : null}
              </CanvasCard>
            );
          })}

          {/* Find references — the cross-channel drill-down for a selected person / experiment, opened
              from a lens. A draggable opaque CanvasCard like the summoned views; read-only. */}
          {view === "canvas" && reference && (
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
          {view === "canvas" && clarityItems.map((item, i) => (
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
          ) : operatorSession && (operatorSession.status === "failed" || operatorSession.status === "blocked") && !(canvasGraph || (activeProjectId && channels.length > 0) || canvasCandidates.length > 0) ? (
            // The drive STOPPED (a cold start with no runtime, a hit session limit, an error). Surface the
            // reason and a way to pick the loop back up front-and-center ONLY when there is no canvas to show —
            // a failed run on a product that HAS pipelines must NOT seize the whole woven canvas (that hid the
            // operating view entirely); the failure stays reachable in the crew co-pilot rail, and the canvas
            // keeps rendering. Takeover is reserved for a cold-start failure with nothing else to draw.
            <OperatorDriveState
              session={operatorSession}
              productName={activeProject?.name ?? "your product"}
              onResume={() => void handleComposerSend("Continue.")}
              onStartOver={() => void handleOperatorCancel()}
              onSteer={(note) => handleDriveSteer(note)}
            />
          ) : (canvasGraph || (activeProjectId && channels.length > 0) || canvasCandidates.length > 0) ? (
            // A product with real work to show — a graph to watch assemble, built pipelines, OR candidate
            // shapes the goal forked into — SHOWS THE ONE WOVEN CANVAS even while Claude is driving the loop.
            // Candidates now render as DASHED LANES in that one graph (docs/INTERTWINED-CANVAS.md decision 4,
            // the retired candidate board), so a parked ambiguous goal weaves its shapes in beside the live
            // motions instead of taking over a separate board. Picking one runs the SAME authorized build
            // path (resolveCandidatesAndSync → compose_and_run → the founder gate — nothing sends).
            // A freshly-grounded product with NO goal yet, no graph and no pipelines falls through instead to
            // the goal launcher below, so the founder is asked "what do you want to happen" on the canvas
            // rather than landing on a barren object graph. `projectBusy` covers the open/load window, so a
            // product that does have pipelines never flashes the launcher before its graph resolves.
            // A product with real work to show — a graph to watch assemble, or built pipelines — SHOWS THE
            // CANVAS even while Claude is driving the loop, its live reasoning streaming in the co-pilot rail.
            // A freshly-grounded product with NO goal yet, no graph and no pipelines falls through instead to
            // the goal launcher below, so the founder is asked "what do you want to happen" on the canvas
            // rather than landing on a barren object graph. `projectBusy` covers the open/load window, so a
            // product that does have pipelines never flashes the launcher before its graph resolves.
            <GtmCanvas
              model={gtmCanvasModel}
              activeLensId={effectiveCanvasLens}
              chromeless
            />
          ) : operatorSession && (operatorSession.status === "ready" || operatorSession.status === "running") ? (
            // True cold start: a goal was given but there is no product/graph yet to watch, so the drive's
            // live reasoning IS the surface here until the first nodes exist.
            <OperatorDriveState
              session={operatorSession}
              productName={activeProject?.name ?? "your product"}
              onResume={() => void handleComposerSend("Continue.")}
              onStartOver={() => void handleOperatorCancel()}
              onSteer={(note) => handleDriveSteer(note)}
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
              sharedContext={activeProject?.sharedContext ?? null}
              peopleCount={people.length}
              pipelineCount={channels.length}
              // The goal launcher is the "start new work" front door — it must ALWAYS compose fresh, never
              // resume a leftover interrupted/failed session (which would silently swallow the new goal into
              // a dead run). Signal fresh intent so handleComposerSend takes the create path.
              onSubmitGoal={(g) => { freshPipelineIntent.current = true; void handleComposerSend(g); }}
              // "Ideate channels for me" is a do-it action, not a mode flip on a hidden dock: kick
              // off an ideate-framed session right now. The screen leaves the launcher for the live
              // operator drive state, so the click has a visible result. The kickoff is self-framing
              // because composerPosture is still "build" in this tick's closure.
              onIdeate={() => {
                freshPipelineIntent.current = true;
                setComposerPosture("ideate");
                void handleComposerSend(
                  "Ideate go-to-market pipelines for this product. Read what it does, then think with me: propose a few distinct pipelines worth running and challenge anything weak. Don't compose or build a pipeline yet — let's get clear first.",
                );
              }}
            />
          )}

          {/* The prose ideation pause is retired: the operator now surfaces ideation exclusively as
              embodied candidate SHAPES in the composer (a chain of crew faces ending at the gate), so
              the operator never enters `waiting_for_ideas` and this full-screen idea-review overlay is
              dead. Candidate shapes render inline in ComposerDock; picking one builds it to the gate. */}

          {/* The crew strip is gone from the canvas floor — the crew now lives on the canvas nodes
              themselves (a later agent renders it there). The bench track record still loads and flows
              (the left rail's crew section and the canvas both read it); it just no longer paints a
              bottom strip over the composer. */}

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

          {/* Settings — the utility drawer: the workspace index, the team and its release roles, and
              Tools (connect external MCP servers + the self-built tools). Three tabs in one opaque
              overlay; it reuses the standalone admin panels, so the bar owns the title + close and the
              panels render flush. Nothing here sends. */}
          {overlay === "settings" && (
            <div className="canvas-overlay settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
              <div className="canvas-overlay-bar">
                <div className="settings-overlay-tabs" role="tablist" aria-label="Settings sections">
                  {([
                    { id: "workspace", label: "Workspace" },
                    { id: "team", label: "Team" },
                    { id: "tools", label: "Tools" },
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
                        library={library}
                        onOpenArtifact={(type, ref) => {
                          setOverlay(null);
                          if (type === "agent") setAgentProfileRef(ref);
                          else setArtifactEdit({ type, ref });
                        }}
                        onNewArtifact={(type) => { setOverlay(null); handleNewArtifact(type); }}
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
                    <div className="settings-tools-stack">
                      {/* Connect your own Gmail as the sender — the one-field BYO step that turns the
                          staged send leg into a real send. Never loosens the wall; the gate still
                          governs every send. */}
                      <Suspense fallback={null}>
                        <ConnectSender />
                      </Suspense>
                      {/* Connect external MCP servers; the wall sorts each tool read (runs free) /
                          write (behind your gate). Was its own takeover overlay — folded in here. */}
                      <Suspense fallback={null}>
                        <ConnectCapability onChange={() => {}} />
                      </Suspense>
                      {/* Founder taste capture — the two surfaces that let a founder shape what the crew
                          drafts, without ever sending: the front-end house style a visual agent reads,
                          and the leaning that ranks which GTM paths come first. Neither touches the wall. */}
                      <Suspense fallback={null}>
                        <DesignTaste />
                      </Suspense>
                      <Suspense fallback={null}>
                        <SignalWeights />
                      </Suspense>
                      {/* The aggressiveness knobs sit right beside the leaning they govern: how much proof a
                          motion needs before it tilts the ranking, how far one proven motion may bend it,
                          and the hard daily ceiling on paid measurement probes. Visible and tunable, never a
                          hardcoded policy — and nothing here sends, ships, or spends on its own. */}
                      <Suspense fallback={null}>
                        <AggressivenessTunables />
                      </Suspense>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* The bench moved into the always-present left rail's Crew section — no longer a takeover
              overlay. Clicking a teammate there opens the same profile sheet. */}

          {/* The hand-pick pickers were removed — Claude composes what a pipeline needs and you approve
              at the gate, rather than wiring steps by hand. The objects you'd have inserted (your
              people, teammates, references) live on the canvas as summoned objects. */}

        </section>

        {/* ── Issues panel — the system's problem list, opened from the always-present dock indicator.
            What used to be a card you had to summon yourself: every engine investigation and pipeline
            contract gap, each row handing the problem to Claude to fix or jumping to the node that owns
            it. Opaque, twin of the Approvals panel; the two are mutually exclusive. */}
        {/* The pending-decision inbox panel — one surface for everything waiting on the founder across
            every product and pipeline. It routes, it never decides: each Open jumps to the item's real
            gate / review / inbox surface. Opaque, same register as the Issues panel; mutually exclusive
            with it. */}
        {decisionsOpen && view === "canvas" ? (
          <aside className="loop-issues-panel" role="dialog" aria-label="Decisions waiting on you" aria-modal="false">
            <header className="loop-issues-head">
              <div className="loop-issues-head-title">
                <Inbox />
                <strong>Waiting on you</strong>
                {pendingCount > 0 ? <span className="loop-issues-count">{pendingCount}</span> : null}
              </div>
              <button className="loop-issues-close" onClick={() => setDecisionsOpen(false)} type="button" aria-label="Close decisions">
                <X />
              </button>
            </header>
            <div className="loop-issues-body">
              {/* The Overdrive reallocation receipt sits atop the batch: what the machine leaned toward and
                  the motions it flagged as drawing nothing, correctable here. Shown only when there's a real
                  lean or a flagged motion — never an empty card. */}
              {reallocation && (reallocation.applied || (reallocation.starved?.length ?? 0) > 0) ? (
                <Suspense fallback={null}>
                  <ReallocationBatchCard
                    receipt={reallocation}
                    decision={reallocationDecision}
                    onOverturn={() => void overturnReallocation()}
                    onAccept={acceptReallocation}
                  />
                </Suspense>
              ) : null}
              <DecisionInbox decisions={pendingDecisions} onOpen={(d) => void openDecision(d)} />
            </div>
          </aside>
        ) : null}

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

        {/* Persistent Claude co-pilot — channels + conversation + composer. Docked whenever a
            channel or run is in play, but hidden behind the cold-start GoalLauncher so the two
            input surfaces never stack. */}
        {view === "canvas" && !showGoalLauncher ? <ComposerDock
          session={operatorSession}
          running={graphRunning}
          // The founder's crew — the same bench the rail reads. Feeds the @-mention roster and the
          // summoned parts tray so "@" autocompletes teammates and the tray shows their faces.
          bench={bench}
          // The parallel pipelines, as tabs: the roster (with the live active session merged in), which
          // one is on screen, how to switch between them, and how to start another.
          roster={rosterForDock}
          activeSessionId={operatorSession?.id ?? null}
          onSwitchSession={(id) => void switchSession(id)}
          onNewChat={handleNewChannel}
          // End a thread from its tab: Stop a live run (authorized cancel), Close a paused/finished one.
          onStopSession={handleSessionStop}
          onCloseSession={handleSessionClose}
          // Docked, not floating: the dock takes the loop-body grid's trailing `auto` column so the
          // canvas (the `1fr` column) reflows around it and its nodes are never covered. Floating made
          // it an absolutely-positioned card over the middle/right of the board — the occlusion bug.
          floating={false}
          focusSignal={composerFocus}
          // Cold landing of an empty product (no pipeline built yet, no run going): open the composer so
          // the "State a go-to-market goal" invitation points at a visible input, not a slim edge rail.
          startOpen={!canvasGraph && !operatorSession}
          recede={proposalActive}
          subject={composerSubject}
          onClearSubject={() => setComposerSubject(null)}
          onRetargetSubject={handleRetargetSubject}
          isNavCommand={isCanvasCommand}
          onSend={handleComposerSend}
          briefing={composerBriefing}
          onBuildCandidate={(c) => void resolveCandidatesAndSync(c.id, { nodes: c.nodes, edges: c.edges })}
          onCancel={handleOperatorCancel}
          onReviewGate={(nodeId) => selectInGraph(nodeId, operatorSession?.graphId ?? null)}
          // The gate, brought INTO the chat: "Review & send" opens the real GateReview in-thread, and these
          // route it through the SAME authorized release path the canvas gate uses — no fork, no new wall.
          onSubmitGateReview={(nodeId, d) => submitGateReview(nodeId, d)}
          onRefineItem={(item, note) => refineGateItem(item, note)}
          onRecordItemOutcome={(item, o) => recordItemOutcome(item, o)}
          gateLearned={(() => {
            const mem = operatorSession?.pendingGate?.runResult?.memoryApplied;
            return (mem?.approved ?? 0) + (mem?.rejected ?? 0) + (mem?.edits ?? 0);
          })()}
          gateOffer={gateOffer}
          gatePromote={gatePromote}
          posture={composerPosture}
          onExitPosture={() => setComposerPosture("build")}
          onPin={(kind, text) => { void pinClarity(kind, text); }}
          // Build-your-own-workflow retired: the composer composes via Claude, not a hand-pick picker.
          // You state a goal and Claude composes to the gate rather than wiring steps by hand.
          graph={graph}
        /> : null}
      </div>

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
            projectId={activeProjectId}
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
