import type { ReactNode } from "react";
import { useState } from "react";
import type { CodingWorkspace } from "@/api";
import { DiffView } from "@/components/review";
import { CodeWorkspaceStage } from "@/components/visual-stage/CodeWorkspaceStage";
import { WorkFilesPane } from "./WorkFilesPane";
import { WorkTerminalDrawer } from "./WorkTerminalDrawer";

export type WorkbenchTab = "files" | "diff" | "preview";

const statusLabel = (status: string) => status.replaceAll("-", " ");

export function WorkWorkbench({ ventureId, workspace, attempts, selectedWorkspaceId, readOnlyReason, preview, terminal, onSelectWorkspace, onChanged }: {
  ventureId: string;
  workspace: CodingWorkspace;
  attempts: CodingWorkspace[];
  selectedWorkspaceId: string;
  readOnlyReason: string | null;
  preview: ReactNode;
  terminal: ReactNode;
  onSelectWorkspace: (id: string) => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<WorkbenchTab>("files");
  const tabs: WorkbenchTab[] = ["files", "diff", "preview"];
  return (
    <section className="work-workbench" aria-label="Coding workbench">
      <header className="work-workbench-head">
        <div className="work-workbench-title">
          <span>Isolated workspace</span>
          <strong title={workspace.goal}>{workspace.goal}</strong>
        </div>
        <div className="work-attempt">
          {attempts.length > 1 ? <label><span className="sr-only">Coding attempt</span><select value={selectedWorkspaceId} onChange={(event) => onSelectWorkspace(event.target.value)}>{attempts.map((attempt, index) => <option key={attempt.id} value={attempt.id}>Attempt {attempts.length - index} · {statusLabel(attempt.status)}</option>)}</select></label> : <span>Attempt 1</span>}
          <strong data-status={workspace.status}>{statusLabel(workspace.status)}</strong>
        </div>
      </header>

      <div className="work-workbench-meta">
        <span title={workspace.branch}><b>Branch</b><code>{workspace.branch}</code></span>
        <span><b>Changes</b><code>{workspace.diffStat || `${workspace.changedFiles.length} files`}</code></span>
        <span><b>Runs</b><code>{workspace.runRefs.length}</code></span>
      </div>

      <div className="work-tabs" role="tablist" aria-label="Coding workspace material">
        {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} aria-controls={`work-panel-${item}`} id={`work-tab-${item}`} onClick={() => setTab(item)}>{item}</button>)}
      </div>

      <div className="work-workbench-scroll">
        <section className="work-tab-panel" role="tabpanel" id={`work-panel-${tab}`} aria-labelledby={`work-tab-${tab}`}>
          {tab === "files" ? <WorkFilesPane workspace={workspace} /> : null}
          {tab === "diff" ? workspace.diff ? <DiffView diff={workspace.diff} /> : <p className="work-pane-empty">No reviewable difference is available.</p> : null}
          {tab === "preview" ? preview : null}
        </section>
        <CodeWorkspaceStage ventureId={ventureId} workspace={workspace} readOnlyReason={readOnlyReason} onChanged={onChanged} variant="review" />
      </div>

      <WorkTerminalDrawer>{terminal}</WorkTerminalDrawer>
    </section>
  );
}

