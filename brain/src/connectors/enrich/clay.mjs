export const meta = {
  id: "clay",
  name: "Clay",
  type: "enrich",
  description: "Clay enrichment — contacts, firmographics, intent signals.",
  envKey: "CLAY_API_KEY",
  stub: true,
};

// Passes prospects through with enriched: false until a real Clay integration is wired.
export async function run(stage, upstream) {
  const prospects = upstream.filter((i) => i.type === "prospect");
  return {
    ok: true,
    items: prospects.map((p) => ({ ...p, enriched: false })),
    meta: { count: prospects.length, stub: true, note: "Set CLAY_API_KEY to enable real enrichment." },
  };
}
