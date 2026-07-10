// Living Product Picture — the founder-editable interpretation aggregate. Moved verbatim out of
// server.mjs.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { executeDomainCommand } from "../domain-commands.mjs";
import { getProductModel } from "../product-model-store.mjs";
import { generateProductModelForProject } from "../product-model-generator.mjs";
import { getWorkspace } from "../workspace.mjs";

function linkedScanReport(project) {
  const workspaceId = project?.sharedContext?.repository?.workspaceId;
  if (!workspaceId) return null;
  try { return getWorkspace(workspaceId)?.report ?? null; } catch { return null; }
}

export default async function handle({ req, res, url }) {
  // Living Product Picture — the founder-editable interpretation aggregate. Three state-changing
  // commands funnel through executeDomainCommand (the single chokepoint), plus a read. derive injects
  // the provider-neutral one-shot generator; revise/signal are pure host state moves. This is
  // Door 1 (human HTTP); the brain MCP is an HTTP client to these routes, so they exist first.
  if (req.method === "GET" && url.pathname === "/api/product-model") {
    try {
      const project = loadProject();
      json(res, 200, { productModel: getProductModel(project.id) ?? null });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/product-model/derive") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const draft = await generateProductModelForProject({
        project,
        report: linkedScanReport(project),
        repo,
        model: body.model,
        runtime: body.runtime,
        market: body.market,
      });
      if (!draft.ok) {
        json(res, 503, {
          error: draft.meta?.error || "The selected runtime could not derive the product model.",
          meta: draft.meta,
        });
        return true;
      }
      const productModel = await executeDomainCommand("DeriveProductModel", {
        ...body,
        projectId: project.id,
        grounding: draft.grounding,
        groundingRef: draft.groundingRef,
        repo,
      }, { projectId: project.id, generate: async () => draft });
      json(res, 200, { productModel, meta: draft.meta });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/product-model/revise") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const productModel = await executeDomainCommand("ReviseProductModel", {
        ...body,
        projectId: project.id,
      }, { projectId: project.id });
      json(res, 200, { productModel });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/product-model/signal") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const productModel = await executeDomainCommand("RecordProductSignal", {
        ...body,
        projectId: project.id,
      }, { projectId: project.id });
      json(res, 200, { productModel });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
