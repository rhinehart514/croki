// GateDeltaCard — the multi-modal gate delta. One approval card that shows the CHANGE a motion staged,
// whatever kind it is, in ONE visual grammar: an outbound draft, a rendered sample page, and an in-repo
// product change are the same object on screen — same card, same header, same decision row. Only the
// delta pane differs by kind:
//
//   outbound → the verbatim message body being sent
//   page     → sampled real rendered pages from a generator ("3 of 1,240"), each in a read-only iframe
//   change   → a unified diff with the change named in a pill and the touched files listed
//
// The wall is unchanged here. This card decides nothing — it surfaces the delta and hands the founder's
// call back through onDecide. A code-native change carries a distinct, HEAVIER "Ship it live" confirm
// that sends deployConfirmed:true — the explicit SECOND authorization the deploy connector requires
// (an approve alone only stages it). Decisions persist as receipts (Sent / Shipped / Sent back chips).
//
// Pure props, no ReactFlow / node context — so it can mount inside the gate bloom, the stage room, or the
// Operator lens without a rewrite, exactly like GateReview's own sub-components.

import { useState } from "react";
import {
  Check, ChevronDown, ChevronRight, CornerDownLeft, FileDiff, Globe, Loader, Mail, Pencil, Rocket, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GateDelta, GateDeltaDecision, GateDeltaPage, GateDeltaReceipt } from "@/types";
import "@/styles/gate-delta.css";

// The verbatim outbound message. Left plain — the card never paraphrases what's being sent (invariant:
// the body the founder approves is exactly the body that goes). Whitespace preserved so a formatted
// email reads as written.
function OutboundDelta({ body }: { body: string }) {
  return <pre className="gdelta-body">{body}</pre>;
}

// A read-only, script-less iframe of one rendered page — the same static-preview technique
// MicroproductFace uses (srcDoc + sandbox="" so nothing runs or reaches out). Pointer-events off inside
// so the surrounding card owns the click. The page is shown at real width, scaled down to a thumbnail.
function PagePreview({ page }: { page: GateDeltaPage }) {
  return (
    <div className="gdelta-page">
      <div className="gdelta-page-route">
        <Globe size={11} aria-hidden />
        <span className="gdelta-page-path">{page.label?.trim() || page.route}</span>
      </div>
      <div className="gdelta-page-frame">
        <iframe
          title={`Preview of ${page.route}`}
          srcDoc={page.html}
          sandbox=""
          loading="lazy"
          tabIndex={-1}
          className="gdelta-page-iframe"
        />
      </div>
    </div>
  );
}

// A generator's sampled output at the gate. NOT the whole minted corpus — a real sample of rendered
// pages, and one honest line saying how many of how many. This is the "sampled preview" decision: the
// founder judges the generator by real pages, not a file dump.
function PageDelta({ delta }: { delta: GateDelta }) {
  const pages = delta.pages ?? [];
  const shown = delta.sampledFrom ?? pages.length;
  const total = delta.total ?? pages.length;
  return (
    <div className="gdelta-pages">
      {total > shown ? (
        <p className="gdelta-pages-count">
          Showing {shown} of {total.toLocaleString()} real pages this generator would mint from your data.
        </p>
      ) : (
        <p className="gdelta-pages-count">
          {total.toLocaleString()} {total === 1 ? "page" : "pages"} from your data.
        </p>
      )}
      <div className="gdelta-pages-grid">
        {pages.map((p, i) => <PagePreview key={`${p.route}-${i}`} page={p} />)}
      </div>
    </div>
  );
}

// A unified diff, colored ONLY where color carries meaning — an added line reads proven-green, a removed
// line reads danger-red, everything else stays monochrome ink. This is a diff, not decoration: the color
// is the signal. Long diffs clamp to a readable height and scroll inside their own pane so the card body
// never scrolls the page. Verbatim git output — never re-rendered or paraphrased.
function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="gdelta-diff" aria-label="Code change diff">
      {lines.map((line, i) => {
        const cls =
          line.startsWith("+++") || line.startsWith("---") ? "is-file"
            : line.startsWith("@@") ? "is-hunk"
              : line.startsWith("+") ? "is-add"
                : line.startsWith("-") ? "is-del"
                  : "is-ctx";
        return <span key={i} className={cn("gdelta-diff-line", cls)}>{line || " "}</span>;
      })}
    </pre>
  );
}

