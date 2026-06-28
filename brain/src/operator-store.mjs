import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCHEMA_VERSION = 1;

// The statuses that close a session for good — it becomes reopenable history, never the dock's live
// thread. Everything else (ready, running, waiting_*, interrupted, blocked, failed) is a session the
// founder can still drive, so it remains eligible to be the project's active conversation. Mirrors
// resumeOperatorSession, which only refuses completed/cancelled.
const TERMINAL_OPERATOR_STATUSES = new Set(["completed", "cancelled"]);

export function isTerminalOperatorSession(session) {
  return TERMINAL_OPERATOR_STATUSES.has(session?.status);
}

function now() {
  return new Date().toISOString();
}

function root(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

function sessionsDir(options = {}) {
  return path.join(root(options), "operator-sessions");
}

function safeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
}

function sessionFile(id, options = {}) {
  return path.join(sessionsDir(options), `${safeId(id)}.json`);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function appendOperatorEvent(session, event) {
  const entry = {
    id: event.id || `event-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    createdAt: event.createdAt || now(),
    type: event.type,
    title: event.title,
    detail: event.detail ?? null,
    data: event.data ?? null,
  };
  return {
    ...session,
    events: [...(session.events ?? []), entry].slice(-500),
    updatedAt: entry.createdAt,
  };
}

export function createOperatorSession(input, options = {}) {
  const goal = String(input.goal || "").trim();
  if (!goal) throw new Error("An operator goal is required.");
  const createdAt = now();
  const id = `op-${createdAt.replace(/\D/g, "").slice(0, 14)}-${crypto.randomBytes(4).toString("hex")}`;
  let session = {
    schemaVersion: SCHEMA_VERSION,
    id,
    goal,
    graphId: input.graphId || null,
    // The program this session is driving, when the founder opened it from a program (e.g. the
    // "Build the first agent" button). Lets the program tools bind to the intended program instead
    // of guessing the newest one.
    programId: input.programId || null,
    projectId: input.projectId || null,
    workspaceId: input.workspaceId || null,
    model: input.model || process.env.GTM_IDE_OPERATOR_MODEL || "claude-sonnet-4-6",
    runtime: null,
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    completedAt: null,
    stepCount: 0,
    maxSteps: Math.max(4, Math.min(Number(input.maxSteps) || 18, 40)),
    graphRevision: Number(input.graphRevision) || 0,
    lastRunId: null,
    // The Claude Code (subscription) runtime's persisted SDK session id. Captured on the first
    // drive and resumed on every later one so the operator's conversation survives founder gates,
    // input pauses, and full process restarts — the model remembers the chat, GTM IDE owns the
    // durable state around it. Null until a Claude Code drive establishes a session.
    runtimeSessionId: null,
    summary: null,
    error: null,
    pendingQuestion: null,
    pendingGate: null,
    // A staged set of typed graph operations the operator wants to make, held for founder review on
    // the canvas (ghost nodes/edges + accept/discard) instead of applied silently. Mirrors
    // pendingGate: durable, pauses the session, resolved by the founder. "Vibe up to the gate" now
    // covers the agent editing the graph too.
    pendingProposal: null,
    events: [],
    modelMessages: [],
  };
  session = appendOperatorEvent(session, {
    type: "session_created",
    title: "Operator session created",
    detail: goal,
  });
  writeJson(sessionFile(id, options), session);
  return session;
}

export function saveOperatorSession(session, options = {}) {
  const updated = { ...session, updatedAt: now() };
  writeJson(sessionFile(updated.id, options), updated);
  return updated;
}

export function getOperatorSession(id, options = {}) {
  const file = sessionFile(id, options);
  if (!fs.existsSync(file)) throw new Error(`Operator session not found: ${id}`);
  return readJson(file);
}

export function listOperatorSessions(options = {}) {
  const dir = sessionsDir(options);
  if (!fs.existsSync(dir)) return [];
  // When a projectId is passed, scope the list to that project's sessions.
  // Legacy sessions written before project scoping have projectId === null and
  // surface only in the unscoped list.
  const projectFilter = options.projectId ?? null;
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const session = readJson(path.join(dir, name));
        if (projectFilter && (session.projectId ?? null) !== projectFilter) return [];
        return [{
          id: session.id,
          goal: session.goal,
          graphId: session.graphId,
          projectId: session.projectId ?? null,
          workspaceId: session.workspaceId,
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          summary: session.summary,
          error: session.error,
        }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// The project's current durable operator conversation — the dock's default thread. Returns the most
// recently updated NON-terminal session for the project, or null if every session is terminal or none
// exist. Project-scoped (explicit projectId), so one product's thread never bleeds into another's, and
// terminal (completed/cancelled) sessions are passed over so a finished thread is never reused live.
export function getActiveSessionForProject(projectId, options = {}) {
  const summaries = listOperatorSessions({ ...options, projectId: projectId ?? null });
  const live = summaries.find((summary) => !TERMINAL_OPERATOR_STATUSES.has(summary.status));
  if (!live) return null;
  return getOperatorSession(live.id, options);
}

// Get-or-create the project's durable operator conversation. If a non-terminal session already exists
// for this project it is returned untouched (the dock reuses the one locked conversation); otherwise a
// fresh session is created bound to the project. The projectId is authoritative and threaded
// EXPLICITLY here — never inherited from a mutable global active project.
export function getOrCreateSessionForProject(projectId, input = {}, options = {}) {
  const existing = getActiveSessionForProject(projectId, options);
  if (existing) return { session: existing, created: false };
  const session = createOperatorSession({ ...input, projectId }, options);
  return { session, created: true };
}

// Assert a session belongs to the requested project before driving it. The session's stored projectId
// is authoritative; a resume/gate/proposal/cancel that names a different project is rejected loudly
// rather than letting the composer drive another project's conversation. Returns the session on match.
export function assertOperatorSessionProject(sessionId, projectId, options = {}) {
  const session = getOperatorSession(sessionId, options);
  const owner = session.projectId ?? null;
  if (owner !== projectId) {
    throw new Error(`Operator session ${sessionId} belongs to project ${owner ?? "none"}, not ${projectId}.`);
  }
  return session;
}

export function publicOperatorSession(session) {
  const { modelMessages: _modelMessages, ...publicSession } = session;
  return publicSession;
}

export function recoverInterruptedOperatorSessions(options = {}) {
  const summaries = listOperatorSessions(options);
  return summaries.flatMap((summary) => {
    if (summary.status !== "running") return [];
    const session = getOperatorSession(summary.id, options);
    const recovered = saveOperatorSession(appendOperatorEvent({
      ...session,
      status: "interrupted",
      error: "The process stopped while this session was running. Resume it to continue.",
    }, {
      type: "session_interrupted",
      title: "Session interrupted",
      detail: "The durable session can be resumed from its last completed tool result.",
    }), options);
    return [recovered];
  });
}
