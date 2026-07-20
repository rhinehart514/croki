import { Menu } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createRelease,
  getRelease,
  getReleaseIndex,
  getSystemIndex,
  getWorkIndex,
  listVentures,
  markWorkIndexReviewed,
  mutateArchitecture,
  mutateRelease,
  mutateSystem,
  setThreadPinned,
  type FirmVenture,
  type ReleaseDetail,
  type ReleaseIndex,
  type SystemIndex,
  type SystemIndexObject,
  type SystemMutation,
  type VisualReference,
  type WorkIndex,
  type WorkIndexItem,
} from "@/api";
import { ReleaseWorkspace } from "@/components/release-mode/ReleaseWorkspace";
import { SystemWorkspace } from "@/components/system-mode/SystemWorkspace";
import { ThreadConversation } from "@/components/thread/ThreadConversation";
import { useThreadTimeline } from "@/components/thread/useThreadTimeline";
import { VisualStage } from "@/components/visual-stage/VisualStage";
import { WorkSurface } from "@/components/work-mode";
import { directionsFromWorkIndex } from "@/components/workspace/workIndexModel";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { readWorkspaceSession, rememberWorkspaceSession, type WorkspaceMode } from "@/lib/venture-session";
import { WorkspaceRail } from "./WorkspaceRail";
import "./workspace-shell.css";

const ROOT_REF = "thread:venture-root";
const rootItem = (ventureId: string): WorkIndexItem => ({
  threadRef: ROOT_REF, ventureRef: `venture:${ventureId}`, parentThreadRef: null, originMessageRef: null,
  subjectRefs: [`venture:${ventureId}`], focusRef: ROOT_REF, founderIntent: "Drover", lifecycle: "open",
  activity: "idle", attention: "none", terminal: null, unread: false, reviewedThrough: null,
  latestMeaningfulEvent: { kind: "created", ref: ROOT_REF, at: null, summary: null }, runRefs: [],
  pinnedAt: null, participantRefs: [], activeParticipantRefs: [], createdAt: null, updatedAt: null,
});

function latestLinkedThread(refs: string[], workIndex: WorkIndex | null) {
  const wanted = new Set(refs);
  return (workIndex?.items ?? [])
    .filter((item) => wanted.has(item.threadRef))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] ?? null;
}

