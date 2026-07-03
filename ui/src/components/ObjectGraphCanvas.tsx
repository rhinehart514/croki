import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, FileSearch, Mail, Play, Route, Shield, ShieldCheck,
} from "lucide-react";
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { compileObjectGraphPath, getObjectGraph } from "@/api";
import type { ObjectGraphEdge, ObjectGraphNode, ObjectGraphPathRecommendation, ObjectGraphView } from "@/types";
import "@/styles/object-graph.css";

const DOMAIN_X: Record<string, number> = {
  external: 0,
  market: 260,
  product: 260,
  strategy: 570,
  audience: 870,
  assets: 1120,
  runs: 1370,
  pipeline: 1640,
  customer: 1880,
  measurement: 1370,
  learning: 1640,
};

const DOMAIN_Y: Record<string, number> = {
  external: 90,
  market: 80,
  product: 350,
  strategy: 190,
  audience: 80,
  assets: 300,
  runs: 160,
  pipeline: 90,
  customer: 290,
  measurement: 440,
  learning: 470,
};

function labelForType(type: string | null) {
  return String(type || "loose").replace(/_/g, " ").toUpperCase();
}

function evidenceLabel(node: ObjectGraphNode) {
  if (node.origin === "founder") return "founder";
  if (!node.solidity) return "unsupported";
  if (node.solidity === "observed") return `scan ·${node.sources.length || node.evidence.length || 1}`;
  if (node.solidity === "researched") return `market ·${node.sources.length || node.evidence.length || 1}`;
  return node.solidity;
}

function primaryWeakness(node: ObjectGraphNode) {
  const order = ["performance", "execution", "measurement", "product", "specificity", "evidence"];
  return [...(node.weaknesses ?? [])]
    .filter((weakness) => weakness.status === "open")
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0] ?? null;
}

function weaknessShort(kind: string) {
  if (kind === "evidence") return "thin evidence";
  if (kind === "product") return "no product proof";
  if (kind === "measurement") return "no attribution";
  if (kind === "execution") return "no list";
  if (kind === "performance") return "not converting";
  if (kind === "specificity") return "too broad";
  return kind;
}

function nodeRole(node: ObjectGraphNode) {
  if (node.domain === "runs" && node.type === "gate") return "gate";
  if (node.maturity === "outcome") return "outcome";
  if (node.maturity === "execution" && (node.payload?.protects || node.payload?.reviewPayload)) return "outward";
  return "object";
}

function cardIcon(node: ObjectGraphNode) {
  const role = nodeRole(node);
  if (role === "gate") return <Shield aria-hidden="true" />;
  if (role === "outward") return <Mail aria-hidden="true" />;
  if (role === "outcome") return <CheckCircle2 aria-hidden="true" />;
  return <Route aria-hidden="true" />;
}

type CardData = {
  object: ObjectGraphNode;
  lit: boolean;
  weak: boolean;
  weakest: boolean;
};

function ObjectCard({ data, selected }: NodeProps<Node<CardData>>) {
  const weakness = primaryWeakness(data.object);
  return (
    <button
      type="button"
      className={[
        "object-card",
        `role-${nodeRole(data.object)}`,
        data.object.maturity,
        data.lit && "lit",
        data.weak && "weak",
        data.weakest && "weakest",
        selected && "selected",
      ].filter(Boolean).join(" ")}
    >
      <Handle type="target" position={Position.Left} className="object-handle" />
      {nodeRole(data.object) === "outward" ? (
        <div className="object-outward-band">Reaches outside · {String(data.object.payload?.protects || "staged")}</div>
      ) : null}
      <div className="object-card-type">
        {cardIcon(data.object)}
        <span>{labelForType(data.object.type)}</span>
      </div>
      <div className="object-card-statement">{data.object.statement}</div>
      <div className="object-card-foot">
        <span className={`object-evidence ${data.object.solidity || "unsupported"}`}>{evidenceLabel(data.object)}</span>
        {weakness ? (
          <span className="object-weakness">
            <AlertTriangle aria-hidden="true" />
            {weaknessShort(weakness.kind)}
          </span>
        ) : null}
      </div>
      {data.weakest && weakness ? (
        <div className="object-weakest-pill">weakest link · {weaknessShort(weakness.kind)}</div>
      ) : null}
      <Handle type="source" position={Position.Right} className="object-handle" />
    </button>
  );
}

const nodeTypes = { objectCard: ObjectCard };

