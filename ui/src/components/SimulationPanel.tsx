import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { compareChannelRuns } from "@/api";
import type { ChannelRunDiff, GTMGraph, GTMRunResult } from "@/types";

type SimTab = "canvas" | "config" | "diff" | "simulation" | "runs" | "logs";

function ImpactMetric({ label, value, positive }: {
  label: string; value: string; positive?: boolean;
}) {
  return (
    <div className="sim-metric">
      <span className={`sim-metric-value ${positive === false ? "negative" : ""}`}>{value}</span>
      <span className="sim-metric-label">{label}</span>
    </div>
  );
}

export function SimulationPanel({
  open,
  graph,
  result,
  running,
  flowRuns,
  onClose,
  onSelectRun,
}: {
  open: boolean;
  graph: GTMGraph | null;
  result: GTMRunResult | null;
  running: boolean;
  flowRuns: GTMRunResult[];
  onClose?: () => void;
  onSelectRun?: (run: GTMRunResult) => void;
}) {
  const [simTab, setSimTab] = useState<SimTab>("simulation");
  const [runDiff, setRunDiff] = useState<ChannelRunDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  const nodeCount  = result ? Object.keys(result.nodes).length : 0;
  const okCount    = result ? Object.values(result.nodes).filter((n) => n.ok).length : 0;
  const gateCount  = result ? result.pendingGates.length : 0;
  const totalItems = result
    ? Object.values(result.nodes).reduce((sum, n) => sum + n.items.length, 0)
    : 0;

  useEffect(() => {
    if (simTab !== "diff" || !graph || flowRuns.length < 2) return;
    const before = flowRuns.at(-2)?.runId;
    const after = flowRuns.at(-1)?.runId;
    compareChannelRuns(graph.id, before, after)
      .then(({ diff }) => { setRunDiff(diff); setDiffError(null); })
      .catch((error) => { setRunDiff(null); setDiffError(error instanceof Error ? error.message : String(error)); });
  }, [flowRuns, graph, simTab]);

  return (
    <div className={`sim-drawer ${open ? "open" : ""}`}>
      <div className="sim-drawer-inner">
        {/* Tab strip */}
        <div className="sim-tabs">
          {(["canvas", "config", "diff", "simulation", "runs", "logs"] as SimTab[]).map((t) => (
            <button
              className={`sim-tab ${simTab === t ? "active" : ""}`}
              key={t}
              onClick={() => setSimTab(t)}
              type="button"
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          <div className="sim-tabs-spacer" />
          <button className="sim-drawer-close" onClick={onClose} type="button">
            <X />
          </button>
        </div>

        {/* Simulation tab */}
        {simTab === "simulation" && (
          <div className="sim-content">
            <div className="sim-scenario-col">
              <div className="sim-section-label">Scenario</div>
              <div className="sim-scenario-card">
                <strong>Current run</strong>
                <span className={`sim-scenario-status ${result ? (result.pendingGates?.length ? "gate" : result.ok ? "ok" : "err") : "muted"}`}>
                  {result ? (result.pendingGates?.length ? "Paused at gate" : result.ok ? "Complete" : "Needs attention") : "No run yet"}
                </span>
                <div className="sim-scenario-meta">
                  {graph?.nodes.length ?? 0} nodes total
                </div>
              </div>
            </div>

            <div className="sim-impact-col">
              <div className="sim-section-label">Impact (current run)</div>
              <div className="sim-metrics">
                <ImpactMetric
                  label="Nodes completed"
                  value={result ? `${okCount}/${nodeCount}` : "—"}
                  positive={result ? result.ok : undefined}
                />
                <ImpactMetric
                  label="Items flowing"
                  value={result ? `${totalItems}` : "—"}
                  positive={totalItems > 0}
                />
                <ImpactMetric
                  label="Pending gates"
                  value={result ? `${gateCount}` : "—"}
                  positive={gateCount === 0}
                />
                <ImpactMetric
                  label="Preserved runs"
                  value={`${graph?.store?.runs ?? flowRuns.length}`}
                />
              </div>
            </div>

            {result?.feedbackEdges && result.feedbackEdges.length > 0 && (
              <div className="sim-feedback-col">
                <div className="sim-section-label">Feedback edges</div>
                <div className="sim-feedback-list">
                  {result.feedbackEdges.map((e, i) => (
                    <div className="sim-feedback-row" key={i}>
                      <span className="sim-feedback-dot" />
                      <span>{e.source} → {e.target}</span>
                      {e.label && <span className="sim-feedback-label">{e.label}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Runs tab */}
        {simTab === "runs" && (
          <div className="sim-content">
            <div className="sim-runs-list">
              {flowRuns.length === 0 ? (
                <div className="sim-empty">No runs yet. Click "Run loop" to start.</div>
              ) : (
                [...flowRuns].reverse().map((run) => (
                  <button
                    className={`sim-run-row ${result?.runId === run.runId ? "active" : ""}`}
                    key={run.runId}
                    onClick={() => onSelectRun?.(run)}
                    type="button"
                  >
                    <span className={`sim-run-dot ${run.pendingGates?.length ? "gate" : run.ok ? "ok" : "err"}`} />
                    <div className="sim-run-info">
                      <strong>{run.targetNodeId ? `Step · ${run.targetNodeId}` : "Full loop"}</strong>
                      <span>{run.pendingGates?.length ? "Paused at gate" : run.ok ? "Complete" : "Needs attention"} · {run.runId.slice(0, 12)}</span>
                    </div>
                    <span className="sim-run-nodes">
                      {Object.values(run.nodes).filter((n) => n.ok).length}/{Object.keys(run.nodes).length}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {simTab === "diff" && (
          <div className="sim-content">
            {flowRuns.length < 2 ? (
              <div className="sim-empty">Run this channel twice to compare what changed.</div>
            ) : diffError ? (
              <div className="sim-empty">{diffError}</div>
            ) : runDiff ? (
              <div className="sim-diff-view">
                <div className="sim-section-label">{runDiff.summary}</div>
                <div className="sim-diff-runs">
                  <span>{runDiff.beforeRunId}</span>
                  <strong>→</strong>
                  <span>{runDiff.afterRunId}</span>
                </div>
                {runDiff.graphChanges.map((change, index) => (
                  <div className="sim-diff-row" key={`graph-${index}`}>
                    <strong>{String(change.type).replaceAll("_", " ")}</strong>
                    <span>{String(change.nodeId ?? "graph")}</span>
                  </div>
                ))}
                {runDiff.resultChanges.map((change) => (
                  <div className="sim-diff-row" key={`result-${change.nodeId}`}>
                    <strong>{change.nodeId}</strong>
                    <span>{change.before?.itemCount ?? "—"} → {change.after?.itemCount ?? "—"} items</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sim-empty">Comparing runs…</div>
            )}
          </div>
        )}

        {/* Logs tab */}
        {simTab === "logs" && (
          <div className="sim-content">
            <div className="sim-log">
              {running && (
                <div className="sim-log-line">
                  <span className="sim-log-prompt">›</span>
                  <span>Running…</span>
                </div>
              )}
              {result && (
                <>
                  <div className="sim-log-line">
                    <span className={`sim-log-prompt ${result.ok ? "ok" : "err"}`}>✓</span>
                    <span>Run {result.runId} {result.ok ? "completed" : "finished with errors"}</span>
                  </div>
                  {result.executionOrder.map((id) => {
                    const n = result.nodes[id];
                    if (!n) return null;
                    return (
                      <div className="sim-log-line" key={id}>
                        <span className={`sim-log-prompt ${n.ok ? "ok" : "err"}`}>
                          {n.ok ? "·" : "!"}
                        </span>
                        <span>{id}: {n.ok ? `${n.items.length} items` : (n.error ?? "failed")}</span>
                      </div>
                    );
                  })}
                </>
              )}
              {!result && !running && (
                <div className="sim-empty">No logs yet.</div>
              )}
            </div>
          </div>
        )}

        {(simTab === "canvas" || simTab === "config") && (
          <div className="sim-content">
            <div className="sim-empty">{simTab.charAt(0).toUpperCase() + simTab.slice(1)} view coming soon.</div>
          </div>
        )}
      </div>
    </div>
  );
}
