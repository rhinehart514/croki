// Context node — ICP definition. Not in the data flow; referenced via context edges.
// Score and generate nodes receive ICP as context when they run.
export const meta = {
  id: "icp",
  name: "ICP",
  category: "context",
  description: "Ideal customer profile definition — query, geography, industry, keywords.",
  envKey: null,
  stub: false,
};

export async function run(node) {
  const { query, geography, industry, keywords = [] } = node.config;
  if (!query?.trim()) throw new Error("ICP context requires a query.");
  return {
    ok: true,
    items: [{ type: "context", id: "icp", query, geography, industry, keywords }],
    meta: { type: "icp" },
  };
}
