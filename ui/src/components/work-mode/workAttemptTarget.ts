export const WORK_ATTEMPT_TARGET_EVENT = "drover:work-attempt-target";

export type WorkAttemptTarget = {
  ventureId: string;
  threadRef: string;
  workspaceId: string;
  label: string;
  carriedComment?: string | null;
};

export function targetWorkAttempt(detail: WorkAttemptTarget) {
  window.dispatchEvent(new CustomEvent<WorkAttemptTarget>(WORK_ATTEMPT_TARGET_EVENT, { detail }));
}
