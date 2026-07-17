// The record reading — what the market said, read up close. The outcome's own words are durable
// whether they support, reject, or leave the direction unresolved; provenance says how firmly it joins
// the work. Read-only snapshot from the descended node (the outcome carried on it).
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function RecordReading({ node }: { node: AtlasNode }) {
  const data = node.data;
  const outcome = data.outcome;
  const body = outcome?.body ?? data.statement ?? null;
  return (
    <div className="iw-reading iw-reading-record">
      {/* Archetype kicker is in the descend header; the serif title is the single headline. */}
      <h2 className="iw-reading-title">{data.title}</h2>
      {outcome?.observedAt ? <div className="iw-reading-state"><span className="iw-reading-state-dot" />Returned {new Date(outcome.observedAt).toLocaleDateString()}</div> : null}
      <section className="iw-reading-sec">
        <div className="iw-reading-sk">The market&apos;s words</div>
        <p className="iw-reading-p iw-reading-voice">{body ?? "This return did not include a message."}</p>
      </section>
      {outcome?.from ? (
        <section className="iw-reading-sec">
          <div className="iw-reading-sk">From</div>
          <p className="iw-reading-p">{outcome.from}{outcome.channel ? ` · ${outcome.channel}` : ""}</p>
        </section>
      ) : null}
      <div className="iw-reading-note">
        <span className="iw-reading-note-k">Durable, whatever it says</span>
        A return is kept whether it supports, rejects, or leaves the direction unresolved. It shapes what the firm tries next.
      </div>
    </div>
  );
}
