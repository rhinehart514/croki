import { useMemo } from "react";
import { parseUnifiedDiff, type DiffFile, type DiffLine } from "./parseDiff";
import "./review.css";

const MARKER: Record<DiffLine["kind"], string> = { add: "+", del: "−", context: "", meta: "" };

function fileStatLabel(file: DiffFile) {
  return (
    <span className="review-stat" aria-label={`${file.additions} added, ${file.deletions} removed`}>
      <span className={file.additions ? "review-stat-add" : "review-stat-zero"}>+{file.additions}</span>
      <span className={file.deletions ? "review-stat-del" : "review-stat-zero"}>−{file.deletions}</span>
    </span>
  );
}

function FileBlock({ file }: { file: DiffFile }) {
  return (
    <div className="review-diff-file">
      <div className="review-diff-head">
        <span className="review-diff-path" title={file.path}>
          {file.oldPath && file.oldPath !== file.path ? (
            <>
              <span className="review-diff-rename">{file.oldPath} → </span>
              {file.path}
            </>
          ) : (
            file.path
          )}
        </span>
        {fileStatLabel(file)}
      </div>
      {file.binary ? (
        <p className="review-diff-binary">Binary file — not shown as text.</p>
      ) : (
        <div className="review-diff-scroll">
          <table className="review-diff-table">
            <tbody>
              {file.hunks.map((hunk, hi) => (
                <HunkRows key={hi} header={hunk.header} lines={hunk.lines} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HunkRows({ header, lines }: { header: string; lines: DiffLine[] }) {
  return (
    <>
      <tr className="review-diff-row review-diff-row-hunk">
        <td colSpan={4}>{header}</td>
      </tr>
      {lines.map((line, li) => {
        if (line.kind === "meta") {
          return (
            <tr key={li} className="review-diff-row review-diff-row-hunk">
              <td colSpan={4}>\ {line.text}</td>
            </tr>
          );
        }
        return (
          <tr key={li} className={`review-diff-row review-diff-row-${line.kind}`}>
            <td className="review-diff-gutter">{line.oldLine ?? ""}</td>
            <td className="review-diff-gutter">{line.newLine ?? ""}</td>
            <td className="review-diff-marker" aria-hidden="true">
              {MARKER[line.kind]}
            </td>
            <td className="review-diff-code">{line.text === "" ? " " : line.text}</td>
          </tr>
        );
      })}
    </>
  );
}

/**
 * Render a unified diff string as per-file cards with two-column line numbers and add/del/context
 * styling. Long lines scroll horizontally inside each file; the page never breaks. Empty or
 * unparseable input yields a quiet empty state.
 */
export function DiffView({ diff, path = null }: { diff: string; path?: string | null }) {
  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const visibleFiles = path ? files.filter((file) => file.path === path) : files;

  if (visibleFiles.length === 0) {
    return <div className="review-empty">No reviewable difference is available.</div>;
  }

  return (
    <div className="review-diff">
      {visibleFiles.map((file, i) => (
        <FileBlock key={`${file.path}-${i}`} file={file} />
      ))}
    </div>
  );
}
