import { useEffect, useState } from "react";
import { FolderGit2 } from "lucide-react";
import { getRuntimeStatuses, type FirmRuntimeStatus } from "@/api";
import { WorkModelMenu } from "./WorkModelMenu";
import {
  clampEffort,
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
export type WorkChatMode = "code" | "product-gtm";

// Last known runtime truth, carried across composer remounts so the offline mark on the model face
// doesn't blink back to optimistic while a re-keyed bar refetches statuses.
let lastKnownRuntimes: FirmRuntimeStatus[] = [];

export function WorkComposerBar({ ventureId, threadKey, repository, disabled, mode, attention = 0, onModeChange, onChange }: {
  ventureId: string;
  threadKey: string;
  repository: string;
  disabled: boolean;
  mode: WorkChatMode;
  attention?: number;
  onModeChange: (mode: WorkChatMode) => void;
  onChange: (choice: WorkModelChoice) => void;
}) {
  const initial = readWorkModelChoice(ventureId, threadKey);
  const [selected, setSelected] = useState(() => modelIdFromWorkChoice(initial));
  const [runtimes, setRuntimes] = useState<FirmRuntimeStatus[]>(lastKnownRuntimes);
  const repositoryName = repository.split(/[\\/]/).filter(Boolean).at(-1) ?? repository;
  const choice = modelById(selected);
  const [effort, setEffort] = useState<WorkEffort>(() => initial.effort);

  useEffect(() => {
    const current = { runtime: choice.runtime, model: choice.model, effort };
    rememberWorkModelChoice(ventureId, threadKey, current);
    onChange(current);
  }, [choice.model, choice.runtime, effort, onChange, threadKey, ventureId]);
  // Runtime health marks the face and the menu; it never swaps the founder's participant. Who receives
  // the next message changes only by the founder's own tap, even when the chosen runtime is offline.
  useEffect(() => {
    let live = true;
    getRuntimeStatuses().then((result) => {
      lastKnownRuntimes = result.runtimes;
      if (live) setRuntimes(result.runtimes);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const chooseModel = (option: WorkModelOption) => {
    setSelected(option.id);
    setEffort((current) => {
      const next = clampEffort(current, option.id);
      return next;
    });
  };
  const chooseEffort = (value: WorkEffort) => setEffort(value);
  const connected = (runtime: WorkRuntime) => !runtimes.length || runtimes.some((entry) => entry.id === runtime && entry.connected);

  return <div className="work-composer-bar" aria-label="Chat participation controls">
    <div className="work-chat-mode" data-mode={mode} role="group" aria-label="Chat mode">
      <button type="button" title="Direct Claude or Codex on the code" data-active={mode === "code" ? "true" : undefined} aria-pressed={mode === "code"} disabled={disabled} onClick={() => onModeChange("code")}>Code</button>
      <button type="button" aria-label="Canvas" title="Open the venture Canvas and direct Drover agents on Product and go-to-market" data-active={mode === "product-gtm" ? "true" : undefined} aria-pressed={mode === "product-gtm"} disabled={disabled} onClick={() => onModeChange("product-gtm")}>Canvas{attention > 0 ? <b className="work-canvas-attention" data-tone="attention" aria-label={`${attention} on the Canvas ${attention === 1 ? "needs" : "need"} you`}>{attention}</b> : null}</button>
    </div>
    {mode === "code" ? <>
      <WorkModelMenu selectedId={choice.id} effort={effort} disabled={disabled} connected={connected} onSelectModel={chooseModel} onSelectEffort={chooseEffort} />
      <div className="work-composer-context" aria-label="Coding context">
        <span className="work-context-repo" title={repository}><FolderGit2 aria-hidden="true" />{repositoryName}</span>
        <span className="work-context-tail" title="Repository work starts in an isolated worktree">Isolated worktree</span>
        <span className="work-context-tail" title="Applying, sending, and other consequential actions remain founder-held">Guarded</span>
      </div>
    </> : <div className="work-agent-context" aria-label="Product and go-to-market agent context">
      {/* This register only renders while the Canvas holds the larger pane, so the composer column is
          always narrow here. A sentence describing what these agents do ellipsised to two words every
          time; the spectrum ring and the name already say who is being directed, and the Canvas beside
          it shows the work. The title carries the longer reading for anyone who wants it. */}
      <span className="work-agent-spectrum" aria-hidden="true" />
      <strong title="Drover agents ideate workflows, branches, founder gates, and evidence loops">Croki agents</strong>
    </div>}
  </div>;
}
