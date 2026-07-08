import "@/styles/canvas-refine.css";
import "@/styles/canvas-gate.css";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Background, BaseEdge, Controls, Handle, MarkerType, Panel, Position, ReactFlow,
  useReactFlow, useStore, useNodesInitialized, useUpdateNodeInternals, ViewportPortal,
  type Connection, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "motion/react";
import {
  AlertCircle, AlertTriangle, Ban, Bot, Check, CheckCircle2, Circle, Code, CornerDownLeft, Database, Download, FileText, GitMerge,
  Loader, Lock, MessageSquare, MousePointer2, Pencil, Play, Search, ShieldCheck, Lightbulb, Split, Sprout, Target,
  Telescope, Trash2, TrendingUp, Wand2, X, Zap,
} from "lucide-react";
import TerminalNode from "@/components/TerminalNode";
import QueryNode from "@/components/QueryNode";
import WebNode from "@/components/WebNode";
import { cn } from "@/lib/utils";
import { healthHex } from "@/lib/health";
import { agentPersona } from "@/lib/agentPersona";
import { CrewAvatar } from "@/components/crew/CrewAvatar";
import { CrewFace } from "@/components/crew/CrewFace";
import { useBrandGlyph } from "@/lib/brandGlyph";
import { BrandGlyph } from "@/components/BrandGlyph";
import { CapabilityGlyph } from "@/components/CapabilityGlyph";
import { CAPABILITIES } from "@/lib/capabilities";
import type { NodeEditorBridge } from "@/components/nodeEditorBridge";
import type {
  ChannelMeta, ConnectorMeta, GateDecision, GTMEdge, GTMEdgeType, GTMGraph,
  GTMContractAudit, GTMItem, GTMNode, GTMNodeCategory, GTMNodeResult, GTMRunResult, NodeSelection,
  Person, PersonAppearance,
} from "@/types";
import { computeChannelLanes, type ChannelLane } from "@/lib/channelLanes";
import type { RunSummary } from "@/api";
import { explainGraph } from "@/api";
import { channelOfferLine } from "@/lib/gateItem";
import type { GatePromote } from "@/lib/gateItem";
import { GateReview } from "@/components/gate/GateReview";
import { useGhostResolve } from "@/lib/ghostResolve";
import {
  structuralWarnings,
  warningsByNode,
  weakEdgeIds,
  worthALookCount,
  type StructuralWarning,
} from "@/lib/structuralWarnings";

// The in-card editor needs the same handler bag the old right rail held (run a step, save the
// graph, open an artifact, delete, review a gate) plus the live graph (to clone-and-save a notes
// edit). We thread both through React context — not node data — so buildFlowGraph stays a pure
// topology mapper and the editor reads the bridge directly.
type NodeEditorContextValue = { bridge: NodeEditorBridge; graph: GTMGraph; people: Person[] } | null;
const NodeEditorContext = React.createContext<NodeEditorContextValue>(null);

// ─── Ghost proposals (slice 4) — Claude's proposed canvas edits, accepted in place ─────────────────
// Distinct from the operator's all-or-nothing pendingProposal path above. These are CLIENT-staged
// ghosts: a node or edge Claude proposes, held translucent/dashed on the canvas until the founder
// accepts or discards it — per item, right where the change is. The resolve handlers travel through the
// ghostResolve module store (not props) so these controls reach them WITHOUT threading a new prop
// through GtmCanvas, which is outside this slice's files. App registers the handlers; these subscribe.

// The per-ghost accept/discard control that floats on a client-staged ghost NODE. Mirrors the operator
// ProposalControls' placement and buttons (reusing .loop-proposal-inline), but resolves ONE node — not
// the whole proposal — so Claude's proposed steps are adopted or dropped individually. nodrag/nopan
// keep a click off the canvas pan; stopPropagation keeps it off the node's select handler.
function GhostControls({ nodeId }: { nodeId: string }) {
  const ghost = useGhostResolve();
  if (!ghost || !ghost.stagedNodeIds.has(nodeId)) return null;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className="loop-proposal-inline nodrag nopan" role="group" aria-label="Accept or discard this proposed step">
      <div className="loop-proposal-inline-row">
        <button
          type="button"
          className="loop-proposal-inline-btn accept"
          title="Add this proposed step"
          aria-label="Add this proposed step"
          onClick={(e) => { stop(e); ghost.acceptNode(nodeId); }}
        >
          <Check />
        </button>
        <button
          type="button"
          className="loop-proposal-inline-btn reject"
          title="Discard this proposed step"
          aria-label="Discard this proposed step"
          onClick={(e) => { stop(e); ghost.rejectNode(nodeId); }}
        >
          <X />
        </button>
      </div>
    </div>
  );
}

// The accept/discard chips for client-staged ghost EDGES that stand on their own — both endpoints are
// already real (an edge hanging off a ghost node commits or drops with that node, so it shows no chip).
// Rendered in flow coordinates via ViewportPortal (mirrors InspectorCard), positioned at the edge's
// midpoint. Reuses .loop-proposal-inline-btn for button styling; the wrapper is inline-styled so this
// layer touches no shared CSS file.
function GhostEdgeChips({ graph }: { graph: GTMGraph }) {
  const ghost = useGhostResolve();
  if (!ghost || ghost.stagedEdgeIds.size === 0) return null;
  const pos = new Map(graph.nodes.map((n) => [n.id, n.position ?? { x: 0, y: 0 }]));
  const NODE_W = 210;
  const NODE_H = 52;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const chips = graph.edges
    .filter((e) => ghost.stagedEdgeIds.has(e.id) && !ghost.stagedNodeIds.has(e.source) && !ghost.stagedNodeIds.has(e.target))
    .map((e) => {
      const s = pos.get(e.source);
      const t = pos.get(e.target);
      if (!s || !t) return null;
      const sx = s.x + NODE_W; const sy = s.y + NODE_H / 2;
      const tx = t.x; const ty = t.y + NODE_H / 2;
      const mx = (sx + tx) / 2; const my = (sy + ty) / 2;
      return (
        <div
          key={e.id}
          className="nodrag nopan"
          style={{ position: "absolute", transform: `translate(${mx}px, ${my}px) translate(-50%, -50%)`, zIndex: 8 }}
        >
          <div
            className="loop-proposal-inline-row"
            style={{ padding: 4, borderRadius: 999, border: "1px solid var(--ghost)", background: "var(--surface)", boxShadow: "var(--shadow-pop)" }}
          >
            <button
              type="button"
              className="loop-proposal-inline-btn accept"
              title="Add this proposed connection"
              aria-label="Add this proposed connection"
              onClick={(ev) => { stop(ev); ghost.acceptEdge(e.id); }}
            >
              <Check />
            </button>
            <button
              type="button"
              className="loop-proposal-inline-btn reject"
              title="Discard this proposed connection"
              aria-label="Discard this proposed connection"
              onClick={(ev) => { stop(ev); ghost.rejectEdge(e.id); }}
            >
              <X />
            </button>
          </div>
        </div>
      );
    })
    .filter(Boolean);
  if (chips.length === 0) return null;
  return <ViewportPortal>{chips}</ViewportPortal>;
}

// ─── Pipeline intelligence — the shape reads its own strengths and mistakes ─────────────────────────
// A quiet layer ON the canvas, not a side drawer. A structural warning wears one small amber mark on
// the offending card (amber = "worth a look"; red stays reserved for true breakage), and hovering it
// reveals the plain reason. Explain mode adds the composer's reasoning — why a step exists, why this
// ordering — on demand. Both ride the node's own data so the card owns its own read.

// The corner mark + hover reason on a flagged card. Amber, small, rationed — never a red alarm board.
function NodeWarnMark({ warning, onSeeFix }: { warning: StructuralWarning; onSeeFix?: (w: StructuralWarning) => void }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className="loop-warn nodrag nopan" onClick={stop}>
      <button
        type="button"
        className={cn("loop-warn-mark", `is-${warning.kind}`)}
        aria-label={`${warning.title} — ${warning.detail}`}
        title={warning.title}
      >
        <AlertTriangle aria-hidden />
      </button>
      <div className="loop-warn-pop" role="tooltip">
        <div className="loop-warn-pop-head"><span className="loop-warn-pop-ico"><AlertTriangle aria-hidden /></span>{warning.title}</div>
        <p className="loop-warn-pop-body">{warning.detail}</p>
        {onSeeFix && warning.fixable ? (
          <button type="button" className="loop-warn-fix" onClick={(e) => { stop(e); onSeeFix(warning); }}>
            See the fix →
          </button>
        ) : null}
      </div>
    </div>
  );
}

// The one-line reason a card exists / sits where it does — captured at compose time, surfaced only in
// Explain mode. Sits BELOW the card (absolute, so revealing it never resizes or reflows the card).
function NodeWhyCaption({ rationale }: { rationale: string }) {
  return (
    <div className="loop-why nodrag nopan"><em>Why here:</em> {rationale}</div>
  );
}

// The rationale pills that ride the edges in Explain mode: each carries the one reason for that
// ordering. Drawn in flow coordinates (mirrors GhostEdgeChips) so they track pan/zoom, and only for
// data edges that actually carry a reason — quiet by default, never a pill on every line.
function ExplainEdgeLayer({ graph, active, extra }: { graph: GTMGraph; active: boolean; extra?: Map<string, string> }) {
  if (!active) return null;
  const pos = new Map(graph.nodes.map((n) => [n.id, n.position ?? { x: 0, y: 0 }]));
  const NODE_W = 210;
  const NODE_H = 52;
  const pills = graph.edges
    .map((e) => {
      if (e.edgeType !== "data") return null;
      const rationale = (typeof e.rationale === "string" && e.rationale.trim()) ? e.rationale : extra?.get(e.id);
      if (!rationale) return null;
      const s = pos.get(e.source);
      const t = pos.get(e.target);
      if (!s || !t) return null;
      const mx = (s.x + NODE_W + t.x) / 2;
      const my = (s.y + t.y) / 2 + NODE_H / 2;
      return (
        <div
          key={`why-${e.id}`}
          className="loop-edge-why nodrag nopan"
          style={{ position: "absolute", transform: `translate(${mx}px, ${my}px) translate(-50%, -50%)` }}
        >
          {rationale}
        </div>
      );
    })
    .filter(Boolean);
  if (pills.length === 0) return null;
  return <ViewportPortal>{pills}</ViewportPortal>;
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<GTMNodeCategory, React.ReactNode> = {
  resource: <Database />,
  source:   <Search />,
  context:  <Target />,
  enrich:   <GitMerge />,
  filter:   <Lightbulb />,
  generate: <MessageSquare />,
  gate:     <ShieldCheck />,
  execute:  <Zap />,
  measure:  <TrendingUp />,
};

// Monochrome by default — color is reserved for ONE meaning: the founder gate, the wall. Every
// other node icon sits on the ink/grey ramp so the canvas reads as one calm system, and the eye
// goes straight to the gate (the only place anything reaches the world). No decorative color.
const INK = "#18181b";
const GREY = "#52525b";
const CATEGORY_COLOR: Record<GTMNodeCategory, string> = {
  resource: GREY,
  source:   INK,
  context:  GREY,
  enrich:   GREY,
  filter:   GREY,
  generate: INK,
  gate:     "#d97706", // the wall — the one accent
  execute:  INK,
  measure:  GREY,
};

const CATEGORY_LABEL: Record<GTMNodeCategory, string> = {
  resource: "Resource",
  source:   "Source",
  context:  "Context",
  enrich:   "Enrich",
  filter:   "Filter",
  generate: "Generate",
  gate:     "Gate",
  execute:  "Execute",
  measure:  "Measure",
};

// Open node kinds — the un-caging. An agent/skill/code step is not a connector from the
// registry; it renders by its kind, not its category.
const KIND_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  agent:  { color: INK,  label: "Agent",  icon: <Bot /> },
  skill:  { color: GREY, label: "Skill",  icon: <Wand2 /> },
  code:   { color: GREY, label: "Code",   icon: <Code /> },
  // A switch is automatic logic, so it reads in ink (never amber — amber is reserved for the gate).
  switch: { color: INK,  label: "Switch", icon: <Split /> },
};

// A switch edge's predicate, rendered as a short readable rule for the card ("fit ≥ 70", "tag = a").
const PRED_OP_LABEL: Record<string, string> = {
  eq: "=", ne: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤", contains: "has", in: "in", exists: "exists", missing: "missing",
};
function formatPredicate(p?: { field: string; op?: string; value?: unknown }): string {
  if (!p || !p.field) return "any";
  const op = p.op ?? "exists";
  const label = PRED_OP_LABEL[op] ?? op;
  return op === "exists" || op === "missing" ? `${p.field} ${label}` : `${p.field} ${label} ${String(p.value)}`;
}

// How a node renders: by its open kind when it has one, otherwise by its category. Falls
// back gracefully so a step with no category never breaks the canvas.
function nodeVisual(node: GTMNode): { color: string; label: string; icon: React.ReactNode } {
  if (node.kind && node.kind !== "tool" && KIND_META[node.kind]) return KIND_META[node.kind];
  const cat = node.category;
  return {
    color: CATEGORY_COLOR[cat] ?? "#6b7280",
    label: CATEGORY_LABEL[cat] ?? "Step",
    icon:  CATEGORY_ICON[cat] ?? <Circle />,
  };
}

// ─── Card taxonomy — typed by the GTM job, not the mechanical kind ────────────
// A card reads as the go-to-market OBJECT it is, not the connector under it: the headline is the
// job, the mechanism recedes to a quiet label. Five objects, all rendered by WorkNodeComponent:
//   Source   — the audience this channel pulls in (mode-marked provided/discovered)
//   Teammate — a personalized agent (its role is the headline; the kebab ref is a faint slug)
//   Gate     — the wall: the one place anything reaches the world (the signature card)
//   Measure  — the scoreboard, honest about blind attribution
//   Step     — the quiet machinery (tool / code / skill / enrich / filter / generate)
type CardObject = "source" | "teammate" | "gate" | "measure" | "switch" | "step";
function cardObject(node: GTMNode): CardObject {
  if (node.category === "gate") return "gate";
  if (node.category === "measure") return "measure";
  if (node.category === "source") return "source";
  if (node.kind === "switch") return "switch";
  if (node.kind === "agent") return "teammate";
  return "step";
}

// Source mode mirrors brain/src/source-entry.mjs `sourceMode()`: an agent-kind source self-sources
// (discovered); a connector-backed source is provided. Derived from the node's SHAPE so the left
// mark can never disagree with what the runner does.
function sourceMode(node: GTMNode): "provided" | "discovered" {
  return node.kind === "agent" ? "discovered" : "provided";
}

