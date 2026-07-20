const ACTIVE_VENTURE_KEY = "drover:active-venture:v1";
const WORKSPACE_PREFIX = "drover:workspace-session:v1:";
const THREAD_PREFIX = "drover:thread-session:v2:";
const WORKSPACE_V3_PREFIX = "drover:workspace-session:v3:";

export type WorkspaceMode = "work" | "system" | "releases";
export type WorkspaceContext =
  | { kind: "thread" | "object" | "release" | "decision"; ref: string }
  | null;

export type WorkspaceSession = {
  mode: WorkspaceMode;
  railWidth: number;
  context: WorkspaceContext;
  work: ThreadSession;
  system: { scope: "system" | "product" | "gtm" | "attention"; selection: string | null; camera: { x: number; y: number; zoom: number } | null };
  releases: { selection: string | null; subview: "overview" | "build" | "activity" | "settings" };
  chatDrawerOpen: boolean;
};

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

function defaultWorkspaceSession(): WorkspaceSession {
  return {
    mode: "work", railWidth: 240, context: null,
    work: { threadRef: null, stage: null, railWidth: 240, chatScrollByThread: {} },
    system: { scope: "system", selection: null, camera: null },
    releases: { selection: null, subview: "overview" }, chatDrawerOpen: false,
  };
}

export function readWorkspaceSession(ventureId: string): WorkspaceSession {
  const fallback = defaultWorkspaceSession();
  if (!ventureId.trim()) return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V3_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (parsed) {
      const mode = ["work", "system", "releases"].includes(String(parsed.mode)) ? parsed.mode as WorkspaceMode : "work";
      const work = parsed.work && typeof parsed.work === "object" ? parsed.work : fallback.work;
      return {
        ...fallback, ...parsed, mode, railWidth: safeRailWidth(parsed.railWidth),
        context: parsed.context && ["thread", "object", "release", "decision"].includes(parsed.context.kind) && typeof parsed.context.ref === "string" ? parsed.context : null,
        work: { threadRef: typeof work.threadRef === "string" ? work.threadRef : null, stage: work.stage ?? null, railWidth: safeRailWidth(parsed.railWidth ?? work.railWidth), chatScrollByThread: work.chatScrollByThread && typeof work.chatScrollByThread === "object" ? work.chatScrollByThread : {} },
        system: { ...fallback.system, ...(parsed.system ?? {}) }, releases: { ...fallback.releases, ...(parsed.releases ?? {}) }, chatDrawerOpen: Boolean(parsed.chatDrawerOpen),
      };
    }
    const v2 = readThreadSession(ventureId);
    if (v2) return { ...fallback, railWidth: v2.railWidth, context: v2.threadRef ? { kind: "thread", ref: v2.threadRef } : null, work: v2 };
    const legacy = readLegacyWorkspaceRaw(ventureId);
    if (legacy?.mode === "map" && legacy.objectRef) return { ...fallback, mode: "system", context: { kind: "object", ref: legacy.objectRef }, system: { ...fallback.system, selection: legacy.objectRef } };
    return fallback;
  } catch { return fallback; }
}

export function rememberWorkspaceSession(ventureId: string, session: WorkspaceSession) {
  if (!ventureId.trim()) return;
  try { window.localStorage.setItem(`${WORKSPACE_V3_PREFIX}${ventureId}`, JSON.stringify({ ...session, railWidth: safeRailWidth(session.railWidth) })); } catch { /* presentation memory is disposable */ }
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

function readLegacyWorkspaceRaw(ventureId: string): { mode: unknown; objectRef: string | null } | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${WORKSPACE_PREFIX}${ventureId}`) ?? "null") as { mode?: unknown; focus?: { architectureId?: unknown; target?: { architectureId?: unknown } } } | null;
    if (!parsed) return null;
    const raw = parsed.focus?.target?.architectureId ?? parsed.focus?.architectureId;
    return { mode: parsed.mode, objectRef: typeof raw === "string" && raw.trim() ? `object:${raw.replace(/^(?:object|architecture):/, "")}` : null };
  } catch { return null; }
}
