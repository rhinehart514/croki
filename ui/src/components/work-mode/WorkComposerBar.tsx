import { useEffect, useState } from "react";
import { FolderGit2, GitBranch, ShieldCheck } from "lucide-react";
import claudeLogo from "@lobehub/icons-static-svg/icons/claude-color.svg";
import codexLogo from "@lobehub/icons-static-svg/icons/codex-color.svg";
import { getRuntimeStatuses, type FirmRuntimeStatus } from "@/api";

export type WorkModelChoice = { runtime: string | null; model: string | null };
export type WorkChatMode = "code" | "product-gtm";

const MODELS = [
  { id: "claude-code", label: "Claude · Default", runtime: "claude-code", model: null },
  { id: "claude-code:claude-sonnet-5-0", label: "Claude Sonnet 5.0", runtime: "claude-code", model: "claude-sonnet-5-0" },
  { id: "claude-code:claude-sonnet-4-6", label: "Claude Sonnet 4.6", runtime: "claude-code", model: "claude-sonnet-4-6" },
  { id: "codex", label: "Codex · Default", runtime: "codex", model: null },
  { id: "codex:gpt-5.4", label: "GPT-5.4", runtime: "codex", model: "gpt-5.4" },
] as const;

function initialModel(key: string) {
  try { return localStorage.getItem(key) ?? "claude-code"; } catch { return "claude-code"; }
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
  const [selected, setSelected] = useState(() => initialModel(storageKey));
  const [runtimes, setRuntimes] = useState<FirmRuntimeStatus[]>([]);
  const repositoryName = repository.split(/[\\/]/).filter(Boolean).at(-1) ?? repository;
  const choice = MODELS.find((entry) => entry.id === selected) ?? MODELS[0];
  const providerLogo = choice.runtime === "codex" ? codexLogo : claudeLogo;
  const providerName = choice.runtime === "codex" ? "Codex" : "Claude Code";

  useEffect(() => { onChange({ runtime: choice.runtime, model: choice.model }); }, [choice.model, choice.runtime, onChange]);
  useEffect(() => {
    let live = true;
    getRuntimeStatuses().then((result) => {
      if (!live) return;
      setRuntimes(result.runtimes);
      setSelected((current) => {
        const selectedRuntime = MODELS.find((entry) => entry.id === current)?.runtime;
        if (!selectedRuntime || result.runtimes.some((entry) => entry.id === selectedRuntime && entry.connected)) return current;
        const fallback = result.runtimes.find((entry) => entry.connected && entry.id === "claude-code")
          ?? result.runtimes.find((entry) => entry.connected && entry.id === "codex");
        if (!fallback) return current;
        try { localStorage.setItem(storageKey, fallback.id); } catch { /* presentation preference only */ }
        return fallback.id;
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [storageKey]);

  const choose = (id: string) => {
    setSelected(id);
    try { localStorage.setItem(storageKey, id); } catch { /* presentation preference only */ }
  };
  const available = (runtime: string | null) => !runtimes.length || runtimes.some((entry) => entry.id === runtime && entry.connected);

  return <div className="work-composer-bar" aria-label="Chat participation controls">
    <div className="work-chat-mode" data-mode={mode} role="group" aria-label="Chat mode">
      <button type="button" aria-label="Code — Claude / Codex" data-active={mode === "code" ? "true" : undefined} aria-pressed={mode === "code"} disabled={disabled} onClick={() => onModeChange("code")}><strong>Code</strong><small>Claude / Codex</small></button>
      <button type="button" aria-label="Product / GTM — Agents" data-active={mode === "product-gtm" ? "true" : undefined} aria-pressed={mode === "product-gtm"} disabled={disabled} onClick={() => onModeChange("product-gtm")}><strong>Product / GTM</strong><small>Agents</small></button>
    </div>
    {mode === "code" ? <>
      <label className="work-model-picker" data-runtime={choice.runtime}>
        <img className="work-model-logo" src={providerLogo} alt="" aria-hidden="true" />
        <span className="sr-only">SDK model</span>
        <select aria-label="SDK model" value={choice.id} disabled={disabled} onChange={(event) => choose(event.target.value)}>
          {MODELS.map((entry) => <option key={entry.id} value={entry.id} disabled={!available(entry.runtime)}>{entry.label}</option>)}
        </select>
        <span className="sr-only">Talking directly to {providerName}</span>
      </label>
      <div className="work-composer-context" aria-label="Coding context">
        <span title={repository}><FolderGit2 aria-hidden="true" />{repositoryName}</span>
        <span title="Repository work starts in an isolated worktree"><GitBranch aria-hidden="true" />Worktree</span>
        <span title="Applying, sending, and other consequential actions remain founder-held"><ShieldCheck aria-hidden="true" />Guarded</span>
      </div>
    </> : <div className="work-agent-context" aria-label="Product and go-to-market agent context">
      <span className="work-agent-spectrum" aria-hidden="true" />
      <span><strong>Drover agents</strong><small>Ideate workflows, branches, gates, and evidence loops</small></span>
    </div>}
  </div>;
}
