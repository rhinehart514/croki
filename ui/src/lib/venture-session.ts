const ACTIVE_VENTURE_KEY = "drover:active-venture:v1";
const WORKSPACE_PREFIX = "drover:workspace-session:v1:";
const THREAD_PREFIX = "drover:thread-session:v2:";
const WORKSPACE_V3_PREFIX = "drover:workspace-session:v3:";
const WORKSPACE_V4_PREFIX = "drover:workspace-session:v4:";

export type WorkspaceMode = "work" | "system" | "releases";
export type WorkspaceSession = {
  mode: WorkspaceMode;
  railWidth: number;
  selectedThreadRef: string | null;
  selectedObjectRef: string | null;
  selectedReleaseId: string | null;
  systemScope: "system" | "product" | "gtm" | "attention";
  systemCamera: { x: number; y: number; zoom: number } | null;
  chatScrollByThread: Record<string, number>;
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
    mode: "work",
    railWidth: 240,
    selectedThreadRef: null,
    selectedObjectRef: null,
    selectedReleaseId: null,
    systemScope: "system",
    systemCamera: null,
    chatScrollByThread: {},
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function cameraOrNull(value: unknown): WorkspaceSession["systemCamera"] {
  if (!value || typeof value !== "object") return null;
  const camera = value as Record<string, unknown>;
  return [camera.x, camera.y, camera.zoom].every((entry) => Number.isFinite(Number(entry)))
    ? { x: Number(camera.x), y: Number(camera.y), zoom: Number(camera.zoom) }
    : null;
}

function scopeOrDefault(value: unknown): WorkspaceSession["systemScope"] {
  return ["system", "product", "gtm", "attention"].includes(String(value))
    ? value as WorkspaceSession["systemScope"]
    : "system";
}

export function readWorkspaceSession(ventureId: string): WorkspaceSession {
  const fallback = defaultWorkspaceSession();
  if (!ventureId.trim()) return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V4_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (parsed) {
      const mode = ["work", "system", "releases"].includes(String(parsed.mode)) ? parsed.mode as WorkspaceMode : "work";
      return {
        mode,
        railWidth: safeRailWidth(parsed.railWidth),
        selectedThreadRef: stringOrNull(parsed.selectedThreadRef),
        selectedObjectRef: stringOrNull(parsed.selectedObjectRef),
        selectedReleaseId: stringOrNull(parsed.selectedReleaseId),
        systemScope: scopeOrDefault(parsed.systemScope),
        systemCamera: cameraOrNull(parsed.systemCamera),
        chatScrollByThread: parsed.chatScrollByThread && typeof parsed.chatScrollByThread === "object" ? parsed.chatScrollByThread : {},
      };
    }
    const v3 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V3_PREFIX}${ventureId}`) ?? "null") as {
      mode?: unknown; railWidth?: unknown; context?: { kind?: unknown; ref?: unknown };
      work?: Partial<ThreadSession>; system?: { scope?: unknown; selection?: unknown; camera?: unknown };
      releases?: { selection?: unknown };
    } | null;
    if (v3) {
      const contextRef = stringOrNull(v3.context?.ref);
      const contextKind = String(v3.context?.kind ?? "");
      return {
        mode: ["work", "system", "releases"].includes(String(v3.mode)) ? v3.mode as WorkspaceMode : "work",
        railWidth: safeRailWidth(v3.railWidth ?? v3.work?.railWidth),
        selectedThreadRef: stringOrNull(v3.work?.threadRef) ?? (contextKind === "thread" ? contextRef : null),
        selectedObjectRef: stringOrNull(v3.system?.selection) ?? (contextKind === "object" ? contextRef : null),
        selectedReleaseId: stringOrNull(v3.releases?.selection) ?? (contextKind === "release" ? contextRef?.replace(/^object:/, "") ?? null : null),
        systemScope: scopeOrDefault(v3.system?.scope),
        systemCamera: cameraOrNull(v3.system?.camera),
        chatScrollByThread: v3.work?.chatScrollByThread && typeof v3.work.chatScrollByThread === "object" ? v3.work.chatScrollByThread : {},
      };
    }
    const v2 = readThreadSession(ventureId);
    if (v2) return { ...fallback, railWidth: v2.railWidth, selectedThreadRef: v2.threadRef, chatScrollByThread: v2.chatScrollByThread };
    const legacy = readLegacyWorkspaceRaw(ventureId);
    if (legacy?.mode === "map" && legacy.objectRef) return { ...fallback, mode: "system", selectedObjectRef: legacy.objectRef };
    return fallback;
  } catch { return fallback; }
}

export function rememberWorkspaceSession(ventureId: string, session: WorkspaceSession) {
  if (!ventureId.trim()) return;
  try { window.localStorage.setItem(`${WORKSPACE_V4_PREFIX}${ventureId}`, JSON.stringify({ ...session, railWidth: safeRailWidth(session.railWidth) })); } catch { /* presentation memory is disposable */ }
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
