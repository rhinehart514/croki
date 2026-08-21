import {
  createEmptyCrokiContext,
  parseCrokiContext,
  serializeCrokiContext,
  type CrokiContext,
} from "@croki/shared/crokiContext";
import { recoverCrokiContext } from "@croki/shared/crokiContextRecovery";
import { useSyncExternalStore } from "react";

import {
  loadPersistedCrokiCanvasDraft,
  persistCrokiCanvasDraft,
} from "./crokiCanvasDraftPersistence";
import {
  moveThroughCrokiCanvasDraftHistory,
  recordCrokiCanvasDraftChange,
  resetAllCrokiCanvasDraftHistoryForTests,
  resetCrokiCanvasDraftHistory,
  resetCrokiCanvasDraftHistoryAfterSave,
} from "./crokiCanvasDraftHistory";
import { isCrokiContextDirty } from "./crokiCanvasModel";

export type CrokiCanvasSourceState =
  | "loading"
  | "valid"
  | "partial"
  | "missing"
  | "malformed"
  | "read-error";

export interface CrokiCanvasDraftSnapshot {
  readonly context: CrokiContext;
  readonly baseline: CrokiContext;
  readonly baselineContents: string | null;
  readonly conflictContents: string | null;
  readonly dirty: boolean;
  readonly isSaving: boolean;
  readonly modelError: string | null;
  readonly repairConfirmation: boolean;
  readonly repairInProgress: boolean;
  readonly selectedNodeId: string | null;
  readonly sourceMessage: string | null;
  readonly sourceState: CrokiCanvasSourceState;
}

export interface CrokiCanvasDraftSummary {
  readonly dirty: boolean;
  readonly pending: boolean;
  readonly sourceState: CrokiCanvasSourceState;
}

const drafts = new Map<string, CrokiCanvasDraftSnapshot>();
const listeners = new Map<string, Set<() => void>>();

export function makeCrokiCanvasWorkspaceKey(environmentId: string, workspaceRoot: string): string {
  return `${environmentId}\u0000${workspaceRoot}`;
}

export function getCrokiCanvasDraft(key: string, productName = ""): CrokiCanvasDraftSnapshot {
  const existing = drafts.get(key);
  if (existing) return existing;
  const hydrated = hydrateDraft(key) ?? initialDraft(productName);
  drafts.set(key, hydrated);
  return hydrated;
}

export function useCrokiCanvasDraft(key: string, productName: string): CrokiCanvasDraftSnapshot {
  return useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => getCrokiCanvasDraft(key, productName),
    () => getCrokiCanvasDraft(key, productName),
  );
}

export function useCrokiCanvasDraftSummary(key: string, productName = ""): CrokiCanvasDraftSummary {
  const state = useCrokiCanvasDraft(key, productName);
  return {
    dirty: state.dirty,
    pending: state.dirty || state.isSaving,
    sourceState: state.sourceState,
  };
}

export function replaceCrokiCanvasDraft(
  key: string,
  context: CrokiContext,
  modelError: string | null = null,
): void {
  update(key, (state) => {
    if (isCrokiContextDirty(context, state.context)) {
      recordCrokiCanvasDraftChange(key, state.context, context);
    }
    return withDirty({ ...state, context, modelError, repairConfirmation: false });
  });
}

export const undoCrokiCanvasDraft = (key: string): void => restoreHistory(key, "undo");
export const redoCrokiCanvasDraft = (key: string): void => restoreHistory(key, "redo");

export function discardCrokiCanvasDraft(key: string): void {
  const current = getCrokiCanvasDraft(key);
  resetCrokiCanvasDraftHistory(key);
  set(key, {
    ...current,
    context: current.baseline,
    dirty: false,
    modelError: null,
    repairConfirmation: false,
    repairInProgress: false,
    selectedNodeId: selectedNodeStillExists(current.selectedNodeId, current.baseline),
  });
}

export function selectCrokiCanvasNode(key: string, nodeId: string | null): void {
  update(key, (state) => ({ ...state, selectedNodeId: nodeId }));
}

export function setCrokiCanvasSaving(key: string, isSaving: boolean): void {
  update(key, (state) => ({ ...state, isSaving }));
}

export function requestCrokiCanvasRepair(key: string): void {
  update(key, (state) => ({ ...state, repairConfirmation: true }));
}

export function cancelCrokiCanvasRepair(key: string): void {
  update(key, (state) => ({ ...state, repairConfirmation: false }));
}

export function confirmCrokiCanvasRepair(key: string, productName: string): void {
  update(key, (state) => {
    const context =
      state.sourceState === "partial" ? state.context : createEmptyCrokiContext(productName);
    return {
      ...state,
      context,
      conflictContents: null,
      dirty: true,
      modelError: null,
      repairConfirmation: false,
      repairInProgress: true,
      selectedNodeId:
        state.sourceState === "partial"
          ? selectedNodeStillExists(state.selectedNodeId, context)
          : null,
      sourceMessage: null,
    };
  });
}

