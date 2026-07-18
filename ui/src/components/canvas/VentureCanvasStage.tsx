// VentureCanvasStage — the venture canvas plane, extracted from VentureCanvasShell so the surrounding
// workspace frame (VentureWorkspace) can own the single lens connection and pass it in. This is the
// SAME stage Slice 1 shipped: one React Flow plane over the projectAtlas scene with the founder's
// drag-placement hand and the epistemic fold. Nothing about the plane changed — it simply no longer
// polls the lens itself, so the frame can mount a rail and conversation beside it without a second poll.
//
// The one connection lives above (VentureWorkspace); `useAtlasProjection` stays here because only the
// stage reads the architecture projection (its own 1.5s cadence, independent of the lens poll).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider, useEdgesState, useNodesState, type Node, type NodeChange } from "@xyflow/react";
import { SemanticBandProvider } from "@/components/atlas/SemanticBandProvider";
import type { SemanticBand } from "@/components/atlas/semanticBand";
import type { FirmVenture } from "@/api";
import type { FirmLens } from "@/types";
import { useAtlasProjection } from "@/components/atlas/useAtlasProjection";
import { useCanvasCapabilities } from "@/components/lens/canvasCapabilities";
import { useCanvasPlacement } from "@/components/lens/useCanvasPlacement";
import { projectAtlas } from "@/components/atlas/AtlasProjection";
import { applyFounderPositions, carryMeasuredDimensions } from "@/components/atlas/atlasNodeReconcile";
import { indexContext, epistemicStateForNode, edgeTreatmentForSceneEdge } from "@/components/atlas/epistemicScene";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import { targetArchitecture, targetBet, targetTeammates, targetTheory, targetWork, type CanvasSelection } from "@/components/firm/directionTarget";
import { AtlasOutline } from "@/components/atlas/AtlasOutline";
import { VentureCanvasFlow } from "./VentureCanvasFlow";
import { foldPlacement } from "./canvasSeedLayout";
import { resolveTerritories } from "./canvasTerritory";
import { useCanvasLens } from "./useCanvasLens";
import { LensControl } from "./LensControl";
import { GeneratedAnswer, type GeneratedAnswerQuestion } from "./GeneratedAnswer";
import "@/styles/venture-atlas.css";
import "@/styles/epistemic.css";
import "./venture-canvas.css";

// The founder-facing title of a node, for the generated-answer prompt. Falls back to the id so a prompt is
// always legible even for a node with no title.
function scopeTitle(nodes: AtlasNode[], id: string): string {
  const node = nodes.find((candidate) => candidate.id === id);
  const title = node && typeof node.data.title === "string" ? node.data.title.trim() : "";
  return title || id;
}

type VentureCanvasStageProps = {
  venture: FirmVenture;
  lens: FirmLens | null;
  readOnly: boolean;
  selection: CanvasSelection;
  onSelect: (selection: CanvasSelection) => void;
  onDescend?: (selection: CanvasSelection) => void;
  onLensChange: (lens: FirmLens) => void;
  refresh: () => void;
  dimmed?: boolean;
};

