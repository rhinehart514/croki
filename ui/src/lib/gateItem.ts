import type { ChannelMeta, GateDecision, GTMItem } from "@/types";

// First non-empty string among loosely-typed item fields. Staged gate items carry free-form keys
// depending on which connector/agent produced them, so every reader coalesces across the aliases.
function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v;
  return null;
}

// Bookkeeping the host stamps onto items as they move through a run — never reviewable content.
// This is the ONLY closed list here; the item's content fields stay open (composition is free-form,
// so a step may stage a post as { post_text }, a page as { headline, sections }, anything).
// Mirrors BOOKKEEPING_KEYS in brain/src/memory.mjs — keep the two in step.
const BOOKKEEPING_KEYS = new Set([
  "id", "gtmActionId", "type", "approvalStatus", "approved", "viaPattern", "isException",
  "reasons", "exception", "needsReview", "confidence", "editedFrom", "evidence_lines", "source",
  "score", "fit", "enriched", "gated", "sentAt", "channel",
  // Plain-language framing stamped at gate staging — surfaced through named slots (title / byline), never
  // as open detail rows. Mirror in brain/src/memory.mjs BOOKKEEPING_KEYS.
  "plainLanguageTitle", "whatYourYesDoes",
]);

// Keys already surfaced through a named slot below (body / subject / evidence / trigger / who /
// source), so they never repeat in the open `fields` list.
const SLOTTED_KEYS = new Set([
  "draft_note", "draft", "message", "summary", "text", "content", "body",
  "verdictWhy", "highestLeverageFix", "recommendation",
  "suggested_subject_line", "subject", "founder_name", "name", "handle",
  "grounding_citation", "icpFitRationale", "fitRationale", "nowTrigger", "now_trigger",
  "role", "title", "company", "sourceUrl", "url", "founder_github_or_url",
]);

// "scheduled_for" / "postText" → "scheduled for" / "post text" — field names read as plain words.
function humanizeKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().trim();
}

// ─── The register boundary, enforced at the wall ───────────────────────────────
// The founder gate is a FOUNDER surface: it shows what a decision is about, in plain words, and hides
// the machine's own bookkeeping. Agent output is free-form (composition is free by design), so an agent
// may hand back a blob laced with run ids, graph ids, agent refs, "built on" pointers, and deeply nested
// planning objects. Rendering those verbatim is the machinery register AGENTS.md bans on anything the
// founder reads. These three guards translate-by-subtraction: an identifier field never shows, a machine
// id hiding under an innocent key never shows, and a nested-object blob never flattens into an
// "id: K1 · state: … · risk: Low" machine string. What survives is the content a founder actually decides on.
const MACHINERY_KEYS = new Set([
  "run", "graph", "node", "agent", "ref", "built", "meta", "trace", "slug", "uuid", "guid", "hash",
  "checksum", "revision", "version", "namespace", "pointer", "fetchedat", "provenance",
  // provenance pointers ("built on X", "derived from Y", "based on Z") — where it came from, not what it is.
  "builton", "builtfrom", "derivedfrom", "basedon", "sourcedfrom", "generatedfrom",
]);
// A field key that names an identifier or internal pointer, never founder content.
function isMachineryKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[\s-]+/g, "_");
  if (MACHINERY_KEYS.has(k) || MACHINERY_KEYS.has(k.replace(/_/g, ""))) return true;
  // …anything ending in _id / _ref / _key / _uuid / _hash / _slug (run_id, graph_id, agent_ref, join_key).
  return /(?:^|_)(?:id|ids|ref|refs|key|keys|uuid|guid|hash|slug|url_slug)$/.test(k);
}
// A value that IS a machine token — a run tag, a kebab graph/agent id — even under an innocent key.
// Prose (anything with a space) is never a machine token, so real founder content is never caught.
function isMachineryValue(s: string): boolean {
  const t = s.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^run-\d/i.test(t)) return true;
  if (t.includes("--")) return true; // strelva--ai-answer-engine-content-…
  const seps = (t.match(/[-_./]/g) || []).length;
  return seps >= 2 && t.length >= 12; // aeo-content-planner, a long separator-heavy id
}
// A structured value — a nested object, or a list of them (waves, pieces). This is machine data the
// founder never edits at the wall; the item's own body carries the plain-words summary of it.
function isStructuralValue(v: unknown): boolean {
  if (Array.isArray(v)) return v.some((x) => !!x && typeof x === "object");
  return !!v && typeof v === "object";
}
// A subject that is really a raw field key ("planner_meta", "shipPlan", "aeo-content-planner") rather
// than a written title — snake/kebab/camel with no spaces. Humanized to plain words so a title never
// reads as code. A real title (it has spaces / punctuation) is left exactly as written.
function looksLikeRawKey(s: string): boolean {
  const t = s.trim();
  if (!t || /\s/.test(t)) return false;
  return /^[a-z0-9]+(?:[_-][a-z0-9]+)+$/i.test(t) || /^[a-z]+[A-Z][a-zA-Z]*$/.test(t);
}
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// The first sentence/line of a body, trimmed to a headline length — used as a card title when the item
// carries no real subject, so the founder reads what the item IS instead of a raw "context" type word.
// null when there's no usable text.
function firstLine(text: string | null): string | null {
  if (!text) return null;
  const line = text.split(/\r?\n/)[0].trim();
  if (!line) return null;
  const clipped = line.length > 80 ? `${line.slice(0, 77).trimEnd()}…` : line;
  return clipped || null;
}

