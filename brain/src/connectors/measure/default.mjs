// Measure node — stages attributable outcomes for durable run history.
// Venture doctrine: rates require joined records; separate counts are not a funnel.
export const meta = {
  id: "default",
  name: "Outcome capture",
  category: "measure",
  description: "Stages replies, meetings, and bounces with an attribution join key. The graph run preserves the result locally.",
  envKey: null,
  stub: false,
  sourceOfTruth: ["outcomes"],
};

export async function run(node, upstream, context, store) {
  const joinKey = node.config.joinKey ?? "id";
  const items = upstream.map((item) => ({
    ...item,
    capturedAt: new Date().toISOString(),
    status: "staged",
    attribution: {
      joinKey,
      status: item[joinKey] ? "attributed" : "blind",
    },
  }));

  // Write to store if provided (server injects this)
  if (store?.writeOutcomes) {
    await store.writeOutcomes(items);
  }

  return {
    ok: true,
    items,
    meta: {
      total: items.length,
      attributed: items.filter((i) => i.attribution?.status === "attributed").length,
      joinKey,
      note: "Staged for outcome tracking and preserved in local run history.",
    },
  };
}
