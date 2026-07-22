import { useState } from "react";
import { restoreCodingCheckpoint, type CodingWorkspace } from "@/api";

// Checkpoint timeline for the Work workbench. Each provider turn settles a `turn-N` checkpoint
// (see brain settleCodingWorkspace); this surface lets the founder rewind the isolated workspace to
// any earlier checkpoint. Rewind is non-destructive by design: the brain restore appends a
// `restore-N` checkpoint and pushes the prior consequence into the record's decisions, so history is
// never truncated — the transcript keeps every turn while the worktree returns to the chosen state.
function checkpointLabel(id: string) {
  if (id === "baseline") return "Baseline";
  const turn = id.match(/^turn-(\d+)$/);
  if (turn) return `Turn ${turn[1]}`;
  const restore = id.match(/^restore-(\d+)$/);
  if (restore) return `Restore ${restore[1]}`;
  return id;
}

function elapsed(value: string) {
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function WorkCheckpoints({ ventureId, workspace, readOnlyReason, onChanged }: {
  ventureId: string;
  workspace: CodingWorkspace;
  readOnlyReason: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkpoints = workspace.checkpoints;
  const currentId = checkpoints.length ? checkpoints[checkpoints.length - 1].id : null;

  const rewind = async (checkpointId: string) => {
    setBusy(checkpointId); setError(null);
    try { await restoreCodingCheckpoint(ventureId, workspace.id, checkpointId); setConfirm(null); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  };

  if (!checkpoints.length) return <p className="work-pane-empty">No checkpoints yet. Each agent turn captures one.</p>;

  return (
    <section className="work-checkpoints" aria-label="Workspace checkpoints">
      {error ? <p className="work-checkpoints-error" role="alert">{error}</p> : null}
      <ol>
        {[...checkpoints].reverse().map((checkpoint) => {
          const current = checkpoint.id === currentId;
          const pending = confirm === checkpoint.id;
          return (
            <li key={checkpoint.id} data-current={current || undefined}>
              <div className="work-checkpoint-face">
                <strong>{checkpointLabel(checkpoint.id)}</strong>
                <span title={new Date(checkpoint.capturedAt).toLocaleString()}>{elapsed(checkpoint.capturedAt)}</span>
                <code>{checkpoint.commit.slice(0, 8)}</code>
              </div>
              {current ? <span className="work-checkpoint-here">Current state</span>
                : readOnlyReason ? null
                : pending ? <button type="button" data-danger="true" disabled={Boolean(busy)} onClick={() => void rewind(checkpoint.id)}>Confirm rewind</button>
                : <button type="button" disabled={Boolean(busy)} onClick={() => { setConfirm(checkpoint.id); setError(null); }}>Rewind here</button>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
