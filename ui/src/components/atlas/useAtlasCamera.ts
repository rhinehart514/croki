import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactFlowInstance, Viewport } from "@xyflow/react";
import type { AtlasAltitude, AtlasNode } from "./atlasTypes";
import { ORBIT_BET_CARD, ORBIT_CENTER } from "./atlasOrbitLayout";

function cameraKey(receiptKey: string) { return `drover:atlas-camera:v6:${receiptKey}`; }

function readCamera(receiptKey: string): Viewport | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(cameraKey(receiptKey)) ?? "null") as Partial<Viewport> | null;
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.zoom)
      ? { x: Number(value.x), y: Number(value.y), zoom: Number(value.zoom) }
      : null;
  } catch { return null; }
}

function altitudeForZoom(zoom: number): AtlasAltitude {
  if (zoom <= 0.78) return "venture";
  if (zoom < 1.1) return "architecture";
  return "detail";
}

function openingNodes(nodes: AtlasNode[]) {
  const orbit = nodes.find((node) => node.data.kind === "orbit-field");
  const bets = nodes.filter((node) => node.data.kind === "bet");
  const intent = nodes.find((node) => node.data.kind === "intent");
  const wall = nodes.find((node) => node.data.kind === "wall");

  // A venture can have durable bets and returned reality before the founder has named any
  // architecture. Open on one coherent consequence spine so the real return is not offscreen.
  const outcome = nodes.find((node) => node.data.kind === "outcome");
  if (outcome && !intent?.data.intentNamed) {
    const joinedBetId = outcome.data.join?.betId;
    const bet = bets.find((node) => node.data.bet?.id === joinedBetId) ?? bets[0];
    const betId = bet?.data.bet?.id;
    const work = nodes.find((node) => node.data.kind === "work" && (!betId || node.data.join?.betId === betId));
    return [bet, work, outcome, wall].filter((node): node is AtlasNode => Boolean(node));
  }
  if (orbit && bets.length) return [intent, ...bets, wall].filter((node): node is AtlasNode => Boolean(node));
  let concepts = 0;
  const architecture = nodes.filter((node) => {
    if (["bet", "work", "outcome", "wall"].includes(node.data.kind)) return false;
    if (node.data.kind !== "concept") return true;
    concepts += 1;
    return concepts <= 3;
  });
  if (architecture.some((node) => node.data.kind === "campaign")) return architecture;

  const joinedBetId = outcome?.data.join?.betId;
  const bet = nodes.find((node) => node.data.kind === "bet" && node.data.bet?.id === joinedBetId)
    ?? nodes.find((node) => node.data.kind === "bet");
  const betId = bet?.data.bet?.id;
  const work = nodes.find((node) => node.data.kind === "work" && (!betId || node.data.join?.betId === betId));
  const consequential = [bet, work, outcome]
    .filter((node): node is AtlasNode => Boolean(node));
  const consequenceSpine = wall && consequential.length ? [...consequential, wall] : consequential;
  const framed = consequenceSpine.length ? consequenceSpine : architecture;
  return [...new Map(framed.map((node) => [node.id, node])).values()];
}

function nodeSize(node: AtlasNode) {
  if (node.data.kind === "bet") return { width: ORBIT_BET_CARD.width, height: ORBIT_BET_CARD.height };
  if (node.data.kind === "intent") return { width: 250, height: 164 };
  if (node.data.kind === "wall") return { width: node.data.active ? 230 : 164, height: 122 };
  return { width: node.measured?.width ?? node.width ?? 300, height: node.measured?.height ?? node.height ?? 180 };
}

function visibleCanvasBounds(canvas: HTMLElement) {
  const canvasRect = canvas.getBoundingClientRect();
  const leftBlockers = [
    document.querySelector<HTMLElement>(".atlas-shelf"),
    document.querySelector<HTMLElement>(".firm-app-thread"),
  ].filter((element): element is HTMLElement => Boolean(element));
  const left = leftBlockers.reduce((edge, element) => {
    const rect = element.getBoundingClientRect();
    return Math.max(edge, rect.right - canvasRect.left + 16);
  }, 24);
  const composer = document.querySelector<HTMLElement>(".firm-app-composer-layer");
  const band = document.querySelector<HTMLElement>(".atlas-return-band");
  const controls = document.querySelector<HTMLElement>(".atlas-controls");
  const topBlocker = [band, controls].reduce((edge, element) => {
    if (!element) return edge;
    return Math.max(edge, element.getBoundingClientRect().bottom - canvasRect.top + 16);
  }, 24);
  return {
    left,
    right: canvas.clientWidth - 24,
    top: topBlocker,
    bottom: composer ? composer.getBoundingClientRect().top - canvasRect.top - 16 : canvas.clientHeight - 24,
  };
}

