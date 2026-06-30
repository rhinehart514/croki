// PipelineDiagram — the Pipeline band (layer "people"): the durable People across channels, drawn
// with the existing PeopleLens VERBATIM. The board hands a diagram only its belief + projectId, so
// this thin wrapper fetches the two things PeopleLens needs — the promoted People and the channel
// names to label their appearances — by projectId, exactly as the other live surfaces do, then mounts
// PeopleLens. The cross-lens selection threads straight through so a person stays lit across bands.
// Honest-blank is PeopleLens's own job (its empty state) — nothing is seeded here.

import { useEffect, useState } from "react";
import type { ChannelMeta, Person } from "@/types";
import type { LayerDiagramProps } from "@/components/lenses/LayerDiagramProps";
import { PeopleLens } from "@/components/lenses/PeopleLens";
import { getProject, listPeople } from "@/api";
import "./BandDiagrams.css";

export function PipelineDiagram({ selected, onSelect, projectId }: LayerDiagramProps) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [channels, setChannels] = useState<ChannelMeta[]>([]);

  useEffect(() => {
    let live = true;
    const load = projectId
      ? Promise.all([listPeople(projectId), getProject().catch(() => null)])
          .then(([res, proj]) => ({ people: res.people, channels: proj?.project.channels ?? [] }))
      : Promise.resolve({ people: [] as Person[], channels: [] as ChannelMeta[] });
    load
      .then((r) => { if (live) { setPeople(r.people); setChannels(r.channels); } })
      .catch(() => { if (live) setPeople([]); });
    return () => { live = false; };
  }, [projectId]);

  if (people === null) {
    return <div className="band-diagram-load"><span className="band-diagram-spin" />Reading the pipeline…</div>;
  }

  return (
    <div className="band-pipeline">
      <PeopleLens people={people} channels={channels} selected={selected} onSelect={onSelect} />
    </div>
  );
}
