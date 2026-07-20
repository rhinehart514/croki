import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { CodingWorkspace, ThreadTimeline } from "@/api";
import { WorkWorkbench } from "./WorkWorkbench";
import { codingWorkspacesFromTimeline } from "./workspaceProjection";
import "./work-mode.css";

export type WorkCapabilitySlot = (workspace: CodingWorkspace) => ReactNode;

export function WorkSurface({ ventureId, timeline, conversation, readOnlyReason, renderPreview, renderTerminal, onWorkspaceChanged }: {
  ventureId: string;
  timeline: ThreadTimeline | null;
  conversation: ReactNode;
  readOnlyReason: string | null;
  renderPreview?: WorkCapabilitySlot;
  renderTerminal?: WorkCapabilitySlot;
  onWorkspaceChanged: () => void;
}) {
  const attempts = useMemo(() => codingWorkspacesFromTimeline(timeline), [timeline]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const selected = attempts.find((workspace) => workspace.id === selectedWorkspaceId) ?? attempts[0] ?? null;

  return (
    <div className="work-surface" data-has-workspace={selected ? "true" : undefined}>
      <div className="work-conversation">{conversation}</div>
      {selected ? <WorkWorkbench
        ventureId={ventureId}
        workspace={selected}
        attempts={attempts}
        selectedWorkspaceId={selected.id}
        readOnlyReason={readOnlyReason}
        preview={renderPreview ? renderPreview(selected) : <NativeCapabilityNotice capability="Preview" />}
        terminal={renderTerminal ? renderTerminal(selected) : <NativeCapabilityNotice capability="Terminal" />}
        onSelectWorkspace={setSelectedWorkspaceId}
        onChanged={onWorkspaceChanged}
      /> : <aside className="work-empty" aria-label="Coding workbench">
        <div><span>Workbench</span><strong>Coding workspace begins when the agent starts repository work.</strong><p>Files, exact diffs, verification, preview, and terminal return here without replacing the conversation.</p></div>
      </aside>}
    </div>
  );
}

function NativeCapabilityNotice({ capability }: { capability: "Preview" | "Terminal" }) {
  return <div className="work-native-notice"><strong>{capability} requires the desktop app.</strong><p>The browser build preserves the workspace record but does not simulate native desktop capability.</p></div>;
}
