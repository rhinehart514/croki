// The operator orchestrator. It owns the in-flight session registry and every durable/safety decision —
// launch, resume, the ambient wake, the drive loop, and the founder-decision resolvers (gate, proposal,
// ideas, candidates, cancel). The tool schemas, the run mechanics, the prompt, and the tool dispatcher
// were split into sibling modules (W8, behavior-preserving); this file composes them and re-exports the
// symbols other modules and tests import (operatorTools, executeOperatorTool, and the resolvers).
import { liveStepRuntime, createGateTranslator } from "./agent-bridge.mjs";
import { draftKey, itemReviewText } from "./memory.mjs";
import { recordFlowRun, saveFlow } from "./flow-store.mjs";
import { buildRunGrounding } from "./run-grounding.mjs";
import { createDerivedSourceLoader } from "./cross-reference.mjs";
import { recordRunDerivations } from "./run-derivation.mjs";
import { buildMarketContext } from "./market-research.mjs";
import { marketObjectStore } from "./gtm-store.mjs";
import { settleProductChangeProposal } from "./outcome-ingest.mjs";
import { applyGraphOperations } from "./graph-operations.mjs";
import { hasApproveIntent, runGraph } from "./graph.mjs";
import { defaultSendRunners } from "./connectors/execute/gmail-transport.mjs";
import { defaultDeployRunners } from "./connectors/execute/deploy-transport.mjs";
import {
  armNextWake,
  getOperatorSession,
  getOperatorSessionFresh,
  listOperatorSessions,
  saveOperatorSession,
} from "./operator-store.mjs";
import { loadProject, updateSharedContext } from "./project-store.mjs";
import { getGtmIdea, saveGtmIdea } from "./idea-store.mjs";
import { recordFounderDecision, recordIdeaDecisions } from "./feedback-ledger.mjs";
import { authModeLabel, selectRuntime } from "./runtimes/index.mjs";
import { filterSafeTools } from "./tool-safety.mjs";
import { NAKED_TOOLS } from "./operator-tools.mjs";
import {
  addEvent,
  authorizeGateRelease,
  designStateFor,
  firstNonEmpty,
  flowFor,
  latestWorkspace,
  memoryFor,
  recallTaste,
  summarizeRun,
} from "./operator-run-core.mjs";
import { recallPriorSessions, systemPrompt } from "./operator-prompt.mjs";
import { executeTool } from "./operator-tool-exec.mjs";
import { safeLogFailure, makeFailureSink } from "./failure-log.mjs";
import { resolveGitShaAsync } from "./friction.mjs";
import { persistence } from "./persistence.mjs";

const OPERATOR_HALT_STATUSES = new Set([
  "waiting_for_gate",
  "waiting_for_proposal",
  "waiting_for_input",
  "waiting_for_ideas",
  "waiting_for_candidates",
  "completed",
  "cancelled",
  "blocked",
]);

const activeSessions = new Map();

// The latest "what changed" instruction to feed a resumed conversation. The resume entry points
// (founder response, gate resolved, proposal accepted/discarded) each append a plain-string user
// message to modelMessages describing the change; the Claude Code runtime sends that as the prompt
// when it resumes its persisted SDK session. Null on a fresh session, where the goal is the prompt.
function latestResumeInstruction(session) {
  const messages = session.modelMessages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && typeof message.content === "string" && message.content.trim()) {
      return message.content;
    }
  }
  return null;
}

