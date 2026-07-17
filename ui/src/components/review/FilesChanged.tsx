import { useMemo } from "react";
import { parseUnifiedDiff, diffStat, type DiffFile } from "./parseDiff";
import "./review.css";

function StatPair({ file }: { file: DiffFile }) {
  return (
    <span className="review-stat">
      <span className={file.additions ? "review-stat-add" : "review-stat-zero"}>+{file.additions}</span>
      <span className={file.deletions ? "review-stat-del" : "review-stat-zero"}>−{file.deletions}</span>
    </span>
  );
}

/**
 * Compact "files changed" overview above a diff: a summary header ("3 files · +853 −0") and a
 * per-file row list. When onSelectFile is given, each row is a button that reports its path.
 */
export function FilesChanged({
  diff,
  onSelectFile,
}: {
  diff: string;
  onSelectFile?: (path: string) => void;
}) {
  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const stat = useMemo(() => diffStat(files), [files]);

  if (files.length === 0) {
    return <div className="review-empty">No reviewable difference is available.</div>;
  }

  return (
    <div className="review-files">
      <div className="review-files-summary">
        <strong style={{ fontVariantNumeric: "tabular-nums" }}>
          {stat.files} {stat.files === 1 ? "file" : "files"}
        </strong>
        <span>·</span>
        <span className="review-stat">
          <span className={stat.additions ? "review-stat-add" : "review-stat-zero"}>+{stat.additions}</span>
          <span className={stat.deletions ? "review-stat-del" : "review-stat-zero"}>−{stat.deletions}</span>
        </span>
      </div>
      <ul className="review-files-list">
        {files.map((file, i) => (
          <li key={`${file.path}-${i}`}>
            {onSelectFile ? (
              <button type="button" className="review-file-row" onClick={() => onSelectFile(file.path)}>
                <span className="review-file-path" title={file.path}>
                  {file.path}
                </span>
                <StatPair file={file} />
              </button>
            ) : (
              <div className="review-file-row">
                <span className="review-file-path" title={file.path}>
                  {file.path}
                </span>
                <StatPair file={file} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
