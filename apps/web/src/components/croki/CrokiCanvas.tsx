import type { EnvironmentId } from "@t3tools/contracts";
import {
  CROKI_CONTEXT_LIMITS,
  type CrokiContextEdge,
  type CrokiContextReference,
  type CrokiNodeDomain,
  type CrokiNodeKind,
} from "@t3tools/shared/crokiContext";
import { CircleDot, Save } from "lucide-react";
import { useState } from "react";

import { randomHex } from "~/lib/utils";
import type { ActivePlanState } from "~/session-logic";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { CrokiCanvasNodeEditor } from "./CrokiCanvasNodeEditor";
import { CrokiCanvasOverview } from "./CrokiCanvasOverview";
import {
  CROKI_CANVAS_VIEWS,
  crokiDomainForView,
  crokiNewNodeTitle,
  type CrokiCanvasView,
} from "./crokiCanvasLanguage";
import { CrokiCanvasRunProjection } from "./CrokiCanvasRunProjection";
import { CrokiCanvasSourceNotice } from "./CrokiCanvasSourceNotice";
import {
  cancelCrokiCanvasRepair,
  confirmCrokiCanvasRepair,
  reloadConflictingCrokiCanvasFile,
  replaceCrokiCanvasDraft,
  requestCrokiCanvasRepair,
  selectCrokiCanvasNode,
} from "./crokiCanvasDraftStore";
import {
  addCrokiEdge,
  addCrokiNode,
  addCrokiNodeReference,
  adoptCrokiNode,
  deleteCrokiEdge,
  deleteCrokiNode,
  replaceCrokiProduct,
  removeCrokiNodeReference,
  retireCrokiNode,
} from "./crokiCanvasModel";
import { useCrokiCanvasController } from "./useCrokiCanvasController";

interface CrokiCanvasProps {
  readonly environmentId: EnvironmentId;
  readonly activePlan?: ActivePlanState | null;
  readonly onBuildFromRepository?: () => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onPendingChange?: (pending: boolean) => void;
  readonly onPrepareGtm?: () => void;
  readonly onPrepareWorkflow?: () => void;
  readonly productName: string;
  readonly workspaceRoot: string;
}

