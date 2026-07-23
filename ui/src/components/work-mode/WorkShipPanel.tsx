import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCodingWorkspaceShip,
  prepareCodingWorkspaceShip,
  shipCodingWorkspace,
  type ShipAttempt,
  type ShipInfo,
} from "@/api";

const phaseLabel: Record<string, string> = {
  branch: "Create branch",
  commit: "Commit the reviewed change",
  push: "Push to GitHub",
  pr: "Open pull request",
};

const phaseState: Record<string, string> = {
  pending: "Waiting",
  running: "Running…",
  ready: "Ready",
  done: "Done",
  skipped: "Skipped",
  failed: "Failed",
};

function driftSentences(info: ShipInfo): string[] {
  const lines: string[] = [];
  const base = info.baseBranch;
  const drift = info.drift;
  if (!base || !drift) return lines;
  if (drift.behindDefaultCount > 0) {
    lines.push(`${base} gained ${drift.behindDefaultCount} ${drift.behindDefaultCount === 1 ? "commit" : "commits"} while this work ran. The new branch starts from the exact code you reviewed, so the pull request will show that gap.`);
  } else {
    lines.push(`${base} has not moved since this work began.`);
  }
  if (drift.aheadOfDefaultCount > 0) {
    lines.push(`This work started from code that already carries ${drift.aheadOfDefaultCount} ${drift.aheadOfDefaultCount === 1 ? "commit" : "commits"} ${base} does not have yet.`);
  }
  return lines;
}

function AttemptResult({ attempt }: { attempt: ShipAttempt }) {
  return (
    <div className="ship-attempt" data-outcome={attempt.outcome}>
      <ol className="ship-phases">
        {attempt.phases.map((entry) => (
          <li key={entry.phase} data-status={entry.status}>
            <span>{phaseLabel[entry.phase] ?? entry.phase}</span>
            <em>{phaseState[entry.status] ?? entry.status}</em>
            {entry.detail ? <small>{entry.detail}</small> : null}
          </li>
        ))}
      </ol>
      {attempt.outcome === "dry-run" ? <p>This was a preview. Nothing left your machine.</p> : null}
      {attempt.outcome === "completed" && attempt.prUrl ? <p>Pull request opened: <a href={attempt.prUrl} target="_blank" rel="noreferrer">{attempt.prUrl}</a></p> : null}
      {attempt.outcome === "completed" && !attempt.prUrl && attempt.prNote ? <p>{attempt.prNote}</p> : null}
      {attempt.outcome === "failed" ? (
        <p role="alert">
          {attempt.error}{" "}
          {attempt.failedPhase === "pr" && attempt.pushed
            ? `The branch ${attempt.branch} and its commit are already on GitHub and were kept. Ship again with the same branch to retry only the pull request.`
            : "Nothing partial was kept — fix the cause and ship again."}
        </p>
      ) : null}
    </div>
  );
}

export function WorkShipPanel({ ventureId, workspaceId, disabled, onChanged }: {
  ventureId: string;
  workspaceId: string;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [info, setInfo] = useState<ShipInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fields, setFields] = useState({ branch: "", commitMessage: "", prTitle: "", prBody: "" });
  const [busy, setBusy] = useState<"dry-run" | "prepare" | "ship" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);

  const load = useCallback(async () => {
    try {
      const { ship } = await getCodingWorkspaceShip(ventureId, workspaceId);
      setInfo(ship);
      setLoadError(null);
      if (ship && !seeded.current) {
        seeded.current = true;
        setFields({ branch: ship.drafts.branch, commitMessage: ship.drafts.commitMessage, prTitle: ship.drafts.prTitle, prBody: ship.drafts.prBody });
      }
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [ventureId, workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Arm the confirmation by staging the founder's edits through the brain's sanitizers first, so the
  // confirm button names the exact branch that will be pushed rather than the raw text before shaping.
  const arm = async () => {
    setBusy("prepare");
    setError(null);
    try {
      const result = await prepareCodingWorkspaceShip(ventureId, workspaceId, fields);
      if (result.ship) {
        setInfo(result.ship);
        setFields({ branch: result.ship.drafts.branch, commitMessage: result.ship.drafts.commitMessage, prTitle: result.ship.drafts.prTitle, prBody: result.ship.drafts.prBody });
      }
      setConfirm(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? "dry-run" : "ship");
    setError(null);
    setConfirm(false);
    try {
      const result = await shipCodingWorkspace(ventureId, workspaceId, { ...fields, dryRun });
      if (result.ship) setInfo(result.ship);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await load(); // The failed attempt is durable; show exactly which step stopped.
    } finally {
      setBusy(null);
    }
  };

  if (loadError) return <div className="ship-panel"><p role="alert">Ship details are unavailable: {loadError}</p></div>;
  if (!info) return <div className="ship-panel"><p>Reading repository state…</p></div>;

  const ghBlocked = !info.gh.available || !info.gh.authenticated;
  const locked = disabled || busy !== null;
  const drift = driftSentences(info);
  // Any edit after arming disarms the confirmation: the confirm button names staged content only.
  const edit = (patch: Partial<typeof fields>) => {
    setConfirm(false);
    setFields((current) => ({ ...current, ...patch }));
  };

  return (
    <div className="ship-panel">
      <header className="ship-panel-header">
        <strong>Ship this change</strong>
        <span>One action: branch, commit, push, pull request</span>
      </header>
      {drift.map((line) => <p key={line} className="ship-drift">{line}</p>)}
      {ghBlocked ? <p className="ship-gh-note">{info.gh.reason} The branch will still be pushed.</p> : null}

      <div className="ship-fields">
        <label>
          <span>Branch</span>
          <input value={fields.branch} disabled={locked} onChange={(event) => edit({ branch: event.target.value })} />
        </label>
        <label>
          <span>Commit message</span>
          <textarea value={fields.commitMessage} rows={2} disabled={locked} onChange={(event) => edit({ commitMessage: event.target.value })} />
        </label>
        <label>
          <span>Pull request title</span>
          <input value={fields.prTitle} disabled={locked} onChange={(event) => edit({ prTitle: event.target.value })} />
        </label>
        <label>
          <span>Pull request description</span>
          <textarea value={fields.prBody} rows={5} disabled={locked} onChange={(event) => edit({ prBody: event.target.value })} />
        </label>
      </div>

      <div className="ship-actions">
        <button type="button" disabled={locked} onClick={() => void run(true)}>
          {busy === "dry-run" ? "Previewing…" : "Preview without shipping"}
        </button>
        {confirm
          ? <button type="button" data-danger="true" disabled={locked} onClick={() => void run(false)}>Confirm: push {fields.branch || info.drafts.branch} and open the pull request</button>
          : <button type="button" disabled={locked} onClick={() => void arm()}>{busy === "ship" ? "Shipping…" : busy === "prepare" ? "Preparing…" : "Ship"}</button>}
      </div>

      {error ? <p className="ship-error" role="alert">{error}</p> : null}
      {info.attempt ? <AttemptResult attempt={info.attempt} /> : null}
      {info.receipts.length > 1 ? <p className="ship-history">{info.receipts.length} attempts recorded on this workspace.</p> : null}
    </div>
  );
}
