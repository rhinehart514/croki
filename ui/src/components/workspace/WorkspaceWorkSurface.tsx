import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { ThreadTimeline } from "@/api";
import { WorkPreview, WorkSurface, WorkTerminal } from "@/components/work-mode";

type MotionProps = Parameters<typeof motion.div>[0];

export function WorkspaceWorkSurface({
  ventureId,
  timeline,
  conversation,
  readOnlyReason,
  motionProps,
  onChanged,
}: {
  ventureId: string;
  timeline: ThreadTimeline | null;
  conversation: ReactNode;
  readOnlyReason: string | null;
  motionProps: MotionProps;
  onChanged: () => void;
}) {
  const unavailableReason = (workspace: { worktree?: string | null; status: string }) =>
    workspace.worktree
      ? null
      : workspace.status === "discarded"
        ? "This coding worktree was discarded. Its files and receipts remain available for review."
        : "The isolated coding worktree is unavailable.";
  return (
    <motion.div className="workspace-work" {...motionProps}>
      <WorkSurface
        ventureId={ventureId}
        timeline={timeline}
        conversation={conversation}
        readOnlyReason={readOnlyReason}
        renderPreview={(workspace) => (
          <WorkPreview
            workspaceId={workspace.id}
            disabledReason={readOnlyReason}
            unavailableReason={unavailableReason(workspace)}
          />
        )}
        renderTerminal={(workspace) => (
          <WorkTerminal
            ventureId={ventureId}
            workspaceId={workspace.id}
            disabledReason={readOnlyReason}
            unavailableReason={unavailableReason(workspace)}
          />
        )}
        onWorkspaceChanged={onChanged}
      />
    </motion.div>
  );
}
