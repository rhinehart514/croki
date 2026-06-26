import "@/styles/canvas-refine.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, Handle, Panel, Position, ReactFlow,
  useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertCircle, Ban, Bot, Check, CheckCircle2, ChevronDown, Circle, Code, Database, FileSpreadsheet, GitMerge,
  Globe2, Loader, MessageSquare, Plus, Search, ShieldCheck, Sparkles, Target, TrendingUp, Wand2, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { healthHex } from "@/lib/health";
import type {
  ConnectorMeta, GateDecision, GTMEdge, GTMEdgeType, GTMGraph,
  GTMContractAudit, GTMNode, GTMNodeCategory, GTMNodeResult, GTMRunResult, NodeSelection,
} from "@/types";

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<GTMNodeCategory, React.ReactNode> = {
  resource: <Database />,
  source:   <Search />,
  context:  <Target />,
  enrich:   <GitMerge />,
  filter:   <Sparkles />,
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
  onResolveProposal?: (accept: boolean) => void;
  // Gate review (slice 5): for a founder gate node, resolve its staged drafts inline on the canvas.
  onSubmitReview?: (decisions: Record<string, GateDecision>) => void;
  onApproveGate?: () => void;
};


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
  if (!data.proposed || !data.proposalActive || !data.onResolveProposal) return null;
  const resolve = data.onResolveProposal;
  return (
    <div className="loop-proposal-inline nodrag nopan" role="group" aria-label="Accept or reject the proposed changes">
      <button
        type="button"
        className="loop-proposal-inline-btn accept"
        title="Accept the proposed changes"
        aria-label="Accept the proposed changes"
        onClick={(e) => { e.stopPropagation(); resolve(true); }}
      >
        <Check />
      </button>
      <button
        type="button"
        className="loop-proposal-inline-btn reject"
        title="Reject the proposed changes"
        aria-label="Reject the proposed changes"
        onClick={(e) => { e.stopPropagation(); resolve(false); }}
      >
        <X />
      </button>
    </div>
  );
}

// ─── Resource node (compact dark strip) ──────────────────────────────────────

function ResourceNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const { node, connectors, selected, onSelect, result } = data;
  const conn = connectors.find((c) => c.id === node.connector && c.category === "resource");
  const configured = conn ? conn.configured && !conn.stub : false;

  return (
    <>
    <button
      className={cn("loop-node loop-node-resource", selected && "loop-node-selected")}
      onClick={onSelect} type="button"
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
      <Handle type="source" position={Position.Right} />
    </button>
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
    <button
      className={cn("loop-node loop-node-context", selected && "loop-node-selected")}
      onClick={onSelect} type="button"
    >
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </button>
      <ProposalControls data={data} />
    </>
  );
}

// ─── Work node ────────────────────────────────────────────────────────────────

function WorkNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const { node, result, running, selected, onSelect } = data;
  const status  = getStatus(node, result, running);
  const summary = result ? itemSummary(result) : null;
  const hasErr  = status === "error" || status === "blocked";
  const visual  = nodeVisual(node);
  const color   = visual.color;
  const isOpenKind = !!node.kind && node.kind !== "tool";

  return (
    <>
    <button
      className={cn(
        "loop-node",
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
      onClick={onSelect} type="button"
    >
      <Handle type="target" position={Position.Left} />
      <div className="loop-node-header">
        <div className="loop-node-icon" style={{ background: `${color}14`, color }}>
          {visual.icon}
        </div>
        <div className="loop-node-header-right">
          <span className="loop-node-type-label">{visual.label}</span>
          {typeof data.health === "number" && data.health > 0 && (
            <HealthPill health={data.health} issue={data.healthIssue} />
          )}
          <span className="loop-node-status"><StatusIcon status={status} /></span>
        </div>
      </div>
      <span className="loop-node-label">{node.label}</span>
      {/* The slug is a technical identifier, not the headline. It rides as a faint, single-line
          caption that never competes with the title; hover (the title attr) reveals the full ref. */}
      {isOpenKind
        ? <span className="loop-node-connector" title={node.ref}>{node.ref}</span>
        : node.connector && <span className="loop-node-connector" title={node.connector}>{node.connector}</span>}
      {data.contractAudit && ["waiting", "blocked", "blind"].includes(data.contractAudit.state) && (
        <span
          className={`loop-contract-badge state-${data.contractAudit.state}`}
          title={data.contractAudit.message}
        >
          {data.contractAudit.state === "blind" ? "Blind" :
            data.contractAudit.state === "blocked" ? `Needs ${data.contractAudit.missingFields[0] ?? "data"}` :
            "Waiting for input"}
        </span>
      )}
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
      <Handle type="source" position={Position.Right} />
    </button>
      <ProposalControls data={data} />
    </>
  );
}

// A portfolio lane: a translucent band behind one system's nodes, labelled with the system and its
// gate count. Non-interactive (pointer-events off) so it never intercepts a click meant for a node,
// and rendered behind the nodes (prepended to the node list, zIndex 0).
function LaneBandComponent({ data }: { data: { label: string; gateCount: number; width: number; height: number } }) {
  return (
    <div
      className="portfolio-lane-band"
      style={{
        width: data.width,
        height: data.height,
        pointerEvents: "none",
        border: "1px dashed var(--line, #d4d4d8)",
        borderRadius: 18,
        background: "rgba(244,244,245,0.45)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "absolute", top: 12, left: 16,
          fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
          color: "var(--faint, #71717a)",
        }}
      >
        {data.label}{data.gateCount ? ` · ${data.gateCount} gate${data.gateCount === 1 ? "" : "s"}` : ""}
      </div>
    </div>
  );
}

const NODE_TYPES = {
  resourceNode: ResourceNodeComponent,
  contextNode:  ContextNodeComponent,
  workNode:     WorkNodeComponent,
  laneBand:     LaneBandComponent,
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

// A portfolio fan-out lays each system out as its own horizontal lane: ranked left-to-right within
// the lane (only the lane's own edges count, so one system never pushes another's ranks), stacked
// top-to-bottom by laneIndex. This is what makes many composed systems toward one goal read as
// parallel lanes instead of one tangled DAG.
const LANE_PITCH = ROW_GAP * 3; // vertical distance between two lanes' baselines

function computeLaneLayout(graph: GTMGraph): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  for (const system of graph.systems ?? []) {
    const rank = longestPathRank(system.nodeIds, graph.edges);
    const baseY = system.laneIndex * LANE_PITCH;
    const byRank = new Map<number, string[]>();
    for (const id of system.nodeIds) {
      const r = rank.get(id) ?? 0;
      if (!byRank.has(r)) byRank.set(r, []);
      byRank.get(r)!.push(id);
    }
    for (const [r, group] of byRank) {
      group.forEach((id, i) => pos.set(id, { x: r * COLUMN_GAP, y: baseY + i * ROW_GAP }));
    }
  }
  return pos;
}

function computeLayout(graph: GTMGraph): Map<string, { x: number; y: number }> {
  if (graph.systems?.length) return computeLaneLayout(graph);
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

// ─── Mode lens ──────────────────────────────────────────────────────────────
// The five program modes are not separate surfaces — they re-skin this one graph. A mode
// emphasizes the nodes it is about and dims the rest, so the same canvas answers a different
// question. Design and Run light everything (Run shows the whole trace); Simulation and Review
// foreground the wall; Learning foregrounds what the feedback loop touches. Pure visual — a lens
// never changes behavior or what runs.
function lensClass(node: GTMNode, mode?: string): string {
  if (!mode || mode === "design" || mode === "run") return "";
  const agent = node.kind === "agent";
  const focus =
    mode === "simulation" ? node.category === "gate" || node.category === "execute" || agent :
    mode === "review" ? node.category === "gate" :
    mode === "learning" ? node.category === "measure" || agent :
    true;
  return focus ? "loop-node-lens-focus" : "loop-node-lens-dim";
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
  mode?: string,
  proposedNodeIds?: Set<string>,
  proposedEdgeIds?: Set<string>,
  highlightedNodeId?: string | null,
  proposalActive?: boolean,
  onResolveProposal?: (accept: boolean) => void,
  onSubmitReview?: (nodeId: string, decisions: Record<string, GateDecision>) => void,
  onApproveGate?: (nodeId: string) => void,
  bloomNodeId?: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n) => {
    const sub = subsystemHealth[n.category];
    return {
      id: n.id,
      type: nodeType(n.category),
      position: n.position,
      draggable: true,
      selectable: false,
      className: [
        lensClass(n, mode),
        proposedNodeIds?.has(n.id) ? "loop-node-proposed" : "",
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
        onResolveProposal,
        onSubmitReview: onSubmitReview ? (decisions: Record<string, GateDecision>) => onSubmitReview(n.id, decisions) : undefined,
        onApproveGate: onApproveGate ? () => onApproveGate(n.id) : undefined,
      } as GTMNodeData,
    };
  });

  // Portfolio swimlanes: one band behind each system, sized to its nodes' bounds. Prepended so they
  // paint behind the work nodes. Skipped entirely for a single-system graph (no graph.systems).
  const laneBands: Node[] = [];
  if (graph.systems?.length) {
    const NODE_W = 240, NODE_H = 150, PAD = 44;
    for (const system of graph.systems) {
      const members = graph.nodes.filter((n) => system.nodeIds.includes(n.id) && n.position);
      if (!members.length) continue;
      const xs = members.map((n) => n.position!.x);
      const ys = members.map((n) => n.position!.y);
      const minX = Math.min(...xs) - PAD;
      const minY = Math.min(...ys) - PAD - 16; // extra top room for the lane label
      const width = Math.max(...xs) + NODE_W + PAD - minX;
      const height = Math.max(...ys) + NODE_H + PAD - minY;
      laneBands.push({
        id: `lane-${system.id}`,
        type: "laneBand",
        position: { x: minX, y: minY },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: 0,
        style: { zIndex: 0 },
        data: { label: system.label, gateCount: system.gateIds?.length ?? 0, width, height },
      });
    }
  }

  const edges: Edge[] = graph.edges.map((e: GTMEdge) => {
    // Animate the edge feeding the active step — data visibly flowing in.
    const active = e.edgeType === "data" && runningNodeId === e.target && !!result?.nodes[e.source]?.ok;
    const base = edgeStyle(e.edgeType);
    const proposed = proposedEdgeIds?.has(e.id);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      ...base,
      ...(active ? { animated: true, className: "loop-edge-data loop-edge-active" } : {}),
      ...(proposed ? { className: `${base.className ?? ""} loop-edge-proposed`.trim(), animated: true } : {}),
    };
  });

  return { nodes: [...laneBands, ...nodes], edges };
}