// The why-now line a Source card leads with, pulled from the founder/model-authored config. First
// real value wins; null when the source carries no stated trigger yet.
function sourceTrigger(node: GTMNode): string | null {
  const c = (node.config ?? {}) as Record<string, unknown>;
  for (const key of ["trigger", "nowTrigger", "signal", "query", "criteria"]) {
    const v = c[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function personInitials(name: string | null | undefined, fallback = "?"): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}

// The real entrants for one Source card — durable People (P10.3) whose appearances include THIS
// channel. Each row carries that channel's per-appearance trigger (the why-now that found them
// here). Real GTM state derived from runs, never seeded: no entrants → honest empty, never a fake.
type Entrant = { person: Person; appearance: PersonAppearance };
function sourceEntrants(people: Person[] | undefined, channelId: string | null, node: GTMNode): Entrant[] {
  if (node.category !== "source" || !people?.length || !channelId) return [];
  const out: Entrant[] = [];
  for (const person of people) {
    // The newest appearance in this channel is the live trigger that found them here.
    const appearance = [...person.appearances].reverse().find((a) => a.channelId === channelId);
    if (appearance) out.push({ person, appearance });
  }
  return out.sort((a, b) => String(b.appearance.at).localeCompare(String(a.appearance.at)));
}

// ─── The judgment verdict — grounded / assumed / generic / blind ──────────────
// Replaces the bare health number with a read on how GROUNDED this node's work is. Every branch
// maps from a signal the host ALREADY derived from real state — it is never seeded. When no real
// signal exists, it returns null and the card shows nothing (it never fabricates "grounded"):
//   blind    ← contractAudit.state "blind"      (e.g. Measure with no attribution source in the code)
//   blocked  ← contractAudit.state "blocked"    (a hard, named data gap — surfaced as the danger read)
//   assumed  ← contractAudit "waiting", OR a discovered source (a scout's hypothesis until it runs),
//              OR engine health 40–69 (real but unconfirmed)
//   grounded ← contractAudit "satisfied"/"ready", OR a provided source (founder-supplied real seed),
//              OR engine health ≥ 70 (scan + ledger + connector confidence)
//   generic  ← engine health 1–39 (real but thin grounding — the node sits near the model's mean)
type Verdict = "grounded" | "assumed" | "generic" | "blind" | "blocked";
function nodeVerdict(
  health: number | undefined,
  contractAudit: GTMContractAudit | undefined,
  mode: "provided" | "discovered" | null,
): { verdict: Verdict; label: string; title: string } | null {
  const state = contractAudit?.state;
  const healthNote = typeof health === "number" && health > 0 ? ` · health ${health}` : "";
  // 1. Contract signals are the most concrete real state — they win.
  if (state === "blind") return { verdict: "blind", label: "Blind", title: contractAudit?.message ?? "No attribution source" };
  if (state === "blocked") return { verdict: "blocked", label: `Needs ${contractAudit?.missingFields?.[0] ?? "data"}`, title: contractAudit?.message ?? "Missing required input" };
  if (state === "waiting") return { verdict: "assumed", label: "Assumed", title: contractAudit?.message ?? "Waiting on upstream input" };
  if (state === "satisfied" || state === "ready") return { verdict: "grounded", label: "Grounded", title: contractAudit?.message ?? "Has what it needs" };
  // 2. Source mode — a persisted topology fact, not a guess.
  if (mode === "provided") return { verdict: "grounded", label: "Grounded", title: `Founder-supplied seed (provided source)${healthNote}` };
  if (mode === "discovered") return { verdict: "assumed", label: "Assumed", title: `A scout agent self-sources this audience${healthNote}` };
  // 3. Engine health — derived from scan + ledger + connectors, never seeded.
  if (typeof health === "number" && health > 0) {
    if (health >= 70) return { verdict: "grounded", label: "Grounded", title: `Engine confidence${healthNote}` };
    if (health >= 40) return { verdict: "assumed", label: "Assumed", title: `Partial grounding${healthNote}` };
    return { verdict: "generic", label: "Generic", title: `Thin grounding${healthNote}` };
  }
  // 4. No real signal — honest blank.
  return null;
}

function VerdictBadge({ verdict, label, title }: { verdict: Verdict; label: string; title: string }) {
  // Two DIFFERENT classes of mark share this top-right slot, so a founder learns two grammars, not one
  // overloaded pill. A blocking gap ("Needs operatorName") is an ALERT — the thing that makes a pipeline
  // blocked — so it renders as a squared danger tag with an alert glyph (attention, "fix me"). Every
  // other verdict is a quiet GRADE of grounding (grounded/assumed/generic/blind) and stays the recessive
  // dot-pill (a judgment you glance at). Danger is an existing semantic token; no amber is used here.
  if (verdict === "blocked") {
    return (
      <span className="loop-alert" title={title}>
        <AlertTriangle className="loop-alert-ico" aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <span className={`loop-verdict v-${verdict}`} title={title}>
      <span className="loop-verdict-dot" aria-hidden />
      {label}
    </span>
  );
}

// ─── Node data types ──────────────────────────────────────────────────────────

type GTMNodeData = {
  node: GTMNode;
  result?: GTMNodeResult;
  running: boolean;
  selected: boolean;
  connectors: ConnectorMeta[];
  onSelect: () => void;
  // Open this node's real records as an Inspector card in canvas space (the workbench's read surface).
  onInspect?: () => void;
  // The project's durable People — threaded onto every node's data so a workbench Query node can read
  // and filter them without importing canvas-internal context (no module cycle).
  people?: Person[];
  // Persistent subsystem health (from the engine: scan + ledger + connectors).
  health?: number;
  healthIssue?: string;
  contractAudit?: GTMContractAudit;
  // Proposal layer (slice 2): this node is an operator-staged ghost, and there is a live proposal to
  // resolve. The affordance is all-or-nothing — either button resolves the WHOLE proposal — but it is
  // surfaced loudly right on the ghost so the founder acts where the change is.
  proposed?: boolean;
  proposalActive?: boolean;
  onResolveProposal?: (accept: boolean, note?: string) => void;
  // Only the FIRST staged ghost carries the accept/reject affordance — the proposal resolves
  // all-or-nothing, so one control set (not one per ghost) is the honest surface.
  proposalLead?: boolean;
  // Gate review (slice 5): for a founder gate node, resolve its staged drafts inline on the canvas.
  onSubmitReview?: (decisions: Record<string, GateDecision>) => void;
  onApproveGate?: () => void;
  // The autonomy ladder relocated onto the gate bloom — the Promote-by-Replay gesture and revoke,
  // bound to this pipeline. Set only on the FOCUSED gate (the host wires it, matching onSubmitReview's
  // single-channel scope); absent on every other lane's gate, which then shows no promote affordance.
  gatePromote?: GatePromote;
  // The deal this pipeline's staged work carries, in plain words — the pipeline's own offer, or the
  // project's standing one as the default. Rides only gate nodes; absent when neither states a deal.
  gateOffer?: string | null;
  // The outcome door on an approved card: the founder records what actually came back (a reply, a
  // meeting, a purchase), keyed off the item's provenance id. Records what ALREADY happened — never
  // sends. Rides only the focused gate; absent elsewhere, so those cards show no record affordance.
  onRecordOutcome?: (item: GTMItem, outcome: { outcomeKind: string; value?: number }) => void | Promise<void>;
  // The FULL run result (not just this node's), threaded onto the gate node so the review can render the
  // "reel" — the sequence of what the crew did to get here, derived from the run's executed steps. Rides
  // only the gate node; absent elsewhere.
  run?: GTMRunResult | null;
  // Veto-as-loop: the founder sends an item back to the crew with a note; it reworks in the Composer and
  // returns to the gate. NOT a release — nothing sends. Rides only the focused gate.
  onRefineItem?: (item: GTMItem, note: string) => void | Promise<void>;
  // This gate is the one a run is paused at (staged drafts awaiting review). The node breathes an amber
  // ring AND blooms its GateReview cards open without needing selection — the review comes to the founder.
  bloomed?: boolean;
  // Hand this node to Claude as the chat subject, straight from the card — the canvas→chat tie without
  // routing through the node-detail modal.
  onAskClaude?: () => void;
  // Open this agent's profile sheet straight from its monogram face — the crew, drawn ON the step it
  // runs. This is the home of the deleted bottom crew strip's role: its faces opened the same sheet.
  // Rides only agent-kind nodes (the ones that render a persona monogram); absent everywhere else.
  onOpenAgentProfile?: (ref: string) => void;
  // The project's latest run numbers (real, derived from the run ledger). Rides ONLY the focused
  // pipeline's Measure node, so "what happened" reads on the step that produced it instead of a
  // floating strip. Null/absent when no run has been recorded — the node then shows nothing (honest
  // empty), never a fabricated zero.
  runSummary?: RunSummary | null;
  // Ideation build animation: this node's left-to-right rank in its lane. When set, the card springs
  // in with a delay proportional to the rank, so a freshly composed workflow builds out node by node
  // instead of popping in whole. Unset on the main canvas (no entrance animation there).
  appearOrder?: number;
  // Set only on the merged multi-pipeline canvas (buildMergedFlowGraph): which pipeline this node
  // really belongs to, and that pipeline's own graph id. A few reads happen for EVERY rendered card
  // regardless of selection (e.g. a source card's entrant count) and must resolve against the card's
  // OWN pipeline, not whichever one happens to be centered — see WorkNodeComponent's entrant lookup.
  channelId?: string;
  graphId?: string;
  // Pipeline intelligence (post-processed onto the built graph, so buildFlowGraph stays pure): the
  // single primary structural warning on this node, whether Explain mode is on (drives the why-caption),
  // and the handler that turns a warning into a restructure proposal ("See the fix").
  warning?: StructuralWarning;
  explainMode?: boolean;
  onSeeFix?: (w: StructuralWarning) => void;
  // The one-line reason for this card in Explain mode — the composer's own `node.rationale`, or (for a
  // pipeline composed before rationale existed) the reason fetched on demand from the explain endpoint.
  explainRationale?: string;
};

// A lane that hasn't composed yet: the model is reasoning, or the compose failed. Carried on the
// node's config (config.laneStatus) and rendered by LaneStatusNodeComponent — the honest replacement
// for the old fabricated placeholder pipeline.
type LaneStatus = { status: "composing" | "error"; title: string; thinking?: string; error?: string };

// The build-in entrance for a freshly composed node. Returns motion props only when appearOrder is
// set (ideation), so the main canvas keeps its instant render. Spring + rank-staggered delay gives
// the left-to-right "watch it build" cascade. motion runs initial→animate once on mount, so a later
// re-render (selection, health update) never replays it.
function entranceProps(appearOrder?: number) {
  if (appearOrder == null) return {};
  return {
    initial: { opacity: 0, y: 12, scale: 0.92 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { delay: appearOrder * 0.09, type: "spring" as const, stiffness: 440, damping: 32, mass: 0.7 },
  };
}


function HealthPill({ health, issue }: { health: number; issue?: string }) {
  const hex = healthHex(health);
  return (
    <span
      className="loop-node-health"
      style={{ color: hex, borderColor: hex }}
      title={issue ? `Health ${health} · ${issue}` : `Health ${health}`}
    >
      {health}
    </span>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────

type RunStatus = "idle" | "running" | "done" | "error" | "pending" | "blocked";

function getStatus(_node: GTMNode, result?: GTMNodeResult, running = false): RunStatus {
  if (!result) return running ? "running" : "idle";
  if (result.blocked) return "blocked";
  if (result.pendingReview) return "pending";
  return result.ok ? "done" : "error";
}

function StatusIcon({ status }: { status: RunStatus }) {
  if (status === "running") return <Loader className="spin" />;
  if (status === "done")    return <CheckCircle2 style={{ color: "var(--ink-2)" }} />;
  if (status === "error")   return <AlertCircle style={{ color: "var(--danger)" }} />;
  if (status === "pending") return <Circle style={{ color: "var(--gap)" }} />;
  if (status === "blocked") return <Ban style={{ color: "var(--faint)" }} />;
  return null;
}

function itemSummary(result: GTMNodeResult): string | null {
  const n = result.items.length;
  const m = result.meta ?? {};
  if (result.pendingReview) return `${typeof m.awaitingReview === "number" ? m.awaitingReview : n} awaiting review`;
  if (result.category === "measure")  return `${n} staged`;
  if (result.category === "filter")   return `${n} qualified`;
  if (result.category === "generate") return `${n} drafted`;
  if (result.category === "source")   return `${n} found`;
  if (result.category === "enrich")   return `${n} enriched`;
  return n > 0 ? `${n} items` : null;
}

// ─── Proposal affordance (slice 2) ────────────────────────────────────────────
// A loud accept/reject pill floating on a proposed ghost node. The backend resolves proposals
// all-or-nothing, so either button resolves the WHOLE staged change — but the control sits right on
// the ghost, where the founder is looking, instead of only at a distant bar. `nodrag`/`nopan` keep a
// click from grabbing or panning the canvas; stopPropagation keeps it off the node's select handler.
function ProposalControls({ data }: { data: GTMNodeData }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (noteOpen) noteRef.current?.focus(); }, [noteOpen]);
  // Only the lead ghost shows the controls (the proposal is all-or-nothing). Every other ghost stays
  // a clean staged card, so the canvas isn't littered with redundant accept pills.
  if (!data.proposed || !data.proposalActive || !data.onResolveProposal || data.proposalLead === false) return null;
  const resolve = data.onResolveProposal;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className="loop-proposal-inline nodrag nopan" role="group" aria-label="Accept or reject the proposed changes">
      <div className="loop-proposal-inline-row">
        <button
          type="button"
          className="loop-proposal-inline-btn accept"
          title="Keep these changes"
          aria-label="Keep the proposed changes"
          onClick={(e) => { stop(e); resolve(true); }}
        >
          <Check />
        </button>
        <button
          type="button"
          className="loop-proposal-inline-btn reject"
          title="Discard these changes"
          aria-label="Discard the proposed changes"
          onClick={(e) => { stop(e); resolve(false); }}
        >
          <X />
        </button>
        <button
          type="button"
          className={cn("loop-proposal-inline-btn note", noteOpen && "is-open")}
          title="Keep or redirect with a note"
          aria-label="Leave a note"
          aria-expanded={noteOpen}
          onClick={(e) => { stop(e); setNoteOpen((v) => !v); }}
        >
          <Pencil />
        </button>
      </div>
      {/* The note popover — opaque, never glass: a real reading/writing surface. A note can either
          ride an accept (a quiet annotation the learning loop reads later) or a reject (a redirect —
          Claude comes back and changes it). Enter = redirect, the most common case. */}
      {noteOpen ? (
        <div className="loop-proposal-note">
          <textarea
            ref={noteRef}
            className="loop-proposal-note-input"
            rows={2}
            value={note}
            placeholder="Tell Claude what to change, or note why you're keeping it…"
            aria-label="Note for Claude"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation(); // keep typing off React Flow's canvas keyboard shortcuts (delete-node, etc.)
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (note.trim()) resolve(false, note.trim()); }
              if (e.key === "Escape") { e.preventDefault(); setNoteOpen(false); }
            }}
          />
          <div className="loop-proposal-note-actions">
            <button
              type="button"
              className="loop-proposal-note-btn keep"
              disabled={!note.trim()}
              onClick={(e) => { stop(e); resolve(true, note.trim()); }}
            >
              <Check size={12} /> Keep + note
            </button>
            <button
              type="button"
              className="loop-proposal-note-btn redirect"
              disabled={!note.trim()}
              onClick={(e) => { stop(e); resolve(false, note.trim()); }}
            >
              <CornerDownLeft size={12} /> Redirect
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── In-card guided editor ────────────────────────────────────────────────────
// "Everything in the canvas": selecting a node grows THIS card to reveal its editor inline (no right
// rail). The content reads top-to-bottom like a sentence — what it does → config → status → actions.
// It consumes the editor bridge from context, so the node card stays a pure presentational unit.

const CARD_DESCRIPTIONS: Record<string, string> = {
  resource:  "Declares a connector dependency the downstream steps rely on.",
  source:    "Brings the first items into the workflow.",
  context:   "Supplies ICP criteria or product context the later steps read.",
  enrich:    "Adds research and data to each item.",
  filter:    "Scores items and keeps the ones that qualify.",
  generate:  "Drafts the personalized artifact for each item.",
  gate:      "Pauses for your review before anything reaches the outside world.",
  execute:   "Stages the approved items locally — it never sends on its own.",
  measure:   "Captures attributable outcomes from the run.",
};

function cardDescription(node: GTMNode): string {
  if (typeof node.config?.description === "string" && node.config.description.trim()) {
    return String(node.config.description);
  }
  if (node.kind === "agent") return "Runs an agent on your subscription to do fuzzy judgment work.";
  if (node.kind === "skill") return "Runs a reusable working method (a skill) against each item.";
  if (node.kind === "code") return "Runs a deterministic transform over the items.";
  return CARD_DESCRIPTIONS[node.category] ?? "Processes items in the workflow.";
}

// One small uppercase section label + its body, the repeated rhythm of the guided card.
function CardSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="loop-node-editor-section">
      <span className="loop-node-editor-label">{label}</span>
      {children}
    </div>
  );
}

// Pull the human-readable draft out of a staged gate item so the founder reads the REAL message at
// the gate — not a count. Falls back across the field names the different drafters write.
function gateDraft(item: GTMItem): { to: string; subject?: string; body: string; channel?: string } {
  const to = String(item.name ?? item.company ?? item.org ?? item.handle ?? item.to ?? item.email ?? "Recipient");
  const body = String(item.draft ?? item.draft_note ?? item.message ?? item.body ?? "").trim();
  return {
    to,
    subject: item.subject ? String(item.subject) : undefined,
    body: body || "(empty draft)",
    channel: item.channel ? String(item.channel) : undefined,
  };
}

// What enrich/filter/draft/measure/execute steps actually produced — the same "read the real thing,
// not a count" move as gateDraft and the source's who-enters list, for every category that otherwise
// fell through to a bare item count. Headline is who/what the item is; detail is the one fact that
// explains why it's here (a fit reason, a score, the enrichment, the draft's subject).
function itemHeadline(item: GTMItem): string {
  return String(item.name ?? item.company ?? item.org ?? item.handle ?? item.title ?? item.subject ?? item.email ?? "Item");
}
function itemDetail(item: GTMItem): string | null {
  const v = item.fitReasons?.[0] ?? item.summary ?? item.subject
    ?? (typeof item.score === "number" ? `score ${item.score}` : null)
    ?? (item.company && item.name ? item.company : null)
    ?? (item.fit === true ? "fit" : item.fit === false ? "not a fit" : null);
  return v != null && v !== "" ? String(v) : null;
}
function ProducedPreview({ items }: { items: GTMItem[] }) {
  if (!items.length) return null;
  return (
    <div className="loop-who">
      <div className="loop-entrants">
        {items.slice(0, 6).map((item, i) => (
          <div className="loop-erow" key={String(item.id ?? i)}>
            <span className="loop-eav" aria-hidden>{itemHeadline(item).slice(0, 2).toUpperCase()}</span>
            <span className="loop-ename">{itemHeadline(item)}</span>
            {itemDetail(item) ? <span className="loop-etrig">— {itemDetail(item)}</span> : null}
          </div>
        ))}
      </div>
      {items.length > 6 ? <div className="loop-emore"><b>+{items.length - 6} more</b></div> : null}
    </div>
  );
}

// Pull a node's captured output down as a CSV — the union of every item's keys becomes the header,
// nested values are JSON-stringified, and quotes/commas/newlines are escaped. Runs entirely client-side
// on what the last run actually produced; captures nothing new.
function downloadItemsCsv(items: Array<Record<string, unknown>>, label: string) {
  if (!items.length) return;
  const keys = Array.from(new Set(items.flatMap((it) => Object.keys(it ?? {}))));
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [keys.join(","), ...items.map((it) => keys.map((k) => esc(it?.[k])).join(","))];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(label || "output").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "output"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function NodeCardEditor({ node, result, health, contractAudit, running }: {
  node: GTMNode;
  result?: GTMNodeResult;
  health?: number;
  contractAudit?: GTMContractAudit;
  running?: boolean;
}) {
  const ctx = useContext(NodeEditorContext);
  // Notes are local-while-typing, saved into the graph onBlur so we don't rebuild the graph on every
  // keystroke. Seeded from the node's stored notes.
  const [notes, setNotes] = useState(String(node.config?.notes ?? ""));
  // Keep the controls from re-triggering the card's own select/deselect handler.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (!ctx) return null;
  const { bridge, graph, people } = ctx;

  const mode = node.category === "source" ? sourceMode(node) : null;
  const entrants = sourceEntrants(people, graph.id, node);
  const isOpenKind = !!node.kind && node.kind !== "tool";
  const artifactType = node.kind === "agent" ? "agent" : node.kind === "skill" ? "skill" : null;

  const saveNotes = () => {
    if (String(node.config?.notes ?? "") === notes) return;
    bridge.onUpdateGraph({
      ...graph,
      nodes: graph.nodes.map((n) => n.id !== node.id ? n : { ...n, config: { ...n.config, notes } }),
    });
  };

  // Status tone: a satisfied contract / healthy result reads proven; a gate or waiting state reads
  // amber; a blocked/blind/error state reads danger. Monochrome otherwise.
  const items = result?.items?.length ?? 0;
  // The honest Output section runs for every step EXCEPT a source (which shows its own "Who enters"
  // roster) and a gate (whose staged drafts bloom on the canvas node itself). It reads real run state:
  // running, produced items, ran-but-empty, or failed — never a fabricated result.
  const showOutput = node.category !== "source" && node.category !== "gate";
  const contractState = contractAudit?.state;
  const contractTone =
    contractState === "blocked" || contractState === "blind" ? "danger" :
    contractState === "waiting" ? "gap" :
    contractState === "satisfied" || contractState === "ready" ? "proven" : "muted";
  const contractText =
    contractState === "blind" ? "Blind — no attribution source" :
    contractState === "blocked" ? `Needs ${contractAudit?.missingFields?.[0] ?? "data"}` :
    contractState === "waiting" ? "Waiting for input" :
    contractState === "satisfied" ? "Has what it needs" :
    contractState === "ready" ? "Ready to run" : null;

  return (
    <section className="loop-node-editor nodrag nopan" onClick={stop} onKeyDown={stop} aria-label="Step editor">
      <CardSection label="What it does">
        <p className="loop-node-editor-desc">{cardDescription(node)}</p>
      </CardSection>

      {/* CONFIG — kind-specific and compact. Most kinds need no editable config here in v1. */}
      {isOpenKind && artifactType && node.ref ? (
        <>
          <CardSection label="Config">
            <div className="loop-node-editor-fileline">
              <span className="loop-node-editor-filelabel">{artifactType === "agent" ? "Agent file" : "Skill file"}</span>
              <code className="loop-node-editor-ref" title={node.ref}>{node.ref}</code>
            </div>
            <button
              className="loop-node-editor-link"
              onClick={(e) => { stop(e); bridge.onOpenArtifact(artifactType, node.ref!); }}
              type="button"
            >
              <FileText size={12} /> Edit file
            </button>
            <textarea
              className="loop-node-editor-notes"
              rows={3}
              value={notes}
              placeholder="Notes for this step — context, caveats, a change to make…"
              aria-label="Step notes"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
            />
          </CardSection>
        </>
      ) : node.kind === "code" ? (
        <CardSection label="Config">
          {typeof node.config?.code === "string" && node.config.code ? (
            <pre className="loop-node-editor-code">{String(node.config.code).slice(0, 280)}</pre>
          ) : (
            <p className="loop-node-editor-hint">A deterministic transform. Edit its code from the artifact file.</p>
          )}
        </CardSection>
      ) : node.category === "source" ? (
        <CardSection label="Source">
          <div className="loop-node-editor-fileline">
            <span className="loop-node-editor-filelabel">Mode</span>
            <code className="loop-node-editor-ref">{mode}</code>
          </div>
          <p className="loop-node-editor-hint">
            {mode === "discovered"
              ? "A scout agent self-sources this audience from public signals."
              : "A provided source — supply the seed it pulls from (manual, CSV, or API)."}
          </p>
          {/* Who enters — the real People this channel has already fetched, each with the per-appearance
              trigger that found them here. The seed of the personalized drafts that land at the gate. */}
          <div className="loop-who">
            <div className="loop-who-head">
              <span>Who enters</span>
              <span className="loop-who-sub">
                {entrants.length ? `${entrants.length} · each its own trigger` : "none yet"}
              </span>
            </div>
            {entrants.length ? (
              <div className="loop-entrants">
                {entrants.slice(0, 6).map(({ person, appearance }) => (
                  <div className="loop-erow" key={person.id}>
                    <span className="loop-eav" aria-hidden>{personInitials(person.name, person.org?.[0]?.toUpperCase() ?? "?")}</span>
                    <span className="loop-ename">{person.name ?? person.org ?? person.handle ?? "Unknown"}</span>
                    {appearance.trigger ? <span className="loop-etrig">— {appearance.trigger}</span> : null}
                  </div>
                ))}
                {entrants.length > 6 ? (
                  <div className="loop-emore"><b>+{entrants.length - 6} more</b> — each enters with the trigger that found them</div>
                ) : null}
              </div>
            ) : (
              <p className="loop-node-editor-hint">No entrants yet. Run this source and the people it finds appear here, each with their own trigger.</p>
            )}
          </div>
        </CardSection>
      ) : node.category === "gate" ? (
        <CardSection label="At the gate">
          {result?.pendingReview || items > 0 ? (
            <div className="loop-gate-review">
              <p className="loop-gate-review-lead">
                {(result?.meta?.awaitingReview as number) ?? items} draft{items === 1 ? "" : "s"} staged — read each, then approve. Nothing sends until you do.
              </p>
              <div className="loop-gate-drafts">
                {(result?.items ?? []).slice(0, 2).map((item, i) => {
                  const d = gateDraft(item);
                  return (
                    <article className="loop-gate-draft" key={String(item.gtmActionId ?? i)}>
                      <header className="loop-gate-draft-head">
                        <span className="loop-gate-draft-to">{d.to}</span>
                        {d.channel ? <span className="loop-gate-draft-ch">{d.channel}</span> : null}
                      </header>
                      {d.subject ? <p className="loop-gate-draft-subj">{d.subject}</p> : null}
                      <p className="loop-gate-draft-body">{d.body}</p>
                    </article>
                  );
                })}
              </div>
              {items > 2 ? <p className="loop-gate-more">+{items - 2} more staged at the gate</p> : null}
              <button
                className="loop-gate-approve"
                onClick={(e) => { stop(e); bridge.onApproveGate(node.id); }}
                type="button"
              >
                <ShieldCheck size={12} /> Review &amp; approve
              </button>
            </div>
          ) : (
            <p className="loop-node-editor-hint">Nothing waiting. A run stages sends here and stops for your approval.</p>
          )}
        </CardSection>
      ) : null}

      {/* Output — what this step actually produced, read inside its own open card. This is the "run a
          small thing and see it" payoff: real items, an honest empty ("produced nothing"), or the
          failure — never hidden away in the rail. */}
      {showOutput ? (
        <CardSection label="Output">
          {running ? (
            <p className="loop-node-editor-hint">
              <Loader size={12} className="spin" style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Running this step…
            </p>
          ) : result && !result.ok && !result.pendingReview ? (
            <span className="loop-node-editor-contract tone-danger">
              {result.error ? result.error.slice(0, 120) : "This step failed."}
            </span>
          ) : items > 0 ? (
            <>
              <ProducedPreview items={result?.items ?? []} />
              <button
                type="button"
                className="loop-node-editor-csv"
                onClick={(e) => { e.stopPropagation(); downloadItemsCsv((result?.items ?? []) as Array<Record<string, unknown>>, node.label); }}
                title="Download what this step captured as a CSV"
              >
                <Download size={11} /> Download CSV · {items} row{items === 1 ? "" : "s"}
              </button>
            </>
          ) : result ? (
            <p className="loop-node-editor-hint">Ran — produced nothing.</p>
          ) : (
            <p className="loop-node-editor-hint">Not run yet. Run this step to see what it produces.</p>
          )}
        </CardSection>
      ) : null}

      <CardSection label="Status">
        <div className="loop-node-editor-status">
          <span className="loop-node-editor-stat"><strong>{items}</strong> item{items === 1 ? "" : "s"}</span>
          {typeof health === "number" && health > 0 ? (
            <span className="loop-node-editor-stat" style={{ color: healthHex(health) }}>Health {health}</span>
          ) : null}
          {contractText ? (
            <span className={`loop-node-editor-contract tone-${contractTone}`}>{contractText}</span>
          ) : null}
          {result && !result.ok && result.error ? (
            <span className="loop-node-editor-contract tone-danger">{result.error.slice(0, 60)}</span>
          ) : null}
        </div>
      </CardSection>

      <div className="loop-node-editor-actions">
        <button
          className="loop-node-editor-run"
          disabled={!!running}
          onClick={(e) => { stop(e); bridge.onRunNode(node.id); }}
          type="button"
        >
          {running ? <Loader size={13} className="spin" /> : <Play size={13} />}
          {running ? "Running…" : "Run step"}
        </button>
        <button
          className="loop-node-editor-delete"
          onClick={(e) => { stop(e); bridge.onDeleteNode(node.id); }}
          type="button"
        >
          <Trash2 size={12} /> Delete
        </button>
      </div>
    </section>
  );
}

// ─── Resource node (compact dark strip) ──────────────────────────────────────

function ResourceNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const { node, connectors, selected, onSelect, result } = data;
  const conn = connectors.find((c) => c.id === node.connector && c.category === "resource");
  const configured = conn ? conn.configured && !conn.stub : false;

  return (
    <>
    {/* The card's clickable summary is a real <button>; the inline editor it reveals when selected is
        a SIBLING, not a child, so its inputs/buttons are never nested inside a button (invalid HTML). */}
    <div className={cn("loop-node loop-node-resource", selected && "loop-node-selected")}>
      <button
        type="button"
        className="loop-node-hit"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Select ${node.label}`}
      >
        <div className="loop-node-resource-inner">
          <span className={cn("loop-node-dot", configured ? "dot-ready" : "dot-missing")} />
          <span className="loop-node-resource-name">{node.label}</span>
          {!configured && conn?.envKey && (
            <span className="loop-node-resource-key">{conn.envKey}</span>
          )}
        </div>
        {/* A composed step whose kind this runtime can't run survives here as a declaration
            (config.unrunnable, written by the composer normalizer) — the founder sees in plain
            words why this step will not run instead of it silently vanishing from the canvas. */}
        {typeof node.config.unrunnable === "string" && node.config.unrunnable.trim() !== "" && (
          <span className="loop-node-err-text">{node.config.unrunnable}</span>
        )}
        {result && !result.ok && (
          <span className="loop-node-err-text">{result.error?.slice(0, 40)}</span>
        )}
      </button>
      <Handle type="source" position={Position.Right} id="s-r" />
      {selected && (
        <NodeCardEditor node={node} result={result} health={data.health} contractAudit={data.contractAudit} running={data.running} />
      )}
    </div>
      <ProposalControls data={data} />
      <GhostControls nodeId={data.node.id} />
    </>
  );
}

// ─── Context node ─────────────────────────────────────────────────────────────

function ContextNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const { node, selected, onSelect, result } = data;
  const status = getStatus(node, result, data.running);
  const preview = node.config.query
    ? String(node.config.query).slice(0, 55)
    : node.config.name
    ? String(node.config.name)
    : node.connector;

  const color = CATEGORY_COLOR[node.category];

  return (
    <>
    {/* div+role=button, not <button>: a selected card mounts the editor's inputs/buttons, and
        nesting interactive controls in a <button> is invalid. */}
    <motion.div
      {...entranceProps(data.appearOrder)}
      className={cn(
        "loop-node loop-node-context",
        selected && "loop-node-selected",
        data.warning?.kind === "orphan-context" && "loop-node-orphan",
      )}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
    >
      {data.warning ? <NodeWarnMark warning={data.warning} onSeeFix={data.onSeeFix} /> : null}
      <Handle type="target" position={Position.Left} id="t-l" />
      <div className="loop-node-header">
        <div className="loop-node-icon" style={{ background: `${color}18`, color }}>
          {CATEGORY_ICON[node.category]}
        </div>
        <span className="loop-node-type-label">{CATEGORY_LABEL[node.category]}</span>
        <div className="loop-node-header-right">
          {typeof data.health === "number" && data.health > 0 && (
            <HealthPill health={data.health} issue={data.healthIssue} />
          )}
          {status !== "idle" && <StatusIcon status={status} />}
        </div>
      </div>
      <span className="loop-node-label">{node.label}</span>
      {preview && <span className="loop-node-preview">{preview}</span>}
      <Handle type="source" position={Position.Right} id="s-r" />
      {data.explainMode && (data.explainRationale ?? node.rationale) ? <NodeWhyCaption rationale={(data.explainRationale ?? node.rationale)!} /> : null}
      {selected && (
        <NodeCardEditor node={node} result={result} health={data.health} contractAudit={data.contractAudit} running={data.running} />
      )}
    </motion.div>
      <ProposalControls data={data} />
      <GhostControls nodeId={data.node.id} />
    </>
  );
}

// ─── Work node ────────────────────────────────────────────────────────────────


// Below this zoom a work card collapses to a coin (node-level level-of-detail). Chosen as a first
// pass — the altitude where a single lane no longer fits comfortably — and meant to be tuned live.
const LOD_COIN_ZOOM = 0.5;

// The pipeline's real result, drawn ON its Measure step instead of a separate floating strip: what the
// last run actually did (sent / replies / signups / revenue…). Every number is real — a cell with no
// signal is dropped, never shown as a fake zero. With nothing but a free-text note, the note shows; with
// nothing at all, the block renders nothing (the caller only mounts it when a summary exists).
function MeasureResults({ summary }: { summary: RunSummary }) {
  const cells = [
    { label: "Sent", value: summary.sent as number | string | null },
    { label: "Replies", value: summary.replies },
    { label: "Calls", value: summary.calls },
    { label: "Signups", value: summary.signups },
    { label: "Paid", value: summary.paid },
    { label: "No reply", value: summary.noReply },
    { label: "Revenue", value: summary.revenue == null ? null : `$${summary.revenue.toLocaleString()}` },
  ].filter((c) => c.value != null);
  if (!cells.length) {
    return summary.note ? <p className="loop-node-measure-note">{summary.note}</p> : null;
  }
  return (
    <div className="loop-node-measure-results" aria-label="What happened on your last run">
      {cells.map((c) => (
        <div key={c.label} className="loop-node-measure-cell">
          <span className="loop-node-measure-num">{c.value}</span>
          <span className="loop-node-measure-lbl">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

function WorkNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const { node, result, running, selected, onSelect } = data;
  const ctx = useContext(NodeEditorContext);
  // A gate with staged drafts opens the Split Stage — the immersive review room — as a full-surface
  // overlay: auto the moment a run pauses on it (bloomed), so the decision comes TO the founder, and on
  // demand from its own count when it's a completed/idle gate you want to revisit.
  const [reviewOpen, setReviewOpen] = useState(false);
  // Open the room once per bloom transition (false→true). If the founder closes it, it stays closed
  // until the NEXT time a run pauses here — the stage surfaces the moment, it doesn't nag.
  const wasBloomed = useRef(false);
  useEffect(() => {
    if (data.bloomed && !wasBloomed.current) setReviewOpen(true);
    wasBloomed.current = !!data.bloomed;
  }, [data.bloomed]);
  // Close the room on Escape while it's open — a full-surface overlay must always have a keyboard exit.
  // But NOT while the founder is typing: Escape in the send-back note or the draft editor closes that
  // field (handled locally in GateReview), never the whole room — so a stray Escape can't wipe their text.
  useEffect(() => {
    if (!reviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
      setReviewOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewOpen]);
  // Node LOD: subscribe to zoom as a BOOLEAN so the card only re-renders when it crosses the coin
  // threshold, not on every wheel tick. A selected card always shows full detail regardless of zoom.
  const coinLod = useStore((s) => s.transform[2] < LOD_COIN_ZOOM);
  const status  = getStatus(node, result, running);
  const summary = result ? itemSummary(result) : null;
  const hasErr  = status === "error" || status === "blocked";
  const visual  = useMemo(() => nodeVisual(node), [node]);
  const color   = visual.color;
  const isOpenKind = !!node.kind && node.kind !== "tool";
  // The card is typed by its GTM object, not its mechanical kind — the headline is the job.
  const obj = useMemo(() => cardObject(node), [node]);
  const mode = obj === "source" ? sourceMode(node) : null;
  const trigger = obj === "source" ? sourceTrigger(node) : null;
  // The real entrants for this source's channel (read off context — empty on preview canvases). Every
  // card computes this unconditionally (for the collapsed count), including cards in a lane that ISN'T
  // the focused one on the merged canvas — data.graphId (stamped per-lane by buildMergedFlowGraph) is
  // this card's OWN pipeline; ctx.graph is only ever the focused one, so it's the single-channel
  // fallback. The opened card (editor) lists each entrant with their own trigger.
  const entrants = useMemo(
    () => (obj === "source" ? sourceEntrants(ctx?.people, data.graphId ?? ctx?.graph?.id ?? null, node) : []),
    [obj, ctx, data.graphId, node],
  );
  // The judgment verdict replaces the bare health number — derived from real signals only.
  const verdict = nodeVerdict(data.health, data.contractAudit, mode);
  // An agent node reads as a person: the role name is the headline and the teammate's own crew face is
  // the icon, with the raw ref demoted to the faint slug below. Other kinds keep their connector icon.
  const persona = node.kind === "agent" && node.ref ? agentPersona(node.ref, node.label) : null;
  // External MCP capability: this step calls a real service (Notion, Gmail, Slack…). Show that
  // service's real logo, and whether it runs free (read) or sits behind your gate (write) — the wall,
  // legible on the card itself.
  const isMcp = node.kind === "mcp";
  const mcpServer = isMcp ? String(node.config?.server ?? node.ref?.split("/")[0] ?? "") : "";
  const mcpGlyph = useBrandGlyph(isMcp ? mcpServer : null);
  const mcpWrites = isMcp && node.config?.toolClass === "write";
  // A capability grabbed onto the canvas is a tool step keyed to a service (its connector is the
  // capability id). Show that service's real brand logo as the node's face — a dragged-in Gmail reads as
  // Gmail by its mark, not a generic step icon — and, when it's a gated one, that it acts behind the gate.
  const capability = useMemo(
    () => (!isOpenKind && !isMcp && node.connector ? CAPABILITIES.find((c) => c.id === node.connector) ?? null : null),
    [isOpenKind, isMcp, node.connector],
  );

  // A switch reads its branches off its OUTGOING data edges: each carries the routing predicate (the
  // rule) and points at the branch it feeds. Read from the live graph on context, not node data.
  const switchBranches = useMemo(
    () => (obj === "switch" && ctx
      ? ctx.graph.edges
          .filter((e) => e.source === node.id && e.edgeType === "data")
          .map((e) => ({
            id: e.id,
            rule: formatPredicate(e.predicate),
            target: ctx.graph.nodes.find((n) => n.id === e.target)?.label ?? e.target,
          }))
      : []),
    [obj, ctx, node.id],
  );

  // ── Gate as a threshold ── the Wall reads its own state so it's never an empty box. Waiting =
  // staged-but-undecided, released = founder-approved. Autonomy is founder-owned durable state (never
  // composed, never set by a run); absent means draft — the wall holds every item. We surface the
  // ladder as posture even while it's backend-only, so the card states where the wall actually stands.
  const isGate = obj === "gate";
  const gateItems = isGate ? (result?.items ?? []) : [];
  const gateReleased = gateItems.filter((it) => it.approvalStatus === "approved" || it.approved === true).length;
  const gateWaiting = gateItems.filter((it) => it.approvalStatus !== "approved" && it.approvalStatus !== "rejected" && it.approved !== true).length;
  const gateAutonomy = String((node.config?.autonomy as string | undefined) ?? "draft");
  const gateAutonomyLabel = gateAutonomy === "autonomous" ? "Autonomous" : gateAutonomy === "trusted" ? "Trusted" : "Draft";
  const gateAutonomyPosture = gateAutonomy === "autonomous"
    ? "auto-clears clean items, escalates exceptions"
    : gateAutonomy === "trusted"
    ? "auto-clears clean items, holds exceptions"
    : "holds every item for your review";
  const gateLearned = (() => {
    const mem = result?.meta?.memory as { approved?: number; rejected?: number; edits?: number } | undefined;
    return (mem?.approved ?? 0) + (mem?.rejected ?? 0) + (mem?.edits ?? 0);
  })();

  // Far-zoom face: a compact coin. Keeps both flow handles (t-l in, s-r out) so every edge still
  // connects at overview altitude; grows back to the full card on zoom-in or when selected.
  if (coinLod && !selected) {
    return (
      <motion.div
        className={cn(
          "loop-node", "loop-node-coin", `loop-node-obj-${obj}`,
          node.category === "gate" && "loop-node-gate",
          status === "running" && "loop-node-running",
          status === "done" && "loop-node-done",
          hasErr && "loop-node-error",
        )}
        role="button"
        tabIndex={0}
        onClick={onSelect}
        title={node.label}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      >
        <Handle type="target" position={Position.Left} id="t-l" />
        {capability ? (
          <span className="loop-node-coin-icon loop-node-coin-brand" aria-hidden><CapabilityGlyph cap={capability} size={17} /></span>
        ) : (
          <span className="loop-node-coin-icon" style={{ color }} aria-hidden>{visual.icon}</span>
        )}
        <span className="loop-node-coin-label">{node.label}</span>
        <Handle type="source" position={Position.Right} id="s-r" />
      </motion.div>
    );
  }

  return (
    <>
    {/* The card IS the editor: a card that expands to mount inputs/buttons can't be a <button>
        (nested interactive controls are invalid), so it's a div with button semantics. Selecting it
        grows the card and reveals the guided editor below the collapsed header. */}
    <motion.div
      {...entranceProps(data.appearOrder)}
      className={cn(
        "loop-node",
        `loop-node-obj-${obj}`,
        // Stage silhouette keys: the object class is coarse (code/skill/execute all collapse to
        // "step"), so also carry category + kind so the canvas CSS can give each GTM stage its own
        // shape — find→enrich→draft→gate→send→measure readable from silhouette alone. Purely additive.
        node.category && `loop-node-cat-${node.category}`,
        node.kind && node.kind !== "tool" && `loop-node-kind-${node.kind}`,
        // The founder gate is the product's spine — the one place anything reaches the world. It
        // carries the single amber accent at full weight so the wall reads at a glance in an
        // otherwise monochrome canvas.
        node.category === "gate" && "loop-node-gate",
        selected && "loop-node-selected",
        hasErr && "loop-node-error",
        status === "running" && "loop-node-running",
        status === "done" && "loop-node-done loop-node-justdone",
        status === "pending" && "loop-node-pending",
      )}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
    >
      {data.warning ? <NodeWarnMark warning={data.warning} onSeeFix={data.onSeeFix} /> : null}
      <Handle type="target" position={Position.Left} id="t-l" />
      {obj === "switch" ? (
        // ── Switch ── conditional logic as a readable card. The rule lives on each outgoing branch:
        // "fit ≥ 70 → Fast path". Neutral ink (logic is automatic), never the amber of the gate.
        <>
          <div className="loop-node-header">
            <div className="loop-node-icon" style={{ background: `${INK}14`, color: INK }}><Split /></div>
            <span className="loop-node-type-label">Switch</span>
            <div className="loop-node-header-right">
              <span className="loop-node-status"><StatusIcon status={status} /></span>
            </div>
          </div>
          <span className="loop-node-label">{node.label}</span>
          <div className="loop-node-switch-branches">
            {switchBranches.length === 0 ? (
              <span className="loop-node-switch-empty">No branches yet — connect this switch to its paths</span>
            ) : switchBranches.map((b) => (
              <span className="loop-node-switch-branch" key={b.id}>
                <span className="loop-node-switch-rule">{b.rule}</span>
                <span className="loop-node-switch-arrow" aria-hidden>→</span>
                <span className="loop-node-switch-target">{b.target}</span>
              </span>
            ))}
          </div>
        </>
      ) : obj === "source" ? (
        // ── Source ── the audience is the headline; the left MARK encodes the mode (a scout
        // telescope for discovered, a seed sprout for provided) so the label can't disagree with
        // the runner. The trigger carries an observed-vs-assumed dot; a count of who enters foots it.
        <>
          <div className="loop-node-srchead">
            <span className={cn("loop-node-mark", mode === "discovered" ? "mark-scout" : "mark-seed")}>
              {mode === "discovered" ? <Telescope /> : <Sprout />}
            </span>
            <span className="loop-node-kindline">
              <span className="loop-node-type-label">Source</span>
              <span className="loop-node-mode">{mode === "discovered" ? "Discovered" : "Provided"}</span>
            </span>
            {verdict ? <VerdictBadge {...verdict} /> : null}
            <span className="loop-node-status"><StatusIcon status={status} /></span>
          </div>
          <span className="loop-node-headline">{node.label}</span>
          {trigger ? (
            <span className="loop-node-trigger" title={entrants.length ? "Observed — confirmed on the people who entered" : "Assumed — not yet confirmed by a run"}>
              <span className={cn("loop-node-trigger-dot", entrants.length ? "is-observed" : "is-assumed")} aria-hidden />
              <span>{trigger}</span>
            </span>
          ) : null}
          <span className="loop-node-enter">
            {entrants.length
              ? <><b className="loop-node-enter-n">{entrants.length}</b> enter · each carries its own trigger</>
              : (summary ?? "No entrants yet — run to populate")}
          </span>
        </>
      ) : obj === "gate" ? (
        // ── Gate ── the Wall, drawn as a threshold that is never empty. Even with nothing staged it
        // states the posture: this is where work meets the world and nothing crosses without you.
        // Amber (--gap) is the one privileged accent on the canvas. When a run pauses here, the real
        // staged drafts bloom below to be decided in place — approve / edit / reject — nothing sends.
        <>
          <div className="loop-node-header">
            <div className="loop-node-icon loop-gate-mark" style={{ background: `${color}1c`, color }}>{visual.icon}</div>
            <span className="loop-node-type-label">Gate · your call</span>
            <div className="loop-node-header-right">
              {data.onAskClaude ? (
                <button
                  type="button"
                  className="loop-node-ask"
                  title="Ask Claude about this gate"
                  aria-label="Ask Claude about this gate"
                  onClick={(e) => { e.stopPropagation(); data.onAskClaude!(); }}
                >
                  <MessageSquare size={12} />
                </button>
              ) : null}
              <span className="loop-node-status"><StatusIcon status={status} /></span>
            </div>
          </div>
          <span className="loop-node-label">{node.label}</span>
          <div className="loop-gate-threshold" role="group" aria-label="Gate throughput">
            <span className="loop-gate-side is-waiting"><b>{gateWaiting}</b><span>waiting</span></span>
            <span className="loop-gate-seam" aria-hidden />
            <span className="loop-gate-side is-released"><b>{gateReleased}</b><span>released</span></span>
          </div>
          <span
            className={cn("loop-gate-autonomy", `is-${gateAutonomy}`)}
            title="Autonomy is set only by an explicit founder promotion — never by composition or a run."
          >
            <span className="loop-gate-ladder" aria-hidden>
              <i className="on" />
              <i className={cn((gateAutonomy === "trusted" || gateAutonomy === "autonomous") && "on")} />
              <i className={cn(gateAutonomy === "autonomous" && "on")} />
            </span>
            <b>{gateAutonomyLabel}</b> — {gateAutonomyPosture}
          </span>
          {gateItems.length === 0 ? (
            <span className="loop-gate-empty">Nothing staged yet. Nothing reaches the world until you approve it here.</span>
          ) : (
            // The node stays a compact object on the canvas; opening the review is a deliberate act that
            // brings up the immersive room, not a cramped bloom in the corner.
            <button
              type="button"
              className={cn("loop-gate-open", data.bloomed && "is-awaiting")}
              onClick={(e) => { e.stopPropagation(); setReviewOpen(true); }}
            >
              {data.bloomed ? `Needs you · review ${gateWaiting} →` : `Review ${gateWaiting} staged →`}
            </button>
          )}
          {/* The review room — a full-surface overlay portaled to the body so it escapes the canvas
              transform and truly takes over: the reel of what the crew did, then the decisions. Click the
              scrim or press Escape (when not typing) to step out. Dialog semantics so keyboard and
              screen-reader users can't tab into the obscured canvas behind the scrim. */}
          {reviewOpen && result ? createPortal(
            <div className="cgate-stage-overlay" onClick={() => setReviewOpen(false)}>
              <div className="cgate-stage-shell" role="dialog" aria-modal="true" aria-label="Your call — review your crew's work" onClick={(e) => e.stopPropagation()}>
                <div className="cgate-stage-bar">
                  <span className="cgate-stage-eyebrow"><ShieldCheck size={13} aria-hidden /> Your call</span>
                  <button type="button" className="cgate-stage-close" onClick={() => setReviewOpen(false)} aria-label="Close" autoFocus>
                    <X size={16} aria-hidden />
                  </button>
                </div>
                <GateReview variant="stage" items={result.items} run={data.run} onSubmit={data.onSubmitReview} learned={gateLearned} promote={data.gatePromote} offer={data.gateOffer} onRecordOutcome={data.onRecordOutcome} onRefineItem={data.onRefineItem} />
              </div>
            </div>,
            document.body,
          ) : null}
        </>
      ) : (
        // ── Teammate / Measure / Step ── job-first header: an icon (the teammate's crew face for an
        // agent, the brand mark for an MCP step), the quiet object label, the verdict, and status.
        <>
          <div className="loop-node-header">
            {persona && data.onOpenAgentProfile && node.ref ? (
              // The crew face, on the step it runs: the teammate's own character is a real button that
              // opens this teammate's profile sheet (the deleted crew strip's exact behavior). It bobs
              // while the step runs, and degrades to the family-tinted monogram if it can't render.
              <button
                type="button"
                className="loop-node-face"
                title={`Open ${persona.role}'s profile`}
                aria-label={`Open ${persona.role}'s profile`}
                onClick={(e) => { e.stopPropagation(); data.onOpenAgentProfile!(node.ref!); }}
              >
                <CrewFace
                  agentRef={node.ref}
                  family={persona.family}
                  monogram={persona.monogram}
                  size={28}
                  state={status === "running" ? "working" : "idle"}
                />
              </button>
            ) : persona && node.ref ? (
              <CrewFace
                agentRef={node.ref}
                family={persona.family}
                monogram={persona.monogram}
                size={28}
                state={status === "running" ? "working" : "idle"}
              />
            ) : capability ? (
              <div className="loop-node-icon loop-node-icon-brand">
                <CapabilityGlyph cap={capability} size={17} />
              </div>
            ) : (
              <div
                className={cn("loop-node-icon", isMcp && "loop-node-icon-brand")}
                style={isMcp ? undefined : { background: `${color}14`, color }}
              >
                {isMcp ? <BrandGlyph serverId={mcpServer} brand={selected} size={17} /> : visual.icon}
              </div>
            )}
            <span className="loop-node-type-label">
              {obj === "teammate" ? "Teammate"
                : obj === "measure" ? "Measure"
                : capability ? capability.name
                : isMcp ? (mcpGlyph?.title ?? mcpServer.replace(/^./, (c) => c.toUpperCase()))
                : visual.label}
            </span>
            <div className="loop-node-header-right">
              {data.onAskClaude ? (
                <button
                  type="button"
                  className="loop-node-ask"
                  title="Ask Claude about this step"
                  aria-label="Ask Claude about this step"
                  onClick={(e) => { e.stopPropagation(); data.onAskClaude!(); }}
                >
                  <MessageSquare size={12} />
                </button>
              ) : null}
              {verdict ? <VerdictBadge {...verdict} /> : null}
              <span className="loop-node-status"><StatusIcon status={status} /></span>
            </div>
          </div>
          <span className="loop-node-label">{persona ? persona.role : node.label}</span>
          {isMcp && (
            <span
              className={cn("loop-node-lane", mcpWrites ? "gated" : "free")}
              title={mcpWrites
                ? "Write capability — staged behind your founder gate, never sent on its own"
                : "Read capability — runs free, nothing leaves the building"}
            >
              {mcpWrites ? <Lock /> : <span className="loop-node-lane-dot" aria-hidden />}
              {mcpWrites ? "Behind your gate" : "Runs free"}
            </span>
          )}
          {/* The slug is a technical identifier, not the headline. It rides as a faint, single-line
              caption that never competes with the title; hover (the title attr) reveals the full ref. */}
          {isOpenKind
            ? <span className="loop-node-connector" title={node.ref}>{node.ref}</span>
            : capability
              // A capability node already reads as its service from the logo + name — the connector slug
              // ("gmail") would just repeat it, so it's dropped for a cleaner, logo-forward card.
              ? null
              : node.connector && <span className="loop-node-connector" title={node.connector}>{node.connector}</span>}
          {summary && !hasErr && (
            result?.items?.length
              ? (
                <button
                  type="button"
                  className="loop-node-count loop-node-count-open"
                  title="Open these records on the canvas"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onInspect?.();
                  }}
                >
                  {summary}
                </button>
              )
              : <span className="loop-node-count">{summary}</span>
          )}
          {/* Results on the pipeline: the Measure step carries what the last run actually did (real
              ledger numbers), so "what happened" lives on the step that produced it, not a floating strip. */}
          {obj === "measure" && data.runSummary ? <MeasureResults summary={data.runSummary} /> : null}
          {node.category === "generate" && (() => {
            const mem = result?.meta?.memory as { approved?: number; rejected?: number; edits?: number } | undefined;
            const learned = (mem?.approved ?? 0) + (mem?.rejected ?? 0) + (mem?.edits ?? 0);
            return learned > 0
              ? (
                <span className="loop-node-learned">
                  <Sprout size={9} aria-hidden /> Learned from {learned} decision{learned !== 1 ? "s" : ""}
                </span>
              )
              : null;
          })()}
          {hasErr && result?.error && (
            <span className="loop-node-err-text">{result.error.slice(0, 55)}</span>
          )}
        </>
      )}
      <Handle type="source" position={Position.Right} id="s-r" />
      {data.explainMode && (data.explainRationale ?? node.rationale) ? <NodeWhyCaption rationale={(data.explainRationale ?? node.rationale)!} /> : null}
      {/* A gate isn't "run" from the card — its staged drafts bloom in place above (GateReview), so the
          in-card editor is only mounted for the non-gate steps you actually run and read output from. */}
      {selected && !isGate && (
        <NodeCardEditor
          node={node}
          result={result}
          health={data.health}
          contractAudit={data.contractAudit}
          running={running}
        />
      )}
    </motion.div>
      <ProposalControls data={data} />
      <GhostControls nodeId={data.node.id} />
    </>
  );
}

