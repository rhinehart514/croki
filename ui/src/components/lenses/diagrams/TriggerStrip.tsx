// TriggerStrip — the Problem & Trigger band (layer "trigger"): the why-now wedges, heat-ranked. Every
// real person a run surfaced carries a per-appearance "why now" trigger; this gathers those across all
// the project's People, tallies how often each wedge recurs, and ranks them hottest-first so the
// strongest reason-to-act-now sits on top. The bar length is the recurrence, never an invented score.
//
// If People haven't been promoted yet, it falls back to the band's own evidence (the same triggers the
// board already surfaced). Honest-blank when there are no wedges at all.

import { useEffect, useMemo, useState } from "react";
import type { Person } from "@/types";
import type { LayerDiagramProps } from "@/components/lenses/LayerDiagramProps";
import { listPeople } from "@/api";
import "./BandDiagrams.css";

type Wedge = { text: string; count: number };

export function TriggerStrip({ belief, projectId }: LayerDiagramProps) {
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    let live = true;
    const load = projectId ? listPeople(projectId).then((res) => res.people) : Promise.resolve<Person[]>([]);
    load
      .then((p) => { if (live) setPeople(p); })
      .catch(() => { if (live) setPeople([]); });
    return () => { live = false; };
  }, [projectId]);

  const wedges = useMemo<Wedge[]>(() => {
    // Hottest-first by recurrence across real appearances.
    if (people && people.length > 0) {
      const counts = new Map<string, number>();
      for (const p of people) {
        for (const a of p.appearances ?? []) {
          const t = (a.trigger ?? "").trim();
          if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
      if (counts.size > 0) {
        return [...counts.entries()]
          .map(([text, count]) => ({ text, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 12);
      }
    }
    // Fall back to the board's already-surfaced evidence (each counts once).
    return belief.evidence.map((text) => ({ text, count: 1 }));
  }, [people, belief.evidence]);

  if (people === null) {
    return <div className="band-diagram-load"><span className="band-diagram-spin" />Reading the wedges…</div>;
  }

  if (wedges.length === 0) {
    return (
      <div className="band-diagram-empty" role="region" aria-label="Problem & Trigger — no wedges yet">
        <strong>No why-now wedge observed yet</strong>
        <span>
          When a run surfaces a real person, the reason it's worth reaching them now rides along as their
          trigger. Those wedges collect here, heat-ranked by how often they recur. Nothing is seeded.
        </span>
      </div>
    );
  }

  const max = Math.max(...wedges.map((w) => w.count));

  return (
    <div className="band-diagram" role="region" aria-label="Why-now trigger heat strip">
      <div className="band-diagram-head">
        <span className="band-diagram-kicker">why now · heat-ranked</span>
        <p className="band-diagram-sub">
          The reasons it's worth reaching out now, ranked by how often each recurs across real entrants.
        </p>
      </div>
      <div className="trigstrip">
        {wedges.map((w, i) => (
          <div key={i} className="trig-row">
            <span className="trig-text">{w.text}</span>
            <span className="trig-heat">
              <span className="trig-bar">
                <span className="trig-bar-fill" style={{ width: `${Math.round((w.count / max) * 100)}%` }} />
              </span>
              <span className="trig-count">{w.count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
