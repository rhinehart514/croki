// The @-mention engine for the composer — a pure, side-effect-free module the input wires the textarea
// into. It turns the two things the founder already has client-side — the crew bench (teammates) and the
// capability list (tools) — into ONE searchable roster, detects an "@query" being typed at the caret,
// ranks the roster against it, and turns a picked entity into an in-text chip token that round-trips back
// to structured data on send. Nothing here touches the DOM, React, or the network, so every rule below is
// unit-testable in isolation.
//
// ── The chip token encoding ─────────────────────────────────────────────────────────────────────────
// A placed mention lives in the message string as a single self-describing token:
//
//     ⟦@<kind>:<encId>:<encLabel>:<gatedFlag>⟧
//
//   ⟦ … ⟧   U+27E6 / U+27E7 (mathematical white square brackets). Chosen because they essentially never
//           occur in founder-typed prose, so a token can never collide with real text the founder wrote.
//   @       a literal, a visual echo of the trigger — makes a raw token still read as a mention if it is
//           ever shown unrendered.
//   kind    one of `agent` | `skill` | `capability` (a fixed set — see MENTION_KINDS).
//   encId   encodeURIComponent(id): the agent `ref` (agent) or the capability `id`. Encoding guarantees the
//           id can never contain the `:` or bracket delimiters, so the parse is unambiguous for any id.
//   encLabel encodeURIComponent(label): the human label shown in the chip (e.g. "Outreach Writer").
//   gatedFlag `1` if the entity reaches the outside world (gated), else `0`.
//
// The whole point of the token is the round-trip: the founder writes a sentence with faces in it, and on
// send `extractMentions` pulls every token back into a structured hint — {kind, id, label, gated} — so the
// operator is handed the NAMED teammates/capabilities, not just prose it has to re-guess. The clean display
// text (each token rendered as "@Label") is what a human/model reads.

import { agentPersona, type AgentFamily } from "@/lib/agentPersona";
import { CAPABILITIES, type Capability } from "@/lib/capabilities";
import type { AgentBenchRow } from "@/api";

export const MENTION_KINDS = ["agent", "skill", "capability"] as const;
export type MentionKind = (typeof MENTION_KINDS)[number];

// One searchable roster entity — the same object that feeds the @-menu, and (via `entity.picked` →
// `mentionToken`) the chip placed in the sentence. A discriminated union so the menu can render a teammate
// as a face and a capability as a brand mark, while sharing the fields the ranker and header need.
export type MentionEntity =
  | {
      kind: "agent";
      id: string; // the agent ref — also the token id
      ref: string; // explicit alias of id for the agent case
      label: string; // display name: the founder-chosen name, else the derived role
      role: string; // the persona role (used when label is a custom name)
      family: AgentFamily; // drives the face tint
      monogram: string; // two-letter identity mark
      blurb: string; // one plain-English line — the agent's job
      gated: false; // a teammate never reaches the outside world on its own
      search: string; // pre-lowercased haystack the ranker scores against
    }
  | {
      kind: "capability";
      id: string; // the capability id — also the token id
      label: string; // the capability name — "Gmail"
      cap: Capability; // the full capability, so the menu can draw its brand mark
      blurb: string; // one plain-English line — what it does for you
      gated: boolean; // reaches the outside world → carries the amber dot everywhere
      search: string;
    };

// A placed mention, pulled back out of a sent message. `id` holds the agent ref (agent kind) or the
// capability/skill id — the "ref|id" the operator binds against. `ref` is set only for agents, as an
// unambiguous alias, so a caller that specifically wants the teammate ref never has to branch on kind.
export type PlacedMention = {
  kind: MentionKind;
  id: string;
  ref?: string;
  label: string;
  gated: boolean;
};

// The message split into render segments — plain text runs and chip mentions, in order. The input uses
// this to draw inline chips; it is pure so it is testable and reused by `extractMentions`.
export type MessageSegment =
  | { type: "text"; text: string }
  | { type: "chip"; mention: PlacedMention };

// ── Building the roster ───────────────────────────────────────────────────────────────────────────────

