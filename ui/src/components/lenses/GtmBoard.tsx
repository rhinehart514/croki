// GtmBoard — the GTM home as a SPATIAL NODE-FLOW CANVAS. The whole go-to-market is one long left-to-
// right flow: nine clusters (Strategy 1-4 · Motion 5-6 · Loop 7-9) placed along a gentle wave, SVG
// wires between consecutive clusters, and a dashed feedback arc from Learning back to Market — the loop
// closing. Zoomed out you read every belief at once; this is a canvas, not a list.
//
// Navigation is focus + swipe-to-unfold. Click a section in the left rail (AltitudeLadder) and the
// CAMERA FLIES to that cluster while the rest dim. Then SWIPE RIGHT (horizontal trackpad deltaX, or
// ArrowRight) and the focused section progressively UNFOLDS — first a teaser of its real detail nodes,
// then, at full extend, its FULL NATIVE DIAGRAM mounts in place (the existing per-layer diagrams from
// LAYER_DIAGRAMS, or EngineLens for Channels), with the verdict loop intact. Escape / "back to the
// whole" returns to the full flow.
//
// Pure read of real state: every spine line is the band's belief from get_board (honest-blank when
// null). The board never gates, never triggers a run. Amber (--gap) appears nowhere — it is the
// founder gate's alone.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { GtmCanvasModel } from "@/components/canvas/GtmCanvas";
import type { LensProps } from "@/components/canvas/CanvasShell";
import type { LayerBelief } from "@/types";
import { layerMeta, groundingBadge, confidenceBand } from "@/lib/boardModel";
import { useBoard } from "@/lib/boardModel";
import { EngineLens } from "@/components/lenses/EngineLens";
import { AltitudeLadder } from "@/components/lenses/AltitudeLadder";
import { LAYER_DIAGRAMS } from "@/components/lenses/LAYER_DIAGRAMS";
import "./GtmBoard.css";

// ── Spatial layout constants ───────────────────────────────────────────────────
const FLOW_GAP = 470; // horizontal pitch between clusters
const BASE_Y = 180; // baseline of the flow
const NODE_W = 300; // spine node width
const NODE_MID = 56; // vertical offset to a node's wire anchor
// A gentle vertical wave so the flow reads as a path, not a ruler. Indexed by board order.
const WAVE = [0, 64, 142, 78, 200, 116, 250, 168, 286];
const MAX_EXTEND = 3; // 0 spine · 1-2 teaser detail · 3 full diagram

// The camera transform world transition (fly ~0.55s); the diagram crossfade at full extend.
const FADE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

type Camera = { x: number; y: number; scale: number };

