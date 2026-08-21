import type { EnvironmentId } from "@croki/contracts";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ImageIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, type RefObject } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { cn } from "~/lib/utils";

import {
  conceptLabel,
  type ConceptDisposition,
  type ConceptDispositions,
  type ConceptScreenEntry,
} from "./conceptSetLogic";
import { ConceptSortableOption } from "./ConceptSortableOption";

export function ConceptSetOptionList(props: {
  readonly screens: ReadonlyArray<ConceptScreenEntry>;
  readonly selectedId: string | undefined;
  readonly compareIds: ReadonlyArray<string>;
  readonly dispositions: ConceptDispositions;
  readonly listRef: RefObject<HTMLOListElement | null>;
  readonly onSelect: (id: string) => void;
  readonly onCompare: (id: string) => void;
  readonly onMove: (fromIndex: number, toIndex: number) => void;
  readonly onDisposition: (id: string, disposition: ConceptDisposition) => void;
}) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (event.over === null || event.active.id === event.over.id) return;
      const fromIndex = props.screens.findIndex((screen) => screen.id === event.active.id);
      const toIndex = props.screens.findIndex((screen) => screen.id === event.over?.id);
      if (fromIndex >= 0 && toIndex >= 0) props.onMove(fromIndex, toIndex);
    },
    [props.onMove, props.screens],
  );

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">Ranked options</p>
        <p className="text-[10px] text-muted-foreground/70">Drag to rank · compare two</p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={props.screens.map((screen) => screen.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol
            ref={props.listRef}
            data-concept-ranked-list="true"
            className="max-h-[26rem] space-y-1 overflow-y-auto pr-1"
            aria-label="Ranked concept options"
          >
            {props.screens.map((screen, index) => {
              const compared = props.compareIds.includes(screen.id);
              return (
                <ConceptSortableOption
                  key={screen.id}
                  screen={screen}
                  rank={index + 1}
                  selected={props.selectedId === screen.id}
                  compared={compared}
                  compareDisabled={!compared && props.compareIds.length >= 2}
                  reducedMotion={prefersReducedMotion}
                  disposition={props.dispositions[screen.id]}
                  onSelect={() => props.onSelect(screen.id)}
                  onCompare={() => props.onCompare(screen.id)}
                  onDisposition={(disposition) => props.onDisposition(screen.id, disposition)}
                />
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function ConceptScreenImage(props: {
  readonly environmentId: EnvironmentId;
  readonly screen: ConceptScreenEntry;
  readonly className: string;
  readonly onAssetUrlChange: (screenId: string, url: string | null) => void;
  readonly onOpen: (screen: ConceptScreenEntry, url: string) => void;
}) {
  const asset = useAssetUrlState(props.environmentId, {
    _tag: "attachment",
    attachmentId: props.screen.attachmentId,
  });
  const assetUrl = asset._tag === "Success" ? asset.url : null;
  useEffect(() => {
    props.onAssetUrlChange(props.screen.id, assetUrl);
    return () => props.onAssetUrlChange(props.screen.id, null);
  }, [assetUrl, props.onAssetUrlChange, props.screen.id]);

  if (asset._tag !== "Success") {
    return (
      <div
        data-concept-image-state={asset._tag === "Loading" ? "loading" : "failure"}
        className={cn(
          "flex items-center justify-center rounded-xl border border-border/70 bg-black/50",
          props.className,
        )}
        role={asset._tag === "Loading" ? "status" : undefined}
        aria-label={
          asset._tag === "Loading"
            ? "Loading concept screen image"
            : "Concept screen image unavailable"
        }
      >
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ImageIcon className="size-3.5" aria-hidden />
          {asset._tag === "Loading" ? "Loading image…" : "Image unavailable"}
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cn(
        "block cursor-zoom-in overflow-hidden rounded-xl border border-border/70 bg-black/60 shadow-sm motion-safe:transition-[border-color,box-shadow,transform] motion-safe:duration-200 hover:border-foreground/20 hover:shadow-md active:scale-[0.995] focus-visible:ring-1 focus-visible:ring-foreground/35",
        props.className,
      )}
      aria-label={`Open ${conceptLabel(props.screen)} concept screen in gallery`}
      onClick={() => props.onOpen(props.screen, asset.url)}
    >
      <img
        src={asset.url}
        alt={`${conceptLabel(props.screen)} concept screen`}
        className="size-full object-cover object-top"
        draggable={false}
        referrerPolicy="no-referrer"
      />
    </button>
  );
}
