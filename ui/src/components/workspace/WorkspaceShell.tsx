import { Menu, MessageCircle, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createRelease,
  checkReleaseObservation,
  getRelease,
  getReleaseIndex,
  getCredentials,
  getSystemIndex,
  getWorkIndex,
  grantReleaseObservation,
  listVentures,
  markWorkIndexReviewed,
  mutateRelease,
  revokeReleaseObservation,
  replyInConversation,
  setThreadPinned,
  type FirmVenture,
  type FounderCredential,
  type ReleaseDetail,
  type ReleaseIndex,
  type SystemIndex,
  type SystemIndexObject,
  type VisualReference,
  type WorkIndex,
  type WorkIndexItem,
} from "@/api";
import {
  ReleaseWorkspace,
  type ReleaseSeed,
} from "@/components/release-mode/ReleaseWorkspace";
import { FirmSettings } from "@/components/firm/FirmSettings";
import { SystemWorkspace } from "@/components/system-mode/SystemWorkspace";
import { adoptedWorkflowVersions, adoptWorkflowSketch } from "@/components/system-mode/workflowAdoption";
import { ThreadConversation } from "@/components/thread/ThreadConversation";
import { useThreadTimeline } from "@/components/thread/useThreadTimeline";
import { VisualStage } from "@/components/visual-stage/VisualStage";
import { WorkPreview, WorkSurface, WorkTerminal } from "@/components/work-mode";
import type { WorkflowSketch } from "@/components/work-mode/workflowSketch";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";
import { directionsFromWorkIndex } from "@/components/workspace/workIndexModel";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import {
  readWorkspaceSession,
  rememberWorkspaceSession,
  type ProductWorkspaceSection,
  type WorkspaceMode,
} from "@/lib/venture-session";
import { WorkspaceRail } from "./WorkspaceRail";
import { latestAgentThread } from "./agentThreadSelection";
import { useSavedSystemViews } from "./useSavedSystemViews";
import { workflowCapabilities } from "./workflowCapabilities";
import "./workspace-shell.css";

const ROOT_REF = "thread:venture-root";
const MODE_ORDER: Record<WorkspaceMode, number> = { work: 0, system: 1, releases: 1 };
const MODE_EASE = [0.22, 1, 0.36, 1] as const;

function modeSurfaceMotion({ animate, direction }: { animate: boolean; direction: number }) {
  const move = animate ? direction * 10 : 0;
  return {
    initial: move ? { opacity: 0, y: move } : false,
    animate: { opacity: 1, y: 0 },
    exit: move ? { opacity: 0, y: move * -0.4 } : { opacity: 0 },
    transition: { duration: move ? 0.18 : 0, ease: MODE_EASE },
  };
}
const rootItem = (ventureId: string): WorkIndexItem => ({
  threadRef: ROOT_REF,
  ventureRef: `venture:${ventureId}`,
  parentThreadRef: null,
  originMessageRef: null,
  subjectRefs: [`venture:${ventureId}`],
  focusRef: ROOT_REF,
  founderIntent: "Drover",
  lifecycle: "open",
  activity: "idle",
  attention: "none",
  terminal: null,
  unread: false,
  reviewedThrough: null,
  latestMeaningfulEvent: {
    kind: "created",
    ref: ROOT_REF,
    at: null,
    summary: null,
  },
  runRefs: [],
  pinnedAt: null,
  participantRefs: [],
  activeParticipantRefs: [],
  createdAt: null,
  updatedAt: null,
});

function latestLinkedThread(refs: string[], workIndex: WorkIndex | null) {
  const wanted = new Set(refs);
  return (
    (workIndex?.items ?? [])
      .filter((item) => wanted.has(item.threadRef))
      .sort((a, b) =>
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
      )[0] ?? null
  );
}

