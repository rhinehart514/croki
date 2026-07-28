import { guardedDelete, guardedPut } from "./transport";
import type { WorkIndex, WorkIndexItem } from "./work";

export const setThreadPinned = (ventureId: string, threadRef: string, pinned: boolean) => {
  const threadId = threadRef.replace(/^thread:/, "");
  return guardedPut<{ item: WorkIndexItem; workIndex: WorkIndex }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/threads/${encodeURIComponent(threadId)}/pin`,
    { pinned },
  );
};

export const setThreadName = (ventureId: string, threadRef: string, name: string) => {
  const threadId = threadRef.replace(/^thread:/, "");
  return guardedPut<{ item: WorkIndexItem; workIndex: WorkIndex }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/threads/${encodeURIComponent(threadId)}/name`,
    { name },
  );
};

export const deleteThread = (ventureId: string, threadRef: string) => {
  const threadId = threadRef.replace(/^thread:/, "");
  return guardedDelete<{
    deleted: true;
    threadRef: string;
    stoppedRunRefs: string[];
    revokedWorkScopeRefs: string[];
    workIndex: WorkIndex;
  }>(`/api/ventures/${encodeURIComponent(ventureId)}/threads/${encodeURIComponent(threadId)}`);
};