const STEP_OPTIONS: Array<{
  label: string;
  detail: string;
  icon: React.ReactNode;
  spec: Partial<GTMNode> & { label: string };
}> = [
  { label: "Manual input", detail: "Paste or enter rows", icon: <Database />, spec: { label: "Manual input", category: "source", connector: "manual", config: { items: [] }, contract: { emits: [] } } },
  { label: "CSV input", detail: "Import tabular data", icon: <FileSpreadsheet />, spec: { label: "CSV input", category: "source", connector: "csv", config: { csv: "" }, contract: { emits: [] } } },
  { label: "API input", detail: "Pull JSON records", icon: <Globe2 />, spec: { label: "API input", category: "source", connector: "api", config: { endpoint: "" }, contract: { emits: [] } } },
  { label: "Agent", detail: "Claude or Codex judgment", icon: <Bot />, spec: { label: "Agent step", category: "generate", kind: "agent", ref: "gtm-enrich", config: {}, contract: { accepts: [], emits: [] } } },
  { label: "Skill", detail: "Reusable working method", icon: <Wand2 />, spec: { label: "Skill step", category: "generate", kind: "skill", ref: "positioning", config: {}, contract: { accepts: [], emits: [] } } },
  { label: "Code", detail: "Deterministic transform", icon: <Code />, spec: { label: "Code step", category: "filter", kind: "code", ref: "transform", config: {}, contract: { accepts: [], emits: [] } } },
  { label: "Founder gate", detail: "Review before outside action", icon: <ShieldCheck />, spec: { label: "Founder review", category: "gate", connector: "default", config: {}, contract: { accepts: [], emits: ["approved", "gtmActionId"] } } },
  { label: "Staged output", detail: "Local queue, never auto-send", icon: <Zap />, spec: { label: "Stage approved actions", category: "execute", connector: "local", config: {}, contract: { accepts: ["approved", "gtmActionId"], emits: ["gtmActionId", "executionStatus"] } } },
  { label: "Measure", detail: "Capture attributable outcomes", icon: <TrendingUp />, spec: { label: "Measure outcomes", category: "measure", connector: "default", config: { joinKey: "gtmActionId" }, contract: { accepts: ["gtmActionId", "source"], emits: ["attribution"] } } },
];

