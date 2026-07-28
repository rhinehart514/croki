import { useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import { FileCode, Plus } from "lucide-react";
import type { FirmConfiguration, FirmConfiguredAgent } from "@/types";
import { CrewFace } from "@/components/crew/CrewFace";
import { AgentCreateDialog } from "@/components/workspace/AgentCreateDialog";
import {
  fileMentionEndingAt,
  fileMentionSpans,
  fileMentionStartingAt,
  fileMentionTokenFor,
  pruneFileMentions,
  type ComposerFileMention,
} from "./composerFileMentions";
import { openComposerSourceReference } from "./composerSourceReference";

const MAX_FILE_MATCHES = 6;

// Rank repo-relative paths against what the founder has typed after `@`: a basename that starts with the
// needle beats one that merely contains it, so `@Work` surfaces WorkSurface.tsx before a deep path that
// happens to include the word. Shorter paths win ties — the nearer file is usually the intended one.
function fileMatchesFor(needle: string, files: string[]) {
  if (!needle) return [];
  const query = needle.toLowerCase();
  return files
    .map((path) => {
      const lower = path.toLowerCase();
      const base = lower.slice(lower.lastIndexOf("/") + 1);
      const rank = base.startsWith(query) ? 0 : lower.startsWith(query) ? 1 : base.includes(query) ? 2 : lower.includes(query) ? 3 : 4;
      return { path, rank };
    })
    .filter((entry) => entry.rank < 4)
    .sort((left, right) => left.rank - right.rank || left.path.length - right.path.length || left.path.localeCompare(right.path))
    .slice(0, MAX_FILE_MATCHES)
    .map((entry) => entry.path);
}

function fileBasename(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

type Trigger = { kind: "mention" | "command"; start: number; end: number; query: string; key: string };
type Mention = { ref: string; token: string };
const AGENT_COMMANDS = ["/agent", "/add-agent"];

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function triggerFor(draft: string, caret: number, completeNames: string[]): Trigger | null {
  const before = draft.slice(0, caret);
  const command = before.match(/^\/[a-z-]*$/i);
  if (command && AGENT_COMMANDS.some((entry) => entry.startsWith(command[0].toLowerCase()))) {
    return { kind: "command", start: 0, end: caret, query: command[0], key: `command:${command[0]}` };
  }
  const mention = before.match(/(?:^|\s)@([^@\n]*)$/);
  if (!mention) return null;
  const start = before.lastIndexOf("@");
  const afterAt = before.slice(start + 1);
  if (completeNames.some((name) => afterAt === name || afterAt.startsWith(`${name} `))) return null;
  return { kind: "mention", start, end: caret, query: mention[1].trim(), key: `mention:${start}:${mention[1]}` };
}

function mentionedAgentRefs(draft: string, agents: FirmConfiguredAgent[], mentions: Mention[]) {
  const selected = mentions.filter((entry) => draft.includes(entry.token)).map((entry) => entry.ref);
  const typed = agents.filter((agent) => new RegExp(`@${escapePattern(agent.name)}(?:\\s|$)`, "i").test(draft)).map((agent) => agent.ref);
  return [...new Set([...selected, ...typed])];
}

export function useAgentComposer({ ventureId, draft, setDraft, textareaRef, configuration, readOnlyReason, onConfigurationChanged, repositoryFiles = [], fileMentions = [], onFileMentions }: {
  ventureId: string;
  draft: string;
  setDraft: (value: string | ((current: string) => string)) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  configuration: FirmConfiguration | null;
  readOnlyReason: string | null | undefined;
  onConfigurationChanged: () => void;
  // Repo-relative paths the founder can scope with `@` in Work code mode. Empty everywhere else, so the
  // `@` menu stays agent-only outside coding. Selecting one inserts a tracked chip token that expands to
  // the exact path at send (composerFileMentions.ts).
  repositoryFiles?: string[];
  // Tracked file chips for this draft, owned by the composer's per-scope memory so they survive Thread
  // switches and restart alongside the text.
  fileMentions?: ComposerFileMention[];
  onFileMentions?: (mentions: ComposerFileMention[]) => void;
}) {
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedTrigger, setDismissedTrigger] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [pendingTrigger, setPendingTrigger] = useState<Trigger | null>(null);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [savedConfiguration, setSavedConfiguration] = useState<FirmConfiguration | null>(null);
  const activeConfiguration = savedConfiguration && (!configuration || savedConfiguration.revision >= configuration.revision)
    ? savedConfiguration
    : configuration;
  const agents = useMemo(() => activeConfiguration?.agents ?? [], [activeConfiguration]);
  const completeNames = [
    ...mentions.map((entry) => entry.token.slice(1)),
    ...agents.map((agent) => agent.name),
    ...fileMentions.map((entry) => entry.token.slice(1)),
  ];
  const trigger = triggerFor(draft, caret, completeNames);
  const visibleTrigger = trigger?.key === dismissedTrigger ? null : trigger;
  const matches = useMemo(() => {
    if (visibleTrigger?.kind !== "mention") return [];
    const needle = visibleTrigger.query.toLowerCase();
    return agents.filter((agent) => !needle || `${agent.name} ${agent.ref} ${agent.perspective ?? ""}`.toLowerCase().includes(needle)).slice(0, 6);
  }, [agents, visibleTrigger]);
  const fileMatches = useMemo(() => {
    if (visibleTrigger?.kind !== "mention" || !repositoryFiles.length) return [];
    return fileMatchesFor(visibleTrigger.query, repositoryFiles);
  }, [repositoryFiles, visibleTrigger]);
  const optionCount = matches.length + fileMatches.length + (visibleTrigger ? 1 : 0);
  const createIndex = matches.length + fileMatches.length;
  const selectedIndex = Math.min(activeIndex, Math.max(optionCount - 1, 0));

  const restoreCaret = (position: number) => {
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(position, position);
    });
  };
  const insertAgent = (agent: FirmConfiguredAgent, at = visibleTrigger ?? pendingTrigger) => {
    const token = `@${agent.name}`;
    const start = at?.start ?? draft.length;
    const end = at?.end ?? draft.length;
    const prefix = draft.slice(0, start);
    const suffix = draft.slice(end).replace(/^\s+/, "");
    const next = `${prefix}${prefix && !/\s$/.test(prefix) ? " " : ""}${token} ${suffix}`;
    setDraft(next);
    setMentions((current) => [...current.filter((entry) => entry.ref !== agent.ref), { ref: agent.ref, token }]);
    setDismissedTrigger(null);
    setPendingTrigger(null);
    restoreCaret(next.indexOf(token, start) + token.length + 1);
  };
  const insertFile = (path: string, at = visibleTrigger ?? pendingTrigger) => {
    // Replace the `@query` region with a chip: a compact tracked token that survives editing and
    // expands to the exact repo-relative path only at send (composerFileMentions.ts).
    const token = fileMentionTokenFor(path, fileMentions);
    const start = at?.start ?? draft.length;
    const end = at?.end ?? draft.length;
    const prefix = draft.slice(0, start);
    const suffix = draft.slice(end).replace(/^\s+/, "");
    const next = `${prefix}${prefix && !/\s$/.test(prefix) ? " " : ""}${token} ${suffix}`;
    setDraft(next);
    if (!fileMentions.some((mention) => mention.path === path)) onFileMentions?.([...fileMentions, { path, token }]);
    setDismissedTrigger(null);
    setPendingTrigger(null);
    restoreCaret(next.indexOf(token, start) + token.length + 1);
  };
  const openCreator = () => {
    if (!visibleTrigger || !activeConfiguration || readOnlyReason) return;
    setPendingTrigger(visibleTrigger);
    setCreateName(visibleTrigger.kind === "mention" ? visibleTrigger.query : "");
    setCreating(true);
  };
  const choose = (index: number) => {
    if (index < matches.length) insertAgent(matches[index]);
    else if (index < createIndex) insertFile(fileMatches[index - matches.length]);
    else openCreator();
  };
  // Every tracked reference in this draft — file chips and agent mentions — under one chip grammar,
  // for painting and for atomic deletion.
  const chips: ComposerFileMention[] = [...fileMentions, ...mentions.map((entry) => ({ path: entry.ref, token: entry.token }))];
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // A chip deletes as one unit: Backspace at a token's end or Delete at its start removes the whole
    // reference and drops its tracking, never one character of it.
    if ((event.key === "Backspace" || event.key === "Delete") && chips.length) {
      const node = event.currentTarget;
      if (node.selectionStart === node.selectionEnd) {
        const span = event.key === "Backspace"
          ? fileMentionEndingAt(draft, node.selectionStart, chips)
          : fileMentionStartingAt(draft, node.selectionStart, chips);
        if (span) {
          event.preventDefault();
          const next = draft.slice(0, span.start) + draft.slice(span.end);
          setDraft(next);
          onFileMentions?.(pruneFileMentions(next, fileMentions));
          restoreCaret(span.start);
          return true;
        }
      }
    }
    if (!visibleTrigger || !optionCount) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + optionCount) % optionCount);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(selectedIndex);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedTrigger(visibleTrigger.key);
      return true;
    }
    return false;
  };
  const onDraftChange = (value: string, position: number) => {
    setDraft(value);
    setCaret(position);
    setActiveIndex(0);
    setDismissedTrigger(null);
  };

  const menuLabel = visibleTrigger?.kind === "command"
    ? "Agent commands"
    : fileMatches.length ? "Mention an agent or file" : "Mention an agent";
  const menu = visibleTrigger ? <div className="now-agent-menu" id="composer-agent-menu" role="listbox" aria-label={menuLabel}>
    {matches.map((agent, index) => <button type="button" role="option" aria-selected={selectedIndex === index} data-active={selectedIndex === index ? "true" : undefined} id={`composer-agent-${agent.ref}`} key={agent.ref} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
      <CrewFace agentRef={agent.ref} size={26} /><span><strong>{agent.name}</strong><small>{agent.perspective ?? "Venture agent"}</small></span>
    </button>)}
    {fileMatches.map((path, index) => { const optionIndex = matches.length + index; return <button type="button" className="now-agent-menu-file" role="option" aria-selected={selectedIndex === optionIndex} data-active={selectedIndex === optionIndex ? "true" : undefined} id={`composer-file-${index}`} key={path} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(optionIndex)}>
      <i><FileCode aria-hidden="true" /></i><span><strong>{fileBasename(path)}</strong><small>{path}</small></span><b>File</b>
    </button>; })}
    <button type="button" role="option" aria-selected={selectedIndex === createIndex} data-active={selectedIndex === createIndex ? "true" : undefined} id="composer-agent-create" disabled={!activeConfiguration || Boolean(readOnlyReason)} onMouseDown={(event) => event.preventDefault()} onClick={openCreator}>
      <i><Plus aria-hidden="true" /></i><span><strong>{visibleTrigger.kind === "command" ? "Create an agent" : visibleTrigger.query ? `Create “${visibleTrigger.query}”` : "Create an agent"}</strong><small>{visibleTrigger.kind === "command" ? "/agent · /add-agent" : "Add a venture specialist"}</small></span>
    </button>
  </div> : null;

  const dialog = creating && activeConfiguration ? <AgentCreateDialog
    ventureId={ventureId}
    configuration={activeConfiguration}
    initialName={createName}
    readOnlyReason={readOnlyReason ?? null}
    onClose={() => { setCreating(false); setPendingTrigger(null); restoreCaret(caret); }}
    onCreated={(agent, nextConfiguration) => {
      setSavedConfiguration(nextConfiguration);
      setCreating(false);
      insertAgent(agent, pendingTrigger);
      onConfigurationChanged();
    }}
  /> : null;

  return {
    menu,
    dialog,
    onDraftChange,
    onCaretChange: (position: number) => {
      setCaret(position);
      setActiveIndex(0);
      const source = fileMentionSpans(draft, fileMentions).find((span) => (
        span.sourceRef
        && span.scopeKey
        && span.startLine
        && span.endLine
        && position >= span.start
        && position <= span.end
      ));
      if (source?.sourceRef && source.scopeKey && source.startLine && source.endLine) {
        openComposerSourceReference({
          scopeKey: source.scopeKey,
          path: source.path,
          startLine: source.startLine,
          endLine: source.endLine,
          ref: source.sourceRef,
        });
      }
    },
    onKeyDown,
    chipMentions: chips,
    mentionedAgentRefs: mentionedAgentRefs(draft, agents, mentions),
    clearMentions: () => setMentions([]),
    inputAria: visibleTrigger ? {
      role: "combobox" as const,
      "aria-autocomplete": "list" as const,
      "aria-controls": "composer-agent-menu",
      "aria-expanded": true,
      "aria-activedescendant": selectedIndex < matches.length
        ? `composer-agent-${matches[selectedIndex].ref}`
        : selectedIndex < createIndex ? `composer-file-${selectedIndex - matches.length}` : "composer-agent-create",
    } : { role: "combobox" as const, "aria-expanded": false },
  };
}
