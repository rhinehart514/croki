export const meta = {
  id: "default",
  name: "Keyword score",
  type: "score",
  description: "Deterministic keyword-match ICP scoring.",
  envKey: null,
};

export async function run(stage, upstream) {
  const { minFitScore = 0.3, keywords = [] } = stage.config;
  const prospects = upstream.filter((i) => i.type === "prospect");

  if (prospects.length === 0) return { ok: true, items: [], meta: { total: 0, passed: 0 } };

  const scored = prospects.map((p) => {
    const text = `${p.name} ${p.summary}`.toLowerCase();
    let score;
    if (Array.isArray(keywords) && keywords.length > 0) {
      const hits = keywords.filter((kw) => kw && text.includes(kw.toLowerCase())).length;
      score = hits / keywords.length;
    } else {
      score = 0.6;
    }
    return { ...p, score: Math.round(score * 100) / 100, fit: score >= minFitScore };
  });

  const passed = scored.filter((p) => p.fit);
  return { ok: true, items: passed, meta: { total: scored.length, passed: passed.length } };
}
