import { useMemo, useState } from "react";
import type { CodingWorkspace } from "@/api";
import { DiffView, FilesChanged } from "@/components/review";
import { parseUnifiedDiff } from "@/components/review/parseDiff";

export function WorkChangesPane({ workspace }: { workspace: CodingWorkspace }) {
  const files = useMemo(() => workspace.diff ? parseUnifiedDiff(workspace.diff) : [], [workspace.diff]);
  const [selection, setSelection] = useState<{ workspaceId: string; path: string } | null>(null);
  const selectedPath = selection?.workspaceId === workspace.id && files.some((file) => file.path === selection.path)
    ? selection.path
    : files[0]?.path ?? null;

  if (!workspace.diff && !workspace.changedFiles.length) {
    return <p className="work-pane-empty">No repository changes are captured at the latest checkpoint.</p>;
  }

  if (!workspace.diff) {
    return (
      <div className="work-file-list">
        <div><strong>{workspace.changedFiles.length} changed {workspace.changedFiles.length === 1 ? "file" : "files"}</strong></div>
        <ul>{workspace.changedFiles.map((file) => <li key={`${file.status}:${file.path}`}><span>{file.status}</span><code>{file.path}</code></li>)}</ul>
      </div>
    );
  }

  return (
    <div className="work-changes">
      <aside aria-label="Changed files">
        <FilesChanged diff={workspace.diff} selectedPath={selectedPath} onSelectFile={(path) => setSelection({ workspaceId: workspace.id, path })} />
      </aside>
      <div className="work-change-diff">
        <DiffView diff={workspace.diff} path={selectedPath} />
      </div>
    </div>
  );
}
