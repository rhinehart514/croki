// The campaign reading — a live push read up close: the approaches and live pushes rolled up under it.
// A campaign holds the efforts that reach people a particular way; this shows what it is and the pushes
// beneath it. Read-only snapshot from the descended node; steering a specific push happens by descending
// into that effort (EffortReading). When the campaign carries its own bet, "try another approach"
// branches a genuinely distinct sibling campaign from it (deterministic branchFrom fork), with a phrased
// fallback for older brains.
import { useState } from "react";
import { driveTeammate } from "@/api";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function CampaignReading({ ventureId, node, onBranched }: {
  ventureId: string;
  node: AtlasNode;
  onBranched?: () => void;
}) {
  const data = node.data;
  const machinery = data.machineryCounts ?? [];
  const betId = data.bet?.id ?? (node.id.startsWith("bet:") ? node.id.slice("bet:".length) : null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branch = async () => {
    if (busy || !betId) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const goal = `Try another approach to ${data.title}`;
    try {
      await driveTeammate(ventureId, { goal, branchFrom: betId });
      setNote("A new approach is branching. It will arrive as a sibling on the world.");
      onBranched?.();
    } catch (cause) {
      try {
        await driveTeammate(ventureId, { goal, betId });
        setNote("A new approach is on the way. It will arrive on the world.");
        onBranched?.();
      } catch {
        setError(cause instanceof Error ? cause.message : "Your venture could not branch this outreach.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="iw-reading iw-reading-campaign">
      {/* Archetype kicker is in the descend header; the serif title is the single headline. */}
      <h2 className="iw-reading-title">{data.title}</h2>
      {data.stateLabel ? (
        <div className="iw-reading-state" data-tone={data.active ? "live" : "plain"}>
          <span className="iw-reading-state-dot" />{data.stateLabel}
        </div>
      ) : null}
      {data.statement ? (
        <section className="iw-reading-sec">
          <div className="iw-reading-sk">What this is</div>
          <p className="iw-reading-p">{data.statement}</p>
        </section>
      ) : null}
      {machinery.length ? (
        <section className="iw-reading-sec">
          <div className="iw-reading-sk">Live pushes rolled up</div>
          <ul className="iw-reading-rollup">
            {machinery.map((item) => (
              <li key={item.label}><span>{item.label}</span><span className="iw-reading-rollup-n">{item.count}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
      {betId ? (
        <section className="iw-reading-sec">
          <div className="iw-reading-actions">
            <button type="button" className="iw-reading-btn" data-kind="branch" onClick={() => void branch()} disabled={busy}>
              {busy ? "Branching…" : "Try another approach"}
            </button>
          </div>
          {note ? <p className="iw-reading-hint" role="status">{note}</p> : null}
          {error ? <p className="iw-reading-error" role="alert">{error}</p> : null}
        </section>
      ) : null}
      <div className="iw-reading-note">
        <span className="iw-reading-note-k">To steer one push</span>
        Rise, then descend into the live push you want to change — each carries its own drafts and steering.
      </div>
    </div>
  );
}
