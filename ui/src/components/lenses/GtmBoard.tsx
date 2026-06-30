// GtmBoard — the GTM home as a FREEFORM SPATIAL CANVAS. The whole go-to-market is one open map: nine
// clusters (Strategy 1-4 · Motion 5-6 · Loop 7-9) spread across 2D space in loose phase zones, SVG
// wires between consecutive clusters, and a dashed feedback arc from Learning back to Market — the loop
// closing. You roam it like a whiteboard: drag empty space to pan (with momentum), scroll/pinch to zoom
// toward the cursor, and drag a cluster by its header to lay the map out the way you think. Positions
// persist per project, so the canvas stays yours across reloads.
//
// On top of the free roam sits focus + swipe-to-unfold. Click a section in the left rail (AltitudeLadder)
// or a cluster card and the CAMERA FLIES to that cluster while the rest dim. Then SWIPE RIGHT (horizontal
// trackpad deltaX, or ArrowRight) and the focused section progressively UNFOLDS — first a teaser of its
// real detail nodes, then, at full extend, its FULL NATIVE DIAGRAM mounts in place (the existing per-layer
// diagrams from LAYER_DIAGRAMS, or EngineLens for Channels), with the verdict loop intact. Escape / "back
// to the whole" returns to the free map. Snapping happens ONLY on a focus click — free roam never snaps.
//
// Pure read of real state: every spine line is the band's belief from get_board (honest-blank when
// null). The board never gates, never triggers a run. Amber (--gap) appears nowhere — it is the
// founder gate's alone.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { GripVertical } from "lucide-react";
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
const NODE_W = 280; // spine node width
const CARD_H = 118; // approx card height — wire anchors hit the card's vertical middle
const NODE_MID = CARD_H / 2;
const MAX_EXTEND = 3; // 0 spine · 1-2 teaser detail · 3 full diagram
const MARGIN = 320; // generous pannable breathing room around the map's bounding box

// The default organic map: clusters spread into loose phase ZONES — Strategy on the left, Motion in the
// middle, Loop on the right — not a single straight row. Indexed by board order. Founders drag from here;
// any reposition is saved per project, so this is just the opening arrangement.
const DEFAULT_LAYOUT: { x: number; y: number }[] = [
  { x: 60, y: 90 },     // 1 Strategy
  { x: 470, y: 250 },   // 2
  { x: 150, y: 480 },   // 3
  { x: 560, y: 610 },   // 4
  { x: 980, y: 410 },   // 5 Motion
  { x: 1240, y: 140 },  // 6
  { x: 1660, y: 300 },  // 7 Loop
  { x: 1580, y: 640 },  // 8
  { x: 2020, y: 500 },  // 9
];

// The camera fly on focus; the diagram crossfade at full extend.
const FLY = "transform 0.55s var(--ease)";
const FADE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

