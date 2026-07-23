import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowRight, Boxes, Eye, FileDiff, MessageSquare, PenLine, Search, SquarePen, SquareTerminal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SystemIndex, SystemIndexObject, WorkIndex, WorkIndexItem } from "@/api";
import type { WorkspaceMode } from "@/lib/venture-session";
import {
  filterSearchGroups, flattenSearchRows, moveHighlight, objectSearchRow,
  sortThreadsForSearch, threadSearchRow, type SearchGroup, type SearchRow,
} from "./CommandSearch.logic";
import "./command-search.css";

const ROW_ICONS: Record<string, typeof Search> = {
  "action:new-thread": SquarePen,
  "action:switch-mode": ArrowRight,
  "action:composer": PenLine,
  "action:changes": FileDiff,
  "action:preview": Eye,
  "action:terminal": SquareTerminal,
};

function rowIcon(row: SearchRow) {
  const Icon = ROW_ICONS[row.id] ?? (row.id.startsWith("object:") ? Boxes : MessageSquare);
  return <Icon aria-hidden="true" />;
}

function focusComposer() {
  document.querySelector<HTMLTextAreaElement>(".now-composer textarea")?.focus();
}

function clickWorkbenchTab(tab: "changes" | "preview") {
  document.getElementById(`work-tab-${tab}`)?.click();
}

function openTerminalDrawer() {
  const trigger = document.querySelector<HTMLButtonElement>(".work-terminal > button");
  if (trigger && trigger.getAttribute("aria-expanded") !== "true") trigger.click();
}

