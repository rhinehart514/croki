import { useMemo, useState } from "react";
import { FileDiff } from "@pierre/diffs/react";
import type { FileDiffMetadata, FileDiffOptions, OnDiffLineClickProps } from "@pierre/diffs";
import {
  DIFF_THEME_NAME,
  buildFileDiffRenderKey,
  fileDiffStats,
  getRenderablePatch,
  resolveFileDiffPath,
  shouldCollapseDiff,
} from "./diffRendering";
import "./review.css";

// One shared options object so every diff body renders identically and FileDiff can skip
// re-render work on referentially equal options. Croki keeps its own compact file header.
const FILE_DIFF_OPTIONS: FileDiffOptions<undefined> = {
  theme: DIFF_THEME_NAME,
  themeType: "dark",
  diffStyle: "unified",
  collapsed: false,
  disableFileHeader: true,
  overflow: "scroll",
};

export type DiffLineSelection = {
  path: string;
  line: number;
  side: "additions" | "deletions";
  selectedText: string | null;
};

function FileBlock({ fileDiff, expanded, onExpandedChange, onLineSelect }: {
  fileDiff: FileDiffMetadata;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onLineSelect?: (selection: DiffLineSelection) => void;
}) {
  const path = resolveFileDiffPath(fileDiff);
  const prevPath = fileDiff.prevName ? resolveFileDiffPath({ ...fileDiff, name: fileDiff.prevName }) : null;
  const { additions, deletions } = fileDiffStats(fileDiff);
  const options = useMemo<FileDiffOptions<undefined>>(() => onLineSelect ? {
    ...FILE_DIFF_OPTIONS,
    lineHoverHighlight: "both",
    onLineNumberClick: (line: OnDiffLineClickProps) => onLineSelect({
      path,
      line: line.lineNumber,
      side: line.annotationSide,
      selectedText: line.lineElement.textContent?.trim() || null,
    }),
  } : FILE_DIFF_OPTIONS, [onLineSelect, path]);
  return (
    <div className="review-diff-file" data-expanded={expanded ? "true" : "false"}>
      <button
        type="button"
        className="review-diff-head"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Hide" : "Show"} diff for ${path}`}
        onClick={() => onExpandedChange(!expanded)}
      >
        <span className="review-diff-path" title={path}>
          {prevPath && prevPath !== path ? (
            <>
              <span className="review-diff-rename">{prevPath} → </span>
              {path}
            </>
          ) : (
            path
          )}
        </span>
        <span className="review-stat" aria-label={`${additions} added, ${deletions} removed`}>
          <span className={additions ? "review-stat-add" : "review-stat-zero"}>+{additions}</span>
          <span className={deletions ? "review-stat-del" : "review-stat-zero"}>−{deletions}</span>
          <span className="review-diff-toggle">{expanded ? "Hide" : "Show"}</span>
        </span>
      </button>
      {expanded ? <FileDiff fileDiff={fileDiff} options={options} /> : null}
    </div>
  );
}

function ParsedDiff({ files, collapseByDefault, onLineSelect }: {
  files: FileDiffMetadata[];
  collapseByDefault: boolean;
  onLineSelect?: (selection: DiffLineSelection) => void;
}) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => (
    collapseByDefault ? new Set() : new Set(files.map(resolveFileDiffPath))
  ));
  const allExpanded = files.every((file) => expandedPaths.has(resolveFileDiffPath(file)));
  return (
    <div className="review-diff">
      {files.length > 1 ? <div className="review-diff-controls">
        <span>{files.length} changed files</span>
        <button
          type="button"
          onClick={() => setExpandedPaths(allExpanded ? new Set() : new Set(files.map(resolveFileDiffPath)))}
        >
          {allExpanded ? "Collapse all files" : "Expand all files"}
        </button>
      </div> : null}
      {files.map((fileDiff) => {
        const filePath = resolveFileDiffPath(fileDiff);
        return <FileBlock
          key={buildFileDiffRenderKey(fileDiff)}
          fileDiff={fileDiff}
          expanded={expandedPaths.has(filePath)}
          onLineSelect={onLineSelect}
          onExpandedChange={(expanded) => setExpandedPaths((current) => {
            const next = new Set(current);
            if (expanded) next.add(filePath);
            else next.delete(filePath);
            return next;
          })}
        />;
      })}
    </div>
  );
}

/**
 * Render a unified diff with @pierre/diffs: syntax-highlighted per-file bodies under Croki's
 * compact file headers. Highlighting runs in the shared worker pool when one is mounted. Empty
 * input yields a quiet empty state; unparseable input shows the exact raw text, never a crash.
 */
export function DiffView({ diff, path = null, onLineSelect }: {
  diff: string;
  path?: string | null;
  onLineSelect?: (selection: DiffLineSelection) => void;
}) {
  const renderable = useMemo(() => getRenderablePatch(diff, "review-diff"), [diff]);

  if (renderable?.kind === "raw") {
    return (
      <div className="review-diff">
        <p className="review-diff-raw-reason">{renderable.reason}</p>
        <pre className="review-diff-raw">{renderable.text}</pre>
      </div>
    );
  }

  const files = renderable ? renderable.files : [];
  const visibleFiles = path ? files.filter((fileDiff) => resolveFileDiffPath(fileDiff) === path) : files;
  const collapseByDefault = !path && shouldCollapseDiff(visibleFiles);

  if (visibleFiles.length === 0) {
    return <div className="review-empty">No reviewable difference is available.</div>;
  }

  return <ParsedDiff
    key={`${path ?? "all"}:${diff.length}:${diff.slice(0, 80)}`}
    files={visibleFiles}
    collapseByDefault={collapseByDefault}
    onLineSelect={onLineSelect}
  />;
}
