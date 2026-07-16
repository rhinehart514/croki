import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useEdgesState, useNodesState, type OnNodeDrag } from "@xyflow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Focus, ListTree, RotateCcw, Sparkles, X } from "lucide-react";
import { decideWallItem, startArchitectureCampaign, type ArchitectureMutationOperation, type WallDecision, type WallQueueItemView } from "@/api";
import { Button } from "@/components/ui/button";
import { targetArchitecture, targetBet, targetTeammates, targetTheory, targetWork, type CanvasSelection } from "@/components/firm/directionTarget";
import { approveWallProductChange, inspectWallProductChange } from "@/lib/productChangeWall";
import type { FirmArchitectureElement, FirmArchitectureProjection, FirmLens } from "@/types";
import { ArchitectureMutationPreview, type AtlasMutationDraft } from "./ArchitectureMutationPreview";
import { AtlasCanvas } from "./AtlasCanvas";
import { AtlasLegend, AtlasLegendToggle } from "./AtlasLegend";
import { AtlasShelf } from "./AtlasShelf";
import { AtlasWallPanel } from "./AtlasWallPanel";
import { useCanvasCapabilities } from "@/components/lens/canvasCapabilities";
import { configurationForLens } from "@/lib/firmConfiguration";
import { AtlasMachinery } from "./AtlasMachinery";
import { AtlasOutline } from "./AtlasOutline";
import { projectAtlas } from "./AtlasProjection";
import { AtlasReturnBand } from "./AtlasReturnBand";
import { DiveSurface } from "./dive";
import { ArchitectureProposalSurface, type ProposalMotionAdjustment } from "./propose";
import { useArchitectureMutation } from "./useArchitectureMutation";
import { useAtlasCamera } from "./useAtlasCamera";
import { useAtlasPlacement } from "./useAtlasPlacement";
import { useAtlasProjection } from "./useAtlasProjection";
import { useAtlasRevisionReceipt } from "./useAtlasRevisionReceipt";
import { useDiveFocus } from "./useDiveFocus";
import { projectAtlasTrace } from "./atlasTrace";
import { ATLAS_EASE, ATLAS_MOTION } from "./atlasMotion";
import type { AtlasNode } from "./atlasTypes";
import { useAtlasArrivalTracker } from "./useAtlasArrivalTracker";
import { architectureId, atlasNodeIdForSelection, omissionSummary, promotionFields, stableId } from "./ventureAtlasModel";
import "@/styles/venture-atlas.css";
export function VentureAtlas({
  ventureId, lens, selection, wallOpen, wallQueue, stale, readOnly,
  showReturnBand = true, repository = "Product repository", capabilityRefreshKey = 0,
  onSelectionChange, onWallOpenChange, onLensChange, onArchitectureChange, onRefresh, onOpenSettings,
}: {
  ventureId: string;
  lens: FirmLens;
  selection: CanvasSelection;
  wallOpen: boolean;
  wallQueue: WallQueueItemView[];
  stale: boolean;
  readOnly: boolean;
  showReturnBand?: boolean;
  repository?: string;
  capabilityRefreshKey?: number;
  fallback: ReactNode;
  onSelectionChange: (selection: CanvasSelection) => void;
  onWallOpenChange: (open: boolean) => void;
  onLensChange: (lens: FirmLens) => void;
  onArchitectureChange: (projection: FirmArchitectureProjection | null) => void;
  onRefresh: () => void;
  onOpenSettings?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const { projection, error, loading, reload } = useAtlasProjection(ventureId);
  const capabilities = useCanvasCapabilities(repository, capabilityRefreshKey);
  const scene = useMemo(() => projectAtlas(projection, lens, { capabilities }), [capabilities, lens, projection]);
  const markAtlasArrivals = useAtlasArrivalTracker(ventureId, Boolean(projection));
  const [nodes, setNodes, onNodesChange] = useNodesState<AtlasNode>(scene.nodes);
  const [edges, setEdges] = useEdgesState(scene.edges);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mutationDraft, setMutationDraft] = useState<AtlasMutationDraft | null>(null);
  const [machineryId, setMachineryId] = useState<string | null>(null);
  const revisionReceipt = useAtlasRevisionReceipt(ventureId);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [pendingRevealId, setPendingRevealId] = useState<string | null>(null);
  const [diveBetId, setDiveBetId] = useState<string | null>(null);
  const { enterDive, returnFromDive } = useDiveFocus(diveBetId, setDiveBetId);
  const selectedNodeId = useMemo(() => {
    const preferred = atlasNodeIdForSelection(selection);
    if (!preferred || scene.nodes.some((node) => node.id === preferred)) return preferred;
    if (!selection?.betId) return preferred;
    const joinedOutcome = projection?.joins.outcomes.find((candidate) => candidate.betId === selection.betId);
    const outcomeId = joinedOutcome?.outcomeId ?? joinedOutcome?.id;
    const proofNodeId = outcomeId ? `outcome:${outcomeId}` : null;
    return proofNodeId && scene.nodes.some((node) => node.id === proofNodeId) ? proofNodeId : preferred;
  }, [projection, scene, selection]);
  const {
    altitude,
    focusedId: cameraFocusedId,
    fitWhole,
    focus: focusCamera,
    onInit: initializeCamera,
    onMoveEnd: handleCameraMoveEnd,
    syncSelection: syncCameraSelection,
    unfocus,
    reveal: revealCamera,
  } = useAtlasCamera(nodes, ventureId);
  const mutation = useArchitectureMutation({ ventureId, revision: Math.max(projection?.revision ?? 0, revisionReceipt.value?.receipt.revision ?? 0) });
  const placement = useAtlasPlacement({ ventureId, lens, readOnly, onLensChange, onRefresh });
  const shelfConfiguration = useMemo(() => configurationForLens(lens), [lens]);
  const placeItemAt = useCallback((key: string, point: { x: number; y: number }) => {
    if (key.startsWith("crew:")) onSelectionChange(targetTeammates([key.slice("crew:".length)]));
    void placement.commitPosition(key, point).then(() => setPendingRevealId(key));
  }, [onSelectionChange, placement]);
  const placeItem = useCallback((key: string) => {
    const current = lens.placement.positions[key];
    if (current) { setPendingRevealId(key); return; }
    const placed = Object.keys(lens.placement.positions).filter((id) => id.startsWith("crew:") || id.startsWith("capability:")).length;
    placeItemAt(key, { x: 360, y: 180 + placed * 150 });
  }, [lens.placement.positions, placeItemAt]);
  const focusedTrace = useMemo(() => {
    if (!cameraFocusedId) return new Set<string>();
    if (cameraFocusedId.startsWith("theory:")) {
      return new Set([cameraFocusedId, ...(scene.related.get(cameraFocusedId) ?? [])]);
    }
    return projection ? projectAtlasTrace(projection, lens, cameraFocusedId) : new Set<string>();
  }, [cameraFocusedId, lens, projection, scene.related]);

  useEffect(() => onArchitectureChange(projection), [onArchitectureChange, projection]);
  useEffect(() => {
    setNodes(markAtlasArrivals(scene.nodes));
    setEdges(scene.edges);
  }, [markAtlasArrivals, scene, setEdges, setNodes]);
  useEffect(() => {
    if (!pendingRevealId || !nodes.some((node) => node.id === pendingRevealId)) return;
    const revealId = pendingRevealId;
    const frame = window.requestAnimationFrame(() => {
      revealCamera(revealId);
      setPendingRevealId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [nodes, pendingRevealId, revealCamera]);
  useEffect(() => {
    if (selectedNodeId && cameraFocusedId && focusedTrace.has(selectedNodeId)) return;
    syncCameraSelection(selectedNodeId);
  }, [cameraFocusedId, focusedTrace, selectedNodeId, syncCameraSelection]);

  const selectNode = useCallback((id: string) => {
    if (id.startsWith("theory:")) {
      const subject = projection?.workingTheory?.subjects.find((candidate) => candidate.id === id.slice("theory:".length));
      const theory = projection?.workingTheory;
      if (subject && theory) onSelectionChange(targetTheory(theory.id, subject.id, theory.baseRevision, subject.name));
      return;
    }
    const archId = architectureId(id);
    if (connectionSourceId && archId && id !== connectionSourceId) {
      setMutationDraft({ kind: "connect", sourceId: connectionSourceId, targetId: id });
      setConnectionSourceId(null);
      return;
    }
    if (archId && projection) onSelectionChange(targetArchitecture(archId, projection.revision));
    else if (id.startsWith("bet:")) onSelectionChange(targetBet(id.slice("bet:".length)));
    else if (id.startsWith("work:")) {
      const workRef = id.slice("work:".length);
      const join = projection?.joins.work.find((candidate) => candidate.id === workRef || candidate.workRef === workRef);
      if (join?.betId) onSelectionChange(targetWork(join.betId, workRef));
    }
    else if (id.startsWith("outcome:")) {
      const join = projection?.joins.outcomes.find((candidate) => candidate.outcomeId === id.slice("outcome:".length) || candidate.id === id.slice("outcome:".length));
      if (join?.betId) onSelectionChange(targetBet(join.betId));
    }
  }, [connectionSourceId, onSelectionChange, projection]);

  const focusNode = useCallback((id: string) => {
    selectNode(id);
    const trace = id.startsWith("theory:")
      ? new Set([id, ...(scene.related.get(id) ?? [])])
      : projection ? projectAtlasTrace(projection, lens, id) : new Set<string>();
    focusCamera(id, trace);
  }, [focusCamera, lens, projection, scene.related, selectNode]);

  const decoratedNodes = useMemo<AtlasNode[]>(() => nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
    draggable: !readOnly && (node.data.kind === "teammate" || node.data.kind === "capability"),
    data: {
      ...node.data, altitude, selected: node.id === selectedNodeId, expanded: node.id === selectedNodeId, readOnly,
      focusRole: cameraFocusedId === node.id ? "focus" as const : cameraFocusedId && focusedTrace.has(node.id) ? "related" as const : "context" as const,
      onSelect: selectNode, onFocus: focusNode,
      onPromote: (element: FirmArchitectureElement) => setMutationDraft({ kind: "promote", element }),
      onActivateMotion: (element: FirmArchitectureElement) => setMutationDraft({ kind: "campaign", motion: element }),
      onBeginConnection: setConnectionSourceId,
      onOpenWall: () => onWallOpenChange(true), onRevealMachinery: setMachineryId,
      onFold: () => onSelectionChange(null),
      onDive: enterDive,
    },
  })), [altitude, cameraFocusedId, enterDive, focusNode, focusedTrace, nodes, onSelectionChange, onWallOpenChange, readOnly, selectNode, selectedNodeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key.toLowerCase() === "o") { event.preventDefault(); setOutlineOpen((open) => !open); }
      else if (event.key.toLowerCase() === "n" && !readOnly) { event.preventDefault(); setMutationDraft({ kind: "create", point: { x: 760, y: 440 } }); }
      else if (event.key === "Escape") {
        if (diveBetId) returnFromDive(); else if (connectionSourceId) setConnectionSourceId(null); else if (mutationDraft) setMutationDraft(null); else if (machineryId) setMachineryId(null); else if (outlineOpen) setOutlineOpen(false);
        else if (cameraFocusedId) unfocus(); else onSelectionChange(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cameraFocusedId, connectionSourceId, diveBetId, machineryId, mutationDraft, onSelectionChange, outlineOpen, readOnly, returnFromDive, selectedNodeId, unfocus]);

  const savePosition = useCallback<OnNodeDrag<AtlasNode>>((_, node) => {
    void placement.commitPosition(node.id, node.position);
  }, [placement]);

  const applyMutation = useCallback(async (operations: ArchitectureMutationOperation[], reason: string, inverse: ArchitectureMutationOperation[]) => {
    const result = await mutation.apply(operations, reason);
    revisionReceipt.keep({ revision: result.revision, reason, affectedContexts: result.affectedContexts }, { operations: inverse, reason: `Undo: ${reason}` });
    setMutationDraft(null);
    reload();
  }, [mutation, reload, revisionReceipt]);

  const onDecideWall = useCallback(async (item: WallQueueItemView, decision: WallDecision, note?: string) => {
    await decideWallItem(ventureId, item.id, { decision, note });
    onRefresh(); reload();
  }, [onRefresh, reload, ventureId]);
  const adjustProposedMotion = useCallback((adjustment: ProposalMotionAdjustment) => {
    onSelectionChange(null);
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("drover:proposal-adjustment", {
      detail: { draft: `Revise the proposed path “${adjustment.motionName}”: ` },
    })));
  }, [onSelectionChange]);

  const diveBet = diveBetId ? lens.bets.find((bet) => bet.id === diveBetId) ?? null : null;
  if (diveBet) return <DiveSurface
    bet={diveBet}
    wallItems={wallQueue}
    outcomes={lens.outcomes ?? []}
    configuration={shelfConfiguration}
    onReturnToOrbit={returnFromDive}
    onReviewWallItem={() => { setDiveBetId(null); onWallOpenChange(true); }}
    onHoldWallItem={() => undefined}
  />;

  return (
    <section
      data-venture-atlas
      data-atlas-altitude={altitude}
      data-intent-named={(projection?.workingTheory?.intent || projection?.document.intent?.statement)?.trim() ? "true" : "false"}
      data-working-theory={projection?.workingTheory ? "true" : "false"}
      className="venture-atlas"
      aria-label="Living venture atlas"
    >
      {showReturnBand && projection ? <AtlasReturnBand projection={projection} lens={lens} onFocusOutcome={(id) => focusNode(`outcome:${id}`)} onFocusPressure={(subjectRef) => focusNode(subjectRef.startsWith("architecture:") || subjectRef.startsWith("theory:") ? subjectRef : `architecture:${subjectRef}`)} /> : null}
      {loading && !projection ? <div className="venture-atlas-loading-overlay" role="status">Loading the venture map…</div> : null}
      {stale || error ? <div className="venture-atlas-stale" role="status">{error && !projection ? "The venture map is unavailable. Durable work remains visible without grouping." : "Showing the last coherent view. External truth and consequential changes wait for a fresh connection."}</div> : null}
      <AtlasCanvas nodes={decoratedNodes} edges={edges} altitude={altitude} onInit={(instance) => { initializeCamera(instance); syncCameraSelection(selectedNodeId); }} onMoveEnd={handleCameraMoveEnd} onNodesChange={onNodesChange} onNodeDragStop={savePosition} onPaneClick={() => onSelectionChange(null)} onPaneDoubleClick={() => undefined} onConnect={() => undefined} onDropItem={(key, point) => { if (!readOnly) placeItemAt(key, point); }} />
      <AtlasShelf
        crew={lens.crew}
        configuration={shelfConfiguration}
        capabilities={capabilities}
        placedKeys={new Set(Object.keys(lens.placement.positions))}
        readOnly={readOnly}
        onPlace={placeItem}
        onOpenSettings={onOpenSettings}
      />
      <div className="atlas-controls" aria-label="Atlas controls">
        {!readOnly ? <Button type="button" variant="secondary" size="sm" onClick={() => setMutationDraft({ kind: "create", point: { x: 760, y: 440 } })}><Sparkles aria-hidden="true" /> Thought <kbd>N</kbd></Button> : null}
        <Button className="atlas-outline-toggle" type="button" variant="secondary" size="sm" aria-expanded={outlineOpen} aria-controls={outlineOpen ? "atlas-outline-panel" : undefined} onClick={() => setOutlineOpen((open) => !open)}><ListTree aria-hidden="true" /> Outline <kbd>O</kbd></Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => { fitWhole(); onSelectionChange(null); }}><Focus aria-hidden="true" /> Whole venture</Button>
        <AtlasLegendToggle open={legendOpen} onToggle={() => setLegendOpen((open) => !open)} />
      </div>
      <AtlasLegend open={legendOpen} onClose={() => setLegendOpen(false)} />
      <ArchitectureProposalSurface
        ventureId={ventureId}
        baseArchitecture={projection?.document ?? null}
        readOnly={readOnly}
        className="venture-atlas-proposal"
        onAdjustMotion={adjustProposedMotion}
        onDecision={() => { reload(); onRefresh(); }}
      />
      {connectionSourceId ? <div className="atlas-connect-status" role="status">Choose another architecture element to connect. Escape cancels.</div> : null}
      {projection && omissionSummary(projection, Boolean(cameraFocusedId)) ? <div data-atlas-omissions className="atlas-omissions">{omissionSummary(projection, true)}</div> : null}
      {projection ? <AtlasOutline open={outlineOpen} nodes={decoratedNodes} selectedId={selectedNodeId} onSelect={(id, focus) => focus ? focusNode(id) : selectNode(id)} onClose={() => setOutlineOpen(false)} /> : null}
      {machineryId && projection ? <AtlasMachinery nodeId={machineryId} projection={projection} lens={lens} onClose={() => setMachineryId(null)} /> : null}
      {mutationDraft ? <ArchitectureMutationPreview key={mutationDraft.kind} draft={mutationDraft} busy={mutation.busy || campaignBusy} error={mutation.error || campaignError} onCancel={() => setMutationDraft(null)} onCreate={(name, point) => {
        const id = stableId("arch"); void applyMutation([{ op: "create-element", element: { id, role: "concept", name, provenance: { kind: "founder-authored", createdAt: new Date().toISOString() } } }], `Placed “${name}” in the venture architecture.`, [{ op: "remove-element", elementId: id }]).then(() => placement.commitPosition(`architecture:${id}`, point));
      }} onPromote={(role) => {
        if (mutationDraft.kind !== "promote") return; const element = mutationDraft.element;
        void applyMutation([{ op: "change-role", elementId: element.id, role, fields: promotionFields(element, role) }], `Used “${element.name}” as ${role.replace("-", " ")}.`, [{ op: "change-role", elementId: element.id, role: "concept", fields: {} }]);
      }} onConnect={(label) => {
        if (mutationDraft.kind !== "connect") return; const id = stableId("connection");
        void applyMutation([{ op: "create-connection", connection: { id, fromRef: mutationDraft.sourceId, toRef: mutationDraft.targetId, label, assertion: "tentative", source: { kind: "founder-authored" } } }], `Connected two venture concepts: “${label}”.`, [{ op: "remove-connection", connectionId: id }]);
      }} onStartCampaign={(value) => {
        if (mutationDraft.kind !== "campaign") return;
        setCampaignBusy(true); setCampaignError(null);
        void startArchitectureCampaign(ventureId, {
          baseRevision: mutation.getRevision(),
          motionId: mutationDraft.motion.id,
          campaign: { name: value.name, audience: value.audience, objective: value.objective, measurement: { observation: value.observation, window: value.window }, bounds: { startsAt: new Date().toISOString(), endsAt: null } },
          bet: { intent: value.uncertainty },
          reason: `Activated “${mutationDraft.motion.name}” as “${value.name}”.`,
        }).then((result) => { mutation.adoptRevision(result.revision); setMutationDraft(null); reload(); onRefresh(); }).catch((cause) => setCampaignError(cause instanceof Error ? cause.message : "The campaign could not start.")).finally(() => setCampaignBusy(false));
      }} /> : null}
      <AnimatePresence>{revisionReceipt.value ? <motion.div key={revisionReceipt.value.receipt.revision} className="atlas-revision-receipt" initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : 8 }} transition={{ duration: reducedMotion ? 0 : ATLAS_MOTION.settle, ease: ATLAS_EASE }}><span><small>Architecture revision {revisionReceipt.value.receipt.revision}</small><strong>{revisionReceipt.value.receipt.reason}</strong></span>{revisionReceipt.value.undo ? <Button type="button" variant="ghost" size="sm" onClick={() => { const undo = revisionReceipt.value?.undo; if (!undo) return; void mutation.apply(undo.operations, undo.reason).then((result) => { revisionReceipt.keep({ revision: result.revision, reason: undo.reason, affectedContexts: result.affectedContexts }, null); reload(); }); }}><RotateCcw aria-hidden="true" /> Undo</Button> : null}<Button type="button" variant="ghost" size="icon-sm" onClick={revisionReceipt.clear} aria-label="Dismiss architecture receipt"><X /></Button></motion.div> : null}</AnimatePresence>
      <div data-atlas-wall><AtlasWallPanel queue={wallQueue} wallCount={lens.wall.count} liveBetCount={lens.bets.filter((bet) => bet.position === "live").length} open={wallOpen} onOpenChange={onWallOpenChange} onDecide={onDecideWall} onInspectProductChange={inspectWallProductChange} onApproveProductChange={approveWallProductChange} readOnly={readOnly} unavailableReason={error && !projection ? error : null} /></div>
    </section>
  );
}
