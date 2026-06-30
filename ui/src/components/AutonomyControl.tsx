import { useState } from "react";
import { ShieldCheck, ChevronRight, LoaderCircle, Undo2, Lock } from "lucide-react";
import type { ChannelMeta } from "@/types";
import "@/styles/autonomy-control.css";

// AutonomyControl — the per-channel autonomy ladder, shown on the founder gate surface.
//
// A channel lives on a three-rung ladder: draft → trusted → autonomous. At "draft" the gate holds
// EVERY staged item for review — that is the default, and the wall in full. The founder may promote
// the channel UP one rung at a time, and that promotion is itself an explicit founder approval: it
// banks a "blessed pattern" (a one-line recipe) the gate then auto-applies to the clean items while
// still stopping the exceptions for individual review. It is standing approval, not the gate's
// removal — the gate node stays present on every path, and "Drop to draft" reverts to hold-everything
// in one click.
//
// The promotion affordance is the only amber here: promoting is a gate act. Revoke is a quiet,
// always-available neutral control — you can pull trust back the moment a run surprises you.

const RUNGS = ["draft", "trusted", "autonomous"] as const;
type Rung = (typeof RUNGS)[number];

const RUNG_COPY: Record<Rung, { label: string; blurb: string }> = {
  draft: { label: "Draft", blurb: "The gate holds every staged item for your review." },
  trusted: { label: "Trusted", blurb: "The gate auto-approves clean items, holds the exceptions." },
  autonomous: { label: "Autonomous", blurb: "Standing approval runs the channel; exceptions still stop." },
};

const nextRung = (level: Rung): "trusted" | "autonomous" | null =>
  level === "draft" ? "trusted" : level === "trusted" ? "autonomous" : null;

export function AutonomyControl({
  channel,
  canRelease = true,
  onPromote,
  onRevoke,
}: {
  channel: ChannelMeta;
  // Promoting is a release-class act — mirror the gate's role gate. A view-only member sees the ladder
  // but cannot move it.
  canRelease?: boolean;
  onPromote: (level: "trusted" | "autonomous", note: string) => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const level = (RUNGS.includes(channel.autonomy as Rung) ? channel.autonomy : "draft") as Rung;
  const target = nextRung(level);
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const promote = async () => {
    if (!target || busy || !note.trim()) return;
    setBusy(true);
    try {
      await onPromote(target, note.trim());
      setComposing(false);
      setNote("");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRevoke();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="autonomy-control" aria-label={`Autonomy for ${channel.name}`}>
      <div className="autonomy-head">
        <ShieldCheck className="autonomy-head-icon" aria-hidden />
        <div className="autonomy-head-text">
          <strong>Channel autonomy</strong>
          <span>How much of this channel's gate the founder stands behind.</span>
        </div>
      </div>

      {/* The ladder, current rung lit. The rungs read left → up the ladder. */}
      <div className="autonomy-ladder" role="list" aria-label="Autonomy ladder">
        {RUNGS.map((rung, i) => {
          const state = rung === level ? "current" : i < RUNGS.indexOf(level) ? "below" : "above";
          return (
            <div key={rung} className={`autonomy-rung is-${state}`} role="listitem" aria-current={rung === level}>
              <span className="autonomy-rung-dot" aria-hidden />
              <span className="autonomy-rung-label">{RUNG_COPY[rung].label}</span>
            </div>
          );
        })}
      </div>
      <p className="autonomy-current-blurb">{RUNG_COPY[level].blurb}</p>

      {/* The wall stays legible: the gate never disappears, even at the top of the ladder. */}
      <div className="autonomy-wall-note">
        <Lock aria-hidden />
        <span>
          The gate stays on this channel. Even at autonomous the gate node is present on every path —
          promotion is standing founder approval, never the wall's removal.
        </span>
      </div>

      {/* Promotion — the one amber affordance, because promoting is a gate act. */}
      {target ? (
        composing ? (
          <div className="autonomy-promote-form">
            <label className="autonomy-promote-label" htmlFor="autonomy-note">
              What are you blessing? One line. The gate banks this pattern and auto-applies it to clean
              items, still escalating the exceptions.
            </label>
            <input
              id="autonomy-note"
              className="autonomy-promote-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`e.g. ${target === "trusted" ? "approve any draft to a vetted founder" : "this play is proven — run it"}`}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void promote();
                if (e.key === "Escape") { setComposing(false); setNote(""); }
              }}
            />
            <div className="autonomy-promote-actions">
              <button
                type="button"
                className="autonomy-btn autonomy-btn-confirm"
                disabled={!note.trim() || busy}
                onClick={() => void promote()}
              >
                {busy ? <LoaderCircle className="spin" aria-hidden /> : <ShieldCheck aria-hidden />}
                Promote to {RUNG_COPY[target].label.toLowerCase()}
              </button>
              <button
                type="button"
                className="autonomy-btn autonomy-btn-ghost"
                disabled={busy}
                onClick={() => { setComposing(false); setNote(""); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="autonomy-btn autonomy-btn-promote"
            disabled={!canRelease || busy}
            onClick={() => setComposing(true)}
            title={canRelease ? undefined : "Only an owner or approver can promote a channel."}
          >
            <ChevronRight aria-hidden />
            Promote to {RUNG_COPY[target].label.toLowerCase()}
          </button>
        )
      ) : (
        <p className="autonomy-top-note">This channel is at the top of the ladder.</p>
      )}

      {/* Revoke — always one click back to draft, never amber. */}
      {level !== "draft" ? (
        <button
          type="button"
          className="autonomy-btn autonomy-btn-revoke"
          disabled={!canRelease || busy}
          onClick={() => void revoke()}
          title={canRelease ? undefined : "Only an owner or approver can revoke a channel."}
        >
          <Undo2 aria-hidden />
          Drop to draft
        </button>
      ) : null}
    </section>
  );
}