function setOpeningViewport(instance: ReactFlowInstance<AtlasNode>, nodes: AtlasNode[], duration: number) {
  const canvas = document.querySelector<HTMLElement>(".atlas-canvas");
  const semantic = openingNodes(nodes);
  if (!semantic.length) return Promise.resolve(false);
  const campaign = semantic.find((node) => node.data.kind === "campaign" && node.data.active)
    ?? semantic.find((node) => node.data.kind === "campaign");
  const framed = campaign ? semantic.filter((node) => node.position.x <= campaign.position.x) : semantic;
  const minX = Math.min(...framed.map((node) => node.position.x));
  const minY = Math.min(...framed.map((node) => node.position.y));
  const maxY = Math.max(...framed.map((node) => node.position.y + nodeSize(node).height));
  const right = campaign ? campaign.position.x + 300 : Math.max(...framed.map((node) => node.position.x + nodeSize(node).width));
  const bounds = visibleCanvasBounds(canvas ?? document.body);
  const horizontalZoom = (bounds.right - bounds.left) / Math.max(1, right - minX);
  const verticalZoom = (bounds.bottom - bounds.top) / Math.max(1, maxY - minY);
  // The opening canvas is allowed to extend beyond the viewport; panning is the interaction.
  // Never shrink the truth vocabulary into unreadable texture just to fit every landmark at once.
  const zoom = Math.min(0.78, Math.max(0.68, Math.min(horizontalZoom, verticalZoom)));
  const fieldWidth = (right - minX) * zoom;
  const fieldHeight = (maxY - minY) * zoom;
  const x = bounds.left + Math.max(0, (bounds.right - bounds.left - fieldWidth) / 2) - minX * zoom;
  const y = bounds.top + Math.max(0, (bounds.bottom - bounds.top - fieldHeight) / 2) - minY * zoom;
  return instance.setViewport({ x, y, zoom }, { duration });
}

