// Lightweight lens metadata (id + label) shared with the single command dock's lens switcher.
// Kept in a non-component module so the canvas component files only export components — fast-refresh
// requires that. The ids/labels mirror the `LENSES` arrays in GtmCanvas.tsx and ProductCanvas.tsx;
// these are the human-facing switcher entries, no rendering logic.

export type LensMeta = { id: string; label: string };

export const GTM_LENS_META: LensMeta[] = [
  { id: "channel-flow", label: "Pipeline flow" },
  { id: "engine", label: "Engine" },
];

export const PRODUCT_LENS_META: LensMeta[] = [
  { id: "conceptual", label: "Conceptual" },
  { id: "jobs", label: "Goals & Jobs" },
  { id: "ia", label: "IA" },
  { id: "workflow", label: "Workflows" },
  { id: "interaction", label: "Interaction" },
];