export async function runOperatorSession(id, runtime = {}) {
  const options = runtime.options ?? {};
  let session = getOperatorSession(id, options);
  if (OPERATOR_HALT_STATUSES.has(session.status)) {
    return session;
  }
  if (session.stepCount >= session.maxSteps) {
    return saveOperatorSession({
      ...session,
      status: "waiting_for_input",
      pendingQuestion: {
        question: "The operator reached its current iteration budget. Continue for another pass?",
        reason: "The session remains durable, but it needs permission to spend another model/tool cycle budget.",
      },
    }, options);
  }

  // Pick the runtime that will reason this session. GTM IDE keeps owning every
  // durable and safety decision below; the runtime only produces turns and asks
  // GTM IDE (via ctx callbacks) to execute the tool calls it proposes.
  const selection = selectRuntime({
    client: runtime.client,
    runtime: runtime.runtime,
    forced: runtime.forced || session.runtime,
    model: session.model,
  });
  if (!selection.adapter) {
    return addEvent({
      ...session,
      status: "failed",
      error: `No operator runtime is available. ${selection.reason} Sign in to Codex or Claude Code, or set ANTHROPIC_API_KEY, then resume this durable session.`,
    }, {
      type: "session_failed",
      title: "No operator runtime connected",
      detail: selection.reason || "No operator runtime is available.",
    }, options);
  }
  const adapter = selection.adapter;
  const workspace = latestWorkspace(session, options);
  const authLabel = authModeLabel(selection.auth);
  const activePersistence = persistence(options);
  const persistenceBackend = activePersistence.localBackendName || activePersistence.name;

  session = addEvent({
    ...session,
    status: "running",
    runtime: adapter.id,
    startedAt: session.startedAt || new Date().toISOString(),
    error: null,
    pendingQuestion: null,
  }, {
    type: "operator_started",
    title: session.stepCount ? "Operator resumed" : "Operator started",
    detail: `Running ${session.model} via ${adapter.label}${authLabel ? ` on the ${authLabel}` : ""}.`,
  }, options);

  // Codex runs the MCP bridge in a separate process. A tool call can therefore persist a founder wall
  // while the host still holds an older in-memory copy. Refresh before every callback write so narration,
  // turn counts, and the final model message can never erase a pending gate, proposal, idea, or candidate.
  const refreshSession = () => {
    session = getOperatorSessionFresh(id, options);
    return session;
  };

  // The context handed to the runtime. Every callback persists through GTM IDE's
  // own stores, so the runtime never touches session state, the ledger, gates,
  // or cancellation directly — that boundary is what the provider-neutral split
  // is for.
  const ctx = {
    sessionId: id,
    // The objective the runtime drives toward. A goal session uses its goal; an ambient session uses
    // its standing brief (the same value the system prompt frames above). The runtime hands this to the
    // model as the opening prompt on a fresh drive — so a goal-less ambient session still has a real
    // objective to act on without relaxing anything past the gate.
    goal: firstNonEmpty(session.goal, session.standingBrief),
    model: session.model,
    system: systemPrompt(session, workspace, recallPriorSessions(session, options), recallTaste(session, options)),
    // The model is handed ONLY the naked toolset (truth + compose_and_run + repair loop + gate + chat).
    // executeOperatorTool below still routes every tool name for direct API/MCP callers and tests.
    // filterSafeTools re-asserts the outbound/approval guard over the list the model actually sees, so
    // the direct-Anthropic runtime path gets the SAME refusal the MCP bridge already applies — a future
    // tool named like send/approve/deploy can never reach the model on either door.
    tools: filterSafeTools(NAKED_TOOLS),
    client: selection.client ?? null,
    query: runtime.query ?? null,
    options,
    // The MCP bridge may run under a Node binary with a different native SQLite ABI than the host.
    // Pin both processes to the concrete local format the host actually opened.
    persistenceBackend,
    env: process.env,
    initialMessages: session.modelMessages?.length ? session.modelMessages : null,
    // Conversation continuity for the Claude Code (subscription) runtime. The runtime resumes the
    // SDK session id we stored on the prior drive and replays only the latest "what changed"
    // instruction (founder response, gate resolved, proposal decided) as the new prompt — so the
    // subprocess remembers the chat instead of restarting cold after every founder pause.
    runtimeSessionId: session.runtimeSessionId ?? null,
    resumePrompt: latestResumeInstruction(session),
    onRuntimeSession: (sid) => {
      const current = refreshSession();
      if (sid && sid !== current.runtimeSessionId) {
        session = saveOperatorSession({ ...current, runtimeSessionId: sid }, options);
      }
    },
    // Cumulative dollars this session has already spent across all prior drives — the runtime uses it
    // to make each drive's budget session-total-aware (Wave 6). Persisted, so it survives every founder
    // pause and process restart. onCost banks each finished drive's cost onto that running total.
    spentUsd: Number(session.spentUsd) || 0,
    onCost: (usd) => {
      const add = Number(usd) || 0;
      if (add > 0) {
        const current = refreshSession();
        session = saveOperatorSession({ ...current, spentUsd: (Number(current.spentUsd) || 0) + add }, options);
      }
    },
    maxSteps: session.maxSteps,
    stepCount: session.stepCount,
    isCancelled: () => getOperatorSessionFresh(id, options).status === "cancelled",
    currentStatus: () => getOperatorSessionFresh(id, options).status,
    onTurn: () => {
      const current = refreshSession();
      session = saveOperatorSession({ ...current, stepCount: current.stepCount + 1 }, options);
      return session.stepCount;
    },
    onText: (text) => {
      session = addEvent(refreshSession(), { type: "operator_note", title: "Operator reasoning", detail: text }, options);
    },
    onToolStart: (name) => {
      session = addEvent(refreshSession(), {
        type: "tool_started",
        title: `Using ${name.replaceAll("_", " ")}`,
        detail: null,
        data: { tool: name },
      }, options);
    },
    onToolError: (name, message) => {
      session = addEvent(refreshSession(), {
        type: "tool_failed",
        title: `${name.replaceAll("_", " ")} failed`,
        detail: message,
        data: { tool: name },
      }, options);
    },
    runTool: async ({ id: toolId, name, input }) => {
      const execution = await executeTool(refreshSession(), { id: toolId, name, input }, options);
      session = execution.session;
      return { result: execution.result, pause: execution.pause };
    },
    persistMessages: (messages) => {
      session = saveOperatorSession({ ...refreshSession(), modelMessages: messages }, options);
    },
  };

  try {
    const outcome = await adapter.drive(ctx);
    if (outcome.kind === "cancelled") return getOperatorSessionFresh(id, options);
    if (outcome.kind === "completed") {
      const current = getOperatorSessionFresh(id, options);
      if (OPERATOR_HALT_STATUSES.has(current.status)) return current;
      return addEvent({
        ...current,
        status: "completed",
        summary: outcome.summary,
        completedAt: new Date().toISOString(),
      }, {
        type: "session_completed",
        title: "Operator finished",
        detail: outcome.summary || "No additional action was requested.",
      }, options);
    }
    if (outcome.kind === "budget") {
      return addEvent({
        ...getOperatorSession(id, options),
        status: "waiting_for_input",
        pendingQuestion: {
          question: "The operator reached its iteration budget. Continue working this goal?",
          reason: "The session is preserved and can resume with a fresh budget.",
        },
      }, {
        type: "founder_input_requested",
        title: "Iteration budget reached",
        detail: "The session is safely paused rather than guessing indefinitely.",
      }, options);
    }
    // "paused" — executeTool already set waiting_for_gate / waiting_for_input or
    // completed (via the complete tool) and persisted it. Return the truth on disk.
    return getOperatorSessionFresh(id, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Self-observation: an uncaught crash in the drive loop is filed into the dogfood queue so the team
    // sees what to fix. Best-effort and never-throws — the session's failed status below is unchanged
    // whether logging succeeds or not. Git sha resolved off-thread (non-blocking) so the crash handler
    // never spawns a synchronous git; a test that pins options.gitSha keeps that value.
    let crashGitSha;
    if ("gitSha" in options) {
      crashGitSha = options.gitSha;
    } else {
      try { crashGitSha = await resolveGitShaAsync(); } catch { crashGitSha = null; }
    }
    safeLogFailure(
      { category: "run-crash", error, session: getOperatorSession(id, options) },
      crashGitSha !== undefined ? { ...options, gitSha: crashGitSha } : options,
    );
    return addEvent({
      ...getOperatorSession(id, options),
      status: "failed",
      error: message,
    }, {
      type: "session_failed",
      title: "Operator stopped",
      detail: message,
    }, options);
  }
}

// A driving session that goes SILENT for longer than this has almost certainly hung inside the
// runtime's model turn — the SDK drive can stall without ever resolving or throwing, which used to
// leave the session "running" forever behind an infinite spinner (a real 40-minute hang was observed
// after a run completed with a blocked gate). The signal is silence, not duration: a legitimately long
// step still emits node/turn events as it progresses, so only true silence trips this. The window is
// generous so a single slow research node (which can run several minutes) is never mistaken for a hang.
const OPERATOR_STALL_MS = 12 * 60 * 1000;
const OPERATOR_WATCHDOG_INTERVAL_MS = 60 * 1000;

// Pure, testable: is a session hung? Only a session actively DRIVING can stall — a waiting_for_* pause
// is a legitimate wait on the founder and may sit for hours. `updatedAt` is stamped on every event and
// save, so it is the last-progress clock.
export function operatorSessionStalled(session, nowMs, thresholdMs = OPERATOR_STALL_MS) {
  if (!session || session.status !== "running") return false;
  const last = Date.parse(session.updatedAt || session.startedAt || session.createdAt || "");
  if (!Number.isFinite(last)) return false;
  return nowMs - last > thresholdMs;
}

export function launchOperatorSession(id, runtime = {}) {
  if (activeSessions.has(id)) return activeSessions.get(id);
  const options = runtime.options ?? {};
  // Watchdog: end a stalled drive honestly so the founder is never stuck behind an infinite spinner.
  // It never aborts a legitimately long turn — it acts only on silence past the stall window.
  const watchdog = setInterval(() => {
    try {
      const current = getOperatorSession(id, options);
      if (operatorSessionStalled(current, Date.now())) {
        clearInterval(watchdog);
        // End the stalled session honestly FIRST so the founder is never left waiting — the observation log
        // is best-effort and must never delay this.
        addEvent({
          ...current,
          status: "failed",
          error: "This run stalled — it stopped making progress for several minutes and was ended so you are not left waiting. Nothing was sent. You can retry the goal.",
        }, {
          type: "session_failed",
          title: "Operator stalled",
          detail: "No progress for several minutes; ended so you are not stuck waiting.",
        }, options);
        activeSessions.delete(id);
        // Self-observation: a stalled drive the watchdog kills is filed into the dogfood queue. The git sha
        // resolves off-thread (non-blocking) so the watchdog never spawns a synchronous git; safeLogFailure
        // never-throws, so a logging failure can never affect the failed status set above. A test that pins
        // options.gitSha keeps that value.
        const logStall = (gitSha) => safeLogFailure(
          { category: "run-stall", session: current, error: "The run stalled and was ended by the watchdog." },
          gitSha !== undefined ? { ...options, gitSha } : options,
        );
        if ("gitSha" in options) {
          logStall(options.gitSha);
        } else {
          resolveGitShaAsync().then(logStall).catch(() => logStall(null));
        }
      }
    } catch {
      // Session gone or a transient store read — the finally cleanup below is the backstop.
    }
  }, OPERATOR_WATCHDOG_INTERVAL_MS);
  if (typeof watchdog.unref === "function") watchdog.unref();
  const work = runOperatorSession(id, runtime).finally(() => {
    clearInterval(watchdog);
    activeSessions.delete(id);
  });
  activeSessions.set(id, work);
  return work;
}

// Optional, ADVISORY steering a founder message can carry: which specific teammates and capabilities
// they @-mentioned in the composer. It is folded into the model's channel as a strong steer toward
// composing with the named crew — never a contract and never a gate: an unrecognized or ill-fitting
// name is chosen against, not enforced, so a run is never blocked on a hint (the no-cage invariant).
// Shape is open — { teammates?: string[], capabilities?: string[] } — and read defensively; anything
// that is not a non-empty string list is ignored rather than throwing.
function formatOperatorHints(hints) {
  if (!hints || typeof hints !== "object") return "";
  const clean = (list) => (Array.isArray(list) ? list.map((v) => String(v ?? "").trim()).filter(Boolean) : []);
  const teammates = clean(hints.teammates);
  const capabilities = clean(hints.capabilities);
  if (!teammates.length && !capabilities.length) return "";
  const parts = [];
  if (teammates.length) parts.push(`teammates ${teammates.join(", ")}`);
  if (capabilities.length) parts.push(`capabilities ${capabilities.join(", ")}`);
  return `\n\nThe founder named specific parts of the crew for this — ${parts.join("; ")}. Prefer composing with these where they genuinely fit the goal (pass named teammates as agents to compose_and_run, and lean on the named capabilities); treat it as a strong steer, not a hard requirement — if one does not fit, choose better and say why. Never block the work on them.`;
}

// `runtime.hints` (optional) carries the founder's @-mentions from the composer — advisory context only.
export function resumeOperatorSession(id, input, runtime = {}) {
  const options = runtime.options ?? {};
  let session = getOperatorSession(id, options);
  if (session.status === "waiting_for_gate") {
    throw new Error("Resolve the founder gate before resuming the operator.");
  }
  if (session.status === "waiting_for_proposal") {
    throw new Error("Accept or discard the proposed graph changes before resuming the operator.");
  }
  if (session.status === "waiting_for_ideas") {
    throw new Error("Pick or kill the proposed ideas before resuming the operator.");
  }
  if (session.status === "waiting_for_candidates") {
    throw new Error("Pick one of the proposed candidate pipelines before resuming the operator.");
  }
  if (["completed", "cancelled"].includes(session.status)) throw new Error(`Session is already ${session.status}.`);
  const text = String(input || "").trim();
  if (!text) throw new Error("A founder response is required.");
  // The @-mention steer rides on the SAME user message as the founder's words, so the resumed drive
  // reads both as one prompt (latestResumeInstruction returns the last user string). Empty/omitted
  // hints add nothing — the resume is byte-identical to a plain founder response.
  const hintsSuffix = formatOperatorHints(runtime.hints);
  session = addEvent({
    ...session,
    status: "ready",
    error: null,
    pendingQuestion: null,
    maxSteps: Math.min(60, Math.max(session.maxSteps, session.stepCount + 12)),
    modelMessages: [
      ...(session.modelMessages ?? []),
      { role: "user", content: `Founder response: ${text}${hintsSuffix}` },
    ],
  }, {
    type: "founder_input_received",
    title: "Founder responded",
    detail: text,
  }, options);
  launchOperatorSession(session.id, runtime);
  return session;
}

// The founder decisions an ambient wake must NEVER bypass. A session paused at a gate, a graph
// proposal, or an ideas pick is holding an explicit founder decision; waking it again would jump that
// wall. The wake refuses until the founder resolves it. (Cancelled/completed are refused separately.)
const AMBIENT_WAKE_BLOCKING_STATUSES = new Set([
  "waiting_for_gate",
  "waiting_for_proposal",
  "waiting_for_ideas",
  "waiting_for_candidates",
]);

// The AMBIENT wake — the event-triggered / standing-brief twin of resumeOperatorSession. An
// input-router decision ({ route: "ambient_wake", brief }) or a due standing-brief tick lands here and
// drives the operator EXACTLY like a goal drive: the same NAKED_TOOLS, the same compose_and_run, the
// same founder gate. The ONLY difference is the objective — a standing brief replaces the one-off goal,
// so a kind:'ambient' session needs no goal. THE WALL IS UNTOUCHED: an ambient wake never sends,
// deploys, or auto-approves. It reaches the founder gate and STOPS, because it launches the same
// runOperatorSession (which pauses at waiting_for_gate) and the model is handed no approve/send/deploy
// tool. Cancellation and the gate both hold: a cancelled/terminal session is never re-woken, and a
// session already paused at a founder decision is not bypassed — that decision must be resolved first.
export function wakeAmbientSession(id, input = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  if (session.kind !== "ambient") {
    throw new Error(`Operator session ${id} is not an ambient session; drive a goal session through its normal path.`);
  }
  if (["completed", "cancelled"].includes(session.status)) {
    throw new Error(`Ambient session is already ${session.status}.`);
  }
  if (AMBIENT_WAKE_BLOCKING_STATUSES.has(session.status)) {
    throw new Error(`Ambient session ${id} is paused at ${session.status}; resolve the founder decision before another wake.`);
  }
  if (activeSessions.has(id)) return session; // a drive is already in flight — don't double-fire
  const brief = firstNonEmpty(input.brief, session.standingBrief, session.goal);
  if (!brief) throw new Error("An ambient wake needs a standing brief (on the session or the routing decision).");
  const trigger = firstNonEmpty(input.trigger, input.route, "ambient_wake");
  const changed = typeof input.detail === "string" && input.detail.trim() ? ` What changed: ${input.detail.trim()}.` : "";
  const woken = addEvent({
    ...session,
    status: "ready",
    error: null,
    pendingQuestion: null,
    // The brief that actually drove this wake stays on the session (under the durable field name the
    // store persists), so a resumed conversation and the system prompt read the same objective. Ambient
    // sessions are brief-driven, never goal-driven.
    standingBrief: brief,
    // Consume the due schedule and re-arm the NEXT one through the store's armNextWake, which owns the
    // cadence: a recurring brief (wakeIntervalMs set) re-arms one cadence out so it keeps standing, an
    // event-only brief re-arms to null and is woken only by the input router. This is the re-arm the
    // standing-brief tick depends on — without it a fired brief would go silent.
    nextWakeAt: armNextWake(session),
    maxSteps: Math.min(60, Math.max(session.maxSteps, session.stepCount + 12)),
    modelMessages: [
      ...(session.modelMessages ?? []),
      {
        role: "user",
        content: `Ambient wake (${trigger}). Standing brief: ${brief}.${changed} Compose and run the work this brief calls for and drive it to the founder gate. Stop at the gate — never send, deploy, or approve; the founder releases at the gate.`,
      },
    ],
  }, {
    type: "ambient_wake",
    title: "Ambient wake",
    detail: brief,
    data: { trigger },
  }, options);
  launchOperatorSession(woken.id, runtime);
  return woken;
}

// Is this ambient session DUE for a standing-brief wake right now? Due = an ambient session that is
// idle (not running, not terminal, not paused at a founder decision) with a brief and a nextWakeAt that
// has arrived. The founder gate is respected: a session waiting at a gate is NEVER auto-woken.
function isAmbientDue(session, nowMs) {
  if (!session || session.kind !== "ambient") return false;
  if (["running", "completed", "cancelled"].includes(session.status)) return false;
  if (AMBIENT_WAKE_BLOCKING_STATUSES.has(session.status)) return false;
  if (!firstNonEmpty(session.standingBrief, session.goal)) return false;
  if (!session.nextWakeAt) return false;
  const due = new Date(session.nextWakeAt).getTime();
  return Number.isFinite(due) && due <= nowMs;
}

// The background tick the HOST schedules (a server interval) — NOT a timer spun in module scope. It
// wakes every ambient session whose standing brief is due, driving each to the founder gate through
// wakeAmbientSession. It only DRIVES; it never sends, and an in-flight or gate-paused session is left
// untouched. Returns the ids it woke so the caller can log/observe. A session that races into a gate or
// a cancellation between the due check and the launch is skipped, never thrown.
export function runDueAmbientTicks(runtime = {}) {
  const options = runtime.options ?? {};
  const nowMs = Date.now();
  const woken = [];
  for (const summary of listOperatorSessions(options)) {
    if (activeSessions.has(summary.id)) continue;
    let session;
    try {
      session = getOperatorSession(summary.id, options);
    } catch {
      continue;
    }
    if (!isAmbientDue(session, nowMs)) continue;
    try {
      wakeAmbientSession(summary.id, { trigger: "standing_brief_tick" }, runtime);
      woken.push(summary.id);
    } catch {
      // Raced into a gate/cancellation since the due check — skip it, never break the tick.
    }
  }
  return woken;
}

export async function resolveOperatorGate(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  let session = getOperatorSession(id, options);
  if (session.status !== "waiting_for_gate" || !session.pendingGate?.runResult) {
    throw new Error("This operator session is not waiting at a founder gate.");
  }
  // Role-gated release: resolving a founder gate IS the act of releasing a send, so only an authorized
  // team member (owner/approver) may do it. Throws gate_release_forbidden (403) for a viewer/member.
  // The wall in the gate connector is unchanged; this only guards who may stand at it.
  const { actor: releasedBy } = authorizeGateRelease(session, payload, options);
  // Browser-only release (W2b): the operator gate is the live send path, so an APPROVAL here is held to
  // the same bar as the raw graph-run path (server.authorizeReleaseForRequest) — it must come from the
  // Drover page, refused for an agent-stamped or token-less request. The host injects this request-scoped
  // guard; internal/non-HTTP callers (and the direct unit tests) supply none and are unaffected, so this
  // only tightens the HTTP door. It fires ONLY on an approve intent (a pure reject/skip releases nothing
  // and stays open) and BEFORE the atomic claim below, so a refused approval never strands the session
  // mid-claim — mirroring why authorizeGateRelease runs before the claim.
  const authorizeReleaseForRequest = runtime.authorizeReleaseForRequest;
  if (typeof authorizeReleaseForRequest === "function" && hasApproveIntent(payload.approvals, payload.decisions)) {
    authorizeReleaseForRequest();
  }
  // ATOMICALLY CLAIM the transition before any async work. Two concurrent resolves both read
  // status === "waiting_for_gate" above, but that check and this save are SYNCHRONOUS with no await
  // between them, so under Node's single-threaded loop only the first call reaches here; it flips the
  // status off "waiting_for_gate" (persisted immediately) and the second call re-reads the claimed
  // status and is rejected by the guard above — the gated action (runGraph release) fires exactly once.
  // authorizeGateRelease runs BEFORE the claim so a forbidden actor never strands the session mid-claim.
  session = saveOperatorSession({ ...session, status: "resolving_gate" }, options);
  const flow = flowFor(session, options);
  // Same cwd + grounding threading as executeGraphRun: the gate-resume run re-drafts descendants, so it
  // must read the founder's OWN repo (runCwd) and ground on the real scan report — never Drover's source
  // or a hardcoded BLIND grounding.
  const runCwd = options.cwd || flow.project?.sharedContext?.repository?.repo || process.cwd();
  const runWorkspace = latestWorkspace(session, options);
  // The SECOND founder authorization for a microproduct deploy (GUARD 2), built host-side from the
  // SAME authorized release this gate just cleared. A deploy is heavier than a send, so a normal gate
  // approval does NOT ship a microproduct — the founder must explicitly confirm the deploy AT the gate
  // (payload.deployConfirmed === true), mirroring revision.mjs's applyRevision(confirmation === true).
  // It is stamped with the authorized releaser's identity and threaded onto node.runtime by runGraph,
  // which composition cannot write — so neither a composed graph nor a model-driven run can forge it.
  const deployAuthorization = payload.deployConfirmed === true
    ? { confirmed: true, releasedBy: releasedBy.userId ?? null, userId: releasedBy.userId ?? null, name: releasedBy.name ?? null }
    : null;
  // Self-observation on the gate-RESUME run — the most consequential leg, where approved items flow into
  // execute/send/deploy connectors and re-drafted descendants run again. Without this the gate-resume run
  // silently dropped every node-error and bad-output failure (it fell back to runGraph's no-op onFailure).
  // The SAME shared sink the first run leg uses, so both log identically. Git sha resolved off the hot path.
  let gateFailureGitSha;
  if ("gitSha" in options) {
    gateFailureGitSha = options.gitSha;
  } else {
    try { gateFailureGitSha = await resolveGitShaAsync(); } catch { gateFailureGitSha = null; }
  }
  const onFailure = makeFailureSink({
    graphId: flow.graph?.id ?? null,
    graphLabel: session.goal ?? null,
    session,
    gitSha: gateFailureGitSha,
    options,
  });
  const result = await runGraph(flow.graph, {
    approvals: payload.approvals && typeof payload.approvals === "object" ? payload.approvals : {},
    onFailure,
    decisions: payload.decisions && typeof payload.decisions === "object" ? payload.decisions : {},
    memory: memoryFor(flow.runs, options, session.projectId),
    designState: designStateFor(session, options),
    // Same researched buyer picture on the gate-resume run, so re-drafted descendants stay grounded.
    market: buildMarketContext(marketObjectStore.list({ ...options, projectId: session.projectId || "default" })),
    // Same product grounding + run history on the gate-resume run, so re-drafted descendants stay grounded.
    // The real scan report carries cited win event/attribution/gaps (BLIND only when no workspace is open).
    grounding: buildRunGrounding(flow.project, runWorkspace?.report ?? null),
    runs: flow.runs,
    resumeResult: session.pendingGate.runResult,
    deployAuthorization,
    stepRuntime: options.stepRuntime || liveStepRuntime({ cwd: runCwd }),
    // Live plain-language gate translator for any items re-staged on this resume. Auto-created only for a
    // real run: OFF when the caller passed options.gateTranslator, injected a fake stepRuntime, or scoped
    // the run to an isolated store root (options.root — every unit test does this; production never does),
    // so a unit resume never spawns a translation call. The gate connector still wraps it in a timeout +
    // raw-subject fallback.
    gateTranslator: "gateTranslator" in options
      ? options.gateTranslator
      : ((options.stepRuntime || options.root) ? null : createGateTranslator({ cwd: runCwd })),
    loadLastRunItems: createDerivedSourceLoader({ ...options, projectId: session.projectId || "default" }),
    // BYO credentials: a founder-pasted key for this project wins over env; options carries the
    // persistence root so the stored key resolves from the same store the founder saved it in.
    projectId: session.projectId || "default",
    credentialOptions: options,
    // The live delivery seam: this gate-resume run is the ONE path where founder-approved items reach an
    // execute connector, so it is where a real send must be able to happen. The runner map only carries
    // HOW an approved message leaves (e.g. a real Gmail send); WHETHER it may leave is still the item's
    // gate stamp, set only by the authorized release above. Host-supplied here, never by composition.
    sendRunners: options.sendRunners ?? defaultSendRunners(),
    // The live SHIP seam, populated beside sendRunners: this gate-resume run is the ONE path where a
    // founder-approved microproduct reaches the deploy connector, so it is where a real go-live must be
    // able to happen. The map only carries HOW an approved artifact ships (a hosted Vercel deploy via the
    // injected MCP tool); WHETHER it may ship is still the item's gate stamp AND the explicit deploy
    // confirmation (deployAuthorization above), both host-only. The BYO git-push primary path is the
    // deploy connector's own default and needs no runner here — so with no Vercel account connected this
    // map is honestly empty and BYO is used. Never populated by composition.
    deployRunners: options.deployRunners ?? defaultDeployRunners(),
    // Defense-in-depth at the gate point: re-assert authority inside the runner before any approval is
    // applied. authorizeGateRelease already passed above (or this code is unreachable); re-running it
    // here means the wall holds even if a future caller wires runGraph approvals without the front guard.
    authorizeRelease: () => authorizeGateRelease(session, payload, options),
  });
  recordFlowRun(flow.graph, result, options);
  // Bank the run's derivations (founder-gate taste signals, promotions) for their side effects.
  recordRunDerivations({ projectId: session.projectId || "default", graph: flow.graph, result }, options);
  session = addEvent({
    ...session,
    lastRunId: result.runId,
    pendingGate: result.pendingGates.length
      ? { runId: result.runId, nodeIds: result.pendingGates, runResult: result }
      : null,
    status: result.pendingGates.length ? "waiting_for_gate" : "ready",
    modelMessages: result.pendingGates.length ? session.modelMessages : [
      ...(session.modelMessages ?? []),
      {
        role: "user",
        content: `Founder gate resolved. Continued run ${result.runId}. Result: ${JSON.stringify(summarizeRun(result))}`,
      },
    ],
  }, {
    type: "gate_resolved",
    title: result.pendingGates.length ? "Gate still needs review" : "Founder gate resolved",
    detail: result.pendingGates.length
      ? `${result.pendingGates.length} gate${result.pendingGates.length === 1 ? "" : "s"} still contain undecided items.`
      : "The exact reviewed artifacts continued downstream without rerunning upstream work.",
    data: {
      runId: result.runId,
      pendingGates: result.pendingGates,
      releasedBy: { userId: releasedBy.userId, name: releasedBy.name },
    },
  }, options);
  if (!result.pendingGates.length) launchOperatorSession(id, runtime);
  return session;
}

// "Send back to refine" — the founder vetoes ONE staged item with a note; it goes back to the crew to
// rework and returns to the founder gate. This is NOT a release: nothing sends, deploys, or crosses the
// wall. Modeled on resolveOperatorGate (atomic claim, same runtime), but it never runs the graph, never
// calls authorizeGateRelease / authorizeReleaseForRequest, and never touches a send/execute path — the
// only effect is a rework instruction handed back to the model, which re-drives to a fresh gate.
export async function resolveOperatorGateRefine(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  if (session.status !== "waiting_for_gate" || !session.pendingGate?.runResult) {
    throw new Error("This operator session is not waiting at a founder gate.");
  }
  const gateNodeId = payload.gateNodeId || session.pendingGate.nodeIds?.[0] || null;
  const gateResult = gateNodeId ? session.pendingGate.runResult.nodes?.[gateNodeId] : null;
  if (!gateResult || !Array.isArray(gateResult.items)) {
    throw new Error(`No gate "${gateNodeId ?? "?"}" is waiting for review in this session.`);
  }
  const itemKey = typeof payload.itemKey === "string" ? payload.itemKey : null;
  // Match by the SAME stable key the gate uses to bind founder decisions to items (memory.draftKey,
  // mirrored in ui/src/lib/itemKey.ts), so refine targets exactly the item the founder pointed at.
  const target = itemKey ? gateResult.items.find((item) => draftKey(item) === itemKey) : null;
  if (!target) {
    throw new Error(itemKey ? `No staged item "${itemKey}" is waiting at this gate.` : "An item key is required to send an item back for rework.");
  }
  const founderNote = typeof payload.founderNote === "string" ? payload.founderNote.trim() : "";
  if (!founderNote) throw new Error("A note is required to send an item back for rework.");

  // ATOMICALLY claim the transition BEFORE any launch, exactly like resolveOperatorGate: the guard above
  // and this save are synchronous with no await between them, so a concurrent refine re-reads the claimed
  // (no longer waiting_for_gate) status and is rejected — the rework is handed back exactly once.
  // Extract the item's reviewable FRAMING (who / subject / current draft), never its machinery, for the
  // rework instruction. The crew reads its own prior draft to rework it — this stays inside the wall.
  const who = firstNonEmpty(target.name, target.founder_name, target.company, target.handle);
  const subject = firstNonEmpty(target.subject, target.suggested_subject_line);
  const draft = itemReviewText(target);
  const framingParts = [];
  if (who) framingParts.push(`for ${who}`);
  if (subject) framingParts.push(`subject "${subject}"`);
  const framingLabel = framingParts.length ? framingParts.join(", ") : (target.gtmActionId || itemKey);
  const framing = draft ? `${framingLabel} — current draft: ${draft}` : framingLabel;

  const next = addEvent({
    ...session,
    status: "ready",
    // Leaving the gate for rework: the model re-drives and brings the batch back to a fresh gate.
    pendingGate: null,
    error: null,
    pendingQuestion: null,
    maxSteps: Math.min(60, Math.max(session.maxSteps, session.stepCount + 12)),
    modelMessages: [
      ...(session.modelMessages ?? []),
      {
        role: "user",
        content: `The founder reviewed the staged work and sent ONE item back for rework. Item: ${framing}. Their note: ${founderNote}. Re-draft ONLY this item to address the note, keep everything else, and bring it back to the founder gate. Do not send, publish, or approve anything — the founder releases at the gate.`,
      },
    ],
  }, {
    type: "gate_item_refined",
    title: "Sent an item back for rework",
    detail: founderNote,
    data: { gateNodeId, itemKey },
  }, options);
  launchOperatorSession(id, runtime);
  return next;
}

// Mid-run steer — the founder redirects a run that is either mid-flight (running/ready) OR paused at
// the gate, without vetoing one specific item the way refine does. It generalizes resolveOperatorGateRefine:
// same "inject a founder message into modelMessages and re-drive" mechanism, but graph-wide (no itemKey,
// no per-item framing) and it accepts more states. NOT a release: it never calls authorizeGateRelease,
// never crosses the wall — the crew re-drives with the steer folded in and comes back to the founder gate.
// A gated session leaves the gate (pendingGate cleared) so the re-drive re-stages a fresh batch; a running
// or ready session simply takes the steer on its next turn. Terminal sessions (completed/cancelled) can't
// be steered — resume them instead.
export function steerOperatorSession(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  if (["completed", "cancelled"].includes(session.status)) {
    throw new Error(`This session is already ${session.status} — start or resume a run rather than steering it.`);
  }
  const note = typeof payload.note === "string" ? payload.note.trim()
    : typeof payload.founderNote === "string" ? payload.founderNote.trim() : "";
  if (!note) throw new Error("A steering note is required.");
  const hintsSuffix = formatOperatorHints(runtime.hints);
  const next = addEvent({
    ...session,
    // Leaving any gate/pause behind so the re-drive folds in the steer and returns to a fresh gate.
    status: "ready",
    pendingGate: null,
    pendingQuestion: null,
    error: null,
    maxSteps: Math.min(60, Math.max(session.maxSteps, session.stepCount + 12)),
    modelMessages: [
      ...(session.modelMessages ?? []),
      {
        role: "user",
        content: `The founder is steering the run mid-flight: ${note}${hintsSuffix} Fold this into the work in progress — adjust course, keep what still fits, and bring the batch back to the founder gate. Do not send, publish, or approve anything — the founder releases at the gate.`,
      },
    ],
  }, {
    type: "founder_steered_run",
    title: "Founder steered the run",
    detail: note,
  }, options);
  launchOperatorSession(id, runtime);
  return next;
}

// The founder accepts or discards a staged graph proposal. Accept applies the exact reviewed
// operations to the current graph and resumes the operator; discard drops them and resumes the
// operator told not to reapply. Mirrors resolveOperatorGate: founder-only, never an agent tool.
export function resolveOperatorProposal(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  // Resolve any session that HOLDS a staged proposal — not only one paused at waiting_for_proposal.
  // The operator often stages the change and finishes its turn (status → completed) with the proposal
  // still pending; the founder reviews it whenever. Accept re-applies and resumes; reject drops and
  // resumes. The only hard requirement is that a proposal actually exists.
  if (!session.pendingProposal) {
    throw new Error("This session has no graph proposal waiting for review.");
  }
  const proposal = session.pendingProposal;
  const accept = payload.accept === true || payload.decision === "accept";
  // Applying or discarding a reviewed proposal is a founder call. Enforce the same team role and
  // browser capability as the founder gate before mutating the graph or clearing the proposal.
  authorizeGateRelease(session, payload, options);
  if (typeof runtime.authorizeReleaseForRequest === "function") runtime.authorizeReleaseForRequest();
  // The founder's note on the decision. On reject it's a redirect (Claude comes back and changes it);
  // on accept it's a quiet annotation — the operator reads it, and the learning loop can pick it up
  // later. The note never makes the decision; the founder's ✓/✕ does, and the note only colors it.
  const note = typeof payload.note === "string" ? payload.note.trim() : "";

  if (accept) {
    const flow = flowFor(session, options);
    // Re-apply against the live graph (not the cached preview) so the commit is valid even if the
    // graph moved since the proposal was staged; applyGraphOperations re-validates and throws if not.
    const patched = applyGraphOperations(flow.graph, proposal.operations);
    const saved = saveFlow(patched.graph, options);
    const acceptMsg = `Founder accepted the proposed graph changes (${proposal.changes.length} operation${proposal.changes.length === 1 ? "" : "s"}). They are now applied.${note ? ` They left a note: "${note}". Take it as durable guidance for future changes, not a new edit to make now.` : ""} Continue.`;
    const next = addEvent({
      ...session,
      status: "ready",
      pendingProposal: null,
      error: null,
      graphRevision: saved.graph.revision ?? 0,
      modelMessages: [
        ...(session.modelMessages ?? []),
        { role: "user", content: acceptMsg },
      ],
    }, {
      type: "graph_patched",
      title: note ? "Founder accepted with a note" : "Founder accepted proposed changes",
      detail: note || proposal.rationale,
      data: { revision: saved.graph.revision, changes: patched.changes, proposalId: proposal.id, note: note || undefined },
    }, options);
    recordFounderDecision({
      projectId: session.projectId ?? "default",
      kind: "graph-proposal.accepted",
      value: note || "accepted",
      sourceRef: { type: "graph-proposal", id: proposal.id },
      contextRefs: [
        { type: "operator-session", id: session.id },
        { type: "graph", id: proposal.graphId },
      ],
    }, { ...options, projectId: session.projectId ?? "default" });
    settleProductChangeProposal({
      projectId: session.projectId ?? "default",
      proposalSessionId: session.id,
      disposition: "accepted",
    }, options);
    launchOperatorSession(id, runtime);
    return next;
  }

  const rejectMsg = note
    ? `Founder discarded the proposed graph changes and asked for this instead: "${note}". Do not reapply the discarded changes — make this change instead.`
    : "Founder discarded the proposed graph changes. Do not reapply them; consider a different approach.";
  const next = addEvent({
    ...session,
    status: "ready",
    pendingProposal: null,
    error: null,
    modelMessages: [
      ...(session.modelMessages ?? []),
      { role: "user", content: rejectMsg },
    ],
  }, {
    type: "graph_proposal_discarded",
    title: note ? "Founder redirected the changes" : "Founder discarded proposed changes",
    detail: note || proposal.rationale,
    data: { proposalId: proposal.id, note: note || undefined },
  }, options);
  recordFounderDecision({
    projectId: session.projectId ?? "default",
    kind: "graph-proposal.discarded",
    value: note || "discarded",
    sourceRef: { type: "graph-proposal", id: proposal.id },
    contextRefs: [
      { type: "operator-session", id: session.id },
      { type: "graph", id: proposal.graphId },
    ],
  }, { ...options, projectId: session.projectId ?? "default" });
  settleProductChangeProposal({
    projectId: session.projectId ?? "default",
    proposalSessionId: session.id,
    disposition: "discarded",
  }, options);
  launchOperatorSession(id, runtime);
  return next;
}

// The founder reviews the surviving ideas and decides: kill the weak ones, pick the strong ones to
// build. This is a FOUNDER act — never an agent/MCP tool — exactly like resolving a gate or a proposal.
// `kill` marks ideas dead in the store (a killed idea never gets wired into a build); `build` resumes
// the operator with an instruction to drive each kept idea through its pre-wired compose_and_run.
// A `build` id that names one of THIS pause's cut ideas is an explicit founder REVIVE — the founder's
// call reverses the bar's, the idea comes back to life and gets wired. The operator generated the
// ideas; the founder alone decides which become work.
export function resolveOperatorIdeas(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  if (!session.pendingIdeas) {
    throw new Error("This session has no proposed ideas waiting for the founder.");
  }
  const killIds = Array.isArray(payload.kill) ? payload.kill : [];
  const buildIds = Array.isArray(payload.build)
    ? payload.build
    : (payload.build ? [payload.build] : []);
  // The ids the bar cut in THIS pause — the only killed ideas a build id may revive. A founder kill
  // from an earlier round stays dead.
  const cutIds = new Set((session.pendingIdeas.cut ?? []).map((entry) => entry.id));
  // What each idea said it was (the generator's own free words) — read off the pause payload so the
  // founder's keeps can be recorded as what they actually are.
  const pendingById = new Map([
    ...(session.pendingIdeas.ideas ?? []).map((entry) => [entry.id, entry]),
    ...(session.pendingIdeas.cut ?? []).map((entry) => [entry.id, entry]),
  ]);

  // Founder kills: mark each dead in the durable store so it is never re-proposed or wired.
  const killed = [];
  const killedIdeas = [];
  for (const ideaId of killIds) {
    try {
      const idea = getGtmIdea(ideaId, options);
      const dead = saveGtmIdea({ ...idea, verdict: "killed", killed: true, buildWiring: null }, options);
      killed.push(ideaId);
      killedIdeas.push(dead);
    } catch {
      // An unknown id is ignored rather than failing the whole resolution.
    }
  }

  // Founder keeps: the ideas to build. A founder-killed idea cannot be built, even if also listed to
  // build — but a BAR-cut idea from this pause can: building it is the founder's explicit revive.
  const toBuild = [];
  const revived = [];
  for (const ideaId of buildIds) {
    if (killed.includes(ideaId)) continue;
    try {
      let idea = getGtmIdea(ideaId, options);
      if (idea.killed && cutIds.has(ideaId)) {
        idea = saveGtmIdea({
          ...idea,
          verdict: "survived",
          killed: false,
          buildWiring: { kind: "compose_and_run", goal: idea.pitch, title: idea.pitch.slice(0, 80) },
        }, options);
        revived.push(ideaId);
      }
      if (!idea.killed) toBuild.push(idea);
    } catch {
      // Unknown id ignored.
    }
  }

  // Bank the founder's verdicts as IdeaKill/IdeaKeep signals on the feedback rail — the SAME canonical
  // shaper the standalone /ideas kill/keep routes use — so a decision made through the operator pause
  // (the path the `ideate` tool actually stops into) teaches the next ideation round which angles bite,
  // not only a decision made through the standalone route. Best-effort: never break the resolution.
  try {
    recordIdeaDecisions({
      projectId: session.projectId || "default",
      decisions: [
        ...killedIdeas.map((idea) => ({ idea, decision: "kill" })),
        ...toBuild.map((idea) => ({ idea, decision: "keep" })),
      ],
    }, options);
  } catch {
    // taste capture is additive; a write failure must not interrupt the founder's pick
  }

  // Two resolution modes, set by where the project is in its life. "build" (the default): kept ideas
  // compose into pipelines — the mature-project path. "directions": the project is at its BEGINNING —
  // kept ideas are starting directions, written into the ONE shared kernel (icp.hypotheses) that every
  // future composition reads. Each direction is recorded as what the idea actually IS — the generator's
  // own free words ("an offer", "an audience to chase") lead the line; no generator slug or internal
  // label ever enters stored belief text. No pipeline is composed and no per-idea channel object is
  // created: the kernel holds the belief; pipelines come later as projections over it.
  const mode = payload.mode === "directions" ? "directions" : "build";
  if (mode === "directions" && toBuild.length) {
    try {
      const scoped = session.projectId ? { ...options, projectId: session.projectId } : options;
      const project = loadProject(scoped);
      const existing = project.sharedContext?.icp?.hypotheses ?? [];
      const added = toBuild
        .map((idea) => {
          const what = String(pendingById.get(idea.id)?.what || "").trim();
          return what ? `${what[0].toUpperCase()}${what.slice(1)}: ${idea.pitch}` : idea.pitch;
        })
        .filter((line) => !existing.includes(line));
      if (added.length) {
        updateSharedContext({ icp: { hypotheses: [...existing, ...added] } }, scoped);
      }
    } catch {
      // Recording directions is additive; a write failure must not interrupt the founder's pick.
    }
  }

  // The model-steering instruction. It goes ONLY into modelMessages (the model's channel) — the
  // founder-visible event below narrates the same decision in the founder's terms instead.
  const instruction = mode === "directions"
    ? (toBuild.length
      ? `Founder kept ${toBuild.length} idea${toBuild.length === 1 ? "" : "s"} as starting DIRECTIONS — each recorded in the shared context's icp.hypotheses in its own words (an audience guess, an offer idea, a channel idea, ...), the one kernel every future composition reads. The project is at its beginning: do NOT compose pipelines or create channels yet. Propose the single cheapest next discovery probe for the kept directions (what to test first and why), then complete the session with that recommendation.${killed.length ? ` They killed ${killed.length} other idea${killed.length === 1 ? "" : "s"}; do not revisit those.` : ""}`
      : `Founder reviewed the ideas${killed.length ? ` and killed ${killed.length}` : ""} but kept none as directions yet. Wait for their direction; do not build on your own.`)
    : (toBuild.length
      ? `Founder picked ${toBuild.length} idea${toBuild.length === 1 ? "" : "s"} to build: ${toBuild.map((idea) => `"${idea.pitch}" (idea_id ${idea.id})`).join("; ")}. Build each with compose_and_run, passing its idea_id and its pre-wired goal — the first sets this session's channel, any others use compose_new:true. Passing idea_id wires the built channel back to its idea so the run's outcome closes the loop.${killed.length ? ` They killed ${killed.length} other idea${killed.length === 1 ? "" : "s"}; do not revisit those.` : ""}`
      : `Founder reviewed the ideas${killed.length ? ` and killed ${killed.length}` : ""} but picked none to build yet. Wait for their direction; do not build on your own.`);

  // What the founder sees: their decision as a happening, in plain words. Never the steering prompt.
  const plural = (n) => (n === 1 ? "" : "s");
  const setAside = killed.length ? `; ${killed.length} killed and remembered` : "";
  const broughtBack = revived.length ? ` (${revived.length} of them brought back from the cut)` : "";
  const founderDetail = toBuild.length
    ? (mode === "directions"
      ? `Kept ${toBuild.length} direction${plural(toBuild.length)}${broughtBack}${setAside}. Next you'll get the cheapest way to test what you kept — nothing runs yet.`
      : `Building ${toBuild.length} idea${plural(toBuild.length)} now${broughtBack} — each stops at your gate${setAside}.`)
    : `Nothing kept this round${killed.length ? ` — ${killed.length} killed and remembered` : ""}. Nothing moves until you point at the next step.`;

  const next = addEvent({
    ...session,
    status: "ready",
    pendingIdeas: null,
    error: null,
    modelMessages: [
      ...(session.modelMessages ?? []),
      { role: "user", content: instruction },
    ],
  }, {
    type: "ideas_resolved",
    title: toBuild.length
      ? (mode === "directions" ? "You kept starting directions" : "You picked ideas to build")
      : "You reviewed the ideas",
    detail: founderDetail,
    data: { mode, built: toBuild.map((idea) => idea.id), killed, revived },
  }, options);
  launchOperatorSession(id, runtime);
  return next;
}

// The founder picks ONE candidate pipeline to build. This is a FOUNDER act — never an agent/MCP tool —
// exactly like resolving a gate, a proposal, or ideas. The operator sketched the shapes; only the founder
// chooses which becomes work. The pick re-enters compose_and_run seeded with the chosen shape, so it is
// built and driven to the founder gate through the same normalize → bind IO → wall → validate path —
// nothing sends, and a picked shape gets no weaker safety than a freshly composed one.
export async function resolveOperatorCandidates(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  if (!session.pendingCandidates) {
    throw new Error("This session has no proposed candidate pipelines waiting for the founder.");
  }
  const pickId = typeof payload.pick === "string"
    ? payload.pick
    : (typeof payload.candidateId === "string" ? payload.candidateId : null);
  const candidates = Array.isArray(session.pendingCandidates.candidates) ? session.pendingCandidates.candidates : [];
  const chosen = pickId ? candidates.find((c) => c.id === pickId) : null;
  if (!chosen) {
    throw new Error(pickId ? `No candidate pipeline "${pickId}" is waiting for review.` : "A candidate pick is required.");
  }
  const goal = firstNonEmpty(session.pendingCandidates.goal, session.goal);

  // Clear the pause and record the founder's choice, then build the chosen shape through the SAME
  // compose_and_run door (seeded with the candidate), which composes it, runs it to the founder gate,
  // and stops. Building is the founder's pick made concrete — done host-side, no model turn needed.
  const working = addEvent({
    ...session,
    status: "ready",
    pendingCandidates: null,
    error: null,
  }, {
    type: "candidates_resolved",
    title: "Founder picked a candidate pipeline",
    detail: `${chosen.label}${chosen.rationale ? ` — ${chosen.rationale}` : ""}`,
    data: { pick: chosen.id, goal },
  }, options);

  const execution = await executeTool(working, {
    id: `candidate-${Date.now()}`,
    name: "compose_and_run",
    input: {
      goal,
      title: chosen.label,
      candidate: { label: chosen.label, nodes: chosen.nodes, edges: chosen.edges },
      compose_new: Boolean(working.graphId),
    },
  }, options);
  return execution.session;
}

export function cancelOperatorSession(id, options = {}) {
  const session = getOperatorSession(id, options);
  return addEvent({
    ...session,
    status: "cancelled",
    completedAt: new Date().toISOString(),
    pendingQuestion: null,
    pendingGate: null,
    pendingProposal: null,
    pendingIdeas: null,
    pendingCandidates: null,
  }, {
    type: "session_cancelled",
    title: "Operator session cancelled",
    detail: "The durable history remains available.",
  }, options);
}

// Exposed for the Claude Code operator MCP bridge (./operator-mcp.mjs), which
// runs as a subprocess and routes the same typed tools through executeTool
// against the durable session store.
export { TOOLS as operatorTools } from "./operator-tools.mjs";
export { executeTool as executeOperatorTool } from "./operator-tool-exec.mjs";
