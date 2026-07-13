// FailureLogPanel — the founder-facing view of Drover watching its OWN runs.
//
// When Drover runs its own pipelines and something fails (a crash, a stall, a broken step, or the model
// handing back unusable output), that failure is auto-filed into the same dogfood queue the founder uses
// for manual friction. This panel surfaces those self-observed failures so the team can see what to fix
// next — grouped by signature with an occurrence count, self-inflicted separated from transient, newest
// first, each row naming the pipeline, the step, when it happened, and the raw error line.
//
// HARD RULE (carried from the crew work): never render an agent's raw system prompt on this surface. The
// only failure text this renders is the queue's errorSnippet — a trimmed single line — plus the safe
// pipeline / step labels. No item bodies, no prompts, no drafts. The backend already strips those out.
//
// Design register: it reuses the .loop-issues-panel shell (the Issues / Decisions right-rail aside — same
// opaque surface, clearance, and shadow) so it sits in the family of dock panels, and layers its own
// monochrome-zinc internals on top. Self-inflicted (a real bug) is the default; transient (a retry clears
// it) sits behind a filter. Semantic color is used once and only once: the danger-red hairline on a
// self-inflicted group. Nothing else is colored.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X, RotateCw } from "lucide-react";
import { getFailureLog, type FailureLogView, type FailureGroup } from "@/api";
import "@/styles/failure-log.css";

type Filter = "self_inflicted" | "transient";

// Plain-words "when" — a compact relative stamp so a founder reads "3m ago" not an ISO string. Falls back
// to the raw value if it can't parse (honest, never a fabricated time).
function whenAgo(iso: string | null): string {
  if (!iso) return "unknown";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The four capture paths, phrased for a founder — what KIND of failure this was, in plain words. Never the
// internal token.
const CATEGORY_LABEL: Record<string, string> = {
  "run-crash": "Run crashed",
  "run-stall": "Run stalled",
  "node-error": "Step failed",
  "bad-output": "Unusable output",
};

// The normalized errorKind token → a short founder-legible cause. Rendered as a quiet meta chip when present.
const ERROR_KIND_LABEL: Record<string, string> = {
  code_throw: "code threw",
  unparseable_output: "unreadable output",
  empty_output: "empty output",
  no_connector: "missing connector",
  no_step_runtime: "unknown step kind",
  missing_env_key: "missing key",
  timeout: "timed out",
  network: "network",
  model_error: "model overloaded",
  limit: "usage limit",
  max_turns: "hit turn cap",
  max_budget: "hit cost cap",
  unknown: "unknown",
};

function categoryLabel(category: string | null): string {
  return (category && CATEGORY_LABEL[category]) || "Failure";
}

function GroupRow({ group }: { group: FailureGroup }) {
  const kind = group.errorKind ? ERROR_KIND_LABEL[group.errorKind] ?? group.errorKind : null;
  return (
    <li className={`flog-row flog-row--${group.failureClass}`}>
      <div className="flog-row-top">
        <span className="flog-row-cat">{categoryLabel(group.category)}</span>
        {kind ? <span className="flog-row-kind">{kind}</span> : null}
        <span className="flog-row-when" title={group.lastSeen ?? undefined}>{whenAgo(group.lastSeen)}</span>
        {group.occurrences > 1 ? (
          <span className="flog-row-count" title={`Seen ${group.occurrences} times`}>×{group.occurrences}</span>
        ) : null}
      </div>
      <p className="flog-row-where">
        {group.pipeline
          ? <span className="flog-row-pipeline">{group.pipeline}</span>
          : <span className="flog-row-pipeline flog-row-dim">a pipeline</span>}
        {group.step ? (
          <>
            <span className="flog-row-arrow">›</span>
            <span className="flog-row-step">{group.step}</span>
          </>
        ) : null}
      </p>
      {group.errorSnippet ? (
        <p className="flog-row-snippet" title={group.errorSnippet}>{group.errorSnippet}</p>
      ) : null}
    </li>
  );
}

export function FailureLogPanel({ projectId, onClose }: { projectId?: string | null; onClose?: () => void }) {
  const [view, setView] = useState<FailureLogView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("self_inflicted");

  // A manual re-read (the refresh button). Distinct from the mount effect so it can run any number of times.
  const load = () => {
    setLoading(true);
    return getFailureLog(projectId)
      .then((v) => { setView(v); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let live = true;
    getFailureLog(projectId)
      .then((v) => { if (live) { setView(v); setError(null); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [projectId]);

  // Split into the two classes, each already newest-first from the route. The filter chooses which set
  // fills the body; both counts stay visible so the founder knows transient failures exist even while
  // looking at the bugs to fix.
  const shown = useMemo(
    () => (view?.groups ?? []).filter((g) => g.failureClass === filter),
    [view, filter],
  );

  const selfCount = view?.selfInflictedCount ?? 0;
  const transientCount = view?.transientCount ?? 0;

  return (
    <aside className="loop-issues-panel flog-panel" role="dialog" aria-label="What Drover saw fail" aria-modal="false">
      <header className="loop-issues-head">
        <div className="loop-issues-head-title">
          <AlertTriangle />
          <strong>What Drover saw fail</strong>
        </div>
        <div className="flog-head-actions">
          <button
            type="button"
            className="flog-refresh"
            onClick={() => void load()}
            title="Refresh"
            aria-label="Refresh the failure log"
            disabled={loading}
          >
            <RotateCw className={loading ? "spin" : undefined} />
          </button>
          {onClose ? (
            <button className="loop-issues-close" onClick={onClose} type="button" aria-label="Close">
              <X />
            </button>
          ) : null}
        </div>
      </header>

      {/* The self-inflicted / transient split, as a segmented control. Self-inflicted is the default — the
          real bugs to fix. Transient (a retry or reset clears it) sits one tap away, never hidden. */}
      {view && (selfCount > 0 || transientCount > 0) ? (
        <div className="flog-filter" role="tablist" aria-label="Failure class">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "self_inflicted"}
            className={`flog-tab ${filter === "self_inflicted" ? "flog-tab--on" : ""}`}
            onClick={() => setFilter("self_inflicted")}
          >
            To fix<span className="flog-tab-count">{selfCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "transient"}
            className={`flog-tab ${filter === "transient" ? "flog-tab--on" : ""}`}
            onClick={() => setFilter("transient")}
          >
            Transient<span className="flog-tab-count">{transientCount}</span>
          </button>
        </div>
      ) : null}

      <div className="loop-issues-body flog-body">
        {error ? (
          <p className="flog-msg flog-msg--error">Couldn’t load the failure log. {error}</p>
        ) : loading && !view ? (
          <p className="flog-msg">Reading the queue…</p>
        ) : !view || view.groups.length === 0 ? (
          <div className="flog-clean">
            <p className="flog-clean-title">Nothing has failed on its own.</p>
            <p className="flog-clean-sub">When one of Drover’s own runs crashes, stalls, breaks a step, or hands back unusable output, it lands here — grouped, counted, and named — so you see what to fix next.</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="flog-msg">
            {filter === "self_inflicted"
              ? "No bugs to fix right now."
              : "No transient failures right now."}
          </p>
        ) : (
          <ul className="flog-list">
            {shown.map((g) => <GroupRow key={g.signature} group={g} />)}
          </ul>
        )}
      </div>
    </aside>
  );
}
