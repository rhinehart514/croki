import type { WorkflowCapability, WorkflowCapabilityKind } from "./workflowCapabilities";

// Human-readable pill vocabulary shared by every surface that renders a capability as a logo-led pill
// (AGENTS.md pill doctrine: name the kind and the authority in words, never lean on a logo or colour
// alone). Product / GTM's rail and the Work composer both read these, so the vocabulary can never drift
// between the two surfaces.
export const CAPABILITY_KINDS: Record<WorkflowCapabilityKind, string> = {
  action: "Action",
  "agent-skill": "Agent skill",
  markdown: "Markdown",
  source: "Source",
  tool: "Tool",
  workspace: "Workspace",
};

export function authorityLabel(capability: WorkflowCapability) {
  if (capability.authority === "founder-gate") return "Approval";
  if (capability.authority === "read") return "Read";
  return "Inward";
}

export function statusLabel(capability: WorkflowCapability) {
  if (capability.status === "reconnect") return "Reconnect";
  if (capability.status === "unavailable") return "Unavailable";
  return null;
}
