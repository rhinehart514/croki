// Personalization-variance guard (E5.3).
//
// Anyone can send 500 emails. The reason most GTM AI is slop is that the 500 "personalized"
// messages read as one letter sent 500 times — a {firstName} and a constant body. This guard is
// the quality wall: given a batch of generated drafts, measure how much they ACTUALLY differ from
// each other. High pairwise similarity = regression to the template-mean, and the founder should
// see that before approving the pattern at the gate.
//
// Deterministic — token-shingle (Jaccard) similarity, no model call (ENGINEERING.md: code answers
// when it can). This produces advisory signal the volume gate and the founder read; it never sends
// and never edits a draft. It only tells the truth about whether the batch is genuinely varied.

function shingles(text, n = 2) {
  const tokens = String(text ?? "").toLowerCase().match(/[a-z0-9']+/g) || [];
  if (tokens.length < n) return new Set(tokens);
  const set = new Set();
  for (let i = 0; i <= tokens.length - n; i += 1) set.add(tokens.slice(i, i + n).join(" "));
  return set;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function firstLine(text) {
  return String(text ?? "").split(/\n/)[0].trim().toLowerCase();
}

// Accept raw strings or result objects ({ draft } / { text } / { body }).
function asText(entry) {
  if (typeof entry === "string") return entry;
  return entry?.draft ?? entry?.text ?? entry?.body ?? "";
}

// threshold: mean pairwise Jaccard at or above this reads as templated. 0.6 is deliberately
// strict — two genuinely personalized messages to different people share structure but not most
// of their bigrams.
export function assessVariance(drafts = [], { threshold = 0.6 } = {}) {
  const texts = (Array.isArray(drafts) ? drafts : []).map(asText).filter((t) => t && t.trim());
  const count = texts.length;
  if (count < 2) {
    return {
      count,
      meanSimilarity: 0,
      templated: false,
      sharedOpenings: 0,
      flaggedPairs: [],
      note: count ? "Only one draft — variance needs at least two to compare." : "No drafts to assess.",
    };
  }

  const sets = texts.map((t) => shingles(t));
  let total = 0;
  let pairs = 0;
  const flaggedPairs = [];
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const sim = jaccard(sets[i], sets[j]);
      total += sim;
      pairs += 1;
      if (sim >= threshold) flaggedPairs.push({ i, j, similarity: Number(sim.toFixed(3)) });
    }
  }
  const meanSimilarity = pairs ? total / pairs : 0;

  // Identical opening lines are the loudest template tell, even when bodies vary.
  const openings = new Map();
  for (const t of texts) {
    const key = firstLine(t);
    if (key) openings.set(key, (openings.get(key) ?? 0) + 1);
  }
  const sharedOpenings = [...openings.values()].filter((c) => c > 1).reduce((a, c) => a + c, 0);

  const templated = meanSimilarity >= threshold || sharedOpenings >= Math.max(2, Math.ceil(count * 0.3));

  return {
    count,
    meanSimilarity: Number(meanSimilarity.toFixed(3)),
    templated,
    sharedOpenings,
    flaggedPairs,
    note: templated
      ? `These drafts read as a template (mean similarity ${meanSimilarity.toFixed(2)}${sharedOpenings ? `, ${sharedOpenings} share an opening line` : ""}). Anchor each on the recipient's real trigger before approving the pattern.`
      : `Drafts show real per-recipient variance (mean similarity ${meanSimilarity.toFixed(2)}).`,
  };
}
