import { useEffect, useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import { getRuntimeStatuses, type FirmRuntimeStatus } from "@/api";

type NativeEntry = {
  reference: string;
  description: string | null;
  kind: "Skill" | "Command";
};

type ReferenceTrigger = {
  start: number;
  end: number;
  token: string;
  key: string;
};

const lastKnownRuntimes = new Map<string, FirmRuntimeStatus[]>();

function referenceTrigger(draft: string, caret: number): ReferenceTrigger | null {
  const before = draft.slice(0, caret);
  const match = before.match(/(?:^|\s)([/$][a-z0-9:_-]*)$/i);
  if (!match) return null;
  const token = match[1];
  const start = before.lastIndexOf(token);
  return { start, end: caret, token, key: `${start}:${token}` };
}

function entriesForRuntime(runtimes: FirmRuntimeStatus[], runtime: string | null): NativeEntry[] {
  const capabilities = runtimes.find((entry) => entry.id === runtime && entry.connected)?.capabilities;
  if (!capabilities) return [];
  const entries: NativeEntry[] = [
    ...capabilities.skills.map((entry) => ({ ...entry, kind: "Skill" as const })),
    ...capabilities.slashCommands.map((entry) => ({ ...entry, kind: "Command" as const })),
  ];
  return [...new Map(entries.map((entry) => [entry.reference, entry] as const)).values()];
}

// Provider-owned skills and commands remain sentence-level intent. The catalog appears only after the
// founder starts an exact `/` or `$` reference; choosing one completes text and never persists a hidden mode.
export function useNativeCapabilityComposer({ ventureId, runtime, draft, setDraft, textareaRef }: {
  ventureId: string;
  runtime: string | null;
  draft: string;
  setDraft: (value: string | ((current: string) => string)) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [runtimes, setRuntimes] = useState<FirmRuntimeStatus[]>(() => lastKnownRuntimes.get(ventureId) ?? []);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedTrigger, setDismissedTrigger] = useState<string | null>(null);

  useEffect(() => {
    if (!runtime) return undefined;
    let live = true;
    getRuntimeStatuses(ventureId).then((result) => {
      lastKnownRuntimes.set(ventureId, result.runtimes);
      if (live) setRuntimes(result.runtimes);
    }).catch(() => {});
    return () => { live = false; };
  }, [runtime, ventureId]);

  const entries = useMemo(() => entriesForRuntime(runtimes, runtime), [runtime, runtimes]);
  const trigger = referenceTrigger(draft, caret);
  const matches = useMemo(() => {
    if (!trigger || trigger.key === dismissedTrigger) return [];
    const token = trigger.token.toLowerCase();
    return entries
      .filter((entry) => entry.reference.toLowerCase().startsWith(token))
      .slice(0, 8);
  }, [dismissedTrigger, entries, trigger]);
  const visibleTrigger = matches.length ? trigger : null;
  const selectedIndex = Math.min(activeIndex, Math.max(matches.length - 1, 0));

  const restoreCaret = (position: number) => {
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(position, position);
    });
  };
  const choose = (index: number) => {
    const entry = matches[index];
    if (!entry || !visibleTrigger) return;
    const suffix = draft.slice(visibleTrigger.end).replace(/^\s+/, "");
    const next = `${draft.slice(0, visibleTrigger.start)}${entry.reference} ${suffix}`;
    setDraft(next);
    setDismissedTrigger(null);
    restoreCaret(visibleTrigger.start + entry.reference.length + 1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!visibleTrigger) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
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

  const menu = visibleTrigger ? (
    <div className="now-agent-menu now-native-reference-menu" id="composer-native-reference-menu" role="listbox" aria-label="Complete a native provider reference">
      {matches.map((entry, index) => (
        <button
          type="button"
          role="option"
          aria-selected={selectedIndex === index}
          data-active={selectedIndex === index ? "true" : undefined}
          id={`composer-native-reference-${index}`}
          key={entry.reference}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(index)}
        >
          <span><strong>{entry.reference}</strong><small>{entry.description ?? `Use this native ${entry.kind.toLowerCase()}`}</small></span>
          <b>{entry.kind}</b>
        </button>
      ))}
    </div>
  ) : null;

  return {
    menu,
    onDraftChange: (position: number) => {
      setCaret(position);
      setActiveIndex(0);
      setDismissedTrigger(null);
    },
    onCaretChange: (position: number) => {
      setCaret(position);
      setActiveIndex(0);
    },
    onKeyDown,
    inputAria: visibleTrigger ? {
      role: "combobox" as const,
      "aria-autocomplete": "list" as const,
      "aria-controls": "composer-native-reference-menu",
      "aria-expanded": true,
      "aria-activedescendant": `composer-native-reference-${selectedIndex}`,
    } : null,
  };
}
