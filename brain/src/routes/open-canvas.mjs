// Project-scoped HTTP integration for the open-canvas goal and work authorities. This surface owns
// persistence only: founder approval, release, execution, and other outward effects do not belong here.
import { loadProject } from "../project-store.mjs";
import { GoalConflictError, goalStore } from "../goal-store.mjs";
import { WorkArtifactConflictError, workArtifactStore } from "../work-artifact-store.mjs";
import { CanvasRegionConflictError, canvasRegionStore } from "../canvas-region-store.mjs";
import { CanvasStructureHistoryConflictError, canvasStructureHistoryStore } from "../canvas-structure-history.mjs";
import { detectGoalConflicts } from "../goal-conflicts.mjs";
import { GoalConflictDecisionConflictError, goalConflictDecisionStore } from "../goal-conflict-decision-store.mjs";
import { requestHasSessionToken } from "./session-guard.mjs";
import { authorizeFounderWriteForRequest } from "./session-guard.mjs";
import { normalizeCanvasProposal } from "../canvas-proposal.mjs";
import { json, readBody } from "./util.mjs";

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

function statusFor(error) {
  const detail = message(error);
  if (error instanceof GoalConflictError
    || error instanceof WorkArtifactConflictError
    || error instanceof CanvasRegionConflictError
    || error instanceof CanvasStructureHistoryConflictError
    || error instanceof GoalConflictDecisionConflictError
    || /^Stale\b/i.test(detail)
    || /idempotency key.+already used/i.test(detail)) return 409;
  if (Number.isInteger(error?.status)) return error.status;
  if (/Project not found/i.test(detail)
    || /Goal(?: relation)? not found/i.test(detail)
    || /Work (?:artifact|relationship) not found/i.test(detail)
    || /Canvas region not found/i.test(detail)
    || /Surfaced goal conflict not found/i.test(detail)
    || /belongs to project/i.test(detail)) return 404;
  return 400;
}

function publicMessage(error, status) {
  const detail = message(error);
  // A cross-project lookup is a not-found to the caller. Do not disclose which other project owns the id.
  if (status === 404 && /belongs to project/i.test(detail)) return "Record not found in this project.";
  return detail;
}

function includeRetired(url) {
  return url.searchParams.get("includeRetired") === "true";
}

function authorizeConflictDecisionForRequest(req) {
  const isAgent = String(req?.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase() === "agent";
  if (!isAgent && requestHasSessionToken(req)) return;
  const error = new Error(isAgent
    ? "Conflict resolution is founder-only. A model may inspect or propose a response, but cannot record the decision."
    : "Conflict resolution must come from the Drover page. This request carries no founder browser session.");
  error.code = "founder_decision_forbidden";
  error.status = 403;
  throw error;
}

function decoded(value, label) {
  try {
    const result = decodeURIComponent(value);
    if (!result) throw new Error();
    return result;
  } catch {
    throw new Error(`${label} is not a valid path identifier.`);
  }
}

function writeInput(req, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  const headerKey = String(req.headers["idempotency-key"] ?? "").trim();
  const bodyKey = String(body.idempotencyKey ?? "").trim();
  if (headerKey && bodyKey && headerKey !== bodyKey) {
    throw new Error("Idempotency-Key header and body idempotencyKey must match.");
  }
  const idempotencyKey = headerKey || bodyKey;
  if (!idempotencyKey) throw new Error("An idempotencyKey is required for writes.");
  return { ...body, idempotencyKey };
}

function requireRevision(input, field) {
  const value = input[field];
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return input;
}

function matchRoute(pathname) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/(goals|goal-relations|work-artifacts|work-relationships|canvas-regions|canvas-history|goal-conflict-decisions)(?:\/([^/]+))?(?:\/(history|status|branch|retire|restore|archive|reopen|apply-proposal))?$/);
  if (!match) return null;
  return {
    projectId: decoded(match[1], "projectId"),
    collection: match[2],
    recordId: match[3] ? decoded(match[3], "record id") : null,
    action: match[4] ?? null,
  };
}

