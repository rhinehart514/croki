import "@/styles/canvas-refine.css";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, Handle, MarkerType, Panel, Position, ReactFlow,
  useReactFlow, useStore, useNodesInitialized, useUpdateNodeInternals, ViewportPortal,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "motion/react";
import {
  AlertCircle, Ban, Bot, Check, CheckCircle2, Circle, Code, CornerDownLeft, Database, FileText, GitMerge,
  Loader, Lock, MessageSquare, MousePointer2, Pencil, Play, Search, ShieldCheck, Lightbulb, Sprout, Target,
  Telescope, Trash2, TrendingUp, Wand2, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { healthHex } from "@/lib/health";
import { agentPersona, FAMILY_TINT } from "@/lib/agentPersona";
import { useBrandGlyph } from "@/lib/brandGlyph";
import { BrandGlyph } from "@/components/BrandGlyph";
import type { NodeEditorBridge } from "@/components/ProgramCanvas";
import type {
  ConnectorMeta, GateDecision, GTMEdge, GTMEdgeType, GTMGraph,
  GTMContractAudit, GTMNode, GTMNodeCategory, GTMNodeResult, GTMRunResult, NodeSelection,
  Person, PersonAppearance,
} from "@/types";

// The in-card editor needs the same handler bag the old right rail held (run a step, save the
// graph, open an artifact, delete, review a gate) plus the live graph (to clone-and-save a notes
// edit). We thread both through React context — not node data — so buildFlowGraph stays a pure
// topology mapper and the editor reads the bridge directly.
type NodeEditorContextValue = { bridge: NodeEditorBridge; graph: GTMGraph; people: Person[] } | null;
const NodeEditorContext = React.createContext<NodeEditorContextValue>(null);

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
  agent: { color: INK,  label: "Agent", icon: <Bot /> },
  skill: { color: GREY, label: "Skill", icon: <Wand2 /> },
  code:  { color: GREY, label: "Code",  icon: <Code /> },
};

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
type CardObject = "source" | "teammate" | "gate" | "measure" | "step";
function cardObject(node: GTMNode): CardObject {
  if (node.category === "gate") return "gate";
  if (node.category === "measure") return "measure";
  if (node.category === "source") return "source";
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
  if (state === "satisfied" || state === "ready") return { verdict: "grounded", label: "Grounded", title: contractAudit?.message ?? "Contract satisfied" };
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
  // Ideation build animation: this node's left-to-right rank in its lane. When set, the card springs
  // in with a delay proportional to the rank, so a freshly composed workflow builds out node by node
  // instead of popping in whole. Unset on the main canvas (no entrance animation there).
  appearOrder?: number;
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
  if (status === "done")    return <CheckCircle2 style={{ color: "var(--proven)" }} />;
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
  if (node.kind === "agent") return "Runs a subagent on your subscription to do fuzzy judgment work.";
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

function NodeCardEditor({ node, result, health, contractAudit }: {
  node: GTMNode;
  result?: GTMNodeResult;
  health?: number;
  contractAudit?: GTMContractAudit;
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
  const contractState = contractAudit?.state;
  const contractTone =
    contractState === "blocked" || contractState === "blind" ? "danger" :
    contractState === "waiting" ? "gap" :
    contractState === "satisfied" || contractState === "ready" ? "proven" : "muted";
  const contractText =
    contractState === "blind" ? "Blind — no attribution source" :
    contractState === "blocked" ? `Needs ${contractAudit?.missingFields?.[0] ?? "data"}` :
    contractState === "waiting" ? "Waiting for input" :
    contractState === "satisfied" ? "Contract satisfied" :
    contractState === "ready" ? "Ready" : null;

  return (
    <section className="loop-node-editor nodrag nopan" onClick={stop} onKeyDown={stop} aria-label="Step editor">
      <CardSection label="What it does">
        <p className="loop-node-editor-desc">{cardDescription(node)}</p>
      </CardSection>

      {/* CONFIG — kind-specific and compact. Most kinds need no editable config here in v1. */}
      {isOpenKind && artifactType && node.ref ? (
        <CardSection label="Config">
          <div className="loop-node-editor-fileline">
            <span className="loop-node-editor-filelabel">{artifactType === "agent" ? "Agent file" : "Skill file"}</span>
            <code className="loop-node-editor-ref">{node.ref}</code>
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
        <CardSection label="Config">
          {result?.pendingReview || items > 0 ? (
            <p className="loop-node-editor-hint">{(result?.meta?.awaitingReview as number) ?? items} draft{items === 1 ? "" : "s"} waiting for your review.</p>
          ) : (
            <p className="loop-node-editor-hint">Nothing waiting. A run stages sends here and stops for your approval.</p>
          )}
          <button
            className="loop-node-editor-link"
            onClick={(e) => { stop(e); bridge.onApproveGate(node.id); }}
            type="button"
          >
            <ShieldCheck size={12} /> Review at the gate
          </button>
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
          onClick={(e) => { stop(e); bridge.onRunNode(node.id); }}
          type="button"
        >
          <Play size={13} /> Run step
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
        {result && !result.ok && (
          <span className="loop-node-err-text">{result.error?.slice(0, 40)}</span>
        )}
      </button>
      <Handle type="source" position={Position.Right} id="s-r" />
      {selected && (
        <NodeCardEditor node={node} result={result} health={data.health} contractAudit={data.contractAudit} />
      )}
    </div>
      <ProposalControls data={data} />
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
      className={cn("loop-node loop-node-context", selected && "loop-node-selected")}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
    >
      <Handle type="target" position={Position.Left} id="t-l" />
      <div className="loop-node-header">
        <div className="loop-node-icon" style={{ background: `${color}18`, color }}>
          {CATEGORY_ICON[node.category]}
        </div>
        <div className="loop-node-header-right">
          <span className="loop-node-type-label">{CATEGORY_LABEL[node.category]}</span>
          {typeof data.health === "number" && data.health > 0 && (
            <HealthPill health={data.health} issue={data.healthIssue} />
          )}
          {status !== "idle" && <StatusIcon status={status} />}
        </div>
      </div>
      <span className="loop-node-label">{node.label}</span>
      {preview && <span className="loop-node-preview">{preview}</span>}
      <Handle type="source" position={Position.Right} id="s-r" />
      {selected && (
        <NodeCardEditor node={node} result={result} health={data.health} contractAudit={data.contractAudit} />
      )}
    </motion.div>
      <ProposalControls data={data} />
    </>
  );
}

// ─── Work node ────────────────────────────────────────────────────────────────

function WorkNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const { node, result, running, selected, onSelect } = data;
  const ctx = useContext(NodeEditorContext);
  const status  = getStatus(node, result, running);
  const summary = result ? itemSummary(result) : null;
  const hasErr  = status === "error" || status === "blocked";
  const visual  = nodeVisual(node);
  const color   = visual.color;
  const isOpenKind = !!node.kind && node.kind !== "tool";
  // The card is typed by its GTM object, not its mechanical kind — the headline is the job.
  const obj = cardObject(node);
  const mode = obj === "source" ? sourceMode(node) : null;
  const trigger = obj === "source" ? sourceTrigger(node) : null;
  // The real entrants for this source's channel (read off context — empty on preview canvases). The
  // collapsed card shows the count; the opened card (editor) lists each with their own trigger.
  const entrants = obj === "source" ? sourceEntrants(ctx?.people, ctx?.graph.id ?? null, node) : [];
  // The judgment verdict replaces the bare health number — derived from real signals only.
  const verdict = nodeVerdict(data.health, data.contractAudit, mode);
  // An agent node reads as a person: the role name is the headline and a family-tinted monogram is the
  // icon, with the raw ref demoted to the faint slug below. Other kinds keep their connector icon.
  const persona = node.kind === "agent" && node.ref ? agentPersona(node.ref, node.label) : null;
  const tint = persona ? FAMILY_TINT[persona.family] : null;
  // External MCP capability: this step calls a real service (Notion, Gmail, Slack…). Show that
  // service's real logo, and whether it runs free (read) or sits behind your gate (write) — the wall,
  // legible on the card itself.
  const isMcp = node.kind === "mcp";
  const mcpServer = isMcp ? String(node.config?.server ?? node.ref?.split("/")[0] ?? "") : "";
  const mcpGlyph = useBrandGlyph(isMcp ? mcpServer : null);
  const mcpWrites = isMcp && node.config?.toolClass === "write";

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
      <Handle type="target" position={Position.Left} id="t-l" />
      {obj === "source" ? (
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
      ) : (
        // ── Teammate / Gate / Measure / Step ── job-first header: an icon (a persona monogram for a
        // Teammate, the brand mark for an MCP step), the quiet object label, the verdict, and status.
        <>
          <div className="loop-node-header">
            <div
              className={cn("loop-node-icon", isMcp && "loop-node-icon-brand")}
              style={persona && tint
                ? { background: tint.bg, color: tint.fg, borderRadius: 999, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }
                : isMcp ? undefined
                : { background: `${color}14`, color }}
            >
              {isMcp ? <BrandGlyph serverId={mcpServer} brand={selected} size={17} />
                : persona ? persona.monogram : visual.icon}
            </div>
            <div className="loop-node-header-right">
              <span className="loop-node-type-label">
                {obj === "teammate" ? "Teammate"
                  : obj === "gate" ? "Gate"
                  : obj === "measure" ? "Measure"
                  : isMcp ? (mcpGlyph?.title ?? mcpServer.replace(/^./, (c) => c.toUpperCase()))
                  : visual.label}
              </span>
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
            : node.connector && <span className="loop-node-connector" title={node.connector}>{node.connector}</span>}
          {summary && !hasErr && <span className="loop-node-count">{summary}</span>}
          {node.category === "generate" && (() => {
            const mem = result?.meta?.memory as { approved?: number; rejected?: number; edits?: number } | undefined;
            const learned = (mem?.approved ?? 0) + (mem?.rejected ?? 0) + (mem?.edits ?? 0);
            return learned > 0
              ? <span className="loop-node-memory">★ learned from {learned} decision{learned !== 1 ? "s" : ""}</span>
              : null;
          })()}
          {hasErr && result?.error && (
            <span className="loop-node-err-text">{result.error.slice(0, 55)}</span>
          )}
        </>
      )}
      <Handle type="source" position={Position.Right} id="s-r" />
      {selected && (
        <NodeCardEditor
          node={node}
          result={result}
          health={data.health}
          contractAudit={data.contractAudit}
        />
      )}
    </motion.div>
      <ProposalControls data={data} />
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

const NODE_TYPES = {
  resourceNode:   ResourceNodeComponent,
  contextNode:    ContextNodeComponent,
  workNode:       WorkNodeComponent,
  laneStatusNode: LaneStatusNodeComponent,
};

function nodeType(category: GTMNodeCategory): string {
  if (category === "resource") return "resourceNode";
  if (category === "context")  return "contextNode";
  return "workNode";
}

// ─── Edge style ───────────────────────────────────────────────────────────────

function edgeStyle(type: GTMEdgeType): Partial<Edge> {
  if (type === "context")  return { className: "loop-edge-context", type: "smoothstep" };
  if (type === "feedback") return { className: "loop-edge-feedback", type: "default", animated: true, style: { strokeDasharray: "5 5" } };
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
// the subset. Shared by the whole-graph layout and the per-lane portfolio layout so both rank the
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
    return {
      id: n.id,
      type: laneStatus ? "laneStatusNode" : nodeType(n.category),
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
        // amber ring (the one gate accent) so the eye lands on the wall the CanvasGate banner points to.
        bloomNodeId && bloomNodeId === n.id ? "cgate-node-bloom" : "",
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
        health: sub?.health,
        healthIssue: sub?.issue,
        contractAudit: contractAudits[n.id],
        proposed: proposedNodeIds?.has(n.id) ?? false,
        proposalActive: proposalActive ?? false,
        proposalLead: leadProposedId ? n.id === leadProposedId : true,
        onResolveProposal,
        onSubmitReview: onSubmitReview ? (decisions: Record<string, GateDecision>) => onSubmitReview(n.id, decisions) : undefined,
        onApproveGate: onApproveGate ? () => onApproveGate(n.id) : undefined,
        appearOrder,
      } as GTMNodeData,
    };
  });

  const posX = new Map(graph.nodes.map((n) => [n.id, n.position?.x ?? 0]));
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
      markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: EDGE_INK[e.edgeType] ?? EDGE_INK.data },
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
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      ...base,
      ...routing,
      ...(active ? { animated: true, className: "loop-edge-data loop-edge-active" } : {}),
      ...(proposed ? { className: `${base.className ?? ""} loop-edge-proposed ${edgeRevealed ? "is-revealed" : "is-unrevealed"}`.trim(), animated: true } : {}),
    };
  });

  return { nodes, edges };
}



