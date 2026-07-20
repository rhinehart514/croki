import { Menu } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRelease, getRelease, getReleaseIndex, getSystemIndex, getWorkIndex, listVentures, markWorkIndexReviewed, mutateArchitecture, mutateRelease, mutateSystem, setThreadPinned, type FirmVenture, type ReleaseDetail, type ReleaseIndex, type SystemIndex, type SystemMutation, type VisualReference, type WorkIndex, type WorkIndexItem } from "@/api";
import { ReleaseWorkspace, type ReleaseSubview } from "@/components/release-mode/ReleaseWorkspace";
import { SystemWorkspace } from "@/components/system-mode/SystemWorkspace";
import { ThreadConversation } from "@/components/thread/ThreadConversation";
import { useThreadTimeline } from "@/components/thread/useThreadTimeline";
import { VisualStage } from "@/components/visual-stage/VisualStage";
import { directionsFromWorkIndex } from "@/components/workspace/workIndexModel";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { readWorkspaceSession, rememberWorkspaceSession, type WorkspaceContext, type WorkspaceMode } from "@/lib/venture-session";
import { WorkspaceRail } from "./WorkspaceRail";
import { resolveWorkspaceContext } from "./workspaceContext";
import "./workspace-shell.css";

const ROOT_REF = "thread:venture-root";
const rootItem = (ventureId: string): WorkIndexItem => ({ threadRef: ROOT_REF, ventureRef: `venture:${ventureId}`, parentThreadRef: null, originMessageRef: null, subjectRefs: [`venture:${ventureId}`], focusRef: ROOT_REF, founderIntent: "Drover", lifecycle: "open", activity: "idle", attention: "none", terminal: null, unread: false, reviewedThrough: null, latestMeaningfulEvent: { kind: "created", ref: ROOT_REF, at: null, summary: null }, runRefs: [], pinnedAt: null, participantRefs: [], activeParticipantRefs: [], createdAt: null, updatedAt: null });

