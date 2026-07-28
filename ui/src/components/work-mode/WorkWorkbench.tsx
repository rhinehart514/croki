import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Eye, FileDiff, History, Maximize2, Minimize2, PanelRightClose } from "lucide-react";
import type { CodingWorkspace } from "@/api";
import { WORKBENCH_MAX_WIDTH, WORKBENCH_MIN_WIDTH } from "@/lib/venture-session";
import { CodeWorkspaceStage } from "@/components/visual-stage/CodeWorkspaceStage";
import { WorkChangesPane } from "./WorkChangesPane";
import { WorkCheckpoints } from "./WorkCheckpoints";
import { WorkTerminalDrawer } from "./WorkTerminalDrawer";
import type { WorkTerminalStatus } from "./WorkTerminal";
import { openComposerSourceReference, type ComposerSourceReference } from "@/components/now/composerSourceReference";
import { TERMINAL_FILE_LINK_EVENT } from "./terminalLinks";
import { workStatusLabel } from "./workStatusLabel";
import { attemptLabel } from "./workspaceProjection";
import {
  readWorkMaterial,
  rememberWorkMaterial,
  workPresentationScope,
  type WorkMaterial,
} from "./previewPresentation";
import { WorkReviewSummary } from "./WorkReviewSummary";

const MATERIALS: Array<{ id: WorkMaterial; label: string; detail: string; icon: typeof FileDiff }> = [
  { id: "changes", label: "Code changes", detail: "Diff, proof, and founder consequence", icon: FileDiff },
  { id: "preview", label: "Running preview", detail: "The app controlled by this attempt", icon: Eye },
  { id: "history", label: "Checkpoint history", detail: "Exact restore points for this attempt", icon: History },
];

