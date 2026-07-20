import { Menu, MessageCircle, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createRelease,
  checkReleaseObservation,
  getRelease,
  getReleaseIndex,
  getSystemIndex,
  getWorkIndex,
  grantReleaseObservation,
  listVentures,
  markWorkIndexReviewed,
  mutateArchitecture,
  mutateRelease,
  mutateSystem,
  revokeReleaseObservation,
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
import { ReleaseWorkspace, type ReleaseSeed } from "@/components/release-mode/ReleaseWorkspace";
import { FirmSettings } from "@/components/firm/FirmSettings";
import { SystemWorkspace } from "@/components/system-mode/SystemWorkspace";
import { ThreadConversation } from "@/components/thread/ThreadConversation";
import { useThreadTimeline } from "@/components/thread/useThreadTimeline";
import { VisualStage } from "@/components/visual-stage/VisualStage";
import { WorkPreview, WorkSurface, WorkTerminal } from "@/components/work-mode";
import { directionsFromWorkIndex } from "@/components/workspace/workIndexModel";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { readWorkspaceSession, rememberWorkspaceSession, type WorkspaceMode } from "@/lib/venture-session";
import { WorkspaceRail } from "./WorkspaceRail";
import { useSavedSystemViews } from "./useSavedSystemViews";
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
  const [draftRelatedRefs, setDraftRelatedRefs] = useState<string[]>([]);
  const [stage, setStage] = useState<VisualReference | null>(null);
  const [railWidth, setRailWidth] = useState(initial.railWidth);
  const [contextualChatOpen, setContextualChatOpen] = useState(initial.contextualChatOpen);
  const [scrolls, setScrolls] = useState(initial.chatScrollByThread);
  const [railOpen, setRailOpen] = useState(false);
  const [settingsConnection, setSettingsConnection] = useState<"gmail" | null | undefined>(undefined);
  const [scope, setScope] = useState(initial.systemScope);
  const [systemSelection, setSystemSelection] = useState(initial.selectedObjectRef);
  const [systemCamera, setSystemCamera] = useState(initial.systemCamera);
  const [releaseSelection, setReleaseSelection] = useState(initial.selectedReleaseId);
  const [search, setSearch] = useState("");
  const [searchWork, setSearchWork] = useState<WorkIndex | null>(null);
  const [systemIndexAll, setSystemIndexAll] = useState<SystemIndex | null>(null);
  const [releaseIndex, setReleaseIndex] = useState<ReleaseIndex | null>(null);
  const [releaseDetail, setReleaseDetail] = useState<ReleaseDetail | null>(null);
  const [ventures, setVentures] = useState<FirmVenture[]>([venture]);
  const opener = useRef<HTMLElement | null>(null);
  const draftStartedAt = useRef<number | null>(null);

  const contextualThread = useMemo(() => {
    if (!draft || !draftSubjectRef || !workIndex) return null;
    const object = systemIndexAll?.objects.find((entry) => entry.objectRef === draftSubjectRef);
    const release = releaseIndex?.releases.find((entry) => entry.releaseRef === draftSubjectRef);
    return latestLinkedThread([
      ...(object?.threadRefs ?? release?.threadRefs ?? []),
      ...workIndex.items.filter((item) => item.subjectRefs.includes(draftSubjectRef)).map((item) => item.threadRef),
    ], workIndex);
  }, [draft, draftSubjectRef, releaseIndex?.releases, systemIndexAll?.objects, workIndex]);
  const activeDraft = draft && !contextualThread;
  const requestedThreadRef = contextualThread?.threadRef ?? threadRef;
  const resolvedThreadRef = activeDraft ? null : requestedThreadRef && (requestedThreadRef === ROOT_REF || workIndex?.items.some((item) => item.threadRef === requestedThreadRef))
    ? requestedThreadRef
    : workIndex ? workIndex.items[0]?.threadRef ?? ROOT_REF : requestedThreadRef;
  const timeline = useThreadTimeline(venture.id, activeDraft ? null : resolvedThreadRef, workIndex?.revision ?? null);
  const selectedItem = useMemo(() => activeDraft ? null : resolvedThreadRef === ROOT_REF
    ? rootItem(venture.id)
    : workIndex?.items.find((item) => item.threadRef === resolvedThreadRef) ?? null,
  [activeDraft, resolvedThreadRef, venture.id, workIndex]);
  const directions = useMemo(() => workIndex && lens ? directionsFromWorkIndex(workIndex, lens) : [], [lens, workIndex]);
  const selectedObject = systemIndexAll?.objects.find((entry) => entry.objectRef === systemSelection) ?? null;
  const selectedRelease = releaseIndex?.releases.find((entry) => entry.id === releaseSelection) ?? null;
  const releaseSeed = useMemo<ReleaseSeed>(() => {
    if (selectedObject) {
      const coding = selectedObject.properties?.coding && typeof selectedObject.properties.coding === "object"
        ? selectedObject.properties.coding as Record<string, unknown>
        : null;
      const threadRef = typeof coding?.threadRef === "string" ? coding.threadRef : undefined;
      const workLabel = threadRef ? workIndex?.items.find((item) => item.threadRef === threadRef)?.founderIntent : undefined;
      const releaseQuestion = typeof coding?.releaseQuestion === "string" ? coding.releaseQuestion : "";
      return {
        kind: "object", ref: selectedObject.objectRef, label: selectedObject.name,
        suggestedRole: selectedObject.territory === "gtm" ? "Distribution" : selectedObject.type === "claim" ? "Supported claim or offer" : "Product delta",
        name: selectedObject.name, statement: releaseQuestion || selectedObject.statement,
        objectRef: selectedObject.objectRef, ...(threadRef ? { threadRef } : {}), ...(workLabel ? { workLabel } : {}),
      };
    }
    if (selectedItem && selectedItem.threadRef !== ROOT_REF) return {
      kind: "thread", ref: selectedItem.threadRef, label: selectedItem.founderIntent, suggestedRole: "Exact work",
      name: selectedItem.founderIntent, statement: "", threadRef: selectedItem.threadRef, workLabel: selectedItem.founderIntent,
    };
    return null;
  }, [selectedItem, selectedObject, workIndex?.items]);
  const readOnly = ["stale", "offline", "read-only"].includes(connection.phase);
  const readOnlyReason = connection.phase === "offline" ? "Offline. Nothing consequential can change until Drover is current again." : connection.message ?? "Drover is reconnecting.";

  const reloadSystem = useCallback(async () => {
    const result = await getSystemIndex(venture.id, "system", "");
    setSystemIndexAll(result.systemIndex);
  }, [venture.id]);
  const reloadReleases = useCallback(async () => {
    const result = await getReleaseIndex(venture.id, "");
    setReleaseIndex(result.releaseIndex);
  }, [venture.id]);

  useEffect(() => { void listVentures().then((value) => setVentures(value.ventures)).catch(() => undefined); }, [venture.id]);
  useEffect(() => {
    void getSystemIndex(venture.id, "system", "").then((result) => setSystemIndexAll(result.systemIndex)).catch(() => undefined);
    void getReleaseIndex(venture.id, "").then((result) => setReleaseIndex(result.releaseIndex)).catch(() => undefined);
  }, [venture.id, workIndex?.revision]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mode !== "work" || !search.trim()) setSearchWork(null);
      else void getWorkIndex(venture.id, search).then((value) => setSearchWork(value.workIndex)).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mode, search, venture.id]);
  useEffect(() => {
    if (!releaseSelection) return;
    void getRelease(venture.id, releaseSelection).then((result) => setReleaseDetail(result.release)).catch(() => setReleaseDetail(null));
  }, [releaseIndex?.revision, releaseSelection, venture.id]);
  useEffect(() => rememberWorkspaceSession(venture.id, {
    mode, railWidth, contextualChatOpen, selectedThreadRef: resolvedThreadRef, selectedObjectRef: systemSelection,
    selectedReleaseId: releaseSelection, systemScope: scope, systemCamera, chatScrollByThread: scrolls,
  }), [contextualChatOpen, mode, railWidth, releaseSelection, resolvedThreadRef, scope, scrolls, systemCamera, systemSelection, venture.id]);

  const openThread = useCallback((next: string) => {
    setThreadRef(next); setDraft(false); setDraftSubjectRef(null); setDraftRelatedRefs([]); setStage(null); setRailOpen(false);
  }, []);
  const beginScopedThread = useCallback((subjectRef: string, relatedRefs: string[] = []) => {
    setThreadRef(null); setDraft(true); setDraftSubjectRef(subjectRef); setDraftRelatedRefs(relatedRefs); setStage(null); setRailOpen(false);
  }, []);
  const selectThread = useCallback((item: WorkIndexItem) => {
    openThread(item.threadRef);
    if (item.unread && !readOnly && !item.threadRef.startsWith("thread:legacy-")) {
      void markWorkIndexReviewed(venture.id, item).then((response) => setWorkIndex(response.workIndex)).catch(refresh);
    }
  }, [openThread, readOnly, refresh, setWorkIndex, venture.id]);
  const selectObject = useCallback((object: SystemIndexObject | null, directThreadRef: string | null = null) => {
    setSystemSelection(object?.objectRef ?? null);
    if (!object) return;
    if (directThreadRef) {
      openThread(directThreadRef);
      return;
    }
    const linkedRefs = [...new Set([
      ...object.threadRefs,
      ...(workIndex?.items ?? []).filter((item) => item.subjectRefs.includes(object.objectRef)).map((item) => item.threadRef),
    ])];
    const linked = latestLinkedThread(linkedRefs, workIndex);
    if (linked) openThread(linked.threadRef); else beginScopedThread(object.objectRef);
  }, [beginScopedThread, openThread, workIndex]);
  const savedSystemViews = useSavedSystemViews({
    ventureId: venture.id, index: systemIndexAll, selected: selectedObject, scope,
    onScope: setScope, onSelect: (object) => selectObject(object), onCamera: setSystemCamera,
  });
  const selectRelease = useCallback((id: string | null) => {
    setReleaseSelection(id);
    if (!id) { setReleaseDetail(null); return; }
    const release = releaseIndex?.releases.find((entry) => entry.id === id);
    const linked = latestLinkedThread(release?.threadRefs ?? [], workIndex);
    if (linked) openThread(linked.threadRef); else beginScopedThread(release?.releaseRef ?? `object:${id}`);
  }, [beginScopedThread, openThread, releaseIndex?.releases, workIndex]);
  const changeMode = useCallback((next: WorkspaceMode, source?: HTMLElement) => {
    if (next === mode) return;
    if (next === "system" && resolvedThreadRef) {
      const directlyLinked = systemIndexAll?.objects.filter((object) => object.threadRefs.includes(resolvedThreadRef)) ?? [];
      const currentStillLinked = directlyLinked.find((object) => object.objectRef === systemSelection);
      const nearest = currentStillLinked ?? directlyLinked.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0];
      setSystemSelection(nearest?.objectRef ?? null);
    }
    opener.current = source ?? null; setMode(next); setSearch(""); setRailOpen(false); setStage(null);
  }, [mode, resolvedThreadRef, systemIndexAll?.objects, systemSelection]);
  const newThread = useCallback(() => {
    setDraft(true); setDraftSubjectRef(null); setDraftRelatedRefs([]); setThreadRef(null); setStage(null); setRailOpen(false);
  }, []);
  const rememberThreadScroll = useCallback((ref: string, top: number) => {
    setScrolls((current) => current[ref] === top ? current : { ...current, [ref]: top });
  }, []);
  const afterMutation = useCallback(async () => {
    await Promise.all([reloadSystem(), reloadReleases()]);
    refresh();
  }, [refresh, reloadReleases, reloadSystem]);

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
      if (event.key !== "Escape") return;
      if (stage) { event.preventDefault(); setStage(null); opener.current?.focus(); return; }
      if (mode !== "work" && contextualChatOpen) { event.preventDefault(); setContextualChatOpen(false); opener.current?.focus(); }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [contextualChatOpen, mode, stage]);
  useEffect(() => {
    if (!draft || !workIndex || draftStartedAt.current == null) return;
    const created = workIndex.items.find((item) => Date.parse(item.createdAt ?? "") >= draftStartedAt.current! - 1000);
    if (created) { setDraft(false); setThreadRef(created.threadRef); setDraftSubjectRef(null); setDraftRelatedRefs([]); draftStartedAt.current = null; }
  }, [draft, workIndex]);

  const openVisual = useCallback((visual: VisualReference, source: HTMLElement) => {
    const timelineItem = timeline.timeline?.items.find((candidate) => candidate.ref === visual.ref || candidate.visual?.ref === visual.ref);
    const artifact = timelineItem?.artifact as { kind?: string } | undefined;
    if (artifact?.kind === "native-code" && mode === "work") {
      const changesTab = document.getElementById("work-tab-changes") as HTMLButtonElement | null;
      changesTab?.click();
      changesTab?.focus();
      return;
    }
    if (visual.kind === "map") {
      setMode("system");
      setStage(null);
      return;
    }
    if (visual.kind === "consequence") {
      const linkedRelease = (releaseIndex?.releases ?? [])
        .filter((release) => release.threadRefs.includes(visual.threadRef) || selectedItem?.subjectRefs.includes(release.releaseRef))
        .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))[0];
      if (linkedRelease) {
        setReleaseSelection(linkedRelease.id);
        setMode("releases");
        setStage(null);
        return;
      }
    }
    opener.current = source;
    setStage(visual);
  }, [mode, releaseIndex?.releases, selectedItem?.subjectRefs, timeline.timeline]);

  const conversation = <ThreadConversation ventureId={venture.id} ventureName={venture.name} repository={venture.repository} surface={mode === "work" ? "work" : "context"} item={selectedItem} timeline={timeline.timeline} lens={lens} connection={connection} loading={timeline.loading} error={timeline.error} draft={activeDraft} subjectRefs={activeDraft && draftSubjectRef ? [draftSubjectRef, ...draftRelatedRefs] : []} scopeLabel={draftSubjectRef === selectedObject?.objectRef ? selectedObject.name : draftSubjectRef === selectedRelease?.releaseRef ? selectedRelease.name : null} initialScrollTop={resolvedThreadRef ? scrolls[resolvedThreadRef] ?? null : null} onScrollChange={rememberThreadScroll} onOpenVisual={openVisual} onOpenThread={openThread} onTogglePin={() => { if (!selectedItem || selectedItem.threadRef === ROOT_REF) return; void setThreadPinned(venture.id, selectedItem.threadRef, !selectedItem.pinnedAt).then((response) => setWorkIndex(response.workIndex)).catch(refresh); }} onDriven={() => { draftStartedAt.current = activeDraft ? Date.now() : null; refresh(); void timeline.refresh(); }} />;

  return <div className="workspace-shell" data-mode={mode} data-stage-open={stage ? "true" : undefined} data-chat-open={mode !== "work" && contextualChatOpen ? "true" : undefined} data-rail-open={railOpen ? "true" : undefined} style={{ "--thread-rail-width": `${railWidth}px` } as React.CSSProperties}>
    <button type="button" className="thread-rail-launcher" aria-label="Open workspace rail" aria-expanded={railOpen} onClick={() => setRailOpen((value) => !value)}><Menu aria-hidden="true" /></button>
    <WorkspaceRail venture={venture} ventures={ventures} mode={mode} width={railWidth} search={search} selectedThread={resolvedThreadRef} workIndex={searchWork ?? workIndex} systemIndex={systemIndexAll} scope={scope} selectedObjectRef={systemSelection} savedViews={savedSystemViews.views} savedViewsError={savedSystemViews.loadError} readOnlyReason={readOnly ? readOnlyReason : null} releaseIndex={releaseIndex} selectedReleaseId={releaseSelection} canStartRelease={Boolean(releaseSeed)} onMode={changeMode} onSearch={setSearch} onSelectThread={selectThread} onSelectObject={selectObject} onScope={setScope} onSelectRelease={selectRelease} onNew={newThread} onStartRelease={() => { if (releaseSeed) selectRelease(null); }} onSaveView={savedSystemViews.save} onReopenView={savedSystemViews.reopen} onDeleteView={savedSystemViews.remove} onSwitchVenture={onOpenVenture} onResize={setRailWidth} onSettings={() => setSettingsConnection(null)} />
    {mode === "work" ? <div className="workspace-work"><WorkSurface ventureId={venture.id} timeline={timeline.timeline} conversation={conversation} readOnlyReason={readOnly ? readOnlyReason : null} renderPreview={(workspace) => <WorkPreview workspaceId={workspace.id} disabledReason={readOnly ? readOnlyReason : null} unavailableReason={!workspace.worktree ? workspace.status === "discarded" ? "This coding worktree was discarded. Its files and receipts remain available for review." : "The isolated coding worktree is unavailable." : null} />} renderTerminal={(workspace) => <WorkTerminal ventureId={venture.id} workspaceId={workspace.id} disabledReason={readOnly ? readOnlyReason : null} unavailableReason={!workspace.worktree ? workspace.status === "discarded" ? "This coding worktree was discarded. Its files and receipts remain available for review." : "The isolated coding worktree is unavailable." : null} />} onWorkspaceChanged={() => { refresh(); void timeline.refresh(); void reloadSystem(); void reloadReleases(); }} /></div> : <>
      <div className="workspace-primary">{mode === "system" ? <SystemWorkspace index={systemIndexAll} workIndex={workIndex} scope={scope} selectedRef={systemSelection} directions={directions} camera={systemCamera} readOnlyReason={readOnly ? readOnlyReason : null} onScope={setScope} onSelect={selectObject} onCameraChange={setSystemCamera} onMutate={async (mutations: SystemMutation[]) => { if (!systemIndexAll) return; await mutateSystem(venture.id, systemIndexAll.revision, mutations); await afterMutation(); }} onMutateArchitecture={async (operations, reason) => { if (!systemIndexAll) return; await mutateArchitecture(venture.id, { baseRevision: systemIndexAll.architectureRevision, operations, reason }); await afterMutation(); }} onOpenWork={(ref) => { openThread(ref); setMode("work"); }} onStartWork={(refs) => { const [subjectRef, ...relatedRefs] = refs; if (!subjectRef) return; beginScopedThread(subjectRef, relatedRefs); setMode("work"); }} /> : <ReleaseWorkspace index={releaseIndex} release={releaseDetail} draftContext={releaseSeed} objects={systemIndexAll?.objects ?? []} threads={workIndex?.items ?? []} readOnlyReason={readOnly ? readOnlyReason : null} onCreate={async (value) => { if (!releaseIndex || !releaseSeed) return; const result = await createRelease(venture.id, releaseIndex.revision, { ...value, ...(releaseSeed.objectRef ? { objectRef: releaseSeed.objectRef } : {}), ...(releaseSeed.threadRef ? { threadRef: releaseSeed.threadRef } : {}) }); setReleaseIndex(result.releaseIndex); selectRelease(result.release.id); }} onMutate={async (mutations) => { if (!releaseDetail) return; const result = await mutateRelease(venture.id, releaseDetail.id, releaseDetail.revision, mutations); setReleaseDetail(result.release); setReleaseIndex(result.releaseIndex); await reloadSystem(); }} onChanged={() => { refresh(); void reloadReleases().then(() => releaseSelection ? getRelease(venture.id, releaseSelection).then((result) => setReleaseDetail(result.release)) : undefined); }} onReconnect={() => setSettingsConnection("gmail")} onGrantObservation={async (value) => { if (!releaseDetail) return; await grantReleaseObservation(venture.id, releaseDetail.id, value); const result = await getRelease(venture.id, releaseDetail.id); setReleaseDetail(result.release); await reloadReleases(); }} onCheckObservation={async (contractId) => { if (!releaseDetail) return; await checkReleaseObservation(venture.id, releaseDetail.id, contractId); const result = await getRelease(venture.id, releaseDetail.id); setReleaseDetail(result.release); refresh(); void reloadSystem(); }} onRevokeObservation={async (contractId) => { if (!releaseDetail) return; await revokeReleaseObservation(venture.id, releaseDetail.id, contractId); const result = await getRelease(venture.id, releaseDetail.id); setReleaseDetail(result.release); await reloadReleases(); }} />}</div>
      {contextualChatOpen ? <aside className="workspace-chat" aria-label="Ask Drover"><button type="button" className="workspace-chat-close" aria-label="Close Ask Drover" onClick={() => { setContextualChatOpen(false); opener.current?.focus(); }}><X aria-hidden="true" /></button>{conversation}</aside> : <div className="workspace-fab"><button type="button" onClick={(event) => { opener.current = event.currentTarget; setContextualChatOpen(true); }}><MessageCircle aria-hidden="true" />Ask Drover</button></div>}
    </>}
    <AnimatePresence initial={false}>{stage ? <VisualStage key={`${stage.kind}:${stage.ref}`} visual={stage} timeline={timeline.timeline} workIndex={workIndex} directions={directions} lens={lens} readOnlyReason={readOnly ? readOnlyReason : null} onClose={() => { setStage(null); opener.current?.focus(); }} onOpenThread={openThread} onChanged={() => { refresh(); void timeline.refresh(); }} /> : null}</AnimatePresence>
    {settingsConnection !== undefined ? <FirmSettings key={settingsConnection ?? "settings"} venture={venture} readOnly={readOnly} readOnlyReason={readOnlyReason} initialConnection={settingsConnection} onCapabilitiesChanged={() => { refresh(); void reloadReleases(); }} onClose={() => setSettingsConnection(undefined)} /> : null}
  </div>;
}
