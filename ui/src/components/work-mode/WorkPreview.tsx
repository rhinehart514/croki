// One sandboxed preview guest shared by the founder and this Thread's active Run. Preview remains
// contextual Review material: its URL, viewport, zoom and last coherent page are presentation memory.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, ChevronLeft, ChevronRight, ExternalLink, MousePointer2, RotateCw } from "lucide-react";
import { publishPreviewAnnotation, type PreviewAnnotationPayload } from "@/lib/previewAnnotation";
import {
  readPreviewPresentation,
  rememberPreviewPresentation,
  workPresentationScope,
  type PreviewPresentation,
  type PreviewViewport,
} from "./previewPresentation";
import "./work-runtime.css";

export type WorkPreviewProps = {
  ventureId: string;
  workspaceId: string;
  threadRef: string;
  disabledReason?: string | null;
  unavailableReason?: string | null;
  className?: string;
};

type PreviewStatus = "idle" | "loading" | "reachable" | "unreachable" | "unavailable";
const VIEWPORT_WIDTH: Record<PreviewViewport, number | null> = {
  responsive: null,
  desktop: 1280,
  tablet: 768,
  mobile: 390,
};

function initialInspection(workspaceId: string): DroverPreviewInspection {
  return {
    workspaceId,
    url: null,
    title: null,
    loading: false,
    reachable: false,
    canGoBack: false,
    canGoForward: false,
    control: null,
    suggestions: [],
  };
}

