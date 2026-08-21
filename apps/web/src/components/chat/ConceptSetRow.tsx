import type { EnvironmentId, UiHistoryEntry } from "@croki/contracts";
import { Columns2Icon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";

import {
  conceptImageName,
  conceptLabel,
  moveConceptScreen,
  rankConceptScreens,
  setConceptDisposition,
  toggleConceptComparison,
  type ConceptDisposition,
  type ConceptDispositions,
  type ConceptScreenEntry,
  type ConceptSetAction,
  type RankedConceptChoice,
} from "./conceptSetLogic";
import { ConceptScreenImage, ConceptSetOptionList } from "./ConceptSetOptionList";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";

export {
  MAX_CONCEPT_SET_OPTIONS,
  moveConceptScreen,
  rankConceptScreens,
  setConceptDisposition,
  toggleConceptComparison,
} from "./conceptSetLogic";
export type {
  ConceptDisposition,
  ConceptDispositions,
  ConceptScreenEntry,
  ConceptSetAction,
  RankedConceptChoice,
} from "./conceptSetLogic";

export interface ConceptSetRowProps {
  readonly environmentId: EnvironmentId;
  readonly screens: ReadonlyArray<UiHistoryEntry>;
  readonly onImageExpand?: (preview: ExpandedImagePreview) => void;
  readonly onContinueWithSelected?: ConceptSetAction;
  readonly onRemixKept?: ConceptSetAction;
}

/** A Thread-native decision surface for explicitly labeled concept snapshots. */
export function ConceptSetRow({
  environmentId,
  screens,
  onImageExpand,
  onContinueWithSelected,
  onRemixKept,
}: ConceptSetRowProps) {
  const rankedScreens = useMemo(() => rankConceptScreens(screens), [screens]);
  const [orderedScreens, setOrderedScreens] = useState<ConceptScreenEntry[]>(rankedScreens);
  const [selectedId, setSelectedId] = useState<string | null>(rankedScreens[0]?.id ?? null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [dispositions, setDispositions] = useState<ConceptDispositions>({});
  const rankedListRef = useRef<HTMLOListElement>(null);
  const resolvedUrlsRef = useRef(new Map<string, string>());

  useEffect(() => {
    const ids = new Set(rankedScreens.map((screen) => screen.id));
    setOrderedScreens((current) =>
      current.length === rankedScreens.length && current.every((screen) => ids.has(screen.id))
        ? current
        : rankedScreens,
    );
    setSelectedId((current) =>
      current && ids.has(current) ? current : (rankedScreens[0]?.id ?? null),
    );
    setCompareIds((current) => current.filter((id) => ids.has(id)).slice(0, 2));
    setDispositions((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))),
    );
  }, [rankedScreens]);

  const selectedScreen =
    orderedScreens.find((screen) => screen.id === selectedId) ?? orderedScreens[0];
  const compareScreens = orderedScreens.filter((screen) => compareIds.includes(screen.id));
  const keptScreens = orderedScreens.filter((screen) => dispositions[screen.id] === "keep");

  const registerAssetUrl = useCallback((screenId: string, url: string | null) => {
    if (url === null) resolvedUrlsRef.current.delete(screenId);
    else resolvedUrlsRef.current.set(screenId, url);
  }, []);

  const openScreen = useCallback(
    (screen: ConceptScreenEntry, url: string) => {
      resolvedUrlsRef.current.set(screen.id, url);
      const images = orderedScreens.flatMap((option) => {
        const src = resolvedUrlsRef.current.get(option.id);
        return src ? [{ id: option.id, src, name: conceptImageName(option) }] : [];
      });
      const index = images.findIndex((image) => image.id === screen.id);
      if (index >= 0) {
        onImageExpand?.({ images: images.map(({ src, name }) => ({ src, name })), index });
      }
    },
    [onImageExpand, orderedScreens],
  );

  const chooseDisposition = useCallback((id: string, disposition: ConceptDisposition) => {
    setDispositions((current) => setConceptDisposition(current, id, disposition));
  }, []);
  const resetOrder = useCallback(() => {
    setOrderedScreens(rankedScreens);
    rankedListRef.current?.scrollTo({ top: 0 });
  }, [rankedScreens]);
  const choicesFor = useCallback(
    (selected: ReadonlyArray<ConceptScreenEntry>): RankedConceptChoice[] =>
      selected.map((entry) => ({
        entry,
        rank: orderedScreens.findIndex((screen) => screen.id === entry.id) + 1,
        disposition: dispositions[entry.id] ?? "unreviewed",
      })),
    [dispositions, orderedScreens],
  );

  if (orderedScreens.length < 2) return null;

  return (
    <section
      data-concept-set="true"
      aria-label="Concept options"
      className="mt-2 overflow-hidden rounded-2xl border border-border/70 bg-card/40 shadow-sm shadow-black/5"
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/15 px-3.5 py-2.5">
        <Columns2Icon className="size-3.5 text-muted-foreground" aria-hidden />
        <h3 className="text-xs font-medium text-foreground">Concept options</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {orderedScreens.length} options
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto h-8 rounded-full px-2.5"
          aria-label="Reset option order"
          onClick={resetOrder}
        >
          <RotateCcwIcon aria-hidden />
          Reset order
        </Button>
      </div>

      <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.1fr)_minmax(14rem,0.9fr)]">
        {selectedScreen ? (
          <div data-concept-selected="true" className="min-w-0">
            <ConceptScreenImage
              key={selectedScreen.id}
              environmentId={environmentId}
              screen={selectedScreen}
              className="croki-concept-preview-enter aspect-[16/10] w-full"
              onAssetUrlChange={registerAssetUrl}
              onOpen={openScreen}
            />
            <div className="mt-2 min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {conceptLabel(selectedScreen)}
              </p>
              <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                {selectedScreen.concept.summary}
              </p>
              {selectedScreen.concept.tradeoff?.trim() ? (
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground/80">
                  Tradeoff: {selectedScreen.concept.tradeoff}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <ConceptSetOptionList
          screens={orderedScreens}
          selectedId={selectedScreen?.id}
          compareIds={compareIds}
          dispositions={dispositions}
          listRef={rankedListRef}
          onSelect={setSelectedId}
          onCompare={(id) => setCompareIds((current) => toggleConceptComparison(current, id))}
          onMove={(from, to) =>
            setOrderedScreens((current) => moveConceptScreen(current, from, to))
          }
          onDisposition={chooseDisposition}
        />
      </div>

      {compareScreens.length === 2 ? (
        <div data-concept-compare="true" className="border-t border-border/60 bg-muted/10 p-3">
          <p className="mb-2 text-[11px] font-medium text-foreground">Side-by-side comparison</p>
          <div className="grid grid-cols-2 gap-2">
            {compareScreens.map((screen) => (
              <div
                key={screen.id}
                className="min-w-0 rounded-2xl border border-border/50 bg-background/40 p-2"
              >
                <ConceptScreenImage
                  environmentId={environmentId}
                  screen={screen}
                  className="aspect-[16/10] w-full"
                  onAssetUrlChange={registerAssetUrl}
                  onOpen={openScreen}
                />
                <p className="mt-1 truncate text-[11px] font-medium text-foreground">
                  {conceptLabel(screen)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2">
        <Button
          type="button"
          size="xs"
          className="h-8 rounded-full bg-foreground px-4 text-background hover:bg-foreground/90"
          disabled={!selectedScreen}
          onClick={() => selectedScreen && onContinueWithSelected?.(choicesFor([selectedScreen]))}
        >
          Continue with selected
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-8 rounded-full px-4"
          disabled={keptScreens.length === 0}
          onClick={() => onRemixKept?.(choicesFor(keptScreens))}
        >
          Remix kept{keptScreens.length > 0 ? ` (${keptScreens.length})` : ""}
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {compareIds.length === 0
            ? "No comparison selected"
            : compareIds.length === 1
              ? "Select one more to compare"
              : "Comparing 2 options"}
        </span>
      </div>
    </section>
  );
}
