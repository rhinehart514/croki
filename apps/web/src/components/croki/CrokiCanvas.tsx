import type { EnvironmentId } from "@t3tools/contracts";
import type { CrokiContextReference } from "@t3tools/shared/crokiContext";
import { Redo2, Save, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { ActivePlanState } from "~/session-logic";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { CrokiCanvasNodeEditor } from "./CrokiCanvasNodeEditor";
import { CrokiCanvasWorkspace } from "./CrokiCanvasWorkspace";
import {
  CROKI_CANVAS_VIEWS,
  crokiSemanticRelation,
  type CrokiCanvasView,
} from "./crokiCanvasLanguage";
import { CrokiCanvasSourceNotice } from "./CrokiCanvasSourceNotice";
import {
  cancelCrokiCanvasRepair,
  confirmCrokiCanvasRepair,
  reloadConflictingCrokiCanvasFile,
  requestCrokiCanvasRepair,
  selectCrokiCanvasNode,
} from "./crokiCanvasDraftStore";
import {
  addCrokiEdge,
  addCrokiNodeReference,
  adoptCrokiNode,
  deleteCrokiEdge,
  deleteCrokiNode,
  removeCrokiNodeReference,
  retireCrokiNode,
} from "./crokiCanvasModel";
import { useCrokiCanvasController } from "./useCrokiCanvasController";

interface CrokiCanvasProps {
  readonly environmentId: EnvironmentId;
  readonly externalNodeIds?: readonly string[];
  readonly externalQuestion?: string | null;
  readonly externalRevision?: string | null;
  readonly externalView?: CrokiCanvasView | null;
  readonly activePlan?: ActivePlanState | null;
  readonly onBuildFromRepository?: () => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onPendingChange?: (pending: boolean) => void;
  readonly onPrepareGtm?: () => void;
  readonly onOpenPlan?: () => void;
  readonly productName: string;
  readonly workspaceRoot: string;
}

export function CrokiCanvas(props: CrokiCanvasProps) {
  const {
    applyTransition,
    canRedo,
    canUndo,
    discard,
    redo,
    retry,
    save,
    selectedNode,
    state,
    undo,
    updateNode,
    validationErrors,
    workspaceKey,
  } = useCrokiCanvasController(props);
  const [view, setView] = useState<CrokiCanvasView>("product");
  const [sceneFocused, setSceneFocused] = useState(false);
  const proposalCount = state.context.nodes.filter((node) => node.status === "provisional").length;

  useEffect(() => {
    if (!props.externalRevision) return;
    if (props.externalView) setView(props.externalView);
    setSceneFocused((props.externalNodeIds?.length ?? 0) > 0);
  }, [props.externalNodeIds?.length, props.externalRevision, props.externalView]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-black text-white" aria-label="Croki Canvas">
      <header className="flex min-h-11 shrink-0 items-center gap-4 border-b border-white/10 px-4">
        <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">
          {proposalCount > 0
            ? `${proposalCount} ${proposalCount === 1 ? "proposal" : "proposals"} awaiting review`
            : state.dirty
              ? "Unsaved Canvas changes"
              : "Product understanding is current"}
        </p>
        <nav aria-label="Canvas workflow" className="flex shrink-0 items-center gap-1">
          {CROKI_CANVAS_VIEWS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-current={view === candidate.id ? "page" : undefined}
              className={
                view === candidate.id
                  ? "h-8 border-b border-white px-2 text-[11px] text-white"
                  : "h-8 border-b border-transparent px-2 text-[11px] text-zinc-600 hover:text-white"
              }
              onClick={() => {
                setView(candidate.id);
                selectCrokiCanvasNode(workspaceKey, null);
              }}
            >
              {candidate.label}
            </button>
          ))}
        </nav>
        {canUndo ? (
          <Button size="icon-sm" variant="ghost" aria-label="Undo Canvas change" onClick={undo}>
            <Undo2 className="size-3.5" aria-hidden />
          </Button>
        ) : null}
        {canRedo ? (
          <Button size="icon-sm" variant="ghost" aria-label="Redo Canvas change" onClick={redo}>
            <Redo2 className="size-3.5" aria-hidden />
          </Button>
        ) : null}
        {state.dirty ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={discard} disabled={state.isSaving}>
              Discard
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={
                state.isSaving ||
                validationErrors.length > 0 ||
                ((state.sourceState === "malformed" || state.sourceState === "partial") &&
                  !state.repairInProgress)
              }
            >
              <Save className="size-3.5" aria-hidden />
              {state.isSaving ? "Saving…" : "Save Canvas"}
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
        onRetry={retry}
      />
      {sceneFocused && props.externalQuestion ? (
        <div className="croki-canvas-scene-enter flex shrink-0 items-center gap-3 border-b border-white/15 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm leading-5 text-white">{props.externalQuestion}</p>
          <button
            type="button"
            className="h-8 shrink-0 text-xs text-zinc-400 hover:text-white"
            onClick={() => setSceneFocused(false)}
          >
            View all
          </button>
        </div>
      ) : null}
      {state.modelError ? (
        <p
          role="status"
          className="shrink-0 border-b border-destructive/30 px-4 py-2 text-xs text-destructive"
        >
          {MODEL_ERROR_MESSAGE[state.modelError] ?? "Canvas change was refused."}
        </p>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        <CrokiCanvasWorkspace
          activePlan={props.activePlan ?? null}
          context={state.context}
          layoutKey={workspaceKey}
          focusIds={sceneFocused ? (props.externalNodeIds ?? []) : []}
          onClearSelection={() => selectCrokiCanvasNode(workspaceKey, null)}
          onConnect={({ from, to }) => {
            const source = state.context.nodes.find((node) => node.id === from);
            const target = state.context.nodes.find((node) => node.id === to);
            const edge = {
              from,
              to,
              relation: crokiSemanticRelation(source?.kind, target?.kind),
            };
            const transition = addCrokiEdge(state.context, {
              ...edge,
              now: new Date().toISOString(),
            });
            applyTransition(transition);
            if (transition.error) return null;
            return edge;
          }}
          onDisconnect={(edge) =>
            applyTransition({
              context: deleteCrokiEdge(state.context, edge, new Date().toISOString()),
              error: null,
            })
          }
          onReplaceEdge={(previous, next) => {
            const withoutPrevious = deleteCrokiEdge(
              state.context,
              previous,
              new Date().toISOString(),
            );
            const transition = addCrokiEdge(withoutPrevious, {
              ...next,
              now: new Date().toISOString(),
            });
            if (transition.error) {
              applyTransition({ context: state.context, error: transition.error });
              return null;
            }
            applyTransition(transition);
            return next;
          }}
          onSelect={(id) => selectCrokiCanvasNode(workspaceKey, id)}
          selectedId={selectedNode?.id ?? null}
          view={view}
          {...(props.onBuildFromRepository
            ? { onBuildFromRepository: props.onBuildFromRepository }
            : {})}
          {...(props.onPrepareGtm ? { onPrepareGtm: props.onPrepareGtm } : {})}
          {...(props.onOpenPlan ? { onOpenPlan: props.onOpenPlan } : {})}
          {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
        />

        {selectedNode ? (
          <aside className="croki-canvas-panel-enter relative z-20 w-[min(400px,48%)] min-w-72 shrink-0 border-l border-white/15 bg-black">
            <ScrollArea className="h-full">
              <div className="space-y-5 p-5 pb-12">
                {validationErrors.length > 0 ? (
                  <p role="alert" className="text-xs text-destructive">
                    Fix invalid or over-limit Canvas content before committing.
                  </p>
                ) : null}
                <CrokiCanvasNodeEditor
                  node={selectedNode}
                  onAdopt={(id) => {
                    applyTransition(adoptCrokiNode(state.context, id, new Date().toISOString()));
                    selectCrokiCanvasNode(workspaceKey, null);
                  }}
                  onAddReference={(reference) => {
                    const transition = addCrokiNodeReference(
                      state.context,
                      selectedNode.id,
                      reference,
                      new Date().toISOString(),
                    );
                    applyTransition(transition);
                    return transition.error;
                  }}
                  onBack={() => selectCrokiCanvasNode(workspaceKey, null)}
                  onDelete={(id) => {
                    applyTransition(deleteCrokiNode(state.context, id, new Date().toISOString()));
                    selectCrokiCanvasNode(workspaceKey, null);
                  }}
                  onRemoveReference={(reference) =>
                    applyTransition(
                      removeCrokiNodeReference(
                        state.context,
                        selectedNode.id,
                        reference,
                        new Date().toISOString(),
                      ),
                    )
                  }
                  onDecline={(id) => {
                    applyTransition(retireCrokiNode(state.context, id, new Date().toISOString()));
                    selectCrokiCanvasNode(workspaceKey, null);
                  }}
                  onRetire={(id) =>
                    applyTransition(retireCrokiNode(state.context, id, new Date().toISOString()))
                  }
                  onUpdate={updateNode}
                  {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
                />
              </div>
            </ScrollArea>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

const MODEL_ERROR_MESSAGE: Readonly<Record<string, string>> = {
  "duplicate-edge": "That relationship already exists.",
  "duplicate-reference": "That evidence reference is already attached.",
  "edge-limit": "The Canvas relationship limit has been reached.",
  "invalid-body": "The item details exceed the Canvas limit.",
  "invalid-product": "The product name exceeds the Canvas limit.",
  "invalid-reference": "Enter a portable file path or an HTTP(S) URL.",
  "invalid-relation": "Enter a shorter relationship.",
  "invalid-title": "Enter a title within the Canvas limit.",
  "missing-node": "That Canvas item no longer exists.",
  "node-limit": "The Canvas item limit has been reached.",
  "reference-limit": "This item has reached the evidence reference limit.",
  "self-edge": "An item cannot relate to itself.",
};
