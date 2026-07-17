import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactFlowInstance, Viewport } from "@xyflow/react";
import type { AtlasAltitude, AtlasNode } from "./atlasTypes";

function cameraKey(receiptKey: string) { return `drover:atlas-camera:v6:${receiptKey}`; }

// Canonical zoom-band boundaries, shared by the altitude readout (altimeter) and the per-node
// semantic-zoom detail band (useSemanticZoom imports these). A single source of truth so the label
// can never disagree with the detail the founder actually sees:
//   zoom <= ORBIT_MAX_ZOOM  → venture   (glyphs: kicker + title only)      → "Orbit"
//   zoom <  GROUND_MAX_ZOOM → architecture (full resting card anatomy)     → "Ground"
//   zoom >= GROUND_MAX_ZOOM → detail    (every line, footer/last-touched)  → "Inside"
// GROUND_MAX_ZOOM sits above the resting/reveal zoom caps (RESTING_MAX_ZOOM 1.0, frameTarget 0.95)
// so a framed card rests in the Ground band, not spuriously in Inside.
export const ORBIT_MAX_ZOOM = 0.78;
export const GROUND_MAX_ZOOM = 1.1;

// The container altitude (venture/architecture/detail) is now a LOOKUP from the shared semantic band, so
// the altitude word and the card anatomy read from one source. Both COMPONENTS and ARTIFACTS map to the
// single "detail" container altitude the legacy CSS keys off; the altimeter distinguishes all four bands.
// Kept here (rather than importing the band module) to avoid a cycle — semanticBand.ts imports the two
// cutpoints above. This is the raw (no-hysteresis) reading the camera's cold-start altitude uses.
export function altitudeForZoom(zoom: number): AtlasAltitude {
  if (zoom <= ORBIT_MAX_ZOOM) return "venture";
  if (zoom < GROUND_MAX_ZOOM) return "architecture";
  return "detail";
}

// The most a resting card is zoomed. The engine places the field hub-centered at composite density,
// so a hub-centered fit fills the stage at a legible zoom; this cap keeps a sparse field from being
// blown up past 1:1. The fit still zooms *out* below the cap whenever the field is larger than the
// stage, so the whole collision-free field always insets.
const RESTING_MAX_ZOOM = 1.0;

// Fit the engine-placed cards HUB-CENTERED: the hub is pinned at the field origin, so we frame a box
// centered on the origin whose half-extent covers the farthest card on each axis. This keeps the
// central question dead-centre on the stage (the composite's structure) instead of letting an
// off-centre bounding box drift the hub sideways, and it lets a sparse field fill the stage rather
// than under-zooming. Decorative background (orbit ring / group frames) is excluded so it can't dwarf
// the real cards. Extra top inset reserves the strip the return band floats over.
function fitFieldToStage(instance: ReactFlowInstance<AtlasNode>) {
  const framed = instance.getNodes().filter((node) => node.data.kind !== "group");
  if (!framed.length) {
    return instance.fitView({ padding: 0.1, maxZoom: RESTING_MAX_ZOOM, duration: 0 });
  }
  const canvas = document.querySelector<HTMLElement>(".atlas-canvas");
  // Without a live stage cell (jsdom / pre-mount) we cannot compute hub-centered bounds; defer to
  // React Flow's own fitView so callers that restore a prior viewport are not clobbered.
  if (!canvas) {
    return instance.fitView({ padding: 0.12, maxZoom: RESTING_MAX_ZOOM, duration: 0 });
  }
  const bounds = visibleCanvasBounds(canvas);
  const size = (node: (typeof framed)[number]) => ({
    w: node.measured?.width ?? node.width ?? 180,
    h: node.measured?.height ?? node.height ?? 160,
  });
  // Origin-symmetric half-extent: the farthest a card's outer edge reaches from the field origin on
  // each axis. Framing ±this box keeps the origin (hub center) at the stage center.
  let halfX = 1;
  let halfY = 1;
  for (const node of framed) {
    const { w, h } = size(node);
    halfX = Math.max(halfX, Math.abs(node.position.x), Math.abs(node.position.x + w));
    halfY = Math.max(halfY, Math.abs(node.position.y), Math.abs(node.position.y + h));
  }
  const availW = Math.max(1, bounds.right - bounds.left);
  const availH = Math.max(1, bounds.bottom - bounds.top);
  // Padding fraction so cards never touch the stage edge. Kept tight (the field is hub-centered and
  // fits by construction) so a sparse field fills the stage at a legible zoom rather than floating in
  // empty canvas.
  const pad = 0.94;
  const zoom = Math.min(RESTING_MAX_ZOOM, ((availW * pad) / (2 * halfX)), ((availH * pad) / (2 * halfY)));
  // Put the field origin at the centre of the available stage region.
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  return instance.setViewport({ x: centerX, y: centerY, zoom }, { duration: 0 });
}

