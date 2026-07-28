import { useEffect, useMemo, useState } from "react";
import { FolderGit2 } from "lucide-react";
import { getRuntimeStatuses, type FirmRuntimeStatus } from "@/api";
import { WorkModelMenu } from "./WorkModelMenu";
import {
  clampEffort,
  advertisedWorkModels,
  modelIdFromWorkChoice,
  modelById,
  readWorkModelChoice,
  rememberWorkModelChoice,
  type WorkEffort,
  type WorkModelChoice,
  type WorkModelOption,
  type WorkRuntime,
} from "./work-models";

export type { WorkEffort, WorkModelChoice } from "./work-models";

// Last known runtime truth is venture-scoped: native project skills and commands must never flash
// from one repository while another venture's composer is mounting.
const lastKnownRuntimes = new Map<string, FirmRuntimeStatus[]>();

export function WorkComposerBar({ ventureId, threadKey, repository, disabled, canvasOpen, attention = 0, onCanvasOpenChange, onChange }: {
  ventureId: string;
  threadKey: string;
  repository: string;
  disabled: boolean;
  canvasOpen: boolean;
  attention?: number;
  onCanvasOpenChange: (open: boolean) => void;
  onChange: (choice: WorkModelChoice) => void;
}) {
  const initial = readWorkModelChoice(ventureId, threadKey);
  const [selected, setSelected] = useState(() => modelIdFromWorkChoice(initial));
  const [runtimes, setRuntimes] = useState<FirmRuntimeStatus[]>(() => lastKnownRuntimes.get(ventureId) ?? []);
  const repositoryName = repository.split(/[\\/]/).filter(Boolean).at(-1) ?? repository;
  const models = useMemo(() => advertisedWorkModels(runtimes), [runtimes]);
  const choice = modelById(selected, models);
  const hasLiveModelInventory = runtimes.some((runtime) => Array.isArray(runtime.capabilities?.models));
  const modelAvailable = !hasLiveModelInventory || models.some((model) => model.id === choice.id);
  const [effort, setEffort] = useState<WorkEffort | null>(() => initial.effort);
  const effectiveEffort = clampEffort(effort, choice.id, models);
  const [interactionMode, setInteractionMode] = useState<"default" | "plan">(() => initial.interactionMode ?? "default");
  const runtimeStatus = runtimes.find((runtime) => runtime.id === choice.runtime) ?? null;
  const planSupported = runtimeStatus?.connected === true
    && runtimeStatus.capabilities?.interactionModes.some((mode) => mode.id === "plan") === true;
  const effectiveInteraction = interactionMode === "plan" && planSupported ? "plan" : "default";

  useEffect(() => {
    const current = {
      runtime: choice.runtime,
      model: choice.model,
      effort: effectiveEffort,
      ...(effectiveInteraction === "plan" ? { interactionMode: "plan" as const } : {}),
    };
    rememberWorkModelChoice(ventureId, threadKey, current);
    onChange(current);
  }, [choice.model, choice.runtime, effectiveEffort, effectiveInteraction, onChange, threadKey, ventureId]);
  // Runtime health marks the face and the menu; it never swaps the founder's participant. Who receives
  // the next message changes only by the founder's own tap, even when the chosen runtime is offline.
  useEffect(() => {
    let live = true;
    getRuntimeStatuses(ventureId).then((result) => {
      lastKnownRuntimes.set(ventureId, result.runtimes);
      if (live) setRuntimes(result.runtimes);
    }).catch(() => {});
    return () => { live = false; };
  }, [ventureId]);
  const chooseModel = (option: WorkModelOption) => {
    setSelected(option.id);
    setEffort((current) => {
      const next = clampEffort(current, option.id, models);
      return next;
    });
  };
  const chooseEffort = (value: WorkEffort) => setEffort(value);
  const connected = (runtime: WorkRuntime) => !runtimes.length || runtimes.some((entry) => entry.id === runtime && entry.connected);

  return <div className="work-composer-bar" aria-label="Thread controls">
    <button
      type="button"
      className="work-canvas-toggle"
      aria-label="Canvas"
      title={canvasOpen ? "Hide the visual product context" : "Open the visual product context beside this Thread"}
      aria-pressed={canvasOpen}
      disabled={disabled}
      onClick={() => onCanvasOpenChange(!canvasOpen)}
    >
      Canvas{attention > 0 ? <b className="work-canvas-attention" data-tone="attention" aria-label={`${attention} on the Canvas ${attention === 1 ? "needs" : "need"} you`}>{attention}</b> : null}
    </button>
    <WorkModelMenu selectedId={choice.id} effort={effectiveEffort} disabled={disabled} connected={connected} available={modelAvailable} models={models} onSelectModel={chooseModel} onSelectEffort={chooseEffort} />
    {planSupported ? <button type="button" className="work-canvas-toggle" aria-pressed={effectiveInteraction === "plan"} disabled={disabled} onClick={() => setInteractionMode((current) => current === "plan" ? "default" : "plan")}>Plan</button> : null}
    <div className="work-composer-context" aria-label="Coding context">
      <span className="work-context-repo" title={repository}><FolderGit2 aria-hidden="true" />{repositoryName}</span>
      <span className="work-context-tail" title="Repository work starts in an isolated worktree">Isolated worktree</span>
      <span className="work-context-tail" title="Applying, sending, and other consequential actions remain founder-held">Guarded</span>
    </div>
  </div>;
}
