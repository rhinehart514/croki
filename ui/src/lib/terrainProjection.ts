import type {
  TerrainHypothesis, TerrainObservation, TerrainRead, TerrainView, WovenCanvas, WovenCanvasAnchor,
  WovenCanvasRelationship, WovenGraph, WovenRef,
} from "@/types";

export type TerrainFocusItem =
  | { kind: "truth"; ref: WovenRef; observation: TerrainObservation }
  | { kind: "hypothesis"; ref: WovenRef; hypothesis: TerrainHypothesis };

const authority = (owner: string, id: string, projectId: string, updatedAt: string | null) => ({
  owner, id, projectId, updatedAt,
});

function truthAnchor(view: TerrainView, truth: TerrainObservation): WovenCanvasAnchor {
  const ref = { type: "product-truth", id: truth.id } satisfies WovenRef;
  return {
    id: `anchor:${ref.type}:${ref.id}`,
    ref,
    kind: "product-truth",
    label: truth.claim || truth.label || "Product truth",
    body: truth,
    authority: authority("terrain-view", truth.id, view.projectId, view.generatedAt),
  };
}

function hypothesisAnchor(view: TerrainView, hypothesis: TerrainHypothesis): WovenCanvasAnchor {
  const ref = { type: "terrain-hypothesis", id: hypothesis.id } satisfies WovenRef;
  return {
    id: `anchor:${ref.type}:${ref.id}`,
    ref,
    kind: `terrain-${hypothesis.stance}`,
    label: hypothesis.title || hypothesis.claim,
    body: hypothesis,
    authority: authority("terrain-read", hypothesis.id, view.projectId, view.generatedAt),
  };
}

function productOpeningAnchors(view: TerrainView): WovenCanvasAnchor[] {
  const model = view.product.model;
  if (!model) return [];

  const journeys = model.workflows
    .filter((workflow) => workflow.provenance === "derived" && workflow.evidence.length > 0)
    .slice(0, 3)
    .map((workflow) => {
      const ref = { type: "product-workflow", id: workflow.id } satisfies WovenRef;
      return {
        id: `anchor:${ref.type}:${ref.id}`,
        ref,
        kind: "terrain-opening",
        label: `${workflow.actor}: ${workflow.name}`,
        body: {
          ...workflow,
          claim: workflow.summary,
          whyItMatters: workflow.steps.map((step) => step.label).join(" → "),
        },
        authority: authority("product-model", workflow.id, view.projectId, model.updatedAt),
      } satisfies WovenCanvasAnchor;
    });

  if (journeys.length >= 3) return journeys;
  const structures = model.things
    .filter((thing) => thing.provenance === "derived" && thing.evidence.length > 0)
    .slice(0, 3 - journeys.length)
    .map((thing) => {
      const ref = { type: "product-thing", id: thing.id } satisfies WovenRef;
      return {
        id: `anchor:${ref.type}:${ref.id}`,
        ref,
        kind: "terrain-opening",
        label: `${thing.name}: ${thing.summary}`,
        body: { ...thing, claim: thing.summary },
        authority: authority("product-model", thing.id, view.projectId, model.updatedAt),
      } satisfies WovenCanvasAnchor;
    });
  return [...journeys, ...structures];
}

function relKey(r: WovenCanvasRelationship): string {
  return `${r.kind}:${r.source.type}:${r.source.id}:${r.target.type}:${r.target.id}`;
}