// The stage cell is the canvas element itself (the ADE grid docks the rail and inspector in
// their own cells). The only chrome that floats over the stage now is the return band and the
// atlas controls at the top; the composer is docked in the rail cell, off the stage. Bounds are
// the stage cell minus a 24px inset, with the top pushed below any floating stage chrome.
function visibleCanvasBounds(canvas: HTMLElement) {
  const canvasRect = canvas.getBoundingClientRect();
  const band = document.querySelector<HTMLElement>(".atlas-return-band");
  const controls = document.querySelector<HTMLElement>(".atlas-controls");
  const topBlocker = [band, controls].reduce((edge, element) => {
    if (!element) return edge;
    return Math.max(edge, element.getBoundingClientRect().bottom - canvasRect.top + 16);
  }, 24);
  return {
    left: 24,
    right: canvas.clientWidth - 24,
    top: topBlocker,
    bottom: canvas.clientHeight - 24,
  };
}

// fitFieldToStage owns the framing (zoom + centering). This backstop only translates the viewport so
// the already-fitted field sits inside the stage bounds (below the floating return band at top) — it
// never changes zoom, so it cannot shrink cards below the legibility fitView chose. It exists because
// a fit that lands before nodes are measured (e.g. right after a dive folds back) can leave the field
// offset; the position clamp pulls it back on-stage on the next settle. No orbital coordinates.
function keepAtlasChromeClear(instance: ReactFlowInstance<AtlasNode>) {
  const canvas = document.querySelector<HTMLElement>(".atlas-canvas");
  if (!canvas) return Promise.resolve(false);
  const framed = instance.getNodes().filter((node) => node.data.kind !== "group");
  if (!framed.length) return Promise.resolve(false);
  const bounds = visibleCanvasBounds(canvas);
  const viewport = instance.getViewport();
  const size = (node: (typeof framed)[number]) => ({
    w: node.measured?.width ?? node.width ?? 180,
    h: node.measured?.height ?? node.height ?? 160,
  });
  const minX = Math.min(...framed.map((node) => node.position.x));
  const minY = Math.min(...framed.map((node) => node.position.y));
  const maxX = Math.max(...framed.map((node) => node.position.x + size(node).w));
  const maxY = Math.max(...framed.map((node) => node.position.y + size(node).h));
  const fieldW = Math.max(1, maxX - minX);
  const fieldH = Math.max(1, maxY - minY);
  const availW = bounds.right - bounds.left;
  const availH = bounds.bottom - bounds.top;
  // If the field overruns the stage region at the fitted zoom, ease the zoom down to contain it so
  // the whole collision-free field is visible inside the stage cell (no card bleeds past the edge or
  // hides under the return band). fitView already chose the tightest legible zoom for the common case;
  // this only tightens further when a card's real measured size makes the field larger than estimated.
  // Ease the zoom down to contain the field inside the stage cell so the whole collision-free field
  // is visible (no card bleeds past the edge or hides under the return band). fitView already chose
  // the tightest legible zoom for the common case; this tightens further when a card's real measured
  // size makes the field larger than estimated.
  const containZoom = Math.min(availW / fieldW, availH / fieldH);
  let zoom = viewport.zoom;
  if (containZoom < zoom) zoom = Math.max(0.18, containZoom);
  // Clamp (or, if still wider than the region, center) so the field sits inside the stage region.
  const clampOrCenter = (lo: number, hi: number, value: number) =>
    lo <= hi ? Math.min(hi, Math.max(lo, value)) : (lo + hi) / 2;
  const x = clampOrCenter(bounds.right - maxX * zoom, bounds.left - minX * zoom, viewport.x);
  const y = clampOrCenter(bounds.bottom - maxY * zoom, bounds.top - minY * zoom, viewport.y);
  if (x === viewport.x && y === viewport.y && zoom === viewport.zoom) return Promise.resolve(false);
  return instance.setViewport({ x, y, zoom }, { duration: 0 });
}