function StepPalette({
  empty, disabled, onAddNode, onLoadRecipe, onOpenLibrary,
}: {
  empty: boolean;
  disabled: boolean;
  onAddNode: (spec: Partial<GTMNode> & { label: string }) => void;
  onLoadRecipe?: () => void;
  // Opens the full LibraryPalette (the summoned replacement for the left-rail Library). When wired,
  // the menu leads with it so the founder reaches the personalized + on-disk capabilities, not just
  // the fixed primitives below.
  onOpenLibrary?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Panel position="top-left">
      <div className="workflow-palette">
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          className="workflow-palette-trigger"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <Plus /> Add step <ChevronDown />
        </button>
        {open ? (
          <div className="workflow-palette-menu" role="menu">
            {onOpenLibrary ? (
              <button className="workflow-recipe" onClick={() => { onOpenLibrary(); setOpen(false); }} role="menuitem" type="button">
                <Bot />
                <span><strong>Browse the library</strong><small>Your agents and skills — search, drag, or add</small></span>
              </button>
            ) : null}
            {empty && onLoadRecipe ? (
              <button className="workflow-recipe" onClick={() => { onLoadRecipe(); setOpen(false); }} role="menuitem" type="button">
                <Sparkles />
                <span><strong>Pilot outreach recipe</strong><small>Input → research → draft → gate → stage → measure</small></span>
              </button>
            ) : null}
            {STEP_OPTIONS.map((option) => (
              <button
                key={option.label}
                onClick={() => { onAddNode(option.spec); setOpen(false); }}
                role="menuitem"
                type="button"
              >
                {option.icon}
                <span><strong>{option.label}</strong><small>{option.detail}</small></span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function ContractAuditPanel({
  graph, audits, onSelect,
}: {
  graph: GTMGraph;
  audits: Record<string, GTMContractAudit>;
  onSelect: (id: string) => void;
}) {
  const issues = graph.nodes
    .map((node) => ({ node, audit: audits[node.id] }))
    .filter(({ audit }) => audit && ["waiting", "blocked", "blind"].includes(audit.state));
  const [open, setOpen] = useState(false);
  return (
    <Panel position="top-right">
      {/* Collapsed by default to a compact chip so it never crushes the canvas; expands on click. */}
      <div className={`workflow-audit ${open ? "open" : ""}`} aria-label="Workflow contract audit">
        <button className="workflow-audit-head" onClick={() => setOpen((v) => !v)} type="button" aria-expanded={open}>
          <strong>Pipeline audit</strong>
          <span className={issues.length ? "has-issues" : ""}>{issues.length === 0 ? "Clear" : `${issues.length} issue${issues.length === 1 ? "" : "s"}`}</span>
        </button>
        {open ? issues.slice(0, 5).map(({ node, audit }) => (
          <button key={node.id} className="workflow-audit-row" onClick={() => onSelect(node.id)} type="button">
            <span className={`workflow-audit-dot state-${audit.state}`} />
            <span><strong>{node.label}</strong><small>{audit.message}</small></span>
          </button>
        )) : null}
      </div>
    </Panel>
  );
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
function FitOnGraph({ topology, bounds, running }: { topology: string; bounds: string; running: boolean }) {
  const { fitView } = useReactFlow();
  const fittedTopology = useRef<string | null>(null);
  useEffect(() => {
    if (running) return;                              // don't fight RunZoom
    if (fittedTopology.current === topology) return;  // already framed this graph; leave drags alone
    const t = setTimeout(() => {
      fittedTopology.current = topology;
      fitView({ padding: 0.14, maxZoom: 1, duration: 360 });
    }, 140);
    return () => clearTimeout(t);
  }, [topology, bounds, running, fitView]);
  return null;
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

export function GraphCanvas({
  graph, result, running, runningNodeId = null, selection, connectors, subsystemHealth = {}, contractAudits = {},
  onSelect, onNodePositionChange, onConnectNodes, onDeleteEdges, onAddNode, onLoadRecipe, panelOpen, variant, mode,
  proposedNodeIds, proposedEdgeIds, proposalActive, onResolveProposal, onSubmitReview, onApproveGate, refitNonce, highlightedNodeId = null,
  bloomNodeId = null, onOpenLibrary,
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
  // The active program mode, applied as a visual lens over the one graph (see lensClass).
  mode?: string;
  // Nodes/edges the operator has STAGED but not applied — rendered as ghosts for founder review.
  proposedNodeIds?: Set<string>;
  proposedEdgeIds?: Set<string>;
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
}) {
  const handleSelect = useCallback((id: string) => onSelect(id), [onSelect]);
  const editable = variant !== "ideation" && !!onAddNode;

  // Lay the graph out cleanly whenever its topology changes (load, compose, add/remove a node).
  // Position-only updates (manual drags) don't change the signature, so a drag is never undone.
  const lastTopology = useRef<string | null>(null);
  useEffect(() => {
    if (!onNodePositionChange) return;
    const sig = topologySignature(graph);
    if (sig === lastTopology.current) return;
    lastTopology.current = sig;
    const layout = computeLayout(graph);
    for (const node of graph.nodes) {
      const p = layout.get(node.id);
      if (p && (p.x !== node.position?.x || p.y !== node.position?.y)) {
        onNodePositionChange(node.id, p);
      }
    }
  }, [graph, onNodePositionChange]);

  const { nodes, edges } = useMemo(
    () => buildFlowGraph(graph, result, running, runningNodeId, selection, connectors, subsystemHealth, contractAudits, handleSelect, mode, proposedNodeIds, proposedEdgeIds, highlightedNodeId, proposalActive, onResolveProposal, onSubmitReview, onApproveGate, bloomNodeId),
    [graph, result, running, runningNodeId, selection, connectors, subsystemHealth, contractAudits, handleSelect, mode, proposedNodeIds, proposedEdgeIds, highlightedNodeId, proposalActive, onResolveProposal, onSubmitReview, onApproveGate, bloomNodeId],
  );

  // Re-fit the viewport whenever the flow's structure changes (load, compose, lanes
  // appearing). Includes the system lanes so a portfolio fan-out re-frames too.
  const fitSignature = useMemo(
    () => `${topologySignature(graph)}|${(graph.systems ?? []).map((s) => s.id).join(",")}`,
    [graph],
  );

  // Where the nodes ACTUALLY are — changes as the async auto-layout settles, which is the signal
  // FitOnGraph debounces on (topology alone is stable before the layout round-trips into place).
  const boundsSignature = useMemo(
    () => nodes.map((n) => `${Math.round(n.position?.x ?? 0)},${Math.round(n.position?.y ?? 0)}`).join("|"),
    [nodes],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: Node) => { onNodePositionChange?.(node.id, node.position); },
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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeDragStop={handleNodeDragStop}
      onConnect={handleConnect}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onEdgesDelete={(deleted) => onDeleteEdges?.(deleted.map((edge) => edge.id))}
      fitView
      fitViewOptions={{ padding: 0.14, maxZoom: 1 }}
      minZoom={0.15}
      maxZoom={1.8}
      nodesConnectable={editable && !running}
      edgesFocusable={editable}
      edgesReconnectable={false}
      deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
      proOptions={{ hideAttribution: true }}
      className={variant === "ideation" ? "ideation-canvas" : undefined}
    >
      <NodeFocuser selection={selection} panelOpen={!!panelOpen} active={!running} />
      <RunZoom running={running} />
      <FitOnGraph topology={fitSignature} bounds={boundsSignature} running={running} />
      <Refitter nonce={refitNonce} />
      {editable && onAddNode ? (
        <StepPalette empty={graph.nodes.length === 0} disabled={running} onAddNode={onAddNode} onLoadRecipe={onLoadRecipe} onOpenLibrary={onOpenLibrary} />
      ) : null}
      {variant !== "ideation" ? <ContractAuditPanel graph={graph} audits={contractAudits} onSelect={onSelect} /> : null}
      {result?.memoryApplied
        && (result.memoryApplied.approved + result.memoryApplied.rejected + result.memoryApplied.edits) > 0 && (
        <Panel position="top-center">
          <div className="loop-memory-banner">
            <Sparkles />
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
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}
