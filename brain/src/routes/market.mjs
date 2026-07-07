// Market research rituals — the buyer-side twin of scanning the repo: the whole-picture research, the
// per-layer steerable research, and persisting one picked layer candidate. Moved verbatim out of
// server.mjs. Read-only against the outside world: it researches and stores; it never sends.
import { json, readBody, expandHome } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { buildRunGrounding } from "../run-grounding.mjs";
import { marketObjectStore, persistProductTruthsFromScan } from "../gtm-store.mjs";
import { selectRuntime } from "../runtimes/index.mjs";
import { scanRepo } from "../scan.mjs";
import {
  runMarketResearch,
  createClaudeMarketResearcher,
  researchMarketLayer,
  createClaudeMarketLayerResearcher,
  founderInputsFromSharedContext,
} from "../market-research.mjs";

// ── Founder-register summary for the market-research ritual ───────────────────────────────────────
// No engine word (solidity, composite, joinKey) reaches this — the store's labels are translated to
// how-solid English here.
function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function marketResearchSummary(project, objects, meta = {}) {
  const name = project?.name || "your product";
  if (!objects.length) {
    return meta.blank
      ? `No live research ran, so nothing was added to the buyer picture for ${name} yet. Connect Claude and run it again.`
      : `Research ran but found nothing solid to add to the buyer picture for ${name} yet.`;
  }
  const backed = objects.filter((o) => ["observed", "researched"].includes(String(o.solidity))).length;
  const guesses = objects.filter((o) => String(o.solidity) === "speculative").length;
  const parts = [`Built the buyer picture for ${name}: ${plural(objects.length, "thing")} now known about who buys, why, and where they are`];
  if (backed) parts.push(`${backed} backed by a real source`);
  if (guesses) parts.push(`${guesses} still a hypothesis to confirm`);
  return `${parts.join(" — ")}.`;
}

// Ground the ProductTruth side from the project's own scanned repo, so the GTM map and the path
// portfolio rest on BOTH truths (product facts + market objects) instead of "0 product facts". Runs
// the same read-only scan the front door uses, adapts its cited claims into ProductTruth records, and
// persists any not already stored. Best-effort and idempotent: no configured repo, or a scan error,
// leaves the store as it was — grounding must never block or slow the research/generate ritual.
function groundProductTruthsForProject(project, projectId) {
  const repoPath = project?.sharedContext?.repository?.repo;
  if (!repoPath) return { created: [], skipped: 0, scanned: false };
  try {
    const winEvent = project.sharedContext.repository.outcome || "project_created";
    const report = scanRepo(expandHome(repoPath), { winEvent });
    return { ...persistProductTruthsFromScan(report, { projectId }), scanned: true };
  } catch {
    return { created: [], skipped: 0, scanned: false };
  }
}

export default async function handle({ req, res, url }) {
  // Market research ritual — the buyer-side twin of scanning the repo (GTM-ENGINE-REBUILD Phase 1).
  // The founder invokes it for a project; rented intelligence host-side (like derive_product_model)
  // researches who buys and where they gather and persists the MarketObjects, then a plain-language
  // summary comes back. Honest-blank when no live Claude is connected — it never fabricates a buyer.
  // Read-only against the outside world: it researches and stores; it never sends, publishes, or charges.
  const projectMarketResearchMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/market-research$/);
  if (req.method === "POST" && projectMarketResearchMatch) {
    try {
      const projectId = decodeURIComponent(projectMarketResearchMatch[1]);
      const project = loadProject({ projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      // Ground the PRODUCT-truth side from the scan while researching the buyer side, so the map rests
      // on both truths (product facts + market objects), not "0 product facts". Best-effort, idempotent.
      groundProductTruthsForProject(project, projectId);
      const grounding = buildRunGrounding(project);
      const founderInputs = founderInputsFromSharedContext(project.sharedContext);
      const connected = !!selectRuntime({}).adapter;
      const { ok, objects, meta } = await runMarketResearch({
        // Live generator when Claude is connected; the module's honest-blank default otherwise.
        generator: connected ? createClaudeMarketResearcher({ cwd: repo }) : undefined,
        projectId,
        grounding,
        founderInputs,
      });
      json(res, 200, {
        projectId,
        ok,
        objects,
        count: objects.length,
        summary: marketResearchSummary(project, objects, meta),
        meta: { ...meta, connected },
      });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Per-layer market research — the steerable twin of the whole-picture ritual above. Instead of the
  // model guessing every buyer facet at once, the founder builds the picture ONE kind at a time: this
  // researches candidates for the NEXT kind only, grounded on the kinds already settled (their picks so
  // far). It returns a spread the founder chooses between and PERSISTS NOTHING — the pick alone reaches
  // the store, through the same market-research persistence path, and shows up as a domain:"market" node.
  // Read-only against the outside world, exactly like run_market_research: it researches, never sends.
  const projectMarketLayerMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/market-layer$/);
  if (req.method === "POST" && projectMarketLayerMatch) {
    try {
      const projectId = decodeURIComponent(projectMarketLayerMatch[1]);
      const body = await readBody(req);
      const project = loadProject({ projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      // The founder's already-settled picks ground the next layer. Default to what is stored when the
      // caller sends nothing, so the next facet rests on the picture built so far. `kind` is optional —
      // omit it to take the next hinted facet, or name any kind (on or off the hint list) to steer.
      const upstream = Array.isArray(body?.upstream)
        ? body.upstream
        : marketObjectStore.list({ projectId });
      const grounding = buildRunGrounding(project);
      const founderInputs = founderInputsFromSharedContext(project.sharedContext);
      const connected = !!selectRuntime({}).adapter;
      const { ok, kind, candidates, meta } = await researchMarketLayer({
        // Live per-layer generator when Claude is connected; the module's honest-blank default otherwise.
        generator: connected ? createClaudeMarketLayerResearcher({ cwd: repo }) : undefined,
        projectId,
        kind: body?.kind ?? null,
        upstream,
        grounding,
        founderInputs,
      });
      json(res, 200, {
        projectId,
        ok,
        kind,
        candidates,
        count: candidates.length,
        meta: { ...meta, connected },
      });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Persist ONE picked market-layer candidate. The per-layer flow above researches a spread and stores
  // nothing; when the founder picks (or sharpens) one facet, this is the door that commits just that one
  // to the store, so it lands as a domain:"market" node on the graph. Research only — it never sends.
  const projectMarketObjectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/market-object$/);
  if (req.method === "POST" && projectMarketObjectMatch) {
    try {
      const projectId = decodeURIComponent(projectMarketObjectMatch[1]);
      const body = await readBody(req);
      const object = body?.object;
      if (!object || typeof object !== "object") { json(res, 400, { error: "a picked market object is required" }); return true; }
      const stored = marketObjectStore.create({ ...object, projectId }, {});
      json(res, 200, { projectId, object: stored });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
