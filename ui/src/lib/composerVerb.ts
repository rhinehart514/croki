// The action a verb-scoped send performs on the SELECTED canvas object. When the founder has a node or
// card selected, the composer's send control names the verb it will run (Draft / Connect / Split /
// Stage / Ask …) so the founder sees what pressing send does before they press it.
//
// The set is intentionally OPEN: a plain lookup with an "ask" fallback, so a new selection kind or a new
// verb is a one-line addition here — never a closed enum that dead-ends an intent the model can express
// (anti-cage, see AGENTS.md). The derivation is DETERMINISTIC — plain code, no model call: selection
// kind picks a default, and a typed imperative ("connect it to the gate", "split by segment") overrides.

export type ComposerVerb = {
  id: string;
  // Shown on the send chip and in the change menu, plain English.
  label: string;
  // One-line plain-English gloss shown beside the label in the change menu.
  hint: string;
  // The standalone imperative sent when the founder presses send with an EMPTY input — the verb itself
  // is the instruction. The selected object rides alongside as context (the host frames it on the turn).
  // "ask" has no solo: an empty question sends nothing, same as the plain composer.
  solo: string;
  // Words that, when the typed text STARTS with one, derive THIS verb from the text. The verb's own id
  // and label word are always treated as leads too.
  leads: string[];
  // True only for a verb that stages a decision at the founder gate — the ONE action that earns amber.
  gate?: boolean;
};

// The registry. Ordered as it renders in the change menu: the everyday moves first, the gate last.
export const COMPOSER_VERBS: ComposerVerb[] = [
  { id: "ask", label: "Ask", hint: "just ask about it", solo: "", leads: [] },
  { id: "draft", label: "Draft", hint: "write the first version", solo: "Draft this.", leads: ["draft", "write"] },
  { id: "find", label: "Find", hint: "dig up the evidence", solo: "Find the evidence behind this.", leads: ["find", "research"] },
  { id: "sharpen", label: "Sharpen", hint: "tighten what's there", solo: "Sharpen this.", leads: ["sharpen", "tighten"] },
  { id: "connect", label: "Connect", hint: "wire it to another step", solo: "Connect this to the right next step.", leads: ["connect", "link", "wire"] },
  { id: "split", label: "Split", hint: "break into separate paths", solo: "Split this into separate paths.", leads: ["split", "break"] },
  { id: "merge", label: "Merge", hint: "combine with another step", solo: "Merge this with a related step.", leads: ["merge", "combine"] },
  { id: "stage", label: "Stage", hint: "send it to your gate", solo: "Stage this to my gate for review.", leads: ["stage", "approve"], gate: true },
];

const BY_ID = new Map(COMPOSER_VERBS.map((v) => [v.id, v]));

export function verbById(id: string | null | undefined): ComposerVerb | null {
  return id ? BY_ID.get(id) ?? null : null;
}

// The default verb for a selected object's kind. Covers both object-graph card types (message, offer,
// buyer…) and node-graph step categories (generate, execute, source…). OPEN: an unlisted kind falls
// through to "ask", and adding a kind is one line here.
const KIND_DEFAULT: Record<string, string> = {
  // object-graph card types
  message: "draft",
  channel: "draft",
  offer: "sharpen",
  value_prop: "sharpen",
  proof_point: "find",
  buyer: "find",
  pain: "find",
  job: "find",
  trigger: "ask",
  gate: "stage",
  run: "ask",
  // node-graph step categories
  generate: "draft",
  execute: "stage",
  source: "find",
  enrich: "find",
  filter: "ask",
  measure: "ask",
};

function firstWord(text: string): string {
  return text.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, "") ?? "";
}

function verbFromLead(word: string): ComposerVerb | null {
  if (!word) return null;
  for (const v of COMPOSER_VERBS) {
    if (v.id === word || v.label.toLowerCase() === word || v.leads.includes(word)) return v;
  }
  return null;
}

// Derive the active verb for a selection: an explicit founder override wins, else a typed imperative
// ("connect…"), else the selection kind's default, else "ask". Never throws — always returns a verb.
export function deriveVerb(kind: string, text: string, override?: string | null): ComposerVerb {
  const chosen = verbById(override);
  if (chosen) return chosen;
  const typed = verbFromLead(firstWord(text));
  if (typed) return typed;
  return verbById(KIND_DEFAULT[kind]) ?? verbById("ask")!;
}

// Build the message actually sent to Claude for a verb + the founder's typed text. Plain English; the
// selected object rides alongside as context (the host adds it). "ask" sends the text verbatim. An empty
// input sends the verb's solo imperative. Text that already LEADS with this verb's word is left as-is so
// the verb never gets doubled ("Connect: connect this to…").
export function frameVerbMessage(verb: ComposerVerb, text: string): string {
  const t = text.trim();
  if (verb.id === "ask") return t;
  if (!t) return verb.solo;
  if (verbFromLead(firstWord(t))?.id === verb.id) return t;
  return `${verb.label}: ${t}`;
}