type Camera = { x: number; y: number; scale: number };
type XY = { x: number; y: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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
  // Whether the world transform should animate (a focus fly / fit) or track the pointer 1:1 (free pan,
  // zoom, momentum). Free roam never animates — that's what kills the old conveyor's snap feel.
  const [animated, setAnimated] = useState(true);

  // Per-project dragged positions, layered over DEFAULT_LAYOUT. Persisted to localStorage so a reposition
  // survives reload and the canvas stays the founder's. Read lazily (no effect), and re-read on a project
  // switch via the adjust-state-during-render pattern — React's sanctioned way, no cascading render.
  const storageKey = `gtm.board.layout.${model.projectId}`;
  const readLayout = (key: string): Record<string, XY> => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as Record<string, XY>) : {}; }
    catch { return {}; }
  };
  const [overrides, setOverrides] = useState<Record<string, XY>>(() => readLayout(storageKey));
  const [trackedKey, setTrackedKey] = useState(storageKey);
  if (trackedKey !== storageKey) {
    setTrackedKey(storageKey);
    setOverrides(readLayout(storageKey));
  }
  const persist = useCallback((next: Record<string, XY>) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* private mode */ }
  }, [storageKey]);

  // Swipe accumulator + a brief lock so one trackpad flick advances exactly one depth.
  const accRef = useRef(0);
  const lockRef = useRef(false);
  // Momentum handle for pan inertia.
  const momentumRef = useRef<number | null>(null);
  const cancelMomentum = useCallback(() => {
    if (momentumRef.current !== null) { cancelAnimationFrame(momentumRef.current); momentumRef.current = null; }
  }, []);

  const layers = useMemo(() => (state.status === "ready" ? state.board.layers : []), [state]);

  // ── Spatial positions: DEFAULT_LAYOUT, with any dragged override applied. Indexed by board order. ──
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; i: number }>();
    layers.forEach((l, i) => {
      const base = DEFAULT_LAYOUT[i] ?? { x: 80 + i * 360, y: 220 };
      const o = overrides[l.layer];
      map.set(l.layer, { x: o?.x ?? base.x, y: o?.y ?? base.y, i });
    });
    return map;
  }, [layers, overrides]);

  // The map's bounding box, plus generous margin so it feels open and pannable, not boxed.
  const bounds = useMemo(() => {
    let maxX = 900, maxY = 600;
    positions.forEach((p) => { maxX = Math.max(maxX, p.x + NODE_W); maxY = Math.max(maxY, p.y + CARD_H); });
    return { w: maxX + MARGIN, h: maxY + MARGIN };
  }, [positions]);
  const boundsRef = useRef(bounds);
  useEffect(() => { boundsRef.current = bounds; }, [bounds]);

  // ── Camera math ──
  const fitCamera = useCallback((): Camera => {
    const sc = clamp(Math.min(stageSize.w / bounds.w, stageSize.h / bounds.h), 0.22, 0.72);
    return {
      x: (stageSize.w - bounds.w * sc) / 2,
      y: (stageSize.h - bounds.h * sc) / 2,
      scale: sc,
    };
  }, [stageSize.w, stageSize.h, bounds.w, bounds.h]);

  const focusCamera = useCallback((layer: string, ext: number): Camera => {
    const p = positions.get(layer);
    if (!p) return fitCamera();
    const sc = ext <= 0 ? 1.0 : ext === 1 ? 0.92 : 0.84;
    const shift = ext * 150;
    return {
      x: stageSize.w * 0.34 - (p.x + shift) * sc,
      y: stageSize.h * 0.46 - (p.y + NODE_MID) * sc,
      scale: sc,
    };
  }, [positions, stageSize.w, stageSize.h, fitCamera]);

  // Refs the resize subscription reads without re-subscribing (and without stale closures).
  const focusedRef = useRef<string | null>(null);
  useEffect(() => { focusedRef.current = focused; }, [focused]);

  // Track the stage size against the real viewport, and — while nothing is focused — sit at the fit
  // altitude. setCamera here runs from the ResizeObserver (an external system). The observer fires on
  // observe(), so first paint frames itself.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setStageSize({ w, h });
      if (focusedRef.current === null) {
        const b = boundsRef.current;
        const sc = clamp(Math.min(w / b.w, h / b.h), 0.22, 0.72);
        setAnimated(false);
        setCamera({ x: (w - b.w * sc) / 2, y: (h - b.h * sc) / 2, scale: sc });
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => cancelMomentum, [cancelMomentum]);

  const toWhole = useCallback(() => {
    cancelMomentum();
    setFocused(null);
    setExtend(0);
    accRef.current = 0;
    setAnimated(true);
    setCamera(fitCamera());
  }, [fitCamera, cancelMomentum]);

  const focusSection = useCallback((layer: string) => {
    cancelMomentum();
    setFocused(layer);
    setExtend(0);
    accRef.current = 0;
    setAnimated(true);
    setCamera(focusCamera(layer, 0));
  }, [focusCamera, cancelMomentum]);

  const setDepth = useCallback((next: number) => {
    if (!focused) return;
    const clamped = clamp(next, 0, MAX_EXTEND);
    setExtend(clamped);
    setAnimated(true);
    setCamera(focusCamera(focused, clamped));
  }, [focused, focusCamera]);

  // Reset the layout to the default arrangement and fit — the "make it tidy again" escape hatch.
  const resetLayout = useCallback(() => {
    setOverrides({});
    persist({});
    cancelMomentum();
    setFocused(null);
    setExtend(0);
    setAnimated(true);
    setCamera(fitCamera());
  }, [persist, fitCamera, cancelMomentum]);

  // ── Wheel: focused → swipe-to-unfold (horizontal). Free roam → zoom toward the cursor. ──
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (focused) {
        // Swipe-to-unfold: horizontal-dominant wheel drives extend; vertical scroll passes through so a
        // mounted diagram scrolls.
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
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
        return;
      }
      // Free roam: zoom toward the cursor. preventDefault so the page never scrolls under us.
      e.preventDefault();
      cancelMomentum();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setAnimated(false);
      setCamera((c) => {
        const ns = clamp(c.scale * factor, 0.2, 1.6);
        const wx = (mx - c.x) / c.scale, wy = (my - c.y) / c.scale;
        return { x: mx - wx * ns, y: my - wy * ns, scale: ns };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [focused, extend, setDepth, cancelMomentum]);

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

  // ── Drag empty canvas to pan, with light inertia on release. Only while roaming (not focused). ──
  const onPointerDown = (e: React.PointerEvent) => {
    if (focused) return;
    if ((e.target as HTMLElement).closest(".board-node, .board-cluster-head, .sec, .board-zoom, .board-back")) return;
    cancelMomentum();
    let last = { x: e.clientX, y: e.clientY, t: performance.now() };
    let vel = { x: 0, y: 0 };
    setPanning(true);
    setAnimated(false);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - last.x, dy = ev.clientY - last.y;
      const now = performance.now();
      const dt = Math.max(1, now - last.t);
      vel = { x: dx / dt, y: dy / dt };
      last = { x: ev.clientX, y: ev.clientY, t: now };
      setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
    };
    const up = () => {
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // Inertia: keep gliding from the release velocity, decaying with friction. Skipped for reduced motion.
      if (reduce) return;
      let vx = vel.x * 16, vy = vel.y * 16; // px/ms → px/frame at ~60fps
      if (Math.hypot(vx, vy) < 0.6) return;
      const step = () => {
        vx *= 0.92; vy *= 0.92;
        if (Math.abs(vx) < 0.12 && Math.abs(vy) < 0.12) { momentumRef.current = null; return; }
        setCamera((c) => ({ ...c, x: c.x + vx, y: c.y + vy }));
        momentumRef.current = requestAnimationFrame(step);
      };
      momentumRef.current = requestAnimationFrame(step);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── Drag a cluster by its header to reposition it on the map. Edges follow; the move persists. ──
  const onClusterDragStart = (layer: string, e: React.PointerEvent) => {
    if (focused) return;
    e.stopPropagation();
    e.preventDefault();
    cancelMomentum();
    const p = positions.get(layer);
    if (!p) return;
    const sx = e.clientX, sy = e.clientY;
    const startX = p.x, startY = p.y;
    const scale = camera.scale;
    const move = (ev: PointerEvent) => {
      setOverrides((prev) => ({
        ...prev,
        [layer]: { x: startX + (ev.clientX - sx) / scale, y: startY + (ev.clientY - sy) / scale },
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setOverrides((prev) => { persist(prev); return prev; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const zoomBy = (factor: number) => {
    setAnimated(true);
    setCamera((c) => {
      const ns = clamp(c.scale * factor, 0.2, 1.6);
      // Zoom toward the stage center for the button controls.
      const cx = stageSize.w / 2, cy = stageSize.h / 2;
      const wx = (cx - c.x) / c.scale, wy = (cy - c.y) / c.scale;
      return { x: cx - wx * ns, y: cy - wy * ns, scale: ns };
    });
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

  // Wires: consecutive clusters (center-to-center bezier so they read as a path across the 2D map) + the
  // dashed feedback arc Learning → Market.
  const wires = layers.slice(0, -1).map((l, i) => {
    const a = positions.get(l.layer)!;
    const b = positions.get(layers[i + 1].layer)!;
    const ax = a.x + NODE_W / 2, ay = a.y + NODE_MID;
    const bx = b.x + NODE_W / 2, by = b.y + NODE_MID;
    const dx = (bx - ax) * 0.5;
    // The wire ARRIVING at the focused cluster lights.
    const lit = focusedIndex === i + 1;
    return { key: l.layer, d: `M ${ax} ${ay} C ${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}`, lit };
  });
  const feedback = (() => {
    if (layers.length < 2) return null;
    const last = positions.get(layers[layers.length - 1].layer)!;
    const first = positions.get(layers[0].layer)!;
    const ax = last.x + NODE_W / 2, ay = last.y + CARD_H;
    const bx = first.x + NODE_W / 2, by = first.y + CARD_H;
    const dip = bounds.h - MARGIN * 0.4;
    return `M ${ax} ${ay} C ${ax} ${dip}, ${bx} ${dip}, ${bx} ${by}`;
  })();

  const worldTransition = reduce ? "none" : animated ? FLY : "none";

  return (
    <div className="gtm-board">
      <AltitudeLadder layers={layers} focusedLayer={focused} onFly={focusSection} />

      <div className={`board-stage${panning ? " panning" : ""}`} ref={stageRef} onPointerDown={onPointerDown}>
        {/* Top bar — breadcrumb + back-to-the-whole */}
        <div className="board-topbar">
          <div className="board-crumb">
            {focusedLayer
              ? <><b>{layerMeta(focusedLayer.layer).name}</b> · {layerMeta(focusedLayer.layer).sub}</>
              : "The whole go-to-market — one map · drag to roam, scroll to zoom"}
          </div>
          {focused && (
            <button type="button" className="board-back" onClick={toWhole} title="Back to the whole map (Esc)">
              &#8598; back to the whole
            </button>
          )}
        </div>

        {/* The transform world: clusters + wires */}
        <div
          className={`board-world${panning ? " panning" : ""}`}
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`, transition: worldTransition }}
        >
          <svg className="board-wires" width={bounds.w} height={bounds.h} aria-hidden="true">
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
                <div
                  className="board-cluster-head"
                  onPointerDown={(e) => onClusterDragStart(l.layer, e)}
                  title="Drag to reposition"
                >
                  <span className="board-cluster-grip" aria-hidden="true"><GripVertical size={13} /></span>
                  <span className="cnum">{meta.n}</span> {l.phase}
                </div>
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

        {/* Zoom / fit / reset controls */}
        <div className="board-zoom">
          <button type="button" onClick={() => zoomBy(1.18)} title="Zoom in">+</button>
          <button type="button" onClick={() => zoomBy(1 / 1.18)} title="Zoom out">&minus;</button>
          <button type="button" onClick={toWhole} title="Fit the whole map">&#9633;</button>
          <button type="button" onClick={resetLayout} title="Reset the layout">&#8634;</button>
        </div>
      </div>
    </div>
  );
}
