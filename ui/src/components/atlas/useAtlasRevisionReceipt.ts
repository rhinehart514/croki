import { useCallback, useState } from "react";
import type { ArchitectureMutationOperation } from "@/api";
import type { ArchitectureMutationReceipt } from "./useArchitectureMutation";

const RECEIPT_TTL_MS = 30 * 60 * 1_000;

export type AtlasUndoReceipt = {
  operations: ArchitectureMutationOperation[];
  reason: string;
};

type StoredReceipt = {
  receipt: ArchitectureMutationReceipt;
  undo: AtlasUndoReceipt | null;
  shownAt: number;
};

function storageKey(ventureId: string) {
  return `drover:atlas-revision-receipt:${ventureId}`;
}

function readReceipt(ventureId: string): StoredReceipt | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(storageKey(ventureId)) ?? "null") as StoredReceipt | null;
    if (!stored || Date.now() - stored.shownAt > RECEIPT_TTL_MS) return null;
    return stored;
  } catch { return null; }
}

export function useAtlasRevisionReceipt(ventureId: string) {
  const [value, setValue] = useState<StoredReceipt | null>(() => readReceipt(ventureId));
  const keep = useCallback((receipt: ArchitectureMutationReceipt, undo: AtlasUndoReceipt | null) => {
    const next = { receipt, undo, shownAt: Date.now() };
    window.sessionStorage.setItem(storageKey(ventureId), JSON.stringify(next));
    setValue(next);
  }, [ventureId]);
  const clear = useCallback(() => {
    window.sessionStorage.removeItem(storageKey(ventureId));
    setValue(null);
  }, [ventureId]);
  return { value, keep, clear };
}
