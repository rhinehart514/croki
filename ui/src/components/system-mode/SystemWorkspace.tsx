import { useMemo, useState } from "react";
import { mutateArchitecture, mutateSystem, putPlacement, type SystemIndex, type SystemIndexObject, type SystemMutation, type WorkIndex, type WorkIndexOutline } from "@/api";
import { ArchitectureProposalSurface } from "@/components/atlas/propose/ArchitectureProposalSurface";
import { VentureMaps } from "@/components/maps/VentureMaps";
import type { Direction } from "@/components/now/directionModel";
import type { FirmArchitectureDocument, FirmArchitectureOperation, FirmPlacement } from "@/types";
import type { WorkflowCapability } from "@/components/workspace/workflowCapabilities";
import type { Viewport } from "@xyflow/react";
import { systemAgentContext, systemWorkByObject, type SystemAgentContext } from "./systemWorkState";
import { SystemCreateDialog } from "./SystemCreateDialog";
import { SystemObjectEditor } from "./SystemEditPanel";
import "./system-workspace.css";

export type SystemScope = "system" | "product" | "gtm" | "attention";

export type SystemWorkspaceProps = {
  index: SystemIndex | null;
  ventureId: string;
  architecture?: FirmArchitectureDocument | null;
  placement?: FirmPlacement | null;
  workIndex?: WorkIndex | null;
  scope: SystemScope;
  selectedRef: string | null;
  directions: Direction[];
  camera: Viewport | null;
  readOnlyReason: string | null;
  onScope: (scope: SystemScope) => void;
  onSelect: (object: SystemIndexObject | null, linkedThreadRef?: string | null) => void;
  onAgentContextChange?: (context: SystemAgentContext | null) => void;
  onCameraChange: (camera: Viewport) => void;
  onOpenWork: (threadRef: string) => void;
  onStartWork: (subjectRefs: string[]) => void;
  onAskAgent: (subjectRef?: string) => void;
  onProposalDecision: () => void;
  onAssignAgent: (agentRef: string, subjectRef: string) => void;
};