export function acceptCrokiCanvasFile(key: string, contents: string, productName: string): void {
  let parsed: CrokiContext;
  try {
    parsed = parseCrokiContext(contents);
  } catch (error) {
    try {
      const recovery = recoverCrokiContext(contents);
      if (recovery.issues.length > 0) {
        acceptRecoveredCrokiCanvasFile(
          key,
          contents,
          recovery.context,
          recovery.issues.length,
          productName,
        );
        return;
      }
    } catch {
      // Fall through to the strict source failure.
    }
    acceptSourceFailure(
      key,
      "malformed",
      error instanceof Error ? error.message : "Could not parse product context.",
      contents,
      productName,
    );
    return;
  }
  const current = getCrokiCanvasDraft(key, productName);
  if (contents === current.baselineContents) {
    if (current.sourceState === "valid" && current.sourceMessage === null) return;
    set(key, {
      ...current,
      conflictContents: null,
      sourceMessage: null,
      sourceState: "valid",
    });
    return;
  }
  if (current.dirty) {
    update(key, (state) => ({
      ...state,
      conflictContents: contents,
      sourceMessage: "Canvas changed in the workspace while this draft was open.",
    }));
    return;
  }
  resetCrokiCanvasDraftHistory(key);
  set(key, {
    ...current,
    baseline: parsed,
    baselineContents: contents,
    conflictContents: null,
    context: parsed,
    dirty: false,
    modelError: null,
    repairConfirmation: false,
    repairInProgress: false,
    selectedNodeId: selectedNodeStillExists(current.selectedNodeId, parsed),
    sourceMessage: null,
    sourceState: "valid",
  });
}

export function acceptCrokiCanvasMissing(key: string, productName: string): void {
  const current = getCrokiCanvasDraft(key, productName);
  if (current.sourceState === "missing" && current.baselineContents === null) return;
  if (current.dirty) {
    update(key, (state) => ({
      ...state,
      conflictContents: "",
      sourceMessage: "Canvas was removed from the workspace while this draft was open.",
    }));
    return;
  }
  const empty = createEmptyCrokiContext(productName);
  resetCrokiCanvasDraftHistory(key);
  set(key, {
    ...current,
    baseline: empty,
    baselineContents: null,
    conflictContents: null,
    context: empty,
    dirty: false,
    modelError: null,
    repairConfirmation: false,
    repairInProgress: false,
    selectedNodeId: null,
    sourceMessage: null,
    sourceState: "missing",
  });
}

export function acceptCrokiCanvasReadError(
  key: string,
  message: string,
  productName: string,
): void {
  acceptSourceFailure(key, "read-error", message, null, productName);
}

export function reloadConflictingCrokiCanvasFile(key: string, productName: string): void {
  const current = getCrokiCanvasDraft(key, productName);
  const contents = current.conflictContents;
  if (contents === null) return;
  if (contents === "") {
    resetCrokiCanvasDraftHistory(key);
    set(key, initialDraft(productName, "missing"));
    return;
  }
  let parsed: CrokiContext;
  try {
    parsed = parseCrokiContext(contents);
  } catch {
    try {
      const recovery = recoverCrokiContext(contents);
      if (recovery.issues.length > 0) {
        resetCrokiCanvasDraftHistory(key);
        set(key, recoveredDraft(current, contents, recovery.context, recovery.issues.length));
        return;
      }
    } catch {
      // Keep the malformed workspace state below.
    }
    resetCrokiCanvasDraftHistory(key);
    set(key, {
      ...current,
      baselineContents: contents,
      conflictContents: null,
      context: current.baseline,
      dirty: false,
      repairInProgress: false,
      selectedNodeId: selectedNodeStillExists(current.selectedNodeId, current.baseline),
      sourceMessage: "The workspace Canvas is malformed.",
      sourceState: "malformed",
    });
    return;
  }
  resetCrokiCanvasDraftHistory(key);
  set(key, {
    ...current,
    baseline: parsed,
    baselineContents: contents,
    conflictContents: null,
    context: parsed,
    dirty: false,
    modelError: null,
    repairInProgress: false,
    selectedNodeId: selectedNodeStillExists(current.selectedNodeId, parsed),
    sourceMessage: null,
    sourceState: "valid",
  });
}

function acceptRecoveredCrokiCanvasFile(
  key: string,
  contents: string,
  recovered: CrokiContext,
  issueCount: number,
  productName: string,
): void {
  const current = getCrokiCanvasDraft(key, productName);
  if (contents === current.baselineContents) {
    if (current.sourceState === "partial") return;
    set(key, recoveredDraft(current, contents, recovered, issueCount));
    return;
  }
  if (current.dirty) {
    update(key, (state) => ({
      ...state,
      conflictContents: contents,
      sourceMessage: recoveredSourceMessage(issueCount),
      sourceState: "partial",
    }));
    return;
  }
  resetCrokiCanvasDraftHistory(key);
  set(key, recoveredDraft(current, contents, recovered, issueCount));
}

