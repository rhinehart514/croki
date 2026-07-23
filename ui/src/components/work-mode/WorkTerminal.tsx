import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import "./work-runtime.css";

type TerminalState = "connecting" | "ready" | "completed" | "failed" | "cancelled" | "error" | "unavailable";
type TerminalTone = "idle" | "live" | "warn";

export type WorkTerminalStatus = { label: string; tone: TerminalTone };

export type WorkTerminalProps = {
  ventureId: string;
  workspaceId: string;
  disabledReason?: string | null;
  unavailableReason?: string | null;
  className?: string;
  onStatus?: (status: WorkTerminalStatus) => void;
};

function message(state: TerminalState, exitCode: number | null, signal: number | null) {
  if (state === "connecting") return "Connecting";
  if (state === "ready") return "Live";
  if (state === "completed") return `Completed${exitCode === null ? "" : ` · exit ${exitCode}`}`;
  if (state === "failed") return `Failed${exitCode === null ? "" : ` · exit ${exitCode}`}`;
  if (state === "cancelled") return `Cancelled${signal === null ? "" : ` · signal ${signal}`}`;
  if (state === "error") return "Unavailable";
  return "Desktop only";
}

function tone(state: TerminalState): TerminalTone {
  if (state === "ready" || state === "completed") return "live";
  if (state === "failed" || state === "cancelled" || state === "error") return "warn";
  return "idle";
}

export function WorkTerminal({ ventureId, workspaceId, disabledReason = null, unavailableReason = null, className = "", onStatus }: WorkTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [state, setState] = useState<TerminalState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [signal, setSignal] = useState<number | null>(null);
  const [sessionWorkspaceId, setSessionWorkspaceId] = useState<string | null>(null);

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
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      disableStdin: Boolean(disabledReason),
      fontFamily: '"SF Mono", "JetBrains Mono Variable", monospace',
      fontSize: 12,
      lineHeight: 1.35,
      screenReaderMode: true,
      scrollback: 5_000,
      theme: {
        background: "#141414", foreground: "#d4d4d4", cursor: "#75a7ff",
        selectionBackground: "#3f73d855", black: "#171717", brightBlack: "#737373",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;

    const report = (reason: unknown) => {
      if (disposed) return;
      setState("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    };
    const pendingData: string[] = [];
    const stopData = bridge.onData((event) => {
      if (sessionRef.current === null) pendingData.push(event.sessionId, event.data);
      else if (event.sessionId === sessionRef.current) terminal.write(event.data);
    });
    const stopExit = bridge.onExit((event) => {
      if (event.sessionId !== sessionRef.current) return;
      setExitCode(event.exitCode);
      setSignal(event.signal ?? null);
      setState(event.terminal);
    });
    const input = terminal.onData((data) => {
      const sessionId = sessionRef.current;
      if (!sessionId || disabledReason) return;
      void bridge.write(sessionId, data).catch(report);
    });

    const resize = () => {
      try {
        fit.fit();
        const sessionId = sessionRef.current;
        if (sessionId) void bridge.resize(sessionId, terminal.cols, terminal.rows).catch(report);
      } catch { /* a zero-sized drawer will fit on its next resize */ }
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(host);
    resize();

    setState("connecting");
    setError(null);
    void bridge.open({ ventureId, workspaceId, cols: terminal.cols, rows: terminal.rows }).then((opened) => {
      if (disposed) return;
      sessionRef.current = opened.sessionId;
      setSessionWorkspaceId(workspaceId);
      if (opened.snapshot) terminal.write(opened.snapshot);
      for (let index = 0; index < pendingData.length; index += 2) {
        if (pendingData[index] === opened.sessionId) terminal.write(pendingData[index + 1]);
      }
      if (opened.exit) {
        setExitCode(opened.exit.exitCode);
        setSignal(opened.exit.signal ?? null);
        setState(opened.exit.terminal);
      } else setState("ready");
      resize();
    }).catch(report);

    return () => {
      disposed = true;
      observer?.disconnect();
      input.dispose();
      stopData();
      stopExit();
      terminal.dispose();
      terminalRef.current = null;
      sessionRef.current = null;
    };
  }, [ventureId, workspaceId, disabledReason, unavailableReason]);

  // Report status upward so the collapsed terminal drawer can show liveness without keeping the PTY
  // mounted. The last reported status persists in the parent after this view unmounts on collapse.
  useEffect(() => {
    onStatus?.({ label: message(state, exitCode, signal), tone: tone(state) });
  }, [state, exitCode, signal, onStatus]);

  const restart = async () => {
    const bridge = window.droverDesktop?.terminal;
    const terminal = terminalRef.current;
    const sessionId = sessionRef.current;
    if (!bridge || !terminal || !sessionId) return;
    setState("connecting"); setError(null); setExitCode(null); setSignal(null); terminal.reset();
    try { await bridge.restart(sessionId); setState("ready"); }
    catch (reason) { setState("error"); setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <section className={`work-terminal ${className}`.trim()} aria-label="Coding workspace terminal">
      <header className="work-runtime-bar">
        <span data-state={state}>{message(state, exitCode, signal)}</span>
        {(["completed", "failed", "cancelled", "error"] as TerminalState[]).includes(state) && sessionWorkspaceId === workspaceId ? <button type="button" onClick={() => void restart()} disabled={Boolean(disabledReason)}>Restart</button> : null}
      </header>
      {disabledReason ? <p className="work-runtime-notice">{disabledReason}</p> : null}
      {error ? <p className="work-runtime-notice" role={state === "error" ? "alert" : "status"}>{error}</p> : null}
      <div ref={hostRef} className="work-terminal-host" />
    </section>
  );
}
