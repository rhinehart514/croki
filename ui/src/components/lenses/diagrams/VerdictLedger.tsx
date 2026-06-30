// VerdictLedger — the Learning band (layer "learn"): the why-trail behind every belief, newest-first.
// The loop's banked decisions in one feed — the resolved experiment verdicts (keep / kill / double-
// down) the founder rendered, each the moment a belief flipped, plus the gate-decision tally the board
// already summarizes (approved / rejected / edited).
//
// A verdict can live on ANY layer's experiment, so the band's own (learn-targeted) experiments aren't
// enough — this re-reads the board and gathers every layer's resolved verdicts, then sorts by when the
// founder decided. Read-only. Honest-blank when the loop has banked nothing yet.

import { useEffect, useMemo, useState } from "react";
import type { BoardView, GtmExperiment } from "@/types";
import type { LayerDiagramProps } from "@/components/lenses/LayerDiagramProps";
import { ProvenanceTag } from "@/components/lenses/shared";
import { getBoard } from "@/api";
import "./BandDiagrams.css";

type Entry = { exp: GtmExperiment; layer: string };

function dayLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function decisionLabel(decision: string): string {
  if (decision === "double-down") return "doubled down";
  if (decision === "keep") return "kept";
  if (decision === "kill") return "killed";
  return decision;
}

function armLabel(exp: GtmExperiment, armId: string | null | undefined): string | null {
  if (!armId) return null;
  const arm = (exp.arms ?? []).find((a) => a.id === armId);
  return arm?.label ?? arm?.channelId ?? null;
}

export function VerdictLedger({ belief, projectId, selected, onSelect }: LayerDiagramProps) {
  // undefined = still reading; null = read failed / no project; a value = loaded.
  const [board, setBoard] = useState<BoardView | null | undefined>(undefined);
  const loading = board === undefined;

  useEffect(() => {
    let live = true;
    const load = projectId ? getBoard(projectId).catch(() => null) : Promise.resolve<BoardView | null>(null);
    load.then((b) => { if (live) setBoard(b); });
    return () => { live = false; };
  }, [projectId]);

  const entries = useMemo<Entry[]>(() => {
    if (!board) return [];
    const out: Entry[] = [];
    for (const layer of board.layers) {
      for (const exp of layer.experiments) {
        if (exp.verdict?.decision) out.push({ exp, layer: layer.layer });
      }
    }
    return out.sort((a, b) =>
      (b.exp.verdict?.decidedAt ?? "").localeCompare(a.exp.verdict?.decidedAt ?? ""));
  }, [board]);

  if (loading) {
    return <div className="band-diagram-load"><span className="band-diagram-spin" />Reading the ledger…</div>;
  }

  const hasDecisions = Boolean(belief.belief) || belief.evidence.length > 0;
  if (entries.length === 0 && !hasDecisions) {
    return (
      <div className="band-diagram-empty" role="region" aria-label="Learning — nothing banked yet">
        <strong>The loop hasn't banked a decision yet</strong>
        <span>
          Every founder verdict and gate decision lands here newest-first — the why-trail behind each
          belief. Approve or reject at a gate, or render a verdict on an experiment, and it shows up.
        </span>
      </div>
    );
  }

  return (
    <div className="band-diagram" role="region" aria-label="Learning verdict ledger">
      <div className="band-diagram-head">
        <span className="band-diagram-kicker">learning</span>
        {belief.evidence.length > 0 && (
          <div className="ledger-summary">
            {belief.evidence.map((e, i) => <span key={i} className="ledger-chip">{e}</span>)}
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="band-diagram-sub">
          Gate decisions are banked, but no experiment verdict has been rendered yet — render one and the
          belief flips here with its provenance.
        </p>
      ) : (
        <ul className="ledger-list">
          {entries.map(({ exp, layer }) => {
            const decision = exp.verdict!.decision;
            const win = armLabel(exp, exp.verdict!.winningArmId);
            return (
              <li key={exp.id}>
                <button
                  type="button"
                  className="ledger-row"
                  style={{ width: "100%", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}
                  onClick={() => onSelect(exp.id)}
                  aria-pressed={selected === exp.id}
                >
                  <span className={`ledger-decision ${decision}`}>{decisionLabel(decision)}</span>
                  <span className="ledger-main">
                    <span className="ledger-title">{exp.hypothesis || exp.variable || exp.id}</span>
                    <span className="ledger-meta">
                      <span className="ledger-layer">{layer}</span>
                      {win && <span className="ledger-win">winner: {win}</span>}
                      <ProvenanceTag provenance="derived" />
                    </span>
                  </span>
                  <span className="ledger-when">{dayLabel(exp.verdict!.decidedAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
