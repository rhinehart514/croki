const ACTIVE_VENTURE_KEY = "drover:active-venture:v1";
const WORKSPACE_PREFIX = "drover:workspace-session:v1:";
const THREAD_PREFIX = "drover:thread-session:v2:";
const WORKSPACE_V3_PREFIX = "drover:workspace-session:v3:";
const WORKSPACE_V4_PREFIX = "drover:workspace-session:v4:";
const WORKSPACE_V5_PREFIX = "drover:workspace-session:v5:";
const WORKSPACE_V6_PREFIX = "drover:workspace-session:v6:";

export type WorkspaceMode = "work" | "system" | "releases";
export type ProductWorkspaceSection = "canvas" | "releases";
export type WorkspaceSession = {
  mode: WorkspaceMode;
  productSection: ProductWorkspaceSection;
  railWidth: number;
  contextualChatOpen: boolean;
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
    productSection: "canvas",
    railWidth: 272,
    contextualChatOpen: false,
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
    const current = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V6_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (current) {
      return {
        mode: current.mode === "work" ? "work" : "system",
        productSection: current.mode === "releases" || current.productSection === "releases" ? "releases" : "canvas",
        railWidth: safeRailWidth(current.railWidth),
        contextualChatOpen: current.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(current.selectedThreadRef),
        selectedObjectRef: stringOrNull(current.selectedObjectRef),
        selectedReleaseId: stringOrNull(current.selectedReleaseId),
        systemScope: scopeOrDefault(current.systemScope),
        systemCamera: cameraOrNull(current.systemCamera),
        chatScrollByThread: current.chatScrollByThread && typeof current.chatScrollByThread === "object" ? current.chatScrollByThread : {},
      };
    }
    const parsed = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V5_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (parsed) {
      const legacyMode = ["work", "system", "releases"].includes(String(parsed.mode)) ? parsed.mode as WorkspaceMode : "work";
      return {
        mode: legacyMode === "work" ? "work" : "system",
        productSection: legacyMode === "releases" ? "releases" : "canvas",
        railWidth: safeRailWidth(parsed.railWidth),
        contextualChatOpen: parsed.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(parsed.selectedThreadRef),
        selectedObjectRef: stringOrNull(parsed.selectedObjectRef),
        selectedReleaseId: stringOrNull(parsed.selectedReleaseId),
        systemScope: scopeOrDefault(parsed.systemScope),
        systemCamera: cameraOrNull(parsed.systemCamera),
        chatScrollByThread: parsed.chatScrollByThread && typeof parsed.chatScrollByThread === "object" ? parsed.chatScrollByThread : {},
      };
    }
    const v4 = JSON.parse(window.localStorage.getItem(`${WORKSPACE_V4_PREFIX}${ventureId}`) ?? "null") as Partial<WorkspaceSession> | null;
    if (v4) {
      return {
        mode: v4.mode === "work" ? "work" : "system",
        productSection: v4.mode === "releases" ? "releases" : "canvas",
        railWidth: safeRailWidth(v4.railWidth),
        contextualChatOpen: v4.contextualChatOpen === true,
        selectedThreadRef: stringOrNull(v4.selectedThreadRef),
        selectedObjectRef: stringOrNull(v4.selectedObjectRef),
        selectedReleaseId: stringOrNull(v4.selectedReleaseId),
        systemScope: scopeOrDefault(v4.systemScope),
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
        mode: v3.mode === "work" ? "work" : "system",
        productSection: v3.mode === "releases" ? "releases" : "canvas",
        railWidth: safeRailWidth(v3.railWidth ?? v3.work?.railWidth),
        contextualChatOpen: false,
        selectedThreadRef: stringOrNull(v3.work?.threadRef) ?? (contextKind === "thread" ? contextRef : null),
        selectedObjectRef: stringOrNull(v3.system?.selection) ?? (contextKind === "object" ? contextRef : null),
        selectedReleaseId: stringOrNull(v3.releases?.selection) ?? (contextKind === "release" ? contextRef?.replace(/^object:/, "") ?? null : null),
        systemScope: scopeOrDefault(v3.system?.scope),
        systemCamera: null,
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
  try { window.localStorage.setItem(`${WORKSPACE_V6_PREFIX}${ventureId}`, JSON.stringify({ ...session, railWidth: safeRailWidth(session.railWidth) })); } catch { /* presentation memory is disposable */ }
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
