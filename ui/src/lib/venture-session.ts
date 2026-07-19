import { normalizeDirectionTarget } from "@/components/firm/directionTarget";
import type { WorkspaceFocus } from "@/components/workspace/workspaceFocus";

const ACTIVE_VENTURE_KEY = "drover:active-venture:v1";
const WORKSPACE_PREFIX = "drover:workspace-session:v1:";

export type WorkspaceSession = {
  mode: "work" | "map";
  focus: WorkspaceFocus;
};

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

export function readWorkspaceSession(ventureId: string): WorkspaceSession | null {
  if (!ventureId.trim()) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${WORKSPACE_PREFIX}${ventureId}`) ?? "null") as {
      mode?: unknown;
      focus?: { directionId?: unknown; target?: unknown };
    } | null;
    if (!parsed || (parsed.mode !== "work" && parsed.mode !== "map")) return null;
    const directionId = typeof parsed.focus?.directionId === "string" && parsed.focus.directionId.trim()
      ? parsed.focus.directionId
      : null;
    const target = parsed.focus?.target && typeof parsed.focus.target === "object"
      ? normalizeDirectionTarget(parsed.focus.target)
      : null;
    return { mode: parsed.mode, focus: { directionId, target } };
  } catch {
    return null;
  }
}

export function rememberWorkspaceSession(ventureId: string, session: WorkspaceSession) {
  if (!ventureId.trim()) return;
  try {
    window.localStorage.setItem(`${WORKSPACE_PREFIX}${ventureId}`, JSON.stringify(session));
  } catch {
    // Scope and mode are recoverable presentation state, never venture truth.
  }
}
