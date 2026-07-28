import { useEffect, useRef, useState } from "react";
import { ChevronLeft, File, Folder, Search, X } from "lucide-react";
import {
  getVentureRepositoryFile,
  getWorkspaceRepositoryFile,
  getWorkspaceRepositoryTree,
  searchWorkspaceRepository,
  type RepositoryFile as RepositoryFileProjection,
  type RepositorySearchEntry,
  type RepositoryTreeEntry,
} from "@/api";
import {
  addComposerSourceReference,
  type ComposerSourceReference,
} from "@/components/now/composerSourceReference";
import { RepositoryFileView } from "./RepositoryFileView";
import {
  readRepositoryPresentation,
  writeRepositoryPresentation,
} from "./repositoryPresentation";
import type { RepositoryCitation } from "./repositoryCitation";

const PAGE_SIZE = 100;

type PagedEntries<T> = { entries: T[]; nextCursor: number | null; total: number; truncated: boolean };
const EMPTY_PAGE = { entries: [], nextCursor: null, total: 0, truncated: false };

export function RepositoryBrowser({ ventureId, workspaceId, threadRef, composerScopeKey, initialReference, reopenRequest, onClose }: {
  ventureId: string;
  workspaceId?: string;
  threadRef: string;
  composerScopeKey?: string;
  initialReference?: RepositoryCitation | null;
  reopenRequest?: ComposerSourceReference | null;
  onClose?: () => void;
}) {
  const remembered = readRepositoryPresentation(threadRef);
  const [directory, setDirectory] = useState(remembered.directory);
  const [query, setQuery] = useState(remembered.query);
  const [tree, setTree] = useState<PagedEntries<RepositoryTreeEntry>>(EMPTY_PAGE);
  const [search, setSearch] = useState<PagedEntries<RepositorySearchEntry>>(EMPTY_PAGE);
  const [file, setFile] = useState<RepositoryFileProjection | null>(null);
  const [selection, setSelection] = useState({
    startLine: initialReference?.startLine ?? remembered.startLine,
    endLine: initialReference?.endLine ?? remembered.endLine,
  });
  const [lineTarget, setLineTarget] = useState(String(initialReference?.startLine ?? remembered.startLine));
  const [loading, setLoading] = useState<"tree" | "search" | "file" | "reference" | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);

  const persist = (patch: Parameters<typeof writeRepositoryPresentation>[1]) =>
    writeRepositoryPresentation(threadRef, patch);

  const loadTree = async (nextDirectory: string, cursor = 0) => {
    if (!workspaceId) return;
    setLoading("tree"); setIssue(null);
    try {
      const input = { path: nextDirectory, cursor, limit: PAGE_SIZE };
      const response = await getWorkspaceRepositoryTree(ventureId, workspaceId, input);
      setDirectory(nextDirectory);
      setTree((current) => ({
        ...response.tree,
        entries: cursor ? [...current.entries, ...response.tree.entries] : response.tree.entries,
      }));
      persist({ directory: nextDirectory });
    } catch (cause) {
      setIssue(cause instanceof Error ? cause.message : "The repository tree could not be read.");
    } finally { setLoading(null); }
  };

  const loadSearch = async (nextQuery: string, cursor = 0) => {
    if (!workspaceId || !nextQuery.trim()) { setSearch(EMPTY_PAGE); return; }
    setLoading("search"); setIssue(null);
    try {
      const input = { query: nextQuery, cursor, limit: PAGE_SIZE };
      const response = await searchWorkspaceRepository(ventureId, workspaceId, input);
      setSearch((current) => ({
        ...response.search,
        entries: cursor ? [...current.entries, ...response.search.entries] : response.search.entries,
      }));
    } catch (cause) {
      setIssue(cause instanceof Error ? cause.message : "Repository path search is unavailable.");
    } finally { setLoading(null); }
  };

  const openFile = async (path: string, startLine = 1, endLine = startLine) => {
    setLoading("file"); setIssue(null);
    setSelection({ startLine, endLine });
    setLineTarget(String(startLine));
    persist({ path, startLine, endLine });
    try {
      const checkingCapturedRange = initialReference?.path === path && Boolean(initialReference.digest)
        && initialReference.startLine === startLine && initialReference.endLine === endLine;
      const input = { path, startLine, ...(checkingCapturedRange ? { endLine } : {}) };
      const response = workspaceId
        ? await getWorkspaceRepositoryFile(ventureId, workspaceId, input)
        : await getVentureRepositoryFile(ventureId, input);
      setFile(response.file);
      if (checkingCapturedRange && response.file.state === "ready" && response.file.presentation !== "image") {
        const returnedDigest = /:([0-9a-f]+)$/i.exec(response.file.ref)?.[1]?.toLowerCase();
        if (!returnedDigest || returnedDigest !== initialReference!.digest!.toLowerCase()) {
          setIssue("This citation points to an earlier version of the selected lines.");
        }
      }
    } catch (cause) {
      // Preserve the last coherent source projection while reconnecting or rejecting an unsafe path.
      setIssue(cause instanceof Error ? cause.message : "The source file could not be read.");
    } finally { setLoading(null); }
  };

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      if (workspaceId) void loadTree(remembered.directory);
      const reference = initialReference ?? (remembered.path ? {
        path: remembered.path,
        startLine: remembered.startLine,
        endLine: remembered.endLine,
      } : null);
      if (reference) void openFile(reference.path, reference.startLine, reference.endLine);
    }, 0);
    return () => {
      window.clearTimeout(restoreTimer);
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
    // The browser remounts when the exact Thread/workspace changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventureId, workspaceId, threadRef, initialReference?.path, initialReference?.startLine, initialReference?.endLine, initialReference?.digest]);

  useEffect(() => {
    if (!composerScopeKey || !reopenRequest || reopenRequest.scopeKey !== composerScopeKey) return;
    const timer = window.setTimeout(() => {
      void openFile(reopenRequest.path, reopenRequest.startLine, reopenRequest.endLine);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopenRequest]);

  const updateQuery = (value: string) => {
    setQuery(value);
    persist({ query: value });
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => void loadSearch(value), 160);
  };

  const selectLine = (line: number, extend: boolean) => {
    const next = extend
      ? { startLine: Math.min(selection.startLine, line), endLine: Math.max(selection.startLine, line) }
      : { startLine: line, endLine: line };
    setSelection(next);
    if (file) persist({ path: file.path, ...next });
  };

  const addReference = async () => {
    if (!composerScopeKey || !file || file.state !== "ready" || file.presentation === "image") return;
    setLoading("reference"); setIssue(null);
    try {
      const input = { path: file.path, startLine: selection.startLine, endLine: selection.endLine };
      const exact = workspaceId
        ? await getWorkspaceRepositoryFile(ventureId, workspaceId, input)
        : await getVentureRepositoryFile(ventureId, input);
      if (exact.file.state !== "ready" || exact.file.presentation === "image") return;
      addComposerSourceReference({
        scopeKey: composerScopeKey,
        path: file.path,
        startLine: selection.startLine,
        endLine: selection.endLine,
        ref: exact.file.ref,
      });
    } catch (cause) {
      setIssue(cause instanceof Error ? cause.message : "The exact line selection could not be added to your direction.");
    } finally { setLoading(null); }
  };

  const results = query.trim() ? search : tree;
  const parent = directory.includes("/") ? directory.slice(0, directory.lastIndexOf("/")) : "";
  const readyText = file?.state === "ready" && file.presentation !== "image";

  return <section className="repository-browser" data-source-only={!workspaceId ? "true" : undefined} aria-label="Repository browser">
    <header className="repository-browser-head">
      <div><strong>Repository</strong><span>{workspaceId ? "Exact isolated worktree" : "Exact venture source"}</span></div>
      {onClose ? <button type="button" aria-label="Return to changed files" onClick={onClose}><X aria-hidden="true" /></button> : null}
    </header>
    <div className="repository-browser-tools">
      {workspaceId ? <label><Search aria-hidden="true" /><input aria-label="Search repository paths" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search paths…" /></label> : null}
      <form onSubmit={(event) => {
        event.preventDefault();
        const target = Number(lineTarget);
        if (file && Number.isSafeInteger(target) && target > 0) void openFile(file.path, target, target);
      }}>
        <input aria-label="Go to line" inputMode="numeric" value={lineTarget} onChange={(event) => setLineTarget(event.target.value)} />
        <button type="submit" disabled={!file}>Go</button>
      </form>
    </div>
    {issue ? <p className="repository-browser-issue" role="alert">{issue} The last coherent source remains visible.</p> : null}
    <div className="repository-browser-layout">
      {workspaceId ? <aside aria-label={query.trim() ? "Repository search results" : "Repository tree"}>
        {!query.trim() && directory ? <button type="button" className="repository-browser-parent" onClick={() => void loadTree(parent)}><ChevronLeft aria-hidden="true" />{parent || "Repository root"}</button> : null}
        <div className="repository-browser-path" title={directory || "Repository root"}>{query.trim() ? `${results.total} ranked matches` : directory || "Repository root"}</div>
        <ul>
          {results.entries.map((entry) => <li key={`${entry.path}:${"kind" in entry ? entry.kind : "file"}`}>
            <button type="button" aria-current={file?.path === entry.path ? "true" : undefined} onClick={() => {
              if ("kind" in entry && entry.kind === "directory") void loadTree(entry.path);
              else void openFile(entry.path);
            }}>
              {"kind" in entry && entry.kind === "directory" ? <Folder aria-hidden="true" /> : <File aria-hidden="true" />}
              <span>{entry.name}</span>
              <small>{entry.presentation ?? ("kind" in entry ? entry.kind : "file")}</small>
            </button>
          </li>)}
        </ul>
        {results.nextCursor != null ? <button type="button" className="repository-browser-more" disabled={Boolean(loading)} onClick={() => (
          query.trim() ? void loadSearch(query, results.nextCursor!) : void loadTree(directory, results.nextCursor!)
        )}>Load more · {results.entries.length} of {results.total}</button> : null}
        {results.truncated ? <p>Path index reached its safety limit.</p> : null}
      </aside> : null}
      <main>
        <div className="repository-file-head">
          <div><strong title={file?.path}>{file?.path ?? "No file selected"}</strong>{file ? <span>{file.presentation} · {file.size?.toLocaleString() ?? "removed"} bytes</span> : null}</div>
          {readyText && composerScopeKey ? <button type="button" disabled={loading === "reference"} onClick={() => void addReference()}>
            {loading === "reference" ? "Adding…" : `Add L${selection.startLine}${selection.endLine === selection.startLine ? "" : `–L${selection.endLine}`} to direction`}
          </button> : null}
        </div>
        {loading === "file" ? <p className="repository-browser-loading" role="status">Opening exact source…</p> : null}
        <RepositoryFileView file={file} selection={selection} onSelect={selectLine} />
      </main>
    </div>
  </section>;
}
