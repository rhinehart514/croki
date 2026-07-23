import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SystemIndex,
  VisualReference,
  WorkIndex,
  WorkIndexItem,
} from "@/api";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";
import { useThreadTimeline } from "@/components/thread/useThreadTimeline";
import { latestAgentThread } from "./agentThreadSelection";

export const ROOT_THREAD_REF = "thread:venture-root";

function rootItem(ventureId: string): WorkIndexItem {
  return {
    threadRef: ROOT_THREAD_REF,
    ventureRef: `venture:${ventureId}`,
    parentThreadRef: null,
    originMessageRef: null,
    subjectRefs: [`venture:${ventureId}`],
    focusRef: ROOT_THREAD_REF,
    founderIntent: "Drover",
    lifecycle: "open",
    activity: "idle",
    attention: "none",
    terminal: null,
    unread: false,
    settled: false,
    reviewedThrough: null,
    latestMeaningfulEvent: { kind: "created", ref: ROOT_THREAD_REF, at: null, summary: null },
    runRefs: [],
    pinnedAt: null,
    participantRefs: [],
    activeParticipantRefs: [],
    createdAt: null,
    updatedAt: null,
  };
}

export function latestLinkedThread(refs: string[], workIndex: WorkIndex | null) {
  const wanted = new Set(refs);
  return (workIndex?.items ?? [])
    .filter((item) => wanted.has(item.threadRef))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] ?? null;
}

export function useWorkspaceConversation({
  ventureId, initialThreadRef, initialContextualChatOpen, initialScrolls,
  workIndex, systemIndex,
}: {
  ventureId: string;
  initialThreadRef: string | null;
  initialContextualChatOpen: boolean;
  initialScrolls: Record<string, number>;
  workIndex: WorkIndex | null;
  systemIndex: SystemIndex | null;
}) {
  const [threadRef, setThreadRef] = useState(initialThreadRef);
  const [selectedAgentRef, setSelectedAgentRef] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);
  const [draftSession, setDraftSession] = useState(0);
  const [draftSubjectRef, setDraftSubjectRef] = useState<string | null>(null);
  const [draftRelatedRefs, setDraftRelatedRefs] = useState<string[]>([]);
  const [stage, setStage] = useState<VisualReference | null>(null);
  const [artifactFocus, setArtifactFocus] = useState<ArtifactSectionFocus | null>(null);
  const [artifactFocusRequest, setArtifactFocusRequest] = useState(0);
  const [contextualChatOpen, setContextualChatOpen] = useState(initialContextualChatOpen);
  const [scrolls, setScrolls] = useState(initialScrolls);
  const openerRef = useRef<HTMLElement | null>(null);
  const draftStartedAtRef = useRef<number | null>(null);

  const contextualThread = useMemo(() => {
    if (!draft || !draftSubjectRef || !workIndex) return null;
    const object = systemIndex?.objects.find((entry) => entry.objectRef === draftSubjectRef);
    return latestLinkedThread([
      ...(object?.threadRefs ?? []),
      ...workIndex.items.filter((item) => item.subjectRefs.includes(draftSubjectRef)).map((item) => item.threadRef),
    ], workIndex);
  }, [draft, draftSubjectRef, systemIndex?.objects, workIndex]);
  const activeDraft = draft && !contextualThread;
  const requestedThreadRef = contextualThread?.threadRef ?? threadRef;
  const resolvedThreadRef = activeDraft ? null
    : requestedThreadRef && (requestedThreadRef === ROOT_THREAD_REF || workIndex?.items.some((item) => item.threadRef === requestedThreadRef))
      ? requestedThreadRef
      : workIndex ? (workIndex.items[0]?.threadRef ?? ROOT_THREAD_REF) : requestedThreadRef;
  const timeline = useThreadTimeline(ventureId, activeDraft ? null : resolvedThreadRef, workIndex?.revision ?? null);
  const selectedItem = useMemo(() => activeDraft ? null
    : resolvedThreadRef === ROOT_THREAD_REF ? rootItem(ventureId)
      : workIndex?.items.find((item) => item.threadRef === resolvedThreadRef) ?? null,
  [activeDraft, resolvedThreadRef, ventureId, workIndex]);

  const openThread = useCallback((next: string) => {
    setSelectedAgentRef(null);
    setThreadRef(next);
    setDraft(false);
    setDraftSubjectRef(null);
    setDraftRelatedRefs([]);
    setStage(null);
    setArtifactFocus(null);
  }, []);
  const beginScopedThread = useCallback((subjectRef: string, relatedRefs: string[] = []) => {
    setDraftSession((current) => current + 1);
    setThreadRef(null);
    setDraft(true);
    setDraftSubjectRef(subjectRef);
    setDraftRelatedRefs(relatedRefs);
    setStage(null);
    setArtifactFocus(null);
  }, []);
  const newThread = useCallback(() => {
    setDraftSession((current) => current + 1);
    setSelectedAgentRef(null);
    setDraft(true);
    setDraftSubjectRef(null);
    setDraftRelatedRefs([]);
    setThreadRef(null);
    setStage(null);
  }, []);
  const rememberThreadScroll = useCallback((ref: string, top: number) => {
    setScrolls((current) => current[ref] === top ? current : { ...current, [ref]: top });
  }, []);

  useEffect(() => {
    if (!draft || !workIndex || draftStartedAtRef.current == null) return;
    const created = selectedAgentRef
      ? latestAgentThread(workIndex.items, selectedAgentRef)
      : workIndex.items.find((item) => Date.parse(item.createdAt ?? "") >= draftStartedAtRef.current! - 1000);
    if (!created) return;
    setSelectedAgentRef(null);
    setDraft(false);
    setThreadRef(created.threadRef);
    setDraftSubjectRef(null);
    setDraftRelatedRefs([]);
    draftStartedAtRef.current = null;
  }, [draft, selectedAgentRef, workIndex]);

  return {
    threadRef, selectedAgentRef, setSelectedAgentRef, draft, draftSession, draftSubjectRef, draftRelatedRefs,
    stage, setStage, artifactFocus, setArtifactFocus, artifactFocusRequest, setArtifactFocusRequest,
    contextualChatOpen, setContextualChatOpen, scrolls, openerRef, draftStartedAtRef,
    activeDraft, resolvedThreadRef, timeline, selectedItem,
    openThread, beginScopedThread, newThread, rememberThreadScroll,
  };
}
