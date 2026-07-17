// The teammate reading — a crew member read up close: their role, what they are on right now, and how
// the firm routes work to them (you never assign; they claim in the conversation). Read-only snapshot
// from the descended node; the amber signal never lives here (it is on the effort/gate).
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import { crewColor, initialFor } from "../../nodes/nodeCrew";

export function TeammateReading({ node }: { node: AtlasNode }) {
  const data = node.data;
  const color = crewColor(data.agentRef);
  const working = data.crewPresence === "working" || data.crewPresence === "asking";
  return (
    <div className="iw-reading iw-reading-teammate">
      {/* Archetype kicker is in the descend header; the serif name is the single headline. */}
      <h2 className="iw-reading-title">{data.title}</h2>
      <div className="iw-reading-state">
        <span className="iw-reading-state-dot" style={{ background: color }} />
        {working ? "Working" : "Standing by"}
      </div>
      {data.motionLabel ? (
        <section className="iw-reading-sec">
          <div className="iw-reading-sk">{data.motionLabel}</div>
          <div className="iw-reading-crew-row">
            <span className="iw-face" style={{ ["--face-color" as string]: color }}>{initialFor(data.title)}</span>
            <span className="iw-reading-crew-name">{data.title}</span>
          </div>
        </section>
      ) : null}
      <section className="iw-reading-sec">
        <div className="iw-reading-sk">On right now</div>
        <p className="iw-reading-p">{data.crewDoing ?? "Nothing yet — waiting for a direction to claim."}</p>
      </section>
      <div className="iw-reading-note">
        <span className="iw-reading-note-k">How your venture routes</span>
        You don&apos;t assign work. {data.title} claims a direction in the conversation and says why — you&apos;ll see it land in the thread.
      </div>
    </div>
  );
}
