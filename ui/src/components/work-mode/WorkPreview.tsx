import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./work-runtime.css";

export type WorkPreviewProps = {
  workspaceId: string;
  initialUrl?: string;
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

function bounds(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export function WorkPreview({ workspaceId, initialUrl = "", disabledReason = null, unavailableReason = null, className = "" }: WorkPreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(false);
  const [draft, setDraft] = useState({ workspaceId, url: initialUrl });
  const [viewState, setViewState] = useState<{ workspaceId: string; status: PreviewStatus; error: string | null; shown: boolean }>({
    workspaceId, status: "idle", error: null, shown: false,
  });
  const url = draft.workspaceId === workspaceId ? draft.url : initialUrl;
  const nativeUnavailable = !window.droverDesktop?.preview || Boolean(unavailableReason);
  const current = viewState.workspaceId === workspaceId
    ? viewState
    : { workspaceId, status: "idle" as PreviewStatus, error: null, shown: false };
  const status = nativeUnavailable ? "unavailable" : current.status;
  const error = nativeUnavailable
    ? unavailableReason ?? "Preview is available in the Drover desktop app."
    : current.error;
  const setUrl = (nextUrl: string) => setDraft({ workspaceId, url: nextUrl });
  const update = (next: Partial<typeof current>) => setViewState((value) => ({
    ...(value.workspaceId === workspaceId ? value : current), ...next, workspaceId,
  }));

  useEffect(() => {
    const bridge = window.droverDesktop?.preview;
    const viewport = viewportRef.current;
    if (!bridge || !viewport || unavailableReason) return;
    const stopState = bridge.onState((event) => {
      if (event.workspaceId !== workspaceId) return;
      setViewState({ workspaceId, status: event.status, error: event.error, shown: true });
      if (event.url) setDraft({ workspaceId, url: event.url });
    });
    const resize = () => {
      if (shownRef.current && viewport.clientWidth && viewport.clientHeight) {
        void bridge.setBounds(bounds(viewport)).catch(() => undefined);
      }
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(viewport);
    window.addEventListener("resize", resize);

    if (initialUrl && viewport.clientWidth && viewport.clientHeight) {
      shownRef.current = true;
      void bridge.show({ workspaceId, url: initialUrl, bounds: bounds(viewport) }).catch((reason) => {
        shownRef.current = false;
        setViewState({ workspaceId, status: "failed", error: reason instanceof Error ? reason.message : String(reason), shown: false });
      });
    }
    return () => {
      stopState(); observer?.disconnect(); window.removeEventListener("resize", resize);
      if (shownRef.current) void bridge.hide().catch(() => undefined);
      shownRef.current = false;
    };
  }, [workspaceId, initialUrl, unavailableReason]);

  const navigate = async (event: FormEvent) => {
    event.preventDefault();
    const bridge = window.droverDesktop?.preview;
    const viewport = viewportRef.current;
    if (!bridge || !viewport || disabledReason || unavailableReason) return;
    update({ status: "loading", error: null });
    try {
      if (shownRef.current) await bridge.navigate(url);
      else {
        await bridge.show({ workspaceId, url, bounds: bounds(viewport) });
        shownRef.current = true;
        update({ shown: true });
      }
    } catch (reason) {
      update({ status: "failed", error: reason instanceof Error ? reason.message : String(reason) });
    }
  };

  const reload = async () => {
    const bridge = window.droverDesktop?.preview;
    if (!bridge || !shownRef.current || disabledReason) return;
    update({ status: "loading", error: null });
    try { await bridge.reload(); }
    catch (reason) { update({ status: "failed", error: reason instanceof Error ? reason.message : String(reason) }); }
  };

  return (
    <section className={`work-preview ${className}`.trim()} aria-label="Coding workspace preview">
      <form className="work-preview-toolbar" onSubmit={(event) => void navigate(event)}>
        <label><span className="sr-only">Preview URL</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://localhost:3000" spellCheck={false} /></label>
        <button type="submit" disabled={!url.trim() || Boolean(disabledReason || unavailableReason)}>Open</button>
        <button type="button" onClick={() => void reload()} disabled={!current.shown || Boolean(disabledReason)}>Reload</button>
        <span data-state={status}>{PREVIEW_STATUS_LABEL[status]}</span>
      </form>
      {disabledReason ? <p className="work-runtime-notice">{disabledReason}</p> : null}
      {error ? <p className="work-runtime-notice" role={status === "failed" ? "alert" : "status"}>{error}</p> : null}
      <div ref={viewportRef} className="work-preview-viewport">
        {!current.shown ? <p>Start the app in the isolated workspace, then open its local URL here.</p> : null}
      </div>
    </section>
  );
}
