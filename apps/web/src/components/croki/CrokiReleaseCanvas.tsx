import type { CrokiReleaseSourceThread } from "@croki/shared/crokiReleaseCandidate";
import { Pencil, Plus, Redo2, Save, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "../ui/button";
import { CROKI_CANVAS_MODEL_ERROR_MESSAGE } from "./crokiCanvasModelErrors";
import type { CrokiReleaseCanvasProps } from "./crokiCanvasProps";
import {
  cancelCrokiCanvasRepair,
  confirmCrokiCanvasRepair,
  reloadConflictingCrokiCanvasFile,
  requestCrokiCanvasRepair,
} from "./crokiCanvasDraftStore";
import { CrokiCanvasSourceNotice } from "./CrokiCanvasSourceNotice";
import { CrokiReleaseBoard } from "./CrokiReleaseBoard";
import { CrokiReleaseDetailsForm, type CrokiReleaseDetailsInput } from "./CrokiReleaseDetailsForm";
import { CrokiReleaseInspector } from "./CrokiReleaseInspector";
import {
  addCrokiReleaseCriterion,
  addCrokiReleaseCriterionReference,
  addCrokiReleaseItem,
  createCrokiReleaseCandidate,
  deleteCrokiReleaseCriterion,
  deleteCrokiReleaseItem,
  linkCrokiReleaseSourceThread,
  nextCrokiReleaseCriterionId,
  nextCrokiReleaseItemId,
  removeCrokiReleaseCriterionReference,
  unlinkCrokiReleaseSourceThread,
  updateCrokiReleaseCandidate,
  updateCrokiReleaseCriterion,
  updateCrokiReleaseItem,
} from "./crokiReleaseModel";
import { useCrokiCanvasController } from "./useCrokiCanvasController";

export function CrokiReleaseCanvas(props: CrokiReleaseCanvasProps) {
  const controller = useCrokiCanvasController(props);
  const { applyTransition, state, validationErrors, workspaceKey } = controller;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingRelease, setEditingRelease] = useState(false);
  const release = state.context.release;
  const selectedItem = release?.items.find((item) => item.id === selectedItemId) ?? null;
  const currentThreadItem = props.activeThread
    ? release?.items.find((item) =>
        item.sourceThreads.some((thread) => thread.id === props.activeThread?.id),
      )
    : null;
  const saveBlocked =
    state.isSaving ||
    validationErrors.length > 0 ||
    ((state.sourceState === "malformed" || state.sourceState === "partial") &&
      !state.repairInProgress);

  useEffect(() => {
    if (selectedItemId && !selectedItem) setSelectedItemId(null);
  }, [selectedItem, selectedItemId]);

  const applyReleaseDetails = (input: CrokiReleaseDetailsInput) => {
    const transition = release
      ? updateCrokiReleaseCandidate(state.context, input, now())
      : createCrokiReleaseCandidate(state.context, input, now());
    applyTransition(transition);
    if (!transition.error) setEditingRelease(false);
  };
  const addItem = (sourceThread?: CrokiReleaseSourceThread) => {
    if (!release) return;
    const title = sourceThread?.title || "New release item";
    const id = nextCrokiReleaseItemId(release, title);
    const transition = addCrokiReleaseItem(
      state.context,
      { id, title, ...(sourceThread ? { sourceThread } : {}) },
      now(),
    );
    applyTransition(transition);
    if (!transition.error) setSelectedItemId(id);
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-black text-white"
      aria-label="Release Canvas"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[12px] font-medium tracking-[0.04em] text-white">Canvas</h1>
            {release ? (
              <span className="text-[10px] text-zinc-500">
                Next release {release.version} · from {release.baseline}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
            {release?.goal ?? "See what is being built toward the next release."}
          </p>
        </div>
        {props.onOpenContext ? (
          <Button size="sm" variant="ghost" onClick={props.onOpenContext}>
            Context
          </Button>
        ) : null}
        {release ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditingRelease(true)}>
              <Pencil className="size-3.5" aria-hidden />
              Release
            </Button>
            {props.activeThread ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  currentThreadItem
                    ? setSelectedItemId(currentThreadItem.id)
                    : addItem(props.activeThread ?? undefined)
                }
              >
                <Plus className="size-3.5" aria-hidden />
                {currentThreadItem ? "Current work" : "Current Thread"}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => addItem()}>
              <Plus className="size-3.5" aria-hidden />
              Item
            </Button>
          </>
        ) : null}
        {controller.canUndo ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Undo Canvas change"
            onClick={controller.undo}
          >
            <Undo2 className="size-3.5" aria-hidden />
          </Button>
        ) : null}
        {controller.canRedo ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Redo Canvas change"
            onClick={controller.redo}
          >
            <Redo2 className="size-3.5" aria-hidden />
          </Button>
        ) : null}
        {state.dirty ? (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={controller.discard}
              disabled={state.isSaving}
            >
              Discard
            </Button>
            <Button size="sm" onClick={controller.save} disabled={saveBlocked}>
              <Save className="size-3.5" aria-hidden />
              {state.isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : null}
      </header>

      <CrokiCanvasSourceNotice
        state={state}
        onCancelRepair={() => cancelCrokiCanvasRepair(workspaceKey)}
        onConfirmRepair={() => confirmCrokiCanvasRepair(workspaceKey, props.productName)}
        onReloadConflict={() => reloadConflictingCrokiCanvasFile(workspaceKey, props.productName)}
        onRequestRepair={() => requestCrokiCanvasRepair(workspaceKey)}
        onRetry={controller.retry}
      />
      {state.modelError ? (
        <p
          role="status"
          className="shrink-0 border-b border-destructive/30 px-4 py-2 text-xs text-destructive"
        >
          {CROKI_CANVAS_MODEL_ERROR_MESSAGE[state.modelError] ?? "Canvas change was refused."}
        </p>
      ) : null}

      {!release || editingRelease ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-8">
          <CrokiReleaseDetailsForm
            key={release ? `${release.version}:${release.baseline}:${release.status}` : "new"}
            {...(release ? { release } : {})}
            {...(release ? { onCancel: () => setEditingRelease(false) } : {})}
            onSubmit={applyReleaseDetails}
          />
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1">
          <CrokiReleaseBoard
            release={release}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            {...(props.activeThread !== undefined
              ? { activeThreadId: props.activeThread?.id ?? null }
              : {})}
          />
          {selectedItem ? (
            <CrokiReleaseInspector
              item={selectedItem}
              {...(props.activeThread !== undefined ? { currentThread: props.activeThread } : {})}
              onBack={() => setSelectedItemId(null)}
              onDelete={() => {
                applyTransition(deleteCrokiReleaseItem(state.context, selectedItem.id, now()));
                setSelectedItemId(null);
              }}
              onUpdate={(patch) =>
                applyTransition(
                  updateCrokiReleaseItem(state.context, selectedItem.id, patch, now()),
                )
              }
              onLinkCurrentThread={() => {
                if (props.activeThread) {
                  applyTransition(
                    linkCrokiReleaseSourceThread(
                      state.context,
                      selectedItem.id,
                      props.activeThread,
                      now(),
                    ),
                  );
                }
              }}
              onUnlinkThread={(threadId) =>
                applyTransition(
                  unlinkCrokiReleaseSourceThread(state.context, selectedItem.id, threadId, now()),
                )
              }
              onAddCriterion={() => {
                const id = nextCrokiReleaseCriterionId(selectedItem);
                applyTransition(
                  addCrokiReleaseCriterion(
                    state.context,
                    selectedItem.id,
                    { id, text: "Describe observable proof" },
                    now(),
                  ),
                );
              }}
              onUpdateCriterion={(criterionId, patch) =>
                applyTransition(
                  updateCrokiReleaseCriterion(
                    state.context,
                    selectedItem.id,
                    criterionId,
                    patch,
                    now(),
                  ),
                )
              }
              onDeleteCriterion={(criterionId) =>
                applyTransition(
                  deleteCrokiReleaseCriterion(state.context, selectedItem.id, criterionId, now()),
                )
              }
              onAddCriterionReference={(criterionId, reference) => {
                const transition = addCrokiReleaseCriterionReference(
                  state.context,
                  selectedItem.id,
                  criterionId,
                  reference,
                  now(),
                );
                applyTransition(transition);
                return transition.error;
              }}
              onRemoveCriterionReference={(criterionId, reference) =>
                applyTransition(
                  removeCrokiReleaseCriterionReference(
                    state.context,
                    selectedItem.id,
                    criterionId,
                    reference,
                    now(),
                  ),
                )
              }
              {...(props.onOpenThread ? { onOpenThread: props.onOpenThread } : {})}
              {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function now(): string {
  return new Date().toISOString();
}
