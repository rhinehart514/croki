import { isCodingDirection } from "./code-intent.mjs";
import { openCodingWorkspace, resumeCodingWorkspace, settleCodingWorkspace } from "./code-workspace.mjs";
import { joinDriveRunToWork } from "./work-loop-run.mjs";
import { recordRunInterrupted } from "./work-journal-runtime.mjs";
import { acknowledgeRunLayer, enqueueRunLayer } from "./run-worker.mjs";

export function startCodingRun({ deps, goal, target, driveRun, activeDrive, venture, ventureId, betId, teammateRef, participantRef = teammateRef, provider, options, recovery = null }) {
  if (recovery?.workspaceId) {
    const workspace = resumeCodingWorkspace(ventureId, recovery.workspaceId, {
      runRef: `run:${driveRun.runId}`,
      participantRef: teammateRef,
      provider,
    }, options);
    return { workspace, cwd: workspace.worktree };
  }
  if (deps.cwd || !isCodingDirection(goal, target)) return { workspace: null, cwd: deps.cwd ?? venture.repository };
  if (!driveRun) throw new Error("Croki could not establish exact Run lineage, so isolated implementation did not start.");
  const workspace = openCodingWorkspace({
    ventureId,
    runId: activeDrive.id,
    threadRef: driveRun.threadRef,
    betId,
    participantRef: teammateRef,
    provider,
    repository: venture.repository,
    goal,
    originMessageRef: driveRun.originMessageRef ?? null,
    workRef: target?.workRef ?? null,
  }, options);
  const joined = joinDriveRunToWork(driveRun, {
    workRef: `work:${workspace.id}`,
    participantRef: participantRef ? `participant:${participantRef}` : null,
    provider,
    repository: workspace.repository,
    branch: workspace.branch,
    worktree: workspace.worktree,
  }, options);
  if (!joined) throw new Error("Croki could not join the isolated workspace to its Run.");
  return { workspace, cwd: workspace.worktree };
}

export async function executeProviderTurn({ adapter, ctx, workspace, ventureId, runRef, options, receipts, activeDrive, afterDrive, driveRun }) {
  let outcome;
  let driveError = null;
  let settlementError = null;
  try {
    outcome = driveRun
      ? await enqueueRunLayer(driveRun, "provider-settled", () => adapter.drive(ctx), {
          worktreeRef: workspace?.worktree ?? null,
        })
      : await adapter.drive(ctx);
  } catch (error) {
    driveError = error;
  } finally {
    if (workspace) {
      try {
        workspace = await enqueueRunLayer(driveRun, "checkpoint-captured", () => settleCodingWorkspace(
          ventureId,
          workspace.id,
          {
            runRef,
            outcome: outcome ?? { kind: "failed" },
            error: driveError ? (driveError instanceof Error ? driveError.message : String(driveError)) : null,
          },
          options,
        ), {
          worktreeRef: workspace.worktree,
          artifactRefs: (settled) => {
            const checkpoint = (settled.checkpoints ?? []).filter((entry) => entry.runRef === runRef).at(-1);
            return checkpoint?.ref ? [`checkpoint:${checkpoint.ref}`] : [];
          },
        });
        await acknowledgeRunLayer(driveRun, "diff-finalized", {
          artifactRefs: [`work:${workspace.id}#diff`],
          worktreeRef: workspace.worktree,
        });
        await acknowledgeRunLayer(driveRun, "commands-settled", {
          artifactRefs: (workspace.commands ?? []).map((_, index) => `work:${workspace.id}#command-${index + 1}`),
          worktreeRef: workspace.worktree,
        });
        const verificationReady = workspace.status === "reviewable" || workspace.status === "no-change";
        await acknowledgeRunLayer(driveRun, "verification-settled", {
          status: verificationReady ? "succeeded" : "failed",
          artifactRefs: (workspace.verification ?? []).map((_, index) => `work:${workspace.id}#verification-${index + 1}`),
          worktreeRef: workspace.worktree,
          ...(!verificationReady ? { error: new Error(`Coding verification settled as ${workspace.status}.`) } : {}),
        });
      } catch (error) {
        settlementError = error;
      }
    }
    try {
      receipts.finishDrive();
    } finally {
      activeDrive.finish();
      afterDrive();
    }
  }
  if (driveError) {
    recordRunInterrupted(driveRun, driveError, { layer: "provider" });
    throw driveError;
  }
  if (settlementError) {
    recordRunInterrupted(driveRun, settlementError, { layer: "workspace-settlement" });
    throw settlementError;
  }
  return { outcome, workspace };
}
