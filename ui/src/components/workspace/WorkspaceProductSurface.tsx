import { MessageCircle, X } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, type ComponentProps, type ReactNode, type RefObject } from "react";
import type { SystemIndex, WorkIndex } from "@/api";
import type { FirmPlacement } from "@/types";
import { ProductGtmSurface } from "@/components/product-gtm/ProductGtmSurface";
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
  const askAgent = useCallback((subjectRef?: string, relatedRefs?: string[]) => {
    if (subjectRef) onBeginScopedThread(subjectRef, relatedRefs);
    else onNewThread();
    onContextualChatOpen(true);
  }, [onBeginScopedThread, onContextualChatOpen, onNewThread]);
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
        onChanged={onChanged}
      />
    </motion.div>
    {contextualChatOpen ? (
      <aside className="workspace-chat" aria-label="Context conversation">
        <button type="button" className="workspace-chat-close" aria-label="Close conversation"
          onClick={() => { onContextualChatOpen(false); openerRef.current?.focus(); }}>
          <X aria-hidden="true" />
        </button>
        {conversation}
      </aside>
    ) : (
      <div className="workspace-fab">
        <button type="button" onClick={(event) => {
          openerRef.current = event.currentTarget;
          onContextualChatOpen(true);
        }}>
          <MessageCircle aria-hidden="true" />
          Work with Product / GTM
        </button>
      </div>
    )}
  </>;
}
