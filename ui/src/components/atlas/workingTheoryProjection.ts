import type { FirmWorkingTheory } from "@/types";
import type { AtlasEdge, AtlasNode } from "./atlasTypes";
import { atlasInertData } from "./atlasSemanticProjection";

const THEORY_X = 300;
const THEORY_Y = 110;
const THEORY_COLUMN_GAP = 270;
const THEORY_ROW_GAP = 180;

function subjectId(ref: string) {
  return ref.startsWith("theory:") ? ref.slice("theory:".length) : ref;
}

function groundedRefs(theory: FirmWorkingTheory, subjectIdValue: string) {
  const subject = theory.subjects.find((candidate) => candidate.id === subjectIdValue);
  const anchor = theory.anchors.find((candidate) => candidate.subjectRef === `theory:${subjectIdValue}`);
  return [...new Set([
    ...(subject?.sourceRefs ?? []),
    ...(subject?.conversationRefs ?? []),
    ...(subject?.workRefs.map((ref) => `work:${ref}`) ?? []),
    ...(anchor?.sourceRefs ?? []),
  ])];
}

function anchorNode(ref: string, nodeIds: Set<string>) {
  if (nodeIds.has(ref)) return ref;
  if (ref.startsWith("work:") || ref.startsWith("outcome:") || ref.startsWith("bet:")) {
    return nodeIds.has(ref) ? ref : null;
  }
  return null;
}

export function projectWorkingTheory(
  theory: FirmWorkingTheory | null | undefined,
  existingNodes: AtlasNode[],
) {
  if (!theory) return { nodes: [] as AtlasNode[], edges: [] as AtlasEdge[] };
  const nodes: AtlasNode[] = [];
  const edges: AtlasEdge[] = [];
  const nodeIds = new Set(existingNodes.map((node) => node.id));
  const existingPositions = new Map(existingNodes.map((node) => [node.id, node.position]));

  theory.subjects.forEach((subject, index) => {
    const id = `theory:${subject.id}`;
    const refs = groundedRefs(theory, subject.id);
    const position = existingPositions.get(`architecture:${subject.id}`) ?? {
      x: THEORY_X + (index % 3) * THEORY_COLUMN_GAP,
      y: THEORY_Y + Math.floor(index / 3) * THEORY_ROW_GAP,
    };
    nodes.push({
      id,
      type: "architectureElement",
      position,
      selectable: true,
      draggable: false,
      zIndex: 3,
      data: {
        ...atlasInertData("theory", subject.name),
        statement: subject.statement,
        theorySubject: subject,
        theoryId: theory.id,
        theoryRevision: theory.baseRevision,
        sourceRefs: refs,
        conversationRefs: subject.conversationRefs,
        provisional: true,
        stateLabel: refs.length ? "Grounded" : "Inferred",
        outputLabel: refs.length === 1 ? "1 source" : `${refs.length} sources`,
        verbLabel: "Current read",
      },
    });
    nodeIds.add(id);
  });

  for (const relationship of theory.relationships) {
    const source = `theory:${subjectId(relationship.fromRef)}`;
    const target = `theory:${subjectId(relationship.toRef)}`;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    edges.push({
      id: `theory-relationship:${relationship.id}`,
      source,
      target,
      label: relationship.label,
      className: "atlas-edge-tentative atlas-edge-theory",
      type: "default",
    });
  }

  for (const subject of theory.subjects) {
    const source = `theory:${subject.id}`;
    for (const ref of groundedRefs(theory, subject.id)) {
      const target = anchorNode(ref, nodeIds);
      if (!target || target === source) continue;
      edges.push({
        id: `theory-anchor:${subject.id}:${ref}`,
        source,
        target,
        label: target.startsWith("work:") ? "being tested in" : "grounded by",
        className: "atlas-edge-theory-anchor",
        type: "default",
      });
    }
  }

  return { nodes, edges };
}
