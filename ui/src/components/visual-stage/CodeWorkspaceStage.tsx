import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  applyCodingWorkspace,
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
import { swapMotion } from "@/lib/motion";

const activityLabel: Record<string, string> = {
  approve: "Approving checkpoint…",
  reject: "Rejecting checkpoint…",
  apply: "Applying checkpoint to the source workspace…",
  revert: "Reversing the applied change…",
  restore: "Restoring the selected checkpoint…",
  discard: "Discarding the isolated workspace…",
  "product-consequence": "Updating the Product consequence…",
};

export function CodeWorkspaceStage({ ventureId, workspace: sourceWorkspace, readOnlyReason, onChanged, variant = "full" }: {
  ventureId: string;
  workspace: CodingWorkspace;
  readOnlyReason: string | null;
  onChanged: () => void;
  variant?: "full" | "review";
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [settledWorkspace, setSettledWorkspace] = useState<CodingWorkspace | null>(null);
  const workspace = settledWorkspace?.id === sourceWorkspace.id
    && settledWorkspace.updatedAt >= sourceWorkspace.updatedAt
    ? settledWorkspace
    : sourceWorkspace;

  const act = async (name: string, operation: () => Promise<unknown>) => {
    setBusy(name); setError(null);
    try {
      const result = await operation();
      const returned = (result as { workspace?: CodingWorkspace } | null)?.workspace;
      if (returned?.id === workspace.id) setSettledWorkspace(returned);
      setConfirm(null); onChanged();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  };
  const disabled = Boolean(readOnlyReason || busy);
  const reviewed = workspace.consequence?.review;
  const latestRunRef = workspace.checkpoints.at(-1)?.runRef ?? workspace.runRefs.at(-1) ?? null;
  const attributedCommands = latestRunRef
    ? (workspace.commands ?? []).filter((entry) => entry.runRef === latestRunRef)
    : (workspace.commands ?? []);
  const commands = attributedCommands.length || !latestRunRef
    ? attributedCommands
    : (workspace.commands ?? []).filter((entry) => !entry.runRef);
  const attributedVerification = latestRunRef
    ? workspace.verification.filter((entry) => entry.runRef === latestRunRef)
    : workspace.verification;
  const verification = attributedVerification.length || !latestRunRef
    ? attributedVerification
    : workspace.verification.filter((entry) => !entry.runRef);
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
        <div><span>Status</span><AnimatePresence initial={false} mode="popLayout"><motion.strong key={workspace.status} data-status={workspace.status} {...swapMotion}>{workStatusLabel(workspace.status)}</motion.strong></AnimatePresence></div>
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
          {...swapMotion}
        ><span aria-hidden="true" />{error ?? activityLabel[busy!] ?? "Updating workspace…"}</motion.div> : null}
      </AnimatePresence>

      {workspace.interruption ? <section className="code-workspace-alert" role="alert"><strong>Work was interrupted</strong><p>{workspace.interruption.message}</p><p>{workspace.interruption.recovery}</p></section> : null}
      {workspace.restoration ? <section className="code-workspace-alert"><strong>Checkpoint restored</strong><p>{workspace.restoration.note}</p></section> : null}
      {variant === "review" ? founderActions : null}

      {variant === "full" ? <section className="code-workspace-section">
        <header><span>Implementation</span><strong>{workspace.changedFiles.length} changed {workspace.changedFiles.length === 1 ? "file" : "files"}</strong></header>
        {workspace.diff ? <><FilesChanged diff={workspace.diff} /><DiffView diff={workspace.diff} /></> : <p>No repository change is captured at the latest checkpoint.</p>}
      </section> : null}

      {commands.length ? <section className="code-workspace-section">
        <header><span>Command activity</span><strong>{commands.length} captured</strong></header>
        <div className="code-workspace-checks">
          {commands.map((entry, index) => <details key={`${entry.command}:${index}`}>
            <summary data-status={entry.status}><code>{entry.command}</code><span>{entry.status}{Number.isInteger(entry.exitCode) ? ` · exit ${entry.exitCode}` : ""}</span></summary>
            {entry.output ? <pre>{entry.output}</pre> : <p>No output was recorded.</p>}
          </details>)}
        </div>
      </section> : null}

      <section className="code-workspace-section">
        <header><span>Verification</span><strong>{verification.filter((entry) => entry.status === "passed").length} passed · {verification.filter((entry) => entry.status === "failed").length} failed</strong></header>
        <div className="code-workspace-checks">
          {verification.map((entry, index) => <details key={`${entry.command}:${index}`}>
            <summary data-status={entry.status}><code>{entry.command}</code><span>{entry.status}{Number.isInteger(entry.exitCode) ? ` · exit ${entry.exitCode}` : ""}</span></summary>
            {entry.output ? <pre>{entry.output}</pre> : <p>No output was recorded.</p>}
          </details>)}
          {!verification.length ? <p>No verification was attributed to this attempt.</p> : null}
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
