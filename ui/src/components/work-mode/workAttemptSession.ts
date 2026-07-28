const PREFIX = "drover:work-attempt-review:v1:";

export type WorkAttemptSession = {
  selectedId: string | null;
  comparing: boolean;
  leftId: string | null;
  rightId: string | null;
};

const fallback = (): WorkAttemptSession => ({
  selectedId: null,
  comparing: false,
  leftId: null,
  rightId: null,
});

function key(ventureId: string, threadRef: string) {
  return `${PREFIX}${ventureId}:${threadRef}`;
}

export function readWorkAttemptSession(ventureId: string, threadRef: string): WorkAttemptSession {
  if (!ventureId || !threadRef) return fallback();
  try {
    const value = JSON.parse(window.localStorage.getItem(key(ventureId, threadRef)) ?? "null") as Partial<WorkAttemptSession> | null;
    return value ? {
      selectedId: typeof value.selectedId === "string" ? value.selectedId : null,
      comparing: value.comparing === true,
      leftId: typeof value.leftId === "string" ? value.leftId : null,
      rightId: typeof value.rightId === "string" ? value.rightId : null,
    } : fallback();
  } catch {
    return fallback();
  }
}

export function rememberWorkAttemptSession(
  ventureId: string,
  threadRef: string,
  session: WorkAttemptSession,
) {
  if (!ventureId || !threadRef) return;
  try { window.localStorage.setItem(key(ventureId, threadRef), JSON.stringify(session)); }
  catch { /* Review presentation memory is recoverable and never enters venture truth. */ }
}

export function resolveWorkAttemptSession(
  session: WorkAttemptSession,
  attemptIds: string[],
): WorkAttemptSession {
  const valid = new Set(attemptIds);
  const selectedId = session.selectedId && valid.has(session.selectedId)
    ? session.selectedId
    : attemptIds[0] ?? null;
  const leftId = session.leftId && valid.has(session.leftId) ? session.leftId : selectedId;
  const rightId = session.rightId && valid.has(session.rightId) && session.rightId !== leftId
    ? session.rightId
    : attemptIds.find((id) => id !== leftId) ?? leftId;
  return {
    selectedId,
    comparing: session.comparing && attemptIds.length > 1,
    leftId,
    rightId,
  };
}
