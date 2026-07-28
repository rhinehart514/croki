import type { CSSProperties, ReactNode } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelRightOpen } from "lucide-react";
import type { CodingWorkspace, ThreadTimeline } from "@/api";
import { readWorkbenchSession, rememberWorkbenchSession, type WorkbenchSession } from "@/lib/venture-session";
import { WorkWorkbench } from "./WorkWorkbench";
import type { WorkTerminalStatus } from "./WorkTerminal";
import { attemptLabel, codingWorkspacesFromTimeline, defaultCodingWorkspace } from "./workspaceProjection";
import "./work-mode.css";
import {
  readWorkAttemptSession,
  rememberWorkAttemptSession,
  resolveWorkAttemptSession,
  type WorkAttemptSession,
} from "./workAttemptSession";
import { targetWorkAttempt } from "./workAttemptTarget";
import {
  rememberWorkMaterial,
  readRepositoryReview,
  rememberRepositoryReview,
  WORK_REVIEW_REQUEST_EVENT,
  workPresentationScope,
  type WorkMaterial,
  type WorkReviewRequest,
} from "./previewPresentation";

const WorkAttemptsCompare = lazy(async () => {
  const module = await import("./WorkAttemptsCompare");
  return { default: module.WorkAttemptsCompare };
});
const RepositoryReviewPane = lazy(async () => {
  const module = await import("./RepositoryReviewPane");
  return { default: module.RepositoryReviewPane };
});

export type WorkCapabilitySlot = (workspace: CodingWorkspace, onStatus?: (status: WorkTerminalStatus) => void) => ReactNode;

type WorkSurfaceProps = {
  ventureId: string;
  timeline: ThreadTimeline | null;
  conversation: ReactNode;
  readOnlyReason: string | null;
  renderPreview?: WorkCapabilitySlot;
  renderTerminal?: WorkCapabilitySlot;
  onWorkspaceChanged: () => void;
};

export function WorkSurface(props: WorkSurfaceProps) {
  const threadRef = props.timeline?.thread.threadRef ?? "";
  return <WorkSurfaceThread key={`${props.ventureId}:${threadRef}`} {...props} threadRef={threadRef} />;
}

