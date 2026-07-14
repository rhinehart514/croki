// Founder taste is the compact record of what crossed the wall and what did not. It is venture-local
// and contains no execution or review-item model.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "is", "it", "this", "that",
  "with", "you", "your", "their", "they", "we", "our", "be", "are", "as", "at", "by", "from",
]);

function tokens(value) {
  return (String(value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function overlap(text, wanted) {
  const present = new Set(tokens(text));
  return wanted.reduce((score, token) => score + (present.has(token) ? 1 : 0), 0);
}

export function buildTaste(decisions, { maxExamples = 3 } = {}) {
  const released = (decisions?.released ?? [])
    .map((entry) => String(entry?.text ?? "").trim()).filter(Boolean).slice(0, maxExamples);
  const rejected = (decisions?.rejected ?? [])
    .map((entry) => String(entry?.text ?? "").trim()).filter(Boolean).slice(0, maxExamples);
  return released.length || rejected.length ? { released, rejected } : null;
}

function renderTaste(taste) {
  const sections = [];
  if (taste?.released?.length) {
    sections.push(`The founder released these. Preserve their judgment:\n${taste.released.map((text) => `- ${text}`).join("\n")}`);
  }
  if (taste?.rejected?.length) {
    sections.push(`The founder rejected these. Do not repeat them:\n${taste.rejected.map((text) => `- ${text}`).join("\n")}`);
  }
  return sections.join("\n\n");
}

export function queryTaste(taste, { question = "", limit = 3 } = {}) {
  if (!taste) return null;
  const wanted = tokens(question);
  if (!wanted.length) {
    return { text: renderTaste(taste), meta: { mode: "full", released: taste.released.length, rejected: taste.rejected.length } };
  }
  const select = (entries) => entries
    .map((text) => ({ text, score: overlap(text, wanted) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ text }) => text);
  const match = { released: select(taste.released), rejected: select(taste.rejected) };
  if (!match.released.length && !match.rejected.length) {
    return { text: `No founder decisions match "${question}" yet.`, meta: { mode: "no-match", question } };
  }
  return {
    text: renderTaste(match),
    meta: { mode: "query", question, released: match.released.length, rejected: match.rejected.length },
  };
}
