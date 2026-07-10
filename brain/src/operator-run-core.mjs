// Operator run mechanics shared by the tool dispatcher and the orchestrator: small pure helpers, the
// per-session flow/memory/design resolvers, the run summarizers, event persistence, and the role-gated
// gate-release authority. Moved verbatim out of operator-runtime.mjs — logic is byte-identical. This
// module depends on the stores below but on NEITHER the tool dispatcher nor the orchestrator, so the
// split introduces no import cycle.
import { loadFlow } from "./flow-store.mjs";
import { buildDraftMemory, buildTasteProfile, extractDecisions } from "./memory.mjs";
import { mergeSharedDecisions } from "./shared-judgments.mjs";
import { getDesignState } from "./design-state-store.mjs";
import { getWorkspace, listWorkspaces } from "./workspace.mjs";
import { ideaTasteForProject } from "./feedback-ledger.mjs";
import { distillTaste } from "./taste-distill.mjs";
import { appendOperatorEvent, saveOperatorSession } from "./operator-store.mjs";
import { applySharedContextToGraph, loadProject, projectTeamId } from "./project-store.mjs";
import { assertSessionGraphProject } from "./operator-project-scope.mjs";
import { canApprove, getMember, resolveCurrentUser } from "./team-store.mjs";

export function operatorProjectOptions(session, options = {}) {
  const owner = session?.projectId ?? null;
  const requested = options.projectId ?? null;
  if (owner && requested && owner !== requested) throw new Error(`Operator session ${session.id} belongs to project ${owner}, not ${requested}.`);
  return owner ? { ...options, projectId: owner } : options;
}

const RAW_MACHINERY_KEY = /^(agentPrompt|systemPrompt|prompt|soul|modelMessages|runtimeSessionId|credentials|token|apiKey|sourcePath|artifactPath|raw)$/i;

export function founderSafeValue(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => founderSafeValue(item, seen));
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (!RAW_MACHINERY_KEY.test(key)) safe[key] = founderSafeValue(item, seen);
  }
  return safe;
}

export function compactProduct(workspace) {
  if (!workspace) {
    return {
      grounded: false,
      note: "No repository workspace is open. The operator can still inspect and repair the graph, but product claims are ungrounded.",
    };
  }
  const report = workspace.report;
  return {
    grounded: true,
    workspaceId: workspace.id,
    repo: workspace.repo,
    outcome: workspace.outcome,
    headline: report.headline,
    stack: report.stack,
    winEvent: report.winEvent,
    gaps: report.gaps,
    funnel: report.funnel,
  };
}

export function latestWorkspace(session, options = {}) {
  const scoped = operatorProjectOptions(session, options);
  let linkedWorkspaceId = null;
  try {
    linkedWorkspaceId = loadProject(scoped).sharedContext?.repository?.workspaceId ?? null;
  } catch {
    linkedWorkspaceId = null;
  }
  // A project-scoped session must never borrow another product's newest workspace. Retain the global
  // fallback only for legacy unscoped sessions that predate durable project ownership.
  const summaries = session.projectId ? [] : listWorkspaces(scoped);
  const id = session.workspaceId || linkedWorkspaceId || summaries[0]?.id;
  if (!id) return null;
  try {
    return getWorkspace(id, scoped);
  } catch {
    return null;
  }
}

export function flowFor(session, options = {}) {
  options = operatorProjectOptions(session, options);
  const graphId = assertSessionGraphProject(session, options) ?? session.graphId;
  if (!graphId) throw new Error("No active channel. Create or switch to a channel first.");
  const flow = loadFlow(graphId, null, options);
  if (!flow.graph) throw new Error(`Graph not found: ${graphId}`);
  const project = loadProject(options);
  // The pipeline's own offer (when this graph belongs to a channel that carries one) rides into the
  // run context so a drafting step honors the pipeline's deal without the founder restating it.
  const channel = (project.channels ?? []).find((c) => c.graphId === graphId || c.id === graphId) ?? null;
  return {
    ...flow,
    project,
    graph: applySharedContextToGraph(flow.graph, project.sharedContext, { channelOffer: channel?.offer ?? null }),
  };
}