function WorkSurfaceThread({ ventureId, threadRef, timeline, conversation, readOnlyReason, renderPreview, renderTerminal, onWorkspaceChanged }: WorkSurfaceProps & { threadRef: string }) {
  const attempts = useMemo(() => codingWorkspacesFromTimeline(timeline), [timeline]);
  const [attemptSession, setAttemptSession] = useState<WorkAttemptSession>(() => readWorkAttemptSession(ventureId, threadRef));
  // Terminal status is tagged with the attempt it came from and only shown for the current one, so the
  // collapsed drawer never displays liveness belonging to a different workspace — no reset effect needed.
  const [terminalStatus, setTerminalStatus] = useState<{ id: string; status: WorkTerminalStatus } | null>(null);
  // The workbench split is the founder's: open/closed and dragged width persist per venture, while
  // maximize is a transient reading posture that never outlives the visit.
  const [bench, setBench] = useState<WorkbenchSession>(() => readWorkbenchSession(ventureId));
  const [maximized, setMaximized] = useState(false);
  const [requestedMaterial, setRequestedMaterial] = useState<{ material: WorkMaterial; request: number } | null>(null);
  const presentationScope = workPresentationScope(ventureId, threadRef);
  const [repositoryReview, setRepositoryReview] = useState<NonNullable<WorkReviewRequest["repository"]> | null>(() => readRepositoryReview(presentationScope));
  const reviewOpener = useRef<HTMLElement | null>(null);
  const updateBench = useCallback((next: WorkbenchSession) => {
    setBench(next);
    rememberWorkbenchSession(ventureId, next);
  }, [ventureId]);
  const defaultAttempt = defaultCodingWorkspace(attempts);
  const attemptIds = [
    ...(defaultAttempt ? [defaultAttempt.id] : []),
    ...attempts.map((attempt) => attempt.id).filter((id) => id !== defaultAttempt?.id),
  ];
  const resolvedAttemptSession = resolveWorkAttemptSession(attemptSession, attemptIds);
  const selected = attempts.find((workspace) => workspace.id === resolvedAttemptSession.selectedId) ?? defaultAttempt;
  const reportTerminalStatus = useCallback((status: WorkTerminalStatus) => {
    if (selected) setTerminalStatus({ id: selected.id, status });
  }, [selected]);
  const currentTerminalStatus = terminalStatus && terminalStatus.id === selected?.id ? terminalStatus.status : null;
  const canCompare = attempts.length > 1;
  // Compare is only coherent with a chosen attempt and at least one sibling to hold it against. Exiting
  // when siblings drop below two keeps the toggle from stranding the founder in an empty comparison.
  const showCompare = resolvedAttemptSession.comparing && canCompare && Boolean(selected);
  const showRepositoryReview = Boolean(repositoryReview) && bench.open;
  const showWorkbench = Boolean(selected) && !showRepositoryReview && bench.open;
  const updateAttemptSession = useCallback((next: WorkAttemptSession) => {
    setAttemptSession(next);
    rememberWorkAttemptSession(ventureId, threadRef, next);
  }, [threadRef, ventureId]);
  const focusAttempt = (id: string) => updateAttemptSession({ ...resolvedAttemptSession, selectedId: id, comparing: false });
  const continueAttempt = (id: string, carriedComment: string | null = null) => {
    const workspace = attempts.find((attempt) => attempt.id === id);
    if (!workspace) return;
    focusAttempt(id);
    targetWorkAttempt({
      ventureId,
      threadRef: workspace.threadRef,
      workspaceId: workspace.id,
      label: attemptLabel(attempts, workspace),
      carriedComment,
    });
  };
  useEffect(() => {
    const open = (event: Event) => {
      const request = (event as CustomEvent<WorkReviewRequest>).detail;
      if (!request || (request.threadRef && request.threadRef !== threadRef)) return;
      if (request.target === "repository") {
        if (!request.repository || !request.threadRef || request.threadRef !== threadRef) return;
        reviewOpener.current = request.source ?? null;
        setRepositoryReview(request.repository);
        rememberRepositoryReview(presentationScope, request.repository);
        if (resolvedAttemptSession.comparing) updateAttemptSession({ ...resolvedAttemptSession, comparing: false });
        updateBench({ ...bench, open: true });
        window.setTimeout(() => document.querySelector<HTMLElement>(".repository-review-workbench")?.focus(), 0);
        return;
      }
      const requestedAttempt = request.workspaceId
        ? attempts.find((attempt) => attempt.id === request.workspaceId)
        : selected;
      if (!requestedAttempt) return;
      reviewOpener.current = request.source ?? null;
      setRepositoryReview(null);
      rememberRepositoryReview(presentationScope, null);
      if (request.target === "comparison") {
        if (!canCompare) return;
        updateAttemptSession({ ...resolvedAttemptSession, selectedId: requestedAttempt.id, comparing: true });
      } else {
        rememberWorkMaterial(presentationScope, request.target);
        setRequestedMaterial({ material: request.target, request: Date.now() });
        updateAttemptSession({ ...resolvedAttemptSession, selectedId: requestedAttempt.id, comparing: false });
        updateBench({ ...bench, open: true });
      }
      window.setTimeout(() => document.querySelector<HTMLElement>(`.work-workbench[data-workspace-id="${CSS.escape(requestedAttempt.id)}"], .work-compare`)?.focus(), 0);
    };
    window.addEventListener(WORK_REVIEW_REQUEST_EVENT, open);
    return () => window.removeEventListener(WORK_REVIEW_REQUEST_EVENT, open);
  }, [attempts, bench, canCompare, presentationScope, resolvedAttemptSession, selected, threadRef, updateAttemptSession, updateBench]);

  return (
    <div
      className="work-surface"
      data-has-workspace={showCompare || showRepositoryReview || showWorkbench ? "true" : undefined}
      data-has-attempts={attempts.length ? "true" : undefined}
      data-workbench-max={(showRepositoryReview || showWorkbench) && !showCompare && maximized ? "true" : undefined}
      style={bench.width != null ? { "--work-workbench-width": `${bench.width}px` } as CSSProperties : undefined}
    >
      <div className="work-conversation">{conversation}</div>
      {(selected || repositoryReview) && !bench.open && !showCompare ? (
        <button type="button" className="work-workbench-reveal" onClick={(event) => { reviewOpener.current = event.currentTarget; updateBench({ ...bench, open: true }); }}>
          <PanelRightOpen aria-hidden="true" /><span>Review</span>
        </button>
      ) : null}
      {showCompare && selected ? <Suspense fallback={<div className="work-native-notice" role="status">Opening attempt comparison…</div>}>
        <WorkAttemptsCompare
          attempts={attempts}
          primaryId={selected.id}
          leftId={resolvedAttemptSession.leftId}
          rightId={resolvedAttemptSession.rightId}
          onPairChange={(leftId, rightId) => updateAttemptSession({ ...resolvedAttemptSession, leftId, rightId })}
          onFocusAttempt={focusAttempt}
          onContinueAttempt={(id) => continueAttempt(id)}
          onCarryComment={(id, comment) => continueAttempt(id, comment)}
          onExit={() => {
            updateAttemptSession({ ...resolvedAttemptSession, comparing: false });
            window.setTimeout(() => reviewOpener.current?.focus(), 0);
          }}
        />
      </Suspense> : showRepositoryReview && repositoryReview ? <Suspense fallback={<div className="work-native-notice" role="status">Opening source Review…</div>}>
        <RepositoryReviewPane
          ventureId={ventureId}
          threadRef={threadRef}
          target={repositoryReview}
          maximized={maximized}
          onToggleMaximize={() => setMaximized((current) => !current)}
          onHide={() => {
            setMaximized(false);
            updateBench({ ...bench, open: false });
            window.setTimeout(() => reviewOpener.current?.focus(), 0);
          }}
          width={bench.width}
          onResize={(width) => updateBench({ ...bench, width })}
        />
      </Suspense> : showWorkbench && selected ? <WorkWorkbench
        key={selected.threadRef}
        ventureId={ventureId}
        workspace={selected}
        attempts={attempts}
        selectedWorkspaceId={selected.id}
        readOnlyReason={readOnlyReason}
        canCompare={canCompare}
        onCompare={() => updateAttemptSession({ ...resolvedAttemptSession, comparing: true })}
        preview={renderPreview ? renderPreview(selected) : <NativeCapabilityNotice capability="Preview" />}
        terminal={renderTerminal ? renderTerminal(selected, reportTerminalStatus) : <NativeCapabilityNotice capability="Terminal" />}
        terminalStatus={currentTerminalStatus}
        requestedMaterial={requestedMaterial}
        onMaterialSelected={() => setRequestedMaterial(null)}
        onSelectWorkspace={focusAttempt}
        onChanged={onWorkspaceChanged}
        maximized={maximized}
        onToggleMaximize={() => setMaximized((current) => !current)}
        onHide={() => {
          setMaximized(false);
          updateBench({ ...bench, open: false });
          window.setTimeout(() => reviewOpener.current?.focus(), 0);
        }}
        width={bench.width}
        onResize={(width) => updateBench({ ...bench, width })}
      /> : null}
    </div>
  );
}

function NativeCapabilityNotice({ capability }: { capability: "Preview" | "Terminal" }) {
  return <div className="work-native-notice"><strong>{capability} requires the desktop app.</strong><p>The browser build preserves the workspace record but does not simulate native desktop capability.</p></div>;
}