function readable(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of ["label", "name", "segment", "title", "who", "summary", "statement", "claim", "text", "description"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

// One band's real detail, derived from its experiments + evidence — the teaser nodes that unfold before
// the full diagram. Honest-blank: a band with nothing grounded yields a single "no detail yet" node.
type Detail = { kind: string; name: string; sub: string; tone: string };
function detailItems(layer: LayerBelief): Detail[] {
  const badge = groundingBadge(layer);
  const items: Detail[] = [];
  for (const e of layer.experiments.slice(0, 2)) {
    items.push({ kind: "experiment", name: e.hypothesis || e.variable || e.id, sub: "live experiment", tone: badge.tone });
  }
  for (const ev of layer.evidence.slice(0, 3 - items.length)) {
    items.push({ kind: "evidence", name: ev, sub: "", tone: badge.tone });
  }
  if (items.length === 0) {
    items.push({ kind: layer.belief ? "belief" : "blind", name: layer.belief ?? "No detail grounded yet", sub: layer.belief ? "the one line" : "runs will ground this", tone: badge.tone });
  }
  return items.slice(0, 3);
}

// The full unfolded payload for a band: Channels mounts EngineLens; a registered layer mounts its
// diagram (with the verdict loop wired); everything else shows the honest placeholder. Same wiring the
// accordion used — the diagrams are reused verbatim, never rebuilt.
function UnfoldBody({
  layer, model, selected, onSelect, onVerdict,
}: {
  layer: LayerBelief;
  model: GtmCanvasModel;
  selected: string | null;
  onSelect: (id: string) => void;
  onVerdict: () => void;
}) {
  const meta = layerMeta(layer.layer);

  if (layer.layer === "channels") {
    return (
      <div className="band-body-engine">
        <EngineLens
          channels={model.channels}
          channelFeeds={model.channelFeeds}
          directedFeeds={model.directedFeeds}
          activeChannelId={model.activeChannelId}
          onDeriveChannel={model.onDeriveChannel}
          onOpenChannel={model.onOpenChannel}
          icpLabel={readable(model.icp)}
          claimLabel={readable(model.claims[0])}
        />
      </div>
    );
  }

  const Diagram = LAYER_DIAGRAMS[layer.layer];
  if (Diagram) {
    return (
      <div className="band-body-diagram">
        <Diagram
          layer={layer.layer}
          belief={layer}
          experiments={layer.experiments}
          selected={selected}
          onSelect={onSelect}
          projectId={model.projectId}
          onVerdict={onVerdict}
        />
      </div>
    );
  }

  return (
    <div className="band-placeholder">
      <div className="band-placeholder-belief">
        {layer.belief ? <span>{layer.belief}</span> : <span className="band-belief-blind">No belief grounded here yet.</span>}
      </div>
      {layer.evidence.length > 0 && (
        <ul className="band-evidence">
          {layer.evidence.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {layer.experiments.length > 0 && (
        <div className="band-exp-list">
          <span className="band-exp-eyebrow">{layer.experiments.length} live experiment{layer.experiments.length === 1 ? "" : "s"}</span>
          <ul>
            {layer.experiments.slice(0, 4).map((e) => (
              <li key={e.id}>{e.hypothesis || e.variable || e.id}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="band-placeholder-foot">{meta.name} — diagram lands next</div>
    </div>
  );
}

export function GtmBoardLens({ model, selected, onSelect }: LensProps<GtmCanvasModel, never>) {
  const reduce = useReducedMotion();
  // A founder verdict (or a fresh grouping) bumps this so the board re-reads and the belief flips. The
  // diagram calls onVerdict() after a successful write.
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useBoard(model.projectId, refreshKey);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ w: 1100, h: 720 });
  const [camera, setCamera] = useState<Camera>({ x: 24, y: 24, scale: 0.6 });
  const [focused, setFocused] = useState<string | null>(null);
  const [extend, setExtend] = useState(0);
  const [panning, setPanning] = useState(false);

  // Swipe accumulator + a brief lock so one trackpad flick advances exactly one depth.
  const accRef = useRef(0);
  const lockRef = useRef(false);

  const layers = useMemo(() => (state.status === "ready" ? state.board.layers : []), [state]);

  // ── Spatial positions: clusters along the flow, indexed by board order. ──
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; i: number }>();
    layers.forEach((l, i) => {
      map.set(l.layer, { x: 120 + i * FLOW_GAP, y: BASE_Y + (WAVE[i] ?? i * 40), i });
    });
    return map;
  }, [layers]);

  const contentW = layers.length ? 120 + (layers.length - 1) * FLOW_GAP + NODE_W + 160 : 1200;
  const contentH = 1080;

  // ── Camera math ──
  const fitCamera = useCallback((): Camera => {
    const sc = Math.min(stageSize.w / contentW, 0.66);
    const x = Math.max(16, (stageSize.w - contentW * sc) / 2);
    return { x, y: 28, scale: sc };
  }, [stageSize.w, contentW]);

  const focusCamera = useCallback((layer: string, ext: number): Camera => {
    const p = positions.get(layer);
    if (!p) return fitCamera();
    const sc = ext <= 0 ? 1.0 : ext === 1 ? 0.92 : 0.84;
    const shift = ext * 150;
    return {
      x: stageSize.w * 0.34 - (p.x + shift) * sc,
      y: stageSize.h * 0.46 - (p.y + 40) * sc,
      scale: sc,
    };
  }, [positions, stageSize.w, stageSize.h, fitCamera]);

  // Refs the resize subscription reads without re-subscribing (and without stale closures): whether a
  // section is focused, and the current content width for the fit math.
  const focusedRef = useRef<string | null>(null);
  const contentWRef = useRef(contentW);
  useEffect(() => { focusedRef.current = focused; contentWRef.current = contentW; }, [focused, contentW]);

  // Track the stage size against the real viewport, and — while nothing is focused — sit at the
  // whole-flow altitude. setCamera here runs from the ResizeObserver (an external system), not
  // synchronously in render. The observer fires on observe(), so first paint frames itself.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setStageSize({ w, h });
      if (focusedRef.current === null) {
        const cw = contentWRef.current;
        const sc = Math.min(w / cw, 0.66);
        setCamera({ x: Math.max(16, (w - cw * sc) / 2), y: 28, scale: sc });
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toWhole = useCallback(() => {
    setFocused(null);
    setExtend(0);
    accRef.current = 0;
    setCamera(fitCamera());
  }, [fitCamera]);

  const focusSection = useCallback((layer: string) => {
    setFocused(layer);
    setExtend(0);
    accRef.current = 0;
    setCamera(focusCamera(layer, 0));
  }, [focusCamera]);

  const setDepth = useCallback((next: number) => {
    if (!focused) return;
    const clamped = Math.max(0, Math.min(MAX_EXTEND, next));
    setExtend(clamped);
    setCamera(focusCamera(focused, clamped));
  }, [focused, focusCamera]);

  // ── Swipe-to-unfold: horizontal-dominant wheel drives the extend level. Vertical scroll passes
  // through (so a mounted diagram scrolls). Native listener with passive:false to claim deltaX. ──
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!focused) return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // let vertical scroll through
      e.preventDefault();
      accRef.current += e.deltaX;
      if (!lockRef.current && accRef.current > 60) {
        accRef.current = 0; lockRef.current = true;
        setDepth(extend + 1);
        setTimeout(() => { lockRef.current = false; }, 420);
      } else if (!lockRef.current && accRef.current < -60) {
        accRef.current = 0; lockRef.current = true;
        setDepth(extend - 1);
        setTimeout(() => { lockRef.current = false; }, 420);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [focused, extend, setDepth]);

  // Keyboard: arrows extend/retract the focused section; Escape returns to the whole.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focused) { e.preventDefault(); toWhole(); return; }
      if (!focused) return;
      if (e.key === "ArrowRight") { e.preventDefault(); setDepth(extend + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); setDepth(extend - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, extend, setDepth, toWhole]);

  // Drag to pan when nothing is focused (explore the whole flow).
  const onPointerDown = (e: React.PointerEvent) => {
    if (focused) return;
    if ((e.target as HTMLElement).closest(".board-node, .sec, .board-zoom, .board-back")) return;
    const start = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y };
    setPanning(true);
    const move = (ev: PointerEvent) => {
      setCamera((c) => ({ ...c, x: start.cx + (ev.clientX - start.x), y: start.cy + (ev.clientY - start.y) }));
    };
    const up = () => {
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onVerdict = () => setRefreshKey((k) => k + 1);

  // ── Status states ──
  if (state.status === "loading") {
    return <div className="board-status"><span className="board-status-spin" /><strong>Reading the board…</strong></div>;
  }
  if (state.status === "empty") {
    return (
      <div className="board-status">
        <strong>No board yet</strong>
        <span>Open a product and its nine belief layers show here — each line derived from real state.</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="board-status">
        <strong>Couldn't read the board</strong>
        <span>{state.error}</span>
      </div>
    );
  }

  const focusedIndex = focused ? positions.get(focused)?.i ?? -1 : -1;
  const focusedLayer = focused ? layers.find((l) => l.layer === focused) ?? null : null;
  const showDiagram = focused !== null && extend >= MAX_EXTEND && focusedLayer !== null;

  // Wires: consecutive clusters + the dashed feedback arc Learning → Market.
  const wires = layers.slice(0, -1).map((l, i) => {
    const a = positions.get(l.layer)!;
    const b = positions.get(layers[i + 1].layer)!;
    const ax = a.x + NODE_W, ay = a.y + NODE_MID, bx = b.x, by = b.y + NODE_MID;
    const mx = (ax + bx) / 2;
    // The wire ARRIVING at the focused cluster lights.
    const lit = focusedIndex === i + 1;
    return { key: l.layer, d: `M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`, lit };
  });
  const feedback = (() => {
    if (layers.length < 2) return null;
    const last = positions.get(layers[layers.length - 1].layer)!;
    const first = positions.get(layers[0].layer)!;
    const ax = last.x + NODE_W, ay = last.y + NODE_MID + 24;
    const bx = first.x, by = first.y + NODE_MID + 24;
    return `M ${ax} ${ay} C ${ax + 140} 1000, ${bx - 140} 1000, ${bx} ${by}`;
  })();

  const worldTransition = reduce || panning ? "none" : "transform 0.55s var(--ease)";

  return (
    <div className="gtm-board">
      <AltitudeLadder layers={layers} focusedLayer={focused} onFly={focusSection} />

      <div className="board-stage" ref={stageRef} onPointerDown={onPointerDown}>
        {/* Top bar — breadcrumb + back-to-the-whole */}
        <div className="board-topbar">
          <div className="board-crumb">
            {focusedLayer
              ? <><b>{layerMeta(focusedLayer.layer).name}</b> · {layerMeta(focusedLayer.layer).sub}</>
              : "The whole go-to-market — one flow"}
          </div>
          {focused && (
            <button type="button" className="board-back" onClick={toWhole} title="Back to the whole flow (Esc)">
              &#8598; back to the whole
            </button>
          )}
        </div>

        {/* The transform world: clusters + wires */}
        <div
          className={`board-world${panning ? " panning" : ""}`}
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`, transition: worldTransition }}
        >
          <svg className="board-wires" width={contentW} height={contentH} aria-hidden="true">
            {wires.map((w) => <path key={w.key} className={`board-wire${w.lit ? " lit" : ""}`} d={w.d} />)}
            {feedback && <path className="board-wire feedback" d={feedback} />}
          </svg>

          {layers.map((l) => {
            const p = positions.get(l.layer)!;
            const meta = layerMeta(l.layer);
            const badge = groundingBadge(l);
            const cband = confidenceBand(l.confidence);
            const isFocused = focused === l.layer;
            const dim = focused !== null && !isFocused;
            const details = isFocused && extend > 0 && extend < MAX_EXTEND ? detailItems(l) : [];
            return (
              <div
                key={l.layer}
                className={`board-cluster${isFocused ? " focused" : ""}${dim ? " dim" : ""}`}
                style={{ left: p.x, top: p.y }}
              >
                <div className="board-cluster-head"><span className="cnum">{meta.n}</span> {l.phase}</div>
                <button
                  type="button"
                  className={`board-node spine tone-${badge.tone}${l.belief ? "" : " blind"}`}
                  onClick={() => focusSection(l.layer)}
                >
                  <div className="board-node-top">
                    <span className="board-node-kind">{meta.name}</span>
                    <span className={`board-node-pill tone-${badge.tone}`}><span className="p" />{badge.label}</span>
                  </div>
                  <div className="board-node-name">
                    {l.belief ?? <span className="band-belief-blind">No belief yet — runs will ground this.</span>}
                  </div>
                  <div className="board-node-foot">
                    <span className="board-node-sub">{meta.sub}</span>
                    {cband !== "none" && (
                      <span className={`board-node-conf conf-${cband}`}>
                        <span className="board-node-conf-track"><span className="board-node-conf-fill" style={{ width: `${l.confidence}%` }} /></span>
                        <span className="board-node-conf-n">{l.confidence}</span>
                      </span>
                    )}
                  </div>
                </button>

                {/* Teaser detail nodes — unfold to the right as you swipe, before the full diagram. */}
                {details.map((d, j) => (
                  <motion.div
                    key={`${l.layer}-d${j}`}
                    className={`board-node small tone-${d.tone}`}
                    style={{ left: NODE_W + 36, top: 30 + j * 84 }}
                    initial={reduce ? false : { opacity: 0, x: -14, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }}
                  >
                    <div className="board-node-top"><span className="board-node-kind">{d.kind}</span></div>
                    <div className="board-node-name small">{d.name}</div>
                    {d.sub && <div className="board-node-sub">{d.sub}</div>}
                  </motion.div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Depth meter + swipe hint — only while a section is focused. */}
        {focused && (
          <>
            <div className="board-depth">
              {[0, 1, 2, 3].map((i) => <span key={i} className={`seg${i <= extend ? " on" : ""}`} />)}
            </div>
            {extend < MAX_EXTEND && (
              <div className="board-hint">
                <span><b>{focusedLayer ? layerMeta(focusedLayer.layer).name : ""}</b></span>
                <span className="swipe">swipe <span className="arrow">→</span> to unfold · or <kbd>→</kbd></span>
              </div>
            )}
          </>
        )}

        {/* The full diagram — mounts in place at full extend, crossfading up from the focused cluster. */}
        <AnimatePresence>
          {showDiagram && focusedLayer && (
            <motion.div
              key={focusedLayer.layer}
              className="board-unfold"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={FADE}
            >
              <div className="board-unfold-head">
                <div className="board-unfold-id">
                  <span className="board-unfold-num">{layerMeta(focusedLayer.layer).n}</span>
                  <div>
                    <div className="board-unfold-name">{layerMeta(focusedLayer.layer).name}</div>
                    <div className="board-unfold-sub">{layerMeta(focusedLayer.layer).sub}</div>
                  </div>
                </div>
                <button type="button" className="board-unfold-collapse" onClick={() => setDepth(extend - 1)} title="Fold back (←)">
                  &#8592; fold back
                </button>
              </div>
              <div className="board-unfold-body">
                <UnfoldBody layer={focusedLayer} model={model} selected={selected} onSelect={onSelect} onVerdict={onVerdict} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Zoom / fit controls */}
        <div className="board-zoom">
          <button type="button" onClick={() => setCamera((c) => ({ ...c, scale: Math.min(1.4, c.scale + 0.12) }))} title="Zoom in">+</button>
          <button type="button" onClick={() => setCamera((c) => ({ ...c, scale: Math.max(0.4, c.scale - 0.12) }))} title="Zoom out">&minus;</button>
          <button type="button" onClick={toWhole} title="Fit the whole flow">&#9633;</button>
        </div>
      </div>
    </div>
  );
}