// Render one field value readably: strings as-is, numbers/booleans plainly, arrays joined, nested
// objects flattened to "key: value" pairs. null when the value carries nothing showable.
function renderFieldValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(renderFieldValue).filter((s): s is string => !!s);
    return parts.length ? parts.join(", ") : null;
  }
  if (value && typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const s = renderFieldValue(v);
        return s ? `${humanizeKey(k)}: ${s}` : null;
      })
      .filter((s): s is string => !!s);
    return parts.length ? parts.join(" · ") : null;
  }
  return null;
}

// One open field of a staged item, rendered for the card: a plain-words label and a readable value.
type GateItemField = { label: string; value: string };

// Render a nested value (object or array of objects) into a readable, indented outline the founder can
// expand — never a flattened "id: K1 · state: …" machine string, and never a silent drop. Machinery
// keys/values are still hidden WITHIN the nesting (an id inside a nested object is as much bookkeeping as
// one at the top), but real content at any depth survives. Returns [] when nothing showable remains.
export type GateReceiptLine = { label: string; value: string | null; depth: number };
function receiptLines(value: unknown, depth: number, label: string): GateReceiptLine[] {
  if (Array.isArray(value)) {
    // A list: each element becomes its own indented block ("Item 1", "Item 2"), so a list of waves/pieces
    // reads as a list, not one run-on line.
    const out: GateReceiptLine[] = [];
    let shown = 0;
    value.forEach((el) => {
      if (el && typeof el === "object") {
        shown += 1;
        out.push({ label: `${label} ${shown}`, value: null, depth });
        out.push(...receiptLines(el, depth + 1, ""));
      } else {
        const s = renderScalar(el);
        if (s) { shown += 1; out.push({ label: `${label} ${shown}`, value: s, depth }); }
      }
    });
    return out;
  }
  if (value && typeof value === "object") {
    const out: GateReceiptLine[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isMachineryKey(k)) continue; // an id/ref nested inside is still bookkeeping
      if (v && typeof v === "object") {
        out.push({ label: humanizeKey(k), value: null, depth });
        out.push(...receiptLines(v, depth + 1, humanizeKey(k)));
      } else {
        const s = renderScalar(v);
        if (s && isMachineryValue(s)) continue; // a machine token hiding under an innocent key
        if (s) out.push({ label: humanizeKey(k), value: s, depth });
      }
    }
    return out;
  }
  const s = renderScalar(value);
  return s ? [{ label, value: s, depth }] : [];
}