function methodAllowed(route, method) {
  if (route.collection === "goal-conflict-decisions") {
    return (!route.recordId && !route.action && method === "GET")
      || (route.recordId && !route.action && method === "POST")
      || (route.recordId && route.action === "history" && method === "GET");
  }
  if (route.collection === "canvas-history") {
    return (!route.recordId && !route.action && method === "GET")
      || (!route.action && (route.recordId === "undo" || route.recordId === "redo") && method === "POST");
  }
  if (!route.recordId && !route.action) return method === "GET" || method === "POST";
  if (route.recordId && !route.action) {
    if (route.collection === "goals") return method === "GET" || method === "PATCH";
    if (route.collection === "goal-relations") return method === "GET" || method === "PATCH";
    return method === "GET" || method === "PATCH";
  }
  if (route.collection === "canvas-regions") {
    return route.recordId && (route.action === "archive" || route.action === "reopen") && method === "POST";
  }
  if (route.action === "history") {
    return (route.collection === "goal-relations" || route.collection === "work-artifacts" || route.collection === "work-relationships") && method === "GET";
  }
  if (route.action === "status") return route.collection === "goals" && method === "POST";
  if (route.action === "branch") return route.collection === "work-artifacts" && method === "POST";
  if (route.action === "apply-proposal") return route.collection === "work-artifacts" && method === "POST";
  if (route.action === "restore") {
    return (route.collection === "goals" || route.collection === "goal-relations" || route.collection === "work-artifacts" || route.collection === "work-relationships") && method === "POST";
  }
  return route.action === "retire" && method === "POST";
}