export function WorkspaceShell({
  venture,
  onOpenVenture,
}: {
  venture: FirmVenture;
  onOpenVenture: (venture: FirmVenture) => void;
}) {
  const initial = useMemo(() => readWorkspaceSession(venture.id), [venture.id]);
  const connectionState = useFirmConnection(venture.id);
  const { lens, workIndex, connection, refresh, setWorkIndex } =
    connectionState;
  const [mode, setMode] = useState<WorkspaceMode>(initial.mode === "work" ? "work" : "system");
  const [productSection, setProductSection] = useState<ProductWorkspaceSection>(initial.productSection);
  const [modeMotion, setModeMotion] = useState({ animate: false, direction: 0 });
  const reducedMotion = useReducedMotion();
  const [threadRef, setThreadRef] = useState(initial.selectedThreadRef);
  const [selectedAgentRef, setSelectedAgentRef] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);
  const [draftSubjectRef, setDraftSubjectRef] = useState<string | null>(null);
  const [draftRelatedRefs, setDraftRelatedRefs] = useState<string[]>([]);
  const [stage, setStage] = useState<VisualReference | null>(null);
  const [artifactFocus, setArtifactFocus] = useState<ArtifactSectionFocus | null>(null);
  const [artifactFocusRequest, setArtifactFocusRequest] = useState(0);
  const [railWidth, setRailWidth] = useState(initial.railWidth);
  const [contextualChatOpen, setContextualChatOpen] = useState(
    initial.contextualChatOpen,
  );
  const [scrolls, setScrolls] = useState(initial.chatScrollByThread);
  const [railOpen, setRailOpen] = useState(false);
  const [settingsConnection, setSettingsConnection] = useState<
    "gmail" | null | undefined
  >(undefined);
  const [scope, setScope] = useState(initial.systemScope);
  const [systemSelection, setSystemSelection] = useState(
    initial.selectedObjectRef,
  );
  const [systemCamera, setSystemCamera] = useState(initial.systemCamera);
  const [releaseSelection, setReleaseSelection] = useState(
    initial.selectedReleaseId,
  );
  const [search, setSearch] = useState("");
  const [searchWork, setSearchWork] = useState<WorkIndex | null>(null);
  const [systemIndexAll, setSystemIndexAll] = useState<SystemIndex | null>(
    null,
  );
  const [releaseIndex, setReleaseIndex] = useState<ReleaseIndex | null>(null);
  const [releaseDetail, setReleaseDetail] = useState<ReleaseDetail | null>(
    null,
  );
  const [ventures, setVentures] = useState<FirmVenture[]>([venture]);
  const [credentials, setCredentials] = useState<FounderCredential[]>([]);
  const opener = useRef<HTMLElement | null>(null);
  const draftStartedAt = useRef<number | null>(null);
  const capabilities = useMemo(() => workflowCapabilities(credentials, lens?.configuration?.agents ?? []), [credentials, lens?.configuration?.agents]);
  const workflowVersions = useMemo(() => adoptedWorkflowVersions(systemIndexAll), [systemIndexAll]);

  useEffect(() => { void getCredentials().then((response) => setCredentials(response.credentials)).catch(() => setCredentials([])); }, [settingsConnection]);

  const contextualThread = useMemo(() => {
    if (!draft || !draftSubjectRef || !workIndex) return null;
    const object = systemIndexAll?.objects.find(
      (entry) => entry.objectRef === draftSubjectRef,
    );
    const release = releaseIndex?.releases.find(
      (entry) => entry.releaseRef === draftSubjectRef,
    );
    return latestLinkedThread(
      [
        ...(object?.threadRefs ?? release?.threadRefs ?? []),
        ...workIndex.items
          .filter((item) => item.subjectRefs.includes(draftSubjectRef))
          .map((item) => item.threadRef),
      ],
      workIndex,
    );
  }, [
    draft,
    draftSubjectRef,
    releaseIndex?.releases,
    systemIndexAll?.objects,
    workIndex,
  ]);
  const activeDraft = draft && !contextualThread;
  const requestedThreadRef = contextualThread?.threadRef ?? threadRef;
  const resolvedThreadRef = activeDraft
    ? null
    : requestedThreadRef &&
        (requestedThreadRef === ROOT_REF ||
          workIndex?.items.some(
            (item) => item.threadRef === requestedThreadRef,
          ))
      ? requestedThreadRef
      : workIndex
        ? (workIndex.items[0]?.threadRef ?? ROOT_REF)
        : requestedThreadRef;
  const timeline = useThreadTimeline(
    venture.id,
    activeDraft ? null : resolvedThreadRef,
    workIndex?.revision ?? null,
  );
  const selectedItem = useMemo(
    () =>
      activeDraft
        ? null
        : resolvedThreadRef === ROOT_REF
          ? rootItem(venture.id)
          : (workIndex?.items.find(
              (item) => item.threadRef === resolvedThreadRef,
            ) ?? null),
    [activeDraft, resolvedThreadRef, venture.id, workIndex],
  );
  const directions = useMemo(
    () => (workIndex && lens ? directionsFromWorkIndex(workIndex, lens) : []),
    [lens, workIndex],
  );
  const selectedObject =
    systemIndexAll?.objects.find(
      (entry) => entry.objectRef === systemSelection,
    ) ?? null;
  const selectedRelease =
    releaseIndex?.releases.find((entry) => entry.id === releaseSelection) ??
    null;
  const releaseSeed = useMemo<ReleaseSeed>(() => {
    if (selectedObject) {
      const coding =
        selectedObject.properties?.coding &&
        typeof selectedObject.properties.coding === "object"
          ? (selectedObject.properties.coding as Record<string, unknown>)
          : null;
      const threadRef =
        typeof coding?.threadRef === "string" ? coding.threadRef : undefined;
      const workLabel = threadRef
        ? workIndex?.items.find((item) => item.threadRef === threadRef)
            ?.founderIntent
        : undefined;
      const releaseQuestion =
        typeof coding?.releaseQuestion === "string"
          ? coding.releaseQuestion
          : "";
      return {
        kind: "object",
        ref: selectedObject.objectRef,
        label: selectedObject.name,
        suggestedRole:
          selectedObject.territory === "gtm"
            ? "Distribution"
            : selectedObject.type === "claim"
              ? "Supported claim or offer"
              : "Product delta",
        name: selectedObject.name,
        statement: releaseQuestion || selectedObject.statement,
        objectRef: selectedObject.objectRef,
        ...(threadRef ? { threadRef } : {}),
        ...(workLabel ? { workLabel } : {}),
      };
    }
    return null;
  }, [selectedObject, workIndex?.items]);
  const readOnly = ["stale", "offline", "read-only"].includes(connection.phase);
  const readOnlyReason =
    connection.phase === "offline"
      ? "Offline. Nothing consequential can change until Drover is current again."
      : (connection.message ?? "Drover is reconnecting.");

  const reloadSystem = useCallback(async () => {
    const result = await getSystemIndex(venture.id, "system", "");
    setSystemIndexAll(result.systemIndex);
  }, [venture.id]);
  const reloadReleases = useCallback(async () => {
    const result = await getReleaseIndex(venture.id, "");
    setReleaseIndex(result.releaseIndex);
  }, [venture.id]);

  useEffect(() => {
    void listVentures()
      .then((value) => setVentures(value.ventures))
      .catch(() => undefined);
  }, [venture.id]);
  useEffect(() => {
    void getSystemIndex(venture.id, "system", "")
      .then((result) => setSystemIndexAll(result.systemIndex))
      .catch(() => undefined);
    void getReleaseIndex(venture.id, "")
      .then((result) => setReleaseIndex(result.releaseIndex))
      .catch(() => undefined);
  }, [venture.id, workIndex?.revision]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mode !== "work" || !search.trim()) setSearchWork(null);
      else
        void getWorkIndex(venture.id, search)
          .then((value) => setSearchWork(value.workIndex))
          .catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mode, search, venture.id]);
  useEffect(() => {
    if (!releaseSelection) return;
    void getRelease(venture.id, releaseSelection)
      .then((result) => setReleaseDetail(result.release))
      .catch(() => setReleaseDetail(null));
  }, [releaseIndex?.revision, releaseSelection, venture.id]);
  useEffect(
    () =>
      rememberWorkspaceSession(venture.id, {
        mode,
        productSection,
        railWidth,
        contextualChatOpen,
        selectedThreadRef: resolvedThreadRef,
        selectedObjectRef: systemSelection,
        selectedReleaseId: releaseSelection,
        systemScope: scope,
        systemCamera,
        chatScrollByThread: scrolls,
      }),
    [
      contextualChatOpen,
      mode,
      productSection,
      railWidth,
      releaseSelection,
      resolvedThreadRef,
      scope,
      scrolls,
      systemCamera,
      systemSelection,
      venture.id,
    ],
  );

  const openThread = useCallback((next: string) => {
    setSelectedAgentRef(null);
    setThreadRef(next);
    setDraft(false);
    setDraftSubjectRef(null);
    setDraftRelatedRefs([]);
    setStage(null);
    setArtifactFocus(null);
    setRailOpen(false);
  }, []);
  const beginScopedThread = useCallback(
    (subjectRef: string, relatedRefs: string[] = []) => {
      setThreadRef(null);
      setDraft(true);
      setDraftSubjectRef(subjectRef);
      setDraftRelatedRefs(relatedRefs);
      setStage(null);
      setArtifactFocus(null);
      setRailOpen(false);
    },
    [],
  );
  const selectThread = useCallback(
    (item: WorkIndexItem) => {
      openThread(item.threadRef);
      if (
        item.unread &&
        !readOnly &&
        !item.threadRef.startsWith("thread:legacy-")
      ) {
        void markWorkIndexReviewed(venture.id, item)
          .then((response) => setWorkIndex(response.workIndex))
          .catch(refresh);
      }
    },
    [openThread, readOnly, refresh, setWorkIndex, venture.id],
  );
  const selectObject = useCallback(
    (
      object: SystemIndexObject | null,
      directThreadRef: string | null = null,
    ) => {
      setSystemSelection(object?.objectRef ?? null);
      setProductSection("canvas");
      if (!object) return;
      if (directThreadRef) {
        openThread(directThreadRef);
        return;
      }
      const linkedRefs = [
        ...new Set([
          ...object.threadRefs,
          ...(workIndex?.items ?? [])
            .filter((item) => item.subjectRefs.includes(object.objectRef))
            .map((item) => item.threadRef),
        ]),
      ];
      const linked = latestLinkedThread(linkedRefs, workIndex);
      if (linked) openThread(linked.threadRef);
      else beginScopedThread(object.objectRef);
    },
    [beginScopedThread, openThread, workIndex],
  );
  const savedSystemViews = useSavedSystemViews({
    ventureId: venture.id,
    index: systemIndexAll,
    selected: selectedObject,
    scope,
    onScope: setScope,
    onSelect: (object) => selectObject(object),
    onCamera: setSystemCamera,
  });
  const selectRelease = useCallback(
    (id: string | null) => {
      setProductSection("releases");
      setReleaseSelection(id);
      if (!id) {
        setReleaseDetail(null);
        return;
      }
      const release = releaseIndex?.releases.find((entry) => entry.id === id);
      const linked = latestLinkedThread(release?.threadRefs ?? [], workIndex);
      if (linked) openThread(linked.threadRef);
      else beginScopedThread(release?.releaseRef ?? `object:${id}`);
    },
    [beginScopedThread, openThread, releaseIndex?.releases, workIndex],
  );
  const changeMode = useCallback(
    (next: WorkspaceMode, source?: HTMLElement, animate = false) => {
      const destination = next === "releases" ? "system" : next;
      if (next === "releases") setProductSection("releases");
      else if (destination === "system") setProductSection("canvas");
      if (destination === mode) return;
      if (destination === "system" && resolvedThreadRef) {
        const directlyLinked =
          systemIndexAll?.objects.filter((object) =>
            object.threadRefs.includes(resolvedThreadRef),
          ) ?? [];
        const currentStillLinked = directlyLinked.find(
          (object) => object.objectRef === systemSelection,
        );
        const nearest =
          currentStillLinked ??
          directlyLinked.sort((left, right) =>
            String(right.updatedAt).localeCompare(String(left.updatedAt)),
          )[0];
        setSystemSelection(nearest?.objectRef ?? null);
      }
      opener.current = source ?? null;
      setModeMotion({ animate: animate && !reducedMotion, direction: Math.sign(MODE_ORDER[destination] - MODE_ORDER[mode]) });
      setMode(destination);
      if (destination === "work") setSelectedAgentRef(null);
      setSearch("");
      setRailOpen(false);
      setStage(null);
      if (destination !== "work") setContextualChatOpen(false);
    },
    [mode, reducedMotion, resolvedThreadRef, systemIndexAll?.objects, systemSelection],
  );
  const newThread = useCallback(() => {
    setSelectedAgentRef(null);
    setDraft(true);
    setDraftSubjectRef(null);
    setDraftRelatedRefs([]);
    setThreadRef(null);
    setStage(null);
    setRailOpen(false);
  }, []);
  const assignAgentInSystem = useCallback(
    (ref: string, subjectRef?: string) => {
      const fallback = systemIndexAll?.objects.find((object) =>
        ["pipeline", "motion"].includes(object.type.toLowerCase()),
      )?.objectRef;
      const subject =
        subjectRef ??
        (selectedObject?.type === "pipeline"
          ? selectedObject.objectRef
          : fallback);
      setSelectedAgentRef(ref);
      if (subject) {
        setSystemSelection(subject);
        beginScopedThread(subject);
      }
      else newThread();
      setContextualChatOpen(true);
    },
    [beginScopedThread, newThread, selectedObject, systemIndexAll?.objects],
  );
  const rememberThreadScroll = useCallback((ref: string, top: number) => {
    setScrolls((current) =>
      current[ref] === top ? current : { ...current, [ref]: top },
    );
  }, []);
  const afterMutation = useCallback(async () => {
    await Promise.all([reloadSystem(), reloadReleases()]);
    refresh();
  }, [refresh, reloadReleases, reloadSystem]);
  const adoptWorkflow = useCallback(async (sketch: WorkflowSketch) => {
    if (!systemIndexAll) throw new Error("Product / GTM is still loading. Try again when the canvas is current.");
    const result = await adoptWorkflowSketch(venture.id, systemIndexAll, sketch);
    setSystemIndexAll(result.systemIndex);
    setSystemSelection(result.objectRef);
    setContextualChatOpen(false);
    setStage(null);
    setProductSection("canvas");
    setMode("system");
    refresh();
  }, [refresh, systemIndexAll, venture.id]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        !["1", "2"].includes(event.key)
      )
        return;
      event.preventDefault();
      changeMode(
        ({ "1": "work", "2": "system" } as const)[
          event.key as "1" | "2"
        ],
      );
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
        opener.current?.focus();
        return;
      }
      if (mode !== "work" && contextualChatOpen) {
        event.preventDefault();
        setContextualChatOpen(false);
        opener.current?.focus();
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [contextualChatOpen, mode, stage]);
  useEffect(() => {
    if (!draft || !workIndex || draftStartedAt.current == null) return;
    const created = selectedAgentRef
      ? latestAgentThread(workIndex.items, selectedAgentRef)
      : workIndex.items.find(
          (item) =>
            Date.parse(item.createdAt ?? "") >= draftStartedAt.current! - 1000,
        );
    if (created) {
      setSelectedAgentRef(null);
      setDraft(false);
      setThreadRef(created.threadRef);
      setDraftSubjectRef(null);
      setDraftRelatedRefs([]);
      draftStartedAt.current = null;
    }
  }, [draft, selectedAgentRef, workIndex]);

  const openVisual = useCallback(
    (visual: VisualReference, source: HTMLElement) => {
      const timelineItem = timeline.timeline?.items.find(
        (candidate) =>
          candidate.ref === visual.ref || candidate.visual?.ref === visual.ref,
      );
      const artifact = timelineItem?.artifact as { kind?: string } | undefined;
      if (artifact?.kind === "native-code" && mode === "work") {
        const changesTab = document.getElementById(
          "work-tab-changes",
        ) as HTMLButtonElement | null;
        changesTab?.click();
        changesTab?.focus();
        return;
      }
      if (visual.kind === "map") {
        setProductSection("canvas");
        setMode("system");
        setStage(null);
        return;
      }
      if (visual.kind === "consequence") {
        const linkedRelease = (releaseIndex?.releases ?? [])
          .filter(
            (release) =>
              release.threadRefs.includes(visual.threadRef) ||
              selectedItem?.subjectRefs.includes(release.releaseRef),
          )
          .sort((left, right) =>
            String(right.updatedAt ?? "").localeCompare(
              String(left.updatedAt ?? ""),
            ),
          )[0];
        if (linkedRelease) {
          setReleaseSelection(linkedRelease.id);
          setProductSection("releases");
          setMode("system");
          setStage(null);
          return;
        }
      }
      opener.current = source;
      setArtifactFocus(null);
      setStage(visual);
    },
    [
      mode,
      releaseIndex?.releases,
      selectedItem?.subjectRefs,
      timeline.timeline,
    ],
  );

  const conversation = (
    <ThreadConversation
      ventureId={venture.id}
      ventureName={venture.name}
      repository={venture.repository}
      surface={mode === "work" ? "work" : "context"}
      contextKind={mode === "system" ? (productSection === "releases" ? "release" : "product-gtm") : null}
      item={selectedItem}
      timeline={timeline.timeline}
      lens={lens}
      connection={connection}
      loading={timeline.loading}
      error={timeline.error}
      draft={activeDraft}
      subjectRefs={
        activeDraft && draftSubjectRef
          ? [draftSubjectRef, ...draftRelatedRefs]
          : []
      }
      scopeLabel={
        draftSubjectRef === selectedObject?.objectRef
          ? selectedObject.name
          : draftSubjectRef === selectedRelease?.releaseRef
            ? selectedRelease.name
            : null
      }
      targetAgentRef={activeDraft ? selectedAgentRef : null}
      artifactFocus={artifactFocus}
      artifactFocusRequest={artifactFocusRequest}
      onClearArtifactFocus={() => setArtifactFocus(null)}
      adoptedWorkflowVersions={workflowVersions}
      initialScrollTop={
        resolvedThreadRef ? (scrolls[resolvedThreadRef] ?? null) : null
      }
      onScrollChange={rememberThreadScroll}
      onOpenVisual={openVisual}
      onOpenThread={openThread}
      onTogglePin={() => {
        if (!selectedItem || selectedItem.threadRef === ROOT_REF) return;
        void setThreadPinned(
          venture.id,
          selectedItem.threadRef,
          !selectedItem.pinnedAt,
        )
          .then((response) => setWorkIndex(response.workIndex))
          .catch(refresh);
      }}
      onDriven={() => {
        draftStartedAt.current = activeDraft ? Date.now() : null;
        refresh();
        void timeline.refresh();
      }}
      onWorkRouted={(nextThreadRef) => {
        openThread(nextThreadRef);
        setContextualChatOpen(false);
        setMode("work");
      }}
      onAdoptWorkflow={adoptWorkflow}
    />
  );

  return (
    <div
      className="workspace-shell"
      data-mode={mode}
      data-stage-open={stage ? "true" : undefined}
      data-chat-open={
        mode !== "work" && contextualChatOpen ? "true" : undefined
      }
      data-rail-open={railOpen ? "true" : undefined}
      style={{ "--thread-rail-width": `${railWidth}px` } as React.CSSProperties}
    >
      <button
        type="button"
        className="thread-rail-launcher"
        aria-label="Open workspace rail"
        aria-expanded={railOpen}
        onClick={() => setRailOpen((value) => !value)}
      >
        <Menu aria-hidden="true" />
      </button>
      <WorkspaceRail
        venture={venture}
        ventures={ventures}
        mode={mode}
        modeMotion={modeMotion}
        width={railWidth}
        search={search}
        selectedThread={resolvedThreadRef}
        crew={lens?.crew ?? []}
        configuration={lens?.configuration ?? {
          id: "firm", schemaVersion: 1, revision: 1,
          presentation: { participant: "specialist", participantLabel: "agent", collectiveLabel: "agents" },
          defaults: { runtime: null, model: null, maxSteps: 24 },
          organization: { shape: "flat", instructions: null, relationships: [] },
          coordination: { mode: "adaptive", coordinatorRef: null, protocols: [], stopWhen: [] },
          authority: { outwardEffects: "wall", configurationChanges: "founder" }, agents: [],
        }}
        capabilities={capabilities}
        workIndex={searchWork ?? workIndex}
        systemIndex={systemIndexAll}
        productSection={productSection}
        scope={scope}
        selectedObjectRef={systemSelection}
        savedViews={savedSystemViews.views}
        savedViewsError={savedSystemViews.loadError}
        readOnlyReason={readOnly ? readOnlyReason : null}
        releaseIndex={releaseIndex}
        selectedReleaseId={releaseSelection}
        canStartRelease={Boolean(releaseSeed)}
        onMode={changeMode}
        onSearch={setSearch}
        onUseAgent={(ref) => assignAgentInSystem(ref)}
        onSelectThread={selectThread}
        onProductSection={setProductSection}
        onSelectObject={selectObject}
        onScope={setScope}
        onSelectRelease={selectRelease}
        onNew={newThread}
        onStartRelease={() => {
          if (releaseSeed) {
            setProductSection("releases");
            setMode("system");
            selectRelease(null);
          }
        }}
        onSaveView={savedSystemViews.save}
        onReopenView={savedSystemViews.reopen}
        onDeleteView={savedSystemViews.remove}
        onSwitchVenture={onOpenVenture}
        onResize={setRailWidth}
        onSettings={() => setSettingsConnection(null)}
        onConfigurationChanged={refresh}
      />
      <AnimatePresence initial={false} mode="popLayout">
      {mode === "work" ? (
        <motion.div key="work" className="workspace-work" {...modeSurfaceMotion(modeMotion)}>
          <WorkSurface
            ventureId={venture.id}
            timeline={timeline.timeline}
            conversation={conversation}
            readOnlyReason={readOnly ? readOnlyReason : null}
            renderPreview={(workspace) => (
              <WorkPreview
                workspaceId={workspace.id}
                disabledReason={readOnly ? readOnlyReason : null}
                unavailableReason={
                  !workspace.worktree
                    ? workspace.status === "discarded"
                      ? "This coding worktree was discarded. Its files and receipts remain available for review."
                      : "The isolated coding worktree is unavailable."
                    : null
                }
              />
            )}
            renderTerminal={(workspace) => (
              <WorkTerminal
                ventureId={venture.id}
                workspaceId={workspace.id}
                disabledReason={readOnly ? readOnlyReason : null}
                unavailableReason={
                  !workspace.worktree
                    ? workspace.status === "discarded"
                      ? "This coding worktree was discarded. Its files and receipts remain available for review."
                      : "The isolated coding worktree is unavailable."
                    : null
                }
              />
            )}
            onWorkspaceChanged={() => {
              refresh();
              void timeline.refresh();
              void reloadSystem();
              void reloadReleases();
            }}
          />
        </motion.div>
      ) : (
          <motion.div key={`${mode}:${productSection}`} className="workspace-primary" {...modeSurfaceMotion(modeMotion)}>
            {productSection === "canvas" ? (
              <SystemWorkspace
                index={systemIndexAll}
                ventureId={venture.id}
                architecture={lens?.architecture}
                placement={lens?.placement}
                workIndex={workIndex}
                scope={scope}
                selectedRef={systemSelection}
                directions={directions}
                camera={systemCamera}
                readOnlyReason={readOnly ? readOnlyReason : null}
                onScope={setScope}
                onSelect={selectObject}
                onCameraChange={setSystemCamera}
                onOpenWork={(ref) => {
                  openThread(ref);
                  setMode("work");
                }}
                onStartWork={(refs) => {
                  const [subjectRef, ...relatedRefs] = refs;
                  if (!subjectRef) return;
                  beginScopedThread(subjectRef, relatedRefs);
                  setMode("work");
                }}
                onAskAgent={(subjectRef) => {
                  if (subjectRef) beginScopedThread(subjectRef);
                  else newThread();
                  setContextualChatOpen(true);
                }}
                onProposalDecision={() => void afterMutation()}
                onAssignAgent={(agentRef, subjectRef) => assignAgentInSystem(agentRef, subjectRef)}
              />
            ) : (
              <ReleaseWorkspace
                index={releaseIndex}
                release={releaseDetail}
                draftContext={releaseSeed}
                objects={systemIndexAll?.objects ?? []}
                threads={workIndex?.items ?? []}
                readOnlyReason={readOnly ? readOnlyReason : null}
                onCreate={async (value) => {
                  if (!releaseIndex || !releaseSeed) return;
                  const result = await createRelease(
                    venture.id,
                    releaseIndex.revision,
                    {
                      ...value,
                      ...(releaseSeed.objectRef
                        ? { objectRef: releaseSeed.objectRef }
                        : {}),
                      ...(releaseSeed.threadRef
                        ? { threadRef: releaseSeed.threadRef }
                        : {}),
                    },
                  );
                  setReleaseIndex(result.releaseIndex);
                  selectRelease(result.release.id);
                  return result.release.releaseRef;
                }}
                onRunAgent={(refs, instruction) => {
                  const [subjectRef, ...relatedRefs] = refs;
                  if (subjectRef) beginScopedThread(subjectRef, relatedRefs);
                  else newThread();
                  setContextualChatOpen(true);
                  draftStartedAt.current = Date.now();
                  void replyInConversation(venture.id, {
                    message: instruction,
                    subjectRefs: refs,
                  })
                    .then(() => {
                      refresh();
                      void timeline.refresh();
                    })
                    .catch(() => refresh());
                }}
                onOpenProductGtm={(objectRef) => {
                  if (objectRef) setSystemSelection(objectRef);
                  setProductSection("canvas");
                  setMode("system");
                  setContextualChatOpen(false);
                }}
                onMutate={async (mutations) => {
                  if (!releaseDetail) return;
                  const result = await mutateRelease(
                    venture.id,
                    releaseDetail.id,
                    releaseDetail.revision,
                    mutations,
                  );
                  setReleaseDetail(result.release);
                  setReleaseIndex(result.releaseIndex);
                  await reloadSystem();
                }}
                onChanged={() => {
                  refresh();
                  void reloadReleases().then(() =>
                    releaseSelection
                      ? getRelease(venture.id, releaseSelection).then(
                          (result) => setReleaseDetail(result.release),
                        )
                      : undefined,
                  );
                }}
                onReconnect={() => setSettingsConnection("gmail")}
                onGrantObservation={async (value) => {
                  if (!releaseDetail) return;
                  await grantReleaseObservation(
                    venture.id,
                    releaseDetail.id,
                    value,
                  );
                  const result = await getRelease(venture.id, releaseDetail.id);
                  setReleaseDetail(result.release);
                  await reloadReleases();
                }}
                onCheckObservation={async (contractId) => {
                  if (!releaseDetail) return;
                  await checkReleaseObservation(
                    venture.id,
                    releaseDetail.id,
                    contractId,
                  );
                  const result = await getRelease(venture.id, releaseDetail.id);
                  setReleaseDetail(result.release);
                  refresh();
                  void reloadSystem();
                }}
                onRevokeObservation={async (contractId) => {
                  if (!releaseDetail) return;
                  await revokeReleaseObservation(
                    venture.id,
                    releaseDetail.id,
                    contractId,
                  );
                  const result = await getRelease(venture.id, releaseDetail.id);
                  setReleaseDetail(result.release);
                  await reloadReleases();
                }}
              />
            )}
          </motion.div>
      )}
      </AnimatePresence>
      {mode !== "work" ? <>
          {contextualChatOpen ? (
            <aside className="workspace-chat" aria-label="Context conversation">
              <button
                type="button"
                className="workspace-chat-close"
                aria-label="Close conversation"
                onClick={() => {
                  setContextualChatOpen(false);
                  opener.current?.focus();
                }}
              >
                <X aria-hidden="true" />
              </button>
              {conversation}
            </aside>
          ) : (
            <div className="workspace-fab">
              <button
                type="button"
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setContextualChatOpen(true);
                }}
              >
                <MessageCircle aria-hidden="true" />
                Ask about this {productSection === "releases" ? "release" : "workflow"}
              </button>
            </div>
          )}
        </> : null}
      <AnimatePresence initial={false}>
        {stage ? (
          <VisualStage
            key={`${stage.kind}:${stage.ref}`}
            visual={stage}
            timeline={timeline.timeline}
            workIndex={workIndex}
            directions={directions}
            lens={lens}
            readOnlyReason={readOnly ? readOnlyReason : null}
            artifactFocus={artifactFocus}
            onArtifactFocus={(focus) => {
              setArtifactFocus(focus);
              setArtifactFocusRequest((value) => value + 1);
              setContextualChatOpen(true);
            }}
            onClose={() => {
              setStage(null);
              setArtifactFocus(null);
              opener.current?.focus();
            }}
            onOpenThread={openThread}
            onChanged={() => {
              refresh();
              void timeline.refresh();
            }}
          />
        ) : null}
      </AnimatePresence>
      {settingsConnection !== undefined ? (
        <FirmSettings
          key={settingsConnection ?? "settings"}
          venture={venture}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          initialConnection={settingsConnection}
          onCapabilitiesChanged={() => {
            refresh();
            void reloadReleases();
          }}
          onClose={() => setSettingsConnection(undefined)}
        />
      ) : null}
    </div>
  );
}
