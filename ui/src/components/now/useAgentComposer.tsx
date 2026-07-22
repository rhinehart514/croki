import { useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import { Plus } from "lucide-react";
import type { FirmConfiguration, FirmConfiguredAgent } from "@/types";
import { CrewFace } from "@/components/crew/CrewFace";
import { AgentCreateDialog } from "@/components/workspace/AgentCreateDialog";

type Trigger = { kind: "mention" | "command"; start: number; end: number; query: string; key: string };
type Mention = { ref: string; token: string };
const AGENT_COMMANDS = ["/agent", "/add-agent"];

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function triggerFor(draft: string, caret: number, mentions: Mention[], agents: FirmConfiguredAgent[]): Trigger | null {
  const before = draft.slice(0, caret);
  const command = before.match(/^\/[a-z-]*$/i);
  if (command && AGENT_COMMANDS.some((entry) => entry.startsWith(command[0].toLowerCase()))) {
    return { kind: "command", start: 0, end: caret, query: command[0], key: `command:${command[0]}` };
  }
  const mention = before.match(/(?:^|\s)@([^@\n]*)$/);
  if (!mention) return null;
  const start = before.lastIndexOf("@");
  const afterAt = before.slice(start + 1);
  const completeNames = [...mentions.map((entry) => entry.token.slice(1)), ...agents.map((agent) => agent.name)];
  if (completeNames.some((name) => afterAt === name || afterAt.startsWith(`${name} `))) return null;
  return { kind: "mention", start, end: caret, query: mention[1].trim(), key: `mention:${start}:${mention[1]}` };
}

function mentionedAgentRefs(draft: string, agents: FirmConfiguredAgent[], mentions: Mention[]) {
  const selected = mentions.filter((entry) => draft.includes(entry.token)).map((entry) => entry.ref);
  const typed = agents.filter((agent) => new RegExp(`@${escapePattern(agent.name)}(?:\\s|$)`, "i").test(draft)).map((agent) => agent.ref);
  return [...new Set([...selected, ...typed])];
}

export function useAgentComposer({ ventureId, draft, setDraft, textareaRef, configuration, readOnlyReason, onConfigurationChanged }: {
  ventureId: string;
  draft: string;
  setDraft: (value: string | ((current: string) => string)) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  configuration: FirmConfiguration | null;
  readOnlyReason: string | null | undefined;
  onConfigurationChanged: () => void;
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
  const trigger = triggerFor(draft, caret, mentions, agents);
  const visibleTrigger = trigger?.key === dismissedTrigger ? null : trigger;
  const matches = useMemo(() => {
    if (visibleTrigger?.kind !== "mention") return [];
    const needle = visibleTrigger.query.toLowerCase();
    return agents.filter((agent) => !needle || `${agent.name} ${agent.ref} ${agent.perspective ?? ""}`.toLowerCase().includes(needle)).slice(0, 6);
  }, [agents, visibleTrigger]);
  const optionCount = matches.length + (visibleTrigger ? 1 : 0);
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
  const openCreator = () => {
    if (!visibleTrigger || !activeConfiguration || readOnlyReason) return;
    setPendingTrigger(visibleTrigger);
    setCreateName(visibleTrigger.kind === "mention" ? visibleTrigger.query : "");
    setCreating(true);
  };
  const choose = (index: number) => {
    if (index < matches.length) insertAgent(matches[index]);
    else openCreator();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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

  const menu = visibleTrigger ? <div className="now-agent-menu" id="composer-agent-menu" role="listbox" aria-label={visibleTrigger.kind === "mention" ? "Mention an agent" : "Agent commands"}>
    {matches.map((agent, index) => <button type="button" role="option" aria-selected={selectedIndex === index} data-active={selectedIndex === index ? "true" : undefined} id={`composer-agent-${agent.ref}`} key={agent.ref} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
      <CrewFace agentRef={agent.ref} size={26} /><span><strong>{agent.name}</strong><small>{agent.perspective ?? "Venture agent"}</small></span>
    </button>)}
    <button type="button" role="option" aria-selected={selectedIndex === matches.length} data-active={selectedIndex === matches.length ? "true" : undefined} id="composer-agent-create" disabled={!activeConfiguration || Boolean(readOnlyReason)} onMouseDown={(event) => event.preventDefault()} onClick={openCreator}>
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
    onCaretChange: (position: number) => { setCaret(position); setActiveIndex(0); },
    onKeyDown,
    mentionedAgentRefs: mentionedAgentRefs(draft, agents, mentions),
    clearMentions: () => setMentions([]),
    inputAria: visibleTrigger ? {
      "aria-autocomplete": "list" as const,
      "aria-controls": "composer-agent-menu",
      "aria-expanded": true,
      "aria-activedescendant": selectedIndex < matches.length ? `composer-agent-${matches[selectedIndex].ref}` : "composer-agent-create",
    } : { "aria-expanded": false },
  };
}
