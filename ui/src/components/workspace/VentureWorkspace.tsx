// One workspace frame owns the navigator, adaptive workbench, generated maps, and scoped composer.
// One focus value keeps the visible work and execution target together. Work is the default center;
// maps are summoned and hand a selected object back to the workbench.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listVentures, markWorkIndexReviewed, stopActiveDrive,
  type FirmVenture, type WorkIndexOutlineObject,
} from "@/api";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { targetArchitecture, targetBet, targetObject, type CanvasSelection } from "@/components/firm/directionTarget";
import { readReturnCursor } from "@/lib/return-cursor";
import { readWorkspaceSession, rememberWorkspaceSession } from "@/lib/venture-session";
import { buildDirections, buildDirectionSections, directionsNeedingYou, type Direction } from "@/components/now/directionModel";
import { NowComposer } from "@/components/now/NowComposer";
import { composerScopeLabel } from "@/components/now/composerScope";
import { FirmFreshness } from "@/components/FirmFreshness";
import { VentureMaps } from "@/components/maps/VentureMaps";
import { Workbench } from "@/components/workbench/Workbench";
import { WorkspaceIndex } from "./WorkspaceIndex";
import { directionsFromWorkIndex, sectionsFromWorkIndex } from "./workIndexModel";
import { buildVentureOutline } from "./ventureOutlineModel";
import { directionFocus, targetFocus, ventureFocus, type WorkspaceFocus } from "./workspaceFocus";
import "./venture-workspace.css";

type CenterMode = "work" | "map";

