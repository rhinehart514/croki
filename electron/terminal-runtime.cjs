const crypto = require("node:crypto");

const MAX_INPUT_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_BYTES = 256 * 1024;
const DEFAULT_TERMINAL_ID = "main";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function dimension(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(2, Math.floor(parsed))) : fallback;
}

function defaultShell(platform = process.platform, env = process.env) {
  if (platform === "win32") return { file: env.COMSPEC || "cmd.exe", args: [] };
  return { file: env.SHELL || "/bin/zsh", args: ["-l"] };
}

function terminalOutcome(exitCode, signal) {
  if (Number.isInteger(signal) && signal > 0) return "cancelled";
  return exitCode === 0 ? "completed" : "failed";
}

function validateTarget(target) {
  const ventureId = text(target?.ventureId);
  const workspaceId = text(target?.workspaceId);
  if (!ventureId || !workspaceId) throw new Error("Terminal requires a venture and coding workspace.");
  const terminalId = text(target?.terminalId) || DEFAULT_TERMINAL_ID;
  if (!/^[a-zA-Z0-9_.:-]{1,96}$/.test(terminalId)) throw new Error("Terminal identity is invalid.");
  return {
    ventureId,
    workspaceId,
    terminalId,
    name: text(target?.name).slice(0, 48) || "Terminal",
    cols: dimension(target?.cols, 100, 500),
    rows: dimension(target?.rows, 28, 200),
  };
}

function availableWorkspace(target, resolved) {
  const workspace = resolved?.workspace ?? resolved;
  if (!workspace || workspace.id !== target.workspaceId || workspace.ventureId !== target.ventureId) {
    throw new Error("Croki could not verify this coding workspace.");
  }
  if (!text(workspace.worktree) || workspace.status === "discarded") {
    throw new Error("This coding workspace no longer has an isolated worktree.");
  }
  return workspace;
}