// A single scalar rendered plainly — no nesting logic (that's receiptLines' job). null when empty.
function renderScalar(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

// The one normalized view of a staged gate item. The founder gate's rail AND the on-canvas gate
// review both render from this, so the two surfaces can never disagree about what a draft says or
// whether it's hollow. The known aliases live here once — the drafter emits
// draft_note / suggested_subject_line / founder_name / grounding_citation; older connectors emit
// draft / subject / name — and everything ELSE the item carries lands in `fields`, so a staged
// item of ANY shape (a post, a note, a page) shows the actual thing about to reach the world.
type GateItemView = {
  subject: string;
  body: string | null;
  evidence: string | null;
  trigger: string | null;
  who: string | null;
  sourceUrl: string | null;
  fields: GateItemField[];
  // The nested structure the flat `fields` list can't show — objects and lists the item carried, kept as
  // an inspectable outline behind an expandable receipt instead of being silently dropped. Empty on the
  // common flat item. Subtraction stays visible: what the card doesn't show up front lives here, never gone.
  receipt: GateReceiptLine[];
  hollow: boolean;
};

// A free-form string field this long or longer reads as the item's main content (its post text,
// its note) rather than a labeled detail line; shorter strings keep their field label for context.
const BODY_PROMOTE_LENGTH = 30;

export function gateItemView(item: GTMItem): GateItemView {
  const it = item as Record<string, unknown>;
  let body = pickStr(it.draft_note, it.draft, it.message, it.summary, it.text, it.content, it.body, it.verdictWhy, it.highestLeverageFix, it.recommendation);
  // `type` is a valid subject fallback for display, but NOT a real subject for the hollow test — a bare
  // output-kind label ("outreach-draft") must never make an empty item look approvable.
  const realSubject = pickStr(it.suggested_subject_line, it.subject, it.founder_name, it.name, it.handle);
  // No real subject? The title reads off the item's own CONTENT — the first line of its message/body —
  // never the raw `type` word ("context" / "signal" / "draft"), which is an internal enum, not a headline.
  // Only when there's truly no content does it fall to the generic "Staged action".
  const rawSubject = realSubject ?? firstLine(body) ?? "Staged action";
  // A title never reads as a code identifier — a raw key like "planner_meta" becomes "Planner Meta".
  const subject = looksLikeRawKey(rawSubject) ? titleCase(humanizeKey(rawSubject)) : rawSubject;
  const evidence = pickStr(it.grounding_citation, it.icpFitRationale, it.fitRationale, it.nowTrigger);
  const trigger = pickStr(it.nowTrigger, it.now_trigger);
  const who = pickStr(it.role, it.title, it.company);
  const sourceUrl = pickStr(it.sourceUrl, it.url, it.founder_github_or_url);
  // Everything else the item actually carries, rendered plainly — the open half of the view. Two kinds:
  // flat scalar fields land in `fields` (shown as labeled lines on the card); nested structure (objects,
  // lists of objects) lands in `receipt` as an indented outline behind an expandable — the model's real
  // output is NEVER dropped, only tucked. Only true machinery (identifier keys, machine tokens) stays hidden.
  const fields: GateItemField[] = [];
  const receipt: GateReceiptLine[] = [];
  let bestStringIdx = -1; // index into `fields` of the longest free-form STRING field
  for (const [key, value] of Object.entries(it)) {
    if (BOOKKEEPING_KEYS.has(key) || SLOTTED_KEYS.has(key)) continue;
    if (isMachineryKey(key)) continue;        // run/graph/agent ids and pointers — never founder content
    if (isStructuralValue(value)) {
      // Nested planning blob — no longer dropped. It expands into a readable outline on the receipt so the
      // founder can inspect exactly what the crew attached, instead of the card silently swallowing it.
      receipt.push(...receiptLines(value, 0, humanizeKey(key)));
      continue;
    }
    const rendered = renderFieldValue(value);
    if (!rendered) continue;
    if (isMachineryValue(rendered)) continue; // a machine id hiding under an innocent key
    fields.push({ label: humanizeKey(key), value: rendered });
    if (typeof value === "string" && (bestStringIdx === -1 || rendered.length > fields[bestStringIdx].value.length)) {
      bestStringIdx = fields.length - 1;
    }
  }
  // No known body alias? The most substantial free-form string field IS the reviewable content —
  // a { post_text } post reads as a post, not as a hollow outreach draft.
  if (!body && bestStringIdx >= 0 && fields[bestStringIdx].value.length >= BODY_PROMOTE_LENGTH) {
    body = fields[bestStringIdx].value;
    fields.splice(bestStringIdx, 1);
  }
  const hollow = !body && !realSubject && !evidence && !trigger && !who && !sourceUrl && !fields.length && !receipt.length;
  return { subject, body, evidence, trigger, who, sourceUrl, fields, receipt, hollow };
}

// ─── The case behind a ranked item — the reasoning rail's real source ─────────
// The Split-Stage gate stands the founder's decision beside WHY each option got where it did. That
// "why" is not fabricated crew dialogue — it is the real reasoning the run already stamped on the
// item: the teammate/tool that produced it, its verdict, its composite score, the case it makes
// (verdictWhy / recommendation / rationale), the grounding evidence, and any scored dimensions with
// their notes. Every field degrades to null/[] when the run recorded none, so a thin item reads as a
// thin case honestly — the rail never invents a sentence the item doesn't carry.
export type GateItemDimension = { label: string; score: number | null; note: string | null };
export type GateItemReason = {
  agent: string | null;      // the teammate/tool that produced this item (source.tool), plain
  verdict: string | null;    // the run's own verdict line, e.g. "strong-fit — ship as keystone"
  score: number | null;      // composite score, when the run scored it
  theCase: string | null;    // the argument for this item, in the run's words
  evidence: string | null;   // the grounding it rides
  dimensions: GateItemDimension[];
};

function pickNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

// One scored dimension normalized from the item's `dimensions` — tolerant of the field-name variance
// different agents emit (name/label/dimension, score/value, note/why/rationale).
function normalizeDimension(raw: unknown): GateItemDimension | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const label = pickStr(d.label, d.name, d.dimension, d.key);
  if (!label) return null;
  return {
    label: humanizeKey(label),
    score: pickNum(d.score, d.value, d.rating),
    note: pickStr(d.note, d.why, d.rationale, d.reason),
  };
}

