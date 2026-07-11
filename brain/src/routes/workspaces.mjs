// Durable GTM workspaces + the read-only scan and the code-repair build. Moved verbatim out of
// server.mjs. Scanning is read-only by construction; a revision build stops before commit/push/deploy.
import { json, readBody, expandHome } from "./util.mjs";
import { buildTrackingFix } from "../build.mjs";
import { scanRepo } from "../scan.mjs";
import { groundProjectInWorkspace } from "../project-store.mjs";
import {
  addDecision,
  addRevision,
  getWorkspace,
  listWorkspaces,
  openWorkspace,
  rescanWorkspace,
  updateRevision,
} from "../workspace.mjs";
import {
  applyRevision,
  createRevision,
  inspectApplyReadiness,
  reviewRevision,
  revertRevision,
} from "../revision.mjs";
import { authorizeFounderWriteForRequest } from "./session-guard.mjs";

export default async function handle({ req, res, url }) {
  // Durable GTM workspaces
  if (req.method === "GET" && url.pathname === "/api/workspaces") {
    json(res, 200, { workspaces: listWorkspaces() }); return true;
  }

  if (req.method === "POST" && url.pathname === "/api/workspaces/open") {
    try {
      const body = await readBody(req);
      const workspace = openWorkspace(expandHome(body.repoPath), body.outcome || body.winEvent);
      groundProjectInWorkspace(workspace);
      json(res, 200, { workspace });
    } catch (err) { json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  const workspaceMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (req.method === "GET" && workspaceMatch) {
    try { json(res, 200, { workspace: getWorkspace(workspaceMatch[1]) }); }
    catch (err) { json(res, 404, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  const rescanMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/rescan$/);
  if (req.method === "POST" && rescanMatch) {
    try {
      const workspace = rescanWorkspace(rescanMatch[1]);
      groundProjectInWorkspace(workspace);
      json(res, 200, { workspace });
    }
    catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  const revisionsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions$/);
  if (req.method === "POST" && revisionsMatch) {
    try {
      const workspace = getWorkspace(revisionsMatch[1]);
      if (!workspace.report.gaps?.some((gap) => gap.status === "proven")) {
        throw new Error("A proven repository gap is required before creating a change set.");
      }
      const revision = await createRevision(workspace);
      json(res, 200, {
        workspace: addRevision(workspace.id, revision),
        revision,
        error: revision.error,
      });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  const reviewMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions\/([^/]+)\/review$/);
  if (req.method === "POST" && reviewMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Code review");
      const body = await readBody(req);
      const workspace = updateRevision(
        reviewMatch[1],
        reviewMatch[2],
        (revision) => reviewRevision(revision, body.decision, body.note),
      );
      const reviewed = workspace.revisions.find((revision) => revision.id === reviewMatch[2]);
      const withDecision = addDecision(workspace.id, {
        type: "revision_review",
        revisionId: reviewMatch[2],
        decision: body.decision,
        note: String(body.note || "").trim(),
        summary: `${body.decision === "approve" ? "Approved" : "Rejected"} ${reviewMatch[2]}.`,
      });
      json(res, 200, { workspace: withDecision, revision: reviewed });
    } catch (err) { json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  const readinessMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions\/([^/]+)\/readiness$/);
  if (req.method === "GET" && readinessMatch) {
    try {
      const workspace = getWorkspace(readinessMatch[1]);
      const revision = workspace.revisions.find((item) => item.id === readinessMatch[2]);
      if (!revision) throw new Error(`Revision not found: ${readinessMatch[2]}`);
      json(res, 200, { readiness: inspectApplyReadiness(workspace, revision) });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  const revisionActionMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions\/([^/]+)\/(apply|revert)$/);
  if (req.method === "POST" && revisionActionMatch) {
    try {
      authorizeFounderWriteForRequest(req, revisionActionMatch[3] === "apply" ? "Applying a code change" : "Reverting a code change");
      const body = await readBody(req);
      const workspace = getWorkspace(revisionActionMatch[1]);
      const revision = workspace.revisions.find((item) => item.id === revisionActionMatch[2]);
      if (!revision) throw new Error(`Revision not found: ${revisionActionMatch[2]}`);
      const action = revisionActionMatch[3];
      const nextRevision = action === "apply"
        ? applyRevision(workspace, revision, body.confirm === true)
        : revertRevision(workspace, revision, body.confirm === true);
      const updated = updateRevision(workspace.id, revision.id, () => nextRevision);
      const withDecision = addDecision(updated.id, {
        type: `revision_${action}`,
        revisionId: revision.id,
        decision: action,
        summary: `${action === "apply" ? "Applied" : "Reverted"} ${revision.id}.`,
      });
      json(res, 200, { workspace: withDecision, revision: nextRevision });
    } catch (err) { json(res, Number.isInteger(err?.status) ? err.status : 409, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  // Funnel scan — PREVIEW ONLY. This route shows what the scan found BEFORE a
  // project is created or composed. It is read-only by construction: scanRepo is
  // read-only and nothing here persists. Project creation is the separate confirm
  // step (POST /api/projects). Do NOT add a project-creation side effect here.
  if (req.method === "POST" && url.pathname === "/api/scan") {
    try {
      const body = await readBody(req);
      const report = scanRepo(expandHome(body.repoPath), {
        winEvent: typeof body.winEvent === "string" && body.winEvent.trim() ? body.winEvent.trim() : "project_created",
      });

      // Project the scan report into the named front-door preview contract. These
      // fields are derived from the report (never invented) so the UI lane has a
      // stable shape; the full unflattened `report` rides along for everything else.
      const winFound = report.winEvent?.found === true;
      const attributionCaptured = report.attribution?.captured === true;
      // file:line evidence citations for the detected win event.
      const winEventEvidence = report.winEvent?.citations ?? [];
      // Honest blind-attribution state: blind when the win event is unproven, or
      // proven but emitted with no captured acquisition source. The reason mirrors
      // the scanner's own headline logic so the preview can never disagree with it.
      const blindAttribution = !winFound
        ? { blind: true, reason: `The win event “${report.winEvent?.name}” could not be confirmed in production code.` }
        : !attributionCaptured
          ? { blind: true, reason: `“${report.winEvent?.name}” is emitted, but no acquisition source is captured to attribute it.` }
          : { blind: false, reason: `“${report.winEvent?.name}” carries ${report.winEvent.attributionProperties.join(", ") || "no attribution properties"}.` };
      // One honest plain-language line about the product, derived from real scan
      // signal (detected stack + files scanned) — no invented traction or claims.
      const productLine = report.stack?.length
        ? `${report.stack.join(", ")} project, ${report.filesScanned} files scanned.`
        : `${report.filesScanned} files scanned; no framework manifest detected.`;

      json(res, 200, {
        headline: report.headline,
        stack: report.stack,
        winEvent: report.winEvent,
        winEventEvidence,
        blindAttribution,
        productLine,
        // The full grounded report, unflattened, for any field the lane also needs
        // (analytics, attribution, funnel stages/edges, gaps, citations).
        report,
      });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  // Code repair
  if (req.method === "POST" && url.pathname === "/api/build") {
    try {
      const body = await readBody(req);
      if (!body.report || typeof body.report !== "object") throw new Error("A grounded scan report is required.");
      const result = await buildTrackingFix(body.report);
      json(res, result.ok ? 200 : 422, result);
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  return false;
}
