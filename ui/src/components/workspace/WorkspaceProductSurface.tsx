import { ChevronDown, ChevronUp, LayoutGrid, LoaderCircle, Map, Play } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useMemo, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import { replyInConversation, type SystemIndex, type WorkIndex } from "@/api";
import type { FirmPlacement } from "@/types";
import { ProductGtmSurface } from "@/components/product-gtm/ProductGtmSurface";
import { parseProductGtmWorkflowNodeId, productGtmWorkflowGraph } from "@/components/product-gtm/productGtmWorkflow";
import type { WorkspaceResource } from "./useWorkspaceResources";

function ResourceNotice({ resource }: { resource: WorkspaceResource<unknown> }) {
  if (!resource.error) return null;
  return (
    <div className="workspace-resource-notice" role={resource.status === "error" ? "alert" : "status"}>
      <strong>{resource.status === "stale" ? "Showing the last current view." : "This view could not load."}</strong>
      <span>{resource.status === "stale" ? "Your last current venture model is still visible while Drover reconnects." : "The local venture model is unavailable. Reopen the Product or restart Drover; no Product truth was changed."}</span>
    </div>
  );
}

export function WorkspaceProductSurface({
  ventureId, motionProps, conversation, contextualChatOpen, openerRef,
  systemIndex, workIndex, selectedRef, camera, placement, readOnlyReason, systemResource,
  onCameraChange, onFocus, onUseAgent, onOpenWork, onBeginScopedThread, onNewThread,
  onChanged, onContextualChatOpen,
}: {
  ventureId: string;
  motionProps: ComponentProps<typeof motion.div>;
  conversation: ReactNode;
  contextualChatOpen: boolean;
  openerRef: RefObject<HTMLElement | null>;
  systemIndex: SystemIndex | null;
  workIndex: WorkIndex | null;
  selectedRef: string | null;
  camera: import("@xyflow/react").Viewport | null;
  placement: FirmPlacement;
  readOnlyReason: string | null;
  systemResource: WorkspaceResource<SystemIndex>;
  onCameraChange: (camera: import("@xyflow/react").Viewport) => void;
  onFocus: (ref: string | null) => void;
  onUseAgent: (agentRef: string, subjectRef?: string) => void;
  onOpenWork: (ref: string) => void;
  onBeginScopedThread: (subjectRef: string, relatedRefs?: string[]) => void;
  onNewThread: () => void;
  onChanged: () => void;
  onContextualChatOpen: (open: boolean) => void;
}) {
  const [playAction, setPlayAction] = useState<"run" | null>(null);
  const [mappingProduct, setMappingProduct] = useState(false);
  const [organizeRequest, setOrganizeRequest] = useState(0);
  const [playError, setPlayError] = useState<string | null>(null);
  const askAgent = useCallback((subjectRef?: string, relatedRefs?: string[]) => {
    if (subjectRef) onBeginScopedThread(subjectRef, relatedRefs);
    else onNewThread();
    onContextualChatOpen(true);
  }, [onBeginScopedThread, onContextualChatOpen, onNewThread]);
  const selectedPlay = useMemo(() => {
    const workflowNode = parseProductGtmWorkflowNodeId(selectedRef);
    const selectedId = workflowNode?.ownerId ?? selectedRef?.replace(/^object:/, "");
    const object = systemIndex?.objects.find((entry) => entry.id === selectedId) ?? null;
    return object && productGtmWorkflowGraph(object.properties) ? object : null;
  }, [selectedRef, systemIndex]);
  const directPlay = useCallback(async () => {
    if (!selectedPlay || playAction || readOnlyReason) return;
    setPlayAction("run"); setPlayError(null);
    try {
      const message = `Run “${selectedPlay.name}” again from its current canonical definition. Preserve every conditional branch and founder gate, use current venture context, and record the exact outcomes and evidence on this play.`;
      const result = await replyInConversation(ventureId, { message, subjectRefs: [selectedPlay.objectRef], mode: "context", productGtmView: true, workflowSketch: true });
      onChanged();
      if (result.act === "new-direction" && result.threadRef) onOpenWork(result.threadRef);
      else setPlayError("The agent answered without opening exact work. Nothing on the play changed.");
    } catch (cause) {
      setPlayError(cause instanceof Error ? cause.message : "The play action could not start.");
    } finally { setPlayAction(null); }
  }, [onChanged, onOpenWork, playAction, readOnlyReason, selectedPlay, ventureId]);
  const mapProduct = useCallback(async () => {
    if (mappingProduct || readOnlyReason) return;
    setMappingProduct(true); setPlayError(null);
    try {
      const result = await replyInConversation(ventureId, {
        message: "Map the product from the current codebase as the actual pages a user walks through. Read the routes and source, preserve exact citations, connect the proven page-to-page journey, and return an adoptable Product / GTM view. Do not invent pages or behavior the repository does not prove.",
        mode: "context", productGtmView: true,
      });
      onChanged();
      if (result.act === "new-direction" && result.threadRef) onOpenWork(result.threadRef);
      else setPlayError("Product mapping did not open exact work. Nothing on the canvas changed.");
    } catch (cause) {
      setPlayError(cause instanceof Error ? cause.message : "Product mapping could not start.");
    } finally { setMappingProduct(false); }
  }, [mappingProduct, onChanged, onOpenWork, readOnlyReason, ventureId]);
  return <>
    <motion.div className="workspace-primary" {...motionProps}>
      <ResourceNotice resource={systemResource} />
      <ProductGtmSurface
        index={systemIndex}
        ventureId={ventureId}
        workIndex={workIndex}
        selectedRef={selectedRef}
        camera={camera}
        placement={placement}
        readOnlyReason={readOnlyReason}
        onCameraChange={onCameraChange}
        onFocus={onFocus}
        onUseAgent={onUseAgent}
        onOpenWork={onOpenWork}
        onAskAgent={askAgent}
        organizeRequest={organizeRequest}
        onChanged={onChanged}
      />
    </motion.div>
    <aside className="workspace-canvas-dock" data-expanded={contextualChatOpen ? "true" : "false"} aria-label="Product and GTM canvas dock">
      <header className="workspace-canvas-dock-bar">
        <div className="workspace-canvas-dock-scope">
          <span>{contextualChatOpen ? "Product / GTM chat" : selectedPlay ? "Selected play" : "Product / GTM"}</span>
          <strong>{contextualChatOpen ? "Quick answers stay here. Rework opens in Work." : selectedPlay?.name ?? "Canvas controls"}</strong>
        </div>
        {!contextualChatOpen ? <div className="workspace-canvas-dock-actions" aria-label={selectedPlay ? "Selected play and canvas actions" : "Canvas actions"}>
          {selectedPlay ? <button type="button" data-weight="primary" disabled={Boolean(playAction || readOnlyReason)} onClick={() => void directPlay()}>{playAction === "run" ? <LoaderCircle className="is-spinner" aria-hidden="true" /> : <Play aria-hidden="true" />}Run again</button> : null}
          <button type="button" data-weight="quiet" disabled={mappingProduct || Boolean(readOnlyReason)} onClick={() => void mapProduct()}>{mappingProduct ? <LoaderCircle className="is-spinner" aria-hidden="true" /> : <Map aria-hidden="true" />}Map product</button>
          <button type="button" data-weight="muted" disabled={Boolean(readOnlyReason)} onClick={() => setOrganizeRequest((value) => value + 1)}><LayoutGrid aria-hidden="true" />Organize</button>
        </div> : null}
        <button ref={openerRef as RefObject<HTMLButtonElement | null>} type="button" className="workspace-canvas-dock-toggle" aria-expanded={contextualChatOpen} aria-label={contextualChatOpen ? "Collapse canvas chat" : "Open canvas chat; rework continues in Work"} onClick={() => onContextualChatOpen(!contextualChatOpen)}>
          <span><b>{contextualChatOpen ? "Done" : "Ask"}</b>{!contextualChatOpen ? <small>Quick answers · rework opens in Work</small> : null}</span>{contextualChatOpen ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </button>
      </header>
      {playError ? <p className="workspace-canvas-dock-error" role="status">{playError}</p> : null}
      <div className="workspace-canvas-dock-conversation">{conversation}</div>
    </aside>
  </>;
}
