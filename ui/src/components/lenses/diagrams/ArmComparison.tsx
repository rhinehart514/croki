// ArmComparison — the Market band's diagram: two motions raced as the arms of ONE ICP experiment.
//
// This is the keystone picture. RodentRadar's PCO Outbound and Restaurant Outbound are not two separate
// channels here — they are two ARMS of one belief test, the $49 pilot held constant once at the top. Each
// arm shows its real run tally pulled from the channel ledger (never invented). A bracket overlay forks
// the belief into the two arms and converges them on a ◇ verdict whose only amber is the founder gate
// pip. The founder picks the winner and renders a verdict — keep / kill / double-down — and that decision
// writes back: the Market belief flips from testing to validated with this experiment pinned as the
// provenance. Belief → gated motion → measured result → verdict → belief update, the gate the only wall.
//
// When nothing is grouped yet, the diagram does NOT guess the grouping from channel names. It lays the
// candidate channels out ungrouped and offers the founder the one affordance that states the grouping —
// founder-confirmed, never auto-inferred.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ChannelMeta, GtmExperiment } from "@/types";
import type { LayerDiagramProps } from "@/components/lenses/LayerDiagramProps";
import { ExperimentOverlay, type OverlayArm } from "@/components/lenses/ExperimentOverlay";
import { applyVerdict, getProject, groupExperiment } from "@/api";
import "./ArmComparison.css";

type Decision = "keep" | "kill" | "double-down";
type Arm = NonNullable<GtmExperiment["arms"]>[number];

// The grouped experiment is the one carrying two-or-more arms. Prefer the selected one so a click in
// another lens stays focused here.
function pickGrouped(experiments: GtmExperiment[], selected: string | null): GtmExperiment | null {
  const grouped = experiments.filter((e) => Array.isArray(e.arms) && e.arms.length >= 2);
  if (grouped.length === 0) return null;
  return grouped.find((e) => e.id === selected) ?? grouped[0];
}

function armApproved(arm: Arm): number {
  return arm?.tally?.approved ?? 0;
}

export function ArmComparison({ belief, experiments, selected, onSelect, projectId, onVerdict }: LayerDiagramProps) {
  const grouped = useMemo(() => pickGrouped(experiments, selected), [experiments, selected]);
  if (grouped) {
    return <GroupedView exp={grouped} selected={selected} onSelect={onSelect} projectId={projectId} onVerdict={onVerdict} />;
  }
  return <UngroupedView heldConstantHint={belief.belief} projectId={projectId} onVerdict={onVerdict} />;
}

