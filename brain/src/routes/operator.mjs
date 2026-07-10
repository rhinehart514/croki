// Durable resident operator sessions — list, launch, the scheduler heartbeat, read one, connection
// status, and the founder-decision actions (resume / gate / proposal / ideas / candidates / cancel).
// Moved verbatim out of server.mjs. The gate action carries the browser-only release guard.
import { json, readBody } from "./util.mjs";
import { handleComposerTurn } from "../composer-turn.mjs";
import { buildComposerBriefing } from "../composer-briefing.mjs";
import { loadProject } from "../project-store.mjs";
import { loadFlow } from "../flow-store.mjs";
import { graphIdForRef } from "../operator-project-scope.mjs";
import {
  assertOperatorSessionProject,
  bindOperatorSessionContext,
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
  resolveOperatorGateRefine,
  resolveOperatorIdeas,
  resolveOperatorProposal,
  resumeOperatorSession,
  runDueAmbientTicks,
  steerOperatorSession,
  executeOperatorTool,
} from "../operator-runtime.mjs";
import { runDueMotions } from "../promote-motion.mjs";
import { selectRuntime, authModeLabel, runtimeStatuses } from "../runtimes/index.mjs";
import { authorizeReleaseForRequest } from "./session-guard.mjs";
import { getOperatingView } from "../operating-view.mjs";

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
          const bound = hasSessionContext(body)
            ? bindOperatorSessionContext(existing.id, sessionContextFromBody(body, project.id))
            : existing;
          json(res, 200, { session: publicOperatorSession(bound), reused: true });
          return true;
        }
      }
      // `fresh: true` starts a session bound to NO pipeline, so compose_and_run composes a brand-new
      // one — this is how a founder builds an ADDITIONAL pipeline for a product (the "New channel"
      // action) without re-driving the active pipeline. Otherwise bind to the requested/active channel.
      const pipeline = body.pipelineId ? (project.channels ?? []).find((item) => item.id === body.pipelineId || item.graphId === body.pipelineId) : null;
      const requestedGraphId = body.graphId || body.workflowId || body.channelId || pipeline?.graphId || null;
      const unscopedGraphId = body.fresh ? null : (requestedGraphId || project.activeChannelId || null);
      const graphId = unscopedGraphId
        ? graphIdForRef({ type: body.graphId ? "graph" : "pipeline", id: unscopedGraphId }, { projectId: project.id })
        : null;
      const flow = graphId ? loadFlow(graphId, null) : { graph: null };
      const session = createOperatorSession({
        goal: body.goal,
        graphId: flow.graph?.id ?? null,
        programId: body.programId ?? null,
        projectId: project.id,
        surface: body.surface,
        lens: body.lens,
        graphRevision: flow.graph?.revision ?? 0,
        workspaceId: body.workspaceId,
        model: body.model,
        runtime: body.runtime,
        maxSteps: body.maxSteps,
        questionId: body.questionId ?? body.question?.id ?? null,
        participantRefs: body.participantRefs ?? body.teammateRefs ?? body.crewRefs ?? [],
        productRefs: body.productRefs ?? [],
        focusRef: body.focusRef ?? body.ref ?? null,
        contextRefs: body.contextRefs ?? body.refs ?? [],
        pipelineId: body.pipelineId ?? body.channelId ?? body.workflowId ?? null,
        runId: body.runId ?? null,
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

  // The operating view — the ONE Operator lens read (GTM-MACHINE.md Area 6). A pure cross-fleet
  // projection: every motion as a uniform lane (its emergent stages + derived health), the shared objects
  // the lanes both touched drawn once with lane ties, the parked-at-gate state that routes one click to
  // the real gate, and each lane's efficiency row. Read-only: it composes existing reads, never writes,
  // never triggers a run, never gates one. Proposed plan lanes (Area 4) are NOT fetched here — the plan
  // regenerates on demand through its own route so a lens read never spends the subscription.
  if (req.method === "GET" && url.pathname === "/api/operating-view") {
    try {
      const projectId = url.searchParams.get("project") || undefined;
      json(res, 200, getOperatingView({ projectId }));
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
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

  // Connection status — does the founder have a local AI runtime the operator can use?
  // Return each redacted runtime state so the product can explain its real options
  // without forcing an installed Codex user through a Claude-only setup wall.
  if (req.method === "GET" && url.pathname === "/api/connection") {
    const selection = selectRuntime({});
    json(res, 200, {
      connected: !!selection.adapter,
      label: selection.adapter
        ? [selection.adapter.label, authModeLabel(selection.auth)].filter(Boolean).join(" · ")
        : null,
      reason: selection.adapter ? null : selection.reason,
      selectedRuntime: selection.adapter?.id ?? null,
      runtimes: runtimeStatuses(),
    });
    return true;
  }

  // Canonical MCP/operator verbs. Each one executes its typed service directly; none is routed through
  // the composer's semantic /ask lane, so asking cannot accidentally run and an explicit run cannot be
  // reclassified as chat. The browser's existing /ask route below remains unchanged.
  const operatorVerbMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)\/verbs\/(inspect|focus|ask|propose|record|run)$/);
  if (req.method === "POST" && operatorVerbMatch) {
    try {
      const body = await readBody(req);
      const [, sessionId, verb] = operatorVerbMatch;
      if (body.projectId) assertOperatorSessionProject(sessionId, body.projectId);
      if (verb !== "inspect" && (body.questionId || body.participantRefs || body.productRefs)) {
        bindOperatorSessionContext(sessionId, {
          projectId: body.projectId,
          questionId: body.questionId,
          participantRefs: body.participantRefs,
          productRefs: body.productRefs,
        });
      }
      const execution = await executeOperatorTool(getOperatorSession(sessionId), {
        id: `route-${Date.now()}`,
        name: verb,
        input: body,
      });
      json(res, 200, { session: publicOperatorSession(execution.session), result: execution.result, paused: execution.pause === true });
    } catch (err) {
      json(res, 409, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const operatorContextMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)\/(inspect|focus|record)$/);
  if (req.method === "POST" && operatorContextMatch) {
    try {
      const body = await readBody(req);
      const [, sessionId, action] = operatorContextMatch;
      if (body.projectId) assertOperatorSessionProject(sessionId, body.projectId);
      if (action === "focus") {
        bindOperatorSessionContext(sessionId, {
          projectId: body.projectId,
          surface: body.surface,
          lens: body.lens,
          contextRefs: body.refs ?? body.contextRefs ?? [],
          questionId: body.questionId,
          participantRefs: body.participantRefs ?? body.teammateRefs,
          productRefs: body.productRefs,
        });
        const execution = await executeOperatorTool(getOperatorSession(sessionId), { id: `route-${Date.now()}`, name: "focus", input: { ref: body.ref ?? body.focusRef } });
        json(res, 200, { session: publicOperatorSession(execution.session), result: execution.result });
      } else {
        const execution = await executeOperatorTool(getOperatorSession(sessionId), { id: `route-${Date.now()}`, name: action, input: body });
        json(res, 200, { session: publicOperatorSession(execution.session), result: execution.result });
      }
    } catch (err) {
      json(res, 409, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const operatorActionMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)\/(resume|gate-refine|gate|proposal|ideas|candidates|steer|cancel)$/);
  if (req.method === "POST" && operatorActionMatch) {
    try {
      const body = await readBody(req);
      const [, sessionId, action] = operatorActionMatch;
      // The session's stored projectId is authoritative. When the composer names the project it is
      // driving, reject a mismatch loudly rather than letting it resume/gate another project's session.
      if (body.projectId) assertOperatorSessionProject(sessionId, body.projectId);
      let session;
      // `body.hints` (optional) carries the founder's @-mentioned teammates/capabilities from the
      // composer — advisory steering only, folded into the operator's context so composition prefers the
      // named crew. It never blocks or contracts the run (the no-cage invariant).
      if (action === "resume") {
        if (hasSessionContext(body)) bindOperatorSessionContext(sessionId, sessionContextFromBody(body));
        session = resumeOperatorSession(sessionId, body.input, { hints: body.hints });
      }
      // Role-gated release: pass the acting user (request headers, else founder) so resolveOperatorGate
      // can authorize the send. A viewer/member release throws gate_release_forbidden → 403. Also pass the
      // browser-only release guard (W2b): the same session-token/agent-header check the raw graph-run path
      // uses, so an agent-stamped or token-less APPROVAL at the operator gate is refused too. Both guards
      // hold — role AND browser session — defense in depth.
      // Area 5 MOVE 1 — the founder's explicit deploy confirmation rides this SAME body: the UI's "Ship it
      // live" button sends `deployConfirmed:true`, which the whole `body` forwards to resolveOperatorGate
      // (it builds the deploy authorization from it and threads it onto node.runtime). No allowlist strips
      // it and the route never invents it, so only a real founder body carrying it clears the deploy GUARD 2.
      else if (action === "gate") session = await resolveOperatorGate(sessionId, { ...body, request: req }, { authorizeReleaseForRequest: authorizeReleaseForRequest(req) });
      // Send ONE staged item back to the crew to rework, with the founder's note. Releases nothing — it
      // re-drives to a fresh gate — so it takes the same authorizers as `gate` but never crosses the wall.
      else if (action === "gate-refine") session = await resolveOperatorGateRefine(sessionId, { ...body, request: req }, { authorizeReleaseForRequest: authorizeReleaseForRequest(req) });
      else if (action === "proposal") session = resolveOperatorProposal(
        sessionId,
        { ...body, request: req },
        { authorizeReleaseForRequest: authorizeReleaseForRequest(req) },
      );
      // The founder kills/keeps the paused ideas — a founder act, never an agent tool. Picking ideas
      // resumes the operator to build each kept survivor through its pre-wired compose_and_run.
      else if (action === "ideas") session = resolveOperatorIdeas(sessionId, body);
      // The founder picks ONE candidate pipeline — a founder act that builds the chosen shape through
      // compose_and_run and drives it to the gate. Never an agent tool.
      else if (action === "candidates") session = await resolveOperatorCandidates(sessionId, body);
      // Mid-run steer: the founder redirects a running OR gated run with a note (reuses the refine
      // mechanism — inject the steer, re-drive to a fresh gate). Never a release; nothing crosses the wall.
      else if (action === "steer") session = steerOperatorSession(sessionId, body, { hints: body.hints });
      else session = cancelOperatorSession(sessionId);
      json(res, action === "gate" || action === "proposal" || action === "ideas" || action === "candidates" ? 200 : 202, { session: publicOperatorSession(session) });
    } catch (err) {
      const status = err?.code === "gate_release_forbidden" ? 403 : 409;
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const operatorAskMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)\/ask$/);
  if (req.method === "POST" && operatorAskMatch) {
    try {
      const body = await readBody(req);
      const sessionId = operatorAskMatch[1];
      // Same project-ownership guard the existing action routes use.
      if (body.projectId) assertOperatorSessionProject(sessionId, body.projectId);
      if (hasSessionContext(body)) bindOperatorSessionContext(sessionId, sessionContextFromBody(body));
      const result = await handleComposerTurn(
        { projectId: body.projectId, sessionId, text: body.input, hints: body.hints },
        {},
      );
      if (result.handled === "drive") {
        json(res, 202, { mode: "drive", intent: result.intent, session: publicOperatorSession(result.session) });
      } else {
        json(res, 200, { mode: "fast", intent: result.intent, answer: result.answer, briefing: result.briefing });
      }
    } catch (err) {
      const status = err?.code === "gate_release_forbidden" ? 403 : 409;
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Composer briefing — a read-only cross-pipeline snapshot shaped EXACTLY for the composer's `briefing`
  // prop (eyebrow / rows / summary). Reading it never drives, resumes, sends, or creates anything.
  if (req.method === "GET" && url.pathname === "/api/operator/briefing") {
    const projectId = url.searchParams.get("project") || undefined;
    const b = buildComposerBriefing({ projectId });
    json(res, 200, briefingProp(b));
    return true;
  }

  // The session-optional composer fast lane. Status/explain get a fast deterministic answer WITHOUT
  // spawning the autonomous drive (the !allowDrive path injects a no-op resume seam so act/run never
  // resumes or creates here — it reports mode:"drive", session:null for the client to create on its own
  // untouched path). When allowDrive AND a sessionId are present, handleComposerTurn's default resume
  // runs, which is byte-for-byte the same drive-to-gate as the existing resume route. THE WALL is
  // untouched: this never sends; only the unchanged gate route releases.
  if (req.method === "POST" && url.pathname === "/api/operator/turn") {
    try {
      const body = await readBody(req);
      if (body.sessionId && body.projectId) assertOperatorSessionProject(body.sessionId, body.projectId);
      if (body.sessionId && hasSessionContext(body)) {
        bindOperatorSessionContext(body.sessionId, sessionContextFromBody(body));
      }
      const allowDrive = body.allowDrive === true && !!body.sessionId;
      const runtime = allowDrive ? {} : { resume: () => null };
      const result = await handleComposerTurn(
        { projectId: body.projectId, sessionId: body.sessionId, text: body.input, hints: body.hints },
        runtime,
      );
      if (result.handled === "fast") {
        json(res, 200, { mode: "fast", intent: result.intent, answer: result.answer, briefing: result.briefing ?? null });
      } else {
        json(res, 202, { mode: "drive", intent: result.intent, session: result.session ? publicOperatorSession(result.session) : null });
      }
    } catch (err) {
      const status = err?.code === "gate_release_forbidden" ? 403 : 409;
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}

function hasSessionContext(body = {}) {
  return [
    "surface", "lens", "focusRef", "ref", "contextRefs", "refs", "questionId", "question",
    "participantRefs", "teammateRefs", "crewRefs", "productRefs",
  ].some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function sessionContextFromBody(body = {}, projectId = body.projectId) {
  return {
    projectId,
    ...(Object.prototype.hasOwnProperty.call(body, "surface") ? { surface: body.surface } : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "lens") ? { lens: body.lens } : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "focusRef")
      ? { focusRef: body.focusRef }
      : Object.prototype.hasOwnProperty.call(body, "ref") ? { focusRef: body.ref } : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "contextRefs")
      ? { contextRefs: body.contextRefs }
      : Object.prototype.hasOwnProperty.call(body, "refs") ? { contextRefs: body.refs } : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "questionId") || body.question?.id
      ? { questionId: body.questionId ?? body.question.id }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "participantRefs")
      || Object.prototype.hasOwnProperty.call(body, "teammateRefs")
      || Object.prototype.hasOwnProperty.call(body, "crewRefs")
      ? { participantRefs: body.participantRefs ?? body.teammateRefs ?? body.crewRefs }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "productRefs") ? { productRefs: body.productRefs } : {}),
  };
}

// Maps a buildComposerBriefing() result to the composer's `briefing` prop shape. Mirrors ComposerDock's
// needs/work/quiet vocabulary so the server read visually matches the retired client-derived briefing.
function briefingProp(b) {
  const now = new Date();
  const eyebrow =
    now.toLocaleDateString([], { weekday: "long" }) +
    ", " +
    now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const rows = (b.perPipeline || []).map((p) => {
    const needs = (p.pendingGates ?? 0) > 0;
    const working = p.status === "running";
    const state = needs ? "needs" : working ? "work" : "quiet";
    const what = needs
      ? (p.pendingGates === 1 ? "1 waiting at your gate" : `${p.pendingGates} waiting at your gate`)
      : working
        ? "working…"
        : (p.runCount > 0
            ? (p.produced > 0 ? `${p.produced} drafted, nothing waiting` : "ran, nothing waiting")
            : "quiet for now");
    return { id: p.id, name: p.name, state, what };
  });
  return { eyebrow, rows, summary: b.summary };
}
