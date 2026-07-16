import type { CanvasSelection } from "@/components/firm/directionTarget";
import type { AtlasEdge, AtlasNode, AtlasScene } from "./atlasTypes";
import type { ArchitectureRole, FirmArchitectureElement, FirmArchitectureProjection } from "@/types";

// The resting stage renders only the composite's five archetypes — the central question hub, the
// efforts ringing it (with their drafts as chips, not separate cards), the crew faces, the capability
// instruments, and the wall. The full projection also carries architecture concepts, per-draft work
// cards, outcomes, theory subjects, and group frames; those are the venture's *depth*, reachable
// through the outline and the docked inspector, but they are not resting canvas furniture — rendering
// them all is exactly the 94-node hairball the composite replaced. This keeps the stage legible: one
// hub, ~7 efforts, ~4 crew, ~2 capabilities, one wall (contract §4 Phase 2, "Node explosion").
//
// `atlas:intent` is the hub; `bet:*` are efforts; `crew:*` / `capability:*` / `atlas:wall` are the
// remaining archetypes. Everything else is depth that lives off the resting stage.
export function canvasArchetypeScene(scene: AtlasScene): AtlasScene {
  const keep = (node: AtlasNode) =>
    node.id === "atlas:intent"
    || node.id === "atlas:wall"
    || node.id.startsWith("bet:")
    || node.id.startsWith("crew:")
    || node.id.startsWith("capability:");
  const nodes = scene.nodes.filter(keep);
  const ids = new Set(nodes.map((node) => node.id));
  // Only the hub→effort spokes survive on the resting stage; edges into off-stage depth are dropped so
  // no wire dangles to a node that isn't rendered.
  const edges = scene.edges.filter((edge: AtlasEdge) => ids.has(edge.source) && ids.has(edge.target));
  return { nodes, edges, related: scene.related };
}

export function architectureId(nodeId: string) {
  return nodeId.startsWith("architecture:") ? nodeId.slice("architecture:".length) : null;
}

export function atlasNodeIdForSelection(selection: CanvasSelection) {
  if (selection?.theorySubjectId) return `theory:${selection.theorySubjectId}`;
  if (selection?.architectureId) return `architecture:${selection.architectureId}`;
  if (selection?.workRef) return `work:${selection.workRef}`;
  if (selection?.betId) return `bet:${selection.betId}`;
  return null;
}

export function stableId(prefix: string) {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

export function omissionSummary(projection: FirmArchitectureProjection, focused: boolean) {
  if (!focused) return null;
  if (Array.isArray(projection.omissions)) {
    return projection.omissions.join(" · ") || "Unrelated venture breadth is quieted, not removed.";
  }
  const omissions = projection.omissions;
  if (!omissions) return "Unrelated venture breadth is quieted, not removed.";
  const parts = [
    omissions.unassignedBets ? `${omissions.unassignedBets} unassigned ${omissions.unassignedBets === 1 ? "effort" : "efforts"} omitted` : null,
    omissions.historicalRevisions ? `${omissions.historicalRevisions} historical revisions omitted` : null,
    omissions.machinery ? "execution machinery hidden" : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Unrelated venture breadth is quieted, not removed.";
}

export function promotionFields(element: FirmArchitectureElement, role: Exclude<ArchitectureRole, "concept">) {
  const statement = element.statement || element.name;
  if (role === "system") return { does: statement, systemIds: undefined };
  if (role === "motion") {
    return { actor: "Intended actor", entry: statement, value: statement, systemIds: [], productRefs: [], repeatabilityClaim: statement };
  }
  if (role === "product-loop") {
    return { actor: "Intended actor", entry: statement, steps: [{ id: stableId("step"), label: statement }], value: statement, intendedChange: statement };
  }
  return {
    audience: "Intended audience",
    objective: statement,
    motionIds: [],
    supportingBetIds: [],
    measurement: { observation: statement, window: "Founder-defined boundary" },
    bounds: { startsAt: new Date().toISOString(), endsAt: null },
  };
}
