// BeliefSpine — the strip over one open pipeline: its OWN composed steps as a row of cards, each in
// plain words about what actually happened there (what came in, what was drafted, what waits at your
// gate, what moved after approval, what came back), closed by "What you've decided" when real
// conclusions exist. Derived entirely from the pipeline's graph and run state — no fixed face
// skeleton, no internal vocabulary, no bare scores. A pure read — no edits, no gate, no run.
//
// Mount (wherever the open pipeline renders — e.g. GtmCanvas):
//   <BeliefSpine projectId={model.projectId} channelId={activeChannelId} />
// Props are pure read inputs; no callbacks.

import { useSpine } from "@/lib/beliefSpine";
import "./BeliefSpine.css";

interface BeliefSpineProps {
  projectId: string;
  channelId: string;
}

export function BeliefSpine({ projectId, channelId }: BeliefSpineProps) {
  const state = useSpine(projectId, channelId);

  if (state.status === "loading") {
    return (
      <div className="spine-state" role="status" aria-live="polite">
        Reading this pipeline…
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <div className="spine-state spine-state-muted">
        No pipeline chosen yet — pick one to see where its work stands.
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="spine-state spine-state-error" role="alert">
        Couldn't read this pipeline. {state.error}
      </div>
    );
  }

  const { cards } = state;

  if (cards.length === 0) {
    return (
      <div className="spine-state spine-state-muted">
        This pipeline has no steps yet — describe the goal in the composer and its steps land here.
      </div>
    );
  }

  return (
    <div className="spine-row" role="list" aria-label="This pipeline, step by step">
      {cards.map((card) => (
        <div className="spine-card" role="listitem" key={card.id} aria-label={card.title}>
          <div className="spine-role">{card.title}</div>
          <div className={`spine-belief${card.empty ? " spine-belief-blind" : ""}`}>
            {card.body}
          </div>
          {card.detail ? <div className="spine-detail">“{card.detail}”</div> : null}
          {card.needsYou ? (
            <div className="spine-foot">
              <span className="spine-chip">
                <span className="spine-dot tone-testing" />
                {card.needsYou} waiting on you
              </span>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
