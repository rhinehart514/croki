import type { ChannelMeta, GTMItem } from "@/types";

// First non-empty string among loosely-typed item fields. Staged gate items carry free-form keys
// depending on which connector/agent produced them, so every reader coalesces across the aliases.
export function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v;
  return null;
}

// The one normalized view of a staged gate item. The founder gate's rail AND the on-canvas gate
// review both render from this, so the two surfaces can never disagree about what a draft says or
// whether it's hollow. The field/alias lists live here once — the drafter emits
// draft_note / suggested_subject_line / founder_name / grounding_citation; older connectors emit
// draft / subject / name — so a real staged note shows its full subject, body, and the evidence for
// WHY this person, and a discovery motion (a staged prospect, no message yet) still reads.
export type GateItemView = {
  subject: string;
  body: string | null;
  evidence: string | null;
  trigger: string | null;
  who: string | null;
  sourceUrl: string | null;
  hollow: boolean;
};

export function gateItemView(item: GTMItem): GateItemView {
  const it = item as Record<string, unknown>;
  const body = pickStr(it.draft_note, it.draft, it.message, it.summary, it.text, it.content, it.verdictWhy, it.highestLeverageFix, it.recommendation);
  // `type` is a valid subject fallback for display, but NOT a real subject for the hollow test — a bare
  // output-kind label ("outreach-draft") must never make an empty item look approvable.
  const realSubject = pickStr(it.suggested_subject_line, it.subject, it.founder_name, it.name, it.handle);
  const subject = realSubject ?? pickStr(it.type) ?? "Staged action";
  const evidence = pickStr(it.grounding_citation, it.icpFitRationale, it.fitRationale, it.nowTrigger);
  const trigger = pickStr(it.nowTrigger, it.now_trigger);
  const who = pickStr(it.role, it.title, it.company);
  const sourceUrl = pickStr(it.sourceUrl, it.url, it.founder_github_or_url);
  const hollow = !body && !realSubject && !evidence && !trigger && !who && !sourceUrl;
  return { subject, body, evidence, trigger, who, sourceUrl, hollow };
}

// A staged gate item is "hollow" when the run produced nothing reviewable for it: no message body,
// no prospect fields (now-trigger / who / source), no evidence, and no real subject — only the bare
// output-kind label. An empty source produces hollow items; the gate shows them as empty and refuses
// a one-click approve, never as an approvable draft.
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