// ─── Auto-center on selection ─────────────────────────────────────────────────

function NodeFocuser({ selection, panelOpen, active }: { selection: NodeSelection; panelOpen: boolean; active: boolean }) {
  const { getZoom, setCenter, getNode } = useReactFlow();

  useEffect(() => {
    // Don't yank the canvas while a run is streaming and auto-selecting each step.
    if (!active) return;
    if (!selection) return;
    const node = getNode(selection);
    if (!node) return;
    const w = (node.measured?.width ?? node.width ?? 200);
    const h = (node.measured?.height ?? node.height ?? 110);
    const cx = node.position.x + w / 2;
    const cy = node.position.y + h / 2;
    // When panel is open, shift the visual center left so the node doesn't hide behind it
    const zoom = getZoom();
    const panelShift = panelOpen ? -(160 / zoom) : 0;
    setCenter(cx + panelShift, cy, { zoom: Math.min(zoom, 0.95), duration: 380 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  return null;
}

// ─── The operator cursor — Claude, working on your canvas ─────────────────────
// Presence over the proposal machinery. Instead of describing a change in a wall of prose, a
// labelled cursor travels the canvas to each node as it's staged, captions what it's doing, and
// points at the gate when your review is needed. The camera follows the work (grab the canvas to
// break away). This is the WATCH beat; the inline ✓/✕/note on the lead ghost is the DECIDE beat
// that lands right where the cursor finishes. Renders in flow coordinates via ViewportPortal so it
// tracks pan/zoom for free; the pointer and tag counter-scale so they stay legible at any zoom.
export type OperatorCursorState = {
  phase: "build" | "rest" | "gate";
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
    : state.phase === "build" ? `Adding ${target.label}`
    : state.staged > 1 ? `Staged ${state.staged} steps` : "Staged it";
  const inv = zoom ? 1 / zoom : 1;
  return (
    <ViewportPortal>
      <div
        className={`op-cursor phase-${state.phase}`}
        style={{ transform: `translate(${(target.position?.x ?? 0) - 14}px, ${(target.position?.y ?? 0) - 14}px)` }}
        aria-hidden
      >
        <span className="op-cursor-arrow" style={{ transform: `scale(${inv})`, transformOrigin: "top left" }}>
          <MousePointer2 />
        </span>
        <div className="op-cursor-tag" style={{ transform: `scale(${inv})`, transformOrigin: "top left" }}>
          <span className="op-cursor-name">Claude</span>
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
function Refitter({ nonce }: { nonce?: number }) {
  const { fitView } = useReactFlow();
  const seen = useRef(nonce);
  useEffect(() => {
    if (nonce === undefined || nonce === seen.current) return;
    seen.current = nonce;
    const t = setTimeout(() => fitView({ padding: 0.14, maxZoom: 1, duration: 420 }), 90);
    return () => clearTimeout(t);
  }, [nonce, fitView]);
  return null;
}

// ─── Measure guard — make the nodes paint when the pane mounts at zero size ─────
// React Flow measures each node once, lazily (a ResizeObserver per card), and keeps a node
// `visibility: hidden` until it has a measured size. If the canvas mounts inside a container that is
// momentarily 0-height — the program workbench's `minmax(0, 1fr)` / `min-height: 0` grid chain
// hasn't resolved yet on a DIRECT boot into a program URL — the cards get measured as zero and never
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
function FitOnGraph({ topology, bounds, running, suspended }: { topology: string; bounds: string; running: boolean; suspended?: boolean }) {
  const { fitView } = useReactFlow();
  const fittedTopology = useRef<string | null>(null);
  useEffect(() => {
    if (running || suspended) return;                 // don't fight RunZoom or the operator cursor's follow
    if (fittedTopology.current === topology) return;  // already framed this graph; leave drags alone
    const t = setTimeout(() => {
      fittedTopology.current = topology;
      fitView({ padding: 0.14, maxZoom: 1, duration: 360 });
    }, 140);
    return () => clearTimeout(t);
  }, [topology, bounds, running, suspended, fitView]);
  return null;
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

export function GraphCanvas({
  graph, result, running, runningNodeId = null, selection, connectors, subsystemHealth = {}, contractAudits = {},
  onSelect, onNodePositionChange, onConnectNodes, onDeleteEdges, onAddNode, panelOpen, variant,
  proposedNodeIds, proposedEdgeIds, proposalActive, onResolveProposal, onSubmitReview, onApproveGate, refitNonce, highlightedNodeId = null,
  bloomNodeId = null, nodeEditor = null, revealedNodeIds, onPaneClick, operatorCursor = null, people = [],
}: {
  graph: GTMGraph;
  result: GTMRunResult | null;
  running: boolean;
  runningNodeId?: string | null;
  selection: NodeSelection;
  connectors: ConnectorMeta[];
  subsystemHealth?: Record<string, { health: number; issue?: string }>;
  contractAudits?: Record<string, GTMContractAudit>;
  onSelect: (id: string) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectNodes?: (source: string, target: string) => void;
  onDeleteEdges?: (edgeIds: string[]) => void;
  onAddNode?: (spec: Partial<GTMNode> & { label: string }) => void;
  onLoadRecipe?: () => void;
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
  // Bump to re-fit the viewport after the container resizes (debugger drawer open/close).
  refitNonce?: number;
  // The run scrubber's current step — this node glows, the rest dim, so a replay reads node-by-node.
  highlightedNodeId?: string | null;
  // The gate node to bloom (amber breathing ring) while a run pauses at the founder gate. The host
  // sets this to the pending gate id when drafts are staged; null clears the bloom.
  bloomNodeId?: string | null;
  // Opens the summoned LibraryPalette from the "+ Add step" control — the replacement for the old
  // left-rail Library. Adds a "Browse full library" entry to the step menu when provided.
  onOpenLibrary?: () => void;
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
}) {
  const handleSelect = useCallback((id: string) => onSelect(id), [onSelect]);
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
  // RENDER and let a manual drag override per node. Portfolios get the same rank-based layout: their
  // systems are disconnected subgraphs, so each pipeline stage shares a rank column and the systems
  // stack into rows within it — a readable left-to-right multi-system grid (this replaced the old
  // pre-laid swimlane positions). Only the ideation preview keeps its own pre-laid positions, since
  // it builds in with a staggered entrance keyed off those x's. A fresh topology clears the drag
  // overrides so a re-compose re-lays the whole flow.
  const draggedIds = useRef<Set<string>>(new Set());
  const layoutSig = `${topologySignature(graph)}|${graph.id}`;
  const autoPos = useMemo(
    () => (graph.id === "ideation-preview" ? null : computeLayout(graph)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutSig],
  );
  const laidOutGraph = useMemo(() => {
    if (!autoPos) return graph;
    return {
      ...graph,
      // draggedIds is a deliberately non-reactive mutable set: it's populated in the drag-stop event
      // handler (which must NOT re-render) and cleared in the topology-change effect below. Reading it
      // here only DECIDES which nodes the auto-layout may move; the set never changes WITHIN a render,
      // so this read is render-stable. State would either re-render on every drag-stop or fight the
      // reset. A ref is the right tool, so this read during render is intentional.
      // eslint-disable-next-line react-hooks/refs
      nodes: graph.nodes.map((n) =>
        draggedIds.current.has(n.id) ? n : { ...n, position: autoPos.get(n.id) ?? n.position }),
    };
  }, [graph, autoPos]);

  // Persist the computed positions for other readers, and reset drag overrides on a topology change.
  // The render above no longer depends on this round-trip succeeding — this is belt-and-suspenders.
  const lastTopology = useRef<string | null>(null);
  useEffect(() => {
    const sig = topologySignature(graph);
    if (sig === lastTopology.current) return;
    lastTopology.current = sig;
    draggedIds.current = new Set();
    if (!onNodePositionChange) return;
    const layout = computeLayout(graph);
    for (const node of graph.nodes) {
      const p = layout.get(node.id);
      if (p && (p.x !== node.position?.x || p.y !== node.position?.y)) {
        onNodePositionChange(node.id, p);
      }
    }
  }, [graph, onNodePositionChange]);

  const { nodes, edges } = useMemo(
    () => buildFlowGraph(laidOutGraph, result, running, runningNodeId, selection, connectors, subsystemHealth, contractAudits, handleSelect, proposedNodeIds, proposedEdgeIds, highlightedNodeId, proposalActive, onResolveProposal, onSubmitReview, onApproveGate, bloomNodeId, revealedNodeIds),
    [laidOutGraph, result, running, runningNodeId, selection, connectors, subsystemHealth, contractAudits, handleSelect, proposedNodeIds, proposedEdgeIds, highlightedNodeId, proposalActive, onResolveProposal, onSubmitReview, onApproveGate, bloomNodeId, revealedNodeIds],
  );

  // Re-fit the viewport whenever the flow's structure changes (load, compose, a system
  // appearing). Includes the system ids so a portfolio fan-out re-frames too.
  const fitSignature = useMemo(
    () => `${topologySignature(graph)}|${(graph.systems ?? []).map((s) => s.id).join(",")}`,
    [graph],
  );

  // Stable list of node ids for the measure guard — recomputed only when the set of nodes changes,
  // not on every layout-position round-trip, so the guard effect doesn't churn.
  const nodeIdSignature = useMemo(() => graph.nodes.map((n) => n.id).sort().join(","), [graph.nodes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const measureNodeIds = useMemo(() => graph.nodes.map((n) => n.id), [nodeIdSignature]);

  // Where the nodes ACTUALLY are — changes as the async auto-layout settles, which is the signal
  // FitOnGraph debounces on (topology alone is stable before the layout round-trips into place).
  const boundsSignature = useMemo(
    () => nodes.map((n) => `${Math.round(n.position?.x ?? 0)},${Math.round(n.position?.y ?? 0)}`).join("|"),
    [nodes],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      // This node is now founder-placed: the render-time auto-layout must stop overriding it.
      draggedIds.current.add(node.id);
      onNodePositionChange?.(node.id, node.position);
    },
    [onNodePositionChange],
  ) as Parameters<typeof ReactFlow>[0]["onNodeDragStop"];

  const handleConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) onConnectNodes?.(connection.source, connection.target);
  }, [onConnectNodes]);

  // The canvas is a drop target for the Library: drop an agent or skill and it becomes a node. The
  // founder's universal "feed the canvas" gesture (the +Add button is the click-to-add counterpart).
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (!onAddNode) return;
    const raw = event.dataTransfer.getData("application/gtm-capability");
    if (!raw) return;
    try {
      const { kind, ref, label } = JSON.parse(raw) as { kind: "agent" | "skill"; ref: string; label?: string };
      if (!ref) return;
      onAddNode({ label: label || ref, kind, category: "generate", ref, contract: { accepts: [], emits: [] } });
    } catch { /* ignore malformed drag payloads */ }
  }, [onAddNode]);
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!onAddNode) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, [onAddNode]);

  const editorContext = useMemo<NodeEditorContextValue>(
    () => (nodeEditor ? { bridge: nodeEditor, graph, people } : null),
    [nodeEditor, graph, people],
  );

  return (
    <NodeEditorContext.Provider value={editorContext}>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeDragStop={handleNodeDragStop}
      onConnect={handleConnect}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onEdgesDelete={(deleted) => onDeleteEdges?.(deleted.map((edge) => edge.id))}
      onPaneClick={onPaneClick}
      // A user-initiated pan/zoom (event is non-null; programmatic setCenter passes null) breaks the
      // camera-follow so the founder can look away from Claude's work without being yanked back.
      onMoveStart={(event) => { if (event && operatorCursor) setFollowBroken(true); }}
      fitView
      fitViewOptions={{ padding: 0.14, maxZoom: 1 }}
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
      {operatorCursor ? (
        <OperatorCursor graph={graph} state={operatorCursor} followBroken={followBroken} recenterSignal={recenterSignal} />
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
      <MeasureGuard nodeIds={measureNodeIds} />
      <RunZoom running={running} />
      <FitOnGraph topology={fitSignature} bounds={boundsSignature} running={running} suspended={!!operatorCursor} />
      <Refitter nonce={refitNonce} />
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
      <Background color="#e4e4e7" gap={26} size={1.5} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
    </NodeEditorContext.Provider>
  );
}
