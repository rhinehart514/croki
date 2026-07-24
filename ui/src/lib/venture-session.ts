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
const WORKSPACE_V13_PREFIX = "drover:workspace-session:v13:";

// The one-shell session. Conversation is always present; the Canvas is a collapsible panel beside it,
// so a single `canvasOpen` boolean replaces the retired two-surface `mode` and its contextual-chat flag.
export type WorkspaceSession = {
  railWidth: number;
  canvasOpen: boolean;
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
    railWidth: 272,
    canvasOpen: false,
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

function scrollsOrEmpty(value: unknown): Record<string, number> {
  return value && typeof value === "object" ? value as Record<string, number> : {};
}

// Every superseded two-surface record carried a `mode` and a `contextualChatOpen`. In the one shell the
// Canvas is open when either the founder was last on the retired Product / GTM surface or its contextual
// chat was open. `defaultMode` differs across the chain because early records defaulted to the map.
type LegacyWorkspaceRecord = {
  mode?: unknown; contextualChatOpen?: unknown; railWidth?: unknown;
  selectedThreadRef?: unknown; selectedObjectRef?: unknown; systemCamera?: unknown; chatScrollByThread?: unknown;
};

function readLegacyWorkspace(
  ventureId: string, prefix: string,
  options: { defaultMode: "work" | "product-gtm"; keepCamera: boolean },
): WorkspaceSession | null {
  const raw = JSON.parse(window.localStorage.getItem(`${prefix}${ventureId}`) ?? "null") as LegacyWorkspaceRecord | null;
  if (!raw) return null;
  const mode = options.defaultMode === "work"
    ? (raw.mode === "product-gtm" ? "product-gtm" : "work")
    : (raw.mode === "work" ? "work" : "product-gtm");
  return {
    railWidth: safeRailWidth(raw.railWidth),
    canvasOpen: mode === "product-gtm" || raw.contextualChatOpen === true,
    selectedThreadRef: stringOrNull(raw.selectedThreadRef),
    selectedObjectRef: stringOrNull(raw.selectedObjectRef),
    systemCamera: options.keepCamera ? cameraOrNull(raw.systemCamera) : null,
    chatScrollByThread: scrollsOrEmpty(raw.chatScrollByThread),
  };
}

export function readWorkspaceSession(ventureId: string): WorkspaceSession {
  const fallback = defaultWorkspaceSession();
  if (!ventureId.trim()) return fallback;
  try {
    const v13 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V13_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (v13) {
      return {
        railWidth: safeRailWidth(v13.railWidth),
        canvasOpen: v13.canvasOpen === true,
        selectedThreadRef: stringOrNull(v13.selectedThreadRef),
        selectedObjectRef: stringOrNull(v13.selectedObjectRef),
        systemCamera: cameraOrNull(v13.systemCamera),
        chatScrollByThread: scrollsOrEmpty(v13.chatScrollByThread),
      };
    }
    // v12→v13 keeps the camera; the earlier records reset the superseded canvas camera as before.
    const v12 = readLegacyWorkspace(ventureId, WORKSPACE_V12_PREFIX, { defaultMode: "work", keepCamera: true });
    if (v12) return v12;
    for (const prefix of [WORKSPACE_V11_PREFIX, WORKSPACE_V10_PREFIX, WORKSPACE_V9_PREFIX, WORKSPACE_V8_PREFIX, WORKSPACE_V7_PREFIX]) {
      const parsed = readLegacyWorkspace(ventureId, prefix, { defaultMode: "work", keepCamera: false });
      if (parsed) return parsed;
    }
    const v6 = readLegacyWorkspace(ventureId, WORKSPACE_V6_PREFIX, { defaultMode: "product-gtm", keepCamera: true });
    if (v6) return v6;
    const v5 = readLegacyWorkspace(ventureId, WORKSPACE_V5_PREFIX, { defaultMode: "product-gtm", keepCamera: true });
    if (v5) return v5;
    const v4 = readLegacyWorkspace(ventureId, WORKSPACE_V4_PREFIX, { defaultMode: "product-gtm", keepCamera: false });
    if (v4) return v4;
    const v3 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V3_PREFIX}${ventureId}`) ?? "null") as {
      mode?: unknown; railWidth?: unknown; context?: { kind?: unknown; ref?: unknown };
      work?: Partial<ThreadSession>; system?: { scope?: unknown; selection?: unknown; camera?: unknown };
      releases?: { selection?: unknown };
    } | null;
    if (v3) {
      const contextRef = stringOrNull(v3.context?.ref);
      const contextKind = String(v3.context?.kind ?? "");
      const mode = v3.mode === "work" ? "work" : "product-gtm";
      return {
        railWidth: safeRailWidth(v3.railWidth ?? v3.work?.railWidth),
        canvasOpen: mode === "product-gtm",
        selectedThreadRef: stringOrNull(v3.work?.threadRef) ?? (contextKind === "thread" ? contextRef : null),
        selectedObjectRef: stringOrNull(v3.system?.selection) ?? (contextKind === "object" ? contextRef : null),
        systemCamera: null,
        chatScrollByThread: v3.work?.chatScrollByThread && typeof v3.work.chatScrollByThread === "object" ? v3.work.chatScrollByThread : {},
      };
    }
    const v2 = readThreadSession(ventureId);
    if (v2) return { ...fallback, railWidth: v2.railWidth, selectedThreadRef: v2.threadRef, chatScrollByThread: v2.chatScrollByThread };
    const legacy = readLegacyWorkspaceRaw(ventureId);
    if (legacy?.mode === "map" && legacy.objectRef) return { ...fallback, canvasOpen: true, selectedObjectRef: legacy.objectRef };
    return fallback;
  } catch { return fallback; }
}

export function rememberWorkspaceSession(ventureId: string, session: WorkspaceSession) {
  if (!ventureId.trim()) return;
  try { window.localStorage.setItem(`${WORKSPACE_V13_PREFIX}${ventureId}`, JSON.stringify({ ...session, railWidth: safeRailWidth(session.railWidth) })); } catch { /* presentation memory is disposable */ }
}

const WORKBENCH_PREFIX = "drover:work-workbench:v1:";

export const WORKBENCH_MIN_WIDTH = 480;
export const WORKBENCH_MAX_WIDTH = 960;

// width null means "the default split" — an explicit pixel width exists only after the founder drags.
export type WorkbenchSession = { open: boolean; width: number | null };

export function safeWorkbenchWidth(value: unknown): number | null {
  const width = Number(value);
  return Number.isFinite(width) && width > 0
    ? Math.min(WORKBENCH_MAX_WIDTH, Math.max(WORKBENCH_MIN_WIDTH, Math.round(width)))
    : null;
}

export function readWorkbenchSession(ventureId: string): WorkbenchSession {
  const fallback: WorkbenchSession = { open: true, width: null };
  if (!ventureId.trim()) return fallback;
  try {
    const current = JSON.parse(window.localStorage.getItem(`${WORKBENCH_PREFIX}${ventureId}`) ?? "null") as Partial<WorkbenchSession> | null;
    return current ? { open: current.open !== false, width: safeWorkbenchWidth(current.width) } : fallback;
  } catch { return fallback; }
}

export function rememberWorkbenchSession(ventureId: string, session: WorkbenchSession) {
  if (!ventureId.trim()) return;
  try { window.localStorage.setItem(`${WORKBENCH_PREFIX}${ventureId}`, JSON.stringify({ open: session.open, width: safeWorkbenchWidth(session.width) })); } catch { /* presentation memory is disposable */ }
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