export function gateItemReason(item: GTMItem): GateItemReason {
  const it = item as Record<string, unknown>;
  const source = it.source as { tool?: string } | undefined;
  const agent = source && typeof source.tool === "string" && source.tool.trim() ? source.tool.trim() : null;
  const rawDims = Array.isArray(it.dimensions) ? it.dimensions : Array.isArray(it.dims) ? it.dims : [];
  const dimensions = rawDims.map(normalizeDimension).filter((d): d is GateItemDimension => !!d);
  return {
    agent,
    verdict: pickStr(it.verdict, it.fit_verdict, it.recommendation_verdict),
    score: pickNum(it.composite_score, it.score, it.compositeScore),
    theCase: pickStr(it.verdictWhy, it.recommendation, it.rationale, it.the_case, it.summary),
    evidence: pickStr(it.grounding_citation, it.icpFitRationale, it.fitRationale, it.nowTrigger, it.now_trigger),
    dimensions,
  };
}

// ─── Pattern / exception split — the gate-bloom's two faces ───────────────────
// A promoted pipeline (trusted/autonomous) carries a blessed pattern the gate auto-applies to the
// clean items and escalates only the exceptions. brain/src/gate-pattern.mjs is the source of truth:
// a clean item comes back stamped viaPattern:true (auto-cleared, no founder eyes needed); a deviating
// item comes back isException:true with the reasons it needs review. The canvas bloom reads exactly
// these stamps so it collapses the cleared items into one receipt and blooms only the exceptions.

// Auto-cleared by the blessed pattern — the founder's standing approval already released it, so it
// never blooms; it only feeds the "N cleared" receipt line.
export function gateItemPatternCleared(item: GTMItem): boolean {
  return (item as Record<string, unknown>).viaPattern === true;
}

// This item deviates from the blessed pattern and needs the founder's own eyes (low confidence,
// flagged, or no draft body). Blooms as a full card carrying its reasons.
export function gateItemIsException(item: GTMItem): boolean {
  return (item as Record<string, unknown>).isException === true;
}

// The reasons an item was kicked back for individual review — shown as the "hold for your eyes" note
// on an exception card. Empty when the run recorded none.
export function gateItemExceptionReasons(item: GTMItem): string[] {
  const r = (item as Record<string, unknown>).reasons;
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

// ─── Evidence in the draft — the truth layer, made tappable ───────────────────
// A drafted item MAY carry evidence_lines: each pairs an exact claim sentence/phrase from the draft
// with the scan ref (path:line) that grounds it. The gate renders these so the founder can tap a
// claim and see the line it came from. Absent on most items — the reader returns [] and the card
// renders the draft plainly, no unfold. `ref` is kept as-authored ("path:line"); `claim` is the
// exact text to match against a sentence in the body.
export type GateEvidenceLine = { claim: string; ref: string };

export function gateItemEvidenceLines(item: GTMItem): GateEvidenceLine[] {
  const raw = (item as Record<string, unknown>).evidence_lines;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const claim = typeof (e as { claim?: unknown })?.claim === "string" ? (e as { claim: string }).claim.trim() : "";
    const ref = typeof (e as { ref?: unknown })?.ref === "string" ? (e as { ref: string }).ref.trim() : "";
    return claim && ref ? [{ claim, ref }] : [];
  });
}

