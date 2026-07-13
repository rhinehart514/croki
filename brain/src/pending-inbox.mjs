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
import { isReply } from "./reply-alert.mjs";
import { projectLoserMutations } from "./loser-mutation.mjs";
import { projectTriggerProposals } from "./trigger-proposal.mjs";
import { listWorkArtifacts } from "./work-artifact-store.mjs";

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
      const nodeIds = Array.isArray(session.pendingGate?.nodeIds) ? session.pendingGate.nodeIds : [];
      const runNodes = session.pendingGate?.runResult?.nodes ?? {};
      const items = nodeIds.reduce((count, nodeId) => {
        const staged = runNodes?.[nodeId]?.items;
        return count + (Array.isArray(staged) ? staged.length : 0);
      }, 0);
      if (items > 0) return `${items} staged item${items === 1 ? "" : "s"} ready to approve or reject`;
      return nodeIds.length > 0 ? "Staged and ready for your gate" : "Ready for your gate";
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
    proposalArtifactId: fields.proposalArtifactId ?? null,
    experimentId: fields.experimentId ?? null,
    pathId: fields.pathId ?? null,
    runId: fields.runId ?? null,
    lineage: fields.lineage ?? null,
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

  // 2. Unrouted world-signals — captured, waiting for the founder. Inputs are stored per project, so
  //    gather across the scoped project or every project. A captured input surfaces one of two ways:
  //      - a REAL REPLY pushes as a `reply-alert` — rail 5's decide-together moment (reply-alert.mjs).
  //        This is the ONE push the spec wants; a reply is not a quiet pull item, it brings the founder
  //        into a joint decision. It NEVER auto-replies — the item routes to the decide-together panel.
  //      - anything else stays a quiet `signal` pull item — route it into a pipeline or set it aside.
  //    A qualifying OUTSIDE TRIGGER appears once as a `trigger-proposal`, not again as a duplicate raw
  //    signal decision. The input remains in the durable log and is still inspectable; the founder gets
  //    one decision, which protects the experiment machine from becoming a decision-overload machine.
  const signalProjects = scoped
    ? [{ id: scoped, name: nameById.get(scoped) ?? null }]
    : projectCatalog.map((p) => ({ id: p.id, name: p.name }));
  for (const proj of signalProjects) {
    // Materialized proposals remain pending canvas decisions until the founder explicitly accepts or
    // rejects them. They must not disappear merely because the source input/loser stopped projecting.
    let materializedProposals = [];
    try {
      materializedProposals = listWorkArtifacts(proj.id, { ...options, includeRetired: false })
        .filter((artifact) => artifact.kind === "experiment-proposal" && artifact.status === "proposed");
    } catch { /* no proposal store yet */ }
    for (const artifact of materializedProposals) {
      const experiment = artifact.content ?? {};
      const trigger = experiment.bornFrom?.id ? experiment.bornFrom : null;
      const loserId = experiment.mutatedFrom ?? null;
      const variant = Boolean(loserId);
      items.push(decisionItem({
        id: `experiment-proposal:${proj.id}:${artifact.artifactId}`,
        kind: variant ? "variant-proposal" : "trigger-proposal",
        projectId: proj.id,
        projectName: proj.name,
        inputId: trigger?.type === "input" ? trigger.id : null,
        proposalArtifactId: artifact.artifactId,
        experimentId: experiment.id ?? null,
        lineage: trigger ?? (loserId ? { type: "experiment", id: loserId } : null),
        title: experiment.intent ?? artifact.title ?? "Experiment proposal",
        summary: variant
          ? "This editable variant is waiting for your accept, edit, or reject decision. Accepting stages a runnable run; nothing crosses the outward wall."
          : "This editable trigger-born experiment is waiting for your accept, edit, or reject decision. Accepting stages a runnable run; nothing crosses the outward wall.",
        waitingSince: artifact.updatedAt ?? artifact.createdAt ?? null,
      }));
    }

    let unrouted;
    try { unrouted = listUnroutedInputs(proj.id, options); } catch { continue; }
    let triggerProposals;
    try { triggerProposals = projectTriggerProposals({ projectId: proj.id }, options); } catch { triggerProposals = []; }
    const triggerByInputId = new Map(triggerProposals.map((proposal) => [proposal.input.id, proposal]));
    for (const input of unrouted) {
      const kindLabel = String(input.kind || "signal");
      const source = String(input.source || "").trim();
      const reply = isReply(input);
      const triggerProposal = reply ? null : triggerByInputId.get(input.id);
      const kind = reply ? "reply-alert" : triggerProposal ? "trigger-proposal" : "signal";
      items.push(decisionItem({
        id: triggerProposal ? `trigger-proposal:${proj.id}:${input.id}` : `input:${proj.id}:${input.id}`,
        kind,
        projectId: proj.id,
        projectName: proj.name,
        sessionId: null,
        inputId: input.id,
        proposalArtifactId: triggerProposal?.artifactId ?? null,
        experimentId: triggerProposal?.experiment?.id ?? null,
        lineage: triggerProposal ? triggerProposal.experiment.bornFrom ?? null : null,
        title: triggerProposal?.experiment?.intent ?? (source ? `${kindLabel} from ${source}` : kindLabel),
        summary: reply
          ? "A real reply came back — decide together how to follow through. Nothing sends until you say so."
          : triggerProposal
            ? "An outside trigger landed. Open one editable experiment proposal from it; nothing runs until you greenlight."
            : "A world-signal came in — route it into a pipeline or set it aside",
        waitingSince: input.receivedAt ?? null,
      }));
    }

    // 2b. Mutation-from-a-loser (loser-mutation.mjs). A bet the FOUNDER killed
    //     surfaces a VARIANT PROPOSAL — a new open experiment mutated off the loser, one dimension
    //     varied — for the founder to greenlight. Projection only: the loser is never touched, the
    //     variant is never run. Only surfaced when a variant has not already been proposed.
    let loserMutations;
    try { loserMutations = projectLoserMutations({ projectId: proj.id }, options); } catch { loserMutations = []; }
    for (const { loser, variant, artifactId } of loserMutations) {
      items.push(decisionItem({
        id: `variant-proposal:${proj.id}:${loser.id}`,
        kind: "variant-proposal",
        projectId: proj.id,
        projectName: proj.name,
        sessionId: null,
        inputId: null,
        proposalArtifactId: artifactId,
        experimentId: variant.id ?? null,
        lineage: { type: "experiment", id: loser.id },
        title: variant.intent ?? "Variant off a dead bet",
        summary: "You ended a bet. Open an editable variant proposal, shape it with the crew, then greenlight it if it is worth running. The old bet stays as you left it.",
        waitingSince: loser.verdict?.decidedAt ?? null,
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