function generatedRelationships(view: TerrainView, hypotheses: TerrainHypothesis[]): WovenCanvasRelationship[] {
  const relationships: WovenCanvasRelationship[] = [];
  for (const h of hypotheses) {
    const source = { type: "terrain-hypothesis", id: h.id } satisfies WovenRef;
    for (const target of [...h.productRefs, ...h.evidenceRefs, ...h.marketRefs]) {
      relationships.push({
        id: `terrain:${h.id}:supported-by:${target.type}:${target.id}`,
        source,
        target,
        kind: "supported-by",
        resolved: true,
        authority: { owner: "terrain-read", projectId: view.projectId },
      });
    }
    for (const target of h.counterEvidenceRefs) {
      relationships.push({
        id: `terrain:${h.id}:challenged-by:${target.type}:${target.id}`,
        source,
        target,
        kind: "challenged-by",
        resolved: true,
        authority: { owner: "terrain-read", projectId: view.projectId },
      });
    }
    for (const target of h.crewRefs) {
      relationships.push({
        id: `terrain:${h.id}:involves:${target.type}:${target.id}`,
        source,
        target,
        kind: "involves",
        resolved: true,
        authority: { owner: "terrain-read", projectId: view.projectId },
      });
    }
  }
  return relationships;
}

// Merge terrain into the existing canonical canvas instead of creating a second surface. Existing
// questions, outcomes, implications, geometry, and relationships win; duplicate refs are replaced by the
// project-scoped terrain read so provenance stays current.
export function projectTerrainCanvas(
  terrain: TerrainView | null | undefined,
  read: TerrainRead | null | undefined,
  existing: WovenCanvas | null | undefined,
): WovenCanvas | null {
  if (!terrain) return existing ?? null;
  const hypotheses = (read?.projectId === terrain.projectId ? read.hypotheses : terrain.hypotheses).slice(0, 5);
  const additions = [
    ...terrain.product.truths.map((truth) => truthAnchor(terrain, truth)),
    ...productOpeningAnchors(terrain),
    ...hypotheses.map((hypothesis) => hypothesisAnchor(terrain, hypothesis)),
  ];
  const additionRefs = new Set(additions.map((a) => `${a.ref.type}:${a.ref.id}`));
  const anchors = [...(existing?.anchors ?? []).filter((a) => !additionRefs.has(`${a.ref.type}:${a.ref.id}`)), ...additions];
  const relationships = [...(existing?.relationships ?? []), ...terrain.relationships, ...generatedRelationships(terrain, hypotheses)];
  const seen = new Set<string>();
  return {
    anchors,
    relationships: relationships.filter((r) => { const key = relKey(r); if (seen.has(key)) return false; seen.add(key); return true; }),
    outcomes: existing?.outcomes,
    implications: existing?.implications,
    state: terrain.state,
    // The operating canvas is the live layout authority. A deterministic terrain read can carry an
    // older geometry snapshot; letting it win here made a successfully saved pan snap back on refresh.
    geometry: existing?.geometry ?? terrain.geometry ?? null,
  };
}

export function projectTerrainWoven(
  woven: WovenGraph | null | undefined,
  terrain: TerrainView | null | undefined,
  read: TerrainRead | null | undefined,
): WovenGraph | null {
  if (!woven && !terrain) return null;
  const base: WovenGraph = woven ?? {
    projectId: terrain!.projectId,
    objectNodes: [], ties: [], kindClusters: [], laneKinds: {}, collapsedByLane: {},
    stats: { objectCount: 0, drawnObjectCount: 0, collapsedObjectCount: 0, tieCount: 0, drawnTieCount: 0, kindCount: 0 },
  };
  return { ...base, canvas: projectTerrainCanvas(terrain, read, base.canvas) };
}

export function terrainFocusItem(
  focus: WovenRef | null | undefined,
  terrain: TerrainView | null | undefined,
  read: TerrainRead | null | undefined,
): TerrainFocusItem | null {
  if (!focus || !terrain) return null;
  if (focus.type === "product-truth") {
    const observation = terrain.product.truths.find((t) => t.id === focus.id);
    return observation ? { kind: "truth", ref: focus, observation } : null;
  }
  if (focus.type === "terrain-hypothesis") {
    const hypotheses = read?.projectId === terrain.projectId ? read.hypotheses : terrain.hypotheses;
    const hypothesis = hypotheses.find((h) => h.id === focus.id);
    return hypothesis ? { kind: "hypothesis", ref: focus, hypothesis } : null;
  }
  return null;
}

export function stableRefString(ref: WovenRef): string {
  return `${ref.type ?? "ref"}:${ref.id}`;
}
