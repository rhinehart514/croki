// work-routes.mjs — the firm's inward-work HTTP surface (thin; venture-scoped; fails closed).
//
// GET the passive venture conversation, or POST one drive of driveTeammate (F2's work-loop.mjs) — the
// only route in the firm core that starts or resumes a teammate. An agent-stamped drive remains an
// allowed inward act; an unstamped request must carry desktop founder authority before its direction
// can be attributed to the founder. Either kind of drive can only stage local work
// (fork bets, stage drafts/evidence) and, for anything that would touch the world, park at the wall
// (F3) — it can never release, decide, kill, or set heat. That is the wall's own construction (this
// route adds no capability of its own), so it is safe for the MCP agent door (mcp-tools.mjs) to reach
// unattended, exactly like fork_product_bet already is at product-routes.mjs's own stage endpoint.
//
// The transcript read adds no capability. The POST stamps who supplied the direction so chat never
// attributes an MCP/agent-authored goal to the founder.
import { json, readBody } from "../routes/util.mjs";
import { driveTeammate } from "./work-loop.mjs";
import { listConversation } from "./conversation.mjs";
import { getFirmConfiguration } from "./configuration.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { abortActiveDrive, listActiveDrives } from "./active-drives.mjs";
import { getVentureDoc, listVentureDocs } from "./venture-store.mjs";
import { buildArchitectureContext, buildWorkingTheoryContext } from "./architecture-context.mjs";

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function durableWorkRefs(ventureId, bet) {
  const refs = new Set();
  const remember = (value) => {
    const ref = trimOrNull(value);
    if (ref) refs.add(ref);
  };
  for (const item of [...(bet.staged ?? []), ...(bet.evidence ?? [])]) remember(item?.id);
  for (const item of listVentureDocs(ventureId, "decisions")) {
    if (item?.betId !== bet.id) continue;
    remember(item.id);
    remember(item.workRef);
  }
  for (const outcome of listVentureDocs(ventureId, "outcomes")) {
    if (outcome?.betId !== bet.id) continue;
    remember(outcome.id);
    remember(outcome.workRef);
  }
  return refs;
}

