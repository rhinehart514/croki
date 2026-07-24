import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { Maximize2, Minimize2, PanelRightClose } from "lucide-react";
import type { CodingWorkspace } from "@/api";
import { WORKBENCH_MAX_WIDTH, WORKBENCH_MIN_WIDTH } from "@/lib/venture-session";
import { CodeWorkspaceStage } from "@/components/visual-stage/CodeWorkspaceStage";
import { WorkChangesPane } from "./WorkChangesPane";
import { WorkCheckpoints } from "./WorkCheckpoints";
import { WorkTerminalDrawer } from "./WorkTerminalDrawer";
import type { WorkTerminalStatus } from "./WorkTerminal";
import { workStatusLabel } from "./workStatusLabel";
import { attemptLabel } from "./workspaceProjection";

export type WorkbenchTab = "changes" | "preview" | "history";

export function WorkWorkbench({ ventureId, workspace, attempts, selectedWorkspaceId, readOnlyReason, canCompare = false, onCompare, preview, terminal, terminalStatus = null, onSelectWorkspace, onChanged, maximized = false, onToggleMaximize, onHide, onResize }: {
  ventureId: string;
  workspace: CodingWorkspace;
  attempts: CodingWorkspace[];
  selectedWorkspaceId: string;
  readOnlyReason: string | null;
  canCompare?: boolean;
  onCompare?: () => void;
  preview: ReactNode;
  terminal: ReactNode;
  terminalStatus?: WorkTerminalStatus | null;
  onSelectWorkspace: (id: string) => void;
  onChanged: () => void;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  onHide?: () => void;
  onResize?: (width: number) => void;
}) {
  const [tab, setTab] = useState<WorkbenchTab>("changes");
  const tabs: WorkbenchTab[] = ["changes", "preview", "history"];
  const section = useRef<HTMLElement | null>(null);
  // The drag starts from the measured width, so the default proportional split hands off to an exact
  // pixel width without a jump on the first pointer move.
  const currentWidth = () => section.current?.getBoundingClientRect().width ?? WORKBENCH_MIN_WIDTH;
  const clampWidth = (width: number) => Math.min(WORKBENCH_MAX_WIDTH, Math.max(WORKBENCH_MIN_WIDTH, Math.round(width)));
  const resize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onResize) return;
    const origin = event.clientX;
    const start = currentWidth();
    const move = (next: globalThis.PointerEvent) => onResize(clampWidth(start + (origin - next.clientX)));
    const done = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", done); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
  };
  return (
    <section className="work-workbench" aria-label="Coding workbench" ref={section}>
      {onResize && !maximized ? <button
        type="button"
        className="work-workbench-resizer"
        role="separator"
        aria-label="Resize workbench"
        aria-orientation="vertical"
        aria-valuemin={WORKBENCH_MIN_WIDTH}
        aria-valuemax={WORKBENCH_MAX_WIDTH}
        onPointerDown={resize}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onResize(clampWidth(currentWidth() + 8));
          if (event.key === "ArrowRight") onResize(clampWidth(currentWidth() - 8));
        }}
      /> : null}
      <header className="work-workbench-head">
        <div className="work-workbench-title">
          <strong title={workspace.goal}>{workspace.goal}</strong>
          <span title={workspace.branch}>{workspace.branch}</span>
        </div>
        <div className="work-workbench-tools">
          {canCompare && onCompare ? <button type="button" onClick={onCompare}>Compare attempts</button> : null}
          <span className="work-change-stat">{workspace.diffStat || `${workspace.changedFiles.length} ${workspace.changedFiles.length === 1 ? "file" : "files"}`}</span>
          {attempts.length > 1 ? <label><span className="sr-only">Coding attempt</span><select value={selectedWorkspaceId} onChange={(event) => onSelectWorkspace(event.target.value)}>{attempts.map((attempt) => <option key={attempt.id} value={attempt.id}>{attemptLabel(attempts, attempt)} · {workStatusLabel(attempt.status)}</option>)}</select></label> : null}
          <strong className="work-status" data-status={workspace.status}>{workStatusLabel(workspace.status)}</strong>
          {onToggleMaximize ? <button type="button" className="work-workbench-icon" aria-label={maximized ? "Restore the split view" : "Expand the workbench"} title={maximized ? "Restore the split view" : "Expand the workbench"} onClick={onToggleMaximize}>
            {maximized ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button> : null}
          {onHide ? <button type="button" className="work-workbench-icon" aria-label="Hide the workbench" title="Hide the workbench" onClick={onHide}>
            <PanelRightClose aria-hidden="true" />
          </button> : null}
        </div>
      </header>

      <div className="work-tabs" role="tablist" aria-label="Coding workspace material">
        {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} aria-controls={`work-panel-${item}`} id={`work-tab-${item}`} onClick={() => setTab(item)}>{item}</button>)}
      </div>

      <div className="work-workbench-scroll">
        <section className="work-tab-panel" role="tabpanel" id={`work-panel-${tab}`} aria-labelledby={`work-tab-${tab}`}>
          {tab === "changes" ? <WorkChangesPane workspace={workspace} readOnlyReason={readOnlyReason} onSteered={onChanged} /> : null}
          {/* The preview stays mounted while other tabs are focused, so the run's own preview tools
              can keep driving the page (and an agent-opened preview is already live on return). */}
          <div hidden={tab !== "preview"} style={tab === "preview" ? undefined : { display: "none" }}>{preview}</div>
          {tab === "history" ? <WorkCheckpoints ventureId={ventureId} workspace={workspace} readOnlyReason={readOnlyReason} onChanged={onChanged} /> : null}
        </section>
        <CodeWorkspaceStage ventureId={ventureId} workspace={workspace} readOnlyReason={readOnlyReason} onChanged={onChanged} variant="review" />
      </div>

      <WorkTerminalDrawer status={terminalStatus}>{terminal}</WorkTerminalDrawer>
    </section>
  );
}