// React Flow keeps measured nodes hidden until fitView runs. Use it only as the reveal trigger, then
// immediately restore the atlas's authoritative hub-centered framing and chrome clearance.
function revealThenFrame(instance: ReactFlowInstance<AtlasNode>) {
  return Promise.resolve(instance.fitView({ duration: 0 }))
    .then(() => fitFieldToStage(instance))
    .then(() => keepAtlasChromeClear(instance));
}

export function useAtlasCamera(nodes: AtlasNode[], receiptKey: string) {
  const instanceRef = useRef<ReactFlowInstance<AtlasNode> | null>(null);
  const nodesRef = useRef(nodes);
  const readyRef = useRef(false);
  const requestedTargetIdRef = useRef<string | null>(null);
  const previousViewport = useRef<Viewport | null>(null);
  const previousFocusViewport = useRef<Viewport | null>(null);
  const targetIdRef = useRef<string | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  const [altitude, setAltitude] = useState<AtlasAltitude>("venture");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const onMoveEnd = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    setAltitude(altitudeForZoom(viewport.zoom));
    window.localStorage.setItem(cameraKey(receiptKey), JSON.stringify(viewport));
  }, [receiptKey]);

  // Re-derive the altitude readout from the camera's *current* zoom. onMoveEnd only fires on founder
  // gestures (wheel/drag); every programmatic reframe below moves the camera via setViewport({duration:0}),
  // which does NOT fire onMoveEnd. Without this, a reveal/fit/reframe can leave the camera in the Ground
  // (architecture) band — cards showing full anatomy via the live useSemanticZoom store subscription —
  // while the altimeter stays on the stale band and still reads "Orbit". Reading the same live zoom the
  // per-node band reads keeps label and detail from disagreeing. Camera motion is untouched.
  const syncAltitude = useCallback(() => {
    const instance = instanceRef.current;
    if (instance) setAltitude(altitudeForZoom(instance.getZoom()));
  }, []);

  const frameTarget = useCallback((id: string) => {
    const instance = instanceRef.current;
    if (!instance) return false;
    const anchor = instance.getNodes().find((node) => node.id === id)
      ?? nodesRef.current.find((node) => node.id === id);
    if (!anchor) return false;
    const width = anchor.measured?.width ?? anchor.width ?? 280;
    const height = anchor.measured?.height ?? anchor.height ?? 160;
    const zoom = Math.min(0.95, Math.max(0.72, instance.getZoom()));
    const canvas = document.querySelector<HTMLElement>(".atlas-canvas");
    if (!canvas) {
      void instance.setCenter(anchor.position.x + width / 2, anchor.position.y + height / 2, { zoom, duration: 0 })
        .then(syncAltitude);
      return true;
    }
    const bounds = visibleCanvasBounds(canvas);
    const screenCenterX = (bounds.left + bounds.right) / 2;
    const screenCenterY = (bounds.top + bounds.bottom) / 2;
    void instance.setViewport({
      x: screenCenterX - (anchor.position.x + width / 2) * zoom,
      y: screenCenterY - (anchor.position.y + height / 2) * zoom,
      zoom,
    }, { duration: 0 }).then(() => keepAtlasChromeClear(instance)).then(syncAltitude);
    return true;
  }, [syncAltitude]);

  // Whenever the node set settles and no selection is being framed, re-fit the engine-placed field
  // to the stage cell. This is the authoritative framing guarantee: it holds regardless of mount
  // timing (e.g. after a dive folds back and the atlas re-renders), so the field is never left
  // off-stage. When a selection is active, we frame that target instead.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !readyRef.current) return;
    // Fit only once React Flow has actually measured the freshly-rendered nodes. React Flow keeps a
    // node `visibility:hidden` until its DOM is measured, and a manual setViewport does not trigger
    // that reveal — so if we fit before measurement completes, the cards can stay invisible (a real
    // race seen at some viewport sizes on a cold mount). We poll a few frames for measurement; the
    // moment it lands we run React Flow's own fitView once (this is the call that reveals the measured
    // nodes) and then refine with the hub-centered framing. If measurement never lands within the
    // budget we fit anyway against fallback sizes rather than hang.
    let raf = 0;
    let cancelled = false;
    const measured = () => {
      const rendered = instance.getNodes();
      return rendered.length > 0 && rendered.every((node) => (node.measured?.width ?? node.width ?? 0) > 0);
    };
    const settle = () => {
      const target = targetIdRef.current;
      if (target) { frameTarget(target); return; }
      // React Flow's fitView reveals any still-hidden measured nodes; the hub-centered fit then frames.
      void revealThenFrame(instance).then(syncAltitude);
    };
    let attempts = 0;
    const tick = () => {
      if (cancelled) return;
      attempts += 1;
      if (measured() || attempts >= 8) { settle(); return; }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => { cancelled = true; window.cancelAnimationFrame(raf); };
  }, [frameTarget, nodes, syncAltitude]);

  useEffect(() => {
    const instance = instanceRef.current;
    const canvas = document.querySelector<HTMLElement>(".atlas-canvas");
    if (!instance || !canvas || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    // Re-fit the atlas to its new stage cell whenever the rail collapses, the inspector opens,
    // or the window resizes (contract §2.1: re-fit within 300ms of any region toggle). The stage
    // cell is the canvas element; fitView reframes the engine-placed field into it.
    const reframe = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!readyRef.current) return;
        const target = targetIdRef.current;
        if (target) frameTarget(target);
        else void revealThenFrame(instance).then(syncAltitude);
      });
    };
    const observer = new ResizeObserver(reframe);
    [
      canvas,
      document.querySelector<HTMLElement>(".firm-app-body"),
      document.querySelector<HTMLElement>(".firm-app-rail"),
      document.querySelector<HTMLElement>(".firm-app-inspector"),
    ].forEach((element) => { if (element) observer.observe(element); });
    window.addEventListener("resize", reframe);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reframe);
      window.cancelAnimationFrame(frame);
    };
  }, [cameraReady, frameTarget, syncAltitude]);

  const reveal = useCallback((id: string) => {
    const instance = instanceRef.current;
    requestedTargetIdRef.current = id;
    if (!instance || !readyRef.current) return false;
    const restoreViewport = !targetIdRef.current ? instance.getViewport() : null;
    if (!frameTarget(id)) return false;
    if (restoreViewport) previousViewport.current = restoreViewport;
    targetIdRef.current = id;
    focusedIdRef.current = null;
    previousFocusViewport.current = null;
    setTargetId(id);
    setFocusedId(null);
    return true;
  }, [frameTarget]);

  const onInit = useCallback((instance: ReactFlowInstance<AtlasNode>) => {
    instanceRef.current = instance;
    readyRef.current = false;
    // A fresh mount (first open, or the atlas re-rendering after a dive folds back) starts from the
    // fitted overview — clear any stale reveal/focus target so the nodes-settle effect fits the whole
    // field rather than re-centering on a selection captured before the remount.
    if (!requestedTargetIdRef.current) {
      targetIdRef.current = null;
      focusedIdRef.current = null;
      previousViewport.current = null;
      previousFocusViewport.current = null;
    }
    window.requestAnimationFrame(() => {
      // Placement is engine-owned, deterministic, and collision-free, so the opening camera always
      // fits the whole settled field to the live stage cell. We deliberately do NOT restore a
      // persisted viewport on mount: a frame captured mid-interaction (or before a dive round-trip
      // remounts the atlas) is stale against the current layout and would leave the field off-stage.
      // Session pan/zoom still persists via onMoveEnd for in-session continuity; cross-mount framing
      // is owned by fitView. (A durable "return to my frame" is a later camera-persistence concern.)
      void revealThenFrame(instance)
        .then(() => new Promise<void>((resolve) => { window.requestAnimationFrame(() => resolve()); }))
        .then(() => {
        readyRef.current = true;
        setCameraReady(true);
        setAltitude(altitudeForZoom(instance.getZoom()));
        if (requestedTargetIdRef.current) reveal(requestedTargetIdRef.current);
        });
    });
  }, [reveal]);

  const focus = useCallback((id: string, related: Set<string>) => {
    const instance = instanceRef.current;
    if (!instance) return false;
    const anchor = instance.getNodes().find((node) => node.id === id)
      ?? nodesRef.current.find((node) => node.id === id);
    if (!anchor) return false;
    if (!targetIdRef.current) previousViewport.current = instance.getViewport();
    if (!focusedIdRef.current) previousFocusViewport.current = instance.getViewport();
    targetIdRef.current = id;
    focusedIdRef.current = id;
    setTargetId(id);
    setFocusedId(id);
    const canvasWidth = document.querySelector<HTMLElement>(".atlas-canvas")?.clientWidth ?? 1200;
    const zoom = Math.min(0.9, Math.max(0.72, instance.getZoom()));
    const downstreamOffset = Math.min(620, canvasWidth * 0.38) / zoom;
    const traceNodes = nodesRef.current.filter((node) => related.has(node.id));
    const centerY = traceNodes.length
      ? (Math.min(...traceNodes.map((node) => node.position.y)) + Math.max(...traceNodes.map((node) => node.position.y))) / 2
      : anchor.position.y;
    void instance.setCenter(anchor.position.x + downstreamOffset, Math.max(anchor.position.y, centerY), { zoom, duration: 0 })
      .then(syncAltitude);
    return true;
  }, [syncAltitude]);

  const unfocus = useCallback(() => {
    const instance = instanceRef.current;
    focusedIdRef.current = null;
    setFocusedId(null);
    const previous = previousFocusViewport.current;
    previousFocusViewport.current = null;
    if (instance && previous) void instance.setViewport(previous, { duration: 0 }).then(syncAltitude);
    else if (targetIdRef.current) frameTarget(targetIdRef.current);
  }, [frameTarget, syncAltitude]);

  const broaden = useCallback(() => {
    const instance = instanceRef.current;
    requestedTargetIdRef.current = null;
    targetIdRef.current = null;
    focusedIdRef.current = null;
    setTargetId(null);
    setFocusedId(null);
    previousFocusViewport.current = null;
    if (!instance) return;
    const previous = previousViewport.current;
    previousViewport.current = null;
    // Broadening to the overview re-fits the whole engine-placed field to the stage cell.
    if (previous) void instance.setViewport(previous, { duration: 0 }).then(syncAltitude);
    else void fitFieldToStage(instance).then(syncAltitude);
  }, [syncAltitude]);

  const syncSelection = useCallback((id: string | null) => {
    requestedTargetIdRef.current = id;
    if (!id) {
      if (targetIdRef.current || focusedIdRef.current) broaden();
      return;
    }
    if (focusedIdRef.current === id) return;
    reveal(id);
  }, [broaden, reveal]);

  const fitWhole = useCallback(() => {
    requestedTargetIdRef.current = null;
    targetIdRef.current = null;
    focusedIdRef.current = null;
    setTargetId(null);
    setFocusedId(null);
    previousViewport.current = null;
    previousFocusViewport.current = null;
    // "Whole venture" frames the entire engine-placed field (efforts, wall, returned reality) into
    // the stage cell — excluding the decorative background field, which would otherwise dominate the
    // fit and shove the real cards off to one side.
    if (instanceRef.current) void revealThenFrame(instanceRef.current).then(syncAltitude);
  }, [syncAltitude]);

  return {
    altitude,
    targetId,
    focusedId,
    onInit,
    onMoveEnd,
    syncSelection,
    reveal,
    focus,
    unfocus,
    broaden,
    fitWhole,
    instanceRef,
  };
}
