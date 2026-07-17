// The read-only reading for structural world nodes that are not steerable efforts — a capability (a
// port into the world), who-it-helps, how-it-works, or the venture's own question. These are read, not
// directed: steering happens by descending into an effort, not a capability or a concept. The archetype
// kicker lives in the descend header (breadcrumb root); the serif title is the single headline here, so
// there is no mono restatement above it. Renders the snapshot carried on the descended node — no
// re-fetch, no invented fields.
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function ContextReading({ node }: { node: AtlasNode }) {
  const data = node.data;
  const isCapability = data.kind === "capability";
  const connected = data.capabilityConnected !== false;
  return (
    <div className="iw-reading iw-reading-context">
      <h2 className="iw-reading-title">{data.title}</h2>
      {isCapability ? (
        <div className="iw-reading-state" data-tone={connected ? "live" : "plain"}>
          <span className="iw-reading-state-dot" style={connected ? undefined : { background: "var(--faint)" }} />
          {connected ? "Connected" : "Not connected"}
        </div>
      ) : null}
      {data.statement ? (
        <section className="iw-reading-sec">
          <div className="iw-reading-sk">What this is</div>
          <p className="iw-reading-p">{data.statement}</p>
        </section>
      ) : null}
      <div className="iw-reading-note">
        <span className="iw-reading-note-k">{isCapability ? "How the firm uses it" : "Part of the working theory"}</span>
        {isCapability
          ? "The crew reads and acts through this port; anything it would send to the world still waits for your hand at the gate."
          : "This is part of the firm’s working picture. To direct real work, rise and descend into a live push — each carries its own drafts and steering."}
      </div>
    </div>
  );
}
