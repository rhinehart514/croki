import { useEffect, useState } from "react";
import { FolderGit2, GitBranch, ShieldCheck } from "lucide-react";
import { getRuntimeStatuses, type FirmRuntimeStatus } from "@/api";
import { WorkModelMenu } from "./WorkModelMenu";
import { WorkCapabilities } from "./WorkCapabilities";
import {
  clampEffort,
  DEFAULT_EFFORT,
  DEFAULT_MODEL_ID,
  isEffort,
  modelById,
  type WorkEffort,
  type WorkModelOption,
  type WorkRuntime,
} from "./work-models";

export type { WorkEffort } from "./work-models";
export type WorkModelChoice = { runtime: string | null; model: string | null; effort: WorkEffort };
export type WorkChatMode = "code" | "product-gtm";

function initialModel(key: string) {
  try { return localStorage.getItem(key) ?? DEFAULT_MODEL_ID; } catch { return DEFAULT_MODEL_ID; }
}

function initialEffort(key: string): WorkEffort {
  try {
    const stored = localStorage.getItem(key);
    if (isEffort(stored)) return stored;
  } catch { /* presentation preference only */ }
  return DEFAULT_EFFORT;
}

export function WorkComposerBar({ ventureId, threadKey, repository, disabled, mode, onModeChange, onChange }: {
  ventureId: string;
  threadKey: string;
  repository: string;
  disabled: boolean;
  mode: WorkChatMode;
  onModeChange: (mode: WorkChatMode) => void;
  onChange: (choice: WorkModelChoice) => void;
}) {
  const storageKey = `drover:work-model:${ventureId}:${threadKey}`;
  const effortKey = `drover:work-effort:${ventureId}:${threadKey}`;
  const [selected, setSelected] = useState(() => initialModel(storageKey));
  const [runtimes, setRuntimes] = useState<FirmRuntimeStatus[]>([]);
  const repositoryName = repository.split(/[\\/]/).filter(Boolean).at(-1) ?? repository;
  const choice = modelById(selected);
  const [effort, setEffort] = useState<WorkEffort>(() => clampEffort(initialEffort(effortKey), choice.id));

  useEffect(() => { onChange({ runtime: choice.runtime, model: choice.model, effort }); }, [choice.model, choice.runtime, effort, onChange]);
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
        try { localStorage.setItem(storageKey, fallback.id); } catch { /* presentation preference only */ }
        return fallback.id;
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [storageKey]);

  const chooseModel = (option: WorkModelOption) => {
    setSelected(option.id);
    try { localStorage.setItem(storageKey, option.id); } catch { /* presentation preference only */ }
    setEffort((current) => {
      const next = clampEffort(current, option.id);
      if (next !== current) { try { localStorage.setItem(effortKey, next); } catch { /* presentation preference only */ } }
      return next;
    });
  };
  const chooseEffort = (value: WorkEffort) => {
    setEffort(value);
    try { localStorage.setItem(effortKey, value); } catch { /* presentation preference only */ }
  };
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
      <WorkCapabilities />
    </> : <div className="work-agent-context" aria-label="Product and go-to-market agent context">
      <span className="work-agent-spectrum" aria-hidden="true" />
      <span><strong>Drover agents</strong><small>Ideate workflows, branches, gates, and evidence loops</small></span>
    </div>}
  </div>;
}
