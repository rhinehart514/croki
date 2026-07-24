import type { CSSProperties, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { PanelRightOpen } from "lucide-react";
import type { CodingWorkspace, ThreadTimeline } from "@/api";
import { readWorkbenchSession, rememberWorkbenchSession, type WorkbenchSession } from "@/lib/venture-session";
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
  // The workbench split is the founder's: open/closed and dragged width persist per venture, while
  // maximize is a transient reading posture that never outlives the visit.
  const [bench, setBench] = useState<WorkbenchSession>(() => readWorkbenchSession(ventureId));
  const [maximized, setMaximized] = useState(false);
  const updateBench = (next: WorkbenchSession) => { setBench(next); rememberWorkbenchSession(ventureId, next); };
  const selected = attempts.find((workspace) => workspace.id === selectedWorkspaceId) ?? defaultCodingWorkspace(attempts);
  const reportTerminalStatus = useCallback((status: WorkTerminalStatus) => {
    if (selected) setTerminalStatus({ id: selected.id, status });
  }, [selected]);
  const currentTerminalStatus = terminalStatus && terminalStatus.id === selected?.id ? terminalStatus.status : null;
  const canCompare = attempts.length > 1;
  // Compare is only coherent with a chosen attempt and at least one sibling to hold it against. Exiting
  // when siblings drop below two keeps the toggle from stranding the founder in an empty comparison.
  const showCompare = comparing && canCompare && Boolean(selected);
  const showWorkbench = Boolean(selected) && bench.open;
  const focusAttempt = (id: string) => { setSelectedWorkspaceId(id); setComparing(false); };

  return (
    <div
      className="work-surface"
      data-has-workspace={showCompare || showWorkbench ? "true" : undefined}
      data-workbench-max={showWorkbench && !showCompare && maximized ? "true" : undefined}
      style={bench.width != null ? { "--work-workbench-width": `${bench.width}px` } as CSSProperties : undefined}
    >
      <div className="work-conversation">{conversation}</div>
      {selected && !bench.open && !showCompare ? (
        <button type="button" className="work-workbench-reveal" aria-label="Show the coding workbench" title="Show the coding workbench" onClick={() => updateBench({ ...bench, open: true })}>
          <PanelRightOpen aria-hidden="true" />
        </button>
      ) : null}
      {showCompare && selected ? <WorkAttemptsCompare
        attempts={attempts}
        primaryId={selected.id}
        onFocusAttempt={focusAttempt}
        onExit={() => setComparing(false)}
      /> : showWorkbench && selected ? <WorkWorkbench
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
        maximized={maximized}
        onToggleMaximize={() => setMaximized((current) => !current)}
        onHide={() => { setMaximized(false); updateBench({ ...bench, open: false }); }}
        onResize={(width) => updateBench({ ...bench, width })}
      /> : null}
    </div>
  );
}

function NativeCapabilityNotice({ capability }: { capability: "Preview" | "Terminal" }) {
  return <div className="work-native-notice"><strong>{capability} requires the desktop app.</strong><p>The browser build preserves the workspace record but does not simulate native desktop capability.</p></div>;
}