// The code-native delta: the change named in a pill, the touched files, and the diff. The pill is the
// same "delta named" grammar the outbound card gets — the change is stated in plain words, then shown.
function ChangeDelta({ delta }: { delta: GateDelta }) {
  const files = delta.files ?? [];
  return (
    <div className="gdelta-change">
      {delta.change ? (
        <span className="gdelta-change-pill">
          <FileDiff size={11} aria-hidden />
          <b>{delta.change.verb}</b> {delta.change.object}
        </span>
      ) : null}
      {delta.summary ? <p className="gdelta-change-summary">{delta.summary}</p> : null}
      {files.length > 0 ? (
        <div className="gdelta-files">
          {files.map((f) => (
            <span key={f.path} className="gdelta-file">
              <span className="gdelta-file-path">{f.path}</span>
              {typeof f.additions === "number" ? <span className="gdelta-file-add">+{f.additions}</span> : null}
              {typeof f.deletions === "number" ? <span className="gdelta-file-del">−{f.deletions}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
      {delta.diff ? <DiffView diff={delta.diff} /> : null}
    </div>
  );
}

const RECEIPT_LABEL: Record<GateDeltaReceipt, string> = {
  sent: "Sent",
  shipped: "Shipped",
  "sent-back": "Sent back",
};

export function GateDeltaCard({
  delta,
  onDecide,
  receipt = null,
  busy: busyProp = false,
}: {
  delta: GateDelta;
  // The founder's call, routed back to the gate. May be async; the card awaits it, locks its actions
  // while in flight, and surfaces an error (reverting nothing itself — the host owns the wall state).
  onDecide?: (decision: GateDeltaDecision) => void | Promise<void>;
  // When set, the card is already decided and renders as a persisted receipt chip instead of actions.
  receipt?: GateDeltaReceipt | null;
  // External busy lock (a sibling card in the same gate is submitting) — disables this card's actions.
  busy?: boolean;
}) {
  const codeNative = delta.kind === "change" && delta.deployConfirmable === true;
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [shipArmed, setShipArmed] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provOpen, setProvOpen] = useState(false);
  const busy = busyProp || localBusy;

  const run = async (decision: GateDeltaDecision) => {
    if (busy) return;
    setError(null);
    if (!onDecide) return;
    setLocalBusy(true);
    try {
      await onDecide(decision);
      setEditing(null);
      setNote(null);
      setShipArmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That decision didn't go through — nothing changed. Try again.");
    } finally {
      setLocalBusy(false);
    }
  };

  // Already decided — collapse to a persisted receipt chip that stays in the transcript.
  if (receipt) {
    return (
      <div className={cn("gdelta-card", "is-receipt", `is-${receipt}`)}>
        <div className="gdelta-head">
          <KindGlyph kind={delta.kind} />
          <span className="gdelta-title">{delta.title}</span>
          <span className="gdelta-receipt-chip">
            <Check size={11} aria-hidden /> {RECEIPT_LABEL[receipt]}
          </span>
        </div>
      </div>
    );
  }

  // The action row's copy is honest about what a yes does. A wired transport really sends/ships; without
  // one, an approve stages on the machine. This never changes the wall — only the words.
  const sendVerb = delta.transportConnected ? "Send it" : "Stage it";
  const shipPath = delta.shipPath?.trim() || "ships it live to your product";

  return (
    <div className={cn("gdelta-card", codeNative && "is-code-native", error && "has-error")}>
      <div className="gdelta-head">
        <KindGlyph kind={delta.kind} />
        <div className="gdelta-head-text">
          <span className="gdelta-title">{delta.title}</span>
          {delta.whatYourYesDoes ? <span className="gdelta-does">{delta.whatYourYesDoes}</span> : null}
        </div>
        {delta.motionLabel ? <span className="gdelta-motion">{delta.motionLabel}</span> : null}
      </div>

      {delta.offer ? <p className="gdelta-offer">The deal this carries: {delta.offer}</p> : null}

      {/* The delta pane — the CHANGE, shown. Exactly one kind renders. */}
      <div className="gdelta-pane">
        {editing != null ? (
          <textarea
            className="gdelta-edit"
            value={editing}
            rows={8}
            autoFocus
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}
          />
        ) : delta.kind === "outbound" ? (
          delta.body ? <OutboundDelta body={delta.body} /> : <p className="gdelta-empty">No message to review.</p>
        ) : delta.kind === "page" ? (
          <PageDelta delta={delta} />
        ) : (
          <ChangeDelta delta={delta} />
        )}
      </div>

      {/* Provenance — the receipt a screenshot can't clone. Always available to open, never fabricated:
          it renders only when the host supplied it. */}
      {delta.provenance ? (
        <button
          type="button"
          className={cn("gdelta-prov", provOpen && "is-open")}
          onClick={() => setProvOpen((o) => !o)}
        >
          {provOpen ? <ChevronDown size={11} aria-hidden /> : <ChevronRight size={11} aria-hidden />}
          Where this came from
        </button>
      ) : null}
      {provOpen && delta.provenance ? <p className="gdelta-prov-body">{delta.provenance}</p> : null}

      {error ? <p className="gdelta-error" role="alert">{error}</p> : null}

      {/* The decision row. Editing an outbound draft, sending back with a note, or the two-tier ship. */}
      {editing != null ? (
        <div className="gdelta-actions">
          <button className="gdelta-btn is-primary" type="button" disabled={busy || !editing.trim()}
            onClick={() => void run({ decision: "approve", editedBody: editing })}>
            <Check size={13} aria-hidden /> Save &amp; {sendVerb.toLowerCase()}
          </button>
          <button className="gdelta-btn is-ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      ) : note != null ? (
        <div className="gdelta-sendback">
          <p className="gdelta-sendback-lead">Your crew picks this back up. What should they change?</p>
          <textarea
            className="gdelta-sendback-note"
            rows={2}
            autoFocus
            value={note}
            placeholder="e.g. make the opening less salesy"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setNote(null); }}
          />
          <div className="gdelta-actions">
            <button className="gdelta-btn is-send" type="button" disabled={busy || !note.trim()}
              onClick={() => void run({ decision: "send-back", note })}>
              {busy ? <Loader size={12} className="spin" aria-hidden /> : <CornerDownLeft size={12} aria-hidden />} Send to your crew
            </button>
            <button className="gdelta-btn is-ghost" type="button" disabled={busy} onClick={() => setNote(null)}>Cancel</button>
          </div>
        </div>
      ) : codeNative ? (
        // Code-native: TWO authorizations. Approve stages the change; the heavier, separately-armed "Ship
        // it live" is the second authorization that carries deployConfirmed:true. It never fires in one
        // click — the founder arms it, then confirms, so a live product change is deliberate.
        <div className="gdelta-ship">
          {!shipArmed ? (
            <div className="gdelta-actions">
              <button className="gdelta-btn is-ship-open" type="button" disabled={busy} onClick={() => setShipArmed(true)}>
                <Rocket size={13} aria-hidden /> Ship it live…
              </button>
              <button className="gdelta-btn is-sendback" type="button" disabled={busy} onClick={() => setNote("")}>
                <CornerDownLeft size={13} aria-hidden /> Send back
              </button>
            </div>
          ) : (
            <div className="gdelta-ship-confirm">
              <p className="gdelta-ship-warn">
                <ShieldCheck size={13} aria-hidden />
                This {shipPath}. It's a real change to your product — your second yes.
              </p>
              <div className="gdelta-actions">
                <button className="gdelta-btn is-ship-go" type="button" disabled={busy}
                  onClick={() => void run({ decision: "ship", deployConfirmed: true })}>
                  {busy ? <Loader size={13} className="spin" aria-hidden /> : <Rocket size={13} aria-hidden />} Ship it live
                </button>
                <button className="gdelta-btn is-ghost" type="button" disabled={busy} onClick={() => setShipArmed(false)}>
                  Not yet
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="gdelta-actions">
          <button className="gdelta-btn is-primary" type="button" disabled={busy}
            onClick={() => void run({ decision: "approve" })}>
            {busy ? <Loader size={13} className="spin" aria-hidden /> : <Check size={13} aria-hidden />} {sendVerb}
          </button>
          <button className="gdelta-btn is-sendback" type="button" disabled={busy} onClick={() => setNote("")}>
            <CornerDownLeft size={13} aria-hidden /> Send back
          </button>
          {delta.kind === "outbound" && delta.body ? (
            <button className="gdelta-btn is-edit" type="button" disabled={busy} onClick={() => setEditing(delta.body ?? "")}>
              <Pencil size={13} aria-hidden /> Edit
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

// The kind glyph — monochrome ink, one calm mark per kind. Never a colored icon-tile; color is reserved
// for state (the ship confirm, the receipt chips, the diff lines), not for labeling the motion.
function KindGlyph({ kind }: { kind: GateDelta["kind"] }) {
  const Icon = kind === "outbound" ? Mail : kind === "page" ? Globe : FileDiff;
  return (
    <span className="gdelta-glyph" aria-hidden>
      <Icon size={14} />
    </span>
  );
}
