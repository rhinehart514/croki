import { Menu } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getWorkIndex,
  listVentures,
  markWorkIndexReviewed,
  setThreadPinned,
  type FirmVenture,
  type VisualReference,
  type WorkIndex,
  type WorkIndexItem,
} from "@/api";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { readThreadSession, rememberThreadSession } from "@/lib/venture-session";
import { directionsFromWorkIndex } from "@/components/workspace/workIndexModel";
import { VisualStage } from "@/components/visual-stage/VisualStage";
import { ThreadConversation } from "./ThreadConversation";
import { ThreadRail } from "./ThreadRail";
import { useThreadTimeline } from "./useThreadTimeline";
import "./thread-shell.css";

const ROOT_REF = "thread:venture-root";

function rootItem(ventureId: string): WorkIndexItem {
  return { threadRef: ROOT_REF, ventureRef: `venture:${ventureId}`, parentThreadRef: null, originMessageRef: null, subjectRefs: [`venture:${ventureId}`], focusRef: ROOT_REF, founderIntent: "Drover", lifecycle: "open", activity: "idle", attention: "none", terminal: null, unread: false, reviewedThrough: null, latestMeaningfulEvent: { kind: "created", ref: ROOT_REF, at: null, summary: null }, runRefs: [], pinnedAt: null, participantRefs: [], activeParticipantRefs: [], createdAt: null, updatedAt: null };
}