function recoveredDraft(
  current: CrokiCanvasDraftSnapshot,
  contents: string,
  recovered: CrokiContext,
  issueCount: number,
): CrokiCanvasDraftSnapshot {
  return {
    ...current,
    baseline: recovered,
    baselineContents: contents,
    conflictContents: null,
    context: recovered,
    dirty: false,
    modelError: null,
    repairConfirmation: false,
    repairInProgress: false,
    selectedNodeId: selectedNodeStillExists(current.selectedNodeId, recovered),
    sourceMessage: recoveredSourceMessage(issueCount),
    sourceState: "partial",
  };
}

const recoveredSourceMessage = (issueCount: number): string =>
  `${issueCount} invalid Canvas entr${issueCount === 1 ? "y was" : "ies were"} omitted. Valid items are preserved.`;

export function markCrokiCanvasSaved(
  key: string,
  context: CrokiContext,
  contents = serializeCrokiContext(context),
): void {
  update(key, (state) => {
    const hasNewerEdits = isCrokiContextDirty(state.context, context);
    resetCrokiCanvasDraftHistoryAfterSave(key, context, state.context, hasNewerEdits);
    return {
      ...state,
      baseline: context,
      baselineContents: contents,
      conflictContents: null,
      context: hasNewerEdits ? state.context : context,
      dirty: hasNewerEdits,
      isSaving: false,
      modelError: null,
      repairInProgress: false,
      sourceMessage: null,
      sourceState: "valid",
    };
  });
}

function acceptSourceFailure(
  key: string,
  sourceState: "malformed" | "read-error",
  sourceMessage: string,
  contents: string | null,
  productName: string,
): void {
  const current = getCrokiCanvasDraft(key, productName);
  if (contents === current.baselineContents) {
    update(key, (state) => ({ ...state, sourceMessage, sourceState }));
    return;
  }
  if (current.dirty) {
    update(key, (state) => ({
      ...state,
      conflictContents: contents,
      sourceMessage,
      sourceState,
    }));
    return;
  }
  resetCrokiCanvasDraftHistory(key);
  set(key, {
    ...current,
    baselineContents: contents,
    conflictContents: null,
    sourceMessage,
    sourceState,
  });
}

function initialDraft(
  productName: string,
  sourceState: CrokiCanvasSourceState = "loading",
): CrokiCanvasDraftSnapshot {
  const context = createEmptyCrokiContext(productName);
  return {
    context,
    baseline: context,
    baselineContents: null,
    conflictContents: null,
    dirty: false,
    isSaving: false,
    modelError: null,
    repairConfirmation: false,
    repairInProgress: false,
    selectedNodeId: null,
    sourceMessage: null,
    sourceState,
  };
}

function withDirty(state: CrokiCanvasDraftSnapshot): CrokiCanvasDraftSnapshot {
  return {
    ...state,
    dirty: state.repairInProgress || isCrokiContextDirty(state.context, state.baseline),
  };
}

const selectedNodeStillExists = (
  selectedNodeId: string | null,
  context: CrokiContext,
): string | null =>
  context.nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : null;

function subscribe(key: string, listener: () => void): () => void {
  const keyListeners = listeners.get(key) ?? new Set();
  keyListeners.add(listener);
  listeners.set(key, keyListeners);
  return () => {
    keyListeners.delete(listener);
    if (keyListeners.size === 0) listeners.delete(key);
  };
}

function restoreHistory(key: string, direction: "undo" | "redo"): void {
  const current = getCrokiCanvasDraft(key);
  const context = moveThroughCrokiCanvasDraftHistory(key, direction);
  if (!context) return;
  set(
    key,
    withDirty({
      ...current,
      context,
      modelError: null,
      repairConfirmation: false,
      selectedNodeId: selectedNodeStillExists(current.selectedNodeId, context),
    }),
  );
}

function update(
  key: string,
  updater: (state: CrokiCanvasDraftSnapshot) => CrokiCanvasDraftSnapshot,
): void {
  const current = getCrokiCanvasDraft(key);
  set(key, updater(current));
}

function set(key: string, state: CrokiCanvasDraftSnapshot): void {
  drafts.set(key, state);
  persistCrokiCanvasDraft(key, state);
  for (const listener of listeners.get(key) ?? []) listener();
}

function hydrateDraft(key: string): CrokiCanvasDraftSnapshot | null {
  const persisted = loadPersistedCrokiCanvasDraft(key);
  if (!persisted) return null;
  return {
    ...initialDraft(persisted.context.product, persisted.sourceState),
    ...persisted,
    dirty: true,
  };
}

export function resetCrokiCanvasDraftStoreForTests(): void {
  drafts.clear();
  resetAllCrokiCanvasDraftHistoryForTests();
  listeners.clear();
}
