import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AlertTriangle, CheckCircle2, FileSearch, Mail, Network, Play, Shield, ShieldCheck,
} from "lucide-react";
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, useStore, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { approveRun, compileObjectGraphPath, getObjectGraph, recordOutcome, saveObjectGraphPositions, type CompiledGate } from "@/api";
import type { GateDecision, GTMItem, ObjectGraphEdge, ObjectGraphNode, ObjectGraphPathRecommendation, ObjectGraphView } from "@/types";
import { layoutObjectGraph, type PositionMap } from "@/lib/objectGraphLayout";
import { GateReview } from "@/components/gate/GateReview";
import type { GateBag } from "@/lib/gateItem";
import "@/styles/object-graph.css";

function labelForType(type: string | null) {
  return String(type || "loose").replace(/_/g, " ");
}

// One consistent evidence ladder (observed / researched / inferred / speculative / founder /
// unsupported), with a source count only when there's more than one — no mixing "scan ·3" with
// a bare "inferred".
function evidenceLabel(node: ObjectGraphNode) {
  if (node.origin === "founder") return "founder";
  if (!node.solidity) return "unsupported";
  const n = node.sources.length || node.evidence.length || 0;
  return n > 1 ? `${node.solidity} ·${n}` : node.solidity;
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
  return null; // plain object cards carry no icon — the type label already says what they are
}

type CardData = {
  object: ObjectGraphNode;
  lit: boolean;
  weak: boolean;
  weakest: boolean;
  revealDelay: number;
};

// The cold-open materializes the graph in WAVES, not one card at a time: the product cards land first,
// then market, then strategy, then the run/gate/outcome layer — so it reads as Drover laying out its
// thinking. Delay is by lifecycle layer (a shared beat per wave) plus a small deterministic jitter so a
// wave doesn't pop perfectly in lockstep.
const REVEAL_WAVE: Record<string, number> = {
  external: 0, product: 0, market: 1, strategy: 2,
  audience: 3, assets: 3, runs: 3, measurement: 4, pipeline: 4, customer: 4, learning: 4,
};
function revealDelayFor(node: ObjectGraphNode) {
  const wave = REVEAL_WAVE[node.domain || "product"] ?? 2;
  const jitter = node.id ? (node.id.charCodeAt(0) % 5) * 30 : 0;
  return wave * 240 + jitter;
}

function ObjectCard({ data, selected }: NodeProps<Node<CardData>>) {
  const weakness = primaryWeakness(data.object);
  return (
    <button
      type="button"
      style={{ "--reveal-delay": `${data.revealDelay}ms` } as CSSProperties}
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

function layoutNodes(
  nodes: ObjectGraphNode[],
  positions: PositionMap,
  highlighted: Set<string>,
  weakestNodeId: string | null,
): Node<CardData>[] {
  return nodes.map((object) => {
    const weak = Boolean(primaryWeakness(object));
    return {
      id: object.id,
      type: "objectCard",
      position: positions[object.id] ?? { x: 0, y: 0 },
      data: {
        object,
        lit: highlighted.has(object.id),
        weak,
        weakest: object.id === weakestNodeId,
        revealDelay: revealDelayFor(object),
      },
    };
  });
}

function layoutEdges(edges: ObjectGraphEdge[], highlighted: Set<string>): Edge[] {
  return edges.map((edge) => {
    const lit = highlighted.has(edge.id);
    const gateEdge = /:gate:/.test(edge.source) || /:gate:/.test(edge.target);
    // The one true loop in GTM is learning updating belief — the `updates` edge type. It points
    // backward against the left→right flow, so it's drawn as a curved, muted return stroke and never
    // masquerades as forward causality. (Attachment edges like `supports` can also point backward but
    // are not loops — they stay ordinary faint edges.)
    const feedback = edge.type === "updates";
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      // No on-canvas edge-type label: the recommended path lights many edges at once and their labels
      // pile up at convergence points into an illegible dark smear. The lit STROKE carries the spine;
      // each edge's verb is listed in the node inspector, one click away.
      type: feedback ? "smoothstep" : "default",
      markerEnd: lit || feedback
        ? { type: MarkerType.ArrowClosed, width: 16, height: 16, color: feedback && !lit ? "var(--gap)" : "var(--ink)" }
        : undefined,
      className: ["object-edge", gateEdge && "gate", feedback && "feedback", lit && "lit"].filter(Boolean).join(" "),
      data: { object: edge },
    };
  });
}

function FitOnLoad({ ready, refitSignal }: { ready: boolean; refitSignal: number }) {
  const rf = useReactFlow();
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => rf.fitView({ padding: 0.2, duration: 420 }), 50);
    return () => window.clearTimeout(t);
  }, [ready, rf, refitSignal]);
  return null;
}