function keepAtlasChromeClear(instance: ReactFlowInstance<AtlasNode>, nodes: AtlasNode[], duration: number) {
  const wall = nodes.find((node) => node.id === "atlas:wall");
  const canvas = document.querySelector<HTMLElement>(".atlas-canvas");
  if (!canvas) return Promise.resolve(false);
  const viewport = instance.getViewport();
  let x = viewport.x;
  let y = viewport.y;
  let zoom = viewport.zoom;

  const bets = nodes.filter((node) => node.data.kind === "bet");
  const composer = document.querySelector<HTMLElement>(".firm-app-composer-layer");
  if (bets.length && composer) {
    const safeBounds = visibleCanvasBounds(canvas);
    const allowedBottom = safeBounds.bottom;
    const allowedTop = safeBounds.top;
    const minY = Math.min(...bets.map((node) => node.position.y));
    const maxY = Math.max(...bets.map((node) => node.position.y + ORBIT_BET_CARD.height));
    const fitZoom = (allowedBottom - allowedTop) / Math.max(1, maxY - minY);
    if (fitZoom < zoom) {
      const centerScreenX = x + ORBIT_CENTER.x * zoom;
      // Dense orbital sectors can extend beyond the nominal 880px field once cards are spread
      // far enough to avoid collisions. Let the default camera settle below 0.6 when that is the
      // only way to keep every real bet between the return band and composer; clipping the truth
      // behind chrome is worse than a modestly wider venture view.
      zoom = Math.max(0.52, fitZoom);
      x = centerScreenX - ORBIT_CENTER.x * zoom;
      y = allowedTop - minY * zoom;
    } else {
      const renderedTop = y + minY * zoom;
      const renderedBottom = y + maxY * zoom;
      if (renderedBottom > allowedBottom) y -= Math.min(renderedBottom - allowedBottom, Math.max(0, renderedTop - allowedTop));
    }
  }

  const bounds = visibleCanvasBounds(canvas);
  const intent = nodes.find((node) => node.data.kind === "intent");
  const minimumX = intent ? bounds.left - intent.position.x * zoom : Number.NEGATIVE_INFINITY;
  const wallWidth = wall?.data.active ? 230 : 164;
  const maximumX = wall ? bounds.right - (wall.position.x + wallWidth) * zoom : Number.POSITIVE_INFINITY;
  x = Math.min(maximumX, Math.max(minimumX, x));

  if (x === viewport.x && y === viewport.y && zoom === viewport.zoom) return Promise.resolve(false);
  return instance.setViewport({ x, y, zoom }, { duration });
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
  const [storedViewport] = useState<Viewport | null>(() => readCamera(receiptKey));

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const onMoveEnd = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    setAltitude(altitudeForZoom(viewport.zoom));
    window.localStorage.setItem(cameraKey(receiptKey), JSON.stringify(viewport));
  }, [receiptKey]);

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
      void instance.setCenter(anchor.position.x + width / 2, anchor.position.y + height / 2, { zoom, duration: 0 });
      return true;
    }
    const bounds = visibleCanvasBounds(canvas);
    const screenCenterX = (bounds.left + bounds.right) / 2;
    const screenCenterY = (bounds.top + bounds.bottom) / 2;
    void instance.setViewport({
      x: screenCenterX - (anchor.position.x + width / 2) * zoom,
      y: screenCenterY - (anchor.position.y + height / 2) * zoom,
      zoom,
    }, { duration: 0 }).then(() => keepAtlasChromeClear(instance, nodesRef.current, 0));
    return true;
  }, []);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !readyRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const target = targetIdRef.current;
      if (target) frameTarget(target);
      else void keepAtlasChromeClear(instance, nodes, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [frameTarget, nodes]);

  useEffect(() => {
    const instance = instanceRef.current;
    const canvas = document.querySelector<HTMLElement>(".atlas-canvas");
    if (!instance || !canvas || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const reframe = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!readyRef.current) return;
        const target = targetIdRef.current;
        if (target) frameTarget(target);
        else void setOpeningViewport(instance, nodesRef.current, 0).then(() => keepAtlasChromeClear(instance, nodesRef.current, 0));
      });
    };
    const observer = new ResizeObserver(reframe);
    [
      canvas,
      document.querySelector<HTMLElement>(".atlas-shelf"),
      document.querySelector<HTMLElement>(".firm-app-thread"),
      document.querySelector<HTMLElement>(".firm-app-composer-layer"),
      document.querySelector<HTMLElement>(".atlas-controls"),
    ].forEach((element) => { if (element) observer.observe(element); });
    window.addEventListener("resize", reframe);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reframe);
      window.cancelAnimationFrame(frame);
    };
  }, [cameraReady, frameTarget]);

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
    window.requestAnimationFrame(() => {
      const opening = storedViewport
        ? instance.setViewport(storedViewport, { duration: 0 })
        : setOpeningViewport(instance, nodes, 0);
      void opening
        .then(() => new Promise<void>((resolve) => { window.requestAnimationFrame(() => resolve()); }))
        .then(() => keepAtlasChromeClear(instance, nodes, 0))
        .then(() => {
        readyRef.current = true;
        setCameraReady(true);
        setAltitude(altitudeForZoom(instance.getZoom()));
        if (requestedTargetIdRef.current) reveal(requestedTargetIdRef.current);
        });
    });
  }, [nodes, reveal, storedViewport]);

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
    void instance.setCenter(anchor.position.x + downstreamOffset, Math.max(anchor.position.y, centerY), { zoom, duration: 0 });
    return true;
  }, []);

  const unfocus = useCallback(() => {
    const instance = instanceRef.current;
    focusedIdRef.current = null;
    setFocusedId(null);
    const previous = previousFocusViewport.current;
    previousFocusViewport.current = null;
    if (instance && previous) void instance.setViewport(previous, { duration: 0 });
    else if (targetIdRef.current) frameTarget(targetIdRef.current);
  }, [frameTarget]);

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
    if (previous) void instance.setViewport(previous, { duration: 0 });
    else void setOpeningViewport(instance, nodesRef.current, 0);
  }, []);

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
    // "Whole venture" must frame the entire venture — including the campaign's releases, the wall,
    // and returned reality — not only the architecture spine. Fit every node, not openingNodes().
    void instanceRef.current?.fitView({ padding: 0.14, maxZoom: 0.72, duration: 0 });
  }, []);

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
