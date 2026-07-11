// Turn a raw object/field key (camelCase, snake_case, or kebab) into a plain-English label the founder
// reads at the gate and in the inspector — never a code identifier. Known GTM keys get an explicit,
// hand-tuned label (so `valueProposition` and `value_prop` both read "Value proposition", which also
// collapses the duplicate-key surfaces into one concept). Anything unknown falls back to a generic
// splitter so a new key still reads like words, not code.
const KNOWN: Record<string, string> = {
  icp: "Ideal customer",
  buyer: "Buyer",
  pain: "Pain",
  job: "Job",
  trigger: "Trigger",
  valueproposition: "Value proposition",
  valueprop: "Value proposition",
  value_prop: "Value proposition",
  offer: "Offer",
  channel: "Channel",
  message: "Message",
  proof: "Proof",
  conversion: "Conversion",
  conversionpath: "Conversion path",
  objection: "Objection",
  outcome: "Outcome",
  prospect: "Prospect",
  person: "Person",
  claim: "Claim",
  experiment: "Experiment",
};

export function humanizeFieldLabel(key: string): string {
  const raw = (key ?? "").trim();
  if (!raw) return "";
  const norm = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (KNOWN[norm]) return KNOWN[norm];
  if (KNOWN[raw.toLowerCase()]) return KNOWN[raw.toLowerCase()];
  // Generic fallback: split camelCase and snake/kebab boundaries, then sentence-case.
  const words = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  const sentence = words.charAt(0).toUpperCase() + words.slice(1);
  // Restore the same acronyms humanizeRef protects, so keys read like names not typos.
  return sentence.replace(/\b(ai|icp|seo|pco|gtm|url|cta|roi)\b/gi, (m) => m.toUpperCase());
}

// A step / pipeline-shape title the founder reads in the composer ("A few ways to shape this"). The
// backend hands these back as free text, but a shape sometimes arrives as its raw node id — a kebab or
// snake slug like "draft-referral-ask" — which is machinery, not a title. This turns such a slug into
// plain words ("Draft referral ask"); a title already written as prose (it has spaces) is returned
// untouched. Reuses humanizeFieldLabel's splitter and acronym repair so one rule governs both surfaces.
export function humanizeStepLabel(label: string): string {
  const raw = (label ?? "").trim();
  if (!raw) return "";
  // Already a written title — anything with a space, or ordinary punctuation — is left exactly as-is,
  // EXCEPT any kebab/snake slug tokens riding inside it ("On it — identify-referral-partners." →
  // "On it — Identify referral partners.") which are machinery a founder must never read.
  if (/\s/.test(raw)) return humanizeSlugsInText(raw);
  // A single plain word ("Draft", "Outreach") is a fine title; only a multi-part slug needs humanizing.
  if (!/[-_]/.test(raw) && !/[a-z][A-Z]/.test(raw)) {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return humanizeFieldLabel(raw);
}

// A pipeline's `objective` is set from the composer's goal string, which routinely arrives carrying
// engineering-register tails a founder must never read: a "Win event = project_created" identifier, a
// composer instruction ("Ideate 2-3 distinct GTM pipeline shapes the founder can compare…"), scan
// bookkeeping ("inferred from the repo", "the code scan came back blind"), and third-person notes about
// the founder. This reduces that blob to the one clean goal line: the first real sentence, with any
// instruction/bookkeeping tail cut off, so a pipeline reads as a plain intention, not a prompt.
//
// A phrase that opens an instruction/bookkeeping clause. If one of these begins a sentence, that sentence
// and everything after it is machinery — the goal is whatever came before. Matched at a sentence start
// only, so a legitimate goal that happens to contain one of these words mid-sentence is left intact.
const OBJECTIVE_TAIL = /(?:^|(?<=[.!?]\s))(?:win event\b|ideate\b|compose\b|product specifics\b|the code scan\b|the scan\b|inferred from\b|grounded in the reality\b|keep claims\b|each grounded\b|the founder\b|the buyer is\b|the activation is\b)/i;

export function founderGoalLine(objective: string | null | undefined): string {
  const raw = (objective ?? "").trim();
  if (!raw) return "";
  // Cut the objective at the first instruction/bookkeeping clause, then keep the first sentence of what
  // remains — the plain goal. If no tail marker matched, the first sentence of the whole string is the goal.
  const tail = raw.match(OBJECTIVE_TAIL);
  const goalPart = (tail && tail.index != null ? raw.slice(0, tail.index) : raw).trim();
  // First sentence: stop at the first sentence-ending punctuation followed by a space (or end of string).
  const firstSentence = goalPart.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? goalPart;
  // Drop a bare "Win event = …" fragment and any trailing separators the cut left behind.
  const cleaned = firstSentence
    .replace(/\s*[.·—-]\s*win event\b.*$/i, "")
    .replace(/[\s.·—-]+$/, "")
    .trim();
  // Humanize any machine slug that rode inside the prose, matching every other founder-facing line.
  return humanizeSlugsInText(cleaned);
}

// A machine slug token embedded in a prose line — a kebab or snake identifier a backend beat baked into
// otherwise-human text ("Completed identify-referral-partners · 3 items", "On it — warm-inbound-users.").
// Two or more separator-joined lowercase parts, no internal spaces. Matched inside a sentence so the
// surrounding prose is left untouched and only the slug is rewritten to plain words. A single hyphenated
// English word ("go-to-market", "read-only") stays intact — it needs THREE+ parts or a triggering
// non-word part to read as a machine id, so ordinary compounds are never mangled.
const EMBEDDED_SLUG = /\b[a-z][a-z0-9]*(?:[_-][a-z0-9]+){2,}\b/g;

// Rewrite every embedded machine slug in a line to plain words, leaving the human prose around it exactly
// as written. Reuses humanizeFieldLabel so one splitter/acronym rule governs slugs everywhere. Idempotent
// on already-human text (no slug matches → returns the input unchanged).
export function humanizeSlugsInText(text: string): string {
  const raw = text ?? "";
  if (!raw) return "";
  return raw.replace(EMBEDDED_SLUG, (slug, offset: number) => {
    const words = humanizeFieldLabel(slug); // sentence-cased, acronyms restored ("Warm inbound SEO")
    // A slug that opens the whole line keeps its capital; embedded mid-sentence it reads better
    // lower-cased ("On it — identify referral partners."). An acronym-leading token (SEO-…, ICP-…)
    // keeps its caps either way — never lower-case an all-caps first word.
    const firstWord = words.split(" ")[0];
    const isAcronym = firstWord.length > 1 && firstWord === firstWord.toUpperCase();
    if (offset === 0 || isAcronym) return words;
    return words.charAt(0).toLowerCase() + words.slice(1);
  });
}