export default async function handle({ req, res, url, deps = {} }) {
  const activeMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/drives\/active$/);
  if (req.method === "GET" && activeMatch) {
    const ventureId = decodeURIComponent(activeMatch[1]);
    try {
      getFirmConfiguration(ventureId);
      json(res, 200, { drives: listActiveDrives(ventureId) });
    } catch (err) {
      const status = err?.code === "venture_not_found" ? 404 : (Number.isInteger(err?.status) ? err.status : 400);
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const abortMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/drives\/([^/]+)\/abort$/);
  if (req.method === "POST" && abortMatch) {
    const ventureId = decodeURIComponent(abortMatch[1]);
    const driveId = decodeURIComponent(abortMatch[2]);
    try {
      authorizeFounderWriteForRequest(req, "Stopping current work");
      getFirmConfiguration(ventureId);
      json(res, 200, { drive: abortActiveDrive({ ventureId, driveId }) });
    } catch (err) {
      const status = err?.code === "venture_not_found" ? 404 : (Number.isInteger(err?.status) ? err.status : 400);
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const conversationMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/conversation$/);
  if (req.method === "GET" && conversationMatch) {
    try {
      const ventureId = decodeURIComponent(conversationMatch[1]);
      json(res, 200, { messages: listConversation(ventureId) });
    } catch (err) {
      const status = err?.code === "venture_not_found" ? 404 : (Number.isInteger(err?.status) ? err.status : 400);
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const driveMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/drive$/);
  if (req.method !== "POST" || !driveMatch) return false;
  const ventureId = decodeURIComponent(driveMatch[1]);

  try {
    const initiatedByAgent = String(req.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase() === "agent";
    if (!initiatedByAgent) authorizeFounderWriteForRequest(req, "Giving the firm direction");
    const body = await readBody(req);
    const configuration = getFirmConfiguration(ventureId);
    const primaryTeammateRef = trimOrNull(body?.teammateRef);
    const targetedTeammateRefs = [...new Set(
      (Array.isArray(body?.teammateRefs) ? body.teammateRefs : [])
        .map(trimOrNull)
        .filter(Boolean),
    )];
    const requestedTeammateRefs = [...new Set([
      primaryTeammateRef,
      ...targetedTeammateRefs,
    ].filter(Boolean))];
    const teammateRef = primaryTeammateRef
      ?? targetedTeammateRefs[0]
      ?? configuration.coordination.coordinatorRef
      ?? configuration.agents.find((agent) => agent.activation === "direct" || agent.activation === "direct-or-relevant")?.ref
      ?? (configuration?.revision === 1 && configuration.agents.length === 0 ? "founding-teammate" : null);
    if (!teammateRef) {
      const error = new Error("This firm has no configured participant to take the direction.");
      error.status = 409;
      throw error;
    }
    const configuredRefs = new Set(configuration.agents.map((agent) => agent.ref));
    const unknownRefs = requestedTeammateRefs.filter((ref) => !configuredRefs.has(ref));
    if (unknownRefs.length && !(configuration.revision === 1 && configuration.agents.length === 0 && unknownRefs.length === 1)) {
      const error = new Error(`These participants are not configured for this venture: ${unknownRefs.join(", ")}.`);
      error.status = 409;
      throw error;
    }
    if (body?.workRef && !body?.betId) {
      const error = new Error("Targeting durable work also needs its betId.");
      error.status = 400;
      throw error;
    }
    const betId = trimOrNull(body?.betId);
    const workRef = trimOrNull(body?.workRef);
    const architectureId = trimOrNull(body?.architectureTarget?.id ?? body?.architectureId);
    const architectureStepId = trimOrNull(body?.architectureTarget?.stepId ?? body?.architectureStepId);
    const requestedArchitectureRevision = Number.isInteger(body?.architectureTarget?.revision)
      ? body.architectureTarget.revision
      : null;
    const theoryId = trimOrNull(body?.theoryTarget?.theoryId ?? body?.theoryId);
    const theorySubjectId = trimOrNull(body?.theoryTarget?.subjectId ?? body?.theorySubjectId);
    const theoryRelationshipId = trimOrNull(body?.theoryTarget?.relationshipId ?? body?.theoryRelationshipId);
    if (theorySubjectId && theoryRelationshipId) {
      const error = new Error("A direction can focus one provisional theory subject or relationship, not both.");
      error.status = 400;
      throw error;
    }
    if (architectureId && (theorySubjectId || theoryRelationshipId)) {
      const error = new Error("A direction can focus durable architecture or one provisional theory claim, not both.");
      error.status = 400;
      throw error;
    }
    const architectureContext = architectureId
      ? buildArchitectureContext(ventureId, { id: architectureId, stepId: architectureStepId, revision: requestedArchitectureRevision })
      : null;
    const theoryContext = theorySubjectId || theoryRelationshipId
      ? buildWorkingTheoryContext(ventureId, { theoryId, subjectId: theorySubjectId, relationshipId: theoryRelationshipId })
      : null;
    if (betId) {
      const bet = getVentureDoc(ventureId, "bets", betId);
      if (!bet) {
        const error = new Error(`No bet ${betId} belongs to this venture.`);
        error.status = 404;
        throw error;
      }
      if (workRef && !durableWorkRefs(ventureId, bet).has(workRef)) {
        const error = new Error(`No durable work ${workRef} belongs to bet ${betId}.`);
        error.status = 409;
        throw error;
      }
    }
    const result = await driveTeammate({
      ventureId,
      teammateRef,
      goal: body?.goal,
      betId,
      runtime: body?.runtime ?? null,
      model: body?.model ?? null,
      initiatedBy: initiatedByAgent ? "agent" : "founder",
      target: {
        betId,
        workRef,
        architectureId,
        architectureStepId,
        architectureRevision: architectureContext?.architectureRevision ?? null,
        theoryId: theoryContext?.theoryId ?? null,
        theorySubjectId: theoryContext?.selectionKind === "subject" ? theoryContext.selected.id : null,
        theoryRelationshipId: theoryContext?.selectionKind === "relationship" ? theoryContext.selected.id : null,
        teammateRefs: targetedTeammateRefs,
      },
      deps,
    });
    json(res, 200, {
      outcome: result.outcome,
      work: result.work,
      runtime: result.runtime,
      messages: result.messages,
      handoff: result.handoff,
      completion: result.completion,
    });
  } catch (err) {
    json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
  }
  return true;
}
