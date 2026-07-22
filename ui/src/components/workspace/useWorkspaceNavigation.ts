import { useCallback, useEffect } from "react";
import {
  markWorkIndexReviewed,
  type SystemIndex,
  type SystemIndexObject,
  type WorkIndex,
  type WorkIndexItem,
} from "@/api";
import type { WorkspaceMode } from "@/lib/venture-session";
import { latestLinkedThread } from "./useWorkspaceConversation";

const MODE_ORDER: Record<WorkspaceMode, number> = { work: 0, "product-gtm": 1 };

export function useWorkspaceNavigation({
  ventureId, mode, reducedMotion, resolvedThreadRef, workIndex, systemIndex,
  systemSelection, selectedObject, readOnly, openerRef, contextualChatOpen, stage,
  openThread, beginScopedThread, newThread, refresh, setWorkIndex, setMode, setModeMotion,
  setSystemSelection,
  setSelectedAgentRef, setSearch, setRailOpen, setStage, setContextualChatOpen,
}: {
  ventureId: string;
  mode: WorkspaceMode;
  reducedMotion: boolean | null;
  resolvedThreadRef: string | null;
  workIndex: WorkIndex | null;
  systemIndex: SystemIndex | null;
  systemSelection: string | null;
  selectedObject: SystemIndexObject | null;
  readOnly: boolean;
  openerRef: React.MutableRefObject<HTMLElement | null>;
  contextualChatOpen: boolean;
  stage: import("@/api").VisualReference | null;
  openThread: (ref: string) => void;
  beginScopedThread: (ref: string, related?: string[]) => void;
  newThread: () => void;
  refresh: () => void;
  setWorkIndex: (index: WorkIndex) => void;
  setMode: (mode: WorkspaceMode) => void;
  setModeMotion: (value: { animate: boolean; direction: number }) => void;
  setSystemSelection: (ref: string | null) => void;
  setSelectedAgentRef: (ref: string | null) => void;
  setSearch: (value: string) => void;
  setRailOpen: (open: boolean) => void;
  setStage: (visual: import("@/api").VisualReference | null) => void;
  setContextualChatOpen: (open: boolean) => void;
}) {
  const selectThread = useCallback((item: WorkIndexItem) => {
    openThread(item.threadRef);
    if (!item.unread || readOnly || item.threadRef.startsWith("thread:legacy-")) return;
    void markWorkIndexReviewed(ventureId, item)
      .then((response) => setWorkIndex(response.workIndex)).catch(refresh);
  }, [openThread, readOnly, refresh, setWorkIndex, ventureId]);

  const selectObject = useCallback((object: SystemIndexObject | null, directThreadRef: string | null = null) => {
    setSystemSelection(object?.objectRef ?? null);
    if (!object) return;
    if (directThreadRef) return openThread(directThreadRef);
    const linkedRefs = [...new Set([
      ...object.threadRefs,
      ...(workIndex?.items ?? []).filter((item) => item.subjectRefs.includes(object.objectRef)).map((item) => item.threadRef),
    ])];
    const linked = latestLinkedThread(linkedRefs, workIndex);
    if (linked) openThread(linked.threadRef);
    else beginScopedThread(object.objectRef);
  }, [beginScopedThread, openThread, setSystemSelection, workIndex]);

  const changeMode = useCallback((next: WorkspaceMode, source?: HTMLElement, animate = false) => {
    const destination = next;
    if (destination === mode) return;
    if (destination === "product-gtm" && resolvedThreadRef) {
      const linked = systemIndex?.objects.filter((object) => object.threadRefs.includes(resolvedThreadRef)) ?? [];
      const current = linked.find((object) => object.objectRef === systemSelection);
      const nearest = current ?? linked.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
      setSystemSelection(nearest?.objectRef ?? null);
    }
    openerRef.current = source ?? null;
    setModeMotion({ animate: animate && !reducedMotion, direction: Math.sign(MODE_ORDER[destination] - MODE_ORDER[mode]) });
    setMode(destination);
    if (destination === "work") setSelectedAgentRef(null);
    setSearch("");
    setRailOpen(false);
    setStage(null);
    if (destination !== "work") setContextualChatOpen(false);
  }, [mode, openerRef, reducedMotion, resolvedThreadRef, setContextualChatOpen, setMode,
    setModeMotion, setRailOpen, setSearch, setSelectedAgentRef,
    setStage, setSystemSelection, systemIndex?.objects, systemSelection]);

  const assignAgentInSystem = useCallback((ref: string, subjectRef?: string) => {
    const fallback = systemIndex?.objects.find((object) => object.type.toLowerCase() === "motion")?.objectRef
      ?? systemIndex?.objects[0]?.objectRef;
    const subject = subjectRef ?? selectedObject?.objectRef ?? fallback;
    setSelectedAgentRef(ref);
    if (subject) { setSystemSelection(subject); beginScopedThread(subject); }
    else newThread();
    setContextualChatOpen(true);
  }, [beginScopedThread, newThread, selectedObject, setContextualChatOpen,
    setSelectedAgentRef, setSystemSelection, systemIndex?.objects]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !["1", "2"].includes(event.key)) return;
      event.preventDefault();
      changeMode(({ "1": "work", "2": "product-gtm" } as const)[event.key as "1" | "2"]);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [changeMode]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (stage) {
        event.preventDefault();
        setStage(null);
        openerRef.current?.focus();
      } else if (contextualChatOpen && mode !== "work") {
        event.preventDefault();
        setContextualChatOpen(false);
        openerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [contextualChatOpen, mode, openerRef, setContextualChatOpen, setStage, stage]);

  return { selectThread, selectObject, changeMode, assignAgentInSystem };
}