export function createOpenCanvasRoutes({
  projectReader = loadProject,
  goals = goalStore,
  work = workArtifactStore,
  regions = canvasRegionStore,
  structureHistory = canvasStructureHistoryStore,
  conflictDecisions = goalConflictDecisionStore,
  authorizeFounderDecision = authorizeConflictDecisionForRequest,
  optionsForProject = () => ({}),
} = {}) {
  return async function handle({ req, res, url }) {
    let route;
    try {
      route = matchRoute(url.pathname);
    } catch (error) {
      json(res, 400, { error: message(error) });
      return true;
    }
    if (!route) return false;
    // Once an API path matches this surface it must never fall through to the static-file handler.
    // A disallowed GET previously returned the SPA's index.html with status 200, which made typed
    // clients treat an invalid operation as a successful response.
    if (!methodAllowed(route, req.method)) {
      json(res, 405, { error: "Method not allowed." });
      return true;
    }

    const { projectId, collection, recordId, action } = route;
    try {
      const scoped = { ...(await optionsForProject(projectId, { req, url }) ?? {}), projectId };
      // Never omit projectId here: loadProject's no-argument behavior follows mutable active-project
      // state and would make an addressed route capable of reading or writing the wrong authority.
      await projectReader(scoped);

      if (req.method === "GET") {
        const options = { ...scoped, includeRetired: includeRetired(url) };
        if (collection === "goal-conflict-decisions" && action === "history") {
          json(res, 200, { history: conflictDecisions.history(projectId, recordId, options) });
        } else if (collection === "goal-conflict-decisions") {
          json(res, 200, conflictDecisions.list(projectId, options));
        } else if (collection === "canvas-history") {
          json(res, 200, structureHistory.list(projectId, options));
        } else if (collection === "goals") {
          if (!recordId) json(res, 200, { goals: goals.list(projectId, options) });
          else json(res, 200, { goal: goals.get(recordId, options) });
        } else if (collection === "goal-relations") {
          if (!recordId) json(res, 200, { relations: goals.listRelations(projectId, options) });
          else if (action === "history") {
            goals.getRelation(recordId, { ...options, includeRetired: true });
            json(res, 200, { history: goals.relationHistory(recordId, options) });
          } else json(res, 200, { relation: goals.getRelation(recordId, options) });
        } else if (collection === "work-artifacts" && !recordId) {
          json(res, 200, { artifacts: work.list(projectId, options), storeRevision: work.load(projectId, options).revision });
        } else if (collection === "work-artifacts" && action === "history") {
          work.get(projectId, recordId, { ...options, includeRetired: true });
          json(res, 200, { history: work.history(projectId, recordId, options) });
        } else if (collection === "work-artifacts") {
          json(res, 200, { artifact: work.get(projectId, recordId, options) });
        } else if (collection === "work-relationships" && !recordId) {
          json(res, 200, { relationships: work.listRelationships(projectId, options), storeRevision: work.load(projectId, options).revision });
        } else if (collection === "work-relationships" && action === "history") {
          work.getRelationship(projectId, recordId, { ...options, includeRetired: true });
          json(res, 200, { history: work.relationshipHistory(projectId, recordId, options) });
        } else if (collection === "work-relationships") {
          json(res, 200, { relationship: work.getRelationship(projectId, recordId, options) });
        } else if (!recordId) {
          json(res, 200, { regions: regions.list(projectId, { ...options, includeArchived: options.includeRetired }), storeRevision: regions.load(projectId, options).revision });
        } else {
          json(res, 200, { region: regions.get(projectId, recordId, { ...options, includeArchived: options.includeRetired }) });
        }
        return true;
      }

      const body = writeInput(req, await readBody(req));
      if (collection === "goal-conflict-decisions") {
        authorizeFounderDecision(req);
        requireRevision(body, "expectedStoreRevision");
        const surfaced = detectGoalConflicts({
          goals: goals.list(projectId, scoped),
          artifacts: work.list(projectId, scoped),
          workRelationships: work.listRelationships(projectId, scoped),
        }).find((conflict) => conflict.id === recordId);
        if (!surfaced) throw new Error(`Surfaced goal conflict not found in project ${projectId}: ${recordId}`);
        json(res, 200, conflictDecisions.record(projectId, surfaced, body, scoped));
      } else if (collection === "canvas-history") {
        requireRevision(body, "expectedHistoryRevision");
        const result = recordId === "undo"
          ? structureHistory.undo(projectId, body, scoped)
          : structureHistory.redo(projectId, body, scoped);
        json(res, 200, result);
      } else if (collection === "goals") {
        if (!recordId) {
          json(res, 201, { goal: goals.create({ ...body, projectId }, scoped) });
        } else if (action === "status") {
          requireRevision(body, "expectedRevision");
          if (typeof body.status !== "string" || !body.status.trim()) throw new Error("status is required.");
          json(res, 200, { goal: goals.changeStatus(recordId, body.status, { ...body, projectId }, scoped) });
        } else if (action === "retire") {
          requireRevision(body, "expectedRevision");
          json(res, 200, { goal: goals.retire(recordId, { ...body, projectId }, scoped) });
        } else if (action === "restore") {
          requireRevision(body, "expectedRevision");
          json(res, 200, { goal: goals.restore(recordId, { ...body, projectId }, scoped) });
        } else {
          requireRevision(body, "expectedRevision");
          json(res, 200, { goal: goals.revise(recordId, body, scoped) });
        }
      } else if (collection === "goal-relations") {
        if (!recordId) {
          json(res, 201, { relation: goals.createRelation({ ...body, projectId }, scoped) });
        } else if (action === "retire") {
          requireRevision(body, "expectedRevision");
          json(res, 200, { relation: goals.retireRelation(recordId, { ...body, projectId }, scoped) });
        } else if (action === "restore") {
          requireRevision(body, "expectedRevision");
          json(res, 200, { relation: goals.restoreRelation(recordId, { ...body, projectId }, scoped) });
        } else {
          requireRevision(body, "expectedRevision");
          json(res, 200, { relation: goals.reviseRelation(recordId, body, scoped) });
        }
      } else if (collection === "work-artifacts") {
        if (!recordId) {
          requireRevision(body, "expectedStoreRevision");
          json(res, 201, { artifact: work.create(projectId, body, scoped) });
        } else if (action === "branch") {
          requireRevision(body, "expectedArtifactRevision");
          json(res, 201, { artifact: work.branch(projectId, recordId, body, scoped) });
        } else if (action === "apply-proposal") {
          authorizeFounderWriteForRequest(req, "Applying a canvas proposal");
          requireRevision(body, "expectedArtifactRevision");
          const artifact = work.get(projectId, recordId, { ...scoped, includeRetired: false });
          if (artifact.revision !== body.expectedArtifactRevision) throw new WorkArtifactConflictError(`Stale artifact head revision: expected ${body.expectedArtifactRevision}, current ${artifact.revision}.`, { scope: "artifact head", actualRevision: artifact.revision });
          if (artifact.kind !== "canvas-change-proposal") throw new Error("This work artifact is not a canvas proposal.");
          if (artifact.status === "applied") { json(res, 200, { artifact, deduped: true }); return true; }
          if (artifact.status !== "proposed") throw new Error(`Canvas proposal cannot be applied from status ${artifact.status}.`);
          const proposal = normalizeCanvasProposal(artifact.content, projectId);
          const operation = proposal.operation;
          const actor = "founder";
          const structureKey = `${body.idempotencyKey}:structure`;
          let structure;
          if (operation.type === "create-region") {
            structure = structureHistory.applyRegion(projectId, "create", null, { ...operation, revisionAuthor: actor, idempotencyKey: structureKey }, scoped);
          } else if (operation.type === "update-region") {
            structure = structureHistory.applyRegion(projectId, "revise", operation.regionId, { ...operation.patch, expectedRevision: operation.expectedRevision, revisionAuthor: actor, idempotencyKey: structureKey }, scoped);
          } else {
            structure = structureHistory.applyLayout(projectId, operation.geometry, { expectedRevision: operation.expectedRevision, revisionAuthor: actor, idempotencyKey: structureKey }, scoped);
          }
          const applied = work.revise(projectId, recordId, {
            expectedArtifactRevision: artifact.revision,
            status: "applied",
            content: { ...proposal, appliedReceipt: { structureReceiptId: structure.receipt.id, appliedAt: new Date().toISOString() } },
            createdBy: { type: "founder", id: actor },
            idempotencyKey: `${body.idempotencyKey}:artifact`,
          }, scoped);
          json(res, 200, { artifact: applied, structureReceipt: structure.receipt, deduped: false });
        } else if (action === "retire") {
          requireRevision(body, "expectedArtifactRevision");
          json(res, 200, { artifact: work.retire(projectId, recordId, body, scoped) });
        } else if (action === "restore") {
          requireRevision(body, "expectedArtifactRevision");
          json(res, 200, { artifact: work.restore(projectId, recordId, body, scoped) });
        } else {
          requireRevision(body, "expectedArtifactRevision");
          json(res, 200, { artifact: work.revise(projectId, recordId, body, scoped) });
        }
      } else if (collection === "work-relationships" && !recordId) {
        requireRevision(body, "expectedStoreRevision");
        json(res, 201, { relationship: work.createRelationship(projectId, body, scoped) });
      } else if (collection === "work-relationships" && action === "retire") {
        requireRevision(body, "expectedRelationshipRevision");
        json(res, 200, { relationship: work.retireRelationship(projectId, recordId, body, scoped) });
      } else if (collection === "work-relationships" && action === "restore") {
        requireRevision(body, "expectedRelationshipRevision");
        json(res, 200, { relationship: work.restoreRelationship(projectId, recordId, body, scoped) });
      } else if (collection === "work-relationships") {
        requireRevision(body, "expectedRelationshipRevision");
        json(res, 200, { relationship: work.reviseRelationship(projectId, recordId, body, scoped) });
      } else if (!recordId) {
        requireRevision(body, "expectedStoreRevision");
        const result = structureHistory.applyRegion(projectId, "create", null, body, scoped);
        json(res, 201, { region: result.region, historyReceipt: result.receipt, historyRevision: result.history.revision });
      } else if (action === "archive") {
        requireRevision(body, "expectedRevision");
        const result = structureHistory.applyRegion(projectId, "archive", recordId, body, scoped);
        json(res, 200, { region: result.region, historyReceipt: result.receipt, historyRevision: result.history.revision });
      } else if (action === "reopen") {
        requireRevision(body, "expectedRevision");
        const result = structureHistory.applyRegion(projectId, "reopen", recordId, body, scoped);
        json(res, 200, { region: result.region, historyReceipt: result.receipt, historyRevision: result.history.revision });
      } else {
        requireRevision(body, "expectedRevision");
        const result = structureHistory.applyRegion(projectId, "revise", recordId, body, scoped);
        json(res, 200, { region: result.region, historyReceipt: result.receipt, historyRevision: result.history.revision });
      }
    } catch (error) {
      const status = statusFor(error);
      json(res, status, { error: publicMessage(error, status) });
    }
    return true;
  };
}

export default createOpenCanvasRoutes;
