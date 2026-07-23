import { useMemo } from "react";
import { FileDiff } from "@pierre/diffs/react";
import type { FileDiffMetadata, FileDiffOptions } from "@pierre/diffs";
import {
  DIFF_THEME_NAME,
  buildFileDiffRenderKey,
  fileDiffStats,
  getRenderablePatch,
  resolveFileDiffPath,
} from "./diffRendering";
import "./review.css";

// One shared options object so every diff body renders identically and FileDiff can skip
// re-render work on referentially equal options. Drover keeps its own compact file header.
const FILE_DIFF_OPTIONS: FileDiffOptions<undefined> = {
  theme: DIFF_THEME_NAME,
  themeType: "dark",
  diffStyle: "unified",
  collapsed: false,
  disableFileHeader: true,
  overflow: "scroll",
};

function FileBlock({ fileDiff }: { fileDiff: FileDiffMetadata }) {
  const path = resolveFileDiffPath(fileDiff);
  const prevPath = fileDiff.prevName ? resolveFileDiffPath({ ...fileDiff, name: fileDiff.prevName }) : null;
  const { additions, deletions } = fileDiffStats(fileDiff);
  return (
    <div className="review-diff-file">
      <div className="review-diff-head">
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
        </span>
      </div>
      <FileDiff fileDiff={fileDiff} options={FILE_DIFF_OPTIONS} />
    </div>
  );
}

/**
 * Render a unified diff with @pierre/diffs: syntax-highlighted per-file bodies under Drover's
 * compact file headers. Highlighting runs in the shared worker pool when one is mounted. Empty
 * input yields a quiet empty state; unparseable input shows the exact raw text, never a crash.
 */
export function DiffView({ diff, path = null }: { diff: string; path?: string | null }) {
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

  if (visibleFiles.length === 0) {
    return <div className="review-empty">No reviewable difference is available.</div>;
  }

  return (
    <div className="review-diff">
      {visibleFiles.map((fileDiff) => (
        <FileBlock key={buildFileDiffRenderKey(fileDiff)} fileDiff={fileDiff} />
      ))}
    </div>
  );
}
