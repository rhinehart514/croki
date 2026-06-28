// ExperimentMatrixLens — the "which claim wins in which ICP" surface.
//
// A grid of live hypotheses: rows are the claims being tested, columns are the channels they run in,
// and each cell is the experiment(s) testing that claim in that channel — its status and its
// variant-vs-control pair. The shared ICP rides as a context band across the top (the "in which ICP"
// framing), since the ICP is project-wide shared context. Read-only: it reads sharedContext
// experiments × claims × icp and never mutates. Selecting a cell sets the shared cross-lens selection
// to that experiment so it stays lit when the founder switches lenses.

import { useMemo } from "react";
import type { ChannelMeta, Claim, GtmExperiment } from "@/types";
import { LensPanel, ProvenanceTag } from "@/components/lenses/shared";
import "./ExperimentMatrixLens.css";

export type ExperimentMatrixLensProps = {
  experiments: GtmExperiment[];
  claims: Claim[];
  icp: Record<string, unknown>;
  channels: ChannelMeta[];
  selected: string | null;
  onSelect: (id: string) => void;
};

// A row of the matrix: one claim (or an unmatched experiment variable) and its display text.
type Row = { id: string; label: string; claim: Claim | null };

// Pull a readable line out of the loosely-typed shared ICP bag (mirrors GtmCanvas.readable).
function readableIcp(icp: Record<string, unknown>): string | null {
  for (const k of ["query", "industry", "description", "segment", "summary"]) {
    const v = icp[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// Does this experiment test this claim? Strongest match first: an explicit claimId, then the
// experiment's variable text containing the claim text (or vice-versa).
function matchesClaim(exp: GtmExperiment, claim: Claim): boolean {
  if (exp.claimId && exp.claimId === claim.id) return true;
  const variable = (exp.variable || "").trim().toLowerCase();
  const text = (claim.text || "").trim().toLowerCase();
  if (!variable || !text) return false;
  return variable.includes(text) || text.includes(variable);
}

// The status → tone for the cell chip. Running is in-flight (amber), complete is proven (green),
// everything else is quiet.
function statusTone(status?: string): "running" | "complete" | "muted" {
  const s = (status || "").toLowerCase();
  if (s === "running" || s === "active") return "running";
  if (s === "complete" || s === "done" || s === "won") return "complete";
  return "muted";
}

export function ExperimentMatrixLens({
  experiments, claims, icp, channels, selected, onSelect,
}: ExperimentMatrixLensProps) {
  const channelName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of channels) map.set(c.id, c.name);
    return map;
  }, [channels]);

  // Columns: the channels that actually carry an experiment, in first-seen order. Keeps the grid
  // bounded to what's live rather than every channel in the project.
  const columns = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    for (const exp of experiments) {
      const id = exp.channelId || "unattributed";
      if (!seen.has(id)) { seen.add(id); order.push(id); }
    }
    return order;
  }, [experiments]);

  // Rows: every claim, plus a catch-all row per experiment variable that maps to no claim, so no
  // live hypothesis is hidden just because its claim isn't structured yet.
  const rows = useMemo<Row[]>(() => {
    const claimRows: Row[] = claims.map((c) => ({ id: `claim:${c.id}`, label: c.text, claim: c }));
    const unmatched = new Map<string, string>();
    for (const exp of experiments) {
      if (claims.some((c) => matchesClaim(exp, c))) continue;
      const key = (exp.variable || exp.hypothesis || exp.id || "").trim();
      if (key && !unmatched.has(key.toLowerCase())) unmatched.set(key.toLowerCase(), key);
    }
    const otherRows: Row[] = [...unmatched.values()].map((label) => ({
      id: `var:${label.toLowerCase()}`, label, claim: null,
    }));
    return [...claimRows, ...otherRows];
  }, [claims, experiments]);

  // The experiment(s) in a given (row, column) cell.
  const cellExperiments = (row: Row, columnId: string): GtmExperiment[] =>
    experiments.filter((exp) => {
      const inColumn = (exp.channelId || "unattributed") === columnId;
      if (!inColumn) return false;
      if (row.claim) return matchesClaim(exp, row.claim);
      const key = (exp.variable || exp.hypothesis || exp.id || "").trim().toLowerCase();
      return key === row.id.replace(/^var:/, "");
    });

  const icpLabel = readableIcp(icp);
  const icpHypotheses = Array.isArray(icp.hypotheses) ? (icp.hypotheses as unknown[]) : [];

  if (experiments.length === 0 || columns.length === 0) {
    return (
      <div className="matrix-lens matrix-lens-empty" role="region" aria-label="Experiment matrix lens">
        <p className="matrix-empty-note">
          No live experiments yet. When you run a claim against a channel, it shows here as a cell in
          the matrix — which claim, which channel, the variant against the control, and whether it's
          running. This is the "which claim wins in which ICP" surface.
        </p>
      </div>
    );
  }

  return (
    <div className="matrix-lens" role="region" aria-label="Experiment matrix lens">
      {/* The ICP context band — the "in which ICP" framing across the whole matrix. */}
      {(icpLabel || icpHypotheses.length > 0) && (
        <div className="matrix-icp-band">
          <span className="matrix-icp-eyebrow">ICP</span>
          {icpLabel && <span className="matrix-icp-value">{icpLabel}</span>}
          {icpHypotheses.length > 0 && (
            <span className="matrix-icp-segments">
              {icpHypotheses.slice(0, 4).map((h, i) => (
                <span key={i} className="matrix-icp-segment">
                  {typeof h === "string" ? h : String((h as { label?: string })?.label ?? "segment")}
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      <div className="matrix-scroll">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-corner">claim × channel</th>
              {columns.map((columnId) => (
                <th key={columnId} className="matrix-col-head">
                  {channelName.get(columnId) || (columnId === "unattributed" ? "Unattributed" : columnId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th className="matrix-row-head" scope="row">
                  <span className="matrix-row-label">{row.label}</span>
                  {row.claim
                    ? <ProvenanceTag provenance={row.claim.provenance === "speculative" ? "speculative" : "derived"} />
                    : <span className="matrix-row-tag">unstructured</span>}
                </th>
                {columns.map((columnId) => {
                  const cell = cellExperiments(row, columnId);
                  if (cell.length === 0) return <td key={columnId} className="matrix-cell matrix-cell-empty" aria-hidden />;
                  return (
                    <td key={columnId} className="matrix-cell">
                      {cell.map((exp) => {
                        const tone = statusTone(exp.status);
                        return (
                          <button
                            key={exp.id}
                            type="button"
                            className={`matrix-exp tone-${tone}${selected === exp.id ? " is-selected" : ""}`}
                            onClick={() => onSelect(exp.id)}
                            title={exp.hypothesis || exp.variable || exp.id}
                          >
                            <span className={`matrix-exp-status status-${tone}`}>
                              {exp.status || "draft"}
                            </span>
                            {(exp.variant || exp.control) && (
                              <span className="matrix-exp-ab">
                                {exp.variant && <span className="matrix-exp-variant" title="Variant">{exp.variant}</span>}
                                {exp.variant && exp.control && <span className="matrix-exp-vs">vs</span>}
                                {exp.control && <span className="matrix-exp-control" title="Control">{exp.control}</span>}
                              </span>
                            )}
                            {exp.result && <span className="matrix-exp-result">{exp.result}</span>}
                          </button>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LensPanel title="Experiment matrix" className="matrix-legend lens-panel-dock">
        <div className="matrix-legend-row">
          <span className="matrix-legend-chip status-running">running</span>
          <span className="matrix-legend-chip status-complete">complete</span>
          <span className="matrix-legend-chip status-muted">draft</span>
        </div>
        <div className="matrix-legend-note">
          {experiments.length} experiment{experiments.length === 1 ? "" : "s"} · variant vs control · select a cell to trace it
        </div>
      </LensPanel>
    </div>
  );
}
