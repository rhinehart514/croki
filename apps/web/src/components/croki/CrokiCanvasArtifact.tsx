import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CrokiCanvasArtifactField } from "./CrokiCanvasArtifactField";
import {
  CrokiCanvasArtifactInspector,
  CrokiCanvasArtifactSelectionSummary,
} from "./CrokiCanvasArtifactInspector";
import {
  type CrokiCanvasArtifactLike,
  type CrokiCanvasArtifactViewProps,
} from "./crokiCanvasArtifactTypes";
import { sameNodeSelection } from "./crokiCanvasArtifactSelection";

export type {
  CrokiCanvasArtifactLike,
  CrokiCanvasArtifactNodeLike,
  CrokiCanvasArtifactViewProps,
} from "./crokiCanvasArtifactTypes";

/**
 * Thread-scoped read-only Harness Canvas. Product and GTM turns may produce
 * this optional visual artifact; any later turn may inspect and reference it.
 */
export function CrokiCanvasArtifactView(props: CrokiCanvasArtifactViewProps) {
  const artifact = resolveViewedArtifact(props);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(props.selectedNodeIds ?? []);
  const selectedIdsRef = useRef(selectedIds);

  useEffect(() => {
    if (props.selectedNodeIds === undefined) return;
    const next = [...new Set(props.selectedNodeIds)];
    selectedIdsRef.current = next;
    setSelectedIds((current) => (sameNodeSelection(current, next) ? current : next));
  }, [props.selectedNodeIds]);
  useEffect(() => {
    if (props.selectedNodeIds !== undefined || selectedIdsRef.current.length === 0) return;
    selectedIdsRef.current = [];
    setSelectedIds([]);
  }, [artifact?.id, artifact?.revision, props.selectedNodeIds]);

  const selectNodes = useCallback(
    (ids: readonly string[]) => {
      const next = [...new Set(ids)];
      if (sameNodeSelection(selectedIdsRef.current, next)) return;
      selectedIdsRef.current = next;
      setSelectedIds(next);
      props.onSelectArtifactNodes?.(next);
    },
    [props.onSelectArtifactNodes],
  );

  if (!artifact) return <CanvasUnavailable />;
  const selectedNodes = artifact.nodes.filter((node) => selectedIds.includes(node.id));
  const latest = props.latestArtifact ?? latestFromArtifacts(props.artifacts, artifact);
  const revisionAvailable = Boolean(latest && latest.revision > artifact.revision);
  const useSelection = () => {
    props.onUseArtifactSelection?.(selectedNodes);
    props.onUseSelectionInThread?.(selectedNodes.map((node) => node.id));
  };

  return (
    <section
      aria-label="Harness Canvas"
      className="@container relative flex h-full min-h-0 min-w-0 flex-col bg-black text-white"
      data-canvas-harness={artifact.harnessId}
      data-canvas-presentation={artifact.presentation}
      data-canvas-revision={artifact.revision}
    >
      <header className="flex min-h-12 shrink-0 items-center gap-4 border-b border-white/10 px-4 py-2">
        {props.onBackToRelease ? (
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 text-[10px] text-zinc-500 hover:text-white"
            onClick={props.onBackToRelease}
          >
            <ArrowLeft className="size-3" aria-hidden />
            Release
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="truncate text-[12px] font-medium tracking-[0.04em] text-white">
              Canvas
            </h1>
            <span className="shrink-0 text-[10px] text-zinc-500">
              {artifact.harnessId === "gtm-v1" ? "GTM" : "Product"} · revision {artifact.revision}
            </span>
          </div>
          <button
            type="button"
            className="mt-0.5 flex max-w-full items-center gap-1 text-left text-[10px] text-zinc-500 hover:text-zinc-300"
            onClick={() => props.onOpenArtifactThread?.(artifact.threadId)}
            disabled={!props.onOpenArtifactThread}
          >
            <span className="truncate">Updated from this Thread</span>
            {props.onOpenArtifactThread ? (
              <ArrowRight className="size-3 shrink-0" aria-hidden />
            ) : null}
          </button>
        </div>
        {revisionAvailable && latest ? (
          <button
            type="button"
            className="flex shrink-0 items-center gap-2 border-l border-white/15 pl-3 text-[11px] text-zinc-300 hover:text-white"
            onClick={() => (props.onViewArtifactRevision ?? props.onViewRevision)?.(latest)}
            disabled={!props.onViewArtifactRevision && !props.onViewRevision}
          >
            <RefreshCw className="size-3" aria-hidden />
            Revision {latest.revision} available
          </button>
        ) : null}
      </header>

      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.1em] text-zinc-600">
          {presentationLabel(artifact.presentation)}
        </p>
        <p className="mt-1 max-w-[min(60rem,100%)] text-[14px] leading-5 text-zinc-200">
          {artifact.question}
        </p>
      </div>

      {selectedNodes.length > 0 ? (
        <CrokiCanvasArtifactSelectionSummary
          nodes={selectedNodes}
          onClear={() => selectNodes([])}
          onUse={useSelection}
        />
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <CrokiCanvasArtifactField
          artifact={artifact}
          selectedIds={selectedIds}
          onSelect={selectNodes}
        />
        {selectedNodes.length > 0 ? (
          <CrokiCanvasArtifactInspector
            nodes={selectedNodes}
            allNodes={artifact.nodes}
            edges={artifact.edges}
            onClear={() => selectNodes([])}
            {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
            onUse={useSelection}
          />
        ) : null}
      </div>
    </section>
  );
}

/** Alias used by callers that refer to the surface as a Harness Canvas. */
export const HarnessCanvas = CrokiCanvasArtifactView;

function CanvasUnavailable() {
  return (
    <section
      aria-label="Harness Canvas"
      className="flex h-full min-h-0 flex-col bg-black text-white"
    >
      <header className="flex min-h-12 items-center border-b border-white/10 px-4">
        <h1 className="text-[12px] font-medium tracking-[0.04em]">Canvas</h1>
      </header>
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          <p className="text-sm text-zinc-300">No visual is available in this Thread.</p>
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            Product or GTM can create a Canvas when a relationship is easier to judge spatially.
          </p>
        </div>
      </div>
    </section>
  );
}

function latestFromArtifacts(
  artifacts: readonly CrokiCanvasArtifactLike[] | undefined,
  current: CrokiCanvasArtifactLike,
): CrokiCanvasArtifactLike | null {
  return (
    artifacts
      ?.filter((artifact) => artifact.id === current.id || artifact.threadId === current.threadId)
      .sort((left, right) => right.revision - left.revision)[0] ?? null
  );
}

function resolveViewedArtifact(
  props: CrokiCanvasArtifactViewProps,
): CrokiCanvasArtifactLike | null {
  if (!props.artifact) return null;
  if (props.viewedRevision === undefined || props.artifacts === undefined) return props.artifact;
  return (
    props.artifacts.find(
      (artifact) =>
        artifact.threadId === props.artifact?.threadId &&
        artifact.presentation === props.artifact.presentation &&
        artifact.revision === props.viewedRevision,
    ) ?? props.artifact
  );
}

function presentationLabel(presentation: CrokiCanvasArtifactLike["presentation"]): string {
  return presentation === "compare"
    ? "Compare"
    : presentation === "journey"
      ? "Journey"
      : presentation === "system"
        ? "System"
        : "Evidence";
}
