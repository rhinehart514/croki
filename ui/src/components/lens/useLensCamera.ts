import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, ReactFlowInstance, Viewport } from "@xyflow/react";
import type { FitOpts } from "@/lib/lensViewport";
import type { FirmLens } from "@/types";
import { altitudeForZoom, type CanvasAltitude } from "./lensScene";
import {
  cameraAt,
  emptyCameraHistory,
  moveCameraHistory,
  recordCamera,
  type CameraHistory,
} from "./lensCameraHistory";

const CAMERA_TRAVEL_MS = 180;

export function cameraTravelDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : CAMERA_TRAVEL_MS;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  ));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function hasDimensions(node: Node): boolean {
  return (node.measured?.width ?? node.width ?? 0) > 0
    && (node.measured?.height ?? node.height ?? 0) > 0;
}

export function useLensCamera({
  lens,
  selectedBetId,
  selectedWorkRef,
  wallOpen,
  fitOptions,
}: {
  lens: FirmLens | null;
  selectedBetId: string | null;
  selectedWorkRef: string | null;
  wallOpen: boolean;
  fitOptions: FitOpts;
}) {
  const [altitude, setAltitude] = useState<CanvasAltitude>("middle");
  const [history, setHistory] = useState<CameraHistory>(emptyCameraHistory);
  const [flowReady, setFlowReady] = useState(false);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const restoringRef = useRef(false);
  const lastAutomaticFocusRef = useRef<string | null>(null);
  const travelDuration = cameraTravelDuration(usePrefersReducedMotion());

  const onInit = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance;
    setFlowReady(true);
    setHistory((current) => recordCamera(current, instance.getViewport()));
  }, []);

  const recordCurrent = useCallback(() => {
    const viewport = flowRef.current?.getViewport();
    if (viewport) setHistory((current) => recordCamera(current, viewport));
  }, []);

  const moveHistory = useCallback((direction: -1 | 1) => {
    setHistory((current) => {
      const next = moveCameraHistory(current, direction);
      const viewport = cameraAt(next);
      if (next !== current && viewport && flowRef.current) {
        restoringRef.current = true;
        void flowRef.current.setViewport(viewport, { duration: travelDuration });
        setAltitude(altitudeForZoom(viewport.zoom));
      }
      return next;
    });
  }, [travelDuration]);

  const onMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    setAltitude(altitudeForZoom(viewport.zoom));
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    setHistory((current) => recordCamera(current, viewport));
  }, []);

  const fitFirm = useCallback(() => {
    recordCurrent();
    void flowRef.current?.fitView({ ...fitOptions, duration: travelDuration });
  }, [fitOptions, recordCurrent, travelDuration]);

  const focusNodes = useCallback(() => {
    if (!lens || !selectedBetId || !flowRef.current) return [];
    return flowRef.current.getNodes().filter((node) => (
      node.id === `bet:${selectedBetId}` && hasDimensions(node)
    ));
  }, [lens, selectedBetId]);

  const backToFocus = useCallback(() => {
    const nodes = focusNodes();
    if (!nodes.length) return;
    recordCurrent();
    void flowRef.current?.fitView({
      nodes,
      padding: { top: "10%", right: "12%", bottom: "18%", left: "10%" },
      minZoom: 0.55,
      maxZoom: 1.15,
      duration: travelDuration,
    });
  }, [focusNodes, recordCurrent, travelDuration]);

  useEffect(() => {
    if (!selectedBetId) {
      lastAutomaticFocusRef.current = null;
      return;
    }
    const focusReceipt = `${selectedBetId}:${selectedWorkRef ?? "bet"}:${wallOpen ? "wall" : "canvas"}`;
    if (!flowReady || lastAutomaticFocusRef.current === focusReceipt) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let cancelled = false;
    const frameFocus = () => {
      if (cancelled || lastAutomaticFocusRef.current === focusReceipt) return;
      const nodes = focusNodes();
      if (nodes.some((node) => node.id === `bet:${selectedBetId}`)) {
        if (attempts === 0) recordCurrent();
        void flowRef.current?.fitView({
          nodes,
          padding: { top: "10%", right: "12%", bottom: "18%", left: "10%" },
          minZoom: 0.55,
          maxZoom: 1.15,
          duration: travelDuration,
        });
        attempts += 1;
        if (attempts >= 3) {
          lastAutomaticFocusRef.current = focusReceipt;
          return;
        }
        timer = setTimeout(frameFocus, attempts === 1 ? 64 : 120);
        return;
      }
      attempts += 1;
      if (attempts < 12) timer = setTimeout(frameFocus, 32);
    };
    timer = setTimeout(frameFocus, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [flowReady, focusNodes, recordCurrent, selectedBetId, selectedWorkRef, travelDuration, wallOpen]);

  useEffect(() => {
    if (!selectedBetId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refitAfterResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const nodes = focusNodes();
        if (!nodes.length) return;
        void flowRef.current?.fitView({
          nodes,
          padding: { top: "10%", right: "12%", bottom: "18%", left: "10%" },
          minZoom: 0.55,
          maxZoom: 1.15,
          duration: travelDuration,
        });
      }, 80);
    };
    const lensSurface = document.querySelector<HTMLElement>(".firm-lens");
    let lastLensWidth = lensSurface?.clientWidth ?? 0;
    let lastLensHeight = lensSurface?.clientHeight ?? 0;
    const resizeObserver = lensSurface ? new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (Math.abs(width - lastLensWidth) < 1 && Math.abs(height - lastLensHeight) < 1) return;
      lastLensWidth = width;
      lastLensHeight = height;
      refitAfterResize();
    }) : null;
    if (lensSurface) resizeObserver?.observe(lensSurface);
    window.addEventListener("resize", refitAfterResize);
    window.visualViewport?.addEventListener("resize", refitAfterResize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", refitAfterResize);
      window.visualViewport?.removeEventListener("resize", refitAfterResize);
      if (timer) clearTimeout(timer);
    };
  }, [focusNodes, selectedBetId, travelDuration]);

  return {
    altitude,
    canGoBack: history.index > 0,
    canGoForward: history.index >= 0 && history.index < history.entries.length - 1,
    onInit,
    onMoveEnd,
    goBack: () => moveHistory(-1),
    goForward: () => moveHistory(1),
    fitFirm,
    backToFocus,
  };
}