export function CrokiCanvas(props: CrokiCanvasProps) {
  const {
    applyTransition,
    retry,
    save,
    selectedNode,
    state,
    updateNode,
    validationErrors,
    workspaceKey,
  } = useCrokiCanvasController(props);
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [edgeRelation, setEdgeRelation] = useState("supports");
  const [view, setView] = useState<CrokiCanvasView>("product");

  return (
    <section className="flex h-full min-h-0 flex-col bg-black text-white" aria-label="Croki Canvas">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <CircleDot className="size-4 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Canvas</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {state.context.nodes.length} items · {state.context.edges.length} links
            {state.dirty ? " · Unsaved" : ""}
          </p>
        </div>
        <Button
          size="sm"
          onClick={save}
          disabled={
            state.isSaving ||
            !state.dirty ||
            validationErrors.length > 0 ||
            ((state.sourceState === "malformed" || state.sourceState === "partial") &&
              !state.repairInProgress)
          }
        >
          <Save className="size-3.5" aria-hidden />
          {state.isSaving ? "Saving…" : "Save"}
        </Button>
      </header>

      <nav
        aria-label="Canvas views"
        className="flex shrink-0 items-center gap-4 overflow-x-auto border-b border-border/60 px-3"
      >
        {CROKI_CANVAS_VIEWS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-current={view === candidate.id ? "page" : undefined}
            className={
              view === candidate.id
                ? "border-b border-foreground py-2 text-xs text-foreground"
                : "border-b border-transparent py-2 text-xs text-muted-foreground hover:text-foreground"
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

      <CrokiCanvasSourceNotice
        state={state}
        onCancelRepair={() => cancelCrokiCanvasRepair(workspaceKey)}
        onConfirmRepair={() => confirmCrokiCanvasRepair(workspaceKey, props.productName)}
        onReloadConflict={() => reloadConflictingCrokiCanvasFile(workspaceKey, props.productName)}
        onRequestRepair={() => requestCrokiCanvasRepair(workspaceKey)}
        onRetry={retry}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-3 pb-10">
          {state.modelError ? (
            <p role="status" className="text-xs text-destructive">
              {MODEL_ERROR_MESSAGE[state.modelError] ?? "Canvas change was refused."}
            </p>
          ) : validationErrors.length > 0 ? (
            <p role="alert" className="text-xs text-destructive">
              Fix invalid or over-limit Canvas content before saving.
            </p>
          ) : null}
          {selectedNode ? (
            <CrokiCanvasNodeEditor
              node={selectedNode}
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
              onUpdate={updateNode}
              {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
            />
          ) : (
            <>
              {view === "product" ? (
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Product</span>
                  <Input
                    aria-invalid={state.context.product.length > CROKI_CONTEXT_LIMITS.productChars}
                    value={state.context.product}
                    placeholder={props.productName}
                    onChange={(event) =>
                      replaceCrokiCanvasDraft(
                        workspaceKey,
                        replaceCrokiProduct(
                          state.context,
                          event.target.value,
                          new Date().toISOString(),
                        ),
                      )
                    }
                  />
                </label>
              ) : null}
              {view === "gtm" && props.onPrepareGtm ? (
                <section className="border-y border-border/60 py-3">
                  <p className="text-sm font-medium">Reason from the founder perspective</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Ask the current agent to connect product truth to audiences, claims, signals,
                    and experiments.
                  </p>
                  <Button className="mt-2" size="sm" variant="outline" onClick={props.onPrepareGtm}>
                    Explore in Thread
                  </Button>
                </section>
              ) : null}
              {view === "workflow" ? (
                <CrokiCanvasRunProjection
                  activePlan={props.activePlan ?? null}
                  {...(props.onPrepareWorkflow
                    ? { onPrepareWorkflow: props.onPrepareWorkflow }
                    : {})}
                />
              ) : null}
              <CrokiCanvasOverview
                context={state.context}
                edgeFrom={edgeFrom}
                edgeRelation={edgeRelation}
                edgeTo={edgeTo}
                onAddEdge={() => {
                  applyTransition(
                    addCrokiEdge(state.context, {
                      from: edgeFrom,
                      to: edgeTo,
                      relation: edgeRelation,
                      now: new Date().toISOString(),
                    }),
                  );
                  setEdgeRelation("supports");
                }}
                onAddNode={(kind: CrokiNodeKind) => {
                  const id = `${kind}-${randomHex(16)}`;
                  const domain: CrokiNodeDomain = crokiDomainForView(view);
                  applyTransition(
                    addCrokiNode(state.context, {
                      id,
                      kind,
                      domain,
                      title: crokiNewNodeTitle(kind, domain),
                      now: new Date().toISOString(),
                    }),
                  );
                  selectCrokiCanvasNode(workspaceKey, id);
                }}
                {...(props.onBuildFromRepository
                  ? { onBuildFromRepository: props.onBuildFromRepository }
                  : {})}
                onAdopt={(id) =>
                  applyTransition(adoptCrokiNode(state.context, id, new Date().toISOString()))
                }
                onDeleteEdge={(edge: CrokiContextEdge) =>
                  replaceCrokiCanvasDraft(
                    workspaceKey,
                    deleteCrokiEdge(state.context, edge, new Date().toISOString()),
                  )
                }
                onEdgeFromChange={setEdgeFrom}
                onEdgeRelationChange={setEdgeRelation}
                onEdgeToChange={setEdgeTo}
                onReject={(id) =>
                  applyTransition(retireCrokiNode(state.context, id, new Date().toISOString()))
                }
                onRetire={(id) =>
                  applyTransition(retireCrokiNode(state.context, id, new Date().toISOString()))
                }
                onSelect={(id) => selectCrokiCanvasNode(workspaceKey, id)}
                view={view}
              />
            </>
          )}
        </div>
      </ScrollArea>
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
