import type { OrchestrationThreadActivity } from "@croki/contracts";
import { ChevronRightIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  deriveCoordinationWorkstreams,
  type CoordinationWorkstream,
  type CoordinationWorkstreamStatus,
} from "./CoordinationWorkstreams.logic";

export interface CoordinationWorkstreamsProps {
  /** Persisted orchestration activities for the current Thread. */
  readonly activities: ReadonlyArray<OrchestrationThreadActivity>;
  readonly className?: string;
  /** Called when a row is opened, allowing the host to focus the source activity. */
  readonly onWorkstreamSelect?: (workstream: CoordinationWorkstream) => void;
}

const STATUS_LABELS: Record<CoordinationWorkstreamStatus, string> = {
  running: "Active",
  waiting: "Waiting",
  completed: "Complete",
  failed: "Failed",
  stopped: "Stopped",
  unknown: "Unknown",
};

const STATUS_MARKS: Record<CoordinationWorkstreamStatus, string> = {
  running: "●",
  waiting: "○",
  completed: "✓",
  failed: "!",
  stopped: "×",
  unknown: "?",
};

const STATUS_CLASSES: Record<CoordinationWorkstreamStatus, string> = {
  running: "text-white",
  waiting: "text-zinc-400",
  completed: "text-zinc-400",
  failed: "text-amber-400",
  stopped: "text-zinc-500",
  unknown: "text-zinc-500",
};

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildAggregateLabel(workstreams: ReadonlyArray<CoordinationWorkstream>): string {
  const activeCount = workstreams.filter(
    (workstream) => workstream.status === "running" || workstream.status === "waiting",
  ).length;
  const completeCount = workstreams.filter(
    (workstream) => workstream.status === "completed",
  ).length;
  const failedCount = workstreams.filter((workstream) => workstream.status === "failed").length;
  const stoppedCount = workstreams.filter((workstream) => workstream.status === "stopped").length;
  const segments: string[] = [];
  if (activeCount > 0) segments.push(countLabel(activeCount, "active"));
  if (completeCount > 0) segments.push(countLabel(completeCount, "complete"));
  if (failedCount > 0) segments.push(countLabel(failedCount, "failed"));
  if (stoppedCount > 0) segments.push(countLabel(stoppedCount, "stopped"));
  return segments.length > 0 ? segments.join(" · ") : countLabel(workstreams.length, "workstream");
}

function displayActor(workstream: CoordinationWorkstream): string | null {
  if (!workstream.actor) return null;
  return workstream.actor.label ?? workstream.actor.id;
}

function displayActorDetail(workstream: CoordinationWorkstream): string | null {
  if (!workstream.actor) return null;
  const detail = [workstream.actor.model, workstream.actor.reasoning].filter(
    (value): value is string => Boolean(value),
  );
  return detail.length > 0 ? detail.join(" · ") : null;
}

