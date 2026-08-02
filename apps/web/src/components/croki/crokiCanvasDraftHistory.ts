import type { CrokiContext } from "@croki/shared/crokiContext";

interface CrokiCanvasDraftHistory {
  readonly entries: readonly CrokiContext[];
  readonly index: number;
}

const MAX_HISTORY_LENGTH = 100;
const histories = new Map<string, CrokiCanvasDraftHistory>();

export function recordCrokiCanvasDraftChange(
  key: string,
  current: CrokiContext,
  next: CrokiContext,
): void {
  const history = histories.get(key) ?? { entries: [current], index: 0 };
  const entries = [...history.entries.slice(0, history.index + 1), next].slice(-MAX_HISTORY_LENGTH);
  histories.set(key, { entries, index: entries.length - 1 });
}

export function canUndoCrokiCanvasDraft(key: string): boolean {
  return (histories.get(key)?.index ?? 0) > 0;
}

export function canRedoCrokiCanvasDraft(key: string): boolean {
  const history = histories.get(key);
  return history ? history.index < history.entries.length - 1 : false;
}

export function moveThroughCrokiCanvasDraftHistory(
  key: string,
  direction: "undo" | "redo",
): CrokiContext | null {
  const history = histories.get(key);
  if (!history) return null;
  const index = history.index + (direction === "undo" ? -1 : 1);
  const context = history.entries[index];
  if (!context) return null;
  histories.set(key, { ...history, index });
  return context;
}

export function resetCrokiCanvasDraftHistory(key: string): void {
  histories.delete(key);
}

export function resetCrokiCanvasDraftHistoryAfterSave(
  key: string,
  saved: CrokiContext,
  current: CrokiContext,
  hasNewerEdits: boolean,
): void {
  if (hasNewerEdits) histories.set(key, { entries: [saved, current], index: 1 });
  else resetCrokiCanvasDraftHistory(key);
}

export function resetAllCrokiCanvasDraftHistoryForTests(): void {
  histories.clear();
}