export function SystemWorkspace({ index, ventureId, architecture, placement, workIndex, selectedRef, directions, camera, readOnlyReason, onSelect, onAgentContextChange, onCameraChange, onOpenWork, onStartWork, onAskAgent, onProposalDecision, onAssignAgent }: SystemWorkspaceProps) {
  const outline = useMemo<WorkIndexOutline | null>(() => index ? ({
    architectureRevision: index.architectureRevision,
    objects: index.objects.map((object) => ({ ...object, sectionId: object.territory ?? "system", parentRef: null, details: object.properties, targetable: true })),
    relationships: index.relationships,
    unplacedThreadRefs: [],
  }) : null, [index]);
  const workByObject = useMemo(() => systemWorkByObject(index?.objects ?? [], workIndex), [index?.objects, workIndex]);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<"pipeline" | "campaign" | "object" | "connection" | null>(null);
  const [editing, setEditing] = useState<SystemIndexObject | null>(null);
  const selectedId = selectedRef?.replace(/^(?:object|architecture):/, "") ?? null;
  const selectObject = (object: SystemIndexObject | null) => {
    const context = object ? systemAgentContext(object, workIndex) : null;
    onSelect(object, context?.threadRef);
    onAgentContextChange?.(context);
  };
  const updateWorkflow = async (objectRef: string, properties: Record<string, unknown>) => {
    if (!index) return null;
    setMutationError(null);
    try {
      const result = await mutateSystem(ventureId, index.revision, [{ op: "update-object", objectRef, properties }]);
      onProposalDecision();
      return result.systemIndex.objects.find((object) => object.objectRef === objectRef) ?? null;
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The workflow could not be changed.");
      return null;
    }
  };
  const saveSystemMutations = async (mutations: SystemMutation[]) => {
    if (!index) return;
    setMutationError(null);
    try {
      const result = await mutateSystem(ventureId, index.revision, mutations);
      onProposalDecision();
      const created = mutations[0]?.op === "create-object"
        ? result.systemIndex.objects.find((object) => object.id === mutations[0].id)
          ?? result.systemIndex.objects.findLast((object) => object.name === mutations[0].name)
        : null;
      if (created) selectObject(created);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Product / GTM could not be changed.");
      throw error;
    }
  };
  const saveArchitectureMutations = async (operations: FirmArchitectureOperation[], reason: string) => {
    if (!architecture) return;
    setMutationError(null);
    try {
      await mutateArchitecture(ventureId, { baseRevision: architecture.revision, operations, reason });
      onProposalDecision();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Product / GTM could not be changed.");
      throw error;
    }
  };
  const moveNode = async (objectRef: string, position: { x: number; y: number }) => {
    if (!placement || readOnlyReason) return;
    try {
      await putPlacement(ventureId, { positions: { ...placement.positions, [objectRef]: position }, expectedRevision: placement.revision });
      onProposalDecision();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The card position could not be saved.");
    }
  };
  const assignAgent = async (agentRef: string, pipelineRef: string) => {
    const pipeline = index?.objects.find((object) => object.objectRef === pipelineRef); if (!pipeline) return;
    const existing = Array.isArray(pipeline.properties.agentRefs) ? pipeline.properties.agentRefs.map(String) : [];
    if (await updateWorkflow(pipelineRef, { agentRefs: [...new Set([...existing, agentRef])] })) onAssignAgent(agentRef, pipelineRef);
  };
  const assignCapability = async (capability: WorkflowCapability, pipelineRef: string, step: "trigger" | "agent" | "gate" | "action" | "evidence") => {
    const pipeline = index?.objects.find((object) => object.objectRef === pipelineRef); if (!pipeline) return;
    const current = pipeline.properties.capabilityAssignments && typeof pipeline.properties.capabilityAssignments === "object" && !Array.isArray(pipeline.properties.capabilityAssignments) ? pipeline.properties.capabilityAssignments as Record<string, unknown> : {};
    const stepCapabilities = Array.isArray(current[step]) ? (current[step] as unknown[]).map(String) : [];
    const existingTools = Array.isArray(pipeline.properties.tools) ? pipeline.properties.tools.map(String) : [];
    await updateWorkflow(pipelineRef, { tools: [...new Set([...existingTools, capability.id])], capabilityAssignments: { ...current, [step]: [...new Set([...stepCapabilities, capability.id])] } });
  };
  const removeAgent = async (agentRef: string, pipelineRef: string) => {
    const pipeline = index?.objects.find((object) => object.objectRef === pipelineRef); if (!pipeline) return;
    const existing = Array.isArray(pipeline.properties.agentRefs) ? pipeline.properties.agentRefs.map(String) : [];
    await updateWorkflow(pipelineRef, { agentRefs: existing.filter((ref) => ref !== agentRef) });
  };
  const removeCapability = async (capabilityId: string, pipelineRef: string, step: "trigger" | "agent" | "gate" | "action" | "evidence") => {
    const pipeline = index?.objects.find((object) => object.objectRef === pipelineRef); if (!pipeline) return;
    const current = pipeline.properties.capabilityAssignments && typeof pipeline.properties.capabilityAssignments === "object" && !Array.isArray(pipeline.properties.capabilityAssignments) ? pipeline.properties.capabilityAssignments as Record<string, unknown> : {};
    const nextAssignments = Object.fromEntries(Object.entries(current).map(([key, value]) => [key, Array.isArray(value) ? value.map(String).filter((id) => key !== step || id !== capabilityId) : []]));
    const stillAssigned = Object.values(nextAssignments).some((value) => value.includes(capabilityId));
    const existingTools = Array.isArray(pipeline.properties.tools) ? pipeline.properties.tools.map(String) : [];
    await updateWorkflow(pipelineRef, { tools: stillAssigned ? existingTools : existingTools.filter((id) => id !== capabilityId), capabilityAssignments: nextAssignments });
  };
  const declareWorkflow = async (objectRefs: string[]) => {
    if (!index) return;
    const id = `pipeline-${crypto.randomUUID()}`; const pipelineRef = `object:${id}`;
    const mutations: SystemMutation[] = [
      { op: "create-object", id, type: "pipeline", territory: "gtm", name: "Untitled workflow", statement: "Define the intended outcome with Drover.", properties: { trigger: "Trigger unresolved", intendedOutcome: "Outcome unresolved", agentRefs: [], tools: [], capabilityAssignments: {}, authority: "Founder approves outward action", evidence: "Evidence return unresolved" } },
      ...objectRefs.filter((ref) => ref !== pipelineRef).map((ref) => ({ op: "create-relationship" as const, fromRef: pipelineRef, toRef: ref, label: "includes" })),
    ];
    setMutationError(null);
    try {
      const result = await mutateSystem(ventureId, index.revision, mutations);
      const created = result.systemIndex.objects.find((object) => object.id === id) ?? null;
      onProposalDecision(); onSelect(created); onAskAgent(pipelineRef);
    } catch (error) { setMutationError(error instanceof Error ? error.message : "The workflow could not be declared."); }
  };

  return (
    <main className="mode-workspace system-workspace">
      <header className="system-workspace-header">
        <div className="system-workspace-title"><span>Product / GTM</span><h1>Agent workflows</h1><small>{index ? `${index.objects.length} connected objects` : "Loading"}</small></div>
        <button type="button" className="system-add-button" disabled={Boolean(readOnlyReason) || !index} onClick={() => setCreateKind("pipeline")}>+ Add card</button>
      </header>
      {readOnlyReason ? <p className="mode-connection-state" role="status">{readOnlyReason}</p> : null}
      {mutationError ? <p className="mode-connection-state" role="alert">{mutationError}</p> : null}

      <VentureMaps
        outline={outline}
        directions={directions}
        view="gtm"
        selectedId={selectedId}
        camera={camera}
        workByObject={workByObject}
        onAgentDrop={(agentRef, pipelineRef) => void assignAgent(agentRef, pipelineRef)}
        onCapabilityDrop={(capability, pipelineRef, step) => void assignCapability(capability, pipelineRef, step)}
        onAgentRemove={(agentRef, pipelineRef) => void removeAgent(agentRef, pipelineRef)}
        onCapabilityRemove={(capabilityId, pipelineRef, step) => void removeCapability(capabilityId, pipelineRef, step)}
        onDeclareWorkflow={(refs) => void declareWorkflow(refs)}
        onChatObject={onAskAgent}
        positions={placement?.positions}
        onNodeMove={placement ? (objectRef, position) => void moveNode(objectRef, position) : undefined}
        inspectorActions={selectedId ? <div className="system-inspector-actions">
          <button type="button" onClick={() => setEditing(index?.objects.find((object) => object.id === selectedId) ?? null)}>Edit card</button>
          <button type="button" onClick={() => setCreateKind("connection")}>Connect</button>
          {workByObject.get(selectedId)?.threadRef
            ? <button type="button" className="is-primary" onClick={() => onOpenWork(workByObject.get(selectedId)!.threadRef!)}>Open work</button>
            : <button type="button" className="is-primary" onClick={() => onStartWork([`object:${selectedId}`])}>Start work</button>}
          <button type="button" onClick={() => onAskAgent(`object:${selectedId}`)}>Ask agent</button>
        </div> : undefined}
        onEmptyAction={() => onAskAgent()}
        showHeader={false}
        onCameraChange={onCameraChange}
        onSelectionChange={(id) => selectObject(index?.objects.find((object) => object.id === id) ?? null)}
        onOpenDirection={(direction) => onOpenWork(direction.id)}
        onOpenObject={(object) => selectObject(index?.objects.find((entry) => entry.id === object.id) ?? null)}
      />
      {createKind && index ? <SystemCreateDialog
        kind={createKind}
        objects={index.objects}
        readOnlyReason={readOnlyReason}
        onClose={() => setCreateKind(null)}
        onSwitchKind={setCreateKind}
        onSave={async (mutation) => {
          const prepared = mutation.op === "create-object" && !mutation.id ? { ...mutation, id: `${mutation.type ?? "object"}-${crypto.randomUUID()}` } : mutation;
          await saveSystemMutations([prepared]);
          setCreateKind(null);
        }}
      /> : null}
      {editing ? <SystemObjectEditor
        object={editing}
        readOnlyReason={readOnlyReason}
        onClose={() => setEditing(null)}
        onSystemMutate={saveSystemMutations}
        onArchitectureMutate={saveArchitectureMutations}
      /> : null}
      <ArchitectureProposalSurface ventureId={ventureId} baseArchitecture={architecture} readOnly={Boolean(readOnlyReason)} pollMs={2500} className="system-proposal-surface" onDecision={onProposalDecision} />
    </main>
  );
}
