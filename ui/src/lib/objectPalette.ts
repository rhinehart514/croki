// Shared drag constant for the pipeline-step canvas — kept out of the component file so both the
// rails and the canvas can import it (and so fast-refresh stays happy about the component module
// only exporting a component).

// The MIME a Crew or Skill row writes on drag, read by the canvas-area drop target to add a pipeline
// step. Payload is JSON: { kind: "agent" | "skill"; ref: string; label: string }.
export const STEP_DRAG_MIME = "application/drover-step";
