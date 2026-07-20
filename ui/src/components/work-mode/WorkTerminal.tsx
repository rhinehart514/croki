import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import "./work-runtime.css";

type TerminalState = "connecting" | "ready" | "exited" | "failed" | "unavailable";

export type WorkTerminalProps = {
  ventureId: string;
  workspaceId: string;
  disabledReason?: string | null;
  unavailableReason?: string | null;
  className?: string;
};

function message(state: TerminalState, exitCode: number | null) {
  if (state === "connecting") return "Connecting";
  if (state === "ready") return "Live";
  if (state === "exited") return `Exited${exitCode === null ? "" : ` · ${exitCode}`}`;
  if (state === "failed") return "Unavailable";
  return "Desktop only";
}

export function WorkTerminal({ ventureId, workspaceId, disabledReason = null, unavailableReason = null, className = "" }: WorkTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [state, setState] = useState<TerminalState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [sessionWorkspaceId, setSessionWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.droverDesktop?.terminal;
    const host = hostRef.current;
    if (!bridge || !host || unavailableReason) {
      setState("unavailable");
      setError(unavailableReason ?? "Terminal is available in the Drover desktop app.");
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
      setState("failed");
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
      setState("exited");
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
        setState("exited");
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

  const restart = async () => {
    const bridge = window.droverDesktop?.terminal;
    const terminal = terminalRef.current;
    const sessionId = sessionRef.current;
    if (!bridge || !terminal || !sessionId) return;
    setState("connecting"); setError(null); setExitCode(null); terminal.reset();
    try { await bridge.restart(sessionId); setState("ready"); }
    catch (reason) { setState("failed"); setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <section className={`work-terminal ${className}`.trim()} aria-label="Coding workspace terminal">
      <header className="work-runtime-bar">
        <strong>Terminal</strong>
        <span data-state={state}>{message(state, exitCode)}</span>
        {(state === "exited" || state === "failed") && sessionWorkspaceId === workspaceId ? <button type="button" onClick={() => void restart()} disabled={Boolean(disabledReason)}>Restart</button> : null}
      </header>
      {disabledReason ? <p className="work-runtime-notice">{disabledReason}</p> : null}
      {error ? <p className="work-runtime-notice" role={state === "failed" ? "alert" : "status"}>{error}</p> : null}
      <div ref={hostRef} className="work-terminal-host" />
    </section>
  );
}
