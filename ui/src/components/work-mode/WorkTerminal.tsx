import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Columns2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { composerScopeKey } from "@/components/now/composerScope";
import { detectTerminalLinks, repositoryPath, TERMINAL_FILE_LINK_EVENT } from "./terminalLinks";
import {
  OPEN_TERMINAL_REFERENCE_EVENT,
  publishTerminalReference,
  takeQueuedTerminalReference,
  type TerminalReference,
} from "./terminalReference";
import {
  nextTerminal,
  readTerminalLayout,
  rememberTerminalLayout,
  removeTerminal,
  type TerminalDescriptor,
  type TerminalLayout,
} from "./terminalLayout";
import "@xterm/xterm/css/xterm.css";
import "./work-runtime.css";

type TerminalState = "connecting" | "ready" | "completed" | "failed" | "cancelled" | "error" | "unavailable";
type TerminalTone = "idle" | "live" | "warn";
export type WorkTerminalStatus = { label: string; tone: TerminalTone };

export type WorkTerminalProps = {
  ventureId: string;
  workspaceId: string;
  threadRef?: string | null;
  betId?: string | null;
  worktree?: string | null;
  disabledReason?: string | null;
  unavailableReason?: string | null;
  className?: string;
  onStatus?: (status: WorkTerminalStatus) => void;
};

function stateLabel(state: TerminalState, exitCode: number | null, signal: number | null) {
  if (state === "connecting") return "Connecting";
  if (state === "ready") return "Live";
  if (state === "completed") return `Completed${exitCode === null ? "" : ` · exit ${exitCode}`}`;
  if (state === "failed") return `Failed${exitCode === null ? "" : ` · exit ${exitCode}`}`;
  if (state === "cancelled") return `Cancelled${signal === null ? "" : ` · signal ${signal}`}`;
  if (state === "error") return "Unavailable";
  return "Desktop only";
}

const tone = (state: TerminalState): TerminalTone => (
  state === "ready" || state === "completed" ? "live"
    : state === "failed" || state === "cancelled" || state === "error" ? "warn" : "idle"
);

