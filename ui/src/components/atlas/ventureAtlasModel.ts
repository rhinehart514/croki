import type { CanvasSelection } from "@/components/firm/directionTarget";
import type { ArchitectureRole, FirmArchitectureElement, FirmArchitectureProjection } from "@/types";

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
    omissions.unassignedBets ? `${omissions.unassignedBets} unassigned lines omitted` : null,
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