function VentureCanvasStageInner({
  venture,
  lens,
  readOnly,
  selection,
  onSelect,
  onDescend,
  onLensChange,
  refresh,
  dimmed = false,
  band,
}: VentureCanvasStageProps & { band: SemanticBand }) {
  const { projection } = useAtlasProjection(venture.id);
  const capabilities = useCanvasCapabilities(venture.repository);

  const scene = useMemo(
    () => (lens ? projectAtlas(projection, lens, { capabilities }) : null),
    [capabilities, lens, projection],
  );

  const emptyVenture = Boolean(lens && lens.bets.length === 0 && !scene?.nodes.some((node) => node.data.kind === "bet"));

  const positioned = useMemo<AtlasNode[]>(() => {
    if (!scene || !lens) return [];
    const positions = foldPlacement(scene.nodes, lens.placement.positions);
    // Stamp each node's territory (the ownership-chain facet the seed biases from) onto its data so the
    // card carries data-territory — geography read from meaning, not re-derived from position.
    const territoryById = resolveTerritories(scene.nodes);
    return scene.nodes.map((node) => {
      const territory = territoryById.get(node.id) ?? null;
      const namedData = node.id === "atlas:intent" && emptyVenture && !node.data.intentNamed
        ? { ...node.data, title: venture.name }
        : node.data;
      return {
        ...node,
        position: positions[node.id] ?? node.position,
        draggable: node.type !== "architectureGroup" && node.id !== "atlas:intent",
        selectable: node.data.kind !== "intent",
        data: { ...namedData, territory },
      };
    });
  }, [emptyVenture, scene, lens, venture.name]);

  const [nodes, setNodes, onNodesChange] = useNodesState<AtlasNode>(positioned);
  const [edges, setEdges] = useEdgesState(scene?.edges ?? []);

  // The generated answer (spec §4) and the operating lens are MUTUALLY EXCLUSIVE — both drive the ONE node
  // array through a FLIP, so coexisting corrupts each other's restore frame. The answer state is declared
  // here (above the lens wiring) so the lens can preempt an open answer. answerOpenRef gives the lens a
  // stable live read without re-subscribing its key handler on every answer change.
  const [answer, setAnswer] = useState<GeneratedAnswerQuestion | null>(null);
  const answerOpenRef = useRef(false);
  useEffect(() => { answerOpenRef.current = answer !== null; }, [answer]);
  const isAnswerOpen = useCallback(() => answerOpenRef.current, []);
  const dismissAnswer = useCallback(() => setAnswer(null), []);

  // The operating lens (spec §2/§3): state home, captured flow instance, the FLIP, and the active-lens
  // gate. lensId is null for the founder's free arrangement; L / Shift+L / Escape are bound in the hook.
  // isAnswerOpen/dismissAnswer wire the mutual-exclusion preempt (entering a lens dismisses an open answer).
  const { lensId, setLens, flowInstance, setFlowInstance, lensActiveRef } = useCanvasLens({
    sceneNodes: scene?.nodes ?? [],
    placementPositions: lens?.placement.positions ?? {},
    lens,
    projection,
    setNodes,
    isAnswerOpen,
    dismissAnswer,
  });

  const reload = useCallback(async () => { refresh(); }, [refresh]);
  const handleLensChange = useCallback((next: FirmLens) => { onLensChange(next); }, [onLensChange]);

  const { onNodeDragStop, onInit, founderPositions, committedDrop } = useCanvasPlacement({
    ventureId: venture.id,
    lens,
    nodes: nodes as unknown as Node[],
    actionsDisabled: readOnly,
    onNodesChange: onNodesChange as unknown as (changes: NodeChange[]) => void,
    onLensChange: handleLensChange,
    onCanvasInit: setFlowInstance,
    reload,
  });

  // Law 6 (marquee): while a lens or answer overlay is active, the node array holds OVERLAY coordinates, not
  // the founder's own layout. A drag inside an overlay must NEVER be committed as founder placement — it
  // would rewrite every moved id to its lens/answer position via putPlacement. Gate the commit; the
  // overlay's own restore returns each node to the founder frame on exit. Dragging is ALSO disabled in
  // `decorated` (draggable:false) so a stray move never even appears; this is the defense-in-depth backstop.
  const guardedNodeDragStop = useCallback((event: unknown, node?: Node) => {
    if (lensActiveRef.current || answerOpenRef.current) return;
    onNodeDragStop(event, node);
  }, [lensActiveRef, onNodeDragStop]);

  useEffect(() => {
    // GATE (hard risk 1): while a lens OR a generated answer is active the founder-position reconcile must
    // NOT run — it would re-apply free-layout positions over the overlay arrangement and snap scoped nodes
    // back mid-overlay (the ~1.2s poll would otherwise undo an answer within a second). The overlay owns
    // positions until it exits, at which point its restore re-reads foldPlacement anyway.
    if (lensActiveRef.current || answerOpenRef.current) { setEdges(scene?.edges ?? []); return; }
    setNodes((previous) => applyFounderPositions(carryMeasuredDimensions(previous, positioned), founderPositions()));
    setEdges(scene?.edges ?? []);
  }, [positioned, scene, setEdges, setNodes, founderPositions, committedDrop, lensActiveRef]);

  const epistemicIndex = useMemo(() => (projection ? indexContext(projection) : null), [projection]);

  // A lens or answer overlay makes the plane a reversible VIEW, not the founder's editable layout: nodes are
  // locked (draggable:false) so a drag can't rearrange coordinates the founder never chose (and can't reach
  // the placement commit — Law 6). Returns to free on overlay exit.
  const overlayActive = lensId !== null || answer !== null;
  const selectedNodeId = selection?.betId ? `bet:${selection.betId}` : null;
  const decorated = useMemo<AtlasNode[]>(() => nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
    draggable: overlayActive ? false : node.draggable,
    data: {
      ...node.data,
      readOnly,
      epistemic: epistemicStateForNode(node, projection, epistemicIndex),
    },
  })), [nodes, readOnly, selectedNodeId, projection, epistemicIndex, overlayActive]);

  const epistemicEdges = useMemo(() => edges.map((edge) => {
    const treatment = edgeTreatmentForSceneEdge(edge, projection);
    if (!treatment) return edge;
    return { ...edge, type: "epistemic", data: { ...(edge.data ?? {}), treatment, label: edge.label } };
  }), [edges, projection]);

  // Resolve any canvas node id into the typed selection target it scopes to: a non-bet node scopes to its
  // object (workRef / teammate / architecture / theory / outcome→owning bet); null only for empty nodes.
  const resolveTarget = useCallback((id: string): CanvasSelection => {
    if (id.startsWith("bet:")) return targetBet(id.slice("bet:".length));
    if (id.startsWith("work:")) {
      const workRef = id.slice("work:".length);
      const join = projection?.joins.work.find((candidate) => candidate.id === workRef || candidate.workRef === workRef);
      const betId = join?.betId ?? lens?.bets.find((bet) => (bet.staged ?? []).some((staged) => staged.id === workRef))?.id;
      return betId ? targetWork(betId, workRef) : null;
    }
    if (id.startsWith("outcome:")) {
      const outcomeId = id.slice("outcome:".length);
      const join = projection?.joins.outcomes.find((candidate) => candidate.outcomeId === outcomeId || candidate.id === outcomeId);
      const betId = join?.betId ?? (lens?.outcomes ?? []).find((outcome) => outcome.id === outcomeId)?.betId;
      return betId ? targetBet(betId) : null;
    }
    if (id.startsWith("crew:")) return targetTeammates([id.slice("crew:".length)]);
    if (id.startsWith("architecture:")) {
      return projection ? targetArchitecture(id.slice("architecture:".length), projection.revision) : null;
    }
    if (id.startsWith("theory:")) {
      const theory = projection?.workingTheory;
      const subject = theory?.subjects.find((candidate) => candidate.id === id.slice("theory:".length));
      return theory && subject ? targetTheory(theory.id, subject.id, theory.baseRevision, subject.name) : null;
    }
    return null;
  }, [lens, projection]);

  // One click SELECTS + SCOPES: only the empty intent hub falls through to null.
  const selectNode = useCallback((id: string) => {
    if (id === "atlas:intent") { onSelect(null); return; }
    const target = resolveTarget(id);
    if (target) onSelect(target); else onSelect(null);
  }, [onSelect, resolveTarget]);

  // Double-click / Enter DESCENDS: sets the same selection AND opens the adaptive workspace.
  const descendNode = useCallback((id: string) => {
    if (id === "atlas:intent") return;
    const target = resolveTarget(id);
    if (target && onDescend) onDescend(target);
  }, [onDescend, resolveTarget]);

  // Deterministic keyboard access via the AtlasOutline (role=listbox, arrow/Home/End, visible focus): "o"
  // toggles it; Enter selects/descends like the pointer; Escape closes it first. Skipped while typing.
  // "L" is NO LONGER an outline key — it is the operating-lens key (useOperatingLens), so "o" is the outline.
  const [outlineOpen, setOutlineOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.matches("input, textarea, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "o") { event.preventDefault(); setOutlineOpen((open) => !open); }
      // "a" asks a generated answer about the current selection — but ONLY while free (no lens): a lens and
      // an answer are mutually exclusive, so 'a' is inert during a lens (the other half of the guard lives
      // in useOperatingLens, which dismisses an open answer before entering a lens).
      else if (key === "a" && selectedNodeId && !answer && !lensId) {
        event.preventDefault();
        setAnswer({ originId: selectedNodeId, prompt: `What bears on ${scopeTitle(nodes, selectedNodeId)}?` });
      }
      else if (event.key === "Escape" && outlineOpen) { event.preventDefault(); setOutlineOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [outlineOpen, selectedNodeId, answer, lensId, nodes]);

  return (
    <div className="venture-canvas-stage" data-dimmed={dimmed ? "true" : "false"}>
      {lens && scene ? (
        <>
          <VentureCanvasFlow
            nodes={decorated as unknown as Node[]}
            edges={epistemicEdges}
            onInit={onInit}
            onNodesChange={onNodesChange as unknown as (changes: NodeChange[]) => void}
            onNodeDragStop={guardedNodeDragStop}
            onNodeClick={selectNode}
            onNodeDoubleClick={onDescend ? descendNode : undefined}
            onPaneClick={() => onSelect(null)}
            onMoveEnd={() => undefined}
          />
          {/* The operating-lens control + altimeter (spec §2): four lens words + the live altitude word,
              with the active lens as a one-word suffix. Clicking a word is the pointer path to the same
              cycle the L / Shift+L / Escape keys drive. */}
          <LensControl lensId={lensId} band={band} onPick={setLens} />
          {/* The generated answer (spec §4): the SAME FLIP scoped by atlasTrace, with three durable exits
              writing to the brain views substrate (never positions) + an instant dismiss. */}
          <GeneratedAnswer
            ventureId={venture.id}
            question={answer}
            sceneNodes={scene.nodes}
            placementPositions={lens.placement.positions}
            lens={lens}
            projection={projection}
            instance={flowInstance}
            setNodes={setNodes}
            onDismiss={() => setAnswer(null)}
          />
          {/* A single screen-reader-only control keeps the outline discoverable without keyboard-map
              knowledge (a11y), mirroring the world atlas. Visible only on focus. */}
          <button
            type="button"
            className="atlas-outline-sr-toggle"
            aria-expanded={outlineOpen}
            aria-controls={outlineOpen ? "atlas-outline-panel" : undefined}
            onClick={() => setOutlineOpen((open) => !open)}
          >
            {outlineOpen ? "Close" : "Open"} the venture outline
          </button>
          <AtlasOutline
            open={outlineOpen}
            nodes={decorated}
            selectedId={selectedNodeId}
            onSelect={(id, focus) => (focus ? descendNode(id) : selectNode(id))}
            onClose={() => setOutlineOpen(false)}
          />
        </>
      ) : (
        <div className="venture-canvas-loading" role="status" aria-live="polite">
          <span className="venture-canvas-loading-mark" aria-hidden="true" />
          <span className="venture-canvas-loading-lead">Opening {venture.name}</span>
          <span className="venture-canvas-loading-note">Laying out the Product and Go-to-market territories…</span>
        </div>
      )}
    </div>
  );
}

// The stage carries its own ReactFlow store and band provider so it stays a drop-in plane the frame can
// place in its centre column. The lens connection is owned above; only presentation lives here.
export type { VentureCanvasStageProps };

export function VentureCanvasStage(props: VentureCanvasStageProps) {
  // The altimeter is new on this surface (spec §2): SemanticBandProvider derives the band inside the flow
  // store and lifts its word here through onBand, so the altimeter word and the card anatomy read the ONE
  // band. The band lives above the provider so the inner stage can dock the altimeter as chrome outside
  // the flow. Defaults to the arrival "structure" band (Orbit).
  const [band, setBand] = useState<SemanticBand>("structure");
  return (
    <ReactFlowProvider>
      <SemanticBandProvider onBand={setBand}>
        <VentureCanvasStageInner {...props} band={band} />
      </SemanticBandProvider>
    </ReactFlowProvider>
  );
}
