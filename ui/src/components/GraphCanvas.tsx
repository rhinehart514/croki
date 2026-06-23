import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, Handle, Panel, Position, ReactFlow,
  useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertCircle, Ban, Bot, CheckCircle2, ChevronDown, Circle, Code, Database, FileSpreadsheet, GitMerge,
  Globe2, Loader, MessageSquare, Plus, Search, ShieldCheck, Sparkles, Target, TrendingUp, Wand2, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ConnectorMeta, GTMEdge, GTMEdgeType, GTMGraph,
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
};

// Health band → color, matching the engine's health thresholds.
function healthHex(health: number): string {
  if (health < 50) return "#dc2626";
  if (health < 70) return "#d97706";
  if (health < 85) return "#ca8a04";
  return "#16a34a";
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

// ─── Resource node (compact dark strip) ──────────────────────────────────────

function ResourceNodeComponent({ data }: NodeProps<Node<GTMNodeData>>) {
  const { node, connectors, selected, onSelect, result } = data;
  const conn = connectors.find((c) => c.id === node.connector && c.category === "resource");
  const configured = conn ? conn.configured && !conn.stub : false;

  return (
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
    <button
      className={cn(
        "loop-node",
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
      {isOpenKind
        ? <span className="loop-node-connector">{node.ref}</span>
        : node.connector && <span className="loop-node-connector">{node.connector}</span>}
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
  );
}

const NODE_TYPES = {
  resourceNode: ResourceNodeComponent,
  contextNode:  ContextNodeComponent,
  workNode:     WorkNodeComponent,
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
const COLUMN_GAP = 312;
const ROW_GAP = 176;

function topologySignature(graph: GTMGraph): string {
  const nodeIds = graph.nodes.map((n) => n.id).sort().join(",");
  const edgeKeys = graph.edges
    .filter((e) => e.edgeType !== "feedback")
    .map((e) => `${e.source}>${e.target}`).sort().join(",");
  return `${nodeIds}|${edgeKeys}`;
}

function computeLayout(graph: GTMGraph): Map<string, { x: number; y: number }> {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const order = graph.edges.filter(
    (e) => e.edgeType !== "feedback" && ids.has(e.source) && ids.has(e.target),
  );
  const adj = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  const indeg = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  for (const e of order) {
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const rank = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const queue = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const deg = new Map(indeg);
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of adj.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      deg.set(next, (deg.get(next) ?? 0) - 1);
      if ((deg.get(next) ?? 0) === 0) queue.push(next);
    }
  }
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
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n) => {
    const sub = subsystemHealth[n.category];
    return {
      id: n.id,
      type: nodeType(n.category),
      position: n.position,
      draggable: true,
      selectable: false,
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
      } as GTMNodeData,
    };
  });

  const edges: Edge[] = graph.edges.map((e: GTMEdge) => {
    // Animate the edge feeding the active step — data visibly flowing in.
    const active = e.edgeType === "data" && runningNodeId === e.target && !!result?.nodes[e.source]?.ok;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      ...edgeStyle(e.edgeType),
      ...(active ? { animated: true, className: "loop-edge-data loop-edge-active" } : {}),
    };
  });

  return { nodes, edges };
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
  empty, disabled, onAddNode, onLoadRecipe,
}: {
  empty: boolean;
  disabled: boolean;
  onAddNode: (spec: Partial<GTMNode> & { label: string }) => void;
  onLoadRecipe?: () => void;
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
  return (
    <Panel position="top-right">
      <div className="workflow-audit" aria-label="Workflow contract audit">
        <div className="workflow-audit-head">
          <strong>Pipeline audit</strong>
          <span>{issues.length === 0 ? "Clear" : `${issues.length} issue${issues.length === 1 ? "" : "s"}`}</span>
        </div>
        {issues.slice(0, 5).map(({ node, audit }) => (
          <button key={node.id} onClick={() => onSelect(node.id)} type="button">
            <span className={`workflow-audit-dot state-${audit.state}`} />
            <span><strong>{node.label}</strong><small>{audit.message}</small></span>
          </button>
        ))}
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
      fitView({ padding: 0.14, duration: 560 });
    }
  }, [running, getZoom, zoomTo, fitView]);

  return null;
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

export function GraphCanvas({
  graph, result, running, runningNodeId = null, selection, connectors, subsystemHealth = {}, contractAudits = {},
  onSelect, onNodePositionChange, onConnectNodes, onDeleteEdges, onAddNode, onLoadRecipe, panelOpen, variant,
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
    () => buildFlowGraph(graph, result, running, runningNodeId, selection, connectors, subsystemHealth, contractAudits, handleSelect),
    [graph, result, running, runningNodeId, selection, connectors, subsystemHealth, contractAudits, handleSelect],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: Node) => { onNodePositionChange?.(node.id, node.position); },
    [onNodePositionChange],
  ) as Parameters<typeof ReactFlow>[0]["onNodeDragStop"];

  const handleConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) onConnectNodes?.(connection.source, connection.target);
  }, [onConnectNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeDragStop={handleNodeDragStop}
      onConnect={handleConnect}
      onEdgesDelete={(deleted) => onDeleteEdges?.(deleted.map((edge) => edge.id))}
      fitView
      fitViewOptions={{ padding: 0.14 }}
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
      {editable && onAddNode ? (
        <StepPalette empty={graph.nodes.length === 0} disabled={running} onAddNode={onAddNode} onLoadRecipe={onLoadRecipe} />
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
