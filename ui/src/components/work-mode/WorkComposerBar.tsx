import { useEffect, useState } from "react";
import { Bot, FolderGit2, GitBranch, ShieldCheck } from "lucide-react";
import { getRuntimeStatuses, type FirmRuntimeStatus } from "@/api";

export type WorkModelChoice = { runtime: string | null; model: string | null };

const MODELS = [
  { id: "auto", label: "Auto", runtime: null, model: null },
  { id: "codex", label: "Codex · Default", runtime: "codex", model: null },
  { id: "codex:gpt-5.4", label: "GPT-5.4", runtime: "codex", model: "gpt-5.4" },
  { id: "claude-code", label: "Claude · Default", runtime: "claude-code", model: null },
  { id: "claude-code:claude-sonnet-5-0", label: "Claude Sonnet 5.0", runtime: "claude-code", model: "claude-sonnet-5-0" },
  { id: "claude-code:claude-sonnet-4-6", label: "Claude Sonnet 4.6", runtime: "claude-code", model: "claude-sonnet-4-6" },
] as const;

function initialModel(key: string) {
  try { return localStorage.getItem(key) ?? "auto"; } catch { return "auto"; }
}

export function WorkComposerBar({ ventureId, threadKey, repository, disabled, onChange }: {
  ventureId: string;
  threadKey: string;
  repository: string;
  disabled: boolean;
  onChange: (choice: WorkModelChoice) => void;
}) {
  const storageKey = `drover:work-model:${ventureId}:${threadKey}`;
  const [selected, setSelected] = useState(() => initialModel(storageKey));
  const [runtimes, setRuntimes] = useState<FirmRuntimeStatus[]>([]);
  const repositoryName = repository.split(/[\\/]/).filter(Boolean).at(-1) ?? repository;
  const choice = MODELS.find((entry) => entry.id === selected) ?? MODELS[0];

  useEffect(() => { onChange({ runtime: choice.runtime, model: choice.model }); }, [choice.model, choice.runtime, onChange]);
  useEffect(() => {
    let live = true;
    getRuntimeStatuses().then((result) => { if (live) setRuntimes(result.runtimes); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const choose = (id: string) => {
    setSelected(id);
    try { localStorage.setItem(storageKey, id); } catch { /* presentation preference only */ }
  };
  const available = (runtime: string | null) => !runtime || !runtimes.length || runtimes.some((entry) => entry.id === runtime && entry.connected);

  return <div className="work-composer-bar">
    <div className="work-composer-context" aria-label="Coding context">
      <span title={repository}><FolderGit2 aria-hidden="true" />{repositoryName}</span>
      <span title="Repository work starts in an isolated worktree"><GitBranch aria-hidden="true" />Worktree</span>
      <span title="Applying, sending, and other consequential actions remain founder-held"><ShieldCheck aria-hidden="true" />Guarded</span>
    </div>
    <label className="work-model-picker">
      <Bot aria-hidden="true" />
      <span className="sr-only">Model</span>
      <select aria-label="Model" value={choice.id} disabled={disabled} onChange={(event) => choose(event.target.value)}>
        {MODELS.map((entry) => <option key={entry.id} value={entry.id} disabled={!available(entry.runtime)}>{entry.label}</option>)}
      </select>
    </label>
  </div>;
}
