// WorkflowLens — "Workflows": the workflows bag rendered as FLOW DIAGRAMS. Each ProductWorkflow is
// a named flow with an actor and an ordered list of steps; its steps render left → right as a
// sequence of step cards joined by "flows into" arrows. Multiple workflows stack as separate lanes
// (rows), so the whole bag reads as a column of parallel flows in one calm picture.
//
// Provenance is load-bearing per workflow AND per step: a speculative workflow is ghosted at the
// lane header (the ProvenanceTag plus the dashed lane treatment), and every step card is an
// ObjectCard that inherits the workflow's provenance, so a guessed flow can never read as proven.
// Selection is shared across lenses: a step's id (and a workflow's id) is the shared selected key,
// so touching a step here can stay lit in another lens.

import { ObjectCard, ProvenanceTag, LensPanel, FlowArrow } from "@/components/lenses/shared";
import type { ProductModel, ProductModelEdit } from "@/types";
import { cn } from "@/lib/utils";
import "./WorkflowLens.css";

type LensProps = {
  model: ProductModel;
  selected: string | null;
  onSelect: (id: string) => void;
  onRevise: (edit: ProductModelEdit) => void;
};

export function WorkflowLens({ model, selected, onSelect }: LensProps) {
  const workflows = model.workflows ?? [];

  const derivedCount = workflows.filter((w) => w.provenance === "derived").length;
  const guessCount = workflows.length - derivedCount;

  // A workflow with no steps still has a header — it's an honest "named, not yet detailed" flow.
  // Don't drop it; show the header and a quiet empty note so the picture stays truthful.
  if (workflows.length === 0) {
    return (
      <div className="workflow-lens">
        <div className="workflow-empty">
          <p className="workflow-empty-note">
            No workflows in this picture yet. Workflows are the named flows of ordered steps people
            move through — redraw the picture to surface them from the product code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-lens">
      <div className="workflow-scroll">
        <div className="workflow-lanes">
          {workflows.map((wf) => {
            const speculative = wf.provenance === "speculative";
            const laneSelected = selected === wf.id;
            const steps = wf.steps ?? [];
            return (
              <section
                key={wf.id}
                className={cn(
                  "workflow-lane",
                  speculative && "workflow-lane-spec",
                  laneSelected && "workflow-lane-selected",
                )}
                aria-label={`Workflow: ${wf.name || "Untitled"}`}
              >
                {/* Lane header — the flow's name, who runs it, and how grounded it is. The header is
                    a button so the whole workflow can be the shared selection target. */}
                <button
                  type="button"
                  className="workflow-lane-head"
                  onClick={() => onSelect(wf.id)}
                  title={wf.summary || undefined}
                >
                  <span className="workflow-lane-meta">
                    <span className="workflow-lane-name">{wf.name || "Untitled flow"}</span>
                    {wf.actor && <span className="workflow-lane-actor">{wf.actor}</span>}
                  </span>
                  <ProvenanceTag
                    provenance={wf.provenance}
                    citationCount={wf.evidence?.length ?? 0}
                  />
                </button>
                {wf.summary && <p className="workflow-lane-summary">{wf.summary}</p>}

                {/* The flow itself — steps left → right, joined by "flows into" arrows. Horizontally
                    scrollable so a long flow never overflows the lane on a narrow screen. */}
                {steps.length > 0 ? (
                  <ol className="workflow-steps" role="list">
                    {steps.map((step, i) => (
                      <li key={step.id} className="workflow-step-item">
                        <span className="workflow-step-index" aria-hidden="true">
                          {i + 1}
                        </span>
                        <ObjectCard
                          kind="step"
                          name={step.label}
                          summary={step.summary}
                          provenance={wf.provenance}
                          selected={selected === step.id}
                          onSelect={() => onSelect(step.id)}
                          className="workflow-step-card"
                        />
                        {i < steps.length - 1 && (
                          <FlowArrow className="workflow-step-arrow" />
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="workflow-steps-empty">
                    No steps detailed for this flow yet.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* Legend — what the lanes mean and how grounded the bag is. Docks to the bottom at ≤560px. */}
      <LensPanel
        title="Workflows"
        className="workflow-legend lens-panel-dock"
      >
        <div className="workflow-legend-counts">
          <span className="product-count product-count-cited" title="Flows grounded in real code">
            {derivedCount} derived
          </span>
          {guessCount > 0 && (
            <span className="product-count product-count-guess" title="Flows that are interpretive guesses">
              {guessCount} guess{guessCount === 1 ? "" : "es"}
            </span>
          )}
        </div>
        <p className="workflow-legend-note">
          Each lane is a named flow; cards read left to right in order. Guessed flows are ghosted.
        </p>
      </LensPanel>
    </div>
  );
}
