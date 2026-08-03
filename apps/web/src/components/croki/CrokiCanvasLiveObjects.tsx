import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  ArrowUpRight,
  Brain,
  Check,
  CircleDot,
  FileCode2,
  GitBranch,
  Link2,
  Radio,
  ScanSearch,
} from "lucide-react";
import type { ReactNode } from "react";

import type { CrokiCanvasLiveObject } from "./crokiCanvasLiveScene";

export type CrokiCanvasLiveNode = Node<
  {
    readonly object: CrokiCanvasLiveObject;
    readonly selected: boolean;
    readonly connected: boolean;
    readonly onSelect: (id: string) => void;
    readonly onOpen: (object: CrokiCanvasLiveObject) => void;
  },
  "live-object"
>;

export const crokiCanvasLiveObjectTypes = { "live-object": CrokiCanvasLiveObjectNode };

function CrokiCanvasLiveObjectNode({ data, selected }: NodeProps<CrokiCanvasLiveNode>) {
  const { object } = data;
  const isAttention = object.source === "attention";
  const isOutcome = object.source === "outcome";
  const isReference = object.source === "reference";
  const isAgent = object.source === "agent";
  const isJudgment =
    object.kind === "decision" || object.status === "provisional" || object.status === "blocked";
  const isPrior = object.status === "prior" || object.status === "retired";
  const affordance = object.affordances.find(
    (candidate) => candidate.id === "source" || candidate.id === "thread",
  );
  return (
    <article
      className={`relative h-full w-full border bg-black text-left ${
        selected
          ? "border-white"
          : isAttention
            ? "border-zinc-400"
            : isOutcome
              ? "border-emerald-300/70"
              : isJudgment
                ? "border-amber-300/60"
                : isReference
                  ? "border-white/10"
                  : "border-white/15"
      } ${isPrior ? "opacity-55" : "opacity-100"}`}
      data-live-source={object.source}
      data-live-object={object.id}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!pointer-events-none !h-1 !w-1 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!pointer-events-none !h-1 !w-1 !border-0 !bg-transparent"
      />
      {selected ? <RegistrationCorners /> : null}
      <button
        type="button"
        className={`flex h-full w-full cursor-pointer flex-col text-left outline-none focus-visible:ring-1 focus-visible:ring-white ${isOutcome ? "p-5" : isReference ? "p-3" : "p-4"}`}
        aria-label={`Inspect ${object.title}`}
        onClick={() => data.onSelect(object.id)}
      >
        <div className="flex min-w-0 items-start gap-2">
          <ObjectIcon object={object} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">
              <span>{sourceLabel(object.source)}</span>
              <span aria-hidden>·</span>
              <span
                className={
                  isOutcome
                    ? "text-emerald-300"
                    : object.status === "provisional"
                      ? "text-amber-300"
                      : "text-zinc-500"
                }
              >
                {isJudgment ? "Needs judgment" : (object.authority ?? statusLabel(object.status))}
              </span>
            </div>
            <h3
              className={`mt-1.5 line-clamp-2 ${isOutcome ? "text-lg leading-6" : isReference ? "text-xs leading-4" : "text-[14px] leading-[19px]"} ${isAttention ? "font-medium text-white" : "font-semibold text-zinc-100"}`}
            >
              {object.title}
            </h3>
          </div>
        </div>
        {object.body.trim() ? (
          <p
            className={`${isOutcome ? "mt-3 max-w-2xl text-[13px] leading-5 text-zinc-300" : isReference ? "mt-1.5 line-clamp-2 text-[10px] leading-[14px] text-zinc-500" : "mt-2 line-clamp-3 text-[11px] leading-[16px] text-zinc-400"}`}
          >
            {object.body}
          </p>
        ) : null}
        <div
          className={`mt-auto flex items-end justify-between gap-2 text-[9px] text-zinc-600 ${isReference ? "pt-1.5" : "pt-3"}`}
        >
          <span>
            {object.updatedAt
              ? formatObservedTime(object.updatedAt)
              : object.revision
                ? `Revision ${object.revision}`
                : "Live"}
          </span>
          {affordance ? (
            <span className="flex items-center gap-1 text-zinc-300">
              {affordance.label}
              <ArrowUpRight className="size-3" aria-hidden />
            </span>
          ) : null}
        </div>
      </button>
      {isReference || isAgent ? (
        <button
          type="button"
          className="absolute right-2 bottom-2 rounded-none text-zinc-600 outline-none hover:text-white focus-visible:ring-1 focus-visible:ring-white"
          aria-label={`Open ${object.title}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onOpen(object);
          }}
        >
          <ArrowUpRight className="size-3" aria-hidden />
        </button>
      ) : null}
    </article>
  );
}

function ObjectIcon({ object }: { readonly object: CrokiCanvasLiveObject }): ReactNode {
  if (object.source === "attention")
    return <Radio className="mt-0.5 size-4 shrink-0 text-white" aria-hidden />;
  if (object.source === "agent")
    return <Brain className="mt-0.5 size-4 shrink-0 text-sky-300" aria-hidden />;
  if (object.source === "reference")
    return <FileCode2 className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden />;
  if (object.source === "outcome")
    return <Check className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden />;
  if (object.affordances.some((affordance) => affordance.id === "branch"))
    return <GitBranch className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />;
  if (object.kind === "decision")
    return <ScanSearch className="mt-0.5 size-4 shrink-0 text-white" aria-hidden />;
  return <CircleDot className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden />;
}

function ObjectShellMark({ className }: { readonly className: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute size-2 border-white ${className}`} />
  );
}

function RegistrationCorners() {
  return (
    <>
      <ObjectShellMark className="-top-px -left-px border-t border-l" />
      <ObjectShellMark className="-top-px -right-px border-t border-r" />
      <ObjectShellMark className="-bottom-px -left-px border-b border-l" />
      <ObjectShellMark className="-right-px -bottom-px border-r border-b" />
    </>
  );
}

function sourceLabel(source: CrokiCanvasLiveObject["source"]): string {
  if (source === "attention") return "Attention";
  if (source === "context") return "Understanding";
  if (source === "release") return "Target";
  if (source === "visual") return "Projection";
  if (source === "agent") return "Agent";
  if (source === "outcome") return "Outcome";
  return "Evidence";
}

function statusLabel(status: string | undefined): string {
  if (!status) return "Live";
  if (status === "current") return "Current";
  if (status === "provisional") return "Provisional";
  if (status === "retired") return "Prior";
  if (status === "inProgress") return "In progress";
  if (status === "completed") return "Verified";
  return status;
}

function formatObservedTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "Observed";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(parsed);
}