export function VentureWorkspace({
  venture,
  onOpenVenture,
}: {
  venture: FirmVenture;
  onOpenVenture: (venture: FirmVenture) => void;
}) {
  const { lens, messages, activeDrives, workIndex, connection, refresh, setWorkIndex } = useFirmConnection(venture.id);
  const readOnly = connection.phase === "stale" || connection.phase === "offline" || connection.phase === "read-only";
  const readOnlyReason = connection.phase === "offline"
    ? "Offline. Nothing consequential can change until the firm is current again."
    : connection.phase === "read-only"
      ? connection.message ?? "Open Drover through its desktop host to make changes."
      : "Drover is reconnecting. Nothing consequential can change until the firm is current again.";
  const [initialSession] = useState(() => readWorkspaceSession(venture.id));

  // Visual focus and execution target move atomically. `directionId` keeps standalone returns addressable;
  // `target` carries the exact bet/work/architecture subject the composer is allowed to affect.
  const [focus, setFocus] = useState<WorkspaceFocus>(() => initialSession?.focus ?? ventureFocus());
  // The center's mode: the adaptive workbench (default) or the summoned venture graph. The graph is a mode,
  // not the host — so it is only mounted when summoned, and selection survives across the toggle.
  const [mode, setMode] = useState<CenterMode>(() => initialSession?.mode ?? "work");
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [needsOnly, setNeedsOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [ventures, setVentures] = useState<FirmVenture[]>([venture]);
  const [now, setNow] = useState(() => Date.now());

  const cursor = useMemo(() => readReturnCursor(venture.id), [venture.id]);

  useEffect(() => { listVentures().then((result) => setVentures(result.ventures)).catch(() => undefined); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    rememberWorkspaceSession(venture.id, { mode, focus });
  }, [venture.id, mode, focus]);

  // The same fold the Now route runs: bets + conversation spines + drives + wall waits + outcomes →
  // directions. The needs-you fold reads lens.wallItems, which the single useFirmConnection poll keeps
  // current; a settled drive just re-polls the lens.
  const legacyDirections = useMemo(
    () => (lens ? buildDirections({ lens, messages, activeDrives }, cursor) : []),
    [lens, messages, activeDrives, cursor],
  );
  const usesCanonicalIndex = Boolean(workIndex?.items.length);
  const directions = useMemo(
    () => usesCanonicalIndex && workIndex ? directionsFromWorkIndex(workIndex, lens) : legacyDirections,
    [usesCanonicalIndex, workIndex, lens, legacyDirections],
  );
  const sections = useMemo(
    () => usesCanonicalIndex && workIndex
      ? sectionsFromWorkIndex(directions, workIndex)
      : buildDirectionSections(directions, cursor),
    [usesCanonicalIndex, workIndex, directions, cursor],
  );
  const needsYou = usesCanonicalIndex && workIndex ? workIndex.counts.attention : directionsNeedingYou(sections);
  const selection = focus.target;
  const selectedDirection = directions.find((direction) => direction.id === focus.directionId)
    ?? (selection?.betId ? directions.find((direction) => direction.betIds.includes(selection.betId!)) : null)
    ?? null;

  const outline = useMemo(
    () => buildVentureOutline(workIndex, directions, { search, needsOnly }),
    [workIndex, directions, search, needsOnly],
  );
  const selectedObjectId = selection?.objectId ?? selection?.architectureId ?? null;
  const selectedObject = selectedObjectId && !focus.directionId
    ? workIndex?.outline?.objects.find((object) => object.id === selectedObjectId) ?? null
    : null;

  const onDriven = useCallback(() => { refresh(); }, [refresh]);

  const clearScope = useCallback(() => { setFocus(ventureFocus()); }, []);
  const newDirection = useCallback(() => {
    setFocus(ventureFocus());
    setMode("work");
    setNeedsOnly(false);
    setSearch("");
    setComposerFocusRequest((value) => value + 1);
  }, []);

  // SELECT a finer target and keep the workbench as the center. From the map, selecting a node scopes but
  // stays on the map; descending (a deeper pick, or a row inside a body) returns to the work surface with
  // that selection — the graph is one action away and hands the founder back to the work.
  const descend = useCallback((next: CanvasSelection) => {
    setFocus(targetFocus(next, directions));
    setMode("work");
  }, [directions]);

  // RETURN + BROADEN — the reversible Escape ladder, owned here because this frame owns the state:
  //   1. map mode → back to the work surface; the selection SURVIVES.
  //   2. a deep (workRef) selection → broaden workRef→betId, keeping the direction scoped.
  //   3. a scoped selection → clear it back to whole-venture Home.
  const broaden = useCallback(() => {
    if (mode === "map") { setMode("work"); return; }
    if (selection?.workRef) {
      setFocus((current) => ({ ...current, target: targetBet(selection.betId!) }));
      return;
    }
    if (focus.directionId || selection) setFocus(ventureFocus());
  }, [mode, selection, focus.directionId]);

  // Rail / Home → workbench bridge: a picked direction scopes its primary bet, which scopes the composer and
  // the conversation branch in the same state change, and the workbench adapts to the direction's best body.
  const selectDirection = useCallback((direction: Direction) => {
    const indexed = workIndex?.items.find((item) => item.threadRef === direction.id);
    const next = directionFocus(direction);
    if (indexed && !next.target) {
      const architectureId = indexed.subjectRefs.find((ref) => ref.startsWith("architecture:"))?.replace(/^architecture:/, "") ?? null;
      next.target = {
        betId: null,
        workRef: null,
        teammateRefs: [],
        threadRef: indexed.threadRef,
        ...(architectureId ? {
          architectureId,
          architectureStepId: null,
          architectureRevision: workIndex?.outline?.architectureRevision ?? 0,
        } : {}),
      };
    }
    setFocus(next);
    setMode("work");
    if (indexed?.unread && !readOnly) {
      void markWorkIndexReviewed(venture.id, indexed)
        .then((response) => setWorkIndex(response.workIndex))
        .catch(() => refresh());
    }
  }, [workIndex, readOnly, venture.id, setWorkIndex, refresh]);

  const selectObject = useCallback((object: WorkIndexOutlineObject) => {
    const revision = workIndex?.outline?.architectureRevision ?? 0;
    const target = object.targetable
      ? { ...targetArchitecture(object.id, revision), ...(object.threadRefs[0] ? { threadRef: object.threadRefs[0] } : {}) }
      : targetObject(object.id, object.threadRefs[0] ?? null);
    setFocus({ directionId: null, target });
    setMode("work");
  }, [workIndex]);

  const summonMap = useCallback(() => { setMode("map"); }, []);

  const stop = useCallback(async (driveId: string) => {
    await stopActiveDrive(venture.id, driveId).catch(() => undefined);
    onDriven();
  }, [venture.id, onDriven]);

  // Escape climbs the broaden ladder (map → deep → scoped → home). Skipped while typing, and it yields to a
  // nearer handler that already consumed the key (e.g. an open menu closing itself).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.matches("input, textarea, [contenteditable='true']")) return;
      if (mode === "work" && !selection && !focus.directionId) return;
      event.preventDefault();
      broaden();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, selection, focus.directionId, broaden]);

  const scopeLabel = useMemo(
    () => composerScopeLabel(selection, lens, selectedDirection?.sentence ?? selectedObject?.name ?? null),
    [lens, selection, selectedDirection?.sentence, selectedObject?.name],
  );
  const contextOnly = Boolean(selection?.objectId && !selection.architectureId && !selection.threadRef);
  const composerReadOnlyReason = contextOnly
    ? "This map object has no attached work yet. Start a venture direction to change it."
    : readOnly ? readOnlyReason : null;

  return (
    <div className="venture-workspace" key={venture.id} data-mode={mode}>
      <WorkspaceIndex
        venture={venture}
        ventures={ventures}
        lens={lens}
        messages={messages}
        outline={outline}
        workState={workIndex ? "ready" : connection.phase === "opening" ? "loading" : "failed"}
        workError={workIndex ? null : connection.message}
        selection={selection}
        selectedDirectionId={selectedDirection?.id ?? focus.directionId}
        selectedObjectId={selectedObject?.id ?? null}
        needsYou={needsYou}
        search={search}
        needsOnly={needsOnly}
        now={now}
        activeWork={activeDrives}
        readOnly={readOnly}
        readOnlyReason={readOnlyReason}
        onSearch={setSearch}
        onToggleNeeds={() => setNeedsOnly((value) => !value)}
        onNewDirection={newDirection}
        onSelectDirection={selectDirection}
        onSelectObject={selectObject}
        onSwitchVenture={onOpenVenture}
        onClearScope={clearScope}
        onStopActiveWork={stop}
        onConfigurationChanged={onDriven}
        onRetry={refresh}
      />

      <main className="venture-workspace-center" data-scoped={selection ? "true" : "false"}>
        {/* Stale/offline honesty on the center: the same FirmFreshness chip, so a frozen surface is never
            presented as live. Renders nothing when fresh; an aria-live "Reconnecting / Offline · changes are
            held" chip with a Retry otherwise. */}
        <div className="venture-workspace-freshness">
          <FirmFreshness connection={connection} onRetry={refresh} />
        </div>

        {mode === "map" ? (
          <>
            <button type="button" className="venture-workspace-map-return" onClick={() => setMode("work")}>
              <span aria-hidden="true">←</span> Back to work
            </button>
            <VentureMaps
              outline={workIndex?.outline}
              directions={directions}
              onOpenDirection={selectDirection}
              onOpenObject={selectObject}
            />
          </>
        ) : (
          <Workbench
            venture={venture}
            lens={lens}
            messages={messages}
            activeDrives={activeDrives}
            projection={null}
            cursor={cursor}
            selection={selection}
            selectedDirection={selectedDirection}
            selectedObject={selectedObject}
            sections={sections}
            now={now}
            onSelectDirection={selectDirection}
            onDescend={descend}
            onBroaden={broaden}
            onScopePick={descend}
            onStop={stop}
            onChanged={onDriven}
            onSummonMap={summonMap}
            readOnlyReason={readOnly ? readOnlyReason : null}
          />
        )}

        {lens ? (
          <div className="venture-workspace-dock">
            <NowComposer
              ventureId={venture.id}
              ventureName={venture.name}
              selection={selection}
              scopeLabel={scopeLabel}
              hasWork={lens.bets.length > 0}
              variant="dock"
              readOnly={readOnly || contextOnly}
              readOnlyReason={composerReadOnlyReason}
              focusRequest={composerFocusRequest}
              placeholder={scopeLabel ? undefined : "Direct the venture"}
              onClearScope={selection ? clearScope : undefined}
              onDriven={onDriven}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
