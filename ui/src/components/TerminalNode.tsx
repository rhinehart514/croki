// A live terminal as a first-class canvas node.
//
// The real shell runs in the brain (brain/src/terminal-server.mjs); this component is just the glass:
// an xterm.js surface wired to ws://<same-origin>/api/terminal?id=<nodeId>. The session id is the node
// id, so the pty survives a remount (pan/zoom, lens switch) — the brain keeps it alive and replays its
// ring buffer on reconnect, so you never lose your scrollback or a long-running command.
//
// The canvas is something you build FROM: run `gh`, `curl`, a script here by hand, then commit the
// output (slice 2: config.output) and wire the node's right handle into a downstream step so the graph
// consumes what you ran.

import { useEffect, useRef } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { TerminalSquare } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import type { GTMNode } from "../types";

// The terminal reads as "the metal" under the warm canvas — a near-black surface with the canvas ink
// for the cursor/selection. Deliberately the one dark object on the board.
const THEME = {
  background: "#0d0f12",
  foreground: "#e6e6e6",
  cursor: "#a78bfa",
  cursorAccent: "#0d0f12",
  selectionBackground: "#3b3357",
  black: "#0d0f12",
  brightBlack: "#5b6168",
};

type TerminalNodeData = { node: GTMNode };

export default function TerminalNode({ data }: NodeProps<Node<TerminalNodeData>>) {
  const id = data.node.id;
  const cwd = (data.node.config?.cwd as string | undefined) || undefined;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = bodyRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: true,
      theme: THEME,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    // First fit after layout settles, so cols/rows match the node box before we tell the pty its size.
    requestAnimationFrame(() => { try { fit.fit(); } catch { /* not yet measurable */ } });

    const params = new URLSearchParams({ id });
    if (cwd) params.set("cwd", cwd);
    params.set("cols", String(term.cols));
    params.set("rows", String(term.rows));
    const ws = new WebSocket(`ws://${window.location.host}/api/terminal?${params}`);
    ws.binaryType = "arraybuffer";

    const send = (msg: object) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };

    ws.onmessage = (ev) => {
      const text = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
      term.write(text);
    };
    ws.onopen = () => { send({ t: "r", c: term.cols, r: term.rows }); term.focus(); };

    const onData = term.onData((d) => send({ t: "i", d }));

    // Keep the pty's dimensions in lockstep with the node box as the founder resizes or the canvas
    // zooms — a wrong size garbles wrapping and full-screen TUIs.
    const ro = new ResizeObserver(() => {
      try { fit.fit(); send({ t: "r", c: term.cols, r: term.rows }); } catch { /* mid-teardown */ }
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      onData.dispose();
      // Close the socket but DON'T kill the pty — the brain keeps the session alive so a remount
      // reconnects to the same shell. (The node's delete path is where a kill belongs.)
      try { ws.close(); } catch { /* already closing */ }
      term.dispose();
    };
  }, [id, cwd]);

  return (
    <div className="term-node" style={{ width: 460, height: 300 }}>
      <div className="term-node-head">{/* the drag handle — body below is nodrag */}
        <TerminalSquare size={13} />
        <span className="term-node-title">{data.node.label || "Terminal"}</span>
        <span className="term-node-host">{cwd ? cwd : "~"}</span>
      </div>
      {/* nowheel lets the terminal scroll its own scrollback instead of zooming the canvas. */}
      <div ref={bodyRef} className="term-node-body nowheel" />
      <Handle type="target" position={Position.Left} className="term-node-handle" />
      <Handle type="source" position={Position.Right} className="term-node-handle" />
    </div>
  );
}
