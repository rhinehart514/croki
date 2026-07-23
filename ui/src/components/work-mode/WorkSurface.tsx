import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import type { CodingWorkspace, ThreadTimeline } from "@/api";
import { WorkWorkbench } from "./WorkWorkbench";
import { WorkAttemptsCompare } from "./WorkAttemptsCompare";
import type { WorkTerminalStatus } from "./WorkTerminal";
import { codingWorkspacesFromTimeline, defaultCodingWorkspace } from "./workspaceProjection";
import "./work-mode.css";

export type WorkCapabilitySlot = (workspace: CodingWorkspace, onStatus?: (status: WorkTerminalStatus) => void) => ReactNode;

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
  const [comparing, setComparing] = useState(false);
  // Terminal status is tagged with the attempt it came from and only shown for the current one, so the
  // collapsed drawer never displays liveness belonging to a different workspace — no reset effect needed.
  const [terminalStatus, setTerminalStatus] = useState<{ id: string; status: WorkTerminalStatus } | null>(null);
  const selected = attempts.find((workspace) => workspace.id === selectedWorkspaceId) ?? defaultCodingWorkspace(attempts);
  const reportTerminalStatus = useCallback((status: WorkTerminalStatus) => {
    if (selected) setTerminalStatus({ id: selected.id, status });
  }, [selected]);
  const currentTerminalStatus = terminalStatus && terminalStatus.id === selected?.id ? terminalStatus.status : null;
  const canCompare = attempts.length > 1;
  // Compare is only coherent with a chosen attempt and at least one sibling to hold it against. Exiting
  // when siblings drop below two keeps the toggle from stranding the founder in an empty comparison.
  const showCompare = comparing && canCompare && Boolean(selected);
  const focusAttempt = (id: string) => { setSelectedWorkspaceId(id); setComparing(false); };

  return (
    <div className="work-surface" data-has-workspace={selected ? "true" : undefined}>
      <div className="work-conversation">{conversation}</div>
      {showCompare && selected ? <WorkAttemptsCompare
        attempts={attempts}
        primaryId={selected.id}
        onFocusAttempt={focusAttempt}
        onExit={() => setComparing(false)}
      /> : selected ? <WorkWorkbench
        ventureId={ventureId}
        workspace={selected}
        attempts={attempts}
        selectedWorkspaceId={selected.id}
        readOnlyReason={readOnlyReason}
        canCompare={canCompare}
        onCompare={() => setComparing(true)}
        preview={renderPreview ? renderPreview(selected) : <NativeCapabilityNotice capability="Preview" />}
        terminal={renderTerminal ? renderTerminal(selected, reportTerminalStatus) : <NativeCapabilityNotice capability="Terminal" />}
        terminalStatus={currentTerminalStatus}
        onSelectWorkspace={setSelectedWorkspaceId}
        onChanged={onWorkspaceChanged}
      /> : null}
    </div>
  );
}

function NativeCapabilityNotice({ capability }: { capability: "Preview" | "Terminal" }) {
  return <div className="work-native-notice"><strong>{capability} requires the desktop app.</strong><p>The browser build preserves the workspace record but does not simulate native desktop capability.</p></div>;
}