// Turn the bench (teammates) and the capability list (tools) into one roster, teammates first so an empty
// query surfaces the founder's own crew before the toolbox. No fetch — both inputs are already client-side.
export function buildRoster(
  bench: AgentBenchRow[],
  capabilities: Capability[] = CAPABILITIES,
): MentionEntity[] {
  const agents: MentionEntity[] = bench.map((row) => {
    const persona = agentPersona(row.ref, row.job);
    const label = row.name?.trim() || persona.role;
    return {
      kind: "agent",
      id: row.ref,
      ref: row.ref,
      label,
      role: persona.role,
      family: persona.family,
      monogram: persona.monogram,
      blurb: row.job,
      gated: false,
      search: [label, persona.role, persona.monogram, row.ref, row.job]
        .join(" ")
        .toLowerCase(),
    };
  });

  const caps: MentionEntity[] = capabilities.map((cap) => ({
    kind: "capability",
    id: cap.id,
    label: cap.name,
    cap,
    blurb: cap.blurb,
    gated: Boolean(cap.gated),
    search: [cap.name, cap.id, cap.blurb].join(" ").toLowerCase(),
  }));

  return [...agents, ...caps];
}

// ── Detecting an active @query at the caret ──────────────────────────────────────────────────────────

const OPENERS = new Set(["(", "[", "{", "“", "‘", '"', "'"]);

// Scan backward from the caret for the `@` that starts a live mention query, and return the query text
// with its char range — or null when the caret is not inside a mention. The rules that make this robust:
//   • The `@` must sit at the start of the value or right after whitespace/an opening bracket — so an email
//     ("someone@example.com") never triggers, because the char before its `@` is a letter.
//   • The query runs from just after `@` to the caret and may not contain whitespace — hitting whitespace
//     while scanning back means we are past the end of any mention, so we bail.
//   • Hitting a token bracket (⟦ or ⟧) while scanning back means the caret is adjacent to an already-placed
//     chip, not inside a new query — bail.
// The query may be empty (the founder just typed `@`), which opens the menu on the full roster.
export function detectMentionQuery(
  value: string,
  caret: number,
): { query: string; start: number; end: number } | null {
  const end = Math.max(0, Math.min(caret, value.length));
  for (let i = end - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "@") {
      const prev = i > 0 ? value[i - 1] : "";
      if (i === 0 || /\s/.test(prev) || OPENERS.has(prev)) {
        return { query: value.slice(i + 1, end), start: i, end };
      }
      return null; // `@` is mid-word (an email, a handle already committed) — not a trigger
    }
    if (/\s/.test(ch) || ch === "⟦" || ch === "⟧") return null;
  }
  return null;
}

// ── Ranking the roster against a query ───────────────────────────────────────────────────────────────

function firstWordsInitials(search: string): string {
  return search
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
}

// Is `q` a subsequence of `text` (chars appear in order, not necessarily adjacent)? Powers fuzzy matches
// like "os" → "Outreach Scout".
function isSubsequence(q: string, text: string): boolean {
  let j = 0;
  for (let i = 0; i < text.length && j < q.length; i++) {
    if (text[i] === q[j]) j++;
  }
  return j === q.length;
}

// Score one entity against a normalized (lowercased, whitespace-stripped) query. Higher is better; -1
// means no match at all. The order encodes intent: a label that starts with what you typed beats a
// mid-word hit beats a fuzzy subsequence beats a blurb-only mention.
function scoreEntity(q: string, entity: MentionEntity): number {
  if (q === "") return 0;
  const label = entity.label.toLowerCase();
  const labelNoSpace = label.replace(/\s+/g, "");
  const initials = firstWordsInitials(entity.label);

  if (label.startsWith(q) || labelNoSpace.startsWith(q)) return 100 - entity.label.length * 0.01;
  if (entity.label.split(/\s+/).some((w) => w.toLowerCase().startsWith(q))) return 80;
  if (initials.startsWith(q)) return 70; // "ss" → Signal Scout
  if (label.includes(q)) return 55;
  if (isSubsequence(q, labelNoSpace)) return 40;
  if (entity.search.includes(q)) return 20; // matched only in role / id / blurb
  return -1;
}

