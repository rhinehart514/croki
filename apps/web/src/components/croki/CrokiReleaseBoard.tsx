import type {
  CrokiReleaseCandidate,
  CrokiReleaseItem,
  CrokiReleaseItemStatus,
} from "@croki/shared/crokiReleaseCandidate";
import { Check, CircleDot, TriangleAlert } from "lucide-react";

import { cn } from "~/lib/utils";

const LANES: readonly {
  readonly status: CrokiReleaseItemStatus;
  readonly label: string;
  readonly empty: string;
}[] = [
  { status: "proposed", label: "Proposed", empty: "Nothing awaiting judgment." },
  { status: "working", label: "Working", empty: "No active work." },
  { status: "candidate", label: "Candidate", empty: "No accepted scope." },
  { status: "blocked", label: "Blocked", empty: "No blockers." },
  { status: "verified", label: "Verified", empty: "Nothing proven yet." },
  { status: "deferred", label: "Deferred", empty: "Nothing deferred." },
];

export function CrokiReleaseBoard(props: {
  readonly activeThreadId?: string | null;
  readonly release: CrokiReleaseCandidate;
  readonly selectedItemId: string | null;
  readonly onSelectItem: (itemId: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden" aria-label="Release scope">
      <div className="grid h-full min-w-max grid-flow-col auto-cols-[minmax(230px,1fr)] divide-x divide-white/10">
        {LANES.map((lane) => {
          const items = props.release.items.filter((item) => item.status === lane.status);
          return (
            <section key={lane.status} className="flex min-h-0 flex-col" aria-label={lane.label}>
              <header className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                  {lane.label}
                </span>
                <span className="ml-auto text-[10px] tabular-nums text-zinc-700">
                  {items.length}
                </span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {items.length > 0 ? (
                  items.map((item) => (
                    <ReleaseItem
                      key={item.id}
                      item={item}
                      selected={props.selectedItemId === item.id}
                      active={item.sourceThreads.some(
                        (thread) => thread.id === props.activeThreadId,
                      )}
                      onSelect={() => props.onSelectItem(item.id)}
                    />
                  ))
                ) : (
                  <p className="border-l border-white/10 px-3 py-2 text-[11px] leading-4 text-zinc-700">
                    {lane.empty}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ReleaseItem(props: {
  readonly active: boolean;
  readonly item: CrokiReleaseItem;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const passed = props.item.acceptanceCriteria.filter(
    (criterion) => criterion.status === "passed",
  ).length;
  const failed = props.item.acceptanceCriteria.some((criterion) => criterion.status === "failed");
  return (
    <button
      type="button"
      className={cn(
        "w-full border px-3 py-3 text-left transition-colors",
        props.selected
          ? "border-white/45 bg-white/[0.04]"
          : "border-white/10 hover:border-white/25 hover:bg-white/[0.02]",
      )}
      aria-current={props.selected ? "true" : undefined}
      onClick={props.onSelect}
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-[12px] font-medium leading-4 text-white">
          {props.item.title}
        </span>
        {props.active ? (
          <CircleDot className="mt-0.5 size-3 shrink-0 text-white" aria-label="Current Thread" />
        ) : null}
      </div>
      {props.item.outcome ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-zinc-500">
          {props.item.outcome}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2 text-[10px] text-zinc-600">
        <span>{props.item.kind}</span>
        <span className="ml-auto flex items-center gap-1 tabular-nums">
          {failed ? (
            <TriangleAlert className="size-3 text-amber-400" aria-hidden />
          ) : passed > 0 ? (
            <Check className="size-3 text-zinc-300" aria-hidden />
          ) : null}
          {passed}/{props.item.acceptanceCriteria.length} proof
        </span>
      </div>
    </button>
  );
}
