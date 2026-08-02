import type { APIRoute } from "astro";

import { buildCrokiProjectFileJsonSchema } from "@croki/shared/crokiProjectFile";

// Rendered at build time; published at https://t3.codes/schema/croki.json so
// croki.json files can reference it via "$schema" for editor/LSP support.
export const GET: APIRoute = () =>
  new Response(`${JSON.stringify(buildCrokiProjectFileJsonSchema(), null, 2)}\n`, {
    headers: { "Content-Type": "application/json" },
  });
