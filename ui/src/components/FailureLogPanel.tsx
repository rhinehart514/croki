// FailureLogPanel — the founder-facing view of Drover watching its OWN runs.
//
// When Drover runs its own pipelines and something fails (a crash, a stall, a broken step, or the model
// handing back unusable output), that failure is auto-filed into the same dogfood queue the founder uses
// for manual friction. This panel surfaces those self-observed failures so the team can see what to fix
// next — grouped by signature with an occurrence count, self-inflicted separated from transient, newest
// first, each row naming the pipeline, the step, when it happened, and the raw error line.
//
// SCAFFOLD PLACEHOLDER (lane: SURFACE). This is a mounted, renders-without-error stub that freezes the
// component's contract — its props, its data source (getFailureLog from api.ts), and where it lives. The
// SURFACE builder fleshes out the real operator surface inside it against the design bar (light #fafafa
// ground, monochrome zinc, Geist, semantic color only, no gradients, no glass on content). Do NOT rebuild
// the data contract; consume FailureLogView exactly as api.ts returns it.
//
// HARD RULE (carried from the crew work): never render an agent's raw system prompt on this surface. The
// queue's errorSnippet is a trimmed error line, and inputSummary is a count + a safe name — no item bodies,
// no prompts. Render only those.

import { useEffect, useState } from "react";
import { getFailureLog, type FailureLogView } from "@/api";

// The one prop the panel needs — the founder can dismiss it. The SURFACE builder may add a `projectId`
// filter later, but the queue is repo-global today (friction.mjs writes one dogfood/queue), so this stays
// minimal on purpose.
export function FailureLogPanel({ onClose }: { onClose?: () => void }) {
  const [view, setView] = useState<FailureLogView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getFailureLog()
      .then((v) => { if (live) setView(v); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);

  // Placeholder body: renders the raw counts so the mount is verifiable end-to-end without asserting the
  // final design. The SURFACE builder replaces everything inside this <section> with the real grouped,
  // split, newest-first operator surface.
  return (
    <section className="failure-log-panel" aria-label="Self-observed failures">
      <header className="failure-log-head">
        <strong>What Drover saw fail</strong>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close self-observed failures">Close</button>
        ) : null}
      </header>
      {error ? (
        <p className="failure-log-error">Couldn’t load the failure log: {error}</p>
      ) : view == null ? (
        <p className="failure-log-empty">Loading…</p>
      ) : view.groups.length === 0 ? (
        <p className="failure-log-empty">No self-observed failures yet.</p>
      ) : (
        <p className="failure-log-count">
          {view.selfInflictedCount} self-inflicted · {view.transientCount} transient ·{" "}
          {view.groups.length} distinct
        </p>
      )}
    </section>
  );
}
