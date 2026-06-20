export const meta = {
  id: "clay",
  name: "Clay Enrichment",
  category: "resource",
  description: "Clay waterfall enrichment — email, phone, firmographics, buying signals.",
  envKey: "CLAY_API_KEY",
  stub: true,
  allowed: ["enrich"],
  blocked: ["export_without_approval"],
  approvalRequired: ["run_enrichment"],
};

export async function run() {
  return { ok: true, items: [], meta: { declaration: true } };
}
