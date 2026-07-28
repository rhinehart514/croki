import { Maximize2, Minimize2, PanelRightClose } from "lucide-react";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { RepositoryBrowser } from "@/components/review/RepositoryBrowser";
import { WORKBENCH_MAX_WIDTH, WORKBENCH_MIN_WIDTH } from "@/lib/venture-session";
import type { RepositoryReviewTarget } from "./previewPresentation";

export function RepositoryReviewPane({ ventureId, threadRef, target, maximized, onToggleMaximize, onHide, width, onResize }: {
  ventureId: string;
  threadRef: string;
  target: RepositoryReviewTarget;
  maximized: boolean;
  onToggleMaximize: () => void;
  onHide: () => void;
  width: number | null;
  onResize: (width: number) => void;
}) {
  const section = useRef<HTMLElement | null>(null);
  const clampWidth = (value: number) => Math.min(WORKBENCH_MAX_WIDTH, Math.max(WORKBENCH_MIN_WIDTH, Math.round(value)));
  const currentWidth = () => section.current?.getBoundingClientRect().width ?? WORKBENCH_MIN_WIDTH;
  const resize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const origin = event.clientX;
    const start = currentWidth();
    const move = (next: globalThis.PointerEvent) => onResize(clampWidth(start + (origin - next.clientX)));
    const done = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
  };

  return <section
    className="work-workbench repository-review-workbench"
    aria-label={`Review source: ${target.path}`}
    data-repository-review="true"
    ref={section}
    tabIndex={-1}
  >
    {!maximized ? <button
      type="button"
      className="work-workbench-resizer"
      role="separator"
      aria-label="Resize source Review"
      aria-orientation="vertical"
      aria-valuemin={WORKBENCH_MIN_WIDTH}
      aria-valuemax={WORKBENCH_MAX_WIDTH}
      aria-valuenow={width ?? Math.round((WORKBENCH_MIN_WIDTH + WORKBENCH_MAX_WIDTH) / 2)}
      onPointerDown={resize}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onResize(clampWidth(currentWidth() + 8));
        if (event.key === "ArrowRight") onResize(clampWidth(currentWidth() - 8));
      }}
    /> : null}
    <header className="work-workbench-head">
      <div className="work-workbench-title">
        <span>Review · Source</span>
        <strong title={target.path}>{target.path}</strong>
        <code>L{target.startLine}{target.endLine === target.startLine ? "" : `–L${target.endLine}`} · venture repository</code>
      </div>
      <div className="work-workbench-tools">
        <button type="button" className="work-workbench-icon" aria-label={maximized ? "Restore the split view" : "Expand the workbench"} title={maximized ? "Restore the split view" : "Expand the workbench"} onClick={onToggleMaximize}>
          {maximized ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
        </button>
        <button type="button" className="work-workbench-icon" aria-label="Hide the workbench" title="Hide the workbench" onClick={onHide}>
          <PanelRightClose aria-hidden="true" />
        </button>
      </div>
    </header>
    <div className="work-workbench-scroll">
      <RepositoryBrowser
        key={`${threadRef}:${target.path}:${target.startLine}:${target.endLine}:${target.digest ?? ""}`}
        ventureId={ventureId}
        threadRef={threadRef}
        initialReference={target}
      />
    </div>
  </section>;
}
