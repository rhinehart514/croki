// The operation plan — the strategist READ (GTM-MACHINE.md Area 4). NOT a persisted domain object.
//
// GET  /api/operation-plan            regenerate the ranked motion plan on demand (founder-triggered)
// POST /api/operation-plan/edit       record a founder cut/keep/reorder in the EXISTING taste ledger
//
// The plan regenerates every read from: the product's full interpretive model (all eight layers via
// productLedGrounding — the plan path keeps ia/workflows/interactions/transitions the run path discards),
// the cited scan grounding, the live capability inventory (the same listCapabilities block composition
// builds), the founder's distilled taste, and the founder's PRIOR PLAN EDITS replayed from the taste
// ledger. There is no plan store: a founder cut/keep is banked as an IdeaKill/IdeaKeep FeedbackSignal
// (recordIdeaDecisions) — the same place gate decisions and idea decisions live — and the next read
// replays them so a cut motion is not re-proposed identically and a promoted one ranks higher.
//
// This route NEVER composes, runs, or gates. It is Door 1 (human HTTP); the brain MCP tool
// derive_operation_plan is an HTTP client to it, so this route exists first.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { getProductModel } from "../product-model-store.mjs";
import { productLedGrounding, buildRunGrounding } from "../run-grounding.mjs";
import { createClaudeMotionPlanner } from "../motion-plan.mjs";
import { listCapabilities } from "../artifact-store.mjs";
import { listWorkspaces, getWorkspace } from "../workspace.mjs";
import { recordIdeaDecisions, ideaTasteForProject } from "../feedback-ledger.mjs";
import { buildTasteProfile, buildDraftMemory, renderDraftMemory } from "../memory.mjs";
import { distillTaste, renderDistilledTaste } from "../taste-distill.mjs";
import { mergeSharedDecisions } from "../shared-judgments.mjs";

// The most-recent scan report + its timestamp, for the plan's grounding and its staleness flag. Honest
// null when nothing has been scanned — an ungrounded plan says so rather than implying a scan.
function latestScan() {
  try {
    const summary = listWorkspaces()[0];
    if (!summary) return { report: null, scannedAt: null };
    const workspace = getWorkspace(summary.id);
    return { report: workspace.report ?? null, scannedAt: workspace.updatedAt ?? summary.updatedAt ?? null };
  } catch {
    return { report: null, scannedAt: null };
  }
}

// The founder's distilled taste for the plan prompt, read the same way composition reads it. Null when
// the founder has taught nothing yet — an untrained founder adds no taste block. Best-effort.
function tasteFor(projectId) {
  try {
    const profile = buildTasteProfile(mergeSharedDecisions({}, {}), { ideaTaste: ideaTasteForProject(projectId) });
    return renderDistilledTaste(distillTaste(profile)) || null;
  } catch {
    return null;
  }
}

// The founder's PRIOR PLAN EDITS, replayed as a plain-text block from the taste ledger. A motion cut or
// kept earlier was banked as an IdeaKill/IdeaKeep, so ideaTasteForProject surfaces the killed/kept
// titles-and-angles the planner should not re-propose identically / should rank higher. Null on a fresh
// project. Best-effort — a read failure yields no block, never a broken plan.
function priorEditsFor(projectId) {
  try {
    return renderDraftMemory(buildDraftMemory(null, { ideaTaste: ideaTasteForProject(projectId) })) || null;
  } catch {
    return null;
  }
}

// Compute the founder-facing staleness flag: is the plan older than the last scan? True when a scan
// exists and it is newer than when the plan was generated. Pure comparison over ISO timestamps.
function isStale(generatedAt, scannedAt) {
  if (!scannedAt || !generatedAt) return false;
  return String(scannedAt) > String(generatedAt);
}

export default async function handle({ req, res, url }) {
  // Regenerate the plan on demand. Founder-triggered (GTM-MACHINE.md open decision #3: founder-triggered
  // + staleness flag, never auto-regenerate every scan). Optional ?goal= narrows the plan to a stated goal.
  if (req.method === "GET" && url.pathname === "/api/operation-plan") {
    try {
      const project = loadProject();
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const { report, scannedAt } = latestScan();
      const planner = createClaudeMotionPlanner({ cwd: repo });
      const { plan, meta } = await planner({
        goal: url.searchParams.get("goal") || project.sharedContext?.goal || "",
        productModel: productLedGrounding(getProductModel(project.id)),
        grounding: buildRunGrounding(project, report),
        capabilities: listCapabilities(),
        taste: tasteFor(project.id),
        priorEdits: priorEditsFor(project.id),
        scannedAt,
      });
      // The staleness flag is computed against the plan's OWN generatedAt — a plan generated now against
      // this scan is never stale; it only goes stale once a NEWER scan lands.
      json(res, 200, { plan: { ...plan, stale: isStale(plan.generatedAt, scannedAt) }, meta });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Record a founder edit to the plan — a cut, a keep, or a reorder promotion — in the EXISTING taste
  // ledger, so the next read replays it. No plan store: the edit is a FeedbackSignal, exactly as an idea
  // kill/keep is. Body: { decisions: [ { motion: {...}, decision: "kill" | "keep" }, ... ] }. A "reorder"
  // that promotes a motion is banked as a keep (it ranks that shape higher next read); a cut is a kill.
  if (req.method === "POST" && url.pathname === "/api/operation-plan/edit") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const rawDecisions = Array.isArray(body?.decisions) ? body.decisions : [];
      // Map a plan motion onto the idea-decision shape recordIdeaDecisions consumes: a motion's title is
      // its pitch, its kind is its angle, so extractIdeaTaste banks the cut/kept SHAPE the planner replays.
      const decisions = rawDecisions
        .map((entry) => {
          const motion = entry?.motion ?? entry;
          if (!motion || typeof motion !== "object") return null;
          const decision = entry?.decision === "kill" || entry?.decision === "keep" ? entry.decision
            : (entry?.decision === "promote" || entry?.decision === "reorder" ? "keep" : null);
          if (!decision) return null;
          return {
            idea: {
              id: motion.id ?? null,
              pitch: String(motion.title || motion.pitch || "").trim(),
              angle: typeof motion.kind === "string" ? motion.kind : null,
            },
            decision,
          };
        })
        .filter(Boolean);
      if (!decisions.length) { json(res, 400, { error: "An operation-plan edit needs at least one { motion, decision } with decision kill/keep/promote." }); return true; }
      recordIdeaDecisions({ projectId: project.id, decisions }, { projectId: project.id });
      json(res, 200, { recorded: decisions.length });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