export function WorkspaceShell({ venture, onOpenVenture }: { venture: FirmVenture; onOpenVenture: (venture: FirmVenture) => void }) {
  const initial = useMemo(() => readWorkspaceSession(venture.id), [venture.id]);
  const connectionState = useFirmConnection(venture.id);
  const { lens, workIndex, connection, refresh, setWorkIndex } = connectionState;
  const [mode, setMode] = useState<WorkspaceMode>(initial.mode);
  const [threadRef, setThreadRef] = useState(initial.selectedThreadRef);
  const [draft, setDraft] = useState(false);
  const [draftSubjectRef, setDraftSubjectRef] = useState<string | null>(null);
  const [stage, setStage] = useState<VisualReference | null>(null);
  const [railWidth, setRailWidth] = useState(initial.railWidth);
  const [scrolls, setScrolls] = useState(initial.chatScrollByThread);
  const [railOpen, setRailOpen] = useState(false);
  const [scope, setScope] = useState(initial.systemScope);
  const [systemSelection, setSystemSelection] = useState(initial.selectedObjectRef);
  const [systemCamera, setSystemCamera] = useState(initial.systemCamera);
  const [releaseSelection, setReleaseSelection] = useState(initial.selectedReleaseId);
  const [releaseSubview, setReleaseSubview] = useState<"overview" | "build" | "activity" | "settings">("overview");
  const [search, setSearch] = useState("");
  const [searchWork, setSearchWork] = useState<WorkIndex | null>(null);
  const [systemIndex, setSystemIndex] = useState<SystemIndex | null>(null);
  const [systemIndexAll, setSystemIndexAll] = useState<SystemIndex | null>(null);
  const [releaseIndex, setReleaseIndex] = useState<ReleaseIndex | null>(null);
  const [releaseDetail, setReleaseDetail] = useState<ReleaseDetail | null>(null);
  const [ventures, setVentures] = useState<FirmVenture[]>([venture]);
  const opener = useRef<HTMLElement | null>(null);
  const draftStartedAt = useRef<number | null>(null);

  const resolvedThreadRef = draft ? null : threadRef && (threadRef === ROOT_REF || workIndex?.items.some((item) => item.threadRef === threadRef))
    ? threadRef
    : workIndex ? workIndex.items[0]?.threadRef ?? ROOT_REF : threadRef;
  const timeline = useThreadTimeline(venture.id, draft ? null : resolvedThreadRef, workIndex?.revision ?? null);
  const selectedItem = useMemo(() => draft ? null : resolvedThreadRef === ROOT_REF
    ? rootItem(venture.id)
    : workIndex?.items.find((item) => item.threadRef === resolvedThreadRef) ?? null,
  [draft, resolvedThreadRef, venture.id, workIndex]);
  const directions = useMemo(() => workIndex && lens ? directionsFromWorkIndex(workIndex, lens) : [], [lens, workIndex]);
  const selectedObject = systemIndexAll?.objects.find((entry) => entry.objectRef === systemSelection) ?? null;
  const selectedRelease = releaseIndex?.releases.find((entry) => entry.id === releaseSelection) ?? null;
  const releaseSeed = useMemo(() => {
    if (selectedObject) return { kind: "object", ref: selectedObject.objectRef, label: selectedObject.name, suggestedRole: selectedObject.territory === "gtm" ? "Distribution" : selectedObject.type === "claim" ? "Supported claim or offer" : "Product delta" };
    if (selectedItem && selectedItem.threadRef !== ROOT_REF) return { kind: "thread", ref: selectedItem.threadRef, label: selectedItem.founderIntent, suggestedRole: "Exact work" };
    return null;
  }, [selectedItem, selectedObject]);
  const readOnly = ["stale", "offline", "read-only"].includes(connection.phase);
  const readOnlyReason = connection.phase === "offline" ? "Offline. Nothing consequential can change until Drover is current again." : connection.message ?? "Drover is reconnecting.";

  const reloadSystem = useCallback(async (nextScope = scope) => {
    const result = await getSystemIndex(venture.id, nextScope, "");
    setSystemIndex(result.systemIndex);
    if (nextScope === "system") setSystemIndexAll(result.systemIndex);
  }, [scope, venture.id]);
  const reloadReleases = useCallback(async () => {
    const result = await getReleaseIndex(venture.id, "");
    setReleaseIndex(result.releaseIndex);
  }, [venture.id]);

  useEffect(() => { void listVentures().then((value) => setVentures(value.ventures)).catch(() => undefined); }, [venture.id]);
  useEffect(() => {
    void getSystemIndex(venture.id, "system", "").then((result) => {
      setSystemIndexAll(result.systemIndex);
      if (scope === "system") setSystemIndex(result.systemIndex);
    }).catch(() => undefined);
    void getReleaseIndex(venture.id, "").then((result) => setReleaseIndex(result.releaseIndex)).catch(() => undefined);
  }, [scope, venture.id, workIndex?.revision]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!search.trim()) setSearchWork(null);
      else void getWorkIndex(venture.id, search).then((value) => setSearchWork(value.workIndex)).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, venture.id]);
  useEffect(() => {
    if (!releaseSelection) return;
    void getRelease(venture.id, releaseSelection).then((result) => setReleaseDetail(result.release)).catch(() => setReleaseDetail(null));
  }, [releaseIndex?.revision, releaseSelection, venture.id]);
  useEffect(() => rememberWorkspaceSession(venture.id, {
    mode, railWidth, selectedThreadRef: resolvedThreadRef, selectedObjectRef: systemSelection,
    selectedReleaseId: releaseSelection, systemScope: scope, systemCamera, chatScrollByThread: scrolls,
  }), [mode, railWidth, releaseSelection, resolvedThreadRef, scope, scrolls, systemCamera, systemSelection, venture.id]);

  const openThread = useCallback((next: string) => {
    setThreadRef(next); setDraft(false); setDraftSubjectRef(null); setStage(null); setRailOpen(false);
  }, []);
  const beginScopedThread = useCallback((subjectRef: string) => {
    setThreadRef(null); setDraft(true); setDraftSubjectRef(subjectRef); setStage(null); setRailOpen(false);
  }, []);
  const selectThread = useCallback((item: WorkIndexItem) => {
    openThread(item.threadRef);
    if (item.unread && !readOnly && !item.threadRef.startsWith("thread:legacy-")) {
      void markWorkIndexReviewed(venture.id, item).then((response) => setWorkIndex(response.workIndex)).catch(refresh);
    }
  }, [openThread, readOnly, refresh, setWorkIndex, venture.id]);
  const selectObject = useCallback((object: SystemIndexObject | null) => {
    setSystemSelection(object?.objectRef ?? null);
    if (!object) return;
    const linked = latestLinkedThread(object.threadRefs, workIndex);
    if (linked) openThread(linked.threadRef); else beginScopedThread(object.objectRef);
  }, [beginScopedThread, openThread, workIndex]);
  const selectRelease = useCallback((id: string | null) => {
    setReleaseSelection(id); setReleaseSubview("overview");
    if (!id) { setReleaseDetail(null); return; }
    const release = releaseIndex?.releases.find((entry) => entry.id === id);
    const linked = latestLinkedThread(release?.threadRefs ?? [], workIndex);
    if (linked) openThread(linked.threadRef); else beginScopedThread(release?.releaseRef ?? `object:${id}`);
  }, [beginScopedThread, openThread, releaseIndex?.releases, workIndex]);
  const changeMode = useCallback((next: WorkspaceMode, source?: HTMLElement) => {
    if (next === mode) return;
    opener.current = source ?? null; setMode(next); setSearch(""); setRailOpen(false); setStage(null);
  }, [mode]);
  const newThread = useCallback(() => {
    setDraft(true); setDraftSubjectRef(null); setThreadRef(null); setStage(null); setRailOpen(false);
  }, []);
  const afterMutation = useCallback(async () => {
    const [, , all] = await Promise.all([reloadSystem(scope), reloadReleases(), getSystemIndex(venture.id, "system", "")]);
    setSystemIndexAll(all.systemIndex); refresh();
  }, [refresh, reloadReleases, reloadSystem, scope, venture.id]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !["1", "2", "3"].includes(event.key)) return;
      event.preventDefault();
      changeMode(({ "1": "work", "2": "system", "3": "releases" } as const)[event.key as "1" | "2" | "3"]);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [changeMode]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !stage) return;
      event.preventDefault(); setStage(null); opener.current?.focus();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [stage]);
  useEffect(() => {
    if (!draft || !workIndex || draftStartedAt.current == null) return;
    const created = workIndex.items.find((item) => Date.parse(item.createdAt ?? "") >= draftStartedAt.current! - 1000);
    if (created) { setDraft(false); setThreadRef(created.threadRef); setDraftSubjectRef(null); draftStartedAt.current = null; }
  }, [draft, workIndex]);

  const conversation = <ThreadConversation ventureId={venture.id} ventureName={venture.name} item={selectedItem} timeline={timeline.timeline} lens={lens} connection={connection} loading={timeline.loading} error={timeline.error} draft={draft} subjectRefs={draft && draftSubjectRef ? [draftSubjectRef] : []} scopeLabel={draftSubjectRef === selectedObject?.objectRef ? selectedObject.name : draftSubjectRef === selectedRelease?.releaseRef ? selectedRelease.name : null} initialScrollTop={resolvedThreadRef ? scrolls[resolvedThreadRef] ?? null : null} onScrollChange={(ref, top) => setScrolls((current) => current[ref] === top ? current : { ...current, [ref]: top })} onOpenVisual={(visual, source) => {
    const item = timeline.timeline?.items.find((candidate) => candidate.ref === visual.ref || candidate.visual?.ref === visual.ref);
    const artifact = item?.artifact as { kind?: string } | undefined;
    if (artifact?.kind === "native-code") return;
    opener.current = source; setStage(visual);
  }} onOpenThread={openThread} onTogglePin={() => { if (!selectedItem || selectedItem.threadRef === ROOT_REF) return; void setThreadPinned(venture.id, selectedItem.threadRef, !selectedItem.pinnedAt).then((response) => setWorkIndex(response.workIndex)).catch(refresh); }} onDriven={() => { draftStartedAt.current = draft ? Date.now() : null; refresh(); void timeline.refresh(); }} />;

  return <div className="workspace-shell" data-mode={mode} data-stage-open={stage ? "true" : undefined} data-rail-open={railOpen ? "true" : undefined} style={{ "--thread-rail-width": `${railWidth}px` } as React.CSSProperties}>
    <button type="button" className="thread-rail-launcher" aria-label="Open workspace rail" aria-expanded={railOpen} onClick={() => setRailOpen((value) => !value)}><Menu aria-hidden="true" /></button>
    <WorkspaceRail venture={venture} ventures={ventures} mode={mode} width={railWidth} search={search} selectedThread={resolvedThreadRef} workIndex={searchWork ?? workIndex} readOnly={readOnly} readOnlyReason={readOnlyReason} onMode={changeMode} onSearch={setSearch} onSelectThread={selectThread} onNew={newThread} onSwitchVenture={onOpenVenture} onResize={setRailWidth} onChanged={refresh} />
    {mode === "work" ? <div className="workspace-work"><WorkSurface ventureId={venture.id} timeline={timeline.timeline} conversation={conversation} readOnlyReason={readOnly ? readOnlyReason : null} onWorkspaceChanged={() => { refresh(); void timeline.refresh(); }} /></div> : <>
      <div className="workspace-primary">{mode === "system" ? <SystemWorkspace index={systemIndex} workIndex={workIndex} scope={scope} selectedRef={systemSelection} directions={directions} camera={systemCamera} readOnlyReason={readOnly ? readOnlyReason : null} onScope={(next) => { setScope(next); void reloadSystem(next); }} onSelect={selectObject} onCameraChange={setSystemCamera} onMutate={async (mutations: SystemMutation[]) => { if (!systemIndex) return; await mutateSystem(venture.id, systemIndex.revision, mutations); await afterMutation(); }} onMutateArchitecture={async (operations, reason) => { if (!systemIndex) return; await mutateArchitecture(venture.id, { baseRevision: systemIndex.architectureRevision, operations, reason }); await afterMutation(); }} onOpenWork={(ref) => { openThread(ref); setMode("work"); }} /> : <ReleaseWorkspace index={releaseIndex} release={releaseDetail} subview={releaseSubview} draftContext={releaseSeed} objects={systemIndexAll?.objects ?? []} threads={workIndex?.items ?? []} readOnlyReason={readOnly ? readOnlyReason : null} onSubview={setReleaseSubview} onOpenChat={() => undefined} onCreate={async (value) => { if (!releaseIndex) return; const seeded = releaseSeed?.kind === "object" ? { objectRef: releaseSeed.ref } : releaseSeed?.kind === "thread" ? { threadRef: releaseSeed.ref } : {}; const result = await createRelease(venture.id, releaseIndex.revision, { ...value, ...seeded }); setReleaseIndex(result.releaseIndex); selectRelease(result.release.id); }} onMutate={async (mutations) => { if (!releaseDetail) return; const result = await mutateRelease(venture.id, releaseDetail.id, releaseDetail.revision, mutations); setReleaseDetail(result.release); setReleaseIndex(result.releaseIndex); await reloadSystem(scope); }} onChanged={() => { refresh(); void reloadReleases().then(() => releaseSelection ? getRelease(venture.id, releaseSelection).then((result) => setReleaseDetail(result.release)) : undefined); }} />}</div>
      <div className="workspace-chat">{conversation}</div>
    </>}
    <AnimatePresence initial={false}>{stage ? <VisualStage key={`${stage.kind}:${stage.ref}`} visual={stage} timeline={timeline.timeline} workIndex={workIndex} directions={directions} lens={lens} readOnlyReason={readOnly ? readOnlyReason : null} onClose={() => { setStage(null); opener.current?.focus(); }} onOpenThread={openThread} onChanged={() => { refresh(); void timeline.refresh(); }} /> : null}</AnimatePresence>
  </div>;
}
