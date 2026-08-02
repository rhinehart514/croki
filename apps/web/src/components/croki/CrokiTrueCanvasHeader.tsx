import { Clock3 } from "lucide-react";

import type { CrokiCanvasLiveObject, CrokiCanvasLiveScene } from "./crokiCanvasLiveScene";

interface CrokiTrueCanvasHeaderProps {
  readonly scene: CrokiCanvasLiveScene;
  readonly focusMode: "all" | "attention";
  readonly onFocusModeChange: (mode: "all" | "attention") => void;
  readonly revisionObjects: readonly CrokiCanvasLiveObject[];
  readonly currentRevision: number | null;
  readonly onScrubRevision: (revision: number, artifact: CrokiCanvasLiveObject["artifact"]) => void;
}

/** Header controls for the read-only perception projection. */
export function CrokiTrueCanvasHeader(props: CrokiTrueCanvasHeaderProps) {
  const currentIndex = props.revisionObjects.findIndex(
    (object) => object.revision === props.currentRevision,
  );

  return (
    <header className="flex min-h-12 shrink-0 items-center gap-4 border-b border-white/10 px-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h1 className="truncate text-[12px] font-medium tracking-[0.04em] text-white">Canvas</h1>
          <span className="text-[10px] text-zinc-500">Live perception</span>
        </div>
        <p className="mt-0.5 truncate text-[10px] text-zinc-600">
          {props.scene.objects.length} objects · {props.scene.edges.length} relationships · observed{" "}
          {formatTime(props.scene.updatedAt)}
          {props.scene.perceptionRevision !== undefined
            ? ` · r${props.scene.perceptionRevision}`
            : ""}
        </p>
      </div>
      <nav aria-label="Canvas focus" className="flex shrink-0 items-center gap-3 text-[11px]">
        <button
          type="button"
          className={
            props.focusMode === "all"
              ? "border-b border-white pb-1 text-white"
              : "border-b border-transparent pb-1 text-zinc-600 hover:text-zinc-300"
          }
          aria-current={props.focusMode === "all" ? "page" : undefined}
          onClick={() => props.onFocusModeChange("all")}
        >
          World
        </button>
        <button
          type="button"
          className={
            props.focusMode === "attention"
              ? "border-b border-white pb-1 text-white"
              : "border-b border-transparent pb-1 text-zinc-600 hover:text-zinc-300"
          }
          aria-current={props.focusMode === "attention" ? "page" : undefined}
          onClick={() => props.onFocusModeChange("attention")}
        >
          Attention{" "}
          {props.scene.attentionIds.length > 0 ? `· ${props.scene.attentionIds.length}` : ""}
        </button>
      </nav>
      {props.revisionObjects.length > 1 ? (
        <div className="flex shrink-0 items-center gap-2 border-l border-white/10 pl-3">
          <Clock3 className="size-3 text-zinc-500" aria-hidden />
          <label htmlFor="croki-canvas-temporal-scrub" className="sr-only">
            Temporal scrub
          </label>
          <input
            id="croki-canvas-temporal-scrub"
            aria-label="Temporal scrub"
            type="range"
            min={0}
            max={props.revisionObjects.length - 1}
            value={Math.max(0, currentIndex)}
            className="h-1 w-20 accent-white"
            onChange={(event) => {
              const index = Number(event.target.value);
              const revisionObject = props.revisionObjects[index];
              if (revisionObject?.revision === undefined) return;
              props.onScrubRevision(revisionObject.revision, revisionObject.artifact);
            }}
          />
          <span className="text-[10px] text-zinc-500">
            {props.currentRevision ? `r${props.currentRevision}` : "live"}
          </span>
        </div>
      ) : null}
    </header>
  );
}

function formatTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "unknown";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(parsed);
}