function layoutNodes(nodes: ObjectGraphNode[], highlighted: Set<string>, weakestNodeId: string | null): Node<CardData>[] {
  const counts = new Map<string, number>();
  return nodes.map((object) => {
    const domain = object.domain || "external";
    const count = counts.get(domain) ?? 0;
    counts.set(domain, count + 1);
    const x = DOMAIN_X[domain] ?? 560;
    const y = (DOMAIN_Y[domain] ?? 180) + count * 154;
    const weak = Boolean(primaryWeakness(object));
    return {
      id: object.id,
      type: "objectCard",
      position: { x, y },
      data: { object, lit: highlighted.has(object.id), weak, weakest: object.id === weakestNodeId },
    };
  });
}

function layoutEdges(edges: ObjectGraphEdge[], highlighted: Set<string>): Edge[] {
  return edges.map((edge) => {
    const lit = highlighted.has(edge.id);
    const gateEdge = /:gate:/.test(edge.source) || /:gate:/.test(edge.target);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: lit ? edge.type.replace(/_/g, " ") : undefined,
      type: "smoothstep",
      markerEnd: lit ? { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "var(--ink)" } : undefined,
      className: ["object-edge", gateEdge && "gate", lit && "lit"].filter(Boolean).join(" "),
      data: { object: edge },
    };
  });
}

function FitOnLoad({ ready }: { ready: boolean }) {
  const rf = useReactFlow();
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => rf.fitView({ padding: 0.2, duration: 420 }), 50);
    return () => window.clearTimeout(t);
  }, [ready, rf]);
  return null;
}

