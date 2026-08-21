import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckIcon, Columns2Icon, GripVerticalIcon, HelpCircleIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import {
  conceptIssueCount,
  conceptLabel,
  type ConceptDisposition,
  type ConceptScreenEntry,
} from "./conceptSetLogic";

export function ConceptSortableOption(props: {
  readonly screen: ConceptScreenEntry;
  readonly rank: number;
  readonly selected: boolean;
  readonly compared: boolean;
  readonly compareDisabled: boolean;
  readonly reducedMotion: boolean;
  readonly disposition: ConceptDisposition | undefined;
  readonly onSelect: () => void;
  readonly onCompare: () => void;
  readonly onDisposition: (disposition: ConceptDisposition) => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: props.screen.id,
    transition: {
      duration: props.reducedMotion ? 0 : 180,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    },
  });
  const scaledTransform = transform
    ? {
        ...transform,
        scaleX: isDragging ? 1.012 : transform.scaleX,
        scaleY: isDragging ? 1.012 : transform.scaleY,
      }
    : null;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(scaledTransform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        boxShadow: isDragging
          ? "0 18px 42px -18px rgb(0 0 0 / 72%), 0 0 0 1px color-mix(in oklab, var(--foreground) 12%, transparent)"
          : undefined,
      }}
      data-concept-option={props.screen.id}
      data-concept-disposition={props.disposition ?? "unreviewed"}
      data-concept-dragging={isDragging ? "true" : undefined}
      className={cn(
        "relative rounded-xl border px-2.5 py-2 motion-safe:transition-[background-color,border-color,box-shadow,opacity] motion-safe:duration-150",
        props.selected
          ? "border-foreground/15 bg-foreground/[0.045] shadow-[inset_1px_0_0_color-mix(in_oklab,var(--foreground)_55%,transparent)]"
          : "border-border/55 bg-background/25 hover:border-foreground/10 hover:bg-foreground/[0.025]",
        props.disposition === "reject" && !isDragging && "opacity-55",
        isDragging && "cursor-grabbing border-foreground/20 bg-popover opacity-100",
      )}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="grid size-8 shrink-0 touch-none place-items-center rounded-lg text-muted-foreground/70 outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:cursor-grabbing focus-visible:bg-foreground/[0.06] focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-foreground/35 [&>svg]:size-3.5"
          aria-label={`Drag ${conceptLabel(props.screen)} to reorder`}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon aria-hidden />
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-1 focus-visible:ring-foreground/35"
          aria-label={`Select ${conceptLabel(props.screen)}`}
          aria-pressed={props.selected}
          onClick={props.onSelect}
        >
          <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-foreground/[0.06] font-mono text-[10px] tabular-nums text-muted-foreground">
            {props.rank}
          </span>
          <span className="align-middle text-xs font-medium text-foreground">
            {conceptLabel(props.screen)}
          </span>
          <span className="mt-0.5 block truncate pl-6 text-[10px] text-muted-foreground">
            {props.screen.concept.summary}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={props.compared}
          disabled={props.compareDisabled}
          aria-label={`${props.compared ? "Remove" : "Compare"} ${conceptLabel(props.screen)}`}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg border border-transparent text-muted-foreground motion-safe:transition-[background-color,border-color,color,transform] motion-safe:duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-95 disabled:opacity-30 [&>svg]:size-3.5",
            props.compared && "border-foreground/15 bg-foreground/[0.07] text-foreground shadow-sm",
          )}
          onClick={props.onCompare}
        >
          <Columns2Icon aria-hidden />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        <DispositionButton
          label="Keep"
          icon={<CheckIcon aria-hidden />}
          active={props.disposition === "keep"}
          onClick={() => props.onDisposition("keep")}
        />
        <DispositionButton
          label="Question"
          icon={<HelpCircleIcon aria-hidden />}
          active={props.disposition === "question"}
          onClick={() => props.onDisposition("question")}
        />
        <DispositionButton
          label="Reject"
          icon={<XIcon aria-hidden />}
          active={props.disposition === "reject"}
          onClick={() => props.onDisposition("reject")}
        />
        {conceptIssueCount(props.screen) > 0 ? (
          <span className="col-span-3 justify-self-end text-[10px] text-destructive">
            {conceptIssueCount(props.screen)} issue
            {conceptIssueCount(props.screen) === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function DispositionButton(props: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.active}
      className={cn(
        "inline-flex h-8 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-transparent px-1.5 text-[10px] text-muted-foreground motion-safe:transition-[background-color,border-color,color,transform] motion-safe:duration-150 hover:bg-foreground/[0.055] hover:text-foreground active:scale-[0.97] [&>svg]:size-3",
        props.active &&
          props.label === "Keep" &&
          "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        props.active &&
          props.label === "Question" &&
          "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        props.active &&
          props.label === "Reject" &&
          "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400",
      )}
      onClick={props.onClick}
    >
      {props.icon}
      {props.label}
    </button>
  );
}