function TerminalPane({ descriptor, ventureId, workspaceId, threadRef, betId, worktree, disabledReason, unavailableReason, reopen, onStatus }: {
  descriptor: TerminalDescriptor;
  ventureId: string;
  workspaceId: string;
  threadRef: string;
  betId: string | null;
  worktree?: string | null;
  disabledReason: string | null;
  unavailableReason: string | null;
  reopen: TerminalReference | null;
  onStatus?: (status: WorkTerminalStatus) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [state, setState] = useState<TerminalState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [signal, setSignal] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ text: string; start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const bridge = window.droverDesktop?.terminal;
    const host = hostRef.current;
    if (!bridge || !host || unavailableReason) {
      setState("unavailable");
      setError(unavailableReason ?? "Terminal is available in the Croki desktop app.");
      return;
    }
    let disposed = false;
    const terminal = new Terminal({
      allowProposedApi: false, convertEol: true, cursorBlink: true, disableStdin: Boolean(disabledReason),
      fontFamily: '"SF Mono", "JetBrains Mono Variable", monospace', fontSize: 12, lineHeight: 1.35,
      screenReaderMode: true, scrollback: 5_000,
      theme: { background: "#141414", foreground: "#d4d4d4", cursor: "#75a7ff", selectionBackground: "#3f73d855", black: "#171717", brightBlack: "#737373" },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;
    const report = (reason: unknown) => {
      if (!disposed) { setState("error"); setError(reason instanceof Error ? reason.message : String(reason)); }
    };
    const pending: DroverTerminalData[] = [];
    const stopData = bridge.onData((event) => {
      if (!sessionRef.current) pending.push(event);
      else if (event.sessionId === sessionRef.current) terminal.write(event.data);
    });
    const stopExit = bridge.onExit((event) => {
      if (event.sessionId !== sessionRef.current) return;
      setExitCode(event.exitCode); setSignal(event.signal ?? null); setState(event.terminal);
    });
    const input = terminal.onData((data) => {
      if (sessionRef.current && !disabledReason) void bridge.write(sessionRef.current, data).catch(report);
    });
    const selected = terminal.onSelectionChange(() => {
      const text = terminal.getSelection();
      const position = terminal.getSelectionPosition();
      setSelection(text && position ? { text, start: position.start, end: position.end } : null);
    });
    terminal.registerLinkProvider({
      provideLinks: (line, callback) => {
        const value = terminal.buffer.active.getLine(line - 1)?.translateToString(true) ?? "";
        callback(detectTerminalLinks(value).map((link) => ({
          text: link.value,
          range: { start: { x: link.start + 1, y: line }, end: { x: link.end + 1, y: line } },
          activate: () => {
            if (link.kind === "url") {
              if (link.localhost) window.dispatchEvent(new CustomEvent("drover:terminal-preview-link", { detail: { workspaceId, url: link.value } }));
              else window.open(link.value, "_blank", "noopener,noreferrer");
              return;
            }
            const path = repositoryPath(link, worktree);
            if (!path) return;
            window.dispatchEvent(new CustomEvent(TERMINAL_FILE_LINK_EVENT, { detail: {
              workspaceId,
              reference: {
                scopeKey: composerScopeKey(ventureId, { betId, workRef: null, teammateRefs: [], threadRef }),
                path, startLine: link.line, endLine: link.line, ref: `repo:${workspaceId}:${path}:L${link.line}`,
              },
            } }));
          },
        })));
      },
    });
    const resize = () => {
      try {
        fit.fit();
        if (sessionRef.current) void bridge.resize(sessionRef.current, terminal.cols, terminal.rows).catch(report);
      } catch { /* hidden/zero-sized pane */ }
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(host);
    resize();
    setState("connecting"); setError(null);
    void bridge.open({
      ventureId, workspaceId, terminalId: descriptor.id, name: descriptor.name,
      cols: terminal.cols, rows: terminal.rows,
    }).then((opened) => {
      if (disposed) return;
      sessionRef.current = opened.sessionId;
      if (opened.snapshot) terminal.write(opened.snapshot);
      for (const event of pending) if (event.sessionId === opened.sessionId) terminal.write(event.data);
      if (opened.exit) {
        setExitCode(opened.exit.exitCode); setSignal(opened.exit.signal ?? null); setState(opened.exit.terminal);
      } else setState("ready");
      resize();
      if (reopen?.terminalId === descriptor.id) {
        window.setTimeout(() => terminal.select(reopen.start.x, reopen.start.y, reopen.text.length), 0);
      }
    }).catch(report);
    return () => {
      disposed = true; observer?.disconnect(); input.dispose(); selected.dispose(); stopData(); stopExit();
      terminal.dispose(); terminalRef.current = null; sessionRef.current = null;
    };
  }, [betId, descriptor.id, descriptor.name, disabledReason, reopen, threadRef, unavailableReason, ventureId, workspaceId, worktree]);

  useEffect(() => {
    onStatus?.({ label: stateLabel(state, exitCode, signal), tone: tone(state) });
  }, [exitCode, onStatus, signal, state]);

  const restart = async () => {
    const bridge = window.droverDesktop?.terminal;
    if (!bridge || !sessionRef.current) return;
    setState("connecting"); setError(null); setExitCode(null); setSignal(null);
    try { await bridge.restart(sessionRef.current); setState("ready"); }
    catch (reason) { setState("error"); setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const attach = () => {
    if (!selection) return;
    publishTerminalReference({
      ref: `terminal:${workspaceId}:${descriptor.id}:range`,
      ventureId, workspaceId, threadRef, terminalId: descriptor.id, terminalName: descriptor.name,
      text: selection.text.slice(0, 8_000), start: selection.start, end: selection.end,
    });
  };

  return <section className="work-terminal-pane" aria-label={`${descriptor.name} terminal`}>
    <header className="work-runtime-bar">
      <strong>{descriptor.name}</strong>
      <span data-state={state}>{stateLabel(state, exitCode, signal)}</span>
      {selection ? <button type="button" onClick={attach}>Attach selection</button> : null}
      {(["completed", "failed", "cancelled", "error"] as TerminalState[]).includes(state) ? <button type="button" aria-label={`Restart ${descriptor.name}`} onClick={() => void restart()} disabled={Boolean(disabledReason)}><RotateCcw aria-hidden="true" />Restart</button> : null}
    </header>
    {disabledReason ? <p className="work-runtime-notice">{disabledReason}</p> : null}
    {error ? <p className="work-runtime-notice" role={state === "error" ? "alert" : "status"}>{error}</p> : null}
    <div ref={hostRef} className="work-terminal-host" />
  </section>;
}

export function WorkTerminal({ ventureId, workspaceId, threadRef = "", betId = null, worktree = null, disabledReason = null, unavailableReason = null, className = "", onStatus }: WorkTerminalProps) {
  const [layout, setLayout] = useState<TerminalLayout>(() => readTerminalLayout(ventureId, workspaceId));
  const [reopen, setReopen] = useState<TerminalReference | null>(() => takeQueuedTerminalReference(workspaceId));
  const bridge = window.droverDesktop?.terminal;
  const active = layout.terminals.find((entry) => entry.id === layout.activeId) ?? layout.terminals[0];
  const split = layout.terminals.find((entry) => entry.id === layout.splitId) ?? null;
  const shown = useMemo(() => split ? [active, split] : [active], [active, split]);
  const update = useCallback((next: TerminalLayout) => {
    setLayout(next); rememberTerminalLayout(ventureId, workspaceId, next);
  }, [ventureId, workspaceId]);
  useEffect(() => {
    const open = (event: Event) => {
      const reference = (event as CustomEvent<TerminalReference>).detail;
      if (reference?.ventureId !== ventureId || reference.workspaceId !== workspaceId) return;
      setReopen(reference);
      if (!layout.terminals.some((entry) => entry.id === reference.terminalId)) {
        update({ ...layout, terminals: [...layout.terminals, { id: reference.terminalId, name: reference.terminalName }], activeId: reference.terminalId });
      } else update({ ...layout, activeId: reference.terminalId });
    };
    window.addEventListener(OPEN_TERMINAL_REFERENCE_EVENT, open);
    return () => window.removeEventListener(OPEN_TERMINAL_REFERENCE_EVENT, open);
  }, [layout, update, ventureId, workspaceId]);
  const create = () => update(nextTerminal(layout, crypto.randomUUID()));
  const rename = () => {
    const name = window.prompt("Terminal name", active.name)?.trim().slice(0, 48);
    if (!name) return;
    update({ ...layout, terminals: layout.terminals.map((entry) => entry.id === active.id ? { ...entry, name } : entry) });
  };
  const close = async () => {
    if (layout.terminals.length === 1) return;
    const id = active.id;
    const sessions = bridge ? await bridge.inspect(ventureId, workspaceId).catch(() => []) : [];
    const session = sessions.find((entry) => entry.terminalId === id);
    if (session && bridge) await bridge.close(session.sessionId).catch(() => undefined);
    update(removeTerminal(layout, id));
  };
  const toggleSplit = () => {
    if (layout.splitId) update({ ...layout, splitId: null });
    else {
      const other = layout.terminals.find((entry) => entry.id !== active.id);
      if (other) update({ ...layout, splitId: other.id });
      else {
        const next = nextTerminal(layout, crypto.randomUUID());
        update({ ...next, activeId: active.id, splitId: next.activeId });
      }
    }
  };

  if (!bridge || unavailableReason) {
    return <section className={`work-terminal-manager ${className}`.trim()}><p className="work-runtime-notice" role="status">{unavailableReason ?? "Terminal is available in the Croki desktop app."}</p></section>;
  }
  return <section className={`work-terminal-manager ${className}`.trim()} aria-label="Coding workspace terminals" data-split={split ? "true" : undefined}>
    <nav className="work-terminal-tabs" aria-label="Named terminals">
      {layout.terminals.map((entry) => <button type="button" key={entry.id} aria-pressed={entry.id === active.id} onClick={() => update({ ...layout, activeId: entry.id, splitId: layout.splitId === entry.id ? null : layout.splitId })}>{entry.name}</button>)}
      <button type="button" aria-label="New terminal" onClick={create} disabled={layout.terminals.length >= 8}><Plus aria-hidden="true" /></button>
      <button type="button" aria-label={split ? "Close terminal split" : "Split terminal"} onClick={toggleSplit}><Columns2 aria-hidden="true" /></button>
      <button type="button" aria-label={`Rename ${active.name}`} onClick={rename}><Pencil aria-hidden="true" /></button>
      <button type="button" aria-label={`Close ${active.name}`} onClick={() => void close()} disabled={layout.terminals.length === 1}><Trash2 aria-hidden="true" /></button>
    </nav>
    <div className="work-terminal-grid">
      {shown.map((entry) => <TerminalPane key={entry.id} descriptor={entry} ventureId={ventureId} workspaceId={workspaceId} threadRef={threadRef ?? ""} betId={betId} worktree={worktree} disabledReason={disabledReason} unavailableReason={unavailableReason} reopen={reopen?.terminalId === entry.id ? reopen : null} onStatus={entry.id === active.id ? onStatus : undefined} />)}
    </div>
  </section>;
}
