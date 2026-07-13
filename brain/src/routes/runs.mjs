// Compiled-run gate routes: reopen a staged gate, approve+release it through the engine, and promote a
// proven run into a repeatable motion. Moved verbatim out of server.mjs. The wall is untouched — only
// items the founder approved carry `approved`, and nothing sends on its own.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { runStore, marketObjectStore } from "../gtm-store.mjs";
import { gateReviewForRun, approveCompiledRun, greenlightRun, getRunScoped } from "../run-compile.mjs";
import { OUTWARD_RELEASE } from "../graph.mjs";
import { defaultSendRunners } from "../connectors/execute/gmail-transport.mjs";
import { isFounderPresent } from "../presence.mjs";
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
      // Venture-scoped read (FIX 4): a run from another venture fails closed as not-found here, so
      // /projects/A/runs/<B-run>/gate never exposes venture B's staged work.
      const run = getRunScoped(runId, projectId, {});
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
        // Match the operator and raw-graph approval paths: a persisted compiled graph with a Gmail execute
        // node receives the host's live transport map when the founder approves it. The gate decision and
        // OUTWARD_RELEASE capability below remain the WHETHER; these runners provide only the HOW.
        sendRunners: defaultSendRunners(),
        // The away / unattended hold: pass live presence so the gate connector holds an unattended
        // standing-autonomy auto-approval on outward sends. A live founder approving here is present
        // (their browser heartbeats), so this never adds friction to a real approval.
        founderPresent: isFounderPresent(),
        // RAIL 1 — the outward-release capability. This IS the founder outward-approval path (it passed the
        // two-factor browser+owner guard above), so it carries the host-issued token that lets an approved
        // item actually leave via a real connector. Greenlight, ambient, and composition never carry it.
        outwardRelease: OUTWARD_RELEASE,
        options: { projectId },
      });
      json(res, 200, { projectId, run, gate, ok: result.ok, pendingGates: result.pendingGates });
    } catch (err) {
      const status = err?.code === "gate_release_forbidden" ? 403 : err?.code === "run_not_in_venture" ? 404 : 400;
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Greenlight a staged experiment to RUN its internal/prep work — one founder click, distinct from the
  // outward gate above. This sets the experiment running (its local/prep steps release through the same
  // engine) while every genuinely-outward step (send/publish/deploy/charge) STAYS pending at the founder
  // gate exactly as today. Greenlight never approves an outward item — the wall is untouched. It is still
  // a founder-only browser act (same two-factor guard as approve): a staged experiment does not start
  // itself, and an agent/MCP session cannot start it.
  const projectRunGreenlightMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runs\/([^/]+)\/greenlight$/);
  if (req.method === "POST" && projectRunGreenlightMatch) {
    try {
      const projectId = decodeURIComponent(projectRunGreenlightMatch[1]);
      const runId = decodeURIComponent(projectRunGreenlightMatch[2]);
      const project = loadProject({ projectId });
      // Greenlight releases internal/prep work, so it is a durable founder decision — require the same
      // browser+owner proofs as an approval. (It cannot cross the wall, but it does change run state.)
      authorizeReleaseForRequest(req)();
      authorizeGateRelease({ projectId }, { request: req }, { projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const { run, gate, result, greenlight } = await greenlightRun({
        projectId,
        runId,
        stepRuntime: liveStepRuntime({ cwd: repo }),
        market: buildMarketContext(marketObjectStore.list({ projectId })),
        grounding: buildRunGrounding(project),
        loadLastRunItems: createDerivedSourceLoader({ projectId }),
        authorizeRelease: authorizeReleaseForRequest(req),
        founderPresent: isFounderPresent(),
        options: { projectId },
      });
      json(res, 200, { projectId, run, gate, greenlight, ok: result.ok, pendingGates: result.pendingGates });
    } catch (err) {
      const status = err?.code === "gate_release_forbidden" ? 403 : err?.code === "run_not_in_venture" ? 404 : 400;
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
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
      // Preserve venture isolation on promotion too: validate the URL-scoped run before handing its id to
      // promoteRun, whose storage path predates venture-scoped route reads. Cross-venture access is a 404.
      getRunScoped(runId, projectId, {});
      const { motion, learning } = promoteRun(runId, { cadence: body?.cadence ?? null }, { projectId });
      json(res, 200, { motion, learning, summary: promoteSummary(motion) });
    } catch (err) {
      const status = err?.code === "run_not_in_venture" ? 404 : 400;
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
