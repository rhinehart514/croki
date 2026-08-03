import { ExternalLink, ScanSearch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ScrollArea } from "../ui/scroll-area";
import type { CrokiCanvasProps } from "./crokiCanvasProps";
import { CROKI_CANVAS_MODEL_ERROR_MESSAGE } from "./crokiCanvasModelErrors";
import { CrokiCanvasLiveField } from "./CrokiCanvasLiveField";
import type { CrokiCanvasLiveObject } from "./crokiCanvasLiveScene";
import { projectCrokiCanvasLiveScene } from "./crokiCanvasLiveScene";
import { CrokiTrueCanvasHeader } from "./CrokiTrueCanvasHeader";
import { CrokiTrueCanvasInspector } from "./CrokiTrueCanvasInspector";
import { selectCrokiCanvasNode } from "./crokiCanvasDraftStore";
import { canvasThreadFocusIds } from "./crokiCanvasThreadFocus";
import { useCrokiCanvasController } from "./useCrokiCanvasController";

/**
 * The single Canvas surface. It is a read-only projection of live perception;
 * all durable changes still happen in their source system.
 */
export function CrokiTrueCanvas(props: CrokiCanvasProps) {
  const hasNativePerception = props.perceptionFrame !== undefined;
  const controller = useCrokiCanvasController({
    ...props,
    enabled: !hasNativePerception,
  });
  const { state, workspaceKey } = controller;
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [scrubRevision, setScrubRevision] = useState<number | null>(null);

  const selectedArtifact = useMemo(
    () => artifactAtRevision(props, scrubRevision),
    [props.artifact, props.artifacts, props.latestArtifact, scrubRevision],
  );
  const scene = useMemo(
    () =>
      projectCrokiCanvasLiveScene({
        context: state.context,
        ...(props.perceptionFrame !== undefined ? { perceptionFrame: props.perceptionFrame } : {}),
        ...(selectedArtifact ? { artifact: selectedArtifact } : {}),
        ...(props.latestArtifact ? { latestArtifact: props.latestArtifact } : {}),
        ...(props.artifacts ? { artifacts: props.artifacts } : {}),
        activePlan: props.activePlan ?? null,
        ...(props.activeThread !== undefined ? { activeThread: props.activeThread } : {}),
        ...(props.externalQuestion !== undefined
          ? { externalQuestion: props.externalQuestion }
          : {}),
      }),
    [
      props.activePlan,
      props.activeThread,
      props.artifacts,
      props.externalQuestion,
      props.perceptionFrame,
      props.latestArtifact,
      selectedArtifact,
      state.context,
    ],
  );
  const selectedObjects = useMemo(
    () => scene.objects.filter((object) => selectedIds.includes(object.id)),
    [scene.objects, selectedIds],
  );
  const revisionObjects = scene.revisionObjects;
  const currentRevision = selectedArtifact?.revision ?? props.latestArtifact?.revision ?? null;

  useEffect(() => {
    if (!props.externalRevision && !props.externalNodeIds?.length) return;
    const externalIds = new Set(props.externalNodeIds ?? []);
    const matches = scene.objects
      .filter((object) => externalIds.has(object.selectionId ?? "") || externalIds.has(object.id))
      .map((object) => object.id);
    if (matches.length > 0) setSelectedIds(matches);
  }, [props.externalNodeIds, props.externalRevision, scene.objects]);

  useEffect(() => {
    if (props.selectedNodeIds === undefined) return;
    const selected = new Set(props.selectedNodeIds);
    const matches = scene.objects
      .filter((object) => selected.has(object.selectionId ?? ""))
      .map((object) => object.id);
    if (matches.length > 0) setSelectedIds(matches);
  }, [props.selectedNodeIds, scene.objects]);

  const selectObject = (object: CrokiCanvasLiveObject) => {
    setSelectedIds([object.id]);
    if (object.perceptionObjects?.length) {
      props.onSelectArtifactNodes?.(object.perceptionObjects.map((item) => item.id));
      return;
    }
    if (object.perceptionObject && object.selectionId) {
      // Selection is ephemeral attention. The Thread receives only this stable
      // sensed id and can inspect the source through Croki Senses.
      props.onSelectArtifactNodes?.([object.selectionId]);
      return;
    }
    if (object.source === "context" && object.selectionId) {
      selectCrokiCanvasNode(workspaceKey, object.selectionId);
    }
    if (object.source === "visual" && object.selectionId && object.artifact) {
      props.onSelectArtifactNodes?.([object.selectionId]);
    }
  };
  const clearSelection = () => {
    setSelectedIds([]);
    selectCrokiCanvasNode(workspaceKey, null);
    props.onSelectArtifactNodes?.([]);
  };
  const openObject = (object: CrokiCanvasLiveObject) => {
    if (object.reference) {
      props.onOpenReference?.(object.reference);
      return;
    }
    if (object.sourceThreadId) {
      if (props.onOpenThread) props.onOpenThread(object.sourceThreadId);
      else props.onOpenArtifactThread?.(object.sourceThreadId);
      return;
    }
    if (object.perceptionSourceUri && props.onOpenReference) {
      const uri = object.perceptionSourceUri;
      props.onOpenReference(
        uri.startsWith("http://") || uri.startsWith("https://")
          ? { kind: "url", url: uri }
          : { kind: "file", path: uri.replace(/^file:\/\//, "") },
      );
      return;
    }
    if (object.artifact) {
      if (
        !object.selectionId &&
        !object.id.startsWith("visual:revision:") &&
        object.artifact.threadId
      ) {
        if (props.onOpenArtifactThread) props.onOpenArtifactThread(object.artifact.threadId);
        else props.onOpenThread?.(object.artifact.threadId);
        return;
      }
      props.onViewArtifactRevision?.(object.artifact);
      props.onViewRevision?.(object.artifact);
    }
  };
  const addressObjects = (objects: readonly CrokiCanvasLiveObject[]) => {
    const nodes = objects.flatMap((object) => {
      if (!object.artifact || !object.selectionId) return [];
      return object.artifact.nodes.filter((node) => node.id === object.selectionId);
    });
    if (nodes.length > 0) props.onUseArtifactSelection?.(nodes);
    const ids = canvasThreadFocusIds(objects);
    if (ids.length > 0) props.onUseSelectionInThread?.(ids);
  };
  const useSelection = () => {
    addressObjects(selectedObjects);
  };
  const addressObject = (object: CrokiCanvasLiveObject) => {
    addressObjects([object]);
  };
  const approveSelection = () => {
    const ids = selectedObjects.map((object) => object.selectionId ?? object.id);
    if (ids.length > 0) props.onApproveCanvasObjects?.(ids);
  };

  const sourceStateMessage = hasNativePerception
    ? null
    : sourceProjectionMessage(state.sourceState, state.sourceMessage);
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-black text-white"
      aria-label="Croki Live Canvas"
      data-canvas-surface="true"
      {...(scene.perceptionRevision !== undefined
        ? { "data-canvas-perception-revision": scene.perceptionRevision }
        : {})}
    >
      <CrokiTrueCanvasHeader
        scene={scene}
        revisionObjects={revisionObjects}
        currentRevision={currentRevision}
        onScrubRevision={(revision, artifact) => {
          setScrubRevision(revision);
          if (artifact) props.onViewArtifactRevision?.(artifact);
        }}
      />

      {sourceStateMessage ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2 text-[11px] text-zinc-500">
          <p className="min-w-0 flex-1 truncate">Source observation: {sourceStateMessage}</p>
          {state.sourceState === "read-error" ? (
            <button
              type="button"
              className="text-zinc-300 hover:text-white"
              onClick={controller.retry}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {!hasNativePerception && state.modelError ? (
        <p
          role="status"
          className="border-b border-destructive/30 px-4 py-2 text-xs text-destructive"
        >
          {CROKI_CANVAS_MODEL_ERROR_MESSAGE[state.modelError] ?? "Canvas observation was refused."}
        </p>
      ) : null}

      {selectedObjects.length > 0 ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2 text-[11px]">
          <ScanSearch className="size-3 text-zinc-500" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-zinc-300">
            {selectedObjects.map((object) => object.title).join(" · ")}
          </span>
          <button type="button" className="text-zinc-500 hover:text-white" onClick={clearSelection}>
            Clear
          </button>
          {selectedObjects.some(
            (object) =>
              object.reference ||
              object.sourceThreadId ||
              object.perceptionSourceUri ||
              object.artifact,
          ) ? (
            <button
              type="button"
              className="flex items-center gap-1 text-zinc-300 hover:text-white"
              onClick={() => openObject(selectedObjects[0]!)}
            >
              Open source <ExternalLink className="size-3" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        <CrokiCanvasLiveField
          scene={scene}
          focusMode="all"
          selectedIds={selectedIds}
          onClearSelection={clearSelection}
          onAddress={addressObject}
          onOpen={openObject}
          onSelect={selectObject}
        />
        {selectedObjects.length > 0 ? (
          <aside className="absolute inset-y-0 right-0 z-20 w-[min(360px,85%)] border-l border-white/15 bg-black shadow-[-16px_0_32px_rgba(0,0,0,0.72)]">
            <ScrollArea className="h-full">
              <div className="space-y-5 p-5 pb-12">
                <CrokiTrueCanvasInspector
                  objects={selectedObjects}
                  onOpen={openObject}
                  onUse={useSelection}
                  {...(props.onApproveCanvasObjects ? { onApprove: approveSelection } : {})}
                  {...(props.onChooseCanvasBranch
                    ? { onChooseBranch: props.onChooseCanvasBranch }
                    : {})}
                />
              </div>
            </ScrollArea>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function artifactAtRevision(props: CrokiCanvasProps, scrubRevision: number | null) {
  if (scrubRevision === null)
    return (
      props.artifact ??
      props.latestArtifact ??
      props.artifacts?.slice().sort((left, right) => right.revision - left.revision)[0] ??
      null
    );
  return (
    props.artifacts?.find((artifact) => artifact.revision === scrubRevision) ??
    props.artifact ??
    props.latestArtifact ??
    null
  );
}

function sourceProjectionMessage(sourceState: string, sourceMessage: string | null): string | null {
  if (sourceState === "valid") return null;
  if (sourceState === "missing")
    return "No project understanding source yet. Waiting for observation.";
  return sourceMessage;
}
