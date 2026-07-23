import { useEffect, useState } from "react";
import { FolderGit2, GitBranch, ShieldCheck } from "lucide-react";
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

export function WorkComposerBar({ ventureId, threadKey, repository, disabled, mode, onModeChange, onChange }: {
  ventureId: string;
  threadKey: string;
  repository: string;
  disabled: boolean;
  mode: WorkChatMode;
  onModeChange: (mode: WorkChatMode) => void;
  onChange: (choice: WorkModelChoice) => void;
}) {
  const initial = readWorkModelChoice(ventureId, threadKey);
  const [selected, setSelected] = useState(() => modelIdFromWorkChoice(initial));
  const [runtimes, setRuntimes] = useState<FirmRuntimeStatus[]>([]);
  const repositoryName = repository.split(/[\\/]/).filter(Boolean).at(-1) ?? repository;
  const choice = modelById(selected);
  const [effort, setEffort] = useState<WorkEffort>(() => initial.effort);

  useEffect(() => {
    const current = { runtime: choice.runtime, model: choice.model, effort };
    rememberWorkModelChoice(ventureId, threadKey, current);
    onChange(current);
  }, [choice.model, choice.runtime, effort, onChange, threadKey, ventureId]);
  useEffect(() => {
    let live = true;
    getRuntimeStatuses().then((result) => {
      if (!live) return;
      setRuntimes(result.runtimes);
      setSelected((current) => {
        const selectedRuntime = modelById(current).runtime;
        if (result.runtimes.some((entry) => entry.id === selectedRuntime && entry.connected)) return current;
        const fallback = result.runtimes.find((entry) => entry.connected && entry.id === "claude-code")
          ?? result.runtimes.find((entry) => entry.connected && entry.id === "codex");
        if (!fallback) return current;
        return fallback.id;
      });
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
      <button type="button" aria-label="Code — Claude / Codex" data-active={mode === "code" ? "true" : undefined} aria-pressed={mode === "code"} disabled={disabled} onClick={() => onModeChange("code")}><strong>Code</strong><small>Claude / Codex</small></button>
      <button type="button" aria-label="Product / GTM — Agents" data-active={mode === "product-gtm" ? "true" : undefined} aria-pressed={mode === "product-gtm"} disabled={disabled} onClick={() => onModeChange("product-gtm")}><strong>Product / GTM</strong><small>Agents</small></button>
    </div>
    {mode === "code" ? <>
      <WorkModelMenu selectedId={choice.id} effort={effort} disabled={disabled} connected={connected} onSelectModel={chooseModel} onSelectEffort={chooseEffort} />
      <div className="work-composer-context" aria-label="Coding context">
        <span title={repository}><FolderGit2 aria-hidden="true" />{repositoryName}</span>
        <span title="Repository work starts in an isolated worktree"><GitBranch aria-hidden="true" />Worktree</span>
        <span title="Applying, sending, and other consequential actions remain founder-held"><ShieldCheck aria-hidden="true" />Guarded</span>
      </div>
    </> : <div className="work-agent-context" aria-label="Product and go-to-market agent context">
      <span className="work-agent-spectrum" aria-hidden="true" />
      <span><strong>Croki agents</strong><small>Ideate workflows, branches, gates, and evidence loops</small></span>
    </div>}
  </div>;
}