// Compact (coin) mode must track the LIVE zoom, not just user drags: the auto-fit can land the whole
// wide graph at a deep zoom where full cards downscale into illegible dark smears. Subscribing to the
// store's zoom flips to coins whenever the graph is pulled back — on fit, wheel, buttons, or a drag.
const COMPACT_BELOW = 0.5;
function ZoomWatch({ onZoom }: { onZoom: (compact: boolean) => void }) {
  const zoom = useStore((s) => s.transform[2]);
  useEffect(() => { onZoom(zoom < COMPACT_BELOW); }, [zoom, onZoom]);
  return null;
}

export function ObjectGraphCanvas({ projectId, gate }: { projectId: string | null; gate?: GateBag | null }) {
  const gatePending = !!gate?.items.length;
  const [view, setView] = useState<ObjectGraphView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lens, setLens] = useState<"default" | "weakness">("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compileState, setCompileState] = useState<{ status: "idle" | "running" | "done" | "error"; message: string }>({ status: "idle", message: "" });
  // The staged compiled run's own founder gate. compile stages a run and blooms its gate here; the
  // founder's per-item decisions hit the approve route, which releases the run through the same engine
  // (staging approved items locally — nothing sends). Separate from the operator-session `gate` prop.
  const [runGate, setRunGate] = useState<CompiledGate | null>(null);
  const [placed, setPlaced] = useState<PositionMap>({});
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  // Reduced-motion starts already-revealed (no animation); otherwise the effect below plays the waves.
  const [cardsIn, setCardsIn] = useState(reduceMotion);
  const [ignited, setIgnited] = useState(reduceMotion);
  const revealedRef = useRef(false);
  const finishReveal = useCallback(() => { setCardsIn(true); setIgnited(true); }, []);
  // Level-of-detail: pulled back, full cards collapse to coins so the whole map reads as a constellation;
  // zoom in and the detail returns. Only flips the boolean at the threshold, not on every wheel tick.
  const [compact, setCompact] = useState(false);
  const onZoomCompact = useCallback((c: boolean) => setCompact((prev) => (prev === c ? prev : c)), []);
  // Bumped by Reorganize so the view re-fits after the graph snaps back to order.
  const [refitSignal, setRefitSignal] = useState(0);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getObjectGraph(projectId);
      setView(next);
      // Seed founder placements from the saved layout sidecar; the server is the source of truth for
      // where cards sit. Nodes without a saved position fall through to the ordered dagre pass.
      setPlaced((next.positions ?? {}) as PositionMap);
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

  // Cold-open reveal: once the graph first arrives, materialize the cards in waves, then ignite the
  // path. Plays once per mount; reduced-motion drops straight to the finished state.
  const hasNodes = (view?.graph.nodes.length ?? 0) > 0;
  useEffect(() => {
    if (!hasNodes || revealedRef.current || reduceMotion) return;
    revealedRef.current = true;
    const raf = requestAnimationFrame(() => setCardsIn(true));
    const t = window.setTimeout(() => setIgnited(true), 1500);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [hasNodes, reduceMotion]);

  const highlightedPath = view?.recommendation.highlighted[0] ?? null;
  const highlightedNodes = useMemo(() => new Set(highlightedPath?.nodeIds ?? []), [highlightedPath]);
  const highlightedEdges = useMemo(() => new Set(highlightedPath?.edgeIds ?? []), [highlightedPath]);
  const weakestNodeId = highlightedPath?.weakestLink?.nodeId ?? null;
  // Canvas altitude: show the objects (product / market / strategy), the run and gate summaries,
  // outcomes, and anything on the lit path — but hide the execution detail (the per-item measurement
  // and asset nodes) so the map reads at the altitude you actually think at. You drill into a run to
  // see its items; the rest of the graph stays a clean strategy map, not an item-level hairball.
  const visible = useMemo(() => {
    const all = view?.graph.nodes ?? [];
    const keep = all.filter(
      (n) => n.maturity !== "execution" || n.domain === "runs" || highlightedNodes.has(n.id),
    );
    const ids = new Set(keep.map((n) => n.id));
    return {
      nodes: keep,
      edges: (view?.graph.edges ?? []).filter((e) => ids.has(e.source) && ids.has(e.target)),
    };
  }, [view, highlightedNodes]);
  const positions = useMemo(
    () => layoutObjectGraph(visible.nodes, visible.edges, placed),
    [visible, placed],
  );
  const nodes = useMemo(
    () => layoutNodes(visible.nodes, positions, highlightedNodes, weakestNodeId),
    [visible, positions, highlightedNodes, weakestNodeId],
  );
  const edges = useMemo(
    () => layoutEdges(visible.edges, highlightedEdges),
    [visible, highlightedEdges],
  );

  // Reorganize: clear founder placements so the whole graph snaps back to the ordered left→right
  // pass, and persist that fresh layout so the tidy sticks across reloads (the server merge overwrites
  // each node's saved position with the dagre one).
  const reorganize = useCallback(() => {
    setPlaced({});
    setRefitSignal((s) => s + 1);
    if (!projectId) return;
    const fresh = layoutObjectGraph(visible.nodes, visible.edges, {});
    void saveObjectGraphPositions(projectId, fresh);
  }, [projectId, visible]);
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
      // Bloom the staged run's gate so the founder can decide it in place — the approve action releases
      // it through the engine, staging locally. Nothing sends until they approve here.
      setRunGate(result.gate ?? null);
      void load();
    } catch (err) {
      setCompileState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [projectId, highlightedPath, load]);

  // Release the staged compiled run: the founder's per-item decisions hit the approve route, which runs
  // the exact reviewed items through the gate to the execute node (staged locally, never sent). On a
  // fully-resolved run the gate closes; if items remain undecided the refreshed gate stays open.
  const approveRunItems = useCallback(async (decisions: Record<string, GateDecision>) => {
    if (!projectId || !runGate?.runId) return;
    const resolved = await approveRun(projectId, runGate.runId, decisions);
    if (resolved.gate.awaitingReview > 0) {
      setRunGate(resolved.gate);
    } else {
      setRunGate(null);
      setCompileState({ status: "done", message: "Released — approved items staged locally. Nothing was sent." });
    }
    void load();
  }, [projectId, runGate, load]);

  const runGateItems = useMemo<GTMItem[]>(() => (runGate?.items ?? []).map((entry) => entry.item), [runGate]);

  const softCount = view?.graph.nodes.filter((node) => primaryWeakness(node)).length ?? 0;
  const grounded = highlightedPath
    ? Math.round((highlightedPath.signals.evidenceStrength ?? 0) * Math.max(highlightedPath.nodeIds.length, 1))
    : 0;

  if (!projectId) {
    return <div className="object-graph-empty">Open a product to build the GTM graph.</div>;
  }

  return (
    <div className={`object-graph-shell lens-${lens} ${highlightedPath ? "has-path" : ""} ${cardsIn ? "cards-in" : ""} ${ignited ? "path-ignited" : ""} ${compact ? "zoomed-out" : ""} ${gatePending ? "gate-pending" : ""}`}>
      <div className="object-path-header">
        <div>
          <div className="object-path-kicker">
            <ShieldCheck aria-hidden="true" />
            Strongest testable path
          </div>
          <strong>{highlightedPath ? (highlightedPath.name || pathHeadline(highlightedPath, view)) : "No testable path yet"}</strong>
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
          <button type="button" className="reorganize" onClick={reorganize} disabled={!nodes.length}>
            <Network aria-hidden="true" />
            Reorganize
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
        minZoom={0.12}
        maxZoom={1.4}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => setSelectedId(node.id)}
        onNodeDragStop={(_, node) => {
          const pos = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
          setPlaced((prev) => ({ ...prev, [node.id]: pos }));
          if (projectId) void saveObjectGraphPositions(projectId, { [node.id]: pos });
        }}
        onPaneClick={() => { setSelectedId(null); finishReveal(); }}
      >
        <Background color="var(--canvas-dot)" gap={22} size={1} />
        <Controls showInteractive={false} />
        <FitOnLoad ready={Boolean(view && nodes.length)} refitSignal={refitSignal} />
        <ZoomWatch onZoom={onZoomCompact} />
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

      {gate && gatePending ? (
        <aside className="object-gate-bloom">
          <div className="object-gate-bloom-head">
            <Shield aria-hidden="true" />
            <div>
              <strong>Your review</strong>
              <span>{gate.items.length} staged · nothing leaves until you approve</span>
            </div>
          </div>
          <GateReview
            items={gate.items}
            learned={gate.learned}
            offer={gate.offer}
            promote={gate.promote}
            onSubmit={(decisions) => gate.onSubmitReview(gate.gateNodeId, decisions)}
            onRecordOutcome={
              projectId
                ? async (item, outcome) => {
                    await recordOutcome(projectId, {
                      joinKey: String((item as { joinKey?: unknown }).joinKey ?? ""),
                      outcomeKind: outcome.outcomeKind,
                      value: outcome.value,
                    });
                  }
                : undefined
            }
          />
        </aside>
      ) : null}

      {/* The staged compiled run's own gate — blooms after "Compile run" and, unlike the operator gate
          above, releases through the approve route (staging locally, never sending). Shown only when the
          operator gate isn't already up, so the two never fight for the same corner. */}
      {runGate && runGateItems.length > 0 && !(gate && gatePending) ? (
        <aside className="object-gate-bloom">
          <div className="object-gate-bloom-head">
            <Shield aria-hidden="true" />
            <div>
              <strong>Your review</strong>
              <span>{runGate.awaitingReview} staged · nothing leaves until you approve</span>
            </div>
          </div>
          <GateReview
            items={runGateItems}
            learned={0}
            onSubmit={approveRunItems}
            onRecordOutcome={
              projectId
                ? async (item, outcome) => {
                    await recordOutcome(projectId, {
                      joinKey: String((item as { joinKey?: unknown }).joinKey ?? ""),
                      outcomeKind: outcome.outcomeKind,
                      value: outcome.value,
                    });
                  }
                : undefined
            }
          />
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
