import { parseCrokiContext, type CrokiContext } from "@t3tools/shared/crokiContext";

import type { CrokiCanvasDraftSnapshot, CrokiCanvasSourceState } from "./crokiCanvasDraftStore";

const STORAGE_PREFIX = "croki:canvas-draft:v1:";

export interface CrokiCanvasPersistedDraft {
  readonly context: CrokiContext;
  readonly baseline: CrokiContext;
  readonly baselineContents: string | null;
  readonly repairInProgress: boolean;
  readonly sourceState: CrokiCanvasSourceState;
}

export function persistCrokiCanvasDraft(key: string, state: CrokiCanvasDraftSnapshot): void {
  const storage = getStorage();
  if (!storage) return;
  const storageKey = `${STORAGE_PREFIX}${encodeURIComponent(key)}`;
  try {
    if (!state.dirty) {
      storage.removeItem(storageKey);
      return;
    }
    const persisted: CrokiCanvasPersistedDraft = {
      context: state.context,
      baseline: state.baseline,
      baselineContents: state.baselineContents,
      repairInProgress: state.repairInProgress,
      sourceState: state.sourceState,
    };
    storage.setItem(storageKey, JSON.stringify(persisted));
  } catch {
    // In-memory drafts remain available when browser storage is blocked or full.
  }
}

export function loadPersistedCrokiCanvasDraft(key: string): CrokiCanvasPersistedDraft | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const value = storage.getItem(`${STORAGE_PREFIX}${encodeURIComponent(key)}`);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<CrokiCanvasPersistedDraft>;
    const context = parsePersistedContext(parsed.context);
    const baseline = parsePersistedContext(parsed.baseline);
    if (!context || !baseline) return null;
    return {
      context,
      baseline,
      baselineContents:
        typeof parsed.baselineContents === "string" ? parsed.baselineContents : null,
      repairInProgress: parsed.repairInProgress === true,
      sourceState: parsed.sourceState ?? "loading",
    };
  } catch {
    return null;
  }
}

function parsePersistedContext(value: unknown): CrokiContext | null {
  try {
    return parseCrokiContext(JSON.stringify(value));
  } catch {
    return null;
  }
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