export function ThreadShell({ venture, onOpenVenture }: { venture: FirmVenture; onOpenVenture: (venture: FirmVenture) => void }) {
  const connectionState = useFirmConnection(venture.id);
  const { lens, workIndex, connection, refresh, setWorkIndex } = connectionState;
  const [session] = useState(() => readThreadSession(venture.id));
  const [threadRef, setThreadRef] = useState<string | null>(() => session?.threadRef ?? null);
  const [draft, setDraft] = useState(false);
  const [stage, setStage] = useState<VisualReference | null>(() => window.innerWidth >= 960 ? session?.stage ?? null : null);
  const [railWidth, setRailWidth] = useState(session?.railWidth ?? 240);
  const [chatScrollByThread, setChatScrollByThread] = useState<Record<string, number>>(session?.chatScrollByThread ?? {});
  const [railOpen, setRailOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchIndex, setSearchIndex] = useState<WorkIndex | null>(null);
  const [ventures, setVentures] = useState<FirmVenture[]>([venture]);
  const originRef = useRef<HTMLElement | null>(null);
  const draftStartedAt = useRef<number | null>(null);
  const resolvedThreadRef = draft
    ? null
    : threadRef && (threadRef === ROOT_REF || workIndex?.items.some((item) => item.threadRef === threadRef))
      ? threadRef
      : workIndex ? workIndex.items[0]?.threadRef ?? ROOT_REF : threadRef;
  const effectiveRef = draft ? null : resolvedThreadRef;
  const timelineState = useThreadTimeline(venture.id, effectiveRef, workIndex?.revision ?? null);

  useEffect(() => { void listVentures().then((value) => setVentures(value.ventures)).catch(() => undefined); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!search.trim()) { setSearchIndex(null); return; }
      void getWorkIndex(venture.id, search).then((value) => setSearchIndex(value.workIndex)).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, venture.id, workIndex?.revision]);
  useEffect(() => {
    rememberThreadSession(venture.id, { threadRef: resolvedThreadRef, stage, railWidth, chatScrollByThread });
  }, [chatScrollByThread, railWidth, resolvedThreadRef, stage, venture.id]);

  const selectedItem = useMemo(() => {
    if (draft) return null;
    if (resolvedThreadRef === ROOT_REF) return rootItem(venture.id);
    return workIndex?.items.find((item) => item.threadRef === resolvedThreadRef) ?? null;
  }, [draft, resolvedThreadRef, venture.id, workIndex]);
  const directions = useMemo(() => workIndex && lens ? directionsFromWorkIndex(workIndex, lens) : [], [lens, workIndex]);
  const readOnly = ["stale", "offline", "read-only"].includes(connection.phase);
  const readOnlyReason = connection.phase === "offline" ? "Offline. Nothing consequential can change until Drover is current again." : connection.message ?? "Drover is reconnecting.";

  const closeStage = useCallback(() => { setStage(null); originRef.current?.focus(); }, []);
  const openVisual = useCallback((visual: VisualReference, origin: HTMLElement) => { originRef.current = origin; setStage(visual); }, []);
  const openThread = useCallback((next: string) => { setDraft(false); setThreadRef(next); setStage(null); setRailOpen(false); }, []);
  const select = useCallback((item: WorkIndexItem) => {
    openThread(item.threadRef);
    if (item.unread && !readOnly && !item.threadRef.startsWith("thread:legacy-")) void markWorkIndexReviewed(venture.id, item).then((response) => setWorkIndex(response.workIndex)).catch(refresh);
    const match = item.matchRefs?.[0];
    if (match && match.kind !== "message") setStage({ kind: match.kind === "decision" ? "consequence" : match.kind === "evidence" ? "evidence" : "preview", ref: match.ref, threadRef: item.threadRef, title: match.label });
  }, [openThread, readOnly, refresh, setWorkIndex, venture.id]);
  const newThread = useCallback(() => { setDraft(true); setThreadRef(null); setStage(null); setSearch(""); setRailOpen(false); draftStartedAt.current = Date.now(); }, []);
  const onDriven = useCallback(() => { refresh(); void timelineState.refresh(); }, [refresh, timelineState]);
  const rememberChatScroll = useCallback((ref: string, top: number) => {
    setChatScrollByThread((current) => current[ref] === top ? current : { ...current, [ref]: top });
  }, []);

  useEffect(() => {
    if (!draft || !workIndex || draftStartedAt.current == null) return;
    const created = workIndex.items.find((item) => Date.parse(item.createdAt ?? "") >= draftStartedAt.current! - 1000);
    if (!created) return;
    setDraft(false); setThreadRef(created.threadRef); draftStartedAt.current = null;
  }, [draft, workIndex]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !stage) return;
      event.preventDefault(); event.stopPropagation(); closeStage();
    };
    window.addEventListener("keydown", escape, true); return () => window.removeEventListener("keydown", escape, true);
  }, [closeStage, stage]);

  return (
    <div className="thread-shell" data-stage-open={stage ? "true" : undefined} data-rail-open={railOpen || undefined} style={{ "--thread-rail-width": `${railWidth}px` } as React.CSSProperties}>
      <button type="button" className="thread-rail-launcher" aria-label="Open thread rail" aria-expanded={railOpen} onClick={() => setRailOpen((value) => !value)}><Menu aria-hidden="true" /></button>
      <ThreadRail venture={venture} ventures={ventures} workIndex={searchIndex ?? workIndex} crew={lens?.crew ?? []} search={search} width={railWidth} selected={resolvedThreadRef} readOnly={readOnly} readOnlyReason={readOnlyReason} onSearch={setSearch} onSelect={select} onNew={newThread} onSwitchVenture={onOpenVenture} onResize={setRailWidth} onConfigurationChanged={refresh} />
      <ThreadConversation ventureId={venture.id} ventureName={venture.name} item={selectedItem} timeline={timelineState.timeline} lens={lens} connection={connection} loading={timelineState.loading} error={timelineState.error} draft={draft} initialScrollTop={resolvedThreadRef ? chatScrollByThread[resolvedThreadRef] ?? null : null} onScrollChange={rememberChatScroll} onOpenVisual={openVisual} onOpenThread={openThread} onTogglePin={() => { if (!selectedItem || selectedItem.threadRef === ROOT_REF) return; void setThreadPinned(venture.id, selectedItem.threadRef, !selectedItem.pinnedAt).then((response) => setWorkIndex(response.workIndex)).catch(refresh); }} onDriven={onDriven} />
      <AnimatePresence initial={false}>
        {stage ? <VisualStage key={`${stage.kind}:${stage.ref}`} visual={stage} timeline={timelineState.timeline} workIndex={workIndex} directions={directions} lens={lens} readOnlyReason={readOnly ? readOnlyReason : null} onClose={closeStage} onOpenThread={openThread} onChanged={onDriven} /> : null}
      </AnimatePresence>
    </div>
  );
}
