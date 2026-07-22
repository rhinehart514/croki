import { mutateSystem, type SystemIndex } from "@/api";
import type { WorkflowSketch } from "@/components/work-mode/workflowSketch";

const graphOf = (properties: Record<string, unknown>) => {
  const value = properties.workflowGraph;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
};

export function adoptedWorkflowVersions(index: SystemIndex | null) {
  return new Map((index?.objects ?? []).flatMap((object) => {
    const graph = graphOf(object.properties);
    const sourceWorkRef = graph?.sourceWorkRef;
    const sourceUpdatedAt = graph?.sourceUpdatedAt;
    return typeof sourceWorkRef === "string" ? [[sourceWorkRef, typeof sourceUpdatedAt === "string" ? sourceUpdatedAt : null] as const] : [];
  }));
}

export async function adoptWorkflowSketch(ventureId: string, index: SystemIndex, sketch: WorkflowSketch) {
  const existing = index.objects.find((object) => graphOf(object.properties)?.sourceWorkRef === sketch.workRef);
  const existingGraph = existing ? graphOf(existing.properties) : null;
  if (existing && existingGraph?.sourceUpdatedAt === sketch.item.at) return { systemIndex: index, objectRef: existing.objectRef, changed: false };

  const first = sketch.steps[0];
  const trigger = sketch.steps.find((step) => step.type === "trigger")?.label ?? first?.label ?? "Trigger unresolved";
  const outcome = [...sketch.steps].reverse().find((step) => step.type === "outcome")?.label ?? sketch.steps.at(-1)?.label ?? "Outcome unresolved";
  const authority = sketch.steps.find((step) => ["founder-gate", "founder-decision"].includes(step.type ?? ""))?.label ?? "Founder decision unresolved";
  const evidence = sketch.steps.find((step) => ["observation", "outcome"].includes(step.type ?? ""))?.label ?? "Evidence return unresolved";
  const id = existing?.id ?? `mechanism-${crypto.randomUUID()}`;
  const statement = first?.detail ?? "A founder-adopted reusable Product / GTM mechanism.";
  const properties = {
    trigger, intendedOutcome: outcome, authority, evidence,
    workflowGraph: {
      // No self-declared register: whether this play reads as drafted or established is derived from real
      // market movement at projection time (deriveWorkflowRegister), never written onto the blob.
      objective: sketch.title,
      sourceWorkRef: sketch.workRef,
      sourceUpdatedAt: sketch.item.at,
      threadRef: sketch.item.visual?.threadRef ?? null,
      steps: sketch.steps,
      edges: sketch.edges,
      adoptedAt: new Date().toISOString(),
    },
  };
  const result = await mutateSystem(ventureId, index.revision, [existing ? {
    op: "update-object", objectRef: existing.objectRef, name: sketch.title, statement, properties,
  } : {
    op: "create-object", id, type: "mechanism", territory: "gtm", name: sketch.title, statement, properties,
  }]);
  return { systemIndex: result.systemIndex, objectRef: `object:${id}`, changed: true };
}
