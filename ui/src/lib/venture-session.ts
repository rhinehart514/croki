const ACTIVE_VENTURE_KEY = "drover:active-venture:v1";
const WORKSPACE_PREFIX = "drover:workspace-session:v1:";
const THREAD_PREFIX = "drover:thread-session:v2:";
const WORKSPACE_V3_PREFIX = "drover:workspace-session:v3:";
const WORKSPACE_V4_PREFIX = "drover:workspace-session:v4:";
const WORKSPACE_V5_PREFIX = "drover:workspace-session:v5:";
const WORKSPACE_V6_PREFIX = "drover:workspace-session:v6:";
const WORKSPACE_V7_PREFIX = "drover:workspace-session:v7:";
const WORKSPACE_V8_PREFIX = "drover:workspace-session:v8:";
const WORKSPACE_V9_PREFIX = "drover:workspace-session:v9:";
const WORKSPACE_V10_PREFIX = "drover:workspace-session:v10:";
const WORKSPACE_V11_PREFIX = "drover:workspace-session:v11:";
const WORKSPACE_V12_PREFIX = "drover:workspace-session:v12:";

export type WorkspaceMode = "work" | "product-gtm";
export type WorkspaceSession = {
  mode: WorkspaceMode;
  railWidth: number;
  contextualChatOpen: boolean;
  selectedThreadRef: string | null;
  selectedObjectRef: string | null;
  systemCamera: { x: number; y: number; zoom: number } | null;
  chatScrollByThread: Record<string, number>;
};