// ─── Lane status node ─────────────────────────────────────────────────────────
// The honest "this lane hasn't composed yet" card. While composing it shows a shimmer spine and the
// model's live reasoning; on failure it shows why. It is NOT a fabricated workflow — it never draws
// nodes the model didn't compose. Replaced the instant the real graph streams in.
function LaneStatusNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const lane = (data.node.config?.laneStatus ?? {}) as LaneStatus;
  const failed = lane.status === "error";
  return (
    <motion.div
      className={cn("lane-status-card", failed && "lane-status-failed")}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="lane-status-head">
        <span className={cn("lane-status-icon", failed ? "is-error" : "is-composing")}>
          {failed ? <AlertCircle size={13} /> : <Loader className="spin" size={13} />}
        </span>
        <span className="lane-status-title">{lane.title}</span>
        <span className="lane-status-stage">{failed ? "Compose failed" : "Composing"}</span>
      </div>
      {!failed && (
        // The shimmer spine: a stand-in for a shape we don't know yet (the model decides how many
        // nodes). Three pulsing rails, never labelled as real steps.
        <div className="lane-status-spine" aria-hidden>
          <span /><span /><span />
        </div>
      )}
      {failed
        ? <p className="lane-status-error">{lane.error || "The model did not return a usable graph."}</p>
        : <p className="lane-status-reason">{lane.thinking || "Reading your product and designing the topology this goal needs…"}</p>}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </motion.div>
  );
}

