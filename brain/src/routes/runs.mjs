// Compiled-run gate routes: reopen a staged gate, approve+release it through the engine, and promote a
// proven run into a repeatable motion. Moved verbatim out of server.mjs. The wall is untouched — only
// items the founder approved carry `approved`, and nothing sends on its own.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { runStore, marketObjectStore } from "../gtm-store.mjs";
import { gateReviewForRun, approveCompiledRun } from "../run-compile.mjs";
import { liveStepRuntime } from "../agent-bridge.mjs";
import { buildMarketContext } from "../market-research.mjs";
import { buildRunGrounding } from "../run-grounding.mjs";
import { createDerivedSourceLoader } from "../cross-reference.mjs";
import { promoteRun } from "../promote-motion.mjs";
import { authorizeReleaseForRequest } from "./session-guard.mjs";
import { authorizeGateRelease } from "../operator-run-core.mjs";

function promoteSummary(motion) {
  const cadence = (motion?.cadence ?? "").trim();
  if (cadence) {
    return `Turned this run into a repeating motion — it re-stages ${cadence} and still stops at your gate every time. Nothing sends on its own.`;
  }
  return "Turned this run into a repeatable motion. It keeps score, but only re-runs when you ask — nothing fires on its own.";
}

export default async function handle({ req, res, url }) {
  // Reopen a staged compiled run's founder gate. Pure read: projects the run's staged items into the
  // review cards the UI reopens (same gateReviewForRun the compile route returns), so a founder can come
  // back to a run staged earlier and decide it. It approves nothing and sends nothing.
  const projectRunGateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runs\/([^/]+)\/gate$/);
  if (req.method === "GET" && projectRunGateMatch) {
    try {
      const projectId = decodeURIComponent(projectRunGateMatch[1]);
      const runId = decodeURIComponent(projectRunGateMatch[2]);
      const run = runStore.get(runId, { projectId });
      json(res, 200, { projectId, ...gateReviewForRun(run) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Approve a staged compiled run at the founder gate and RELEASE it through the same engine (not a
  // parallel runtime). The founder's per-item decisions (approve / reject / edit) drive the gate; the
  // approved items continue downstream to the execute node, which stages them LOCALLY by default and
  // never sends. The wall is untouched — only items the founder approved carry `approved`, and the run
  // is persisted back onto the runStore record while recordRunDerivations fires the taste / people /
  // experiment / idea / outcome loop exactly as an operator run does.
  const projectRunApproveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runs\/([^/]+)\/approve$/);
  if (req.method === "POST" && projectRunApproveMatch) {
    try {
      const projectId = decodeURIComponent(projectRunApproveMatch[1]);
      const runId = decodeURIComponent(projectRunApproveMatch[2]);
      const body = (await readBody(req)) ?? {};
      const project = loadProject({ projectId });
      // This endpoint resolves a durable founder decision, even when every item is rejected. Require
      // both proofs before any run/gate state can change: a real Drover browser capability and an
      // owner/approver on the owning project's team. Request identity is authoritative; body fields
      // cannot impersonate another member.
      authorizeReleaseForRequest(req)();
      authorizeGateRelease({ projectId }, { request: req }, { projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const { run, gate, result } = await approveCompiledRun({
        projectId,
        runId,
        decisions: body.decisions && typeof body.decisions === "object" ? body.decisions : {},
        approvals: body.approvals && typeof body.approvals === "object" ? body.approvals : {},
        // The same runtime dependencies executeGraphRun assembles for an operator run, so a released
        // compiled run grounds on the researched buyer picture and product truths and runs its open steps.
        stepRuntime: liveStepRuntime({ cwd: repo }),
        market: buildMarketContext(marketObjectStore.list({ projectId })),
        grounding: buildRunGrounding(project),
        loadLastRunItems: createDerivedSourceLoader({ projectId }),
        authorizeRelease: authorizeReleaseForRequest(req),
        options: { projectId },
      });
      json(res, 200, { projectId, run, gate, ok: result.ok, pendingGates: result.pendingGates });
    } catch (err) {
      json(res, err?.code === "gate_release_forbidden" ? 403 : 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Promote a proven run into a repeatable motion (GTM-ENGINE-REBUILD Phase 6) — the founder's one
  // light touch. THE WALL IS UNTOUCHED: a promoted motion re-stages fresh runs at the founder gate on
  // cadence and never sends. An absent/unparseable cadence leaves the motion manual (fires only when
  // asked). This wraps a run that already worked; it never composes or sends anything.
  const projectRunPromoteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runs\/([^/]+)\/promote$/);
  if (req.method === "POST" && projectRunPromoteMatch) {
    try {
      const projectId = decodeURIComponent(projectRunPromoteMatch[1]);
      const runId = decodeURIComponent(projectRunPromoteMatch[2]);
      const body = await readBody(req);
      const { motion, learning } = promoteRun(runId, { cadence: body?.cadence ?? null }, { projectId });
      json(res, 200, { motion, learning, summary: promoteSummary(motion) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
