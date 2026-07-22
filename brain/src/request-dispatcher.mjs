import { json } from "./routes/util.mjs";
import systemRoutes, { shellStatus } from "./routes/system.mjs";
import presenceRoutes from "./routes/presence.mjs";
import credentialRoutes from "./routes/credentials.mjs";
import firmRoutes from "./firm/routes.mjs";
import firmLensRoutes from "./firm/lens-routes.mjs";
import firmWorkIndexRoutes from "./firm/work-index-routes.mjs";
import firmSystemIndexRoutes from "./firm/system-routes.mjs";
import firmViewRoutes from "./firm/view-routes.mjs";
import firmProductChangeRoutes from "./firm/product-routes.mjs";
import firmCodeWorkspaceRoutes from "./firm/code-workspace-routes.mjs";
import firmWorkRoutes from "./firm/work-routes.mjs";
import firmDialogueRoutes from "./firm/dialogue-routes.mjs";
import firmVentureRoutes from "./firm/venture-routes.mjs";
import firmConfigurationRoutes from "./firm/configuration-routes.mjs";
import firmModelRoutes from "./firm/model-routes.mjs";

const ROUTE_GROUPS = [
  systemRoutes,
  presenceRoutes,
  credentialRoutes,
  firmRoutes,
  firmLensRoutes,
  firmWorkIndexRoutes,
  firmSystemIndexRoutes,
  firmViewRoutes,
  firmProductChangeRoutes,
  firmCodeWorkspaceRoutes,
  firmWorkRoutes,
  firmDialogueRoutes,
  firmModelRoutes,
  firmConfigurationRoutes,
  firmVentureRoutes,
];

export async function dispatchRequest(req, res) {
  const url = new URL(req.url || "/", "http://drover.local");

  if (url.pathname.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Drover-Server-Instance", shellStatus().instanceId);
    res.setHeader("X-Drover-Responded-At", new Date().toISOString());
  }

  const ctx = { req, res, url };
  for (const group of ROUTE_GROUPS) {
    if (await group(ctx)) return true;
  }

  if (url.pathname.startsWith("/api/")) {
    json(res, 404, { error: "API route not found." });
    return true;
  }
  return false;
}

export { shellStatus };