// ─── Inspector — the workbench's read surface ─────────────────────────────────
// Cracks a node open IN canvas space to show the REAL records flowing through it — the source's
// prospects, the gate's drafts — instead of a "12 items" count you can't open. Read-only; it never
// mutates the graph. Pairs with the terminal: run a script, watch its output land as records here.
// The first line of a record's own text — used as an inspector title when the record carries no name/
// subject, so the row reads as what it IS ("Hi Sarah — saw you just…") instead of the raw enum word
// ("context" / "signal"). The 5-value `type` field is internal bookkeeping and never becomes a label.
function recordFirstLine(item: GTMItem): string | null {
  const text = typeof item.draft === "string" ? item.draft
    : typeof item.summary === "string" ? item.summary
    : typeof (item as Record<string, unknown>).message === "string" ? (item as Record<string, string>).message
    : typeof (item as Record<string, unknown>).text === "string" ? (item as Record<string, string>).text
    : null;
  if (!text) return null;
  const line = text.split(/\r?\n/)[0].trim();
  if (!line) return null;
  return line.length > 90 ? `${line.slice(0, 87).trimEnd()}…` : line;
}
function inspectorRow(item: GTMItem): { title: string; sub?: string; badge?: string } {
  // Real content only — never `item.type`, which is an internal enum, not a headline. A record with no
  // name/subject reads by its own first line of text; only a truly empty record shows "Untitled record".
  const title = item.name || item.company || item.subject || item.email || item.url || recordFirstLine(item) || item.id || "Untitled record";
  const sub = [item.title, item.email, item.url].filter(Boolean).join(" · ")
    || (item.draft && item.draft.trim() !== recordFirstLine(item) ? item.draft.slice(0, 240) : undefined);
  const badge = item.approvalStatus
    ?? (item.fit === true ? "fit" : item.fit === false ? "no fit" : undefined)
    ?? (typeof item.score === "number" ? `score ${item.score}` : undefined);
  return { title: String(title), sub: sub || undefined, badge: badge || undefined };
}

