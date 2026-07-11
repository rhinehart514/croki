import { useState } from "react";
import { Archive, Check, FileSearch, GitBranch, LoaderCircle, MessageSquare, Pin, RefreshCw, X } from "lucide-react";
import { CrewFace } from "@/components/crew/CrewFace";
import { humanizeRef } from "@/lib/agentPersona";
import type { TerrainFocusItem, } from "@/lib/terrainProjection";
import type { TerrainCrewPosition, WovenRef } from "@/types";
import "@/styles/terrain-focus.css";

export type TerrainAction = "correct" | "keep" | "park" | "investigate" | "ask" | "pin" | "pipeline";

const refLabel = (ref: WovenRef) => `${ref.type ?? "source"}:${ref.id}`;

export function TerrainFocus({ item, onClose, onAction, onAskCrew, onOpenCrew }: {
  item: TerrainFocusItem;
  onClose: () => void;
  onAction: (action: TerrainAction, item: TerrainFocusItem) => void;
  onAskCrew?: (item: TerrainFocusItem) => Promise<TerrainCrewPosition[]>;
  onOpenCrew?: (ref: string) => void;
}) {
  const [positions, setPositions] = useState<TerrainCrewPosition[]>([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const hypothesis = item.kind === "hypothesis" ? item.hypothesis : null;
  const observation = item.kind === "truth" ? item.observation : null;
  const evidence = hypothesis?.evidenceRefs ?? observation?.evidenceRefs ?? [];
  const counter = hypothesis?.counterEvidenceRefs ?? [];
  const provenance = hypothesis?.provenance ?? observation?.provenance ?? "observed";
  const claim = hypothesis?.claim ?? observation?.claim ?? "";

  const askCrew = async () => {
    if (!hypothesis || asking) return;
    if (!onAskCrew) {
      onAction("ask", item);
      return;
    }
    setAsking(true);
    setAskError(null);
    try {
      const next = await onAskCrew(item);
      if (next) setPositions(next);
      else onAction("ask", item);
    } catch (error) {
      setAskError(error instanceof Error ? error.message : "The crew read did not complete.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <aside
      className="tfocus"
      role="complementary"
      aria-label="Focused terrain read"
      data-testid={hypothesis ? "terrain-hypothesis-detail" : "terrain-truth-detail"}
      data-ref={refLabel(item.ref)}
    >
      <header className="tfocus-head" data-testid="terrain-focus" data-ref={refLabel(item.ref)}>
        <div>
          <span className={`tfocus-provenance is-${provenance}`}>{provenance}</span>
          <h2>{hypothesis?.title ?? "Product truth"}</h2>
        </div>
        <button type="button" className="tfocus-close" onClick={onClose} aria-label="Close terrain focus"><X size={16} /></button>
      </header>
      <div className="tfocus-body">
        <p className="tfocus-claim">{claim}</p>
        {hypothesis?.whyItMatters ? <section><h3>Why it matters</h3><p>{hypothesis.whyItMatters}</p></section> : null}
        <section>
          <h3>Evidence</h3>
          {evidence.length ? <ul>{evidence.map((r) => <li key={refLabel(r)}><code>{refLabel(r)}</code></li>)}</ul>
            : <p className="tfocus-empty">No supporting receipt resolves yet. Treat this as speculative.</p>}
        </section>
        {counter.length ? <section><h3>Counterevidence</h3><ul>{counter.map((r) => <li key={refLabel(r)}><code>{refLabel(r)}</code></li>)}</ul></section> : null}
        {hypothesis?.unknown ? <section><h3>Still unknown</h3><p>{hypothesis.unknown}</p></section> : null}
        {hypothesis?.falsifier ? <section><h3>Falsifier — what would change this read</h3><p>{hypothesis.falsifier}</p></section> : null}
        {hypothesis?.crewRefs.length ? (
          <section><h3>Crew</h3><div className="tfocus-crew">{hypothesis.crewRefs.map((r) => (
            <button type="button" key={refLabel(r)} onClick={() => onOpenCrew?.(r.id)} title={`Open ${humanizeRef(r.id)}`}>
              <CrewFace agentRef={r.id} size={24} /><span>{humanizeRef(r.id)}</span>
            </button>
          ))}</div></section>
        ) : null}
        {positions.length ? (
          <section aria-label="Distinct crew positions">
            <h3>Where the crew differs</h3>
            <div className="tfocus-positions">
              {positions.map((position) => (
                <article className="tfocus-position" data-testid="crew-position" key={position.id}>
                  <strong>{humanizeRef(position.participantRef)}</strong>
                  <p>{position.claim}</p>
                  {position.uncertainty ? <small>Unsure: {position.uncertainty}</small> : null}
                  {position.recommendation ? <small>Would do next: {position.recommendation}</small> : null}
                  {position.falsifier ? <small>Would change their mind: {position.falsifier}</small> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {askError ? <p className="tfocus-empty" role="alert">{askError}</p> : null}
        {hypothesis?.suggestedMove ? (
          <section className="tfocus-move"><h3>Possible move</h3><strong>{hypothesis.suggestedMove.title}</strong><p>{hypothesis.suggestedMove.intendedEffect}</p>
            {hypothesis.suggestedMove.measurementIntent ? <small>{hypothesis.suggestedMove.measurementIntent}</small> : null}
          </section>
        ) : null}
      </div>
      <footer className="tfocus-actions">
        <button type="button" onClick={() => onAction("correct", item)}><RefreshCw size={13} /> Correct</button>
        {hypothesis ? <button type="button" onClick={() => onAction("keep", item)}><Check size={13} /> Keep</button> : null}
        {hypothesis ? <button type="button" onClick={() => onAction("park", item)}><Archive size={13} /> Park</button> : null}
        <button type="button" onClick={() => onAction("investigate", item)}><FileSearch size={13} /> Find evidence</button>
        <button
          type="button"
          data-testid="terrain-ask-crew"
          disabled={asking}
          onClick={() => void askCrew()}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            void askCrew();
          }}
        >
          {asking ? <LoaderCircle className="spin" size={13} /> : <MessageSquare size={13} />} Ask crew
        </button>
        {hypothesis ? <button type="button" onClick={() => onAction("pin", item)}><Pin size={13} /> Pin as question</button> : null}
        {hypothesis ? (
          <button
            type="button"
            data-testid="terrain-turn-into-pipeline"
            data-terrain-primary="true"
            className="is-primary"
            onClick={() => onAction("pipeline", item)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onAction("pipeline", item);
            }}
          >
            <GitBranch size={13} /> Turn into pipeline
          </button>
        ) : null}
      </footer>
    </aside>
  );
}
