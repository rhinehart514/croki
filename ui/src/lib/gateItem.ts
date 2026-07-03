import type { ChannelMeta, GateDecision, GTMItem } from "@/types";

// First non-empty string among loosely-typed item fields. Staged gate items carry free-form keys
// depending on which connector/agent produced them, so every reader coalesces across the aliases.
export function pickStr(...vals: unknown[]): string | null {
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
export type GateItemField = { label: string; value: string };

// The one normalized view of a staged gate item. The founder gate's rail AND the on-canvas gate
// review both render from this, so the two surfaces can never disagree about what a draft says or
// whether it's hollow. The known aliases live here once — the drafter emits
// draft_note / suggested_subject_line / founder_name / grounding_citation; older connectors emit
// draft / subject / name — and everything ELSE the item carries lands in `fields`, so a staged
// item of ANY shape (a post, a note, a page) shows the actual thing about to reach the world.
export type GateItemView = {
  subject: string;
  body: string | null;
  evidence: string | null;
  trigger: string | null;
  who: string | null;
  sourceUrl: string | null;
  fields: GateItemField[];
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
  const subject = realSubject ?? pickStr(it.type) ?? "Staged action";
  const evidence = pickStr(it.grounding_citation, it.icpFitRationale, it.fitRationale, it.nowTrigger);
  const trigger = pickStr(it.nowTrigger, it.now_trigger);
  const who = pickStr(it.role, it.title, it.company);
  const sourceUrl = pickStr(it.sourceUrl, it.url, it.founder_github_or_url);
  // Everything else the item actually carries, rendered plainly — the open half of the view.
  const fields: GateItemField[] = [];
  let bestStringIdx = -1; // index into `fields` of the longest free-form STRING field
  for (const [key, value] of Object.entries(it)) {
    if (BOOKKEEPING_KEYS.has(key) || SLOTTED_KEYS.has(key)) continue;
    const rendered = renderFieldValue(value);
    if (!rendered) continue;
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
  const hollow = !body && !realSubject && !evidence && !trigger && !who && !sourceUrl && !fields.length;
  return { subject, body, evidence, trigger, who, sourceUrl, fields, hollow };
}

// A staged gate item is "hollow" ONLY when the run produced nothing reviewable for it of ANY
// shape: no body, no open content fields, no prospect fields (now-trigger / who / source), no
// evidence, and no real subject — only the bare output-kind label and run bookkeeping. The gate
// shows a hollow item as empty and refuses a one-click approve, never as an approvable draft.
export function isHollowGateItem(item: GTMItem): boolean {
  return gateItemView(item).hollow;
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
    return typeof source.tag === "string" && source.tag.trim() ? `via ${source.tool} · ${source.tag}` : `via ${source.tool}`;
  }
  return gateItemView(item).sourceUrl;
}
