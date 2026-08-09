import type { CrokiThoughtView } from "@croki/contracts";
import { Clock3, GitCompareArrows, Info, RefreshCw } from "lucide-react";

import type { CrokiCanvasLiveObject, CrokiCanvasLiveScene } from "./crokiCanvasLiveScene";

interface CrokiTrueCanvasHeaderProps {
  readonly scene: CrokiCanvasLiveScene;
  readonly revisionObjects: readonly CrokiCanvasLiveObject[];
  readonly currentRevision: number | null;
  readonly onScrubRevision: (revision: number, artifact: CrokiCanvasLiveObject["artifact"]) => void;
  readonly thoughtView?: CrokiThoughtView | null;
  readonly basisOpen?: boolean;
  readonly updateAvailable?: boolean;
  readonly onToggleBasis?: () => void;
  readonly onReframe?: () => void;
  readonly onUpdate?: () => void;
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
          <span className="text-[10px] text-zinc-500">
            {props.thoughtView
              ? `${viewLabel(props.thoughtView.representation)} view`
              : props.scene.perceptionScope === "project"
                ? "Shared product model"
                : "Working understanding"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[10px] text-zinc-600">
          {props.scene.perceptionStatus === "stale"
            ? "Last known"
            : props.scene.perceptionStatus === "rebuilding"
              ? "Rebuilding from Threads"
              : "Updated"}{" "}
          {formatTime(props.scene.updatedAt)}
          {props.scene.perceptionRevision !== undefined
            ? ` · r${props.scene.perceptionRevision}`
            : ""}
        </p>
      </div>
      {props.updateAvailable && props.onUpdate ? (
        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 text-[10px] text-amber-300 outline-none hover:text-amber-200 focus-visible:ring-1 focus-visible:ring-white"
          onClick={props.onUpdate}
        >
          <RefreshCw className="size-3" aria-hidden />
          Update available
        </button>
      ) : null}
      {props.thoughtView && props.onReframe ? (
        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 text-[10px] text-zinc-400 outline-none hover:text-white focus-visible:ring-1 focus-visible:ring-white"
          onClick={props.onReframe}
        >
          <GitCompareArrows className="size-3" aria-hidden />
          Reframe
        </button>
      ) : null}
      {props.thoughtView && props.onToggleBasis ? (
        <button
          type="button"
          aria-expanded={props.basisOpen}
          className={`flex shrink-0 items-center gap-1.5 text-[10px] outline-none hover:text-white focus-visible:ring-1 focus-visible:ring-white ${
            props.basisOpen ? "text-white" : "text-zinc-400"
          }`}
          onClick={props.onToggleBasis}
        >
          <Info className="size-3" aria-hidden />
          View basis
        </button>
      ) : null}
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

function viewLabel(representation: CrokiThoughtView["representation"]): string {
  return representation === "possibility"
    ? "Possible worlds"
    : representation.charAt(0).toUpperCase() + representation.slice(1);
}

function formatTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "unknown";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(parsed);
}