// ── The grouped view: the two arms racing toward one verdict ──────────────────────────────────────
function GroupedView({
  exp, selected, onSelect, projectId, onVerdict,
}: {
  exp: GtmExperiment;
  selected: string | null;
  onSelect: (id: string) => void;
  projectId: string | null;
  onVerdict: () => void;
}) {
  const reduce = useReducedMotion();
  const arms = exp.arms ?? [];
  const verdict = exp.verdict ?? null;
  const [winnerArmId, setWinnerArmId] = useState<string | null>(verdict?.winningArmId ?? null);
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSelected = selected === exp.id;
  const maxApproved = Math.max(1, ...arms.map((a) => armApproved(a)));

  const overlayArms: OverlayArm[] = arms.slice(0, 2).map((a) => ({
    id: a.id,
    label: a.label ?? a.channelId ?? "Arm",
    winner: verdict ? verdict.winningArmId === a.id : winnerArmId === a.id,
    loser: verdict ? verdict.decision !== "kill" && verdict.winningArmId !== a.id : false,
  }));

  async function decide(decision: Decision) {
    if (!projectId || busy) return;
    if ((decision === "keep" || decision === "double-down") && !winnerArmId) {
      setError("Pick the winning arm first.");
      return;
    }
    setError(null);
    setBusy(decision);
    try {
      await applyVerdict(projectId, exp.id, { decision, winningArmId: decision === "kill" ? null : winnerArmId });
      onVerdict(); // re-read the board so the Market belief flips
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the verdict.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="armcmp" role="region" aria-label="ICP experiment — arm comparison">
      <header className="armcmp-head">
        <div className="armcmp-eyebrow">
          <span className="armcmp-kicker">ICP experiment</span>
          {verdict ? (
            <span className="armcmp-verdict-pill is-on">resolved · {verdict.decision}</span>
          ) : (
            <span className="armcmp-verdict-pill">racing</span>
          )}
        </div>
        {exp.hypothesis && <h2 className="armcmp-hyp">{exp.hypothesis}</h2>}
        {exp.heldConstant && (
          <div className="armcmp-held" title="Held constant across every arm — the control that keeps the race fair">
            <span className="armcmp-held-key">held constant</span>
            <span className="armcmp-held-val">{exp.heldConstant}</span>
          </div>
        )}
      </header>

      <div className="armcmp-overlay">
        <ExperimentOverlay arms={overlayArms} resolved={Boolean(verdict)} traced={isSelected} />
      </div>

      <div className="armcmp-arms">
        {arms.map((arm, i) => {
          const approved = armApproved(arm);
          const tally = arm.tally;
          const isWinner = verdict ? verdict.winningArmId === arm.id : winnerArmId === arm.id;
          const isLoser = Boolean(verdict) && verdict!.decision !== "kill" && verdict!.winningArmId !== arm.id;
          return (
            <motion.button
              key={arm.id}
              type="button"
              className={`armcmp-arm${isWinner ? " is-winner" : ""}${isLoser ? " is-loser" : ""}`}
              onClick={() => { setWinnerArmId(arm.id); onSelect(exp.id); }}
              disabled={Boolean(verdict)}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { delay: 0.06 * i, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="armcmp-arm-head">
                <span className="armcmp-arm-tag">arm {String.fromCharCode(65 + i)}</span>
                <span className="armcmp-arm-name">{arm.label ?? arm.channelId}</span>
                {isWinner && <span className="armcmp-arm-flag win">{verdict ? "kept" : "winner"}</span>}
                {isLoser && <span className="armcmp-arm-flag lose">retired</span>}
              </div>
              <div className="armcmp-arm-metric">
                <span className="armcmp-arm-bar">
                  <motion.i
                    className="armcmp-arm-fill"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${Math.round((approved / maxApproved) * 100)}%` }}
                    transition={reduce ? { duration: 0 } : { delay: 0.12 + 0.06 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  />
                </span>
                <span className="armcmp-arm-num">{approved}</span>
              </div>
              <div className="armcmp-arm-tally">
                {tally
                  ? `${tally.runs} run${tally.runs === 1 ? "" : "s"} · ${tally.staged} staged · ${tally.approved} approved${tally.rejected ? ` · ${tally.rejected} rejected` : ""}`
                  : "no runs behind the gate yet"}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* The founder gate row — the ONLY amber surface, where the staged motion resolves. */}
      <div className="armcmp-gate">
        <span className="armcmp-gate-chip"><span className="armcmp-gate-dot" />founder gate</span>
        <span className="armcmp-gate-note">the outbound that runs each arm stages behind your approval — nothing sends until you release it.</span>
      </div>

      <AnimatePresence>
        {!verdict ? (
          <motion.div
            className="armcmp-verdicts"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button type="button" className="armcmp-vbtn keep" disabled={!winnerArmId || busy !== null} onClick={() => decide("keep")}>
              <span className="armcmp-vk">keep</span>
              <small>validate this ICP — promote it to a belief</small>
            </button>
            <button type="button" className="armcmp-vbtn kill" disabled={busy !== null} onClick={() => decide("kill")}>
              <span className="armcmp-vk">kill</span>
              <small>retire the test, ground nothing</small>
            </button>
            <button type="button" className="armcmp-vbtn dd" disabled={!winnerArmId || busy !== null} onClick={() => decide("double-down")}>
              <span className="armcmp-vk">double-down</span>
              <small>validate and lean harder into the winner</small>
            </button>
          </motion.div>
        ) : (
          <motion.div
            className="armcmp-resolved"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Verdict recorded — the Market belief flips on the band, this experiment pinned as its provenance.
          </motion.div>
        )}
      </AnimatePresence>

      {error && <div className="armcmp-error">{error}</div>}
    </div>
  );
}

// ── The ungrouped view: candidate motions, and the one affordance to STATE the grouping ───────────
function UngroupedView({
  heldConstantHint, projectId, onVerdict,
}: {
  heldConstantHint: string | null;
  projectId: string | null;
  onVerdict: () => void;
}) {
  const [channels, setChannels] = useState<ChannelMeta[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [held, setHeld] = useState<string>("");
  const [hypothesis, setHypothesis] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getProject()
      .then(({ project }) => {
        if (!live) return;
        setChannels(project.channels);
        setPicked(new Set(project.channels.map((c) => c.id)));
        const offer = (project.sharedContext as { offer?: Record<string, unknown> })?.offer;
        const price = offer?.price ? String(offer.price) : "";
        const unit = offer?.unit ? String(offer.unit) : "";
        setHeld([price, unit].filter(Boolean).join(" ") || "");
      })
      .catch(() => { if (live) setChannels([]); });
    return () => { live = false; };
  }, []);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  async function group() {
    if (!projectId || busy) return;
    const armChannels = (channels ?? []).filter((c) => picked.has(c.id));
    if (armChannels.length < 2) { setError("Pick at least two motions to race as arms."); return; }
    setError(null);
    setBusy(true);
    try {
      await groupExperiment(projectId, {
        targetLayer: "market",
        hypothesis: hypothesis.trim() || `Which ICP responds to ${held.trim() || "the pilot"} — ${armChannels.map((c) => c.name).join(" vs ")}`,
        heldConstant: held.trim() || undefined,
        arms: armChannels.map((c) => ({ label: c.name, kind: "channel", channelId: c.id })),
      });
      onVerdict(); // re-read the board so the grouped experiment appears in this band
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not state the grouping.");
    } finally {
      setBusy(false);
    }
  }

  if (channels === null) {
    return <div className="armcmp-loading"><span className="armcmp-spin" />Reading the motions…</div>;
  }

  if (channels.length < 2) {
    return (
      <div className="armcmp-empty">
        <strong>Nothing to race yet</strong>
        <span>An ICP experiment forks one belief into two arms — two motions tested with the offer held constant. Build at least two pipelines and they show here as candidate arms.</span>
        {heldConstantHint && <span className="armcmp-empty-hint">{heldConstantHint}</span>}
      </div>
    );
  }

  return (
    <div className="armcmp armcmp-ungrouped" role="region" aria-label="Ungrouped ICP candidates">
      <header className="armcmp-head">
        <span className="armcmp-kicker">ungrouped motions</span>
        <h2 className="armcmp-hyp">These run as separate pipelines. Group two of them as the arms of one ICP experiment.</h2>
        <p className="armcmp-sub">Grouping is yours to confirm — it is never inferred from pipeline names. The offer you hold constant is the control that makes the race fair.</p>
      </header>

      <div className="armcmp-candidates">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`armcmp-cand${picked.has(c.id) ? " is-picked" : ""}`}
            onClick={() => toggle(c.id)}
          >
            <span className="armcmp-cand-check" aria-hidden>{picked.has(c.id) ? "✓" : ""}</span>
            <span className="armcmp-cand-name">{c.name}</span>
            <span className="armcmp-cand-meta">{c.runCount} run{c.runCount === 1 ? "" : "s"}</span>
          </button>
        ))}
      </div>

      <div className="armcmp-group-form">
        <label className="armcmp-field">
          <span className="armcmp-field-label">held constant</span>
          <input className="armcmp-input" value={held} placeholder="e.g. $49 pilot" onChange={(e) => setHeld(e.target.value)} />
        </label>
        <label className="armcmp-field">
          <span className="armcmp-field-label">hypothesis (optional)</span>
          <input className="armcmp-input" value={hypothesis} placeholder="Which ICP converts on the pilot?" onChange={(e) => setHypothesis(e.target.value)} />
        </label>
        <button type="button" className="armcmp-group-btn" disabled={busy || picked.size < 2} onClick={group}>
          {busy ? "Grouping…" : `Group ${picked.size} pipeline${picked.size === 1 ? "" : "s"} as one ICP experiment`}
        </button>
      </div>

      {error && <div className="armcmp-error">{error}</div>}
    </div>
  );
}
