import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FolderSearch2 } from "lucide-react";
import type { CodingWorkspace } from "@/api";
import { DiffView, FilesChanged } from "@/components/review";
import { parseUnifiedDiff } from "@/components/review/parseDiff";
import {
  readRepositoryPresentation,
  writeRepositoryPresentation,
} from "@/components/review/repositoryPresentation";
import {
  OPEN_COMPOSER_SOURCE_EVENT,
  type ComposerSourceReference,
} from "@/components/now/composerSourceReference";
import { composerScopeKey } from "@/components/now/composerScope";
import { WorkChangeComment } from "./WorkChangeComment";
import type { DiffLineSelection } from "@/components/review/DiffView";
import { readReviewedPaths, rememberReviewedPath } from "./reviewReadState";

const RepositoryBrowser = lazy(async () => {
  const module = await import("@/components/review/RepositoryBrowser");
  return { default: module.RepositoryBrowser };
});

export function WorkChangesPane({ workspace, ventureId = workspace.ventureId, readOnlyReason = null, onSteered }: {
  ventureId?: string;
  workspace: CodingWorkspace;
  readOnlyReason?: string | null;
  onSteered?: () => void;
}) {
  const files = useMemo(() => workspace.diff ? parseUnifiedDiff(workspace.diff) : [], [workspace.diff]);
  const [selection, setSelection] = useState<{ workspaceId: string; path: string } | null>(null);
  const [line, setLine] = useState<DiffLineSelection | null>(null);
  const [reviewedPaths, setReviewedPaths] = useState(() => readReviewedPaths(workspace.id, workspace.patchHash));
  const [browsing, setBrowsing] = useState(() => readRepositoryPresentation(workspace.threadRef).open);
  const [reopenRequest, setReopenRequest] = useState<ComposerSourceReference | null>(null);
  const selectedPath = selection?.workspaceId === workspace.id && files.some((file) => file.path === selection.path)
    ? selection.path
    : files[0]?.path ?? null;
  const sourceScopeKey = composerScopeKey(ventureId, {
    betId: workspace.betId,
    workRef: null,
    threadRef: workspace.threadRef,
    teammateRefs: [],
  });
  const statusByPath = useMemo(() => new Map(workspace.changedFiles.map((file) => [file.path, file.status])), [workspace.changedFiles]);
  const unreadPaths = useMemo(() => new Set(files.map((file) => file.path).filter((path) => !reviewedPaths.has(path))), [files, reviewedPaths]);
  const selectedIndex = files.findIndex((file) => file.path === selectedPath);
  const selectPath = (path: string) => {
    setSelection({ workspaceId: workspace.id, path });
    setLine(null);
    setReviewedPaths(rememberReviewedPath(workspace.id, workspace.patchHash, path));
  };
  const move = (delta: number) => {
    if (!files.length) return;
    const index = selectedIndex < 0 ? 0 : (selectedIndex + delta + files.length) % files.length;
    selectPath(files[index].path);
  };

  useEffect(() => {
    const reopen = (event: Event) => {
      const detail = (event as CustomEvent<ComposerSourceReference>).detail;
      if (!detail || detail.scopeKey !== sourceScopeKey) return;
      setReopenRequest(detail);
      setBrowsing(true);
      writeRepositoryPresentation(workspace.threadRef, {
        open: true,
        path: detail.path,
        startLine: detail.startLine,
        endLine: detail.endLine,
      });
    };
    window.addEventListener(OPEN_COMPOSER_SOURCE_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COMPOSER_SOURCE_EVENT, reopen);
  }, [sourceScopeKey, workspace.threadRef]);

  const setBrowserOpen = (open: boolean) => {
    setBrowsing(open);
    writeRepositoryPresentation(workspace.threadRef, { open });
  };

  if (browsing) {
    return <Suspense fallback={<p className="repository-browser-loading" role="status">Opening repository Review…</p>}>
      <RepositoryBrowser
        key={`${workspace.id}:${workspace.threadRef}`}
        ventureId={ventureId}
        workspaceId={workspace.id}
        threadRef={workspace.threadRef}
        composerScopeKey={sourceScopeKey}
        reopenRequest={reopenRequest}
        onClose={() => setBrowserOpen(false)}
      />
    </Suspense>;
  }

  if (!workspace.diff && !workspace.changedFiles.length) {
    return <div className="work-native-notice">
      <strong>No repository changes are captured at the latest checkpoint.</strong>
      <p>Browse unchanged source in this attempt when exact repository context matters.</p>
      <button type="button" className="work-repository-open" onClick={() => setBrowserOpen(true)}><FolderSearch2 aria-hidden="true" />Browse repository</button>
    </div>;
  }

  if (!workspace.diff) {
    return (
      <div className="work-file-list">
        <div><button type="button" className="work-repository-open" onClick={() => setBrowserOpen(true)}><FolderSearch2 aria-hidden="true" />Browse repository</button></div>
        <ul>{workspace.changedFiles.map((file) => <li key={`${file.status}:${file.path}`}><span>{file.status}</span><code>{file.path}</code></li>)}</ul>
      </div>
    );
  }

  return (
    <div
      className="work-changes"
      tabIndex={0}
      onKeyDown={(event) => {
        if (!event.altKey) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
      }}
    >
      <aside aria-label="Changed files">
        <button type="button" className="work-repository-open" onClick={() => setBrowserOpen(true)}><FolderSearch2 aria-hidden="true" />Browse repository</button>
        <div className="work-change-navigation" aria-label="Navigate changed files">
          <button type="button" aria-label="Previous changed file" aria-keyshortcuts="Alt+ArrowLeft" onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></button>
          <span>{selectedIndex + 1} of {files.length}</span>
          <button type="button" aria-label="Next changed file" aria-keyshortcuts="Alt+ArrowRight" onClick={() => move(1)}><ChevronRight aria-hidden="true" /></button>
        </div>
        <FilesChanged
          diff={workspace.diff}
          hideSummary
          selectedPath={selectedPath}
          statusByPath={statusByPath}
          unreadPaths={unreadPaths}
          onSelectFile={selectPath}
        />
      </aside>
      <div className="work-change-diff">
        <DiffView diff={workspace.diff} path={selectedPath} onLineSelect={setLine} />
        {onSteered ? <WorkChangeComment workspace={workspace} line={line} sourceScopeKey={sourceScopeKey} readOnlyReason={readOnlyReason} onSteered={onSteered} /> : null}
      </div>
    </div>
  );
}
