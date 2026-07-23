const crypto = require("node:crypto");

const MAX_INPUT_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_BYTES = 256 * 1024;

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
  return {
    ventureId,
    workspaceId,
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

function createTerminalRuntime({ pty, resolveWorkspace, send, platform = process.platform, env = process.env, shell = defaultShell(platform, env) }) {
  const sessionsById = new Map();
  const sessionsByWorkspace = new Map();
  const workspaceKey = (ownerId, target) => `${ownerId}:${target.ventureId}:${target.workspaceId}`;

  function emit(session, channel, payload) {
    send(session.ownerId, channel, { sessionId: session.id, ...payload });
  }

  function appendTranscript(session, data) {
    session.transcript += data;
    while (Buffer.byteLength(session.transcript, "utf8") > MAX_TRANSCRIPT_BYTES) {
      session.transcript = session.transcript.slice(Math.ceil(session.transcript.length / 4));
    }
  }

  function spawn(session, workspace, size) {
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
    processHandle.onData((data) => {
      if (session.generation !== generation) return;
      appendTranscript(session, data);
      emit(session, "terminal-data", { data });
    });
    processHandle.onExit(({ exitCode, signal }) => {
      if (session.generation !== generation) return;
      session.process = null;
      session.exit = { exitCode, signal, terminal: terminalOutcome(exitCode, signal) };
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
      return { sessionId: existing.id, snapshot: existing.transcript, exit: existing.exit };
    }
    const session = {
      id: crypto.randomUUID(), ownerId, target, process: null, generation: 0, transcript: "", exit: null,
    };
    sessionsById.set(session.id, session);
    sessionsByWorkspace.set(key, session);
    try {
      spawn(session, workspace, target);
    } catch (error) {
      sessionsById.delete(session.id);
      sessionsByWorkspace.delete(key);
      throw error;
    }
    return { sessionId: session.id, snapshot: "", exit: null };
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
    session.process?.resize(dimension(cols, 100, 500), dimension(rows, 28, 200));
  }

  async function restart(ownerId, sessionId) {
    const session = owned(ownerId, sessionId);
    const workspace = availableWorkspace(session.target, await resolveWorkspace(session.target.ventureId, session.target.workspaceId));
    session.generation += 1;
    try { session.process?.kill(); } catch { /* already exited */ }
    session.process = null;
    session.exit = null;
    session.transcript = "";
    spawn(session, workspace, session.target);
  }

  function close(ownerId, sessionId) {
    const session = owned(ownerId, sessionId);
    session.generation += 1;
    try { session.process?.kill(); } catch { /* already exited */ }
    sessionsById.delete(session.id);
    sessionsByWorkspace.delete(workspaceKey(ownerId, session.target));
  }

  function stopOwner(ownerId) {
    for (const session of [...sessionsById.values()]) {
      if (session.ownerId === ownerId) close(ownerId, session.id);
    }
  }

  function stopAll() {
    for (const session of [...sessionsById.values()]) close(session.ownerId, session.id);
  }

  return { open, write, resize, restart, close, stopOwner, stopAll };
}

module.exports = { createTerminalRuntime, defaultShell, terminalOutcome, validateTarget };
