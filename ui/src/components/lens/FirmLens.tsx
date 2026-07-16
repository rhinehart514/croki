import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  decideWallItem,
  proposeCapability,
  type WallDecision,
  type WallQueueItemView,
} from "@/api";
import {
  crewAnchorKey,
  betAnchorKey,
  focusNeighborhoodKeys,
  type LensAnchorKey,
} from "@/lib/lensLayout";
import type { FitOpts } from "@/lib/lensViewport";
import { approveWallProductChange, inspectWallProductChange } from "@/lib/productChangeWall";
import { CrewNode } from "./CrewNode";
import { BetTerritory } from "./BetTerritory";
import { CapabilityNode } from "./CapabilityNode";
import { CanvasTray } from "./CanvasTray";
import { useCanvasCapabilities } from "./canvasCapabilities";
import { FirmLensOutline } from "./FirmLensOutline";
import { FirmLensEmpty } from "./FirmLensEmpty";
import { FirmLensCanvas } from "./FirmLensCanvas";
import { FirmLensWall } from "./FirmLensWall";
import { LensCameraControls } from "./LensCameraControls";
import { buildFirmLensEdges } from "./firmLensGraph";
import { useLensCamera } from "./useLensCamera";
import { useFirmLensProjection } from "./useFirmLensProjection";
import { useCanvasPlacement } from "./useCanvasPlacement";
import {
  targetBet,
  targetTeammates,
  targetWork,
  toggleTargetTeammate,
  type CanvasSelection,
} from "@/components/firm/directionTarget";
import { configurationForLens } from "@/lib/firmConfiguration";
import { projectBetWork } from "./workyardProjection";
import type { FirmLensProps } from "./firmLensTypes";
import "@/styles/firm-lens.css";
import "@/styles/workyard.css";

const NODE_TYPES: NodeTypes = { crew: CrewNode, bet: BetTerritory, capability: CapabilityNode };
const FIT_OPTIONS = {
  padding: { top: "9%", right: "9%", bottom: "96px", left: "9%" },
  maxZoom: 1.1,
} satisfies FitOpts;

const EMPTY_VENTURE_FIT_OPTIONS = {
  padding: { top: "12%", right: "18%", bottom: "66%", left: "18%" },
  maxZoom: 1.1,
} satisfies FitOpts;

