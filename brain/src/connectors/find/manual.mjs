// Manual list source — seeds prospects from a founder-provided list.
//
// Not every source is an API. Sometimes you already know exactly who you want to
// reach (a warm intro, a hand-picked account, one person you met). This source
// emits those directly from node config, with no API key, so a real loop can run
// end to end without Exa/Apollo wired. Each entry becomes a prospect item the
// rest of the pipeline (enrich / filter / generate / gate / execute) treats like
// any other.

export const meta = {
  id: "manual",
  name: "Manual list",
  category: "source",
  description: "Seeds prospects from a founder-provided list. No API key required.",
  envKey: null,
  stub: false,
  sourceOfTruth: ["contacts"],
};

// `items` is canonical. Accept the two natural open-work aliases models and founders commonly use so
// a correctly reviewed hand-seeded list does not become an empty run over a naming mismatch.
export function configuredItems(node) {
  for (const candidate of [node.config?.items, node.config?.rows, node.config?.contacts]) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  return [];
}

export async function run(node) {
  const list = configuredItems(node);
  const items = list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => ({
      type: "prospect",
      id: entry.id || entry.email || entry.url || `manual-${index}`,
      ...entry,
    }));
  return {
    ok: true,
    items,
    meta: { count: items.length, source: "manual" },
  };
}
