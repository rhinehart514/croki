export const meta = {
  id: "exa",
  name: "Exa",
  type: "find",
  description: "Neural semantic search for companies and people.",
  envKey: "EXA_API_KEY",
};

export async function run(stage, upstream, context) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error("EXA_API_KEY is not set — add it to your environment and restart.");

  const icp = upstream.find((i) => i.type === "icp") || context?.icp;
  const query = icp?.query || stage.config.query;
  if (!query?.trim()) throw new Error("Find stage needs a query from the ICP or stage config.");

  const numResults = Math.min(Number(stage.config.limit) || 10, 25);

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      query,
      numResults,
      type: "neural",
      contents: { text: { maxCharacters: 600 } },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Exa search failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const items = (data.results || []).map((r, i) => ({
    type: "prospect",
    id: r.id || `exa-${i}`,
    name: r.title || r.url,
    url: r.url,
    summary: r.text?.slice(0, 400) || "",
    score: null,
    fit: null,
    draft: null,
    gated: false,
  }));

  return { ok: true, items, meta: { query, count: items.length } };
}