export type ThreadSessionVisual = {
  kind: "preview" | "diff" | "flow" | "model-view" | "comparison" | "map" | "evidence" | "consequence";
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
  return Number.isFinite(width) ? Math.min(360, Math.max(272, width)) : 272;
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
    return legacy ? { threadRef, stage: null, railWidth: 272, chatScrollByThread: {} } : null;
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
    railWidth: 272,
    contextualChatOpen: false,
    selectedThreadRef: null,
    selectedObjectRef: null,
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

export function readWorkspaceSession(ventureId: string): WorkspaceSession {
  const fallback = defaultWorkspaceSession();
  if (!ventureId.trim()) return fallback;
  try {
    const current = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V12_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (current) {
      return {
        mode: current.mode === "product-gtm" ? "product-gtm" : "work",
        railWidth: safeRailWidth(current.railWidth),
        contextualChatOpen: current.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(current.selectedThreadRef),
        selectedObjectRef: stringOrNull(current.selectedObjectRef),
        systemCamera: cameraOrNull(current.systemCamera),
        chatScrollByThread: current.chatScrollByThread && typeof current.chatScrollByThread === "object" ? current.chatScrollByThread : {},
      };
    }
    const v11 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V11_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (v11) {
      return {
        mode: v11.mode === "product-gtm" ? "product-gtm" : "work",
        railWidth: safeRailWidth(v11.railWidth),
        contextualChatOpen: v11.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(v11.selectedThreadRef),
        selectedObjectRef: stringOrNull(v11.selectedObjectRef),
        systemCamera: null,
        chatScrollByThread: v11.chatScrollByThread && typeof v11.chatScrollByThread === "object" ? v11.chatScrollByThread : {},
      };
    }
    const v10 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V10_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (v10) {
      return {
        mode: v10.mode === "product-gtm" ? "product-gtm" : "work",
        railWidth: safeRailWidth(v10.railWidth),
        contextualChatOpen: v10.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(v10.selectedThreadRef),
        selectedObjectRef: stringOrNull(v10.selectedObjectRef),
        systemCamera: null,
        chatScrollByThread: v10.chatScrollByThread && typeof v10.chatScrollByThread === "object" ? v10.chatScrollByThread : {},
      };
    }
    const v9 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V9_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (v9) {
      return {
        mode: v9.mode === "product-gtm" ? "product-gtm" : "work",
        railWidth: safeRailWidth(v9.railWidth),
        contextualChatOpen: v9.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(v9.selectedThreadRef),
        selectedObjectRef: stringOrNull(v9.selectedObjectRef),
        systemCamera: null,
        chatScrollByThread: v9.chatScrollByThread && typeof v9.chatScrollByThread === "object" ? v9.chatScrollByThread : {},
      };
    }
    const v8 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V8_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (v8) {
      return {
        mode: v8.mode === "product-gtm" ? "product-gtm" : "work",
        railWidth: safeRailWidth(v8.railWidth),
        contextualChatOpen: v8.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(v8.selectedThreadRef),
        selectedObjectRef: stringOrNull(v8.selectedObjectRef),
        systemCamera: null,
        chatScrollByThread: v8.chatScrollByThread && typeof v8.chatScrollByThread === "object" ? v8.chatScrollByThread : {},
      };
    }
    const v7 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V7_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (v7) {
      return {
        mode: v7.mode === "product-gtm" ? "product-gtm" : "work",
        railWidth: safeRailWidth(v7.railWidth),
        contextualChatOpen: v7.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(v7.selectedThreadRef),
        selectedObjectRef: stringOrNull(v7.selectedObjectRef),
        systemCamera: null,
        chatScrollByThread: v7.chatScrollByThread && typeof v7.chatScrollByThread === "object" ? v7.chatScrollByThread : {},
      };
    }
    const v6 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V6_PREFIX}${ventureId}`) ?? "null") as (Partial<WorkspaceSession> & { mode?: unknown }) | null;
    if (v6) {
      return {
        mode: v6.mode === "work" ? "work" : "product-gtm",
        railWidth: safeRailWidth(v6.railWidth),
        contextualChatOpen: v6.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(v6.selectedThreadRef),
        selectedObjectRef: stringOrNull(v6.selectedObjectRef),
        systemCamera: cameraOrNull(v6.systemCamera),
        chatScrollByThread: v6.chatScrollByThread && typeof v6.chatScrollByThread === "object" ? v6.chatScrollByThread : {},
      };
    }
    const parsed = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V5_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (parsed) {
      return {
        mode: parsed.mode === "work" ? "work" : "product-gtm",
        railWidth: safeRailWidth(parsed.railWidth),
        contextualChatOpen: parsed.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(parsed.selectedThreadRef),
        selectedObjectRef: stringOrNull(parsed.selectedObjectRef),
        systemCamera: cameraOrNull(parsed.systemCamera),
        chatScrollByThread: parsed.chatScrollByThread && typeof parsed.chatScrollByThread === "object" ? parsed.chatScrollByThread : {},
      };
    }
    const v4 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V4_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (v4) {
      return {
        mode: v4.mode === "work" ? "work" : "product-gtm",
        railWidth: safeRailWidth(v4.railWidth),
        contextualChatOpen: v4.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(v4.selectedThreadRef),
        selectedObjectRef: stringOrNull(v4.selectedObjectRef),
        systemCamera: null,
        chatScrollByThread: v4.chatScrollByThread && typeof v4.chatScrollByThread === "object" ? v4.chatScrollByThread : {},
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
        mode: v3.mode === "work" ? "work" : "product-gtm",
        railWidth: safeRailWidth(v3.railWidth ?? v3.work?.railWidth),
        contextualChatOpen: false,
        selectedThreadRef: stringOrNull(v3.work?.threadRef) ?? (contextKind === "thread" ? contextRef : null),
        selectedObjectRef: stringOrNull(v3.system?.selection) ?? (contextKind === "object" ? contextRef : null),
        systemCamera: null,
        chatScrollByThread: v3.work?.chatScrollByThread && typeof v3.work.chatScrollByThread === "object" ? v3.work.chatScrollByThread : {},
      };
    }
    const v2 = readThreadSession(ventureId);
    if (v2) return { ...fallback, railWidth: v2.railWidth, selectedThreadRef: v2.threadRef, chatScrollByThread: v2.chatScrollByThread };
    const legacy = readLegacyWorkspaceRaw(ventureId);
    if (legacy?.mode === "map" && legacy.objectRef) return { ...fallback, mode: "product-gtm", selectedObjectRef: legacy.objectRef };
    return fallback;
  } catch { return fallback; }
}

export function rememberWorkspaceSession(ventureId: string, session: WorkspaceSession) {
  if (!ventureId.trim()) return;
  try { window.localStorage.setItem(`${WORKSPACE_V12_PREFIX}${ventureId}`, JSON.stringify({ ...session, railWidth: safeRailWidth(session.railWidth) })); } catch { /* presentation memory is disposable */ }
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