function CoordinationWorkstreamStatusMark({
  status,
}: {
  readonly status: CoordinationWorkstreamStatus;
}) {
  return (
    <span
      aria-label={STATUS_LABELS[status]}
      className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center text-[11px] leading-none ${STATUS_CLASSES[status]}`}
      role="img"
    >
      {STATUS_MARKS[status]}
    </span>
  );
}

function WorkstreamDetail({ workstream }: { readonly workstream: CoordinationWorkstream }) {
  const actor = displayActor(workstream);
  const actorDetail = displayActorDetail(workstream);
  const hasOwnership =
    workstream.ownership.files.length > 0 || workstream.ownership.areas.length > 0;
  const hasEvidence = workstream.evidence.length > 0;

  return (
    <div className="border-t border-white/10 px-9 pb-3 pt-2 text-[11px] leading-4 text-zinc-400">
      {workstream.summary ? <p className="max-w-2xl text-zinc-300">{workstream.summary}</p> : null}

      {actor ? (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5">
          <span className="text-zinc-200">{actor}</span>
          {actorDetail ? <span className="text-zinc-500">{actorDetail}</span> : null}
        </div>
      ) : null}

      {workstream.lastToolName ? (
        <p className="mt-1">
          <span className="text-zinc-500">Last action </span>
          <span className="font-mono text-zinc-300">{workstream.lastToolName}</span>
        </p>
      ) : null}

      {hasOwnership ? (
        <div className="mt-2 space-y-1">
          {workstream.ownership.areas.length > 0 ? (
            <p>
              <span className="text-zinc-500">Area </span>
              <span className="text-zinc-300">{workstream.ownership.areas.join(" · ")}</span>
            </p>
          ) : null}
          {workstream.ownership.files.length > 0 ? (
            <p>
              <span className="text-zinc-500">Files </span>
              <span className="break-words font-mono text-zinc-300">
                {workstream.ownership.files.join(" · ")}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {hasEvidence ? (
        <div className="mt-2 space-y-1">
          <p className="text-zinc-500">Evidence</p>
          <ul className="space-y-0.5">
            {workstream.evidence.map((evidence) => (
              <li key={`${evidence.kind}:${evidence.label}:${evidence.referenceId ?? ""}`}>
                <span
                  className={
                    evidence.status === "failed"
                      ? "mr-1 text-amber-400"
                      : evidence.status === "passed"
                        ? "mr-1 text-zinc-200"
                        : "mr-1 text-zinc-500"
                  }
                >
                  {evidence.status === "passed" ? "✓" : evidence.status === "failed" ? "!" : "·"}
                </span>
                <span className="text-zinc-300">{evidence.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {workstream.failure ? (
        <p className="mt-2 border-l border-amber-400/70 pl-2 text-amber-300">
          {workstream.failure}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Compact projection of native delegated work for a Thread.
 *
 * This component intentionally renders nothing until task lifecycle activity
 * exists. Ordinary provider turns therefore retain the normal Thread surface.
 */
export function CoordinationWorkstreams({
  activities,
  className,
  onWorkstreamSelect,
}: CoordinationWorkstreamsProps) {
  const workstreams = useMemo(() => deriveCoordinationWorkstreams(activities), [activities]);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

  const toggleWorkstream = useCallback(
    (workstream: CoordinationWorkstream) => {
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(workstream.id)) {
          next.delete(workstream.id);
        } else {
          next.add(workstream.id);
        }
        return next;
      });
      onWorkstreamSelect?.(workstream);
    },
    [onWorkstreamSelect],
  );

  if (workstreams.length === 0) return null;

  return (
    <section
      aria-label="Workstreams"
      className={`my-2 border-y border-white/10 bg-black text-white ${className ?? ""}`}
      data-coordination-workstreams="true"
    >
      <div className="flex items-baseline justify-between gap-3 px-3 py-2">
        <h2 className="text-xs font-medium tracking-wide text-white">Workstreams</h2>
        <p className="text-[11px] text-zinc-500">{buildAggregateLabel(workstreams)}</p>
      </div>

      <ul className="m-0 list-none p-0">
        {workstreams.map((workstream) => {
          const expanded = expandedIds.has(workstream.id);
          return (
            <li
              className="border-t border-white/10 last:border-b-0"
              data-coordination-workstream-id={workstream.id}
              data-coordination-workstream-status={workstream.status}
              key={workstream.id}
            >
              <button
                aria-expanded={expanded}
                className="flex w-full items-start gap-2 px-3 py-2 text-left outline-none hover:bg-white/[0.035] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/60"
                type="button"
                onClick={() => toggleWorkstream(workstream)}
              >
                <CoordinationWorkstreamStatusMark status={workstream.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-zinc-100" title={workstream.title}>
                    {workstream.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                    {workstream.summary ??
                      workstream.lastToolName ??
                      STATUS_LABELS[workstream.status]}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-zinc-500">
                  {STATUS_LABELS[workstream.status]}
                </span>
                <ChevronRightIcon
                  aria-hidden="true"
                  className={`mt-0.5 size-3.5 shrink-0 text-zinc-500 ${expanded ? "rotate-90" : ""}`}
                />
              </button>
              {expanded ? <WorkstreamDetail workstream={workstream} /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