export function WorkWorkbench({ ventureId, workspace, attempts, selectedWorkspaceId, readOnlyReason, canCompare = false, onCompare, preview, terminal, terminalStatus = null, requestedMaterial = null, onMaterialSelected, onSelectWorkspace, onChanged, maximized = false, onToggleMaximize, onHide, width = null, onResize }: {
  ventureId: string;
  workspace: CodingWorkspace;
  attempts: CodingWorkspace[];
  selectedWorkspaceId: string;
  readOnlyReason: string | null;
  canCompare?: boolean;
  onCompare?: () => void;
  preview: ReactNode;
  terminal: ReactNode;
  terminalStatus?: WorkTerminalStatus | null;
  requestedMaterial?: { material: WorkMaterial; request: number } | null;
  onMaterialSelected?: () => void;
  onSelectWorkspace: (id: string) => void;
  onChanged: () => void;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  onHide?: () => void;
  width?: number | null;
  onResize?: (width: number) => void;
}) {
  const presentationScope = workPresentationScope(ventureId, workspace.threadRef);
  const [rememberedMaterial, setRememberedMaterial] = useState<WorkMaterial>(() => readWorkMaterial(presentationScope));
  const material = requestedMaterial?.material ?? rememberedMaterial;
  const section = useRef<HTMLElement | null>(null);
  const picker = useRef<HTMLDetailsElement | null>(null);
  // The drag starts from the measured width, so the default proportional split hands off to an exact
  // pixel width without a jump on the first pointer move.
  const currentWidth = () => section.current?.getBoundingClientRect().width ?? WORKBENCH_MIN_WIDTH;
  const clampWidth = (width: number) => Math.min(WORKBENCH_MAX_WIDTH, Math.max(WORKBENCH_MIN_WIDTH, Math.round(width)));
  const resize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onResize) return;
    const origin = event.clientX;
    const start = currentWidth();
    const move = (next: globalThis.PointerEvent) => onResize(clampWidth(start + (origin - next.clientX)));
    const done = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", done); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
  };
  const selectMaterial = useCallback((next: WorkMaterial) => {
    setRememberedMaterial(next);
    rememberWorkMaterial(presentationScope, next);
    picker.current?.removeAttribute("open");
    onMaterialSelected?.();
  }, [onMaterialSelected, presentationScope]);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId: string; reference: ComposerSourceReference }>).detail;
      if (!detail || detail.workspaceId !== workspace.id) return;
      selectMaterial("changes");
      window.setTimeout(() => openComposerSourceReference(detail.reference), 0);
    };
    window.addEventListener(TERMINAL_FILE_LINK_EVENT, open);
    return () => window.removeEventListener(TERMINAL_FILE_LINK_EVENT, open);
  }, [selectMaterial, workspace.id]);
  return (
    <section
      className="work-workbench"
      aria-label={`Review: ${workspace.goal}`}
      data-workspace-id={workspace.id}
      ref={section}
      tabIndex={-1}
    >
      {onResize && !maximized ? <button
        type="button"
        className="work-workbench-resizer"
        role="separator"
        aria-label="Resize workbench"
        aria-orientation="vertical"
        aria-valuemin={WORKBENCH_MIN_WIDTH}
        aria-valuemax={WORKBENCH_MAX_WIDTH}
        aria-valuenow={width ?? Math.round((WORKBENCH_MIN_WIDTH + WORKBENCH_MAX_WIDTH) / 2)}
        aria-valuetext={`${width ?? Math.round((WORKBENCH_MIN_WIDTH + WORKBENCH_MAX_WIDTH) / 2)} pixel Review pane`}
        onPointerDown={resize}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onResize(clampWidth(currentWidth() + 8));
          if (event.key === "ArrowRight") onResize(clampWidth(currentWidth() - 8));
        }}
      /> : null}
      <header className="work-workbench-head">
        <div className="work-workbench-title">
          <span>{`Review · ${MATERIALS.find((item) => item.id === material)?.label ?? "Exact material"}`}</span>
          <strong title={workspace.goal}>{workspace.goal}</strong>
          <code title={workspace.branch}>{workspace.branch}</code>
        </div>
        <div className="work-workbench-tools">
          <details className="work-material-picker" ref={picker}>
            <summary aria-label="Choose Review material"><span>Material</span><ChevronDown aria-hidden="true" /></summary>
            <div>
              {MATERIALS.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} type="button" data-current={material === item.id ? "true" : undefined} onClick={() => selectMaterial(item.id)}>
                  <Icon aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.detail}</small></span>
                </button>;
              })}
            </div>
          </details>
          {canCompare && onCompare ? <button type="button" onClick={onCompare}>Compare attempts</button> : null}
          <span className="work-change-stat">{workspace.diffStat || `${workspace.changedFiles.length} ${workspace.changedFiles.length === 1 ? "file" : "files"}`}</span>
          {attempts.length > 1 ? <label><span className="sr-only">Coding attempt</span><select value={selectedWorkspaceId} onChange={(event) => onSelectWorkspace(event.target.value)}>{attempts.map((attempt) => <option key={attempt.id} value={attempt.id}>{attemptLabel(attempts, attempt)} · {workStatusLabel(attempt.status)}</option>)}</select></label> : null}
          <strong className="work-status" data-status={workspace.status}>{workStatusLabel(workspace.status)}</strong>
          {onToggleMaximize ? <button type="button" className="work-workbench-icon" aria-label={maximized ? "Restore the split view" : "Expand the workbench"} title={maximized ? "Restore the split view" : "Expand the workbench"} onClick={onToggleMaximize}>
            {maximized ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button> : null}
          {onHide ? <button type="button" className="work-workbench-icon" aria-label="Hide the workbench" title="Hide the workbench" onClick={onHide}>
            <PanelRightClose aria-hidden="true" />
          </button> : null}
        </div>
      </header>

      <div className="work-workbench-scroll">
        <section className="work-review-material" aria-label={`${MATERIALS.find((item) => item.id === material)?.label ?? material} Review material`}>
          {material === "changes" ? <>
            <WorkReviewSummary workspace={workspace} attempts={attempts} />
            <WorkChangesPane key={workspace.threadRef} ventureId={ventureId} workspace={workspace} readOnlyReason={readOnlyReason} onSteered={onChanged} />
          </> : null}
          {/* The preview stays mounted while other material is focused, so the run's own preview tools
              can keep driving the page (and an agent-opened preview is already live on return). */}
          <div hidden={material !== "preview"} style={material === "preview" ? undefined : { display: "none" }}>{preview}</div>
          {material === "history" ? <WorkCheckpoints ventureId={ventureId} workspace={workspace} readOnlyReason={readOnlyReason} onChanged={onChanged} /> : null}
        </section>
        <CodeWorkspaceStage ventureId={ventureId} workspace={workspace} readOnlyReason={readOnlyReason} onChanged={onChanged} variant="review" />
      </div>

      <WorkTerminalDrawer workspaceId={workspace.id} status={terminalStatus}>{terminal}</WorkTerminalDrawer>
    </section>
  );
}