// ─── Promote by Replay — the autonomy ladder, relocated onto the gate bloom ─────
// One of the founder's real past gate calls, replayed on the gate as the evidence basis for a
// standing-approval promotion: the ✓/✕ they actually gave, and (when the ledger recorded it) what it
// was on. The gate flashes the last ~dozen of these before the founder holds to promote.
export type GateReplayDecision = { decision: "approve" | "reject"; subject?: string };

// Everything the on-canvas gate needs to run the promote/revoke gesture in place, bound to the
// focused pipeline. The host (App) sources these from the pipeline's channel meta, the release-role
// check, and the run ledger of past gate decisions, and wires the same promoteChannel/revokeChannel
// handlers the Approvals panel used — so relocating the control is mechanical.
export type GatePromote = {
  channel: ChannelMeta;
  canRelease: boolean;
  replayDecisions: GateReplayDecision[];
  onPromote: (level: "trusted" | "autonomous", note: string) => Promise<void>;
  onRevoke: () => Promise<void>;
};

// ─── The staged run bag the on-canvas gate blooms from ─────────────────────────
// When a staged run pauses at its founder gate, App resolves the real gate node id, its staged
// items, the taste count learned so far, the pipeline's offer, and (when the pipeline is promoted)
// the promote/revoke control, and hands this bag to the canvas so the gate review blooms in place.
// The wall is untouched: onSubmitReview banks each decision into the run ledger and resumes; nothing
// here sends. Absent when no run is paused — the canvas then renders normally.
export type GateBag = {
  // The gate node the staged items belong to — App resolves the real id from the run, never synthesized.
  gateNodeId: string;
  items: GTMItem[];
  learned: number;
  offer: string | null;
  promote?: GatePromote;
  onSubmitReview: (nodeId: string, decisions: Record<string, GateDecision>) => void;
  // The outcome door on an approved card: record what actually came back on a sent item, keyed off its
  // provenance id (joinKey when minted, else gtmActionId). Records what ALREADY happened — never sends.
  onRecordOutcome?: (item: GTMItem, outcome: { outcomeKind: string; value?: number }) => void | Promise<void>;
};

// ─── The pipeline's offer, on the gate card ────────────────────────────────────
// The deal a pipeline's staged work carries, in plain words: the pipeline's own offer statement plus
// any extra fields the composer attached ("50% off the first month (expires 2026-07-04)"). Null when
// the pipeline states none — the caller may then fall back to the project's standing offer.
export function channelOfferLine(channel: Pick<ChannelMeta, "offer"> | null | undefined): string | null {
  const offer = channel?.offer;
  if (!offer || typeof offer !== "object") return null;
  const statement = typeof offer.statement === "string" ? offer.statement.trim() : "";
  if (!statement) return null;
  const extras = Object.entries(offer)
    .filter(([key, value]) => key !== "statement" && typeof value === "string" && value.trim())
    .map(([key, value]) => `${humanizeKey(key)} ${String(value).trim()}`);
  return extras.length ? `${statement} (${extras.join(" · ")})` : statement;
}

// A short, mono-legible provenance note for a staged draft: where it came from. The item's source
// pointer (the connector/tool that fetched it, tagged observed/inferred/blind) when present, else the
// URL the scout found them at. null when the run recorded no provenance.
export function gateItemProvenance(item: GTMItem): string | null {
  const source = (item as Record<string, unknown>).source as { tool?: string; tag?: string } | undefined;
  if (source && typeof source.tool === "string" && source.tool.trim()) {
    // The teammate who produced it, in plain words — never the raw agent ref ("aeo-content-planner").
    const tool = looksLikeRawKey(source.tool) ? titleCase(humanizeKey(source.tool)) : source.tool.trim();
    return typeof source.tag === "string" && source.tag.trim() ? `via ${tool} · ${source.tag}` : `via ${tool}`;
  }
  return gateItemView(item).sourceUrl;
}
