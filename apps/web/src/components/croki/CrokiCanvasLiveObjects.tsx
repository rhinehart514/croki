import {
  ArrowUpRight,
  Brain,
  Check,
  CircleDot,
  FileCode2,
  GitBranch,
  Radio,
  ScanSearch,
} from "lucide-react";
import type { ReactNode } from "react";

import { canvasThreadFocusIds } from "./crokiCanvasThreadFocus";
import type { CrokiCanvasLiveObject } from "./crokiCanvasLiveScene";

interface CrokiCanvasLiveObjectCardProps {
  readonly object: CrokiCanvasLiveObject;
  readonly selected: boolean;
  readonly prominence: "hero" | "normal" | "compact";
  readonly onAddress?: (object: CrokiCanvasLiveObject) => void;
  readonly onSelect: (object: CrokiCanvasLiveObject) => void;
  readonly onOpen: (object: CrokiCanvasLiveObject) => void;
}

export function CrokiCanvasLiveObjectCard(props: CrokiCanvasLiveObjectCardProps) {
  const { object, prominence } = props;
  const isOutcome = object.source === "outcome";
  const isJudgment =
    object.kind === "decision" || object.status === "provisional" || object.status === "blocked";
  const isPrior = object.status === "prior" || object.status === "retired";
  const canOpen = Boolean(
    object.reference || object.sourceThreadId || object.perceptionSourceUri || object.artifact,
  );
  const canAddress = props.onAddress !== undefined && canvasThreadFocusIds([object]).length > 0;
  return (
    <article
      className={`relative overflow-hidden border text-left transition-colors ${
        props.selected
          ? "border-white bg-white/[0.07]"
          : isJudgment
            ? "border-amber-300/25 bg-amber-300/[0.04] hover:border-amber-300/45"
            : isOutcome
              ? "border-emerald-300/25 bg-emerald-300/[0.035] hover:border-emerald-300/40"
              : "border-white/10 bg-white/[0.025] hover:border-white/20"
      } ${isPrior ? "opacity-60" : "opacity-100"}`}
      data-live-source={object.source}
      data-live-object={object.id}
    >
      <button
        type="button"
        className={`block w-full text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white ${
          prominence === "hero" ? "p-5 sm:p-6" : prominence === "compact" ? "p-3" : "p-4"
        }`}
        aria-label={`Inspect ${object.title}`}
        onClick={() => props.onSelect(object)}
      >
        <div className="flex min-w-0 items-start gap-3">
          <ObjectIcon object={object} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">
              <span>{sourceLabel(object.source)}</span>
              <span aria-hidden>·</span>
              <span className={isJudgment ? "text-amber-300" : isOutcome ? "text-emerald-300" : ""}>
                {isJudgment ? "Needs judgment" : (object.authority ?? statusLabel(object.status))}
              </span>
            </div>
            <h3
              className={`mt-1.5 font-medium text-zinc-100 ${
                prominence === "hero"
                  ? "text-xl leading-7 sm:text-2xl sm:leading-8"
                  : prominence === "compact"
                    ? "text-xs leading-4"
                    : "text-sm leading-5"
              }`}
            >
              {object.title}
            </h3>
            {object.body.trim() ? (
              <p
                className={`mt-2 text-zinc-400 ${
                  prominence === "hero"
                    ? "max-w-3xl text-sm leading-6"
                    : prominence === "compact"
                      ? "line-clamp-2 text-[10px] leading-4"
                      : "line-clamp-3 text-xs leading-5"
                }`}
              >
                {object.body}
              </p>
            ) : null}
          </div>
        </div>
      </button>
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2 text-[9px] text-zinc-600">
        <span>
          {object.updatedAt
            ? formatObservedTime(object.updatedAt)
            : object.revision
              ? `Revision ${object.revision}`
              : "Live"}
        </span>
        <div className="flex items-center gap-3">
          {canAddress ? (
            <button
              type="button"
              className="flex items-center gap-1 text-zinc-300 outline-none hover:text-white focus-visible:ring-1 focus-visible:ring-white"
              onClick={() => props.onAddress?.(object)}
            >
              Address in Thread <ArrowUpRight className="size-3" aria-hidden />
            </button>
          ) : null}
          {canOpen ? (
            <button
              type="button"
              className="flex items-center gap-1 text-zinc-400 outline-none hover:text-white focus-visible:ring-1 focus-visible:ring-white"
              onClick={() => props.onOpen(object)}
            >
              Open source <ArrowUpRight className="size-3" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ObjectIcon({ object }: { readonly object: CrokiCanvasLiveObject }): ReactNode {
  const classes = "mt-0.5 size-4 shrink-0";
  if (object.source === "attention")
    return <Radio className={`${classes} text-white`} aria-hidden />;
  if (object.source === "agent") return <Brain className={`${classes} text-sky-300`} aria-hidden />;
  if (object.source === "reference")
    return <FileCode2 className={`${classes} text-zinc-500`} aria-hidden />;
  if (object.source === "outcome")
    return <Check className={`${classes} text-emerald-300`} aria-hidden />;
  if (object.affordances.some((affordance) => affordance.id === "branch"))
    return <GitBranch className={`${classes} text-amber-300`} aria-hidden />;
  if (object.kind === "decision")
    return <ScanSearch className={`${classes} text-amber-300`} aria-hidden />;
  return <CircleDot className={`${classes} text-zinc-500`} aria-hidden />;
}

function sourceLabel(source: CrokiCanvasLiveObject["source"]): string {
  if (source === "attention") return "In focus";
  if (source === "context") return "Conclusion";
  if (source === "release") return "Target";
  if (source === "visual") return "Observation";
  if (source === "agent") return "Thread";
  if (source === "outcome") return "Outcome";
  return "Source";
}

function statusLabel(status: string | undefined): string {
  if (!status) return "Current";
  if (status === "prior" || status === "retired") return "Previous";
  if (status === "inProgress") return "In progress";
  if (status === "completed") return "Verified";
  return status;
}

function formatObservedTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "Observed";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(parsed);
}
