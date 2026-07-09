import { Shield } from "lucide-react";
import { EmbodiedFlow } from "@/components/composer/EmbodiedFlow";
import type { Candidate } from "@/lib/sessionCandidates";
import "@/styles/candidate-canvas.css";

// The candidate pipelines, laid out ON THE CANVAS.
//
// When a goal admits more than one way through, the operator composes 2–3 candidate pipeline SHAPES (each
// a full graph in the open node model) and parks the session at "waiting_for_candidates". This is the
// primary place the founder sees them: the 2–3 shapes side by side on the canvas ground — not a launcher,
// not a spinner — each a real pipeline you can read left-to-right (its crew in order, ending at YOUR gate)
// and pick. Picking one is the founder act that builds it into the live pipeline (compose_and_run, which
// still stops at the founder gate). The composer dock echoes the same shapes inline as a secondary view.
//
// Nothing here runs or sends. A candidate is a shape; picking it is the founder's call, never a tool's.
// It reuses EmbodiedFlow — the same proposed-pipeline rendering the composer uses — so a shape reads the
// same wherever it appears; this component only lays the set out as a pickable board on the canvas.
export function CandidatePipelinesCanvas({
  candidates,
  productName,
  onPick,
  pickedId,
}: {
  candidates: Candidate[];
  productName: string;
  // The founder's pick — the one authorized entry that builds a shape into the live pipeline.
  onPick: (candidate: Candidate) => void;
  // The id of a shape already picked (the build is underway), so the others recede and it reads "Building…".
  pickedId?: string | null;
}) {
  return (
    <div className="cand-canvas">
      <div className="cand-canvas-head">
        <h2 className="cand-canvas-title">A few ways to take {productName} to market</h2>
        <p className="cand-canvas-sub">
          Each is a full pipeline — its crew in order, ending at your gate. Pick the one to build.
          Nothing sends until you approve it there.
        </p>
      </div>

      <div className="cand-canvas-board" data-count={candidates.length}>
        {candidates.map((c) => (
          <div className="cand-canvas-lane" key={c.id} data-dim={pickedId && pickedId !== c.id ? "true" : undefined}>
            <EmbodiedFlow
              nodes={c.nodes}
              edges={c.edges}
              title={c.label}
              rationale={c.rationale}
              onBuild={() => onPick(c)}
              buildLabel="Pick this pipeline"
              dimmed={!!pickedId && pickedId !== c.id}
              building={pickedId === c.id}
            />
          </div>
        ))}
      </div>

      <p className="cand-canvas-foot">
        <Shield size={13} aria-hidden="true" />
        The pick is yours. Building one shape drops the others — you can always start a new pipeline later.
      </p>
    </div>
  );
}
