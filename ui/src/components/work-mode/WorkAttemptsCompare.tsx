import { useState } from "react";
import type { CodingWorkspace } from "@/api";
import { WorkChangesPane } from "./WorkChangesPane";
import { workStatusLabel } from "./workStatusLabel";

// Side-by-side comparison of two coding attempts on the same direction (DESIGN.md: "the founder can
// compare … exact attempts"). Each column reuses WorkChangesPane so the diff primitives stay single-source.
// Comparison is read-only by design: applying, steering, and continuing an attempt remain the founder-held
// actions in the single workbench, reached with "Focus this attempt" — this view never duplicates those
// mutations, it only lets the founder decide which attempt to carry forward.
function attemptLabel(attempts: CodingWorkspace[], workspace: CodingWorkspace) {
  const index = attempts.findIndex((entry) => entry.id === workspace.id);
  return `Attempt ${attempts.length - index}`;
}

export function WorkAttemptsCompare({ attempts, primaryId, onFocusAttempt, onExit }: {
  attempts: CodingWorkspace[];
  primaryId: string;
  onFocusAttempt: (id: string) => void;
  onExit: () => void;
}) {
  const otherId = attempts.find((attempt) => attempt.id !== primaryId)?.id ?? primaryId;
  const [leftId, setLeftId] = useState(primaryId);
  const [rightId, setRightId] = useState(otherId);
  const left = attempts.find((attempt) => attempt.id === leftId) ?? attempts[0];
  const right = attempts.find((attempt) => attempt.id === rightId) ?? attempts[1] ?? attempts[0];
  const columns = [
    { side: "left", workspace: left, value: left.id, onSelect: setLeftId },
    { side: "right", workspace: right, value: right.id, onSelect: setRightId },
  ] as const;

  return (
    <section className="work-compare" aria-label="Compare coding attempts">
      <header className="work-compare-head">
        <strong>Comparing attempts</strong>
        <button type="button" className="work-compare-done" onClick={onExit}>Done comparing</button>
      </header>
      <div className="work-compare-columns">
        {columns.map((column) => {
          const { workspace } = column;
          const stat = workspace.diffStat || `${workspace.changedFiles.length} ${workspace.changedFiles.length === 1 ? "file" : "files"}`;
          return (
            <div className="work-compare-column" key={column.side} aria-label={`${column.side === "left" ? "Left" : "Right"} attempt`}>
              <header className="work-compare-column-head">
                <label className="work-compare-pick">
                  <span className="sr-only">Choose {column.side} attempt</span>
                  <select value={column.value} onChange={(event) => column.onSelect(event.target.value)}>
                    {attempts.map((attempt) => (
                      <option key={attempt.id} value={attempt.id}>{attemptLabel(attempts, attempt)} · {workStatusLabel(attempt.status)}</option>
                    ))}
                  </select>
                </label>
                <span className="work-compare-stat" title={workspace.branch}>{stat}</span>
                <button type="button" className="work-compare-focus" onClick={() => onFocusAttempt(workspace.id)}>Focus this attempt</button>
              </header>
              <div className="work-compare-column-body">
                <WorkChangesPane workspace={workspace} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
