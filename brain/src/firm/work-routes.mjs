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
import { getVentureDoc, listVentureDocs, setVentureDoc } from "./venture-store.mjs";
import { buildArchitectureContext, buildWorkingTheoryContext } from "./architecture-context.mjs";
import { routeDirection } from "./direction-routing.mjs";
import { appendConversationMessage } from "./conversation.mjs";
import { fork } from "./bet.mjs";

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
    // Direction routing (§4A.1): an unscoped founder direction is claimed by the right teammate before
    // the drive begins. routeDirection is deterministic-first — it returns the SAME coordinator/first-
    // direct participant this route always fell back to, so scoped/targeted directions and the
    // deterministic cases are behavior-identical. Only a genuinely fuzzy multi-crew match uses the model
    // (deps.routingClassify, defaulted to null so nothing hits the network here); when it does, the
    // claim is made visible in the thread with a one-line why BEFORE work starts.
    const unscopedDirection = !primaryTeammateRef && !targetedTeammateRefs.length
      && !trimOrNull(body?.betId) && !trimOrNull(body?.branchFrom);
    let routedWhy = null;
    let teammateRef;
    if (unscopedDirection) {
      const routed = await routeDirection(
        { direction: body?.goal, configuration },
        { classify: deps.routingClassify },
      );
      teammateRef = routed.teammateRef
        ?? (configuration?.revision === 1 && configuration.agents.length === 0 ? "founding-teammate" : null);
      // Surface the claim only when routing genuinely chose among several lenses (the model path);
      // the deterministic coordinator/activation fallback keeps the prior silent behavior so existing
      // conversation ordering is unchanged.
      if (routed.usedModel) routedWhy = routed.why;
    } else {
      teammateRef = primaryTeammateRef
        ?? targetedTeammateRefs[0]
        ?? configuration.coordination.coordinatorRef
        ?? configuration.agents.find((agent) => agent.activation === "direct" || agent.activation === "direct-or-relevant")?.ref
        ?? (configuration?.revision === 1 && configuration.agents.length === 0 ? "founding-teammate" : null);
    }
    if (!teammateRef) {
      const error = new Error("This firm has no configured participant to take the direction.");
      error.status = 409;
      throw error;
    }
    if (routedWhy) {
      appendConversationMessage({ ventureId, role: "teammate", teammateRef, content: routedWhy }, {});
    }
    const configuredRefs = new Set(configuration.agents.map((agent) => agent.ref));
    const unknownRefs = requestedTeammateRefs.filter((ref) => !configuredRefs.has(ref));
    if (unknownRefs.length && !(configuration.revision === 1 && configuration.agents.length === 0 && unknownRefs.length === 1)) {
      const error = new Error(`These participants are not configured for this venture: ${unknownRefs.join(", ")}.`);
      error.status = 409;
      throw error;
    }
    if (body?.workRef && !body?.betId && !body?.branchFrom) {
      const error = new Error("Targeting durable work also needs its betId.");
      error.status = 400;
      throw error;
    }
    // "Try another approach" is a deterministic HTTP fork verb: branchFrom (or intent:"branch" with a
    // betId) seeds a genuinely distinct child bet from the named parent BEFORE the drive begins, so a
    // sibling is guaranteed rather than left to prompt-level phrasing inside the loop. The drive is then
    // scoped to the new child. This is the only place the route creates domain state, and it stays a
    // pure fork() + persist — the wall/decision seams are untouched.
    const requestedBranchFrom = trimOrNull(body?.branchFrom)
      ?? (String(body?.intent ?? "").trim().toLowerCase() === "branch" ? trimOrNull(body?.betId) : null);
    let branchedBetId = null;
    if (requestedBranchFrom) {
      const parentBet = getVentureDoc(ventureId, "bets", requestedBranchFrom);
      if (!parentBet) {
        const error = new Error(`No bet ${requestedBranchFrom} belongs to this venture to branch from.`);
        error.status = 404;
        throw error;
      }
      const branchIntent = trimOrNull(body?.goal) ?? `Try another approach to ${parentBet.intent}`;
      const child = fork(parentBet, branchIntent, {
        teammateRef,
        configurationRevision: configuration.revision,
      });
      setVentureDoc(ventureId, "bets", child.id, child);
      branchedBetId = child.id;
    }
    const betId = branchedBetId ?? trimOrNull(body?.betId);
    const workRef = branchedBetId ? null : trimOrNull(body?.workRef);
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
