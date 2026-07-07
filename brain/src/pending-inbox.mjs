// The Pending Decision Inbox — a PURE READ over real state that answers one question: across every
// product and every pipeline, what is right now waiting on the founder's decision?
//
// The product pauses for the founder in several differently-rendered places — a run staged at the
// founder gate, a proposed set of graph edits held as ghosts, an ideate pause (build or cut), a set of
// candidate pipeline shapes to pick, a blank re-prompt when an operator needs an answer, a run that
// blocked or died, and a world-signal captured but not yet routed. Each of those already lives in
// durable state (operator sessions and the input store); NONE of them is a new persisted object. This
// module is a PROJECTION over that state, exactly like board.mjs / getAgentBench: it reads, derives,
// and NEVER writes, approves, resolves, advances, or auto-decides anything. It is the read side of "you
// have decisions waiting" — the aggregation the dock badge and the inbox surface both consume.
//
// Cross-project by default: with no projectId it walks every project so the dock badge reflects ALL
// pipelines, not just the one on screen. Pass a projectId to scope to one product.

import { listOperatorSessions, getOperatorSession } from "./operator-store.mjs";
import { listUnroutedInputs } from "./inputs-store.mjs";
import { listProjects, loadProject, getProjectChannels } from "./project-store.mjs";

// The operator-session statuses that mean "a founder decision is the blocker", each paired with the
// session field carrying what they'd decide on and the inbox kind we surface it as. Everything else
// (ready, running, resolving_gate, completed, cancelled, interrupted) is NOT a pending decision:
// resolving_gate is mid-resolve, interrupted is a process-restart artifact the founder resumes rather
// than decides. Derived — never seeded.
const SESSION_DECISION_KINDS = [
  { status: "waiting_for_gate", field: "pendingGate", kind: "gate" },
  { status: "waiting_for_proposal", field: "pendingProposal", kind: "proposal" },
  { status: "waiting_for_ideas", field: "pendingIdeas", kind: "ideas" },
  { status: "waiting_for_candidates", field: "pendingCandidates", kind: "candidates" },
  { status: "waiting_for_input", field: "pendingQuestion", kind: "question" },
  { status: "blocked", field: null, kind: "blocked" },
  { status: "failed", field: null, kind: "failed" },
];
const DECISION_STATUSES = new Set(SESSION_DECISION_KINDS.map((d) => d.status));
const KIND_BY_STATUS = new Map(SESSION_DECISION_KINDS.map((d) => [d.status, d]));

// A stable, human string for what a paused session is waiting to decide on. Kept short — the UI adds
// the plain-language framing; this is the raw context so nothing is invented.
function summarizeSessionDecision(kind, session) {
  switch (kind) {
    case "gate": {
      const nodes = Array.isArray(session.pendingGate?.nodeIds) ? session.pendingGate.nodeIds.length : 0;
      return nodes > 0 ? `${nodes} staged item${nodes === 1 ? "" : "s"} ready to approve or reject` : "Staged and ready for your gate";
    }
    case "proposal": {
      const ops = Array.isArray(session.pendingProposal?.changes)
        ? session.pendingProposal.changes.length
        : Array.isArray(session.pendingProposal?.operations) ? session.pendingProposal.operations.length : 0;
      const rationale = String(session.pendingProposal?.rationale || "").trim();
      return rationale || (ops > 0 ? `${ops} proposed change${ops === 1 ? "" : "s"} to your pipeline` : "Proposed changes to your pipeline");
    }
    case "ideas": {
      const survived = Array.isArray(session.pendingIdeas?.ideas) ? session.pendingIdeas.ideas.length : 0;
      const cut = Array.isArray(session.pendingIdeas?.cut) ? session.pendingIdeas.cut.length : 0;
      const parts = [];
      if (survived) parts.push(`${survived} to build or cut`);
      if (cut) parts.push(`${cut} already set aside`);
      return parts.join(" · ") || "Directions waiting on your call";
    }
    case "candidates": {
      const n = Array.isArray(session.pendingCandidates?.candidates) ? session.pendingCandidates.candidates.length : 0;
      return n > 0 ? `${n} pipeline shape${n === 1 ? "" : "s"} to pick from` : "Pipeline shapes to pick from";
    }
    case "question": {
      const q = String(session.pendingQuestion?.question || session.pendingQuestion || "").trim();
      return q || "Waiting on your answer to continue";
    }
    case "blocked":
      return String(session.error || "").trim() || "Blocked — needs you to unblock it";
    case "failed":
      return String(session.error || "").trim() || "This run stopped before it finished";
    default:
      return "";
  }
}