export function WorkspaceShell({ venture, onOpenVenture }: { venture: FirmVenture; onOpenVenture: (venture: FirmVenture) => void }) {
  const initial = useMemo(() => readWorkspaceSession(venture.id), [venture.id]);
  const connectionState = useFirmConnection(venture.id); const { lens, workIndex, connection, refresh, setWorkIndex } = connectionState;
  const [mode, setMode] = useState<WorkspaceMode>(initial.mode); const [context, setContext] = useState<WorkspaceContext>(initial.context);
  const [threadRef, setThreadRef] = useState(initial.work.threadRef); const [draft, setDraft] = useState(false); const [stage, setStage] = useState<VisualReference | null>(() => window.innerWidth >= 960 ? initial.work.stage : null);
  const [railWidth, setRailWidth] = useState(initial.railWidth); const [scrolls, setScrolls] = useState(initial.work.chatScrollByThread); const [railOpen, setRailOpen] = useState(false); const [chatOpen, setChatOpen] = useState(initial.chatDrawerOpen);
  const [scope, setScope] = useState(initial.system.scope); const [systemSelection, setSystemSelection] = useState(initial.system.selection); const [systemCamera, setSystemCamera] = useState(initial.system.camera); const [releaseSelection, setReleaseSelection] = useState(initial.releases.selection); const [releaseSubview, setReleaseSubview] = useState<ReleaseSubview>(initial.releases.subview);
  const [search, setSearch] = useState(""); const [searchWork, setSearchWork] = useState<WorkIndex | null>(null); const [systemIndex, setSystemIndex] = useState<SystemIndex | null>(null); const [systemIndexAll, setSystemIndexAll] = useState<SystemIndex | null>(null); const [releaseIndex, setReleaseIndex] = useState<ReleaseIndex | null>(null); const [releaseDetail, setReleaseDetail] = useState<ReleaseDetail | null>(null); const [ventures, setVentures] = useState<FirmVenture[]>([venture]);
  const opener = useRef<HTMLElement | null>(null); const draftStartedAt = useRef<number | null>(null);
  const resolvedThreadRef = draft ? null : threadRef && (threadRef === ROOT_REF || workIndex?.items.some((item) => item.threadRef === threadRef)) ? threadRef : workIndex ? workIndex.items[0]?.threadRef ?? ROOT_REF : threadRef;
  const timeline = useThreadTimeline(venture.id, draft ? null : resolvedThreadRef, workIndex?.revision ?? null);
  const selectedItem = useMemo(() => draft ? null : resolvedThreadRef === ROOT_REF ? rootItem(venture.id) : workIndex?.items.find((item) => item.threadRef === resolvedThreadRef) ?? null, [draft, resolvedThreadRef, venture.id, workIndex]);
  const directions = useMemo(() => workIndex && lens ? directionsFromWorkIndex(workIndex, lens) : [], [lens, workIndex]);
  const releaseSeed = useMemo(() => {
    if (!context || context.kind === "release") return null;
    if (context.kind === "object") {
      const object = systemIndexAll?.objects.find((entry) => entry.objectRef === context.ref);
      return { kind: "object", ref: context.ref, label: object?.name ?? context.ref, suggestedRole: object?.territory === "gtm" ? "Distribution" : object?.type === "claim" ? "Supported claim or offer" : "Product delta" };
    }
    if (context.kind === "thread") {
      const thread = workIndex?.items.find((entry) => entry.threadRef === context.ref);
      return { kind: "thread", ref: context.ref, label: thread?.founderIntent ?? context.ref, suggestedRole: "Exact work" };
    }
    return { kind: context.kind, ref: context.ref, label: context.ref, suggestedRole: "Exact action" };
  }, [context, systemIndexAll?.objects, workIndex?.items]);
  const readOnly = ["stale", "offline", "read-only"].includes(connection.phase); const readOnlyReason = connection.phase === "offline" ? "Offline. Nothing consequential can change until Drover is current again." : connection.message ?? "Drover is reconnecting.";
  const reloadSystem = useCallback(async (nextScope = scope, query = mode === "system" ? search : "") => { const effectiveScope = mode === "system" ? nextScope : "system"; const result = await getSystemIndex(venture.id, effectiveScope, query); setSystemIndex(result.systemIndex); if (effectiveScope === "system" && !query) setSystemIndexAll(result.systemIndex); }, [mode, scope, search, venture.id]);
  const reloadReleases = useCallback(async (query = mode === "releases" ? search : "") => { const result = await getReleaseIndex(venture.id, query); setReleaseIndex(result.releaseIndex); }, [mode, search, venture.id]);

  useEffect(() => { void listVentures().then((value) => setVentures(value.ventures)).catch(() => undefined); }, [venture.id]);
  useEffect(() => { void getSystemIndex(venture.id, "system", "").then((result) => { setSystemIndexAll(result.systemIndex); if (mode !== "system" || scope === "system") setSystemIndex(result.systemIndex); }).catch(() => undefined); void getReleaseIndex(venture.id).then((result) => setReleaseIndex(result.releaseIndex)).catch(() => undefined); }, [mode, scope, venture.id, workIndex?.revision]);
  useEffect(() => { const timer = window.setTimeout(() => { if (mode === "work") { if (!search.trim()) setSearchWork(null); else void getWorkIndex(venture.id, search).then((value) => setSearchWork(value.workIndex)).catch(() => undefined); } else if (mode === "system") void reloadSystem(scope, search).catch(() => undefined); else void reloadReleases(search).catch(() => undefined); }, 180); return () => window.clearTimeout(timer); }, [mode, reloadReleases, reloadSystem, scope, search, venture.id]);
  useEffect(() => { if (!releaseSelection) return; void getRelease(venture.id, releaseSelection).then((result) => setReleaseDetail(result.release)).catch(() => setReleaseDetail(null)); }, [releaseIndex?.revision, releaseSelection, venture.id]);
  useEffect(() => { rememberWorkspaceSession(venture.id, { mode, railWidth, context, work: { threadRef: resolvedThreadRef, stage, railWidth, chatScrollByThread: scrolls }, system: { scope, selection: systemSelection, camera: systemCamera }, releases: { selection: releaseSelection, subview: releaseSubview }, chatDrawerOpen: chatOpen }); }, [chatOpen, context, mode, railWidth, releaseSelection, releaseSubview, resolvedThreadRef, scope, scrolls, stage, systemCamera, systemSelection, venture.id]);

  const openThread = useCallback((next: string) => { setThreadRef(next); setDraft(false); setContext({ kind: "thread", ref: next }); setStage(null); setRailOpen(false); }, []);
  const selectThread = useCallback((item: WorkIndexItem) => { openThread(item.threadRef); if (item.unread && !readOnly && !item.threadRef.startsWith("thread:legacy-")) void markWorkIndexReviewed(venture.id, item).then((response) => setWorkIndex(response.workIndex)).catch(refresh); }, [openThread, readOnly, refresh, setWorkIndex, venture.id]);
  const changeMode = useCallback((next: WorkspaceMode, source?: HTMLElement) => {
    if (next === mode) return;
    opener.current = source ?? null;
    const resolved = resolveWorkspaceContext({ from: mode, to: next, context, workIndex, systemIndex: systemIndexAll, releaseIndex });
    setContext(resolved); setMode(next); setSearch(""); setRailOpen(false);
    if (next === "work") {
      if (resolved?.kind === "thread") openThread(resolved.ref); else { setDraft(true); setThreadRef(null); }
      setChatOpen(false);
    } else if (next === "system") {
      setSystemSelection(resolved && ["object", "release"].includes(resolved.kind) ? resolved.ref : null);
    } else {
      const selected = resolved?.kind === "release" ? resolved.ref.replace(/^object:/, "") : null;
      setReleaseSelection(selected); if (!selected) setReleaseDetail(null);
    }
  }, [context, mode, openThread, releaseIndex, systemIndexAll, workIndex]);
  const openContextChat = useCallback((source?: HTMLElement) => { opener.current = source ?? opener.current; const resolved = resolveWorkspaceContext({ from: mode, to: "work", context, workIndex, systemIndex: systemIndexAll, releaseIndex }); if (resolved?.kind === "thread") openThread(resolved.ref); else { setDraft(true); setThreadRef(null); } setChatOpen(true); }, [context, mode, openThread, releaseIndex, systemIndexAll, workIndex]);
  const newAction = useCallback(() => { if (mode === "work") { setDraft(true); setThreadRef(null); setContext(null); } else { setReleaseSelection(null); setReleaseDetail(null); setReleaseSubview("overview"); } }, [mode]);
  const afterMutation = useCallback(async () => { const [, , all] = await Promise.all([reloadSystem(scope, mode === "system" ? search : ""), reloadReleases(mode === "releases" ? search : ""), getSystemIndex(venture.id, "system", "")]); setSystemIndexAll(all.systemIndex); refresh(); }, [mode, refresh, reloadReleases, reloadSystem, scope, search, venture.id]);
  useEffect(() => { const keys = (event: KeyboardEvent) => { if (!(event.metaKey || event.ctrlKey) || !["1", "2", "3"].includes(event.key)) return; event.preventDefault(); changeMode(({ "1": "work", "2": "system", "3": "releases" } as const)[event.key as "1" | "2" | "3"]); }; window.addEventListener("keydown", keys); return () => window.removeEventListener("keydown", keys); }, [changeMode]);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; if (stage) { event.preventDefault(); setStage(null); opener.current?.focus(); } else if (chatOpen && mode !== "work") { event.preventDefault(); setChatOpen(false); opener.current?.focus(); } }; window.addEventListener("keydown", escape, true); return () => window.removeEventListener("keydown", escape, true); }, [chatOpen, mode, stage]);
  useEffect(() => { if (!draft || !workIndex || draftStartedAt.current == null) return; const created = workIndex.items.find((item) => Date.parse(item.createdAt ?? "") >= draftStartedAt.current! - 1000); if (created) { setDraft(false); setThreadRef(created.threadRef); draftStartedAt.current = null; } }, [draft, workIndex]);
  const subjectRefs = draft && context && context.kind !== "thread" ? [context.ref] : [];
  return <div className="workspace-shell" data-mode={mode} data-stage-open={stage ? "true" : undefined} data-chat-open={chatOpen ? "true" : undefined} data-rail-open={railOpen ? "true" : undefined} style={{ "--thread-rail-width": `${railWidth}px` } as React.CSSProperties}>
    <button type="button" className="thread-rail-launcher" aria-label="Open workspace rail" aria-expanded={railOpen} onClick={() => setRailOpen((value) => !value)}><Menu aria-hidden="true" /></button>
    <WorkspaceRail venture={venture} ventures={ventures} mode={mode} width={railWidth} search={search} selectedThread={resolvedThreadRef} selectedRelease={releaseSelection} workIndex={searchWork ?? workIndex} systemIndex={systemIndex} releaseIndex={releaseIndex} readOnly={readOnly} readOnlyReason={readOnlyReason} onMode={changeMode} onSearch={setSearch} onSelectThread={selectThread} onSelectSystem={(next) => { setScope(next); setSystemSelection(null); void reloadSystem(next, search); }} onSelectRelease={(id) => { setReleaseSelection(id); setContext({ kind: "release", ref: `object:${id}` }); }} onNew={newAction} onSwitchVenture={onOpenVenture} onResize={setRailWidth} onChanged={refresh} />
    <div className="workspace-primary">{mode === "system" ? <SystemWorkspace index={systemIndex} scope={scope} selectedRef={systemSelection} directions={directions} camera={systemCamera} readOnlyReason={readOnly ? readOnlyReason : null} onScope={(next) => { setScope(next); void reloadSystem(next, search); }} onSelect={(object) => { const ref = object?.objectRef ?? null; setSystemSelection(ref); setContext(object ? { kind: object.type === "release" ? "release" : "object", ref: object.objectRef } : null); }} onCameraChange={setSystemCamera} onMutate={async (mutations: SystemMutation[]) => { if (!systemIndex) return; await mutateSystem(venture.id, systemIndex.revision, mutations); await afterMutation(); }} onMutateArchitecture={async (operations, reason) => { if (!systemIndex) return; await mutateArchitecture(venture.id, { baseRevision: systemIndex.architectureRevision, operations, reason }); await afterMutation(); }} onOpenWork={(ref) => { openThread(ref); setMode("work"); setChatOpen(false); }} onOpenChat={openContextChat} /> : mode === "releases" ? <ReleaseWorkspace index={releaseIndex} release={releaseDetail} subview={releaseSubview} draftContext={releaseSeed} objects={systemIndex?.objects ?? []} threads={workIndex?.items ?? []} readOnlyReason={readOnly ? readOnlyReason : null} onSubview={setReleaseSubview} onOpenChat={openContextChat} onCreate={async (value) => { if (!releaseIndex) return; const seeded = context?.kind === "object" ? { objectRef: context.ref } : context?.kind === "thread" ? { threadRef: context.ref } : {}; const result = await createRelease(venture.id, releaseIndex.revision, { ...value, ...seeded }); setReleaseIndex(result.releaseIndex); setReleaseSelection(result.release.id); setContext({ kind: "release", ref: result.release.releaseRef }); }} onMutate={async (mutations) => { if (!releaseDetail) return; const result = await mutateRelease(venture.id, releaseDetail.id, releaseDetail.revision, mutations); setReleaseDetail(result.release); setReleaseIndex(result.releaseIndex); await reloadSystem(scope, ""); }} onChanged={() => { refresh(); void reloadReleases("").then(() => releaseSelection ? getRelease(venture.id, releaseSelection).then((result) => setReleaseDetail(result.release)) : undefined); }} /> : null}</div>
    <div className="workspace-chat"><ThreadConversation ventureId={venture.id} ventureName={venture.name} item={selectedItem} timeline={timeline.timeline} lens={lens} connection={connection} loading={timeline.loading} error={timeline.error} draft={draft} subjectRefs={subjectRefs} initialScrollTop={resolvedThreadRef ? scrolls[resolvedThreadRef] ?? null : null} onScrollChange={(ref, top) => setScrolls((current) => current[ref] === top ? current : { ...current, [ref]: top })} onOpenVisual={(visual, source) => { opener.current = source; setStage(visual); }} onOpenThread={openThread} onTogglePin={() => { if (!selectedItem || selectedItem.threadRef === ROOT_REF) return; void setThreadPinned(venture.id, selectedItem.threadRef, !selectedItem.pinnedAt).then((response) => setWorkIndex(response.workIndex)).catch(refresh); }} onDriven={() => { draftStartedAt.current = draft ? Date.now() : null; refresh(); void timeline.refresh(); }} /></div>
    <AnimatePresence initial={false}>{stage ? <VisualStage key={`${stage.kind}:${stage.ref}`} visual={stage} timeline={timeline.timeline} workIndex={workIndex} directions={directions} lens={lens} readOnlyReason={readOnly ? readOnlyReason : null} onClose={() => { setStage(null); opener.current?.focus(); }} onOpenThread={openThread} onChanged={() => { refresh(); void timeline.refresh(); }} /> : null}</AnimatePresence>
  </div>;
}
