const ACTIVE_VENTURE_KEY = "drover:active-venture:v1";
const WORKSPACE_PREFIX = "drover:workspace-session:v1:";
const THREAD_PREFIX = "drover:thread-session:v2:";

export type ThreadSessionVisual = {
  kind: "preview" | "diff" | "flow" | "comparison" | "map" | "evidence" | "consequence";
  ref: string;
  threadRef: string;
  title: string;
  relatedRefs?: string[];
};

export type ThreadSession = {
  threadRef: string | null;
  stage: ThreadSessionVisual | null;
  railWidth: number;
  chatScrollByThread: Record<string, number>;
};

function safeRailWidth(value: unknown) {
  const width = Number(value);
  return Number.isFinite(width) ? Math.min(320, Math.max(208, width)) : 240;
}

export function readThreadSession(ventureId: string): ThreadSession | null {
  if (!ventureId.trim()) return null;
  try {
    const current = JSON.parse(window.localStorage.getItem(`${THREAD_PREFIX}${ventureId}`) ?? "null") as Partial<ThreadSession> | null;
    if (current) {
      const stage = current.stage && typeof current.stage === "object" && typeof current.stage.threadRef === "string"
        ? current.stage as ThreadSessionVisual
        : null;
      return {
        threadRef: typeof current.threadRef === "string" ? current.threadRef : null,
        stage,
        railWidth: safeRailWidth(current.railWidth),
        chatScrollByThread: current.chatScrollByThread && typeof current.chatScrollByThread === "object" ? current.chatScrollByThread : {},
      };
    }
    // v1 migration: restore its linked direction, but deliberately discard work/map mode and stage.
    const legacy = readLegacyWorkspaceSession(ventureId);
    const threadRef = legacy?.threadRef ?? null;
    return legacy ? { threadRef, stage: null, railWidth: 240, chatScrollByThread: {} } : null;
  } catch {
    return null;
  }
}

export function rememberThreadSession(ventureId: string, session: ThreadSession) {
  if (!ventureId.trim()) return;
  try {
    window.localStorage.setItem(`${THREAD_PREFIX}${ventureId}`, JSON.stringify({ ...session, railWidth: safeRailWidth(session.railWidth) }));
  } catch {
    // Presentation memory is recoverable and never enters venture truth or export.
  }
}

export function readActiveVentureId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_VENTURE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function rememberActiveVenture(ventureId: string) {
  if (!ventureId.trim()) return;
  try {
    window.localStorage.setItem(ACTIVE_VENTURE_KEY, ventureId);
  } catch {
    // This is presentation memory only. Losing it returns the founder to the newest venture.
  }
}

function readLegacyWorkspaceSession(ventureId: string): { threadRef: string | null } | null {
  if (!ventureId.trim()) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${WORKSPACE_PREFIX}${ventureId}`) ?? "null") as {
      mode?: unknown;
      focus?: { directionId?: unknown; target?: { threadRef?: unknown } };
    } | null;
    if (!parsed || (parsed.mode !== "work" && parsed.mode !== "map")) return null;
    const targetThread = typeof parsed.focus?.target?.threadRef === "string" ? parsed.focus.target.threadRef.trim() : "";
    const directionThread = typeof parsed.focus?.directionId === "string" && parsed.focus.directionId.startsWith("thread:") ? parsed.focus.directionId : "";
    return { threadRef: targetThread || directionThread || null };
  } catch {
    return null;
  }
}
