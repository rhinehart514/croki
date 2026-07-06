// Shared palette constants — the block labels, the families that group them, and the drag MIME — kept
// out of the component file so both the palette and the canvas can import them (and so fast-refresh
// stays happy about the component module only exporting a component).

// The MIME the palette writes on drag and the canvas reads on drop. A private type so a stray file or
// text drag never gets mistaken for a block.
export const PALETTE_DRAG_MIME = "application/drover-block";

// The MIME a Crew or Skill row writes on drag, read by the canvas-area drop target to add a pipeline
// step. Kept distinct from the belief-block MIME so the two object models never cross: a block drop
// builds the strategy map, a step drop builds the pipeline workflow. Payload is JSON:
// { kind: "agent" | "skill"; ref: string; label: string }.
export const STEP_DRAG_MIME = "application/drover-step";

// One-word rail labels for each block. The card the drop creates keeps the same glyph (kindIcon), so a
// "Buyer" row and the buyer card it becomes read as one thing.
export const PALETTE_BLOCK_LABEL: Record<string, string> = {
  buyer: "Buyer",
  pain: "Pain",
  job: "Job",
  trigger: "Trigger",
  workaround: "Workaround",
  value_prop: "Value",
  offer: "Offer",
  channel: "Channel",
  message: "Message",
  path: "Path",
  proof_point: "Proof",
};

// The blocks grouped into the plain-English families a founder tells a market story in — who we help and
// what moves them (Market), what we sell (Offer), how we reach them (Channel), why they'd believe us
// (Proof). Grounded in the real object types the canvas already lays out in STAGE_COLUMNS.
export const PALETTE_FAMILIES: { label: string; blocks: string[] }[] = [
  { label: "Market", blocks: ["buyer", "pain", "job", "trigger", "workaround"] },
  { label: "Offer", blocks: ["value_prop", "offer"] },
  { label: "Channel", blocks: ["channel", "message", "path"] },
  { label: "Proof", blocks: ["proof_point"] },
];

export const PALETTE_ALL_BLOCKS = PALETTE_FAMILIES.flatMap((family) => family.blocks);