// Rank + filter the roster for a query. An empty query returns the roster unchanged (teammates first),
// capped at `limit`. A non-empty query drops non-matches and sorts best-first, stable within a tie so the
// roster's own ordering (crew before tools) is preserved.
export function rankRoster(
  roster: MentionEntity[],
  query: string,
  limit = 8,
): MentionEntity[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (q === "") return roster.slice(0, limit);
  return roster
    .map((entity, index) => ({ entity, index, score: scoreEntity(q, entity) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.entity);
}

// ── Resolving a pick into a chip token, and splicing it into the value ────────────────────────────────

const OPEN = "⟦";
const CLOSE = "⟧";

// The kind stored in a token for a roster entity. A capability's token records `capability`; teammates
// record `agent`. (`skill` is a valid token kind the parser round-trips, reserved for a future roster
// source — the current roster never emits it.)
function tokenKind(entity: MentionEntity): MentionKind {
  return entity.kind === "agent" ? "agent" : "capability";
}

// Resolve a picked roster entity into its chip token string — the self-describing sentinel documented at
// the top of this file. This is the single encoder; `extractMentions` / `tokenizeMessage` are its inverse.
export function mentionToken(entity: MentionEntity): string {
  const kind = tokenKind(entity);
  const gated = entity.gated ? "1" : "0";
  return `${OPEN}@${kind}:${encodeURIComponent(entity.id)}:${encodeURIComponent(entity.label)}:${gated}${CLOSE}`;
}

// Splice a picked entity's chip token into the value, replacing the live "@query" range, and return the new
// value plus the caret position just after the inserted chip (a trailing space is added so the founder can
// keep typing). `range` is what `detectMentionQuery` returned.
export function applyMention(
  value: string,
  range: { start: number; end: number },
  entity: MentionEntity,
): { value: string; caret: number } {
  const token = mentionToken(entity) + " ";
  const next = value.slice(0, range.start) + token + value.slice(range.end);
  return { value: next, caret: range.start + token.length };
}

// ── Reading placed mentions back out ─────────────────────────────────────────────────────────────────

// A fresh matcher each call — a shared /g regex carries `lastIndex` state between calls and would skip
// tokens. Group 1 kind, 2 encoded id, 3 encoded label, 4 gated flag.
function tokenMatcher(): RegExp {
  return /⟦@(agent|skill|capability):([^:⟦⟧]*):([^:⟦⟧]*):([01])⟧/g;
}

function decodeMention(kind: string, encId: string, encLabel: string, gatedFlag: string): PlacedMention {
  const k = kind as MentionKind;
  const id = safeDecode(encId);
  const mention: PlacedMention = {
    kind: k,
    id,
    label: safeDecode(encLabel),
    gated: gatedFlag === "1",
  };
  if (k === "agent") mention.ref = id;
  return mention;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // a hand-mangled token degrades to its raw bytes rather than throwing
  }
}

// Split a message into ordered text/chip segments — the render contract for drawing the input with inline
// chips, and the shared engine behind `extractMentions`.
export function tokenizeMessage(message: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const re = tokenMatcher();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    if (m.index > last) segments.push({ type: "text", text: message.slice(last, m.index) });
    segments.push({ type: "chip", mention: decodeMention(m[1], m[2], m[3], m[4]) });
    last = m.index + m[0].length;
  }
  if (last < message.length) segments.push({ type: "text", text: message.slice(last) });
  return segments;
}

// Extract every placed mention as a structured hint, and produce the clean display text with each token
// rendered as "@Label". The `mentions` array is the send-path payload; `text` is what a human/model reads.
export function extractMentions(message: string): { mentions: PlacedMention[]; text: string } {
  const mentions: PlacedMention[] = [];
  let text = "";
  for (const seg of tokenizeMessage(message)) {
    if (seg.type === "text") {
      text += seg.text;
    } else {
      mentions.push(seg.mention);
      text += `@${seg.mention.label}`;
    }
  }
  return { mentions, text };
}