export function FirmLens({
  ventureId,
  repository,
  selection,
  wallOpen: controlledWallOpen,
  onSelectionChange,
  onWallOpenChange,
  onLensChange,
  onConversationChange,
  onReturnToConversation,
  onOpenSettings,
  capabilityRefreshKey = 0,
  lens: controlledLens,
  wallQueue: controlledWallQueue,
  stale = false,
  readOnly = false,
}: FirmLensProps) {
  const [internalWallOpen, setInternalWallOpen] = useState(false);
  const [preferredWallItemId, setPreferredWallItemId] = useState<string | null>(null);
  const [internalSelection, setInternalSelection] = useState<CanvasSelection>(null);
  const externallyReadOnly = stale || readOnly;
  const capabilities = useCanvasCapabilities(repository, capabilityRefreshKey);

  const handleProposeCapability = useCallback(async (agentRef: string, capability: string) => {
    if (externallyReadOnly) throw new Error("Changes resume after Drover reconnects.");
    await proposeCapability(ventureId, agentRef, capability);
    onConversationChange?.();
  }, [externallyReadOnly, onConversationChange, ventureId]);

  const projection = useFirmLensProjection({
    ventureId,
    controlledLens,
    controlledWallQueue,
    onLensChange,
    onProposeCapability: handleProposeCapability,
    capabilities,
  });
  const { lens, wallQueue, nodes, onNodesChange, error, wallError, reload } = projection;
  const actionsDisabled = externallyReadOnly || Boolean(error || wallError);
  const edges = useMemo(() => (lens ? buildFirmLensEdges(lens) : []), [lens]);
  const workByBet = useMemo(() => new Map(
    (lens?.bets ?? []).map((bet) => [bet.id, projectBetWork(lens!, bet)]),
  ), [lens]);
  const fitOptions = lens?.bets.length === 0 ? EMPTY_VENTURE_FIT_OPTIONS : FIT_OPTIONS;
  const selectionControlled = selection !== undefined;
  const activeSelection = selectionControlled ? (selection ?? null) : internalSelection;
  const activeSelectedKeys = useMemo(() => new Set<LensAnchorKey>([
    ...(activeSelection?.betId ? [betAnchorKey(activeSelection.betId)] : []),
    ...(activeSelection?.teammateRefs ?? []).map(crewAnchorKey),
  ]), [activeSelection]);
  const outlineSelectedKey = activeSelection?.betId
    ? betAnchorKey(activeSelection.betId)
    : activeSelection?.teammateRefs[0] ? crewAnchorKey(activeSelection.teammateRefs[0]) : null;
  const wallOpen = controlledWallOpen ?? internalWallOpen;
  const selectedBetId = activeSelection?.betId ?? null;
  const selectedWorkRef = activeSelection?.workRef ?? null;
  const camera = useLensCamera({ lens, selectedBetId, selectedWorkRef, wallOpen, fitOptions });
  const focusKeys = useMemo(
    () => new Set(lens && selectedBetId ? focusNeighborhoodKeys(lens.bets, selectedBetId) : []),
    [lens, selectedBetId],
  );

  const {
    lensElementRef,
    placeCanvasItem,
    removeCanvasItem,
    onNodeDragStop,
    onInit: onCanvasInit,
  } = useCanvasPlacement({
    ventureId,
    lens,
    nodes,
    actionsDisabled,
    onNodesChange,
    onLensChange,
    onCanvasInit: camera.onInit,
    reload,
  });

  const commitSelection = useCallback((next: CanvasSelection) => {
    setInternalSelection(next);
    onSelectionChange?.(next);
  }, [onSelectionChange]);

  const changeWallOpen = useCallback((open: boolean) => {
    setInternalWallOpen(open);
    if (!open) setPreferredWallItemId(null);
    onWallOpenChange?.(open);
  }, [onWallOpenChange]);

  const openWallItem = useCallback((itemId?: string) => {
    setPreferredWallItemId(itemId ?? null);
    changeWallOpen(true);
  }, [changeWallOpen]);

  const selectBet = useCallback((betId: string) => commitSelection(targetBet(betId)), [commitSelection]);
  const selectWork = useCallback((betId: string, workRef: string) => commitSelection(targetWork(betId, workRef)), [commitSelection]);
  const toggleTeammate = useCallback(
    (teammateRef: string) => commitSelection(toggleTargetTeammate(activeSelection, teammateRef)),
    [activeSelection, commitSelection],
  );

  const renderedNodes = useMemo<Node[]>(
    () => nodes.map((node) => ({
      ...node,
      selected: activeSelectedKeys.has(node.id as LensAnchorKey),
      draggable: !actionsDisabled,
      data: {
        ...node.data,
        altitude: selectedBetId && node.id === betAnchorKey(selectedBetId) ? "near" : camera.altitude,
        readOnly: actionsDisabled,
        onRemove: removeCanvasItem,
        selectedWorkRef,
        selectedTeammateRefs: activeSelection?.teammateRefs ?? [],
        onSelectBet: selectBet,
        onSelectWork: selectWork,
        onToggleTeammate: toggleTeammate,
        onOpenWall: openWallItem,
        focusRole: activeSelectedKeys.has(node.id as LensAnchorKey) ? "focus" : focusKeys.has(node.id as LensAnchorKey) ? "related" : "context",
      },
    })),
    [actionsDisabled, activeSelectedKeys, activeSelection?.teammateRefs, camera.altitude, focusKeys, nodes, openWallItem, removeCanvasItem, selectBet, selectedBetId, selectedWorkRef, selectWork, toggleTeammate],
  );

  const inspectAnchor = useCallback((anchorKey: LensAnchorKey, additive = false) => {
    if (anchorKey.startsWith("crew:")) {
      const ref = anchorKey.slice("crew:".length);
      commitSelection(additive ? toggleTargetTeammate(activeSelection, ref) : targetTeammates([ref]));
    } else if (anchorKey.startsWith("bet:")) selectBet(anchorKey.slice("bet:".length));
  }, [activeSelection, commitSelection, selectBet]);

  const clearSelection = useCallback(() => {
    commitSelection(null);
  }, [commitSelection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof Element && target.matches("input, textarea, [contenteditable='true']")) return;
      if (wallOpen) changeWallOpen(false);
      else if (selectedWorkRef && selectedBetId) selectBet(selectedBetId);
      else if (activeSelection) clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSelection, changeWallOpen, clearSelection, selectBet, selectedBetId, selectedWorkRef, wallOpen]);

  // Release and reject decide the queued effect. Killing the underlying bet is a distinct founder act
  // (FIRM-SPEC.md rail 2: "Only the founder kills a bet") — never implied by clearing one queued item —
  // so a plain wall reject never touches bet.end() here.
  const onDecideWallItem = useCallback(async (item: WallQueueItemView, decision: WallDecision, note?: string) => {
    if (actionsDisabled) throw new Error("Decisions resume after Drover reconnects.");
    await decideWallItem(ventureId, item.id, { decision, note });
    await reload();
  }, [actionsDisabled, reload, ventureId]);
  if (!lens) {
    return error ? <div className="firm-lens-error" role="alert">{error}</div> : <div className="firm-lens-loading">Loading the firm…</div>;
  }

  return (
    <div ref={lensElementRef} className="firm-lens" data-focus-active={selectedBetId ? "true" : "false"}>
      {stale || error || wallError ? (
        <div className="firm-lens-stale" role="status">
          Showing the last verified firm. Decisions and changes resume after Drover reconnects.
        </div>
      ) : null}
      <FirmLensCanvas
        nodes={renderedNodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitOptions={fitOptions}
        receiptKey={ventureId}
        altitude={camera.altitude}
        onInit={onCanvasInit}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onInspect={inspectAnchor}
        onClearSelection={clearSelection}
        onMoveEnd={camera.onMoveEnd}
        onCanvasItemDrop={placeCanvasItem}
      />

      {!selectedBetId && !wallOpen ? (
        <CanvasTray
          crew={lens.crew}
          configuration={configurationForLens(lens)}
          capabilities={capabilities}
          placedKeys={new Set(Object.keys(lens.placement.positions))}
          readOnly={actionsDisabled}
          onPlace={placeCanvasItem}
          onOpenSettings={onOpenSettings}
        />
      ) : null}

      {lens.bets.length === 0 && !activeSelection ? (
        <FirmLensEmpty />
      ) : null}

      <div className="firm-lens-outline-layer" hidden={wallOpen}>
        <FirmLensOutline
          crew={lens.crew}
          bets={lens.bets}
          configuration={lens.configuration}
          selectedKey={outlineSelectedKey}
          selectedWorkRef={selectedWorkRef}
          workByBet={workByBet}
          onInspect={(key) => inspectAnchor(key)}
          onSelectWork={selectWork}
        />
      </div>

      <LensCameraControls
        canGoBack={camera.canGoBack}
        canGoForward={camera.canGoForward}
        canFocus={Boolean(selectedBetId)}
        canReturnToWall={lens.wall.count > 0 && !wallOpen}
        canReturnToConversation={Boolean(onReturnToConversation)}
        onGoBack={camera.goBack}
        onGoForward={camera.goForward}
        onFitFirm={camera.fitFirm}
        onBackToFocus={camera.backToFocus}
        onReturnToWall={() => changeWallOpen(true)}
        onReturnToConversation={() => onReturnToConversation?.()}
      />

      <FirmLensWall
        queue={wallQueue}
        wallCount={lens.wall.count}
        open={wallOpen}
        preferredItemId={preferredWallItemId}
        onOpenChange={changeWallOpen}
        onDecide={onDecideWallItem}
        onInspectProductChange={inspectWallProductChange}
        onApproveProductChange={approveWallProductChange}
        readOnly={actionsDisabled}
        unavailableReason={wallError}
      />
    </div>
  );
}
