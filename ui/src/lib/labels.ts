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
