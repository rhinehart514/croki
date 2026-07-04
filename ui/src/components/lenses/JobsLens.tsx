// JobsLens — "Goals & Jobs": the userGoals bag drawn as a JOB MAP, not a free node graph.
//
// Each user goal is one job someone comes to do. We read it as a left-to-right journey —
// the actor, the job/goal they pursue, the outcome they're after — and we GROUP those journeys
// by actor into swimlanes, so the picture answers "who comes here, and what is each of them
// trying to get done?" at a glance. One actor = one lane; each job in that lane flows rightward
// from its goal card to its outcome.
//
// It reuses the shared ObjectCard (so a job card reads identically to a thing in the Conceptual
// lens), the shared FlowArrow (the "leads to" glyph), the shared LensPanel (the legend), and the
// shared ProvenanceTag treatment baked into ObjectCard — a speculative job is ghosted and tagged,
// so a guessed job can never read as a proven one. No React Flow here: a job map is a structured
// layout, not a graph the founder drags around.

import { useMemo } from "react";
import type { ProductModel, ProductModelEdit, ProductThing, ProductUserGoal } from "@/types";
import { ObjectCard, FlowArrow, LensPanel, ProvenanceTag } from "@/components/lenses/shared";
import "./JobsLens.css";

type LensProps = {
  model: ProductModel;
  selected: string | null;
  onSelect: (id: string) => void;
  onRevise: (edit: ProductModelEdit) => void;
};

// One actor's lane: the actor's display name + every job that actor comes to do.
type Lane = { actor: string; jobs: ProductUserGoal[] };

export function JobsLens({ model, selected, onSelect }: LensProps) {
  // Jobs can name their related things by id OR by name — resolve both so the chips read as the
  // human thing-name rather than a raw id (mirrors ProductFlowCanvas's idByRef pass).
  const thingByRef = useMemo(() => {
    const map = new Map<string, ProductThing>();
    for (const t of model.things) {
      map.set(t.id, t);
      if (t.name) map.set(t.name.toLowerCase(), t);
    }
    return map;
  }, [model.things]);

  // Group the goals into actor lanes, preserving first-seen order for both lanes and the jobs
  // inside them. An empty/blank actor falls into one honest "Anyone" lane rather than vanishing.
  const lanes = useMemo<Lane[]>(() => {
    const order: string[] = [];
    const byActor = new Map<string, ProductUserGoal[]>();
    for (const g of model.userGoals) {
      const actor = (g.actor || "").trim() || "Anyone";
      if (!byActor.has(actor)) {
        byActor.set(actor, []);
        order.push(actor);
      }
      byActor.get(actor)!.push(g);
    }
    return order.map((actor) => ({ actor, jobs: byActor.get(actor)! }));
  }, [model.userGoals]);

  // A lens only renders with a non-empty model, but userGoals specifically can be empty even when
  // things exist — say so plainly instead of drawing an empty board.
  if (lanes.length === 0) {
    return (
      <div className="jobs-lens jobs-lens-empty" role="region" aria-label="Goals and jobs lens">
        <p className="jobs-empty-note">
          No jobs mapped yet. When the picture captures what people come to do, each actor's jobs
          show here as a left-to-right journey — from the job to the outcome they're after.
        </p>
      </div>
    );
  }

  const guessCount = model.userGoals.filter((g) => g.provenance === "speculative").length;

  return (
    <div className="jobs-lens" role="region" aria-label="Goals and jobs lens">
      <div className="jobs-board">
        {lanes.map((lane) => (
          <section key={lane.actor} className="jobs-lane" aria-label={`${lane.actor} jobs`}>
            {/* The lane rail — who this actor is, and how many jobs they come to do. */}
            <div className="jobs-lane-rail">
              <span className="jobs-lane-actor">{lane.actor}</span>
              <span className="jobs-lane-count">
                {lane.jobs.length} job{lane.jobs.length === 1 ? "" : "s"}
              </span>
            </div>

            {/* Each job: goal card → arrow → outcome, flowing rightward. */}
            <div className="jobs-lane-jobs">
              {lane.jobs.map((g) => {
                const related = g.relatedThings
                  .map((ref) => thingByRef.get(ref) ?? thingByRef.get((ref || "").toLowerCase()))
                  .filter((t): t is ProductThing => Boolean(t));
                return (
                  <div key={g.id} className="jobs-journey">
                    <ObjectCard
                      kind="goal"
                      name={g.goal || "Untitled job"}
                      provenance={g.provenance}
                      selected={selected === g.id}
                      onSelect={() => onSelect(g.id)}
                      footer={
                        related.length > 0 && (
                          <div className="jobs-related" title="Objects this job touches">
                            {related.map((t) => (
                              <span key={t.id} className="jobs-related-chip">{t.name}</span>
                            ))}
                          </div>
                        )
                      }
                    />
                    <FlowArrow className="jobs-arrow" />
                    {/* The outcome — what success looks like for this job. It belongs to the goal,
                        so it carries the goal's provenance and ghosts in step with it. */}
                    <div
                      className={`jobs-outcome${g.provenance === "speculative" ? " jobs-outcome-spec" : ""}`}
                    >
                      <div className="jobs-outcome-eyebrow">
                        <span className="jobs-outcome-label">Outcome</span>
                        <ProvenanceTag provenance={g.provenance} />
                      </div>
                      <div className="jobs-outcome-text">
                        {g.outcome || <span className="jobs-outcome-blank">No outcome named yet</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Legend — what the lane and the journey mean, and how grounded the jobs are. Docks to the
          bottom full-width at ≤560px instead of floating off-screen. */}
      <LensPanel title="Job map" className="jobs-legend lens-panel-dock">
        <div className="jobs-legend-row">
          <span className="jobs-legend-flow">job<FlowArrow className="jobs-arrow" />outcome</span>
          <span className="jobs-legend-note">grouped by actor</span>
        </div>
        <div className="jobs-legend-counts">
          <span className="product-count product-count-cited">
            {model.userGoals.length} job{model.userGoals.length === 1 ? "" : "s"}
          </span>
          {guessCount > 0 && (
            <span className="product-count product-count-guess">
              {guessCount} guess{guessCount === 1 ? "" : "es"}
            </span>
          )}
        </div>
      </LensPanel>
    </div>
  );
}
