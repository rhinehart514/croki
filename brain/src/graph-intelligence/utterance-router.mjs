export const ROUTE_UTTERANCE_PROMPT = `Route one founder utterance over the GTM object graph.
Return ONLY JSON: { "act": "focus|lens|explain|propose|compile", "targetIds": ["..."], "lens": "default|weakness", "note": "one short line" }.
Prefer graph acts over prose. Unknown requests should return an honest explain act with no mutation.`;

const LENS_WORDS = new Map([
  ["weakness", "weakness"],
  ["weak", "weakness"],
  ["default", "default"],
  ["graph", "default"],
]);

export function routeUtteranceCode(input, context = {}) {
  const text = String(input ?? "").trim().toLowerCase();
  if (!text) return null;
  if (/compile|run this|run the|stage/.test(text)) {
    return { act: "compile", targetIds: context.highlightedPath?.nodeIds ?? [], note: "Compile the highlighted path." };
  }
  if (/weakest|softest|thin spot|where.*weak/.test(text)) {
    const target = context.highlightedPath?.weakestLink?.nodeId ?? context.weakestNodeId ?? null;
    return { act: "focus", targetIds: target ? [target] : [], lens: "weakness", note: "Showing the weakest visible card." };
  }
  for (const [word, lens] of LENS_WORDS) {
    if (text === word || text.includes(`show ${word}`)) {
      return { act: "lens", targetIds: [], lens, note: `Switched to ${lens}.` };
    }
  }
  if (/why|explain|strongest/.test(text)) {
    return { act: "explain", targetIds: context.highlightedPath?.nodeIds ?? [], note: "Explain the highlighted path with receipts." };
  }
  return null;
}

export async function routeUtterance({ utterance, context = {}, route = null } = {}) {
  const coded = routeUtteranceCode(utterance, context);
  if (coded) return coded;
  if (typeof route === "function") return route({ utterance, context });
  return {
    act: "explain",
    targetIds: [],
    note: "I can focus the graph, switch the weakness lens, explain the strongest path, or compile it.",
  };
}
