// Durable resident operator sessions — list, launch, the scheduler heartbeat, read one, connection
// status, and the founder-decision actions (resume / gate / proposal / ideas / candidates / cancel).
// Moved verbatim out of server.mjs. The gate action carries the browser-only release guard.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { loadFlow } from "../flow-store.mjs";
import {
  assertOperatorSessionProject,
  createOperatorSession,
  getActiveSessionForProject,
  getOperatorSession,
  listOperatorSessions,
  publicOperatorSession,
} from "../operator-store.mjs";
import {
  cancelOperatorSession,
  launchOperatorSession,
  resolveOperatorCandidates,
  resolveOperatorGate,
  resolveOperatorIdeas,
  resolveOperatorProposal,
  resumeOperatorSession,
  runDueAmbientTicks,
} from "../operator-runtime.mjs";
import { runDueMotions } from "../promote-motion.mjs";
import { selectRuntime, authModeLabel } from "../runtimes/index.mjs";
import { authorizeReleaseForRequest } from "./session-guard.mjs";

export default async function handle({ req, res, url }) {
  // Durable resident GTM operator sessions
  if (req.method === "GET" && url.pathname === "/api/operator/sessions") {
    const projectId = url.searchParams.get("project") || undefined;
    json(res, 200, { sessions: listOperatorSessions({ projectId }) }); return true;
  }

  if (req.method === "POST" && url.pathname === "/api/operator/sessions") {
    try {
      const body = await readBody(req);
      // projectId comes from the REQUEST (the active project the canvas is showing), not from mutable
      // global active-project state. Fall back to loadProject() only when the client omits it
      // (back-compat). Resolving the project by explicit id is what removes the composer↔canvas drift.
      const project = loadProject(body.projectId ? { projectId: body.projectId } : {});
      // The dock is LOCKED to one durable conversation per project. When the client asks to reuse the
      // project's thread, return its current non-terminal session if one exists instead of spawning a
      // parallel conversation; only create when there is no live thread. Default (reuse omitted) keeps
      // the historical "always create a fresh session" behavior for back-compat callers.
      if (body.reuse === true) {
        const existing = getActiveSessionForProject(project.id);
        if (existing) {
          json(res, 200, { session: publicOperatorSession(existing), reused: true });
          return true;
        }
      }
      // `fresh: true` starts a session bound to NO pipeline, so compose_and_run composes a brand-new
      // one — this is how a founder builds an ADDITIONAL pipeline for a product (the "New channel"
      // action) without re-driving the active pipeline. Otherwise bind to the requested/active channel.
      const graphId = body.fresh ? null : (body.graphId || project.activeChannelId || null);
      const flow = graphId ? loadFlow(graphId, null) : { graph: null };
      const session = createOperatorSession({
        goal: body.goal,
        graphId: flow.graph?.id ?? null,
        programId: body.programId ?? null,
        projectId: project.id,
        graphRevision: flow.graph?.revision ?? 0,
        workspaceId: body.workspaceId,
        model: body.model,
        maxSteps: body.maxSteps,
      });
      launchOperatorSession(session.id);
      json(res, 202, { session: publicOperatorSession(session), reused: false });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // The scheduler heartbeat — the ONE server-callable hook (an external cron/scheduler POSTs here on its
  // interval; there is deliberately NO module-scope setInterval, so importing the server never spins a
  // live timer). It drives BOTH standing work off the same real caller: it wakes every ambient session
  // whose standing brief is DUE, and it re-stages every promoted motion whose cadence is DUE (Phase 6).
  // Both only DRIVE/STAGE — never send — and each due item that throws is skipped, never breaking the
  // tick. A re-staged motion stops at the founder gate exactly like a first run.
  if (req.method === "POST" && url.pathname === "/api/operator/ambient/tick") {
    try {
      const woken = runDueAmbientTicks();
      const motions = runDueMotions();
      json(res, 200, { woken, motions });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const operatorSessionMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)$/);
  if (req.method === "GET" && operatorSessionMatch) {
    try {
      // When the canvas names the project it is showing, confirm the session belongs to it before
      // handing it back — the session's stored projectId is authoritative. Omitting ?project keeps the
      // unscoped lookup for back-compat readers.
      const scopedProject = url.searchParams.get("project");
      if (scopedProject) assertOperatorSessionProject(operatorSessionMatch[1], scopedProject);
      json(res, 200, { session: publicOperatorSession(getOperatorSession(operatorSessionMatch[1])) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Connection status — does the founder have a live Claude the operator/composer can use?
  // Drives the cold-start state so an unconnected user gets a clear path, not a dead-end error.
  if (req.method === "GET" && url.pathname === "/api/connection") {
    const selection = selectRuntime({});
    json(res, 200, {
      connected: !!selection.adapter,
      label: selection.adapter ? (selection.auth ? authModeLabel(selection.auth) : selection.adapter.label) : null,
      reason: selection.adapter ? null : selection.reason,
    });
    return true;
  }

  const operatorActionMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)\/(resume|gate|proposal|ideas|candidates|cancel)$/);
  if (req.method === "POST" && operatorActionMatch) {
    try {
      const body = await readBody(req);
      const [, sessionId, action] = operatorActionMatch;
      // The session's stored projectId is authoritative. When the composer names the project it is
      // driving, reject a mismatch loudly rather than letting it resume/gate another project's session.
      if (body.projectId) assertOperatorSessionProject(sessionId, body.projectId);
      let session;
      if (action === "resume") session = resumeOperatorSession(sessionId, body.input);
      // Role-gated release: pass the acting user (request headers, else founder) so resolveOperatorGate
      // can authorize the send. A viewer/member release throws gate_release_forbidden → 403. Also pass the
      // browser-only release guard (W2b): the same session-token/agent-header check the raw graph-run path
      // uses, so an agent-stamped or token-less APPROVAL at the operator gate is refused too. Both guards
      // hold — role AND browser session — defense in depth.
      else if (action === "gate") session = await resolveOperatorGate(sessionId, { ...body, request: req }, { authorizeReleaseForRequest: authorizeReleaseForRequest(req) });
      else if (action === "proposal") session = resolveOperatorProposal(sessionId, body);
      // The founder kills/keeps the paused ideas — a founder act, never an agent tool. Picking ideas
      // resumes the operator to build each kept survivor through its pre-wired compose_and_run.
      else if (action === "ideas") session = resolveOperatorIdeas(sessionId, body);
      // The founder picks ONE candidate pipeline — a founder act that builds the chosen shape through
      // compose_and_run and drives it to the gate. Never an agent tool.
      else if (action === "candidates") session = await resolveOperatorCandidates(sessionId, body);
      else session = cancelOperatorSession(sessionId);
      json(res, action === "gate" || action === "proposal" || action === "ideas" || action === "candidates" ? 200 : 202, { session: publicOperatorSession(session) });
    } catch (err) {
      const status = err?.code === "gate_release_forbidden" ? 403 : 409;
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
