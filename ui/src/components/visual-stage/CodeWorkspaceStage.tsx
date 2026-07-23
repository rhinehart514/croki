import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  applyCodingWorkspace,
  commitCodingWorkspace,
  discardCodingWorkspace,
  revertCodingWorkspaceApply,
  restoreCodingCheckpoint,
  reviewCodingWorkspace,
  type CodingWorkspace,
} from "@/api";
import { DiffView, FilesChanged } from "@/components/review";
import { ProductConsequenceReview } from "@/components/work-mode/ProductConsequenceReview";
import { WorkShipPanel } from "@/components/work-mode/WorkShipPanel";
import { workStatusLabel } from "@/components/work-mode/workStatusLabel";

const activityLabel: Record<string, string> = {
  approve: "Approving checkpoint…",
  reject: "Rejecting checkpoint…",
  apply: "Applying checkpoint to the source workspace…",
  revert: "Reversing the applied change…",
  commit: "Committing in the isolated branch…",
  restore: "Restoring the selected checkpoint…",
  discard: "Discarding the isolated workspace…",
  "product-consequence": "Updating the Product consequence…",
};

export function CodeWorkspaceStage({ ventureId, workspace, readOnlyReason, onChanged, variant = "full" }: {
  ventureId: string;
  workspace: CodingWorkspace;
  readOnlyReason: string | null;
  onChanged: () => void;
  variant?: "full" | "review";
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const reducedMotion = useReducedMotion();

  const act = async (name: string, operation: () => Promise<unknown>) => {
    setBusy(name); setError(null);
    try { await operation(); setConfirm(null); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  };
  const disabled = Boolean(readOnlyReason || busy);
  const reviewed = workspace.consequence?.review;
  const founderActions = workspace.diff && workspace.status !== "discarded" ? <section className="code-workspace-section code-workspace-actions">
    <header><span>Founder consequence</span><strong>{reviewed ? `Checkpoint ${reviewed}` : "Review the checkpoint first"}</strong></header>
    {readOnlyReason ? <p>{readOnlyReason}</p> : null}
    {!reviewed ? <div className="code-workspace-action-row">
      <button type="button" disabled={disabled} onClick={() => void act("approve", () => reviewCodingWorkspace(ventureId, workspace.id, "approve"))}>Approve checkpoint</button>
      <button type="button" disabled={disabled} onClick={() => void act("reject", () => reviewCodingWorkspace(ventureId, workspace.id, "reject"))}>Reject</button>
    </div> : null}
    {reviewed === "approved" ? <>
      <div className="code-workspace-action-row">
        {workspace.consequence?.action === "applied"
          ? confirm === "revert" ? <button type="button" data-danger="true" disabled={disabled} onClick={() => void act("revert", () => revertCodingWorkspaceApply(ventureId, workspace.id))}>Confirm reverse applied change</button> : <button type="button" disabled={disabled} onClick={() => setConfirm("revert")}>Reverse applied change</button>
          : confirm === "apply" ? <button type="button" data-danger="true" disabled={disabled} onClick={() => void act("apply", () => applyCodingWorkspace(ventureId, workspace.id))}>Confirm apply to source workspace</button> : <button type="button" disabled={disabled} onClick={() => setConfirm("apply")}>Apply to source workspace</button>}
      </div>
      <div className="code-workspace-commit">
        <input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="Commit message" aria-label="Commit message" disabled={disabled} />
        <button type="button" disabled={disabled || !commitMessage.trim()} onClick={() => void act("commit", () => commitCodingWorkspace(ventureId, workspace.id, commitMessage))}>Commit in isolated branch</button>
      </div>
      <div className="code-workspace-action-row">
        {workspace.checkpoints.slice(0, -1).map((checkpoint) => confirm === `restore:${checkpoint.id}`
          ? <button key={checkpoint.id} type="button" data-danger="true" disabled={disabled} onClick={() => void act("restore", () => restoreCodingCheckpoint(ventureId, workspace.id, checkpoint.id))}>Confirm restore {checkpoint.id}</button>
          : <button key={checkpoint.id} type="button" disabled={disabled} onClick={() => setConfirm(`restore:${checkpoint.id}`)}>Restore {checkpoint.id}</button>)}
        {confirm === "discard" ? <button type="button" data-danger="true" disabled={disabled} onClick={() => void act("discard", () => discardCodingWorkspace(ventureId, workspace.id))}>Confirm permanent discard</button> : <button type="button" disabled={disabled} onClick={() => setConfirm("discard")}>Discard workspace</button>}
      </div>
      <WorkShipPanel ventureId={ventureId} workspaceId={workspace.id} disabled={disabled} onChanged={onChanged} />
    </> : null}
  </section> : null;

  return (
    <div className="code-workspace" data-variant={variant}>
      {variant === "full" ? <section className="code-workspace-summary">
        <div><span>Status</span><AnimatePresence initial={false} mode="popLayout"><motion.strong key={workspace.status} data-status={workspace.status} initial={reducedMotion ? false : { opacity: 0, y: 4, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -2 }} transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}>{workStatusLabel(workspace.status)}</motion.strong></AnimatePresence></div>
        <div><span>Branch</span><code>{workspace.branch}</code></div>
        <div><span>Workspace</span><code>{workspace.worktree ?? "Removed"}</code></div>
        <div><span>Lineage</span><code>{workspace.runRefs.length} {workspace.runRefs.length === 1 ? "Run" : "Runs"} · {workspace.checkpoints.length} checkpoints</code></div>
      </section> : null}

      <AnimatePresence initial={false}>
        {busy || error ? <motion.div
          key={error ? "error" : busy}
          className="code-workspace-activity"
          data-state={error ? "error" : "busy"}
          role={error ? "alert" : "status"}
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -5, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
          transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
        ><span aria-hidden="true" />{error ?? activityLabel[busy!] ?? "Updating workspace…"}</motion.div> : null}
      </AnimatePresence>

      {workspace.interruption ? <section className="code-workspace-alert" role="alert"><strong>Work was interrupted</strong><p>{workspace.interruption.message}</p><p>{workspace.interruption.recovery}</p></section> : null}
      {workspace.restoration ? <section className="code-workspace-alert"><strong>Checkpoint restored</strong><p>{workspace.restoration.note}</p></section> : null}
      {variant === "review" ? founderActions : null}

      {variant === "full" ? <section className="code-workspace-section">
        <header><span>Implementation</span><strong>{workspace.changedFiles.length} changed {workspace.changedFiles.length === 1 ? "file" : "files"}</strong></header>
        {workspace.diff ? <><FilesChanged diff={workspace.diff} /><DiffView diff={workspace.diff} /></> : <p>No repository change is captured at the latest checkpoint.</p>}
      </section> : null}

      {workspace.commands?.length ? <section className="code-workspace-section">
        <header><span>Command activity</span><strong>{workspace.commands.length} captured</strong></header>
        <div className="code-workspace-checks">
          {workspace.commands.map((entry, index) => <details key={`${entry.command}:${index}`}>
            <summary data-status={entry.status}><code>{entry.command}</code><span>{entry.status}{Number.isInteger(entry.exitCode) ? ` · exit ${entry.exitCode}` : ""}</span></summary>
            {entry.output ? <pre>{entry.output}</pre> : <p>No output was recorded.</p>}
          </details>)}
        </div>
      </section> : null}

      <section className="code-workspace-section">
        <header><span>Verification</span><strong>{workspace.verification.filter((entry) => entry.status === "passed").length} passed · {workspace.verification.filter((entry) => entry.status === "failed").length} failed</strong></header>
        <div className="code-workspace-checks">
          {workspace.verification.map((entry, index) => <details key={`${entry.command}:${index}`}>
            <summary data-status={entry.status}><code>{entry.command}</code><span>{entry.status}{Number.isInteger(entry.exitCode) ? ` · exit ${entry.exitCode}` : ""}</span></summary>
            {entry.output ? <pre>{entry.output}</pre> : <p>No output was recorded.</p>}
          </details>)}
          {!workspace.verification.length ? <p>No verification was attributed to this attempt.</p> : null}
        </div>
      </section>

      {workspace.productConsequence ? <ProductConsequenceReview
        key={`${workspace.id}:${workspace.updatedAt}`}
        ventureId={ventureId}
        workspace={workspace}
        readOnlyReason={readOnlyReason}
        busy={Boolean(busy)}
        onBusy={(active) => setBusy(active ? "product-consequence" : null)}
        onError={setError}
        onChanged={onChanged}
      /> : null}

      {variant === "full" ? founderActions : null}
    </div>
  );
}
