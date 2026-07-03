export const ROUTE_UTTERANCE_PROMPT = `Route one founder utterance over the GTM object graph.
Return ONLY JSON: { "act": "focus|lens|explain|propose|compile", "targetIds": ["..."], "lens": "default|weakness", "note": "one short line" }.
Prefer graph acts over prose. Unknown requests should return an honest explain act with no mutation.`;

// Routing a founder utterance is fuzzy judgment (intent classification over open language), so it is
// the MODEL's job, not a regex table — the earlier code classifier (routeUtteranceCode) was a dead
// pre-filter with no live caller and has been removed so the model route() is the only path. When no
// route function is wired, fall back to an honest explain that names what the graph can do.
export async function routeUtterance({ utterance, context = {}, route = null } = {}) {
  if (typeof route === "function") return route({ utterance, context });
  return {
    act: "explain",
    targetIds: [],
    note: "I can focus the graph, switch the weakness lens, explain the strongest path, or compile it.",
  };
}