export function memoryFor(runs, options, projectId) {
  // Merge this project's gate decisions with the shared taste ledger (the global rig + other
  // projects), so the operator's draft voice compounds across both rigs (HARNESS.md invariant 4).
  // Fold in the founder's idea kills/keeps banked on the feedback rail too, so the killed angles teach
  // the next ideation round which angles bite — the idea half of loop memory, not just draft voice.
  return buildDraftMemory(mergeSharedDecisions(extractDecisions(runs), options), {
    ideaTaste: ideaTasteForProject(projectId || "default", options),
  });
}

export function recallTaste(session, options = {}) {
  let runs = [];
  try {
    if (session?.graphId) runs = flowFor(session, options).runs || [];
  } catch {
    runs = [];
  }
  const projectId = session?.projectId || options.projectId || "default";
  let profile = null;
  try {
    const decisions = mergeSharedDecisions(extractDecisions(runs), options);
    profile = buildTasteProfile(decisions, { ideaTaste: ideaTasteForProject(projectId, options) });
  } catch {
    profile = null;
  }
  return distillTaste(profile);
}

export function designStateFor(session, options) {
  // The founder's front-end house style for this project (falls back to the seeded global default),
  // injected so any UI an operator step produces starts from captured taste, not the generic mean.
  return getDesignState(session?.projectId || options?.projectId || "default", options);
}

export function summarizeNodeResult(node) {
  return {
    nodeId: node.nodeId,
    category: node.category,
    ok: node.ok,
    blocked: node.blocked ?? false,
    pendingReview: node.pendingReview ?? false,
    itemCount: Array.isArray(node.items) ? node.items.length : 0,
    error: node.error ?? null,
    meta: node.meta ?? null,
    // The teammate's plain-language reasoning — its pre-JSON prose, captured on the node result so the
    // run ledger and the founder gate can show WHY the crew handed this back, not just the items (Wave 2).
    ...(node.reasoning ? { reasoning: node.reasoning } : {}),
    // Required-consult violations surfaced by graph.mjs at the gate: drafting/UI steps that skipped
    // the founder's taste (and design) signal. Carried through so the operator and founder see the
    // blocking issue at the gate instead of approving a draft as if it were grounded.
    ...(node.consultBlocked ? { consultBlocked: true, consultViolations: node.consultViolations ?? [] } : {}),
    items: (node.items ?? []).slice(0, 12),
  };
}

export function summarizeRun(result) {
  return {
    runId: result.runId,
    ok: result.ok,
    pendingGates: result.pendingGates,
    targetNodeId: result.targetNodeId,
    error: result.error ?? null,
    nodes: Object.fromEntries(
      Object.entries(result.nodes ?? {}).map(([id, node]) => [id, summarizeNodeResult(node)]),
    ),
  };
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function addEvent(session, event, options) {
  return saveOperatorSession(appendOperatorEvent(session, event), options);
}

// JOB 1 — the role-gated release. The gate connector already owns the WALL: nothing sends until a
// human supplies an approve decision. This guard answers the separate question of WHO is allowed to
// supply that decision when the gate is a shared team queue. Viewing (and commenting) is open to the
// whole team; RELEASE (approve/send) requires a team-store role of owner or approver. A solo founder's
// session has no team (teamId null → the founder's personal team) where the founder is the owner, so
// the single-user path stays exactly as before: the founder always passes.
//
// Returns the resolved acting user so the caller can stamp the release event with who cleared it.
export function authorizeGateRelease(session, payload = {}, options = {}) {
  // The team that owns this conversation: the session's stamped teamId, else the project's effective
  // team (which resolves to the founder's personal team for a single-user project).
  const teamId = session.teamId
    || (session.projectId ? projectTeamId(session.projectId, options) : null)
    || projectTeamId(null, options);
  // The acting human: explicit payload.userId wins, else identity stamped on the request headers,
  // else the local founder. Same resolver the team routes use, so the UI and the agent door agree.
  const actor = resolveCurrentUser({
    ...options,
    userId: payload.userId,
    request: payload.request ?? options.request,
    headers: payload.headers ?? options.headers,
  });
  if (!canApprove(teamId, actor.userId, options)) {
    const member = getMember(teamId, actor.userId, options);
    const role = member?.role ?? "non-member";
    const error = new Error(
      `${actor.name} (${role}) cannot release this send. Only a team owner or approver may clear the founder gate. Others can view and comment.`,
    );
    error.code = "gate_release_forbidden";
    error.status = 403;
    error.teamId = teamId;
    error.userId = actor.userId;
    throw error;
  }
  return { actor, teamId };
}
