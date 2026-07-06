// GateReview — the founder gate, extracted from GraphCanvas so it can mount on ANY surface.
//
// These three components (EvidenceBody, GatePromotePanel, GateReview) read nothing from ReactFlow or
// node context — only plain props plus the gateItem helpers and canvas-gate.css. That is why the wall
// review can bloom on the old build-canvas AND inside the GTM map without a rewrite: it is pure props.
// Wall semantics are unchanged — onSubmit still banks each decision into the run ledger and resumes;
// the autonomy ladder (GatePromotePanel) still moves only by an explicit founder hold.

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, ChevronUp, CircleDot, CornerDownLeft, Loader, Pencil, ShieldCheck, Sprout, Undo2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { itemKey } from "@/lib/itemKey";
import {
  gateItemView, gateItemPatternCleared, gateItemIsException, gateItemExceptionReasons, gateItemProvenance,
  gateItemEvidenceLines,
} from "@/lib/gateItem";
import type { GateEvidenceLine, GatePromote } from "@/lib/gateItem";
import type { GateDecision, GTMItem } from "@/types";
import "@/styles/canvas-gate.css";

// Split a draft body into sentences for the evidence pass, keeping each sentence's own trailing
// punctuation and whitespace so re-joining them renders the original text verbatim.
function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g);
  return parts && parts.length ? parts : [text];
}

