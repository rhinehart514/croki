import type { ReactNode } from "react";
import { useState } from "react";
import type { CodingWorkspace } from "@/api";
import { CodeWorkspaceStage } from "@/components/visual-stage/CodeWorkspaceStage";
import { WorkChangesPane } from "./WorkChangesPane";
import { WorkCheckpoints } from "./WorkCheckpoints";
import { WorkTerminalDrawer } from "./WorkTerminalDrawer";
import type { WorkTerminalStatus } from "./WorkTerminal";
import { workStatusLabel } from "./workStatusLabel";
import { attemptLabel } from "./workspaceProjection";

export type WorkbenchTab = "changes" | "preview" | "history";

export function WorkWorkbench({ ventureId, workspace, attempts, selectedWorkspaceId, readOnlyReason, canCompare = false, onCompare, preview, terminal, terminalStatus = null, onSelectWorkspace, onChanged }: {
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
}) {
  const [tab, setTab] = useState<WorkbenchTab>("changes");
  const tabs: WorkbenchTab[] = ["changes", "preview", "history"];
  return (
    <section className="work-workbench" aria-label="Coding workbench">
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
        </div>
      </header>

      <div className="work-tabs" role="tablist" aria-label="Coding workspace material">
        {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} aria-controls={`work-panel-${item}`} id={`work-tab-${item}`} onClick={() => setTab(item)}>{item}</button>)}
      </div>

      <div className="work-workbench-scroll">
        <section className="work-tab-panel" role="tabpanel" id={`work-panel-${tab}`} aria-labelledby={`work-tab-${tab}`}>
          {tab === "changes" ? <WorkChangesPane workspace={workspace} readOnlyReason={readOnlyReason} onSteered={onChanged} /> : null}
          {tab === "preview" ? preview : null}
          {tab === "history" ? <WorkCheckpoints ventureId={ventureId} workspace={workspace} readOnlyReason={readOnlyReason} onChanged={onChanged} /> : null}
        </section>
        <CodeWorkspaceStage ventureId={ventureId} workspace={workspace} readOnlyReason={readOnlyReason} onChanged={onChanged} variant="review" />
      </div>

      <WorkTerminalDrawer status={terminalStatus}>{terminal}</WorkTerminalDrawer>
    </section>
  );
}