// How many discrete options a decision offers, when that count is meaningful (ideas / candidates).
// Undefined when the item isn't a pick among N. Purely informational for the surface.
function optionCount(kind, session) {
  if (kind === "ideas") return Array.isArray(session.pendingIdeas?.ideas) ? session.pendingIdeas.ideas.length : undefined;
  if (kind === "candidates") return Array.isArray(session.pendingCandidates?.candidates) ? session.pendingCandidates.candidates.length : undefined;
  return undefined;
}

// Best-effort pipeline name for a session's graphId — pure read of the project's channels, tolerant of
// a missing project or an unmatched id (returns null rather than inventing a name).
function pipelineNameFor(projectId, graphId, options) {
  if (!projectId || !graphId) return null;
  try {
    const project = loadProject({ ...options, projectId });
    const channels = getProjectChannels(project, options);
    const match = channels.find((c) => c.graphId === graphId || c.id === graphId);
    return match?.name ?? null;
  } catch {
    return null;
  }
}

// One waiting item, whatever its source, in a single uniform shape the dock and inbox both read.
function decisionItem(fields) {
  return {
    id: fields.id,
    kind: fields.kind,
    projectId: fields.projectId ?? null,
    projectName: fields.projectName ?? null,
    pipelineId: fields.pipelineId ?? null,
    pipelineName: fields.pipelineName ?? null,
    sessionId: fields.sessionId ?? null,
    inputId: fields.inputId ?? null,
    title: fields.title ?? null,
    summary: fields.summary ?? null,
    optionCount: fields.optionCount,
    waitingSince: fields.waitingSince ?? null,
  };
}

// The projection. `projectId` scopes to one product; omitted, it walks every project (the dock badge's
// cross-pipeline view). Read-only end to end.
export function getPendingInbox({ projectId } = {}, options = {}) {
  const scoped = projectId ?? null;

  // Resolve id → display name once, so every item can name its product without re-reading the catalog.
  const projectCatalog = (() => {
    try { return listProjects(options).projects; } catch { return []; }
  })();
  const nameById = new Map(projectCatalog.map((p) => [p.id, p.name]));

  const items = [];

  // 1. Operator sessions paused on a founder decision — gate, proposal, ideas, candidates, question,
  //    blocked, failed. listOperatorSessions gives summaries (status is here); the pending payloads live
  //    on the full doc, so we load it only for the sessions that are actually waiting.
  const summaries = listOperatorSessions({ ...options, projectId: scoped });
  for (const summary of summaries) {
    if (!DECISION_STATUSES.has(summary.status)) continue;
    let session;
    try { session = getOperatorSession(summary.id, options); } catch { continue; }
    // Re-check on the full doc — the summary can lag a just-resolved decision.
    if (!DECISION_STATUSES.has(session.status)) continue;
    const spec = KIND_BY_STATUS.get(session.status);
    const sessionProjectId = session.projectId ?? null;
    const graphId = (session.pendingGate?.graphId ?? session.graphId) || null;
    items.push(decisionItem({
      id: `${session.id}:${spec.kind}`,
      kind: spec.kind,
      projectId: sessionProjectId,
      projectName: sessionProjectId ? (nameById.get(sessionProjectId) ?? null) : null,
      pipelineId: graphId,
      pipelineName: pipelineNameFor(sessionProjectId, graphId, options),
      sessionId: session.id,
      title: session.goal || session.standingBrief || null,
      summary: summarizeSessionDecision(spec.kind, session),
      optionCount: optionCount(spec.kind, session),
      waitingSince: session.updatedAt,
    }));
  }

  // 2. Unrouted world-signals — captured, waiting for the founder to route or set aside. Inputs are
  //    stored per project, so gather across the scoped project or every project.
  const signalProjects = scoped
    ? [{ id: scoped, name: nameById.get(scoped) ?? null }]
    : projectCatalog.map((p) => ({ id: p.id, name: p.name }));
  for (const proj of signalProjects) {
    let unrouted;
    try { unrouted = listUnroutedInputs(proj.id, options); } catch { continue; }
    for (const input of unrouted) {
      const kindLabel = String(input.kind || "signal");
      const source = String(input.source || "").trim();
      items.push(decisionItem({
        id: `input:${proj.id}:${input.id}`,
        kind: "signal",
        projectId: proj.id,
        projectName: proj.name,
        sessionId: null,
        inputId: input.id,
        title: source ? `${kindLabel} from ${source}` : kindLabel,
        summary: "A world-signal came in — route it into a pipeline or set it aside",
        waitingSince: input.receivedAt ?? null,
      }));
    }
  }

  // Most-recently-waiting first, so a run that just reached the gate or died surfaces at the top.
  items.sort((a, b) => String(b.waitingSince || "").localeCompare(String(a.waitingSince || "")));

  const byKind = {};
  for (const item of items) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;

  return {
    projectId: scoped,
    total: items.length,
    byKind,
    decisions: items,
  };
}