function createTerminalRuntime({ pty, resolveWorkspace, send, stateStore = null, platform = process.platform, env = process.env, shell = defaultShell(platform, env) }) {
  const sessionsById = new Map();
  const sessionsByWorkspace = new Map();
  const workspaceKey = (ownerId, target) => `${ownerId}:${target.ventureId}:${target.workspaceId}:${target.terminalId}`;

  function emit(session, channel, payload) {
    send(session.ownerId, channel, { sessionId: session.id, ...payload });
  }

  function persist(session) {
    stateStore?.save?.(session.target, {
      transcript: session.transcript,
      exit: session.exit,
      lastExit: session.lastExit ?? null,
      running: Boolean(session.process),
      name: session.target.name,
      cols: session.target.cols,
      rows: session.target.rows,
    });
  }

  function appendTranscript(session, data) {
    session.transcript += data;
    while (Buffer.byteLength(session.transcript, "utf8") > MAX_TRANSCRIPT_BYTES) {
      session.transcript = session.transcript.slice(Math.ceil(session.transcript.length / 4));
    }
    persist(session);
  }

  function spawn(session, workspace, size) {
    session.target = { ...session.target, cols: size.cols, rows: size.rows };
    session.generation += 1;
    const generation = session.generation;
    const processHandle = pty.spawn(shell.file, shell.args, {
      name: "xterm-256color",
      cwd: workspace.worktree,
      cols: size.cols,
      rows: size.rows,
      env: { ...env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    });
    session.process = processHandle;
    persist(session);
    processHandle.onData((data) => {
      if (session.generation !== generation) return;
      appendTranscript(session, data);
      emit(session, "terminal-data", { data });
    });
    processHandle.onExit(({ exitCode, signal }) => {
      if (session.generation !== generation) return;
      session.process = null;
      session.exit = { exitCode, signal, terminal: terminalOutcome(exitCode, signal) };
      persist(session);
      emit(session, "terminal-exit", session.exit);
    });
  }

  async function open(ownerId, rawTarget) {
    const target = validateTarget(rawTarget);
    const workspace = availableWorkspace(target, await resolveWorkspace(target.ventureId, target.workspaceId));
    const key = workspaceKey(ownerId, target);
    const existing = sessionsByWorkspace.get(key);
    if (existing) {
      if (existing.process) existing.process.resize(target.cols, target.rows);
      existing.target = { ...existing.target, cols: target.cols, rows: target.rows, name: target.name };
      persist(existing);
      return {
        sessionId: existing.id,
        terminalId: target.terminalId,
        name: target.name,
        snapshot: existing.transcript,
        exit: existing.exit,
        lastExit: existing.lastExit ?? null,
      };
    }
    const saved = stateStore?.load?.(target);
    const session = {
      id: crypto.randomUUID(),
      ownerId,
      target: {
        ...target,
        cols: dimension(saved?.cols, target.cols, 500),
        rows: dimension(saved?.rows, target.rows, 200),
      },
      process: null,
      generation: 0,
      transcript: typeof saved?.transcript === "string" ? saved.transcript : "",
      exit: saved?.exit ?? null,
      lastExit: saved?.lastExit ?? null,
    };
    sessionsById.set(session.id, session);
    sessionsByWorkspace.set(key, session);
    try {
      if (!session.exit) {
        if (saved?.running) appendTranscript(session, "\r\n\u001b[2m— Croki restarted; previous PTY ended —\u001b[0m\r\n");
        spawn(session, workspace, session.target);
      }
    } catch (error) {
      sessionsById.delete(session.id);
      sessionsByWorkspace.delete(key);
      throw error;
    }
    persist(session);
    return {
      sessionId: session.id,
      terminalId: target.terminalId,
      name: target.name,
      snapshot: session.transcript,
      exit: session.exit,
      lastExit: session.lastExit,
    };
  }

  function owned(ownerId, sessionId) {
    const session = sessionsById.get(text(sessionId));
    if (!session || session.ownerId !== ownerId) throw new Error("No such terminal session in this window.");
    return session;
  }

  function write(ownerId, sessionId, data) {
    const session = owned(ownerId, sessionId);
    if (!session.process) throw new Error("This terminal has exited. Restart it to continue.");
    if (typeof data !== "string" || Buffer.byteLength(data, "utf8") > MAX_INPUT_BYTES) {
      throw new Error("Terminal input is invalid or too large.");
    }
    session.process.write(data);
  }

  function resize(ownerId, sessionId, cols, rows) {
    const session = owned(ownerId, sessionId);
    const size = { cols: dimension(cols, 100, 500), rows: dimension(rows, 28, 200) };
    session.target = { ...session.target, ...size };
    session.process?.resize(size.cols, size.rows);
    persist(session);
  }

  async function restart(ownerId, sessionId) {
    const session = owned(ownerId, sessionId);
    const workspace = availableWorkspace(session.target, await resolveWorkspace(session.target.ventureId, session.target.workspaceId));
    session.generation += 1;
    try { session.process?.kill(); } catch { /* already exited */ }
    session.process = null;
    if (session.exit) session.lastExit = session.exit;
    session.exit = null;
    appendTranscript(session, "\r\n\u001b[2m— terminal restarted —\u001b[0m\r\n");
    spawn(session, workspace, session.target);
  }

  function dispose(session, forget) {
    session.generation += 1;
    persist(session);
    try { session.process?.kill(); } catch { /* already exited */ }
    sessionsById.delete(session.id);
    sessionsByWorkspace.delete(workspaceKey(session.ownerId, session.target));
    if (forget) stateStore?.remove?.(session.target);
  }

  function close(ownerId, sessionId) {
    const session = owned(ownerId, sessionId);
    dispose(session, true);
  }

  function stopOwner(ownerId) {
    for (const session of [...sessionsById.values()]) {
      if (session.ownerId === ownerId) dispose(session, false);
    }
  }

  function stopAll() {
    for (const session of [...sessionsById.values()]) dispose(session, false);
    stateStore?.flush?.();
  }

  function inspect(ownerId, ventureId, workspaceId) {
    return [...sessionsById.values()]
      .filter((session) => session.ownerId === ownerId && session.target.ventureId === text(ventureId) && session.target.workspaceId === text(workspaceId))
      .map((session) => ({
        sessionId: session.id,
        terminalId: session.target.terminalId,
        name: session.target.name,
        running: Boolean(session.process),
        exit: session.exit,
        lastExit: session.lastExit ?? null,
        transcriptBytes: Buffer.byteLength(session.transcript, "utf8"),
      }));
  }

  return { open, write, resize, restart, close, inspect, stopOwner, stopAll };
}

module.exports = { MAX_TRANSCRIPT_BYTES, createTerminalRuntime, defaultShell, terminalOutcome, validateTarget };
