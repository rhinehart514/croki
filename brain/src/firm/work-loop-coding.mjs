import { isCodingDirection } from "./code-intent.mjs";
import { openCodingWorkspace, settleCodingWorkspace } from "./code-workspace.mjs";
import { joinDriveRunToWork } from "./work-loop-run.mjs";

export function startCodingRun({ deps, goal, target, driveRun, activeDrive, venture, ventureId, betId, teammateRef, provider, options }) {
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
    workRef: target?.workRef ?? null,
  }, options);
  const joined = joinDriveRunToWork(driveRun, {
    workRef: `work:${workspace.id}`,
    participantRef: `participant:${teammateRef}`,
    provider,
    repository: workspace.repository,
    branch: workspace.branch,
    worktree: workspace.worktree,
  }, options);
  if (!joined) throw new Error("Croki could not join the isolated workspace to its Run.");
  return { workspace, cwd: workspace.worktree };
}

export async function executeProviderTurn({ adapter, ctx, workspace, ventureId, runRef, options, receipts, activeDrive, afterDrive }) {
  let outcome;
  let driveError = null;
  let settlementError = null;
  try {
    outcome = await adapter.drive(ctx);
  } catch (error) {
    driveError = error;
  } finally {
    if (workspace) {
      try {
        workspace = await settleCodingWorkspace(ventureId, workspace.id, {
          runRef,
          outcome: outcome ?? { kind: "failed" },
          error: driveError ? (driveError instanceof Error ? driveError.message : String(driveError)) : null,
        }, options);
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
  if (driveError) throw driveError;
  if (settlementError) throw settlementError;
  return { outcome, workspace };
}