function InspectorCard({ node, result, onClose }: {
  node: GTMNode; result: GTMNodeResult | undefined; onClose: () => void;
}) {
  const items = result?.items ?? [];
  const x = node.position?.x ?? 0;
  const y = (node.position?.y ?? 0) + 132; // sits just below the node card it opened from
  return (
    <div className="rec-inspector nodrag nowheel" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <div className="rec-inspector-head">
        <Database size={12} />
        <span className="rec-inspector-title" title={node.label}>{node.label}</span>
        <span className="rec-inspector-count">{items.length}</span>
        <button type="button" className="rec-inspector-close" onClick={onClose} title="Close"><X size={12} /></button>
      </div>
      <div className="rec-inspector-body">
        {items.length === 0 ? (
          <p className="rec-inspector-empty">No records to show.</p>
        ) : items.map((item, i) => {
          const row = inspectorRow(item);
          return (
            <div className="rec-row" key={item.id ?? i}>
              <div className="rec-row-main">
                <span className="rec-row-title">{row.title}</span>
                {row.badge ? <span className="rec-row-badge">{row.badge}</span> : null}
              </div>
              {row.sub ? <span className="rec-row-sub">{row.sub}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Every custom node is wrapped in React.memo so a parent re-render (or a rebuilt flow where most
// nodes are unchanged) doesn't re-render all ~40+ cards — React Flow passes stable data/selected
// props, so the default shallow comparison is correct. Memoizing at the registry keeps one stable
// component type per node kind (React.memo must not be recreated per render).
// ── Output node ── the pipeline's projected, honest endpoint (appended in buildFlowGraph). A compact
// box that surfaces what the last run actually captured, with a CSV to pull it — or an honest "no result
// yet". It is a canvas projection, never part of the composed graph (no fixed skeleton).
function OutputNodeComponent({ data }: NodeProps<Node<{ label: string; items: unknown[]; hasRun: boolean }>>) {
  const items = Array.isArray(data.items) ? data.items : [];
  return (
    <div className="loop-node loop-node-output">
      <Handle type="target" position={Position.Left} id="t-l" />
      <div className="loop-node-header">
        <div className="loop-node-icon" style={{ background: `${INK}0f`, color: INK }}><Database size={15} /></div>
        <span className="loop-node-type-label">Output</span>
      </div>
      <span className="loop-node-label">{items.length > 0 ? `${items.length} captured` : "No result yet"}</span>
      {items.length > 0 ? (
        <button
          type="button"
          className="loop-node-editor-csv"
          onClick={(e) => { e.stopPropagation(); downloadItemsCsv(items as Array<Record<string, unknown>>, data.label); }}
          title="Download the pipeline's captured result as a CSV"
        >
          <Download size={11} /> Download CSV · {items.length} row{items.length === 1 ? "" : "s"}
        </button>
      ) : (
        <span className="loop-node-output-empty">{data.hasRun ? "The last run captured nothing here." : "Run the pipeline to capture its result."}</span>
      )}
      <Handle type="source" position={Position.Right} id="s-r" />
    </div>
  );
}

const NODE_TYPES = {
  resourceNode:   React.memo(ResourceNodeComponent),
  outputNode:     React.memo(OutputNodeComponent),
  contextNode:    React.memo(ContextNodeComponent),
  workNode:       React.memo(WorkNodeComponent),
  laneStatusNode: React.memo(LaneStatusNodeComponent),
  terminalNode:   React.memo(TerminalNode),
  queryNode:      React.memo(QueryNode),
  webNode:        React.memo(WebNode),
};

// ─── Feedback edge ── a return/learning edge (measure → context, switch → architect) routes UNDER the
// node band and loops around, instead of a bezier that cuts back across the forward wiring. A clean
// downward U from the source out to the target, dipping below everything so it never overlaps the flow.
function FeedbackEdge({ sourceX, sourceY, targetX, targetY, markerEnd, style }: EdgeProps) {
  const midY = Math.max(sourceY, targetY) + 104;
  const path = `M ${sourceX},${sourceY} C ${sourceX},${midY} ${targetX},${midY} ${targetX},${targetY}`;
  return <BaseEdge path={path} markerEnd={markerEnd} style={style} className="loop-edge-feedback" />;
}
const EDGE_TYPES = { feedback: React.memo(FeedbackEdge) };

// Workbench surfaces (terminal/query/web) are human-operated sources with their own renderers, not the
// work-card. Routed by kind, since they share the "source" category with connector-backed sources.
function nodeType(node: GTMNode): string {
  if (node.kind === "terminal") return "terminalNode";
  if (node.kind === "query")    return "queryNode";
  if (node.kind === "web")      return "webNode";
  if (node.category === "resource") return "resourceNode";
  if (node.category === "context")  return "contextNode";
  return "workNode";
}

// ─── Edge style ───────────────────────────────────────────────────────────────

function edgeStyle(type: GTMEdgeType): Partial<Edge> {
  if (type === "context")  return { className: "loop-edge-context", type: "smoothstep" };
  if (type === "feedback") return { className: "loop-edge-feedback", type: "feedback", animated: true, style: { strokeDasharray: "5 5" } };
  return { className: "loop-edge-data", type: "smoothstep" };
}

// ─── Auto-layout — the loop as a spacious left-to-right system ────────────────
// The model composes arbitrary topologies; stored positions can't be trusted to be readable
// (they ship cramped, nodes overlapping). So we lay the graph out by DAG depth: rank = longest
// path over data+context edges, x = rank × a generous column gap (wider than a node, so nothing
// overlaps), and same-rank nodes stack into lanes for branches. Feedback edges are excluded so a
// loop-closing edge never collapses the ranks. This runs on topology change only — manual drags
// (position-only updates) are preserved.
// Generous gutters so the flow reads as a left-to-right sequence with air between steps —
// wider than any node, so cards never crowd or overlap and the eye can follow the chain.
const COLUMN_GAP = 364;
const ROW_GAP = 212;

function topologySignature(graph: GTMGraph): string {
  const nodeIds = graph.nodes.map((n) => n.id).sort().join(",");
  const edgeKeys = graph.edges
    .filter((e) => e.edgeType !== "feedback")
    .map((e) => `${e.source}>${e.target}`).sort().join(",");
  return `${nodeIds}|${edgeKeys}`;
}

// Longest-path rank (DAG depth) over a node subset, using only data/context edges that stay inside
// the subset. Shared by the whole-graph layout and the per-lane channel layout so both rank the
// same way.
function longestPathRank(
  nodeIds: string[],
  edges: GTMEdge[],
): Map<string, number> {
  const idSet = new Set(nodeIds);
  const order = edges.filter((e) => e.edgeType !== "feedback" && idSet.has(e.source) && idSet.has(e.target));
  const adj = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const indeg = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  for (const e of order) {
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const rank = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const queue = nodeIds.filter((id) => (indeg.get(id) ?? 0) === 0);
  const deg = new Map(indeg);
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of adj.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      deg.set(next, (deg.get(next) ?? 0) - 1);
      if ((deg.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  return rank;
}

function computeLayout(graph: GTMGraph): Map<string, { x: number; y: number }> {
  const rank = longestPathRank(graph.nodes.map((n) => n.id), graph.edges);
  const byRank = new Map<number, string[]>();
  for (const n of graph.nodes) {
    const r = rank.get(n.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n.id);
  }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [r, group] of byRank) {
    const total = group.length;
    group.forEach((id, i) => {
      pos.set(id, { x: r * COLUMN_GAP, y: (i - (total - 1) / 2) * ROW_GAP });
    });
  }
  return pos;
}

// ─── Build React Flow graph ───────────────────────────────────────────────────

function buildFlowGraph(
  graph: GTMGraph,
  result: GTMRunResult | null,
  running: boolean,
  runningNodeId: string | null,
  selection: NodeSelection,
  connectors: ConnectorMeta[],
  subsystemHealth: Record<string, { health: number; issue?: string }>,
  contractAudits: Record<string, GTMContractAudit>,
  onSelect: (id: string) => void,
  proposedNodeIds?: Set<string>,
  proposedEdgeIds?: Set<string>,
  highlightedNodeId?: string | null,
  proposalActive?: boolean,
  onResolveProposal?: (accept: boolean) => void,
  onSubmitReview?: (nodeId: string, decisions: Record<string, GateDecision>) => void,
  onApproveGate?: (nodeId: string) => void,
  bloomNodeId?: string | null,
  revealedNodeIds?: Set<string>,
  onInspect?: (id: string) => void,
  people?: Person[],
  onAskClaude?: (node: GTMNode) => void,
  gatePromote?: GatePromote,
  gateOffer?: string | null,
  onRecordOutcome?: (item: GTMItem, outcome: { outcomeKind: string; value?: number }) => void | Promise<void>,
  // Open an agent's profile from its monogram face — passed for every lane (any pipeline's teammate
  // can open its sheet). The pipeline's real run numbers ride ONLY the Measure node, and only the
  // caller that owns the latest summary (the focused lane) passes it; every other lane passes null.
  onOpenAgentProfile?: (ref: string) => void,
  runSummary?: RunSummary | null,
  onRefineItem?: (item: GTMItem, note: string) => void | Promise<void>,
): { nodes: Node[]; edges: Edge[] } {
  // A node is "revealed" unless it's a still-pending proposed ghost. Committed nodes are always
  // revealed (so an edge from a committed node to the first ghost shows immediately); a proposed node
  // is revealed once the staged-reveal timer reaches it. No reveal set → every proposed node counts as
  // revealed (the all-at-once composition-preview path).
  const isRevealed = (id: string) => !revealedNodeIds || !proposedNodeIds?.has(id) || revealedNodeIds.has(id);
  // The all-or-nothing accept/reject rides ONE ghost — the last staged node (where the cursor finishes
  // building), so "watch it build, then decide" reads as one motion ending on the control.
  const leadProposedId = proposedNodeIds?.size
    ? [...graph.nodes].reverse().find((n) => proposedNodeIds.has(n.id))?.id ?? null
    : null;
  // The ideation preview is the one graph that builds in with a staggered entrance: rank ≈ x / column
  // gap (positions are pre-laid by ideationGraph at 248px columns), so a node's rank drives its delay.
  const ideation = graph.id === "ideation-preview";
  const EDGE_INK: Record<GTMEdgeType, string> = {
    data: "#94a3c4", context: "#c4c7db", feedback: "#86b89a",
  };
  const nodes: Node[] = graph.nodes.map((n) => {
    const sub = subsystemHealth[n.category];
    const laneStatus = ideation && !!(n.config as Record<string, unknown>)?.laneStatus;
    const appearOrder = ideation && !laneStatus ? Math.max(0, Math.round((n.position?.x ?? 0) / 248)) : undefined;
    // A gate blooms when a run has paused on it with drafts to review — that's derivable from the
    // gate's own result (pendingReview / awaitingReview), so both the single-channel and merged canvases
    // bloom on pause without the host threading a pending-gate id. An explicit bloomNodeId still forces it.
    const nodeResult = result?.nodes[n.id];
    const gatePending = n.category === "gate" && !!nodeResult
      && (nodeResult.pendingReview === true
        || (typeof nodeResult.meta?.awaitingReview === "number" && nodeResult.meta.awaitingReview > 0));
    const bloomed = (!!bloomNodeId && bloomNodeId === n.id) || gatePending;
    return {
      id: n.id,
      type: laneStatus ? "laneStatusNode" : nodeType(n),
      position: n.position,
      draggable: true,
      selectable: false,
      className: [
        proposedNodeIds?.has(n.id) ? "loop-node-proposed" : "",
        proposedNodeIds?.has(n.id) ? (isRevealed(n.id) ? "is-revealed" : "is-unrevealed") : "",
        // Run replay: the scrubber's current step glows; every other node dims so the eye follows
        // the run step by step. No highlight set → no replay classes, the canvas reads normally.
        highlightedNodeId ? (highlightedNodeId === n.id ? "loop-node-replay-current" : "loop-node-replay-dim") : "",
        // Founder gate bloom: while a run pauses at this gate with staged drafts, the node breathes an
        // amber ring (the one gate accent) so the eye lands on the wall where the inline review opens.
        bloomed ? "cgate-node-bloom" : "",
      ].filter(Boolean).join(" ") || undefined,
      data: {
        node: n,
        result: result?.nodes[n.id],
        // Per-node running: only the active step pulses. Global `running` is the fallback
        // for single-node runs where no specific node id is tracked.
        running: runningNodeId ? runningNodeId === n.id : running,
        selected: selection === n.id,
        connectors,
        onSelect: () => onSelect(n.id),
        onInspect: () => onInspect?.(n.id),
        people,
        health: sub?.health,
        healthIssue: sub?.issue,
        contractAudit: contractAudits[n.id],
        proposed: proposedNodeIds?.has(n.id) ?? false,
        proposalActive: proposalActive ?? false,
        proposalLead: leadProposedId ? n.id === leadProposedId : true,
        onResolveProposal,
        onSubmitReview: onSubmitReview ? (decisions: Record<string, GateDecision>) => onSubmitReview(n.id, decisions) : undefined,
        onApproveGate: onApproveGate ? () => onApproveGate(n.id) : undefined,
        // The promote gesture rides only the gate node, and only when the host passed one (focused lane).
        gatePromote: n.category === "gate" ? gatePromote : undefined,
        // The pipeline's deal rides only the gate node — the founder reviews drafts against the offer.
        gateOffer: n.category === "gate" ? gateOffer : undefined,
        // The outcome door rides only the gate node — an approved card records what came back.
        onRecordOutcome: n.category === "gate" ? onRecordOutcome : undefined,
        // The full run + the veto-to-refine callback ride only the gate node: the reel reads the run's
        // executed steps, and Send-back hands an item to the crew.
        run: n.category === "gate" ? (result ?? null) : undefined,
        onRefineItem: n.category === "gate" ? onRefineItem : undefined,
        bloomed,
        onAskClaude: onAskClaude ? () => onAskClaude(n) : undefined,
        // The crew face opens the profile on every lane; the run numbers ride only the Measure node.
        onOpenAgentProfile,
        runSummary: n.category === "measure" ? (runSummary ?? null) : undefined,
        appearOrder,
      } as GTMNodeData,
    };
  });

  const posX = new Map(graph.nodes.map((n) => [n.id, n.position?.x ?? 0]));
  // Living grammar — conviction is weight. A data edge's thickness encodes how much real volume flows
  // through it: the source node's last-run item count, normalized against the busiest node. The proven
  // spine reads fat, a fresh experiment a thread. Derived from the run ledger, never authored; with no
  // run yet every edge rests at its base width (honest — no fake conviction before evidence).
  const nodeVolume = (id: string) => result?.nodes[id]?.items?.length ?? 0;
  const maxVolume = Math.max(1, ...graph.nodes.map((n) => nodeVolume(n.id)));
  const convictionWidth = (e: GTMEdge): number | undefined => {
    if (e.edgeType !== "data") return undefined;
    const c = e.conviction ?? nodeVolume(e.source) / maxVolume;
    return c > 0 ? 1.5 + c * 3 : undefined; // 1.5px (rested) → ~4.5px (the spine)
  };
  const edges: Edge[] = graph.edges.map((e: GTMEdge) => {
    // Animate the edge feeding the active step — data visibly flowing in.
    const active = e.edgeType === "data" && runningNodeId === e.target && !!result?.nodes[e.source]?.ok;
    const base = edgeStyle(e.edgeType);
    const proposed = proposedEdgeIds?.has(e.id);
    // The flow reads left-to-right: every edge runs out the right of its source into the left of its
    // target. An arrowhead makes the direction legible — without it the calm grey lines read as
    // undirected.
    const routing = {
      sourceHandle: "s-r",
      targetHandle: "t-l",
      // Only the data spine carries an arrowhead — it's the one directed flow to read. Context (a
      // supply line into a step) and feedback (a return loop) are support, not steps in the sequence;
      // giving every edge its own arrowhead is what made the canvas read as a tangle. They recede to
      // thin, faint strokes with no head (see .loop-edge-context / .loop-edge-feedback in index.css).
      ...(e.edgeType === "data"
        ? { markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: EDGE_INK.data } }
        : {}),
    };
    // Ideation build-in: each edge fades along its target node's cascade beat, so a connector never
    // arrives before the node it points at. Delay = target rank, the same beat the node card uses.
    if (ideation) {
      const rank = Math.max(0, Math.round((posX.get(e.target) ?? 0) / 248));
      return {
        id: e.id, source: e.source, target: e.target, label: e.label, ...base, ...routing,
        className: `${base.className ?? ""} lane-edge-enter`.trim(),
        style: { ...(base.style ?? {}), animationDelay: `${rank * 0.09 + 0.12}s` },
      };
    }
    // A proposed edge holds back until both endpoints have surfaced, so a connector never dangles to a
    // node that hasn't been revealed yet.
    const edgeRevealed = isRevealed(e.source) && isRevealed(e.target);
    const width = convictionWidth(e);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      ...base,
      ...routing,
      ...(width ? { style: { ...(base.style ?? {}), strokeWidth: width } } : {}),
      ...(active ? { animated: true, className: "loop-edge-data loop-edge-active" } : {}),
      ...(proposed ? { className: `${base.className ?? ""} loop-edge-proposed ${edgeRevealed ? "is-revealed" : "is-unrevealed"}`.trim(), animated: true } : {}),
    };
  });

  // ── Output node ── append the pipeline's honest endpoint: a projected node to the right of the last
  // step, surfacing what the run actually captured (the right-most step that produced items) with a CSV,
  // or "no result yet". Not part of the composed graph — a canvas projection, so no fixed skeleton.
  if (!ideation && graph.nodes.length > 0) {
    const rightmost = graph.nodes.reduce((a, b) => ((b.position?.x ?? 0) > (a.position?.x ?? 0) ? b : a));
    const producing = graph.nodes.filter((n) => (result?.nodes[n.id]?.items?.length ?? 0) > 0);
    const resultNode = producing.length
      ? producing.reduce((a, b) => ((b.position?.x ?? 0) > (a.position?.x ?? 0) ? b : a))
      : null;
    const captured = resultNode ? (result?.nodes[resultNode.id]?.items ?? []) : [];
    const outId = `${graph.id}::__output`;
    nodes.push({
      id: outId,
      type: "outputNode",
      position: { x: (rightmost.position?.x ?? 0) + 264, y: rightmost.position?.y ?? 0 },
      draggable: true,
      selectable: false,
      data: { label: graph.name || "Result", items: captured, hasRun: !!result },
    });
    edges.push({
      id: `${outId}__edge`,
      source: rightmost.id,
      target: outId,
      sourceHandle: "s-r",
      targetHandle: "t-l",
      className: "loop-edge-data",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: EDGE_INK.data },
    });
  }

  return { nodes, edges };
}

// ─── Merge every pipeline into one coordinate space ───────────────────────────
// The literal unification: every pipeline's full graph, coexisting in ONE React Flow instance,
// stacked as lanes (computeChannelLanes) instead of one graph swapped in and out. Reuses
// buildFlowGraph verbatim per channel — zero changes to single-channel rendering logic — then
// namespaces the OUTPUT ids (React Flow's rendering-layer identity only; the real GTMNode/GTMEdge
// objects inside `data` keep their real, unprefixed ids, since node ids and edge ids are only
// unique WITHIN one pipeline's graph, not across all of them) and shifts each lane's y by its offset.
//
// Only ONE channel at a time can be "active" (running, selected, mid-proposal, mid-gate-review) —
// the operator session and the founder's own focus are both single-threaded — so `focus` carries
// those params once, scoped to `focus.channelId`; every other lane renders as a plain committed
// graph (running/selected forced false/null) so a bare node id can never collide across lanes.
type MergedFlowFocus = {
  channelId: string | null;
  running: boolean;
  runningNodeId: string | null;
  selection: NodeSelection;
  proposedNodeIds?: Set<string>;
  proposedEdgeIds?: Set<string>;
  proposalActive?: boolean;
  onResolveProposal?: (accept: boolean) => void;
  onSubmitReview?: (nodeId: string, decisions: Record<string, GateDecision>) => void;
  onApproveGate?: (nodeId: string) => void;
  gatePromote?: GatePromote;
  // The focused pipeline's deal line (includes the project-level fallback the host computed). Other
  // lanes derive their own from each channel's offer below.
  gateOffer?: string | null;
  // The outcome door — rides only the focused pipeline's gate, matching onSubmitReview's scope.
  onRecordOutcome?: (item: GTMItem, outcome: { outcomeKind: string; value?: number }) => void | Promise<void>;
  // Veto-to-refine — rides only the focused pipeline's gate, same scope as onSubmitReview.
  onRefineItem?: (item: GTMItem, note: string) => void | Promise<void>;
  revealedNodeIds?: Set<string>;
  onInspect?: (id: string) => void;
  // The project's latest run numbers, shown on the FOCUSED pipeline's Measure node only (there is one
  // project-level summary, so it rides the pipeline on screen rather than being duplicated across lanes).
  runSummary?: RunSummary | null;
};

function buildMergedFlowGraph(
  channels: ChannelMeta[],
  channelGraphs: Map<string, GTMGraph>,
  runResults: Map<string, GTMRunResult | null>,
  connectors: ConnectorMeta[],
  subsystemHealth: Record<string, { health: number; issue?: string }>,
  contractAudits: Record<string, GTMContractAudit>,
  // Same shape as buildFlowGraph's own onSelect — receives the namespaced `channelId::nodeId` id (the
  // node's real React-Flow-layer id below), so a merged canvas is a drop-in for any single-graph
  // onSelect caller as long as it unpacks the `::` when present.
  onSelect: (id: string) => void,
  focus: MergedFlowFocus,
  people?: Person[],
  onAskClaude?: (node: GTMNode) => void,
  onOpenAgentProfile?: (ref: string) => void,
): { nodes: Node[]; edges: Edge[]; lanes: Map<string, ChannelLane> } {
  // The single-channel canvas overrides EVERY node's position at render time with a DAG-rank
  // auto-layout (computeLayout, above) — the domain object's stored position is a fallback, not what
  // actually paints. Lane math has to run against those same laid-out positions, or a lane's bounding
  // box (and the offset every other lane stacks on) would be computed against numbers nobody sees.
  // v1 scope cut: unlike the single-channel canvas, a manual drag inside a lane doesn't yet "stick"
  // across renders (no per-channel draggedIds tracking) — every lane re-lays out on each render.
  const laidOutGraphs = new Map<string, GTMGraph>();
  for (const [channelId, g] of channelGraphs) {
    const autoPos = g.id === "ideation-preview" ? null : computeLayout(g);
    laidOutGraphs.set(channelId, autoPos ? { ...g, nodes: g.nodes.map((n) => ({ ...n, position: autoPos.get(n.id) ?? n.position })) } : g);
  }
  const lanes = computeChannelLanes(channels, laidOutGraphs);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  for (const channel of channels) {
    const g = laidOutGraphs.get(channel.id);
    const lane = lanes.get(channel.id);
    if (!g || !lane) continue;
    const isFocused = focus.channelId === channel.id;
    // `focus.selection` is App's raw selection state — a bare node id in single-channel use, but a
    // `channelId::nodeId` id once ANY merged canvas exists (handleCanvasSelect stores it verbatim so
    // NodeFocuser's getNode(selection) resolves against React Flow's actual rendered ids). buildFlowGraph
    // itself only ever compares against a BARE id (`selection === n.id`) — strip the prefix here, once,
    // or the focused card would never read as selected and its inline editor would never open.
    const prefix = `${channel.id}::`;
    const localSelection = isFocused && focus.selection
      ? (focus.selection.startsWith(prefix) ? focus.selection.slice(prefix.length) : focus.selection)
      : null;
    const built = buildFlowGraph(
      g,
      runResults.get(channel.id) ?? null,
      isFocused ? focus.running : false,
      isFocused ? focus.runningNodeId : null,
      localSelection,
      connectors,
      subsystemHealth,
      contractAudits,
      (nodeId) => onSelect(`${channel.id}::${nodeId}`),
      isFocused ? focus.proposedNodeIds : undefined,
      isFocused ? focus.proposedEdgeIds : undefined,
      null, // highlightedNodeId — the run-replay scrubber; not part of the merged canvas
      isFocused ? focus.proposalActive : false,
      isFocused ? focus.onResolveProposal : undefined,
      isFocused ? focus.onSubmitReview : undefined,
      isFocused ? focus.onApproveGate : undefined,
      null, // bloomNodeId — folded into per-node data below via the gate's own pendingReview state
      isFocused ? focus.revealedNodeIds : undefined,
      isFocused ? focus.onInspect : undefined,
      people,
      onAskClaude, // every pipeline's nodes can hand themselves to Claude, focused or not
      isFocused ? focus.gatePromote : undefined, // promote gesture only on the focused pipeline's gate
      // Each lane's gate shows the deal ITS pipeline carries; the focused lane gets the host-computed
      // line (which already falls back to the project's standing offer).
      isFocused ? (focus.gateOffer ?? channelOfferLine(channel)) : channelOfferLine(channel),
      // The outcome door rides only the focused pipeline's gate — nothing to record on a dimmed lane.
      isFocused ? focus.onRecordOutcome : undefined,
      // The crew face opens the profile on every lane; the run numbers ride only the focused pipeline's
      // Measure node (one project-level summary, shown on the pipeline on screen).
      onOpenAgentProfile,
      isFocused ? (focus.runSummary ?? null) : null,
      isFocused ? focus.onRefineItem : undefined,
    );
    for (const n of built.nodes) {
      nodes.push({
        ...n,
        id: `${channel.id}::${n.id}`,
        position: { x: n.position.x, y: n.position.y + lane.offsetY },
        data: { ...(n.data as GTMNodeData), channelId: channel.id, graphId: g.id },
      });
    }
    for (const e of built.edges) {
      edges.push({
        ...e,
        id: `${channel.id}::${e.id}`,
        source: `${channel.id}::${e.source}`,
        target: `${channel.id}::${e.target}`,
      });
    }
  }
  return { nodes, edges, lanes };
}

// ─── Auto-center on selection ─────────────────────────────────────────────────

function NodeFocuser({ selection, active }: { selection: NodeSelection; panelOpen: boolean; active: boolean }) {
  const { getNode, fitView } = useReactFlow();
  const prev = React.useRef<NodeSelection>(selection);

  useEffect(() => {
    // Don't yank the canvas while a run is streaming and auto-selecting each step.
    if (!active) { prev.current = selection; return; }
    if (!selection) {
      // Closing a card zooms the view back out to the lanes it came from.
      if (prev.current) fitView({ padding: 0.16, maxZoom: 1, duration: 460 });
      prev.current = selection;
      return;
    }
    prev.current = selection;
    if (!getNode(selection)) return;
    // Clicking a card opens the editor, which grows the card tall. Fit that EXPANDED card fully into
    // view (centered, whole thing on screen) rather than zooming into the collapsed node and letting the
    // editor overflow off the page. The short delay lets the card expand and measure before we fit it.
    const id = selection;
    const t = setTimeout(() => {
      fitView({ nodes: [{ id }], padding: 0.2, duration: 460, maxZoom: 1.05 });
    }, 160);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  return null;
}

// ─── Pan to a pipeline's lane on the merged canvas ─────────────────────────────
// "Open this pipeline" (ChannelSwitcher, a board tile) is navigation, not a node pick — it must NOT
// touch `selection` (that pops the node detail modal open). A separate signal, a separate camera
// move: pans to the lane's center the same way NodeFocuser pans to a node, at a wider zoom so the
// whole lane frames in view.
function LanePanner({ panTo, lanes }: { panTo: { channelId: string; token: number; nodeId?: string } | null; lanes: Map<string, ChannelLane> | null }) {
  const { setCenter, getNode } = useReactFlow();
  useEffect(() => {
    if (!panTo) return;
    // A nodeId flies to that specific step (rendered ids are namespaced on the merged canvas), close
    // enough to read, WITHOUT selecting it — no modal. Falls back to the lane if the node isn't found.
    if (panTo.nodeId) {
      const n = getNode(`${panTo.channelId}::${panTo.nodeId}`) ?? getNode(panTo.nodeId);
      if (n) {
        const w = n.measured?.width ?? n.width ?? 220;
        const h = n.measured?.height ?? n.height ?? 110;
        setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: 0.9, duration: 480 });
        return;
      }
    }
    if (!lanes) return;
    const lane = lanes.get(panTo.channelId);
    if (!lane) return;
    setCenter(lane.centerX, lane.centerY, { zoom: 0.7, duration: 480 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panTo, lanes]);
  return null;
}

// ─── The operator — the working crew member, on your canvas ───────────────────
// Presence over the proposal machinery. Instead of describing a change in a wall of prose, the
// crew member responsible for the active step appears ON that node — a little pixel character,
// visibly working — captions what it's doing, and moves with the camera to the next step as the
// run advances. When your review is needed, it stands on the gate. The camera follows the work
// (grab the canvas to break away). This is the WATCH beat; the inline ✓/✕/note on the lead ghost
// is the DECIDE beat that lands right where it finishes. Renders in flow coordinates via
// ViewportPortal so it tracks pan/zoom for free; the character and tag counter-scale so they stay
// legible at any zoom. There is no walking-traversal — the character appears and works in place,
// then re-appears on the next node (motion is feedback, not decoration).
export type OperatorCursorState = {
  phase: "build" | "rest" | "run" | "gate";
  revealOrder: string[];     // proposed node ids, in the order they surface
  revealCount: number;       // how many have surfaced so far
  staged: number;            // total staged count (for the resting caption)
  gateNodeId?: string | null;
};

function OperatorCursor({ graph, state, followBroken, recenterSignal }: {
  graph: GTMGraph;
  state: OperatorCursorState;
  followBroken: boolean;
  recenterSignal: number;
}) {
  const { setCenter, getZoom } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const target = useMemo(() => {
    if (state.phase === "gate" && state.gateNodeId) return nodeById.get(state.gateNodeId) ?? null;
    const order = state.revealOrder;
    if (!order.length) return null;
    const idx = state.phase === "build"
      ? Math.min(order.length - 1, Math.max(0, state.revealCount - 1))
      : order.length - 1;
    return nodeById.get(order[idx]) ?? null;
  }, [state, nodeById]);

  // Camera follows the work — re-centers each time the cursor moves to a new node (or the founder
  // hits "Back to Claude"), but never while the founder has grabbed the canvas to look elsewhere.
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!target || followBroken) return;
    const key = `${target.id}:${state.phase}:${recenterSignal}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    const z = getZoom();
    setCenter((target.position?.x ?? 0) + 120, (target.position?.y ?? 0) + 56, {
      zoom: Math.min(1, Math.max(0.62, z)),
      duration: 620,
    });
  }, [target, followBroken, state.phase, recenterSignal, getZoom, setCenter]);

  if (!target) return null;
  const caption =
    state.phase === "gate" ? "Reached your gate"
    : state.phase === "run" ? `Running ${target.label}`
    : state.phase === "build" ? `Adding ${target.label}`
    : state.staged > 1 ? `Staged ${state.staged} steps` : "Staged it";
  // Whose character is on the node: any ref-bearing step is a rented mind (agent / skill / connector)
  // and wears its own crew face — the same rule the dock's plan roster uses, so the two embodiments
  // never disagree on who's working a step. Refless steps (gate, code, tool, context) are the lead
  // ("Claude") — composing, running deterministic steps, or standing on the gate.
  const isGate = target.category === "gate";
  const persona = !isGate && target.ref ? agentPersona(target.ref, target.label) : null;
  const operatorName = persona?.role ?? "Claude";
  const characterRef = persona ? target.ref! : "claude";
  const family = persona?.family ?? "general";
  // The character is visibly working while a step is actively being composed or executed; at the
  // resting proposal and the gate it stands idle (the amber gate styling carries the "your turn" cue).
  const working = state.phase === "build" || state.phase === "run";
  const inv = zoom ? 1 / zoom : 1;
  return (
    <ViewportPortal>
      <div
        className={`op-cursor phase-${state.phase}`}
        style={{ transform: `translate(${(target.position?.x ?? 0) - 10}px, ${(target.position?.y ?? 0) - 30}px)` }}
        aria-hidden
      >
        <span className="op-cursor-char" style={{ transform: `scale(${inv})`, transformOrigin: "bottom left" }}>
          <CrewAvatar agentRef={characterRef} family={family} size={34} state={working ? "working" : "idle"} />
        </span>
        <div className="op-cursor-tag" style={{ transform: `scale(${inv})`, transformOrigin: "top left" }}>
          <span className="op-cursor-name">{operatorName}</span>
          <span className="op-cursor-caption">{caption}</span>
        </div>
      </div>
    </ViewportPortal>
  );
}

// ─── Run zoom — the loop "leans in" while the flywheel turns ──────────────────
// On run start the whole diagram scales up a touch; when the run settles it frames
// back to fit. A physical cue that the system is live, not a static wireframe.
function RunZoom({ running }: { running: boolean }) {
  const { getZoom, zoomTo, fitView } = useReactFlow();
  const baseZoom = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      baseZoom.current = getZoom();
      const target = Math.min(1.8, (baseZoom.current ?? 1) * 1.14);
      zoomTo(target, { duration: 520 });
    } else if (baseZoom.current != null) {
      baseZoom.current = null;
      fitView({ padding: 0.14, maxZoom: 1, duration: 560 });
    }
  }, [running, getZoom, zoomTo, fitView]);

  return null;
}

// ─── Re-fit — re-frame the graph when its container resizes (e.g. the debugger drawer toggles) ──
// React Flow only auto-fits on mount; a CSS grid resize around it leaves the old viewport. Bumping
// the nonce re-frames after the layout settles so the pipeline fills the reclaimed space.
// Shared framing options. On the merged overview the fit is allowed to shrink to hold every lane; on a
// single FOCUSED pipeline (Engineer's default landing) a `minZoom` floor keeps the fit above the coin
// threshold so the founder lands on full-size, legible node cards instead of unreadable specks.
type FitOpts = { padding: number; maxZoom: number; minZoom?: number };

function Refitter({ nonce, fitOptions }: { nonce?: number; fitOptions: FitOpts }) {
  const { fitView } = useReactFlow();
  const seen = useRef(nonce);
  useEffect(() => {
    if (nonce === undefined || nonce === seen.current) return;
    seen.current = nonce;
    const t = setTimeout(() => fitView({ ...fitOptions, duration: 420 }), 90);
    return () => clearTimeout(t);
  }, [nonce, fitView, fitOptions]);
  return null;
}

// ─── Measure guard — make the nodes paint when the pane mounts at zero size ─────
// React Flow measures each node once, lazily (a ResizeObserver per card), and keeps a node
// `visibility: hidden` until it has a measured size. If the canvas mounts inside a container that is
// momentarily 0-height — the channel workbench's `minmax(0, 1fr)` / `min-height: 0` grid chain
// hasn't resolved yet on a DIRECT boot into a channel URL — the cards get measured as zero and never
// recover: the diagram renders blank with no edges (edges don't draw between unmeasured nodes). This
// watches the pane size and, the moment it gains real dimensions while nodes are still uninitialized,
// forces a re-measure of every node so the cards and their edges actually paint. It's a no-op on the
// path where the pane is sized from the first frame (nodes initialize on their own).
function MeasureGuard({ nodeIds }: { nodeIds: string[] }) {
  const sized = useStore((s) => s.width > 0 && s.height > 0);
  const initialized = useNodesInitialized();
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    if (!sized || initialized || nodeIds.length === 0) return;
    // Re-measure on the next frame, after the cards have laid out at the real pane size.
    const raf = requestAnimationFrame(() => updateNodeInternals(nodeIds));
    return () => cancelAnimationFrame(raf);
  }, [sized, initialized, nodeIds, updateNodeInternals]);
  return null;
}

// ─── Fit on graph change — center the whole flow in the open canvas ────────────
// React Flow's `fitView` prop only frames once, on mount. But the graph data and its
// auto-layout positions arrive asynchronously AFTER mount (the graph loads, then
// computeLayout pushes new positions through onNodePositionChange), so the one mount
// fit frames an empty or stale graph and the real flow ends up wherever it lands —
// commonly low, with dead space above it (the lane layout starts at y≥0 and runs
// downward; the single-graph layout balances around y=0 but the top overlays — the
// step palette, the audit chip, a hero banner — eat the top band). This re-fits
// whenever the topology changes so the flow re-centers in the visible canvas with
// generous, even padding. `padding: 0.14` leaves air on all sides; `maxZoom: 1` keeps
// a small graph from blowing up to fill the frame. A short delay lets the node
// measurements settle before fitting so the bounds are real.
// `topology` is stable from the first render, but the auto-layout positions settle a few renders
// LATER (computeLayout pushes them through onNodePositionChange and they round-trip back as the
// graph prop). So we drive the fit off `bounds` — a signature of where the nodes actually are —
// which keeps changing until the layout lands, and debounce: each settle render resets the timer,
// so the fit fires once the positions stop moving, on the REAL bounds. We fit once per topology
// (fittedTopology) so a later manual drag doesn't yank the viewport back.
function FitOnGraph({ topology, bounds, running, suspended, fitOptions }: { topology: string; bounds: string; running: boolean; suspended?: boolean; fitOptions: FitOpts }) {
  const { fitView } = useReactFlow();
  const fittedTopology = useRef<string | null>(null);
  useEffect(() => {
    if (running || suspended) return;                 // don't fight RunZoom or the operator cursor's follow
    if (fittedTopology.current === topology) return;  // already framed this graph; leave drags alone
    const t = setTimeout(() => {
      fittedTopology.current = topology;
      fitView({ ...fitOptions, duration: 360 });
    }, 140);
    return () => clearTimeout(t);
  }, [topology, bounds, running, suspended, fitView, fitOptions]);
  return null;
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

export function GraphCanvas({
  graph, result, running, runningNodeId = null, selection, connectors, subsystemHealth = {}, contractAudits = {},
  onSelect, onNodePositionChange, onConnectNodes, onDeleteEdges, onAddNode, panelOpen, variant,
  proposedNodeIds, proposedEdgeIds, proposalActive, onResolveProposal, onSubmitReview, onApproveGate, refitNonce, highlightedNodeId = null,
  bloomNodeId = null, nodeEditor = null, revealedNodeIds, onPaneClick, operatorCursor = null, people = [],
  multiPipeline = null, panTo = null, onAskClaude, gatePromote, gateOffer = null, onRecordOutcome,
  onRefineItem, onOpenAgentProfile, runSummary = null,
}: {
  graph: GTMGraph;
  result: GTMRunResult | null;
  running: boolean;
  onAskClaude?: (node: GTMNode) => void;
  runningNodeId?: string | null;
  selection: NodeSelection;
  connectors: ConnectorMeta[];
  subsystemHealth?: Record<string, { health: number; issue?: string }>;
  contractAudits?: Record<string, GTMContractAudit>;
  onSelect: (id: string) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }, origin?: "drag" | "layout") => void;
  onConnectNodes?: (source: string, target: string) => void;
  onDeleteEdges?: (edgeIds: string[]) => void;
  onAddNode?: (spec: Partial<GTMNode> & { label: string }) => void;
  panelOpen?: boolean;
  // "ideation" draws nodes in with a staggered build animation (workflows being composed).
  variant?: "ideation";
  // Nodes/edges the operator has STAGED but not applied — rendered as ghosts for founder review.
  proposedNodeIds?: Set<string>;
  proposedEdgeIds?: Set<string>;
  // Staged reveal: which proposed ghosts have surfaced yet. The host grows this set on a timer so a
  // multi-node proposal builds onto the canvas one card at a time instead of popping in whole — each
  // newly revealed node transitions in (see .loop-node-proposed.is-revealed). Undefined → every
  // proposed node shows at once (the composition-preview path keeps its old all-at-once behavior).
  revealedNodeIds?: Set<string>;
  // Slice 2: a proposal is live and resolving it accepts/discards the whole staged change. Surfaced
  // inline on each ghost node so the founder accepts/rejects where the change is.
  proposalActive?: boolean;
  onResolveProposal?: (accept: boolean) => void;
  // Slice 5: a founder gate node resolves its staged drafts inline on the canvas (the on-canvas
  // quick-review at the wall). Same handlers the right-panel node editor uses.
  onSubmitReview?: (nodeId: string, decisions: Record<string, GateDecision>) => void;
  onApproveGate?: (nodeId: string) => void;
  // The autonomy ladder, relocated onto the focused gate's bloom: the Promote-by-Replay gesture and
  // revoke, bound to the focused pipeline. The host sources the channel meta, the release-role check,
  // and the founder's last real gate decisions, and passes the same promote/revoke handlers the
  // Approvals panel used. Absent → the gate shows no promote affordance (the wall is unchanged).
  gatePromote?: GatePromote;
  // The deal the focused pipeline's staged work carries, in plain words — its own offer, or the
  // project's standing one. Shown on the gate's inline review; absent when neither states a deal.
  gateOffer?: string | null;
  // The outcome door on the focused gate's approved cards: record what actually came back on a sent
  // item, keyed off its provenance id. Records what ALREADY happened — never sends.
  onRecordOutcome?: (item: GTMItem, outcome: { outcomeKind: string; value?: number }) => void | Promise<void>;
  // Veto-as-loop on the focused gate: the founder sends an item back to the crew with a note; it reworks
  // in the Composer and returns to the gate. NOT a release — nothing sends.
  onRefineItem?: (item: GTMItem, note: string) => void | Promise<void>;
  // Bump to re-fit the viewport after the container resizes (debugger drawer open/close).
  refitNonce?: number;
  // The run scrubber's current step — this node glows, the rest dim, so a replay reads node-by-node.
  highlightedNodeId?: string | null;
  // The gate node to bloom (amber breathing ring) while a run pauses at the founder gate. The host
  // sets this to the pending gate id when drafts are staged; null clears the bloom.
  bloomNodeId?: string | null;
  // The editor bridge for the in-card guided editor. When a node is selected, its card expands and
  // mounts NodeCardEditor, which reads this off context — no prop-drilling into node data.
  nodeEditor?: NodeEditorBridge | null;
  // Clicking the empty canvas dismisses whatever's open — the in-card editor, any floating overlay
  // (picker, profile, popovers). The host clears its overlay state; here we just forward the event.
  onPaneClick?: () => void;
  // The live operator presence: when set, Claude's cursor travels the canvas as it stages each node
  // and the camera follows it. Null when no operator work is on screen (the canvas reads normally).
  operatorCursor?: OperatorCursorState | null;
  // The durable, project-scoped People (P10.3) — promoted from real run entrants. A Source card reads
  // its channel's entrants out of this to show who actually entered, each with their own trigger.
  people?: Person[];
  // The literal one-coordinate-space unification: when present, every OTHER pipeline in the project
  // renders alongside `graph` as its own lane in the SAME React Flow instance (buildMergedFlowGraph),
  // instead of `graph` being the only thing on screen. `graph` stays "the focused pipeline" — the one
  // OperatorCursor/gate-review/proposal state applies to; everything else renders as a plain committed
  // lane. Absent or containing only one pipeline, behavior is identical to today's single-channel canvas.
  multiPipeline?: { channels: ChannelMeta[]; channelGraphs: Map<string, GTMGraph>; channelRunResults: Map<string, GTMRunResult | null> } | null;
  // "Open this pipeline" — pans the camera to that lane's center on the merged canvas. Navigation
  // only; unlike `selection` it never opens a node's editor. A fresh token re-pans even to the SAME
  // channel (e.g. re-picking it after drifting away). No-op outside merged mode.
  panTo?: { channelId: string; token: number; nodeId?: string } | null;
  // Open an agent's profile sheet from its monogram face on the canvas — the home of the deleted crew
  // strip's role. The host opens the same AgentProfile sheet the strip used to.
  onOpenAgentProfile?: (ref: string) => void;
  // The project's latest run numbers (real, from the run ledger), drawn on the focused pipeline's
  // Measure node. Null when no run has been recorded — the node then shows nothing (honest empty).
  runSummary?: RunSummary | null;
}) {
  const handleSelect = useCallback((id: string) => onSelect(id), [onSelect]);
  // Inspector — the workbench's read surface. A node's record-count opens its real items as a card in
  // canvas space (pans/zooms with the graph). Local to the canvas: it reads `result`, mutates nothing.
  const [inspecting, setInspecting] = useState<Set<string>>(() => new Set());
  const toggleInspect = useCallback((id: string) => {
    setInspecting((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const closeInspect = useCallback((id: string) => {
    setInspecting((cur) => { if (!cur.has(id)) return cur; const next = new Set(cur); next.delete(id); return next; });
  }, []);
  // Camera-follow break: the founder grabbed the canvas to look away from where Claude is working.
  // We pause the follow and offer a "Back to Claude" pill; the recenter nonce re-engages it.
  const [followBroken, setFollowBroken] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);
  // When the operator presence clears, re-engage follow for next time. Adjusting state during render
  // from a changed prop is React's sanctioned pattern — no effect, no cascading render.
  const cursorActive = !!operatorCursor;
  const [trackedCursorActive, setTrackedCursorActive] = useState(cursorActive);
  if (cursorActive !== trackedCursorActive) {
    setTrackedCursorActive(cursorActive);
    if (!cursorActive) setFollowBroken(false);
  }
  const editable = variant !== "ideation" && !!onAddNode;

  // Render-time auto-layout — what actually drives what's on screen.
  // The composer ships cramped/overlapping positions, and the persistence round-trip (the effect
  // below) can't be trusted to reach every render path. So we lay every graph out by DAG depth AT
  // RENDER and let a manual drag override per node. Multi-channel overviews get the same rank-based layout: their
  // systems are disconnected subgraphs, so each pipeline stage shares a rank column and the systems
  // stack into rows within it — a readable left-to-right multi-system grid (this replaced the old
  // pre-laid swimlane positions). Only the ideation preview keeps its own pre-laid positions, since
  // it builds in with a staggered entrance keyed off those x's. A fresh topology clears the drag
  // overrides so a re-compose re-lays the whole flow.
  // A pipeline is auto-laid ONCE, the first time it's seen this session, so a freshly composed graph
  // (the composer ships cramped, overlapping positions) reads as a clean left-to-right flow. After that
  // seed the founder OWNS the layout: stored positions paint as-is, nothing re-ranks on a render or when
  // a step is dropped in, and Auto-arrange is the only thing that re-lays. `autoLaidRef` remembers which
  // pipelines have been seeded this session.
  const autoLaidRef = useRef<Set<string>>(new Set());
  const layoutSig = `${topologySignature(graph)}|${graph.id}`;
  const autoPos = useMemo(
    () => (graph.id === "ideation-preview" ? null : computeLayout(graph)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutSig],
  );
  const laidOutGraph = useMemo(() => {
    // Ideation preview keeps its own pre-laid positions; a seeded pipeline paints its stored positions
    // untouched (the free node canvas); only a not-yet-seeded pipeline gets the one-time rank layout so
    // it isn't shown cramped for the frame before the seed effect persists. `autoLaidRef` never changes
    // within a render, so reading it here is render-stable (the seed effect flips it, which re-renders
    // via the persisted positions).
    // eslint-disable-next-line react-hooks/refs
    if (!autoPos || autoLaidRef.current.has(graph.id)) return graph;
    return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, position: autoPos.get(n.id) ?? n.position })) };
  }, [graph, autoPos]);

  // Seed a pipeline's layout ONCE per session: the first time we see this graph id, persist the rank
  // layout so its cramped composer positions become the clean starting flow. After that the founder's
  // positions are the truth — dropping a step or dragging a node never triggers a re-lay (Auto-arrange does).
  useEffect(() => {
    if (graph.id === "ideation-preview") return;
    if (autoLaidRef.current.has(graph.id)) return;
    autoLaidRef.current.add(graph.id);
    if (!onNodePositionChange) return;
    const layout = computeLayout(graph);
    for (const node of graph.nodes) {
      const p = layout.get(node.id);
      if (p && (p.x !== node.position?.x || p.y !== node.position?.y)) {
        onNodePositionChange(node.id, p, "layout");
      }
    }
  }, [graph, onNodePositionChange]);

  // Auto-arrange — the one explicit tidy. Re-rank the whole pipeline left-to-right and persist it; the
  // founder presses it, it never runs on its own.
  const autoArrange = useCallback(() => {
    autoLaidRef.current.add(graph.id);
    if (!onNodePositionChange) return;
    const layout = computeLayout(graph);
    for (const node of graph.nodes) {
      const p = layout.get(node.id);
      if (p) onNodePositionChange(node.id, p, "layout");
    }
  }, [graph, onNodePositionChange]);

  // The merged multi-pipeline build — every other pipeline as its own lane alongside `graph` (the
  // focused one, which carries all the "active" state: running/selection/proposal/gate-review). Built
  // unconditionally alongside the single-channel flow below (cheap — one channel's worth of nodes) so
  // both memos stay unconditional hooks; only the RENDERED nodes/edges pick one or the other.
  const merged = useMemo(
    () => (multiPipeline ? buildMergedFlowGraph(
      multiPipeline.channels,
      multiPipeline.channelGraphs,
      multiPipeline.channelRunResults,
      connectors,
      subsystemHealth,
      contractAudits,
      handleSelect,
      {
        channelId: graph.id,
        running, runningNodeId, selection,
        proposedNodeIds, proposedEdgeIds, proposalActive,
        onResolveProposal, onSubmitReview, onApproveGate, gatePromote, gateOffer, onRecordOutcome,
        onRefineItem, revealedNodeIds, onInspect: toggleInspect, runSummary,
      },
      people,
      onAskClaude,
      onOpenAgentProfile,
    ) : null),
    [
      multiPipeline, connectors, subsystemHealth, contractAudits, handleSelect, graph.id, running,
      runningNodeId, selection, proposedNodeIds, proposedEdgeIds, proposalActive, onResolveProposal,
      onSubmitReview, onApproveGate, gatePromote, gateOffer, onRecordOutcome, onRefineItem, revealedNodeIds, toggleInspect, people, onAskClaude, onOpenAgentProfile, runSummary,
    ],
  );

  const singleFlow = useMemo(
    () => buildFlowGraph(laidOutGraph, result, running, runningNodeId, selection, connectors, subsystemHealth, contractAudits, handleSelect, proposedNodeIds, proposedEdgeIds, highlightedNodeId, proposalActive, onResolveProposal, onSubmitReview, onApproveGate, bloomNodeId, revealedNodeIds, toggleInspect, people, onAskClaude, gatePromote, gateOffer, onRecordOutcome, onOpenAgentProfile, runSummary, onRefineItem),
    [laidOutGraph, result, running, runningNodeId, selection, connectors, subsystemHealth, contractAudits, handleSelect, proposedNodeIds, proposedEdgeIds, highlightedNodeId, proposalActive, onResolveProposal, onSubmitReview, onApproveGate, bloomNodeId, revealedNodeIds, toggleInspect, people, onAskClaude, gatePromote, gateOffer, onRecordOutcome, onOpenAgentProfile, runSummary, onRefineItem],
  );

  const baseNodes = merged ? merged.nodes : singleFlow.nodes;
  const baseEdges = merged ? merged.edges : singleFlow.edges;

  // Pipeline intelligence — a pure read of the SHAPE (structuralWarnings) + Explain mode, injected onto
  // the already-built flow graph so buildFlowGraph stays a pure topology mapper. Node warnings key off
  // each card's REAL node id (data.node.id — unprefixed on both the single and merged builds); the
  // weak-feed edge class keys off the raw edge id (namespaced on the merged canvas, so the focused
  // lane's prefix is stripped). Read only the focused pipeline: on the merged overview other lanes stay
  // unmarked, since node/edge ids are unique only within one pipeline.
  const [explainMode, setExplainMode] = useState(false);
  const [warnIndex, setWarnIndex] = useState(0);
  // Rationale fetched on demand for a pipeline composed before Explain existed (its nodes/edges carry
  // none). Held locally and overlaid — the server also persists it, so a reload has it baked in.
  const [fetchedRat, setFetchedRat] = useState<{ n: Map<string, string>; e: Map<string, string> } | null>(null);
  const explainedRef = useRef<string | null>(null);
  const warnings = useMemo(() => structuralWarnings(laidOutGraph), [laidOutGraph]);
  const warnByNode = useMemo(() => warningsByNode(warnings), [warnings]);
  const weakEdges = useMemo(() => weakEdgeIds(warnings), [warnings]);
  const worthLook = useMemo(() => worthALookCount(warnings), [warnings]);
  const warnedNodeIds = useMemo(
    () => [...new Set(warnings.filter((w) => w.nodeId).map((w) => w.nodeId!))],
    [warnings],
  );
  const focusPrefix = merged ? `${graph.id}::` : "";
  const nodes = useMemo(() => baseNodes.map((n) => {
    if (merged && !n.id.startsWith(focusPrefix)) return n;
    const rawId = (n.data as GTMNodeData | undefined)?.node?.id;
    const warning = rawId ? warnByNode.get(rawId) : undefined;
    if (!warning && !explainMode) return n;
    const explainRationale = rawId ? fetchedRat?.n.get(rawId) : undefined;
    return { ...n, data: { ...(n.data as GTMNodeData), warning, explainMode, explainRationale } };
  }), [baseNodes, merged, focusPrefix, warnByNode, explainMode, fetchedRat]);
  const edges = useMemo(() => {
    if (weakEdges.size === 0) return baseEdges;
    return baseEdges.map((e) => {
      const rawId = focusPrefix && e.id.startsWith(focusPrefix) ? e.id.slice(focusPrefix.length) : e.id;
      return weakEdges.has(rawId) ? { ...e, className: cn((e as Edge).className, "loop-edge-weak") } : e;
    });
  }, [baseEdges, weakEdges, focusPrefix]);

  // The "N worth a look" chip steps the camera through each flagged card in turn (selecting it centers
  // it via NodeFocuser) — the fast path from "something's off" to the exact spot, no side list to scan.
  const stepToWarning = useCallback(() => {
    if (warnedNodeIds.length === 0) return;
    const id = warnedNodeIds[warnIndex % warnedNodeIds.length];
    setWarnIndex((i) => i + 1);
    onSelect(id);
  }, [warnedNodeIds, warnIndex, onSelect]);

  // Framing: a MULTI-lane overview (All pipelines) fits every lane, shrinking as needed to the zoomed-out
  // map. A single FOCUSED pipeline — whether rendered on its own (activeChannelId) or as the lone lane of
  // a one-pipeline product's overview — instead lands at a readable zoom: a `minZoom` floor keeps a wide
  // pipeline above the coin threshold (full-size cards, ~0.7–1.0) rather than fitting all of it to specks.
  const singlePipeline = !merged || merged.lanes.size <= 1;

  // When Explain turns on for a pipeline that carries no reasons yet (composed before Explain existed),
  // fetch them once from the explain endpoint and overlay. Idempotent server-side (no model call when
  // already annotated); a graph that already ships rationale skips the fetch entirely. Failure is quiet
  // — Explain still renders whatever reasons the graph already has.
  useEffect(() => {
    if (!explainMode || !singlePipeline) return;
    const gid = graph.id;
    if (!gid || explainedRef.current === gid) return;
    const hasAny = graph.nodes.some((n) => n.rationale) || graph.edges.some((e) => e.rationale);
    if (hasAny) return;
    explainedRef.current = gid;
    explainGraph(gid)
      .then((res) => {
        const nMap = new Map<string, string>();
        const eMap = new Map<string, string>();
        for (const nd of res.graph.nodes) if (typeof nd.rationale === "string" && nd.rationale.trim()) nMap.set(nd.id, nd.rationale);
        for (const ed of res.graph.edges) if (typeof ed.rationale === "string" && ed.rationale.trim()) eMap.set(ed.id, ed.rationale);
        if (nMap.size || eMap.size) setFetchedRat({ n: nMap, e: eMap });
      })
      .catch(() => { explainedRef.current = null; });
  }, [explainMode, singlePipeline, graph.id, graph.nodes, graph.edges]);

  const fitOptions = useMemo<FitOpts>(
    () => (singlePipeline ? { padding: 0.16, maxZoom: 1, minZoom: 0.72 } : { padding: 0.14, maxZoom: 1 }),
    [singlePipeline],
  );

  // Re-fit the viewport whenever the flow's structure changes (load, compose) — the merged canvas
  // reacts to every lane's topology, not just the focused one, so a newly loaded/composed pipeline
  // gets framed too.
  const fitSignature = useMemo(
    () => (merged ? `${merged.nodes.map((n) => n.id).sort().join(",")}|${merged.edges.map((e) => e.id).sort().join(",")}` : topologySignature(graph)),
    [merged, graph],
  );

  // Stable list of node ids for the measure guard — recomputed only when the set of nodes changes,
  // not on every layout-position round-trip, so the guard effect doesn't churn.
  const nodeIdSignature = useMemo(() => nodes.map((n) => n.id).sort().join(","), [nodes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const measureNodeIds = useMemo(() => nodes.map((n) => n.id), [nodeIdSignature]);

  // Where the nodes ACTUALLY are — changes as the async auto-layout settles, which is the signal
  // FitOnGraph debounces on (topology alone is stable before the layout round-trips into place).
  const boundsSignature = useMemo(
    () => nodes.map((n) => `${Math.round(n.position?.x ?? 0)},${Math.round(n.position?.y ?? 0)}`).join("|"),
    [nodes],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      // A drag is a real founder move: persist it (origin "drag" records it in history). On a seeded
      // pipeline stored positions already paint as-is, so there's nothing extra to pin.
      onNodePositionChange?.(node.id, node.position, "drag");
    },
    [onNodePositionChange],
  ) as Parameters<typeof ReactFlow>[0]["onNodeDragStop"];

  // React Flow v12 only makes a CONTROLLED `nodes` graph interactive when it's given `onNodesChange` —
  // without it the cards render but won't drag at all (the missing piece behind "I can't move it once
  // it's on the canvas"). We forward the in-progress drag frames so the controlled prop follows the
  // pointer smoothly; the final, undoable resting position is persisted by onNodeDragStop above. Only
  // position matters here — measurement and selection are handled internally / by our own click.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!onNodePositionChange) return;
      for (const change of changes) {
        if (change.type === "position" && change.dragging && change.position) {
          onNodePositionChange(change.id, change.position, "layout");
        }
      }
    },
    [onNodePositionChange],
  );

  const handleConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) onConnectNodes?.(connection.source, connection.target);
  }, [onConnectNodes]);

  // The live drop target for Crew/Skill drags is the outer canvas-area wrapper (App's onStepDrop),
  // which lands a node in a real focused pipeline — spinning up a scratch one if none is focused. The
  // click-to-add +Add button (onAddNode) is the counterpart gesture.

  const editorContext = useMemo<NodeEditorContextValue>(
    () => (nodeEditor ? { bridge: nodeEditor, graph, people } : null),
    [nodeEditor, graph, people],
  );

  // OperatorCursor positions itself off a plain GTMGraph's node positions (nodeById lookup, not React
  // Flow's rendered node store) — on the merged canvas the focused channel's real nodes sit in a lane,
  // so the cursor needs those same y-shifted positions or it'd point at the wrong spot on screen.
  const cursorGraph = useMemo(() => {
    const offsetY = merged?.lanes.get(graph.id)?.offsetY;
    if (!offsetY) return graph;
    return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, position: { x: n.position.x, y: n.position.y + offsetY } })) };
  }, [graph, merged]);

  return (
    <NodeEditorContext.Provider value={editorContext}>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      onNodeDragStop={handleNodeDragStop}
      onConnect={handleConnect}
      onEdgesDelete={(deleted) => onDeleteEdges?.(deleted.map((edge) => edge.id))}
      onPaneClick={onPaneClick}
      // A user-initiated pan/zoom (event is non-null; programmatic setCenter passes null) breaks the
      // camera-follow so the founder can look away from Claude's work without being yanked back.
      onMoveStart={(event) => { if (event && operatorCursor) setFollowBroken(true); }}
      fitView
      fitViewOptions={fitOptions}
      minZoom={0.15}
      maxZoom={1.8}
      nodesConnectable={editable && !running}
      edgesFocusable={editable}
      edgesReconnectable={false}
      deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
      proOptions={{ hideAttribution: true }}
      className={cn(variant === "ideation" && "ideation-canvas", selection && "loop-pane-focus")}
    >
      <NodeFocuser selection={selection} panelOpen={!!panelOpen} active={!running && !operatorCursor} />
      {merged ? <LanePanner panTo={panTo} lanes={merged.lanes} /> : null}
      {operatorCursor ? (
        <OperatorCursor graph={cursorGraph} state={operatorCursor} followBroken={followBroken} recenterSignal={recenterSignal} />
      ) : null}
      {operatorCursor && followBroken ? (
        <Panel position="top-right">
          <button
            type="button"
            className="op-cursor-back"
            onClick={() => { setFollowBroken(false); setRecenterSignal((n) => n + 1); }}
          >
            <MousePointer2 size={13} /> Back to Claude
          </button>
        </Panel>
      ) : null}
      {editable && singlePipeline && nodes.length > 1 ? (
        <Panel position="top-left">
          <button
            type="button"
            className="loop-auto-arrange"
            onClick={autoArrange}
            title="Tidy the pipeline into a left-to-right layout — you can rearrange freely after."
          >
            <Wand2 size={13} /> Auto-arrange
          </button>
        </Panel>
      ) : null}
      {/* Pipeline intelligence bar: the Explain toggle (off = the canvas is exactly as clean as today;
          on = every arrow says why and every teammate says why it's here) and the quiet amber tally of
          what's worth a look. Reads the pipeline's SHAPE, never a side drawer. */}
      {singlePipeline && nodes.length > 1 ? (
        <Panel position="top-right">
          <div className="loop-explain-bar">
            <div className="loop-explain-seg" role="group" aria-label="Explain mode">
              <button type="button" className={cn(!explainMode && "on")} aria-pressed={!explainMode} onClick={() => setExplainMode(false)}>Clean</button>
              <button type="button" className={cn(explainMode && "on")} aria-pressed={explainMode} onClick={() => setExplainMode(true)}>
                <span className="loop-explain-dot" aria-hidden />Explain
              </button>
            </div>
            {worthLook > 0 ? (
              <button type="button" className="loop-worth-chip" onClick={stepToWarning} title="Step through what's worth a look">
                <span className="loop-worth-b">{worthLook}</span> Worth a look
              </button>
            ) : null}
          </div>
        </Panel>
      ) : null}
      <MeasureGuard nodeIds={measureNodeIds} />
      <RunZoom running={running} />
      <FitOnGraph topology={fitSignature} bounds={boundsSignature} running={running} suspended={!!operatorCursor} fitOptions={fitOptions} />
      <Refitter nonce={refitNonce} fitOptions={fitOptions} />
      {result?.memoryApplied
        && (result.memoryApplied.approved + result.memoryApplied.rejected + result.memoryApplied.edits) > 0 && (
        <Panel position="top-center">
          <div className="loop-memory-banner">
            <Lightbulb />
            <span>
              This run learned from {result.memoryApplied.approved} approved
              {result.memoryApplied.rejected > 0 ? ` · ${result.memoryApplied.rejected} rejected` : ""}
              {result.memoryApplied.edits > 0 ? ` · ${result.memoryApplied.edits} edited` : ""}
              {" "}draft{(result.memoryApplied.approved + result.memoryApplied.rejected) !== 1 ? "s" : ""} you reviewed
            </span>
          </div>
        </Panel>
      )}
      {inspecting.size > 0 ? (
        <ViewportPortal>
          {[...inspecting].map((id) => {
            const n = laidOutGraph.nodes.find((nd) => nd.id === id);
            if (!n) return null;
            return <InspectorCard key={id} node={n} result={result?.nodes[id]} onClose={() => closeInspect(id)} />;
          })}
        </ViewportPortal>
      ) : null}
      {/* Slice 4: inline accept/discard for client-staged ghost EDGES that stand on their own. */}
      <GhostEdgeChips graph={laidOutGraph} />
      {/* Explain mode: the composer's one-line reason riding each ordered edge. */}
      <ExplainEdgeLayer graph={laidOutGraph} active={explainMode && singlePipeline} extra={fetchedRat?.e} />
      <Background color="#e4e4e7" gap={26} size={1.5} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
    </NodeEditorContext.Provider>
  );
}