const normalizeClaim = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// The draft body with its claims made tappable against the scan. When the item carries evidence_lines,
// each sentence that matches a grounded claim reads at full ink and unfolds its ref (path:line) inline
// on tap; sentences with no evidence recede to a lighter weight, so the eye separates what's grounded
// from what's asserted. No evidence_lines → the plain body, nothing to unfold (the common case).
function EvidenceBody({ text, evidence }: { text: string; evidence: GateEvidenceLine[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (!evidence.length) return <p className="cgate-card-body">{text}</p>;
  const sentences = splitSentences(text);
  return (
    <p className="cgate-card-body cgate-card-body-evi">
      {sentences.map((raw, i) => {
        const norm = normalizeClaim(raw);
        const hit = evidence.find((e) => {
          const c = normalizeClaim(e.claim);
          return c.length > 0 && (norm.includes(c) || c.includes(norm));
        });
        if (!hit) return <span key={i} className="cgate-evi-plain">{raw}</span>;
        const isOpen = openIdx === i;
        return (
          <span key={i} className="cgate-evi-claim-wrap">
            <button
              type="button"
              className={cn("cgate-evi-claim", isOpen && "is-open")}
              title={isOpen ? "Hide the line this traces to" : `Grounded at ${hit.ref}`}
              onClick={(e) => { e.stopPropagation(); setOpenIdx(isOpen ? null : i); }}
            >
              {raw}
            </button>
            {isOpen ? <span className="cgate-evi-ref">{hit.ref}</span> : null}
          </span>
        );
      })}
    </p>
  );
}

// A staged draft can be a short outreach note or a long internal document. Left raw, a long one buries
// the gate — you can't scan five drafts when each is a 40-line wall. So a long body clamps to a readable
// preview with a fade, and opens fully on demand. Short drafts render whole, unchanged. The founder
// scans the pile, then reads in full only the one they're deciding on.
const LONG_BODY_CHARS = 300;
function CardBody({ text, evidence }: { text: string; evidence: GateEvidenceLine[] }) {
  const [open, setOpen] = useState(false);
  if (text.length <= LONG_BODY_CHARS) return <EvidenceBody text={text} evidence={evidence} />;
  return (
    <div className="cgate-body-collapse">
      <div className={cn("cgate-body-clip", !open && "is-clamped")}>
        <EvidenceBody text={text} evidence={evidence} />
      </div>
      <button
        type="button"
        className="cgate-body-toggle"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        {open ? <>Show less <ChevronUp size={12} aria-hidden /></> : <>Read full draft <ChevronDown size={12} aria-hidden /></>}
      </button>
    </div>
  );
}

// The autonomy ladder, relocated from the Approvals panel onto the gate bloom. Promoting is a founder
// act done in place: "Promote…" replays the pipeline's last real gate calls — the ✓/✕ the founder
// actually gave — as the evidence basis, then a press-and-hold commits the standing approval so the
// gate auto-clears clean items and still stops the exceptions. Autonomy moves ONLY by this explicit
// hold; nothing here is triggered by a run or by composition. Revoke stays one quiet click back to
// hold-everything. Degrades honestly: a pipeline with too thin a decision history isn't promotable yet.
const REPLAY_CAP = 12;
const PROMOTE_MIN_HISTORY = 3;
const HOLD_MS = 750;
function GatePromotePanel({ promote, cleanCount, exceptionCount }: {
  promote: GatePromote;
  cleanCount: number;
  exceptionCount: number;
}) {
  const { channel, canRelease, replayDecisions, onPromote, onRevoke } = promote;
  const level = (["draft", "trusted", "autonomous"].includes(channel.autonomy ?? "draft") ? channel.autonomy : "draft") as "draft" | "trusted" | "autonomous";
  const target: "trusted" | "autonomous" | null = level === "draft" ? "trusted" : level === "trusted" ? "autonomous" : null;
  const targetLabel = target === "autonomous" ? "autonomous" : "trusted";
  const history = replayDecisions.slice(-REPLAY_CAP);
  const promotable = canRelease && !!target && history.length >= PROMOTE_MIN_HISTORY;

  const [engaged, setEngaged] = useState(false);
  const [note, setNote] = useState("");
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);
  const holdTimer = useRef<number | null>(null);

  const clearHold = () => {
    if (holdTimer.current != null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    setHolding(false);
  };
  useEffect(() => () => { if (holdTimer.current != null) window.clearTimeout(holdTimer.current); }, []);

  const commit = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      await onPromote(target, note.trim() || `Approve drafts like the ${history.length} you just cleared by hand`);
      setEngaged(false);
      setNote("");
    } finally {
      setBusy(false);
    }
  };
  const startHold = () => {
    if (busy || holding) return;
    setHolding(true);
    holdTimer.current = window.setTimeout(() => { holdTimer.current = null; setHolding(false); void commit(); }, HOLD_MS);
  };
  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    try { await onRevoke(); } finally { setBusy(false); }
  };

  return (
    <div className="cgate-promote" onClick={(e) => e.stopPropagation()}>
      <div className="cgate-promote-rung" title="Autonomy moves only by an explicit founder hold — never by a run or by composition.">
        <span className="cgate-promote-ladder" aria-hidden>
          <i className="on" />
          <i className={cn((level === "trusted" || level === "autonomous") && "on")} />
          <i className={cn(level === "autonomous" && "on")} />
        </span>
        <b>{level === "draft" ? "Draft" : level === "trusted" ? "Trusted" : "Autonomous"}</b>
        <span className="cgate-promote-rung-blurb">
          {level === "draft" ? "the gate holds every item" : level === "trusted" ? "clean items auto-clear, exceptions stop" : "standing approval runs it, exceptions stop"}
        </span>
      </div>

      {!engaged ? (
        <div className="cgate-promote-controls">
          {target ? (
            promotable ? (
              <button type="button" className="cgate-promote-open" onClick={() => setEngaged(true)}>
                <ShieldCheck size={11} aria-hidden /> Promote to {targetLabel}…
              </button>
            ) : (
              <span className="cgate-promote-thin">
                {canRelease
                  ? `Decide ${PROMOTE_MIN_HISTORY - history.length > 0 ? PROMOTE_MIN_HISTORY - history.length : "a few"} more by hand to promote — not enough of your calls to replay yet.`
                  : "Only an owner or approver can promote a pipeline."}
              </span>
            )
          ) : (
            <span className="cgate-promote-thin">This pipeline is at the top of the ladder.</span>
          )}
          {level !== "draft" ? (
            <button type="button" className="cgate-promote-revoke" disabled={!canRelease || busy} onClick={() => void revoke()}>
              <Undo2 size={11} aria-hidden /> Drop to draft
            </button>
          ) : null}
        </div>
      ) : (
        <div className="cgate-promote-replay">
          <p className="cgate-promote-replay-lead">Your last {history.length} calls on this pipeline — the pattern you're about to bank:</p>
          <div className="cgate-promote-strip" role="list" aria-label="Your recent gate decisions">
            {history.map((d, i) => (
              <span
                key={i}
                role="listitem"
                className={cn("cgate-replay-chip", d.decision === "approve" ? "is-approve" : "is-reject")}
                style={{ animationDelay: `${i * 0.07}s` }}
                title={d.subject ? `${d.decision === "approve" ? "You approved" : "You returned"}: ${d.subject}` : undefined}
              >
                {d.decision === "approve" ? <Check size={10} aria-hidden /> : <X size={10} aria-hidden />}
              </span>
            ))}
          </div>
          <div className="cgate-promote-band">
            Once banked, {cleanCount} clean draft{cleanCount === 1 ? "" : "s"} would release on your standing approval
            {exceptionCount > 0 ? `; ${exceptionCount} exception${exceptionCount === 1 ? "" : "s"} would still stop for your eyes.` : "; exceptions still stop for your eyes."}
          </div>
          <input
            className="cgate-promote-note"
            value={note}
            placeholder={`What are you blessing? e.g. ${target === "autonomous" ? "this play is proven — run it" : "approve any draft to a vetted founder"}`}
            onChange={(e) => setNote(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="cgate-promote-actions">
            <button
              type="button"
              className={cn("cgate-promote-hold", holding && "is-holding")}
              disabled={busy}
              onPointerDown={startHold}
              onPointerUp={clearHold}
              onPointerLeave={clearHold}
              onPointerCancel={clearHold}
            >
              <span className="cgate-promote-hold-fill" aria-hidden />
              <span className="cgate-promote-hold-label">
                {busy ? <Loader size={11} className="spin" aria-hidden /> : <ShieldCheck size={11} aria-hidden />}
                {busy ? "Banking…" : holding ? "Hold to bless…" : `Hold to promote to ${targetLabel}`}
              </span>
            </button>
            <button type="button" className="cgate-promote-cancel" disabled={busy} onClick={() => { clearHold(); setEngaged(false); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The outcome door on an approved card. Once the founder releases an item, the real result comes back
// later — a reply, a meeting, a signup, a purchase. This records THAT, keyed off the item's joinKey, so
// the outcome joins back to the run + path that produced it. It records what already happened; it never
// sends. Common kinds are one tap; anything else is free text. A recorded outcome collapses to a receipt.
const OUTCOME_QUICK_KINDS = ["reply", "meeting", "signup", "purchase", "no-response"];
function RecordOutcome({ item, onRecord }: {
  item: GTMItem;
  onRecord: (item: GTMItem, outcome: { outcomeKind: string; value?: number }) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (outcomeKind: string) => {
    const k = outcomeKind.trim();
    if (!k || busy) return;
    setBusy(true);
    setError(null);
    const num = value.trim() ? Number(value.trim()) : undefined;
    try {
      await onRecord(item, { outcomeKind: k, ...(num != null && !Number.isNaN(num) ? { value: num } : {}) });
      setRecorded(k);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't record — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (recorded) {
    return (
      <div className="cgate-outcome is-recorded">
        <Check size={10} aria-hidden /> Recorded: {recorded}
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" className="cgate-outcome-open" onClick={() => setOpen(true)}>
        <CircleDot size={10} aria-hidden /> Record what happened
      </button>
    );
  }
  return (
    <div className="cgate-outcome" onClick={(e) => e.stopPropagation()}>
      <div className="cgate-outcome-chips">
        {OUTCOME_QUICK_KINDS.map((k) => (
          <button key={k} type="button" className="cgate-outcome-chip" disabled={busy} onClick={() => void submit(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="cgate-outcome-custom">
        <input
          className="cgate-outcome-kind"
          value={kind}
          placeholder="or type what happened"
          disabled={busy}
          onChange={(e) => setKind(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(kind); }}
        />
        <input
          className="cgate-outcome-value"
          value={value}
          placeholder="value"
          inputMode="decimal"
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="button" className="cgate-outcome-save" disabled={busy || !kind.trim()} onClick={() => void submit(kind)}>
          {busy ? <Loader size={10} className="spin" aria-hidden /> : "Save"}
        </button>
        <button type="button" className="cgate-outcome-cancel" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error ? <p className="cgate-outcome-error" role="alert">{error}</p> : null}
    </div>
  );
}

// The founder gate, ON the canvas. When a run pauses at a gate, its staged drafts bloom out of the
// gate node as first-class cards you read and decide in place — approve / edit-then-approve / reject —
// instead of bouncing to a side rail. Each decision calls onSubmit (the node-bound onSubmitReview),
// which banks the per-item call into the run ledger and resumes; the decision also lands optimistically
// so the card resolves instantly under your hand. This is the product's moment: reviewing real work
// where the work lives. Never renders a hollow item as approvable — an empty draft only offers Reject.
const GATE_CARD_CAP = 6;
export function GateReview({ items, onSubmit, learned, promote, offer, onRecordOutcome }: {
  items: GTMItem[];
  // May be async — GateReview awaits it so a failed release/return reverts the optimistic verdict and
  // surfaces the error instead of silently losing the founder's decision.
  onSubmit?: (decisions: Record<string, GateDecision>) => void | Promise<void>;
  learned: number;
  promote?: GatePromote;
  // The deal the staged work carries — shown so the founder reviews drafts against the offer they ride.
  offer?: string | null;
  // The outcome door: after an item is approved, the founder records what actually happened (a reply, a
  // meeting, a purchase) keyed off the item's joinKey. Records what ALREADY happened — never sends.
  // Absent when the host has no project context to post against.
  onRecordOutcome?: (item: GTMItem, outcome: { outcomeKind: string; value?: number }) => void | Promise<void>;
}) {
  const [clearedOpen, setClearedOpen] = useState(false);
  const [decided, setDecided] = useState<Record<string, "approve" | "reject">>({});
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  // Busy + error, mirroring GatePromotePanel: a decision is optimistic AND awaited. While a submit is in
  // flight the actions lock; if it rejects, the optimistic verdict reverts and the error shows — the
  // founder never loses a decision to a silent failure.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitFailed = "That decision didn't go through — nothing was released. Try again.";
  // The review panel only swallows clicks so reviewing a draft doesn't deselect the gate node
  // underneath. This MUST be a React onClick (matching GatePromotePanel / RecordOutcome in this same
  // file), not a native addEventListener: a native bubble-phase stopPropagation on the wrapper never
  // reaches React's delegated root listener, so it would silently kill the Approve/Reject/Edit
  // buttons' own onClick handlers. React's stopPropagation stops React-level bubbling only AFTER the
  // descendant handlers have run — so the buttons fire and the gate node still isn't deselected.
  const decide = async (key: string, decision: "approve" | "reject", editedDraft?: string) => {
    if (busy) return;
    const prev = decided[key];
    setDecided((d) => ({ ...d, [key]: decision }));
    setEditing((e) => (e?.key === key ? null : e));
    setError(null);
    if (!onSubmit) return;
    setBusy(true);
    try {
      await onSubmit({ [key]: editedDraft != null ? { decision, editedDraft } : { decision } });
    } catch (e) {
      // The submit didn't land — put the card back to its actionable state so the founder can retry.
      setDecided((d) => {
        const next = { ...d };
        if (prev) next[key] = prev; else delete next[key];
        return next;
      });
      setError(e instanceof Error ? e.message : submitFailed);
    } finally {
      setBusy(false);
    }
  };
  // The blessed pattern already released the clean items (viaPattern) — they collapse into one receipt
  // line, they never bloom. Only the items still needing the founder's own eyes open as cards. Each row
  // keeps its ORIGINAL index so itemKey's fallback stays aligned with the brain's draftKey — a filtered
  // index would map a banked decision to the wrong draft. On a plain draft gate nothing is viaPattern,
  // so every item blooms exactly as before.
  const rows = items.map((it, i) => ({ it, i }));
  const clearedRows = rows.filter(({ it }) => gateItemPatternCleared(it));
  const clearedCount = clearedRows.length;
  const bloom = rows.filter(({ it }) => !gateItemPatternCleared(it));
  const exceptionCount = bloom.reduce((n, { it }) => n + (gateItemIsException(it) ? 1 : 0), 0);
  // The clean drafts a promotion would auto-clear — every staged item the pattern could vouch for
  // (has a body, not flagged, not already cleared). Drives the promote panel's "what will release" band.
  const cleanTotal = bloom.reduce((n, { it }) => n + (!gateItemView(it).hollow && !gateItemIsException(it) ? 1 : 0), 0);
  // The standing approval that released the cleared pile — surfaced as the audit basis when it's fanned.
  const clearedBasis = promote?.channel.blessedPattern?.note?.trim() || null;
  // Batch approve every clean, still-undecided draft at once — the pattern-approval the gate is built
  // for, so a volume run doesn't demand per-item clicks. Exceptions are excluded by definition: each
  // one needs an individual call.
  const approveAllClean = async () => {
    if (busy) return;
    const batch: Record<string, GateDecision> = {};
    const nextDecided: Record<string, "approve" | "reject"> = {};
    bloom.forEach(({ it, i }) => {
      const key = itemKey(it, i);
      if (!gateItemView(it).hollow && !gateItemIsException(it) && !decided[key]) { batch[key] = { decision: "approve" }; nextDecided[key] = "approve"; }
    });
    const keys = Object.keys(batch);
    if (!keys.length) return;
    setDecided((d) => ({ ...d, ...nextDecided }));
    setError(null);
    if (!onSubmit) return;
    setBusy(true);
    try {
      await onSubmit(batch);
    } catch (e) {
      // Roll back the whole batch so none of the drafts read as released when the submit failed.
      setDecided((d) => {
        const next = { ...d };
        for (const k of keys) delete next[k];
        return next;
      });
      setError(e instanceof Error ? e.message : submitFailed);
    } finally {
      setBusy(false);
    }
  };
  const cleanUndecided = bloom.reduce((n, { it, i }) => n + (!gateItemView(it).hollow && !gateItemIsException(it) && !decided[itemKey(it, i)] ? 1 : 0), 0);
  const shown = bloom.slice(0, GATE_CARD_CAP);
  return (
    <div className="cgate-review" onClick={(e) => e.stopPropagation()}>
      <div className="cgate-review-lead">
        <span className="cgate-review-count">
          {exceptionCount > 0
            ? `${exceptionCount} exception${exceptionCount === 1 ? "" : "s"} for your eyes · nothing sends until you approve`
            : `${bloom.length} staged · nothing sends until you approve`}
        </span>
        {learned > 0 ? (
          <span className="cgate-review-taste" title="Drafted from your past gate decisions">
            <Sprout size={9} aria-hidden /> tuned by {learned} of your calls
          </span>
        ) : null}
        {offer ? (
          <p className="cgate-review-offer">The deal this work carries: {offer}</p>
        ) : null}
        {error ? <p className="cgate-review-error" role="alert">{error}</p> : null}
      </div>
      {cleanUndecided > 1 && onSubmit ? (
        <button className="cgate-approve-all" type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); void approveAllClean(); }}>
          <Check size={12} aria-hidden /> Approve all {cleanUndecided} clean drafts
        </button>
      ) : null}
      <div className="cgate-cards">
        {shown.map(({ it: item, i }) => {
          const key = itemKey(item, i);
          const v = gateItemView(item);
          const state = decided[key];
          const isEditing = editing?.key === key;
          if (state) {
            // An approved item can carry a real outcome back — the founder records what happened here,
            // keyed off the item's joinKey. Only when the host wired the door AND the item has a join key.
            const canRecord = state === "approve" && !!onRecordOutcome && !!(item as { joinKey?: unknown }).joinKey;
            return (
              <div className={cn("cgate-card", "is-decided", `is-${state}`)} key={key}>
                <span className="cgate-card-to">{v.subject}</span>
                <span className="cgate-card-verdict">{state === "approve" ? "Approved" : "Returned"}</span>
                {canRecord ? <RecordOutcome item={item} onRecord={onRecordOutcome!} /> : null}
              </div>
            );
          }
          if (v.hollow) {
            return (
              <div className="cgate-card is-hollow" key={key}>
                <span className="cgate-card-to"><AlertTriangle size={11} aria-hidden /> Nothing to review</span>
                <p className="cgate-card-note">This item reached your review with nothing in it — no text and no details to read. Return it, or look at the step that produced it.</p>
                <div className="cgate-card-actions">
                  <button className="cgate-reject" type="button" disabled={busy} onClick={() => void decide(key, "reject")}>
                    <CornerDownLeft size={11} aria-hidden /> Return as draft
                  </button>
                </div>
              </div>
            );
          }
          const isException = gateItemIsException(item);
          const reasons = isException ? gateItemExceptionReasons(item) : [];
          const provenance = gateItemProvenance(item);
          const evidence = gateItemEvidenceLines(item);
          return (
            <div className={cn("cgate-card", isException && "is-exception")} key={key}>
              <span className="cgate-card-to">
                {isException ? <AlertTriangle size={11} aria-hidden /> : null}
                {v.subject}
              </span>
              {provenance ? <span className="cgate-card-prov">{provenance}</span> : null}
              {/* An exception carries the reason it deviated from the pattern — the "hold for your eyes"
                  note, so the founder knows why this one bloomed instead of clearing. */}
              {reasons.length > 0 && !isEditing ? (
                <p className="cgate-card-annot"><span className="cgate-card-annot-plus" aria-hidden>+</span>{reasons.join(" · ")}</p>
              ) : null}
              {isEditing ? (
                <textarea
                  className="cgate-card-edit"
                  value={editing.text}
                  rows={5}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditing({ key, text: e.target.value })}
                />
              ) : (
                <>
                  {v.body ? (
                    <CardBody text={v.body} evidence={evidence} />
                  ) : v.trigger || v.who || v.sourceUrl ? (
                    // Outreach framing ONLY when the item carries outreach fields — a staged
                    // prospect with no message yet reads as who/why/where, exactly as before.
                    <div className="cgate-card-prospect">
                      {v.trigger ? <p><span className="k">Now</span> {v.trigger}</p> : null}
                      {v.who ? <p><span className="k">Who</span> {v.who}</p> : null}
                      {v.sourceUrl ? <p><span className="k">Source</span> {v.sourceUrl}</p> : null}
                    </div>
                  ) : null}
                  {/* Whatever ELSE the item actually carries (a post's schedule, an offer, media…)
                      renders as labeled lines — the item's own shape, no outreach template imposed. */}
                  {v.fields.length > 0 ? (
                    <div className="cgate-card-prospect">
                      {v.fields.map((f) => (
                        <p key={f.label}><span className="k">{f.label}</span> {f.value}</p>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
              {v.evidence && !isEditing ? <p className="cgate-card-why">Why them: {v.evidence}</p> : null}
              <div className="cgate-card-actions">
                {isEditing ? (
                  <>
                    <button className="cgate-approve" type="button" disabled={busy || !editing.text.trim()}
                      onClick={() => void decide(key, "approve", editing.text)}>Save &amp; approve</button>
                    <button className="cgate-ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="cgate-approve" type="button" disabled={busy} onClick={() => void decide(key, "approve")}>
                      <Check size={11} aria-hidden /> Approve &amp; release
                    </button>
                    <button className="cgate-reject" type="button" disabled={busy} onClick={() => void decide(key, "reject")}>
                      <CornerDownLeft size={11} aria-hidden /> Return as draft
                    </button>
                    <button className="cgate-edit" type="button" disabled={busy} onClick={() => setEditing({ key, text: v.body ?? "" })}>
                      <Pencil size={11} aria-hidden /> Edit
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {bloom.length > GATE_CARD_CAP ? (
        <p className="cgate-more">+{bloom.length - GATE_CARD_CAP} more staged</p>
      ) : null}
      {/* Pattern-cleared pile — the founder's standing approval already released these clean items, so
          they collapse into one green line instead of blooming. It's a receipt you can audit, never a
          hiding place: tap it to fan the cleared items and the pattern that released each. Exceptions
          still bloom above and demand eyes. */}
      {clearedCount > 0 ? (
        <div className="cgate-cleared-pile">
          <button
            type="button"
            className="cgate-cleared"
            aria-expanded={clearedOpen}
            onClick={(e) => { e.stopPropagation(); setClearedOpen((o) => !o); }}
          >
            <Check size={11} aria-hidden />
            <span>{clearedCount} cleared by your pattern</span>
            {clearedOpen ? <ChevronDown size={11} aria-hidden /> : <ChevronRight size={11} aria-hidden />}
          </button>
          {clearedOpen ? (
            <div className="cgate-cleared-list">
              {clearedBasis ? (
                <p className="cgate-cleared-basis">Released on your standing approval: “{clearedBasis}”</p>
              ) : (
                <p className="cgate-cleared-basis">Released on your standing approval for this pipeline.</p>
              )}
              {clearedRows.map(({ it, i }) => {
                const cv = gateItemView(it);
                const prov = gateItemProvenance(it);
                return (
                  <div className="cgate-cleared-row" key={itemKey(it, i)}>
                    <Check size={10} aria-hidden />
                    <span className="cgate-cleared-subj">{cv.subject}</span>
                    {prov ? <span className="cgate-cleared-prov">{prov}</span> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Promote by Replay — the autonomy ladder, on the gate. Present only for the focused pipeline
          (the host wires it), so the founder promotes standing approval right where the wall lives. */}
      {promote ? (
        <GatePromotePanel promote={promote} cleanCount={cleanTotal} exceptionCount={exceptionCount} />
      ) : null}
    </div>
  );
}