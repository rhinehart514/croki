import type {
  FirmArchitectureElement,
  FirmArchitectureEvidenceAnnotation,
  FirmArchitectureJoin,
  FirmArchitecturePressure,
  FirmArchitectureProjection,
  FirmTraceabilityGap,
} from "@/types";
import { deriveEpistemicState, type EpistemicState } from "./deriveEpistemicState";
import { edgeTreatmentForBasis, type EpistemicEdgeTreatment } from "./epistemicGrammar";
import type { AtlasNode } from "./atlasTypes";

// Pure fold: compute the epistemic state for every node and the join-truth treatment for every edge, from
// the SAME projection the scene is built over — called once per object with full projection context so
// deriveEpistemicState stays pure (spec: nothing re-derives the scene; the epistemic read is a facet of
// the one fold). The result is stamped onto node/edge data by the shell; the token/edge components read it.

function refId(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").replace(/^architecture:/, "").split("#")[0].trim();
  return normalized || null;
}

export type EpistemicIndex = ReturnType<typeof indexContext>;

// Index the projection's evidence annotations, pressure, and outcome joins by the object id they target.
export function indexContext(projection: FirmArchitectureProjection) {
  const annotationsById = new Map<string, FirmArchitectureEvidenceAnnotation[]>();
  for (const annotation of projection.evidenceAnnotations ?? []) {
    const id = refId(annotation.subjectRef);
    if (!id) continue;
    (annotationsById.get(id) ?? annotationsById.set(id, []).get(id)!).push(annotation as FirmArchitectureEvidenceAnnotation);
  }
  const pressureById = new Map<string, FirmArchitecturePressure[]>();
  for (const entry of projection.pressure ?? []) {
    const id = refId(entry.subjectRef ?? entry.subjectId);
    if (!id) continue;
    (pressureById.get(id) ?? pressureById.set(id, []).get(id)!).push(entry);
  }
  // Outcome joins measure the motion(s)/campaign(s) they carry; index by every element id they touch.
  const outcomeJoinsById = new Map<string, FirmArchitectureJoin[]>();
  for (const join of projection.joins?.outcomes ?? []) {
    const targets = [...(join.motionIds ?? []), ...(join.campaignIds ?? [])].map(refId).filter(Boolean) as string[];
    for (const id of targets) {
      (outcomeJoinsById.get(id) ?? outcomeJoinsById.set(id, []).get(id)!).push(join);
    }
  }
  return { annotationsById, pressureById, outcomeJoinsById };
}

export function epistemicStateForElement(
  projection: FirmArchitectureProjection,
  element: FirmArchitectureElement,
  context: EpistemicIndex,
  now?: number,
): EpistemicState {
  const id = element.id;
  // Historical is decided per-object from the element's OWN signals (ended bounds / live.ended), never
  // from the venture-wide omissions.historicalRevisions flag — that flag says the venture has hidden
  // history somewhere, not that THIS live element is historical, so demoting an active element on it
  // would be a false claim. The projection param is kept for gap/traceability context below.
  return deriveEpistemicState(
    {
      ref: `object:${id}`,
      provenance: element.provenance,
      bounds: element.bounds,
      live: element.live,
    },
    {
      annotations: context.annotationsById.get(id),
      pressure: context.pressureById.get(id),
      outcomeJoins: context.outcomeJoinsById.get(id),
      gaps: projection.traceability?.gaps,
      now,
    },
  );
}

// An outcome/work node: its truth is the JOIN it carries. An unattributed join (causal:false, no basis)
// reads Drover's read; an exact/contextual join reads measured (returned reality outranks assertion).
export function epistemicStateForJoin(join: FirmArchitectureJoin | null | undefined, now?: number): EpistemicState {
  return deriveEpistemicState(
    { join: join ?? null },
    { outcomeJoins: join ? [join] : [], now },
  );
}

// Compute the epistemic state a node's token should show, from its data. Returns null for nodes that carry
// no epistemic claim of their own (the intent hub, the wall, group frames) — their slot renders hollow.
export function epistemicStateForNode(
  node: AtlasNode,
  projection: FirmArchitectureProjection | null,
  context: EpistemicIndex | null,
  now?: number,
): EpistemicState | null {
  const kind = node.data.kind;
  if (kind === "intent" || kind === "wall" || kind === "group" || kind === "teammate" || kind === "capability") return null;
  if (kind === "theory") return "drovers-read"; // A working theory is explicitly Drover's provisional read.
  if ((kind === "outcome" || kind === "work") && node.data.join) return epistemicStateForJoin(node.data.join, now);
  if (node.data.element && projection && context) return epistemicStateForElement(projection, node.data.element, context, now);
  // A bet with no architecture element and no join carries no independent epistemic claim yet.
  return null;
}

// ── Edges ─────────────────────────────────────────────────────────────────────────────────────────

// Map one scene edge to its epistemic treatment from the projection truth it renders. Connection edges
// carry assertion + the brain's unsupported-link gap; join edges carry basis + causal. Returns null for
// edges with no epistemic meaning (hub spokes, group decoration) so they keep their current styling.
export function edgeTreatmentForSceneEdge(
  edge: { id: string },
  projection: FirmArchitectureProjection | null,
): EpistemicEdgeTreatment | null {
  const id = edge.id;
  // A document connection: read its assertion and consult the brain's unsupported-link gaps by id.
  if (id.startsWith("connection:")) {
    const connectionId = id.slice("connection:".length);
    const connection = projection?.connections.find((entry) => entry.id === connectionId) ?? null;
    const unsupported = Boolean(
      projection?.traceability?.gaps?.some(
        (gap: FirmTraceabilityGap) => gap.kind === "unsupported-link" && gap.relationshipId === connectionId,
      ),
    );
    if (unsupported) return "unsupported";
    if (connection?.assertion === "founder-asserted") return "founder-applied";
    return "inferred"; // tentative assertion with evidence draws an inference line, never a clean arrow.
  }
  // A returned-through-receipt / joined-to-direction edge: its treatment is the outcome join's basis.
  if (id.startsWith("returned:")) {
    const outcomeId = id.split(":").pop() ?? "";
    const join = projection?.joins?.outcomes.find((entry) => String(entry.outcomeId ?? entry.id) === outcomeId) ?? null;
    return edgeTreatmentForBasis(join?.basis ?? join?.join?.basis ?? join?.join?.level, {
      causalFalse: join?.causal === false || join?.join?.causal === false,
    });
  }
  // Prepared-work and held-for-you edges are founder-applied staging, not measured joins.
  if (id.startsWith("staged:")) return "founder-applied";
  if (id.startsWith("held:")) return "founder-applied";
  return null;
}