export function WorkPreview({
  ventureId,
  workspaceId,
  threadRef,
  disabledReason = null,
  unavailableReason = null,
  className = "",
}: WorkPreviewProps) {
  const presentationScope = workPresentationScope(ventureId, threadRef);
  const remembered = readPreviewPresentation(presentationScope);
  const webviewRef = useRef<DroverWebviewElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const recoveredRef = useRef(false);
  const [presentation, setPresentation] = useState<PreviewPresentation>(remembered);
  const [src, setSrc] = useState(remembered.url);
  const [address, setAddress] = useState(remembered.url);
  const [status, setStatus] = useState<PreviewStatus>(remembered.url ? "loading" : "idle");
  const [inspection, setInspection] = useState(() => initialInspection(workspaceId));
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const bridge = window.droverDesktop?.preview;
  const nativeUnavailable = !bridge || Boolean(unavailableReason);

  const remember = useCallback((patch: Partial<PreviewPresentation>) => {
    setPresentation((current) => {
      const next = { ...current, ...patch };
      rememberPreviewPresentation(presentationScope, next);
      return next;
    });
  }, [presentationScope]);

  const inspect = useCallback(async () => {
    if (!bridge) return;
    try {
      const next = await bridge.inspect(ventureId, workspaceId);
      setInspection(next);
      setError(null);
      if (next.url) {
        setAddress(next.url);
        setSrc(next.url);
        rememberPreviewPresentation(presentationScope, { ...readPreviewPresentation(presentationScope), url: next.url });
      }
      setStatus(next.url ? (next.reachable ? "reachable" : "unreachable") : "idle");
      if (next.reachable && recoveredRef.current) {
        recoveredRef.current = false;
        await bridge.control(ventureId, workspaceId, "reload");
      } else if (next.url && !next.reachable) {
        recoveredRef.current = true;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [bridge, presentationScope, ventureId, workspaceId]);

  useEffect(() => {
    if (!bridge) return undefined;
    const initial = window.setTimeout(() => void inspect(), 0);
    const timer = window.setInterval(() => void inspect(), 2_500);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [bridge, inspect]);

  useEffect(() => {
    if (!bridge) return undefined;
    const stopOpen = bridge.onOpenRequest((event) => {
      if (event.workspaceId !== workspaceId) return;
      setSrc(event.url);
      setAddress(event.url);
      remember({ url: event.url });
      setError(null);
      setStatus("loading");
    });
    const stopState = bridge.onState((event) => {
      if (event.workspaceId !== workspaceId) return;
      setInspection((current) => ({ ...current, url: event.url, control: event.control }));
      if (event.url) { setAddress(event.url); remember({ url: event.url }); }
    });
    return () => { stopOpen(); stopState(); };
  }, [bridge, remember, workspaceId]);

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId: string; url: string }>).detail;
      if (!detail || detail.workspaceId !== workspaceId) return;
      setSrc(detail.url);
      setAddress(detail.url);
      remember({ url: detail.url });
      setError(null);
    };
    window.addEventListener("drover:terminal-preview-link", open);
    return () => window.removeEventListener("drover:terminal-preview-link", open);
  }, [remember, workspaceId]);

  useEffect(() => {
    if (!bridge) return undefined;
    return bridge.onAnnotation((event) => {
      if (event.workspaceId !== workspaceId) return;
      setPicking(false);
      publishPreviewAnnotation({
        workspaceId,
        annotation: event.annotation as PreviewAnnotationPayload,
        screenshot: event.screenshot,
      });
    });
  }, [bridge, workspaceId]);

  const bindWebview = useCallback((node: DroverWebviewElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    webviewRef.current = node;
    if (!node || !bridge) return;
    const onDomReady = () => {
      node.setZoomFactor?.(presentation.zoom);
      void bridge.attach(ventureId, workspaceId, node.getWebContentsId())
        .then(() => inspect())
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    };
    const onStart = () => { setStatus("loading"); setError(null); };
    const onStop = () => { setStatus("reachable"); void inspect(); };
    const onFail = (event: Event) => {
      const detail = event as Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean };
      if (detail.isMainFrame === false || detail.errorCode === -3) return;
      setStatus("unreachable");
      recoveredRef.current = true;
      setError(`${detail.errorDescription || "The local server stopped answering"} (${detail.errorCode ?? "?"})`);
    };
    const onNavigate = (event: Event) => {
      const url = (event as Event & { url?: string }).url;
      if (!url) return;
      setAddress(url);
      setSrc(url);
      remember({ url });
      void inspect();
    };
    const listeners: Array<[string, EventListener]> = [
      ["dom-ready", onDomReady], ["did-start-loading", onStart], ["did-stop-loading", onStop],
      ["did-fail-load", onFail], ["did-navigate", onNavigate], ["did-navigate-in-page", onNavigate],
    ];
    for (const [name, listener] of listeners) node.addEventListener(name, listener);
    cleanupRef.current = () => {
      for (const [name, listener] of listeners) node.removeEventListener(name, listener);
    };
  }, [bridge, inspect, presentation.zoom, remember, ventureId, workspaceId]);

  useEffect(() => () => {
    cleanupRef.current?.();
    if (bridge) void bridge.detach(workspaceId).catch(() => undefined);
  }, [bridge, workspaceId]);

  const control = async (
    operation: Parameters<NonNullable<typeof bridge>["control"]>[2],
    input: { url?: string; zoom?: number } = {},
  ) => {
    if (!bridge || disabledReason) return;
    setError(null);
    try {
      const next = await bridge.control(ventureId, workspaceId, operation, input);
      setInspection(next);
      if (next.url) { setSrc(next.url); setAddress(next.url); remember({ url: next.url }); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      if (operation !== "open_external") setStatus("unreachable");
    }
  };

  const navigate = (event: FormEvent) => {
    event.preventDefault();
    if (nativeUnavailable || disabledReason || !address.trim()) return;
    if (!src) {
      setSrc(address.trim());
      remember({ url: address.trim() });
      return;
    }
    void control("navigate", { url: address.trim() });
  };

  const chooseViewport = (viewport: PreviewViewport) => remember({ viewport });
  const chooseZoom = (zoom: number) => {
    remember({ zoom });
    webviewRef.current?.setZoomFactor?.(zoom);
    if (src) void control("zoom", { zoom });
  };
  const togglePick = async () => {
    if (!bridge || disabledReason) return;
    try {
      if (picking) await bridge.cancelPick(workspaceId);
      else await bridge.startPick(workspaceId);
      setPicking((current) => !current);
    } catch (cause) {
      setPicking(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const shownStatus = nativeUnavailable ? "unavailable" : status;
  const statusLabel = {
    idle: "No page",
    loading: "Loading…",
    reachable: "Reachable",
    unreachable: "Unreachable",
    unavailable: "Desktop only",
  }[shownStatus];
  const width = VIEWPORT_WIDTH[presentation.viewport];

  return <section className={`work-preview ${className}`.trim()} aria-label="Coding workspace preview" data-status={shownStatus}>
    <form className="work-preview-toolbar" onSubmit={navigate}>
      <button type="button" aria-label="Back" disabled={!inspection.canGoBack} onClick={() => void control("back")}><ChevronLeft aria-hidden="true" /></button>
      <button type="button" aria-label="Forward" disabled={!inspection.canGoForward} onClick={() => void control("forward")}><ChevronRight aria-hidden="true" /></button>
      <button type="button" aria-label="Reload" disabled={!src} onClick={() => void control("reload")}><RotateCw aria-hidden="true" /></button>
      <label><span className="sr-only">Preview URL</span><input type="url" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="http://localhost:5173" spellCheck={false} /></label>
      <button type="submit" disabled={!address.trim() || nativeUnavailable}>Open</button>
      <button type="button" aria-label="Open externally" disabled={!src} onClick={() => void control("open_external", { url: address })}><ExternalLink aria-hidden="true" /></button>
      <span data-state={shownStatus}>{statusLabel}</span>
    </form>
    <div className="work-preview-options">
      <div role="group" aria-label="Preview viewport">{(["responsive", "desktop", "tablet", "mobile"] as const).map((viewport) =>
        <button key={viewport} type="button" aria-pressed={presentation.viewport === viewport} onClick={() => chooseViewport(viewport)}>{viewport}</button>)}</div>
      <label>Zoom <select value={presentation.zoom} onChange={(event) => chooseZoom(Number(event.target.value))}>
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((zoom) => <option key={zoom} value={zoom}>{Math.round(zoom * 100)}%</option>)}
      </select></label>
      <button type="button" onClick={() => void togglePick()} disabled={!src || shownStatus !== "reachable"} aria-pressed={picking}><MousePointer2 aria-hidden="true" />{picking ? "Cancel pick" : "Pick element"}</button>
      <button type="button" onClick={() => void control("capture")} disabled={!src || shownStatus !== "reachable"}><Camera aria-hidden="true" />Capture</button>
      {inspection.control ? <span>{inspection.control.kind === "run" ? `${inspection.control.runId ?? "Run"} control` : "Founder control"}</span> : null}
    </div>
    {inspection.suggestions.length ? <div className="work-preview-suggestions" aria-label="Detected local servers">
      <span>Detected in this worktree</span>
      {inspection.suggestions.map((suggestion) => <button key={suggestion.url} type="button" onClick={() => {
        setAddress(suggestion.url);
        remember({ url: suggestion.url });
        if (src) void control("navigate", { url: suggestion.url });
        else setSrc(suggestion.url);
      }}>{suggestion.label}<small>{suggestion.url}</small></button>)}
    </div> : null}
    {disabledReason ? <p className="work-runtime-notice">{disabledReason}</p> : null}
    {picking ? <p className="work-runtime-notice" role="status">Click an element in the preview; its exact page, selector, source and screenshot land in your next message.</p> : null}
    {nativeUnavailable ? <p className="work-runtime-notice" role="status">{unavailableReason ?? "Preview is available in the Croki desktop app."}</p> : null}
    {error ? <p className="work-runtime-notice" role={shownStatus === "unreachable" ? "alert" : "status"}>{error} The last coherent preview and URL remain available.</p> : null}
    <div className="work-preview-viewport" data-viewport={presentation.viewport}>
      <div style={width ? { width, maxWidth: "100%" } : undefined}>
        {src && !nativeUnavailable
          ? <webview ref={bindWebview} src={src} partition={`drover-preview:${workspaceId}`} />
          : <p>Start a local server in the isolated worktree. Croki will offer its exact URL here.</p>}
      </div>
    </div>
  </section>;
}