// Search (⌘K) over the current surface: jump to Threads or Product / GTM map objects and run the
// few navigation actions that exist everywhere. Content scope follows the surface on purpose —
// this is not a cross-mode router.
export function CommandSearch({ mode, workIndex, systemIndex, onSelectThread, onSelectObject, onMode, onNewThread }: {
  mode: WorkspaceMode;
  workIndex: WorkIndex | null;
  systemIndex: SystemIndex | null;
  onSelectThread: (item: WorkIndexItem) => void;
  onSelectObject: (object: SystemIndexObject) => void;
  onMode: (mode: WorkspaceMode) => void;
  onNewThread: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [hasWorkbench, setHasWorkbench] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const isMac = window.droverDesktop?.platform === "darwin" || /mac/i.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl+";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key !== "k" && key !== "n") return;
      if (event.target instanceof HTMLElement && event.target.closest(".work-terminal")) return;
      event.preventDefault();
      if (key === "k") {
        setQuery("");
        setHighlight(0);
        // Workbench material only earns actions when it is actually on screen for the current Thread.
        setHasWorkbench(document.getElementById("work-tab-changes") !== null);
        setOpen((value) => !value);
      } else {
        setOpen(false);
        onNewThread();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNewThread]);

  const { groups, runById } = useMemo(() => {
    const runs = new Map<string, () => void>();
    const actionRows: SearchRow[] = [];
    const addAction = (row: SearchRow, run: () => void) => { actionRows.push(row); runs.set(row.id, run); };
    addAction(
      { id: "action:new-thread", title: "New Thread", detail: "Start a fresh direction", shortcut: `${mod}N`, searchTerms: ["new thread", "start", "direction", "create"] },
      onNewThread,
    );
    addAction(
      mode === "work"
        ? { id: "action:switch-mode", title: "Go to Product / GTM", detail: "The venture map and plays", shortcut: `${mod}2`, searchTerms: ["product", "gtm", "go-to-market", "map", "switch surface"] }
        : { id: "action:switch-mode", title: "Go to Work", detail: "Threads and coding", shortcut: `${mod}1`, searchTerms: ["work", "threads", "code", "switch surface"] },
      () => onMode(mode === "work" ? "product-gtm" : "work"),
    );
    addAction(
      { id: "action:composer", title: "Write a direction", detail: "Jump to the message box", shortcut: null, searchTerms: ["write", "direction", "message", "prompt", "compose"] },
      focusComposer,
    );
    if (mode === "work" && hasWorkbench) {
      addAction(
        { id: "action:changes", title: "Show code changes", detail: "Exact diff for this Thread", shortcut: null, searchTerms: ["changes", "diff", "code", "review"] },
        () => clickWorkbenchTab("changes"),
      );
      addAction(
        { id: "action:preview", title: "Show preview", detail: "Running app for this Thread", shortcut: null, searchTerms: ["preview", "app", "browser"] },
        () => clickWorkbenchTab("preview"),
      );
      addAction(
        { id: "action:terminal", title: "Open terminal", detail: "Commands in this Thread's workspace", shortcut: null, searchTerms: ["terminal", "shell", "command"] },
        openTerminalDrawer,
      );
    }
    const built: SearchGroup[] = [{ id: "actions", label: "Actions", atRestLimit: actionRows.length, rows: actionRows }];
    if (mode === "work") {
      const threads = sortThreadsForSearch(workIndex?.items ?? []);
      built.push({ id: "threads", label: "Threads", atRestLimit: 6, rows: threads.map(threadSearchRow) });
      for (const item of threads) runs.set(item.threadRef, () => onSelectThread(item));
    } else {
      const objects = systemIndex?.objects ?? [];
      built.push({ id: "objects", label: "Product / GTM map", atRestLimit: 0, rows: objects.map(objectSearchRow) });
      for (const object of objects) runs.set(object.objectRef, () => onSelectObject(object));
    }
    return { groups: built, runById: runs };
  }, [hasWorkbench, mod, mode, onMode, onNewThread, onSelectObject, onSelectThread, systemIndex?.objects, workIndex?.items]);

  const visible = useMemo(() => filterSearchGroups(groups, query), [groups, query]);
  const flatRows = useMemo(() => flattenSearchRows(visible), [visible]);
  // Clamp at render time so a shrinking result list never strands the highlight; no reset effect.
  const activeIndex = flatRows.length ? Math.min(highlight, flatRows.length - 1) : -1;
  const activeRow = activeIndex >= 0 ? flatRows[activeIndex] : null;

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`command-search-option-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const perform = (id: string) => {
    const run = runById.get(id);
    if (!run) return;
    pendingRef.current = run;
    setOpen(false);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(moveHighlight(flatRows.length, activeIndex, event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home" && flatRows.length) {
      event.preventDefault();
      setHighlight(0);
    } else if (event.key === "End" && flatRows.length) {
      event.preventDefault();
      setHighlight(flatRows.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeRow) perform(activeRow.id);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) { setQuery(""); setHighlight(0); } }}
      onOpenChangeComplete={(next) => {
        if (next) return;
        const run = pendingRef.current;
        pendingRef.current = null;
        run?.();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="command-search-backdrop" />
        <Dialog.Viewport className="command-search-viewport">
          <Dialog.Popup className="command-search" aria-label="Search this venture" initialFocus={inputRef}>
            <div className="command-search-field">
              <Search aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-search-results"
                aria-activedescendant={activeRow ? `command-search-option-${activeIndex}` : undefined}
                aria-label="Search this venture"
                autoComplete="off"
                spellCheck={false}
                placeholder={mode === "work" ? "Search Threads and actions" : "Search the Product / GTM map and actions"}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setHighlight(0); }}
                onKeyDown={onInputKeyDown}
              />
            </div>
            <div className="command-search-results" id="command-search-results" role="listbox" aria-label="Search results">
              {flatRows.length === 0 ? (
                <p className="command-search-empty">
                  <strong>No matches for “{query.trim()}”.</strong>
                  <span>{mode === "work" ? "Search covers Threads and actions on this surface." : "Search covers the Product / GTM map and actions on this surface."}</span>
                </p>
              ) : (
                visible.map((group, groupIndex) => {
                  const offset = visible.slice(0, groupIndex).reduce((sum, previous) => sum + previous.rows.length, 0);
                  return (
                    <section key={group.id}>
                      <h3>{group.label}</h3>
                      {group.rows.map((row, rowIndex) => {
                        const index = offset + rowIndex;
                        return (
                          <div
                            key={row.id}
                            id={`command-search-option-${index}`}
                            role="option"
                            aria-selected={index === activeIndex}
                            data-active={index === activeIndex || undefined}
                            onPointerMove={() => setHighlight(index)}
                            onClick={() => perform(row.id)}
                          >
                            {rowIcon(row)}
                            <span className="command-search-copy">
                              <strong>{row.title}</strong>
                              {row.detail ? <small>{row.detail}</small> : null}
                            </span>
                            {row.shortcut ? <kbd>{row.shortcut}</kbd> : null}
                          </div>
                        );
                      })}
                    </section>
                  );
                })
              )}
            </div>
            <footer className="command-search-hints">
              <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
              <span><kbd>↵</kbd> open</span>
              <span><kbd>esc</kbd> close</span>
            </footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
