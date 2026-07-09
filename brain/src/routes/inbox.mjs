// The founder's pending-decision surfaces + cross-pipeline reads: which flows need you, the single
// pending inbox (global and project-scoped), the microproduct build-and-ship door, and the
// cross-reference / shared-kernel reads. Moved verbatim out of server.mjs.
import { json, readBody } from "./util.mjs";
import { getPendingInbox } from "../pending-inbox.mjs";
import { loadProject } from "../project-store.mjs";
import { findReferences, listSharedKernel } from "../cross-reference.mjs";
import { deriveFunnel, deriveNextObjects } from "../object-funnel.mjs";
import {
  createOperatorSession,
  listFlowsNeedingFounder,
  publicOperatorSession,
} from "../operator-store.mjs";
import { executeOperatorTool } from "../operator-runtime.mjs";

export default async function handle({ req, res, url }) {
  // "Which flows need you" — the read side of the Wall. Every operator session currently PAUSED at a
  // founder gate across this project (a goal thread and an ambient wake both surface here when their run
  // stops). Strictly READ-ONLY: it never approves, resolves, or advances a gate — it only tells the
  // founder where their approval is the blocker. Ordered most-recently-updated first.
  const projectNeedsYouMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/needs-you$/);
  if (req.method === "GET" && projectNeedsYouMatch) {
    try {
      const projectId = decodeURIComponent(projectNeedsYouMatch[1]);
      json(res, 200, { projectId, flows: listFlowsNeedingFounder({ projectId }) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // The single pending-decision inbox — everything waiting on the founder across EVERY product and
  // pipeline, in one list: runs staged at the gate, proposed graph edits, ideate pauses, candidate
  // pipeline picks, a blank re-prompt an operator is blocked on, blocked/dead runs, and unrouted
  // world-signals. A PROJECTION over durable state (operator sessions + input store), never a new
  // stored object. Read-only: it never approves, resolves, routes, or advances anything. With no
  // ?project= it spans all products (the dock badge's cross-pipeline view); ?project= scopes to one.
  if (req.method === "GET" && url.pathname === "/api/pending-inbox") {
    try {
      const projectId = url.searchParams.get("project") || undefined;
      json(res, 200, getPendingInbox({ projectId }));
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Project-scoped twin of the pending inbox, mirroring /board and /bench so an agent can read one
  // product's waiting decisions the same way. Same read-only projection, scoped to the project.
  const projectPendingInboxMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/pending-inbox$/);
  if (req.method === "GET" && projectPendingInboxMatch) {
    try {
      const projectId = decodeURIComponent(projectPendingInboxMatch[1]);
      json(res, 200, getPendingInbox({ projectId }));
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Microproduct build-and-ship door — the deployable twin of compose_and_run. It delegates to the
  // operator's compose_microproduct path: a read-only, scan-grounded producer cuts a working artifact
  // from the real product, the host composes a graph whose deploy step is an `execute` node behind a
  // founder `gate`, and the run STOPS at that gate. Nothing deploys: the deploy connector ships only with
  // BOTH the gate stamp AND an explicit founder deploy confirmation, neither of which this route can forge.
  // A goal is required — this is the founder input the door represents; without it we refuse.
  const projectMicroproductMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/microproduct$/);
  if (req.method === "POST" && projectMicroproductMatch) {
    try {
      const projectId = decodeURIComponent(projectMicroproductMatch[1]);
      const body = await readBody(req);
      const goal = String(body?.goal || "").trim();
      if (!goal) { json(res, 400, { error: "A microproduct needs a goal — what should the artifact do?" }); return true; }
      const project = loadProject({ projectId });
      const session = createOperatorSession({ goal, projectId: project.id });
      const result = await executeOperatorTool(session, { name: "compose_microproduct", input: { goal, title: body?.title } });
      json(res, 202, {
        session: publicOperatorSession(result.session),
        staged: result.result ?? null,
        pause: result.pause === true,
      });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Cross-reference index — "where does X appear across channels" for person / icp / claim / experiment.
  const projectReferencesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/references$/);
  if (req.method === "GET" && projectReferencesMatch) {
    try {
      const projectId = decodeURIComponent(projectReferencesMatch[1]);
      const kind = url.searchParams.get("kind");
      const id = url.searchParams.get("id");
      json(res, 200, findReferences(projectId, { kind, id }));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Funnel — Area 1's read-time projection over the touch ledger: every touched object grouped by kind ×
  // emergent advisory bucket (seen / in_flight / handled / suppressed). Derived on every read from touches
  // + outcome joins; no stored state. Read-only; honest-blind on a project nothing has touched yet.
  const projectFunnelMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/funnel$/);
  if (req.method === "GET" && projectFunnelMatch) {
    try {
      const projectId = decodeURIComponent(projectFunnelMatch[1]);
      json(res, 200, deriveFunnel(projectId));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Next objects — the objects a motion should look at next (seen or in-flight, not handled, not set
  // aside), newest first, optionally scoped to a kind. A strong steer, never a gate. Read-only.
  const projectNextObjectsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/next-objects$/);
  if (req.method === "GET" && projectNextObjectsMatch) {
    try {
      const projectId = decodeURIComponent(projectNextObjectsMatch[1]);
      const kind = url.searchParams.get("kind");
      const limitRaw = Number(url.searchParams.get("limit"));
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
      json(res, 200, deriveNextObjects(projectId, { kind, limit }));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Shared kernel — the project's real cross-pipeline object model in one read: durable People (with
  // their pipeline appearances + fatigue), the stated + founder-linked ICPs, and the structured Claims,
  // each pointing at the pipelines that carry it. Read-only; honest-blind on an empty project.
  const projectSharedMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/shared$/);
  if (req.method === "GET" && projectSharedMatch) {
    try {
      const projectId = decodeURIComponent(projectSharedMatch[1]);
      json(res, 200, listSharedKernel(projectId));
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
