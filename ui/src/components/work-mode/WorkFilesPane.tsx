import type { CodingWorkspace } from "@/api";
import { FilesChanged } from "@/components/review";

export function WorkFilesPane({ workspace }: { workspace: CodingWorkspace }) {
  if (workspace.diff) return <FilesChanged diff={workspace.diff} />;
  if (!workspace.changedFiles.length) return <p className="work-pane-empty">No repository changes are captured at the latest checkpoint.</p>;

  return (
    <div className="work-file-list">
      <div><strong>{workspace.changedFiles.length} changed {workspace.changedFiles.length === 1 ? "file" : "files"}</strong></div>
      <ul>{workspace.changedFiles.map((file) => <li key={`${file.status}:${file.path}`}><span>{file.status}</span><code>{file.path}</code></li>)}</ul>
    </div>
  );
}

