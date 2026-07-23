// The workspace preview: a sandboxed per-workspace <webview> the founder and the Thread's own run
// share. The run's preview tools open and drive it through the desktop host; the founder can open
// a URL, reload, and pick an exact element that lands in the composer as context.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { publishPreviewAnnotation, type PreviewAnnotationPayload } from "@/lib/previewAnnotation";
import "./work-runtime.css";

export type WorkPreviewProps = {
  workspaceId: string;
  disabledReason?: string | null;
  unavailableReason?: string | null;
  className?: string;
};

type PreviewStatus = "idle" | "loading" | "ready" | "failed" | "unavailable";

const PREVIEW_STATUS_LABEL: Record<PreviewStatus, string> = {
  idle: "Not started",
  loading: "Loading…",
  ready: "Live",
  failed: "Failed",
  unavailable: "Desktop only",
};

export function WorkPreview({ workspaceId, disabledReason = null, unavailableReason = null, className = "" }: WorkPreviewProps) {
  const webviewRef = useRef<DroverWebviewElement | null>(null);
  const [src, setSrc] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const bridge = window.droverDesktop?.preview;
  const nativeUnavailable = !bridge || Boolean(unavailableReason);
  const shownStatus = nativeUnavailable ? "unavailable" : status;
  const shownError = nativeUnavailable ? unavailableReason ?? "Preview is available in the Croki desktop app." : error;

  // Agent-driven opens: the run's preview_open lands here so the founder watches the same page.
  useEffect(() => {
    if (!bridge) return undefined;
    return bridge.onOpenRequest((event) => {
      if (event.workspaceId !== workspaceId) return;
      setSrc(event.url);
      setAddress(event.url);
      setError(null);
    });
  }, [bridge, workspaceId]);

  // Element picks come back from the desktop host with the screenshot crop already captured.
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

  // The <webview> guest registers with the desktop host once its page exists; registration is
  // idempotent, so re-running after each navigation is safe.
  const bindWebview = useCallback((node: DroverWebviewElement | null) => {
    webviewRef.current = node;
    if (!node || !bridge) return undefined;
    const onDomReady = () => { void bridge.attach(workspaceId, node.getWebContentsId()).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause))); };
    const onStartLoading = () => { setStatus("loading"); setError(null); };
    const onStopLoading = () => setStatus((current) => (current === "failed" ? current : "ready"));
    const onFailLoad = (event: Event) => {
      const detail = event as Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean };
      if (detail.isMainFrame === false || detail.errorCode === -3) return;
      setStatus("failed");
      setError(`${detail.errorDescription || "The page failed to load"} (${detail.errorCode ?? "?"})`);
    };
    const onNavigate = (event: Event) => {
      const detail = event as Event & { url?: string };
      if (detail.url) setAddress(detail.url);
    };
    node.addEventListener("dom-ready", onDomReady);
    node.addEventListener("did-start-loading", onStartLoading);
    node.addEventListener("did-stop-loading", onStopLoading);
    node.addEventListener("did-fail-load", onFailLoad);
    node.addEventListener("did-navigate", onNavigate);
    node.addEventListener("did-navigate-in-page", onNavigate);
    return () => {
      node.removeEventListener("dom-ready", onDomReady);
      node.removeEventListener("did-start-loading", onStartLoading);
      node.removeEventListener("did-stop-loading", onStopLoading);
      node.removeEventListener("did-fail-load", onFailLoad);
      node.removeEventListener("did-navigate", onNavigate);
      node.removeEventListener("did-navigate-in-page", onNavigate);
    };
  }, [bridge, workspaceId]);

  useEffect(() => () => { if (bridge) void bridge.detach(workspaceId).catch(() => undefined); }, [bridge, workspaceId]);

  const navigate = (event: FormEvent) => {
    event.preventDefault();
    if (nativeUnavailable || disabledReason || !address.trim()) return;
    setError(null);
    setSrc(address.trim());
  };

  const reload = () => {
    if (disabledReason) return;
    try { webviewRef.current?.reload(); } catch { /* nothing loaded yet */ }
  };

  const togglePick = async () => {
    if (!bridge || disabledReason) return;
    try {
      if (picking) { await bridge.cancelPick(workspaceId); setPicking(false); }
      else { await bridge.startPick(workspaceId); setPicking(true); }
    } catch (cause) {
      setPicking(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <section className={`work-preview ${className}`.trim()} aria-label="Coding workspace preview">
      <form className="work-preview-toolbar" onSubmit={navigate}>
        <label><span className="sr-only">Preview URL</span><input type="url" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="http://localhost:5173" spellCheck={false} /></label>
        <button type="submit" disabled={!address.trim() || Boolean(disabledReason || unavailableReason) || nativeUnavailable}>Open</button>
        <button type="button" onClick={reload} disabled={!src || Boolean(disabledReason)}>Reload</button>
        <button type="button" onClick={() => void togglePick()} disabled={!src || shownStatus !== "ready" || Boolean(disabledReason)} aria-pressed={picking}>
          {picking ? "Cancel pick" : "Pick element"}
        </button>
        <span data-state={shownStatus}>{PREVIEW_STATUS_LABEL[shownStatus]}</span>
      </form>
      {disabledReason ? <p className="work-runtime-notice">{disabledReason}</p> : null}
      {picking ? <p className="work-runtime-notice" role="status">Click an element in the preview; it lands in your next message. Esc cancels.</p> : null}
      {shownError ? <p className="work-runtime-notice" role={shownStatus === "failed" ? "alert" : "status"}>{shownError}</p> : null}
      <div className="work-preview-viewport">
        {src && !nativeUnavailable ? (
          <webview ref={bindWebview} src={src} partition={`drover-preview:${workspaceId}`} />
        ) : (
          <p>Start the app in the isolated workspace, then open its local URL here — or let the run open it with its preview tools.</p>
        )}
      </div>
    </section>
  );
}
