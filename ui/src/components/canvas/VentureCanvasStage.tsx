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
import { useArchitectureMutation } from "@/components/atlas/useArchitectureMutation";
import { useCanvasRevisionStack, type CanvasRevisionEntry } from "./useCanvasRevisionStack";
import { useDropTarget } from "./useDropTarget";
import { interpretRelationship, type RelationshipProposal } from "./interpretRelationship";
import { InterpretationChip } from "./InterpretationChip";
import { RevisionReceipts } from "./RevisionReceipts";
import { placementDelta, applyPlacement, type PlacementPositions } from "./placementInverse";
import { rankAtlasNodes } from "./rankAtlasNodes";
import { clusterCollapse, MIN_TAIL_TO_COLLAPSE } from "./clusterCollapse";
import { putPlacement } from "@/api";
import type { FirmArchitectureConnection } from "@/types";
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

  // SPEC A + B share ONE mutation client and ONE revision stack, mounted here at the top of the inner stage
  // and threaded down (spec: else interpretation-preview and undo spin up competing mutation clients). The
  // mutation client re-reads the live revision internally (adoptRevision), so both an interpretation Apply
  // and an undo of an architecture act write against the current revision, never a stale one.
  const mutation = useArchitectureMutation({ ventureId: venture.id, revision: projection?.revision ?? 0 });
  const revisions = useCanvasRevisionStack(venture.id);
  const { push: pushRevision, popUndo, popRedo, canUndo, canRedo, peekUndo, peekRedo } = revisions;

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

  const overlayActive = lensId !== null || answer !== null;

  // ── SPEC A: interpretation-preview (dwell-armed drop → chip) ──────────────────────────────────────────
  // Declared BEFORE the drag handlers so guardedNodeDragStop can open the chip from the latch. The dwell
  // arming reads the live flow store (useDropTarget); it is disabled while read-only OR while an overlay is
  // active — the placement commit itself is gated there (Law 6), so no preview may arm either.
  const liveDrop = useDropTarget({ disabled: readOnly || overlayActive });
  // A node id is a valid architecture connection ref only for the kinds the brain's refExists accepts
  // (architecture / bet / outcome / work / wall-item). The intent hub, crew, and theory subjects are not
  // connectable, so a drop onto/from them never raises the chip — it stays a pure reposition.
  const CONNECTABLE = useMemo(() => /^(architecture|bet|outcome|work|wall-item):/, []);
  const connectablePair = useCallback(
    (target: { sourceId: string; targetId: string } | null): boolean =>
      target !== null && CONNECTABLE.test(target.sourceId) && CONNECTABLE.test(target.targetId),
    [CONNECTABLE],
  );

  // LATCH: the dwell arms WHILE dragging, and the preview must show DURING that hold (it is a dwell-armed
  // PREVIEW — the founder reads Drover's interpretation before releasing). Once armed over a connectable pair,
  // `liveArmed` opens the chip live. Releasing the pointer clears useDropTarget's live arm (no dragging node →
  // no overlap), so the stage also remembers the LAST armed connectable pair and, on drag-stop, commits it to
  // `latched` state so the SAME chip persists after release until the founder chooses (Apply / Keep visual
  // only) or a fresh drag replaces it. Live-while-holding + latched-after-drop is one continuous preview.
  const [latched, setLatched] = useState<typeof liveDrop>(null);
  const lastArmedRef = useRef<typeof liveDrop>(null);
  const liveArmed = liveDrop && connectablePair(liveDrop) ? liveDrop : null;
  // Sync the last-armed pair in an effect, never during render (a ref write during render is impure and the
  // authoritative lint rule forbids it). Each pointer move re-renders with a fresh liveDrop, so the effect
  // flushes before the pointer release (drag stop) reads the ref — the latch is current by drop time.
  useEffect(() => {
    if (liveArmed) lastArmedRef.current = liveArmed;
  }, [liveArmed]);
  // The live arm (during a hold) takes precedence over the latch (after release); overlay-active is preempted
  // at read time so neither a live nor a latched chip ever lingers over a lens.
  const dropTarget = overlayActive ? null : (liveArmed ?? latched);

  // Law 6 (marquee): while a lens or answer overlay is active, the node array holds OVERLAY coordinates, not
  // the founder's own layout. A drag inside an overlay must NEVER be committed as founder placement — it
  // would rewrite every moved id to its lens/answer position via putPlacement. Gate the commit; the
  // overlay's own restore returns each node to the founder frame on exit. Dragging is ALSO disabled in
  // `decorated` (draggable:false) so a stray move never even appears; this is the defense-in-depth backstop.
  //
  // SPEC B: a committed drop pushes ONE placement entry {forward,inverse} to the shared revision stack, so
  // ⌘Z / the receipt rail can put the moved node back where it was. The "before" position must be captured
  // at drag START — by drag STOP React Flow has already mutated the node (and the live array) to the drop
  // point, so a stop-time read would see no delta. This ref holds the dragged node's pre-drag position.
  const dragOriginRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null);
  const onNodeDragStart = useCallback((_event: unknown, node?: Node) => {
    if (lensActiveRef.current || answerOpenRef.current || !node?.id) { dragOriginRef.current = null; return; }
    dragOriginRef.current = { id: node.id, position: { x: node.position.x, y: node.position.y } };
  }, [lensActiveRef]);

  const guardedNodeDragStop = useCallback((event: unknown, node?: Node) => {
    if (lensActiveRef.current || answerOpenRef.current) { dragOriginRef.current = null; lastArmedRef.current = null; return; }
    onNodeDragStop(event, node);
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    // SPEC A: a drop that ended armed over a connectable pair opens the interpretation chip (a post-drop
    // decision — the visual move already committed above; the chip only offers the RELATIONSHIP, never a move).
    const armed = lastArmedRef.current;
    lastArmedRef.current = null;
    if (armed && node?.id && armed.sourceId === node.id && connectablePair(armed)) setLatched(armed);
    // SPEC B: push a placement revision entry only if the node actually moved.
    if (!node?.id || !origin || origin.id !== node.id) return;
    const delta = placementDelta(
      { [node.id]: origin.position },
      { [node.id]: { x: node.position.x, y: node.position.y } },
    );
    if (delta.movedIds.length === 0) return; // a click / no-op drop moved nothing → no revision entry
    pushRevision({
      forward: delta.forward,
      inverse: delta.inverse,
      reason: "Moved a direction",
      revision: null,
      kind: "placement",
      worldBoundary: false,
    });
  }, [lensActiveRef, onNodeDragStop, pushRevision, connectablePair]);

  // The ranked interpretation for the latched pair, in the founder's own vocabulary first
  // (interpretRelationship is PURE — projection.connection labels + territory, never a round-trip). Nodes
  // carry their resolved territory in data.territory (stamped in `positioned`); the ref the ranker aligns
  // connections on is the node id (== the connection fromRef/toRef form).
  const interpretation = useMemo(() => {
    if (!dropTarget) return null;
    const src = nodes.find((n) => n.id === dropTarget.sourceId);
    const dst = nodes.find((n) => n.id === dropTarget.targetId);
    return interpretRelationship(
      projection,
      { ref: dropTarget.sourceId, kind: typeof src?.data.kind === "string" ? src.data.kind : null, territory: (src?.data.territory ?? null) as ("product" | "gtm" | null) },
      { ref: dropTarget.targetId, kind: typeof dst?.data.kind === "string" ? dst.data.kind : null, territory: (dst?.data.territory ?? null) as ("product" | "gtm" | null) },
    );
  }, [dropTarget, nodes, projection]);
  const chipOpen = dropTarget !== null && interpretation !== null;

  const closeChip = useCallback(() => setLatched(null), []);

  // Apply: write a founder-asserted create-connection AND push its inverse (remove-connection) to the shared
  // revision stack. The visual move already committed (the drop repositioned the node), so this only adds the
  // relationship — a separate stack entry from the placement, undone connection-first. Keep sequential after
  // the placement write (the chip only opens after drag stop), so the create-connection CAS never races the
  // placement 409 buffer.
  const applyInterpretation = useCallback(async (proposal: RelationshipProposal) => {
    if (!dropTarget) return;
    const connectionId = `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const connection: FirmArchitectureConnection = {
      id: connectionId,
      fromRef: dropTarget.sourceId,
      toRef: dropTarget.targetId,
      label: proposal.kind,
      assertion: "founder-asserted",
    };
    closeChip();
    try {
      const result = await mutation.apply([{ op: "create-connection", connection }], `Connected two directions: ${proposal.kind}`);
      pushRevision({
        forward: [{ op: "create-connection", connection }],
        inverse: [{ op: "remove-connection", connectionId }],
        reason: `Connected two directions: ${proposal.kind}`,
        revision: result.revision,
        kind: "connect",
        worldBoundary: false,
      });
      refresh();
    } catch {
      // mutation surfaces the error; the drop already committed so the node stays where it landed.
    }
  }, [dropTarget, mutation, pushRevision, refresh, closeChip]);

  // Keep-visual-only / dismiss: write NOTHING — that IS the unsupported epistemic state (no drawn line). The
  // node stays exactly where it landed; only the chip closes (re-dragging the pair re-opens it).
  const keepVisualOnly = useCallback(() => { closeChip(); }, [closeChip]);

  // ── SPEC B: undo / redo application (the stack stores; the stage applies) ─────────────────────────────
  // Apply a placement entry's position map (forward for redo, inverse for undo) over the authoritative
  // placement via the SAME conflict-safe putPlacement an ordinary drop uses — undo is just another placement
  // write, never a force. On a 409 the authoritative revision moved on; surface it by reloading rather than
  // clobbering, and do not re-pop (the entry has already moved onto the redo/undo side).
  const applyPlacementSide = useCallback(async (positions: PlacementPositions) => {
    if (!lens) return;
    const base = lens.placement.positions as PlacementPositions;
    const next = applyPlacement(base, positions);
    try {
      await putPlacement(venture.id, { positions: next, expectedRevision: lens.placement.revision });
      refresh();
    } catch {
      refresh(); // includes a 409 "changed since" — re-read authoritative, never force
    }
  }, [lens, venture.id, refresh]);

  // Apply an architecture entry's ops (forward for redo, inverse for undo) through the shared mutation client,
  // which re-reads the live revision internally (adoptRevision) so an undo applies against a possibly-moved
  // revision without a stale baseRevision. A 409 is surfaced by the mutation client, never force-applied.
  const applyArchitectureSide = useCallback(async (ops: unknown, reason: string) => {
    try {
      await mutation.apply(ops as Parameters<typeof mutation.apply>[0], reason);
      refresh();
    } catch {
      // mutation.error carries "changed since — can't undo cleanly"; the entry stays on its stack side.
    }
  }, [mutation, refresh]);

  const applyEntry = useCallback((entry: CanvasRevisionEntry, side: "inverse" | "forward") => {
    const payload = side === "inverse" ? entry.inverse : entry.forward;
    if (payload === null) return; // a world-boundary entry carries no inverse; the gate never pops it
    if (entry.kind === "placement") {
      void applyPlacementSide(payload as PlacementPositions);
    } else {
      void applyArchitectureSide(payload, side === "inverse" ? `Undid: ${entry.reason}` : entry.reason);
    }
  }, [applyPlacementSide, applyArchitectureSide]);

  const onUndo = useCallback(() => {
    const entry = popUndo();
    if (entry) applyEntry(entry, "inverse");
  }, [popUndo, applyEntry]);
  const onRedo = useCallback(() => {
    const entry = popRedo();
    if (entry) applyEntry(entry, "forward");
  }, [popRedo, applyEntry]);

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
  const selectedNodeId = selection?.betId ? `bet:${selection.betId}` : null;

  // ── SPEC C: dense-map rank-and-reveal ────────────────────────────────────────────────────────────────
  // The set of cluster keys the founder has expanded (clicked a glyph / approached it): a revealed cluster's
  // members are surfaced and its glyph is dropped. Reset when the venture changes.
  const [revealedClusters, setRevealedClusters] = useState<Set<string>>(() => new Set());
  // The recency clock the ranker reads (recently-changed within 7 days). Sampled once at mount via a lazy
  // state initializer (the accepted pattern — the render body itself stays pure, Date.now() is impure there),
  // then re-sampled on a slow cadence so a bet that ages past the window eventually falls to the tail. Coarse
  // by design — a 7-day window tolerates a minute of drift.
  const [rankNow, setRankNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setRankNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const expandCluster = useCallback((clusterKey: string) => {
    setRevealedClusters((current) => {
      const next = new Set(current);
      next.add(clusterKey);
      return next;
    });
  }, []);

  const decoratedBase = useMemo<AtlasNode[]>(() => nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
    draggable: overlayActive ? false : node.draggable,
    data: {
      ...node.data,
      readOnly,
      epistemic: epistemicStateForNode(node, projection, epistemicIndex),
    },
  })), [nodes, readOnly, selectedNodeId, projection, epistemicIndex, overlayActive]);

  // Rank-and-reveal applies ONLY at the structure map read AND only in the free arrangement — a lens or a
  // generated answer always reorganizes the FULL scene (guarded, spec §C). Hidden tail nodes STAY in the
  // array (Law 4: every object reachable at every altitude via AtlasOutline, which reads `decorated`); the
  // collapse only sets node.hidden so React Flow does not paint them, and appends ONE cluster glyph per
  // territory bucket. A founder-placed node is never collapsed (the ranker surfaces it outright).
  const { decorated, clusterGlyphNodes } = useMemo<{ decorated: AtlasNode[]; clusterGlyphNodes: AtlasNode[] }>(() => {
    if (band !== "structure" || overlayActive || lens === null) return { decorated: decoratedBase, clusterGlyphNodes: [] };
    const ranked = rankAtlasNodes({
      nodes: decoratedBase,
      placementPositions: lens.placement.positions,
      band,
      now: rankNow,
    });
    // Density gate: only fold when there is a genuine dense tail (SPEC C is the ~100-direction wall). A sparse
    // venture — a handful of quiet directions — has no tail worth folding, so it stays painted in full and the
    // resting plane reads as the whole machine rather than a glyph over a near-empty map.
    const tailCount = ranked.reduce((count, entry) => (entry.surfaced ? count : count + 1), 0);
    if (tailCount < MIN_TAIL_TO_COLLAPSE) return { decorated: decoratedBase, clusterGlyphNodes: [] };
    const { nodes: collapsed, glyphs } = clusterCollapse({ nodes: decoratedBase, ranked });
    // Honour the founder's reveal: a node whose cluster is expanded is un-hidden, and its glyph is dropped.
    const revealedGlyphKeys = new Set([...revealedClusters]);
    const out = collapsed.map((node) => {
      const clusterId = typeof node.data.clusterId === "string" ? node.data.clusterId : null;
      const clusterKey = clusterId ? clusterId.replace(/^cluster:/, "") : null;
      if (node.hidden && clusterKey && revealedGlyphKeys.has(clusterKey)) {
        return { ...node, hidden: false };
      }
      return node;
    });
    // Build a glyph node per bucket the founder has NOT revealed. Positioned at the centroid of its members
    // so it sits over the tail it fronts; foldPlacement already routed surfaced nodes clear of these boxes.
    const glyphNodes: AtlasNode[] = glyphs
      .filter((glyph) => !revealedGlyphKeys.has(glyph.clusterKey))
      .map((glyph) => {
        const members = decoratedBase.filter((node) => glyph.memberIds.includes(node.id));
        const cx = members.length ? members.reduce((sum, n) => sum + n.position.x, 0) / members.length : 0;
        const cy = members.length ? members.reduce((sum, n) => sum + n.position.y, 0) / members.length : 0;
        return {
          id: glyph.id,
          type: "clusterGlyph",
          position: { x: cx, y: cy },
          draggable: false,
          selectable: false,
          data: {
            kind: "group",
            title: glyph.label,
            clusterKey: glyph.clusterKey,
            label: glyph.label,
            count: glyph.count,
            territory: glyph.territory,
            memberIds: glyph.memberIds,
            onExpand: expandCluster,
          },
        } as unknown as AtlasNode;
      });
    return { decorated: out, clusterGlyphNodes: glyphNodes };
  }, [band, overlayActive, lens, decoratedBase, revealedClusters, expandCluster, rankNow]);

  // The controlled ReactFlow host re-syncs its store whenever the `nodes` PROP reference changes. A fresh
  // `[...decorated, ...clusterGlyphNodes]` spread every render would re-sync on every commit and, with the
  // store update re-entering the render, drive React's update-depth loop (#185). Memo the combined array so
  // its reference is stable while its inputs are — the glyph tail only re-appends when the rank actually moves.
  const flowNodes = useMemo(
    () => [...decorated, ...clusterGlyphNodes] as unknown as Node[],
    [decorated, clusterGlyphNodes],
  );

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
  // toggles it; Enter selects/descends like the pointer; Escape closes it first. Skipped while typing. This
  // listener runs in capture phase so the outline consumes Escape before the workspace broadens map → work.
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
      else if (event.key === "Escape" && outlineOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOutlineOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [outlineOpen, selectedNodeId, answer, lensId, nodes]);

  return (
    <div className="venture-canvas-stage" data-dimmed={dimmed ? "true" : "false"}>
      {lens && scene ? (
        <>
          <VentureCanvasFlow
            nodes={flowNodes}
            edges={epistemicEdges}
            onInit={onInit}
            onNodesChange={onNodesChange as unknown as (changes: NodeChange[]) => void}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={guardedNodeDragStop}
            onNodeClick={selectNode}
            onNodeDoubleClick={onDescend ? descendNode : undefined}
            onPaneClick={() => onSelect(null)}
            onMoveEnd={() => undefined}
          />
          {/* SPEC A: the dwell-armed interpretation preview. It floats at the drop midpoint (ViewportPortal),
              reads in the founder's own vocabulary first, and offers Apply / Change relationship / Keep visual
              only. Apply writes a founder-asserted create-connection + pushes its inverse to the shared stack;
              Keep-visual writes nothing (the unsupported epistemic state). Rendered inside the ReactFlowProvider. */}
          {chipOpen && dropTarget ? (
            <InterpretationChip
              interpretation={interpretation}
              midpoint={dropTarget.midpoint}
              sourceTitle={scopeTitle(nodes, dropTarget.sourceId)}
              targetTitle={scopeTitle(nodes, dropTarget.targetId)}
              onApply={applyInterpretation}
              onKeepVisual={keepVisualOnly}
              onDismiss={keepVisualOnly}
            />
          ) : null}
          {/* SPEC B: the revision receipt rail. Names the last change in founder words; Undo/Redo (⌘Z/⌘⇧Z);
              a world-boundary entry renders WITHOUT Undo (the hard-stop gate, made visible). */}
          <RevisionReceipts
            peekUndo={peekUndo}
            peekRedo={peekRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
          {/* The operating-lens control + altimeter (spec §2): four lens words + the live altitude word,
              with the active lens as a one-word suffix. Clicking a word is the pointer path to the same
              cycle the L / Shift+L / Escape keys drive. */}
          <LensControl lensId={lensId} band={band} onPick={setLens} />
          {/* The generated answer (spec §4): the SAME FLIP scoped by atlasTrace, with three durable exits
              writing to the brain views substrate (never positions) + an instant dismiss. */}
          <GeneratedAnswer
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