export function ObjectGraphCanvas({ projectId }: { projectId: string | null }) {
  const [view, setView] = useState<ObjectGraphView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lens, setLens] = useState<"default" | "weakness">("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compileState, setCompileState] = useState<{ status: "idle" | "running" | "done" | "error"; message: string }>({ status: "idle", message: "" });

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getObjectGraph(projectId);
      setView(next);
      setSelectedId((current) => current && next.graph.nodes.some((node) => node.id === current) ? current : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const highlightedPath = view?.recommendation.highlighted[0] ?? null;
  const highlightedNodes = useMemo(() => new Set(highlightedPath?.nodeIds ?? []), [highlightedPath]);
  const highlightedEdges = useMemo(() => new Set(highlightedPath?.edgeIds ?? []), [highlightedPath]);
  const weakestNodeId = highlightedPath?.weakestLink?.nodeId ?? null;
  const nodes = useMemo(
    () => layoutNodes(view?.graph.nodes ?? [], highlightedNodes, weakestNodeId),
    [view, highlightedNodes, weakestNodeId],
  );
  const edges = useMemo(
    () => layoutEdges(view?.graph.edges ?? [], highlightedEdges),
    [view, highlightedEdges],
  );
  const selected = view?.graph.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedWeakness = selected ? primaryWeakness(selected) : null;

  const compile = useCallback(async () => {
    if (!projectId || !highlightedPath) return;
    setCompileState({ status: "running", message: "Compiling the highlighted path to the gate." });
    try {
      const result = await compileObjectGraphPath(projectId, { pathId: highlightedPath.pathId });
      const weakness = result.measurementWeakness && typeof result.measurementWeakness === "object"
        ? " Measurement needs repair before this run is easy to judge."
        : "";
      setCompileState({ status: "done", message: `Run staged at the founder gate.${weakness}` });
      void load();
    } catch (err) {
      setCompileState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [projectId, highlightedPath, load]);

  const softCount = view?.graph.nodes.filter((node) => primaryWeakness(node)).length ?? 0;
  const grounded = highlightedPath
    ? Math.round((highlightedPath.signals.evidenceStrength ?? 0) * Math.max(highlightedPath.nodeIds.length, 1))
    : 0;

  if (!projectId) {
    return <div className="object-graph-empty">Open a product to build the GTM graph.</div>;
  }

  return (
    <div className={`object-graph-shell lens-${lens}`}>
      <div className="object-path-header">
        <div>
          <div className="object-path-kicker">
            <ShieldCheck aria-hidden="true" />
            Strongest testable path
          </div>
          <strong>{highlightedPath ? pathHeadline(highlightedPath, view) : "No testable path yet"}</strong>
          <span>
            {highlightedPath
              ? `grounded ${grounded} of ${highlightedPath.nodeIds.length} · weakest: ${weakestNodeId ? nodeStatement(view, weakestNodeId) : "none found"}`
              : view?.recommendation.reason ?? "Spray the product and market picture to light a path."}
          </span>
        </div>
        <div className="object-path-actions">
          <button type="button" className={lens === "default" ? "active" : ""} onClick={() => setLens("default")}>Default</button>
          <button type="button" className={lens === "weakness" ? "active" : ""} onClick={() => setLens("weakness")}>
            Weakness · {softCount}
          </button>
          <button type="button" className="compile" onClick={() => void compile()} disabled={!highlightedPath || compileState.status === "running"}>
            {compileState.status === "running" ? <FileSearch aria-hidden="true" /> : <Play aria-hidden="true" />}
            Compile run
          </button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.28}
        maxZoom={1.4}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => setSelectedId(node.id)}
        onPaneClick={() => setSelectedId(null)}
      >
        <Background color="var(--canvas-dot)" gap={22} size={1} />
        <Controls showInteractive={false} />
        <FitOnLoad ready={Boolean(view && nodes.length)} />
      </ReactFlow>

      {loading ? <div className="object-graph-status">Reading the graph…</div> : null}
      {error ? <div className="object-graph-status error">{error}</div> : null}
      {compileState.status !== "idle" ? (
        <div className={`object-graph-status ${compileState.status}`}>
          {compileState.status === "done" ? <CheckCircle2 aria-hidden="true" /> : null}
          {compileState.message}
        </div>
      ) : null}

      {selected ? (
        <aside className="object-inspector">
          <div className="object-inspector-head">
            <span>{labelForType(selected.type)}</span>
            <button type="button" onClick={() => setSelectedId(null)}>Close</button>
          </div>
          <h3>{selected.statement}</h3>
          <div className="object-inspector-row">
            <span>Evidence</span>
            <strong>{evidenceLabel(selected)}</strong>
          </div>
          {selectedWeakness ? (
            <div className="object-inspector-weakness">
              <AlertTriangle aria-hidden="true" />
              <div>
                <strong>{selectedWeakness.statement}</strong>
                <span>{selectedWeakness.repair?.statement ?? "Repair suggested from the detector."}</span>
              </div>
            </div>
          ) : (
            <div className="object-inspector-clean">No phase-1 weakness fired for this card.</div>
          )}
          {nodeRole(selected) === "gate" ? (
            <div className="object-inspector-section">
              <span>Gate</span>
              <p><b>Protects</b> {String(selected.payload?.protects || "staged action")}</p>
              <p><b>Review</b> {String(selected.payload?.reviewPayload || "action-summary")}</p>
              <p><b>Status</b> {String((selected.payload?.gateState as { status?: string } | undefined)?.status || "pending")}</p>
            </div>
          ) : null}
          {selected.payload?.joinKey ? (
            <div className="object-inspector-section">
              <span>Attribution</span>
              <p><b>Join key</b> {String(selected.payload.joinKey)}</p>
              {selected.payload?.reviewPayload ? <p><b>Review payload</b> {String(selected.payload.reviewPayload)}</p> : null}
            </div>
          ) : null}
          <div className="object-inspector-section">
            <span>Receipts</span>
            {(selected.sources.length ? selected.sources : selected.evidence.map((item) => ({ ref: item.source || "evidence", preview: item.claim || item.notes || "Evidence", kind: item.solidity, at: item.capturedAt }))).slice(0, 6).map((receipt) => (
              <p key={`${receipt.kind}-${receipt.ref}-${receipt.preview}`}>{receipt.preview}</p>
            ))}
          </div>
          <div className="object-inspector-section">
            <span>Edges</span>
            {view?.graph.edges
              .filter((edge) => edge.source === selected.id || edge.target === selected.id)
              .slice(0, 8)
              .map((edge) => (
                <p key={edge.id}>
                  <b>{edge.type.replace(/_/g, " ")}</b>{" "}
                  {edge.source === selected.id ? nodeStatement(view, edge.target) : nodeStatement(view, edge.source)}
                </p>
              ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function nodeStatement(view: ObjectGraphView | null | undefined, id: string) {
  return view?.graph.nodes.find((node) => node.id === id)?.statement ?? id;
}

function pathHeadline(path: ObjectGraphPathRecommendation, view: ObjectGraphView | null) {
  const firstStrategy = path.nodeIds
    .map((id) => view?.graph.nodes.find((node) => node.id === id))
    .find((node) => node?.domain === "runs" || node?.domain === "strategy");
  return firstStrategy?.statement ?? "Highlighted path";
}
