// VentureWorkspace — the founder-native agent development environment frame (the "Cursor UX for founders").
// It composes existing parts into one calm IDE-like surface:
//   LEFT   — WorkspaceIndex: the venture navigator (search + Needs-you attention + folded directions) docked
//            with the ONE venture conversation (ConversationFeed) scoped to the current selection.
//   CENTER — the adaptive Workbench: the DEFAULT resting surface. With no selection it shows VentureHome
//            (where things stand); selecting a direction/run/artifact/decision opens the best representation
//            the stage registry proposes for that work. The venture GRAPH is a summonable `map` mode — one
//            action away, never the host.
//   DOCK   — NowComposer scoped to the current selection. Scoped to a bet it STEERS that direction through
//            the venture conversation (replyInConversation); unscoped it DIRECTS the venture (driveTeammate).
// One selection state drives everything: it scopes the composer, filters the conversation branch, and chooses
// the workbench representation. The frame owns the single lens connection and the pure direction fold, so the
// rail, conversation, and workbench add no second poll and no second source of truth.
//
// HIERARCHY (inverted from the canvas-first shell): the workbench is the center; the map is summoned, and
// descending from the map returns the founder to the selected work. This is the shipped default.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listVentures, stopActiveDrive,
  type FirmVenture,
} from "@/api";
import type { FirmLens } from "@/types";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { targetBet, type CanvasSelection } from "@/components/firm/directionTarget";
import { readReturnCursor } from "@/lib/return-cursor";
import { buildDirections, buildDirectionSections, directionsNeedingYou, type Direction } from "@/components/now/directionModel";
import { NowComposer } from "@/components/now/NowComposer";
import { FirmFreshness } from "@/components/FirmFreshness";
import { VentureCanvasStage } from "@/components/canvas/VentureCanvasStage";
import { Workbench } from "@/components/workbench/Workbench";
import { WorkspaceIndex } from "./WorkspaceIndex";
import "./venture-workspace.css";

type CenterMode = "work" | "map";

export function VentureWorkspace({
  venture,
  onOpenVenture,
}: {
  venture: FirmVenture;
  onOpenVenture: (venture: FirmVenture) => void;
}) {
  const { lens, messages, activeDrives, connection, refresh, setLens } = useFirmConnection(venture.id);
  const readOnly = connection.phase === "stale" || connection.phase === "offline";
  const readOnlyReason = connection.phase === "offline"
    ? "Offline. Nothing consequential can change until the firm is current again."
    : "Drover is reconnecting. Nothing consequential can change until the firm is current again.";

  // One selection drives the whole frame: the composer scope, the conversation branch, and the workbench
  // representation. A rail direction resolves to its primary bet so a rail pick scopes the workbench.
  const [selection, setSelection] = useState<CanvasSelection>(null);
  // The center's mode: the adaptive workbench (default) or the summoned venture graph. The graph is a mode,
  // not the host — so it is only mounted when summoned, and selection survives across the toggle.
  const [mode, setMode] = useState<CenterMode>("work");
  const [selectedDirectionId, setSelectedDirectionId] = useState<string | null>(null);
  const [needsOnly, setNeedsOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [ventures, setVentures] = useState<FirmVenture[]>([venture]);
  const [now, setNow] = useState(() => Date.now());

  const cursor = useMemo(() => readReturnCursor(venture.id), [venture.id]);

  useEffect(() => { listVentures().then((result) => setVentures(result.ventures)).catch(() => undefined); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  // The same fold the Now route runs: bets + conversation spines + drives + wall waits + outcomes →
  // directions. The needs-you fold reads lens.wallItems, which the single useFirmConnection poll keeps
  // current; a settled drive just re-polls the lens.
  const directions = useMemo(
    () => (lens ? buildDirections({ lens, messages, activeDrives }, cursor) : []),
    [lens, messages, activeDrives, cursor],
  );
  const sections = useMemo(() => buildDirectionSections(directions, cursor), [directions, cursor]);
  const needsYou = directionsNeedingYou(sections);

  const railSections = useMemo(() => {
    let result = sections;
    if (needsOnly) result = result.filter((section) => section.key === "needs-you");
    const query = search.trim().toLowerCase();
    if (query) {
      result = result
        .map((section) => ({ ...section, directions: section.directions.filter((direction) => (
          `${direction.sentence} ${direction.understanding}`.toLowerCase().includes(query)
        )) }))
        .filter((section) => section.directions.length > 0);
    }
    return result;
  }, [sections, needsOnly, search]);

  const onLensChange = useCallback((next: FirmLens) => { setLens(next); }, [setLens]);
  const onDriven = useCallback(() => { refresh(); }, [refresh]);

  const clearScope = useCallback(() => { setSelection(null); setSelectedDirectionId(null); }, []);
  const newDirection = useCallback(() => { setSelection(null); setSelectedDirectionId(null); setMode("work"); setNeedsOnly(false); setSearch(""); }, []);

  // SELECT a finer target and keep the workbench as the center. From the map, selecting a node scopes but
  // stays on the map; descending (a deeper pick, or a row inside a body) returns to the work surface with
  // that selection — the graph is one action away and hands the founder back to the work.
  const descend = useCallback((next: CanvasSelection) => {
    setSelection(next);
    const match = next?.betId
      ? directions.find((direction) => direction.betIds.includes(next.betId!))
      : null;
    setSelectedDirectionId(match?.id ?? null);
    setMode("work");
  }, [directions]);

  // RETURN + BROADEN — the reversible Escape ladder, owned here because this frame owns the state:
  //   1. map mode → back to the work surface; the selection SURVIVES.
  //   2. a deep (workRef) selection → broaden workRef→betId, keeping the direction scoped.
  //   3. a scoped selection → clear it back to whole-venture Home.
  const broaden = useCallback(() => {
    if (mode === "map") { setMode("work"); return; }
    if (selection?.workRef) { setSelection(targetBet(selection.betId!)); return; }
    if (selection) { setSelection(null); setSelectedDirectionId(null); }
  }, [mode, selection]);

  // Rail / Home → workbench bridge: a picked direction scopes its primary bet, which scopes the composer and
  // the conversation branch in the same state change, and the workbench adapts to the direction's best body.
  const selectDirection = useCallback((direction: Direction) => {
    setSelectedDirectionId(direction.id);
    setSelection(direction.primaryBetId ? targetBet(direction.primaryBetId) : null);
    setMode("work");
  }, []);

  // Map → frame bridge: a canvas node scopes everything; keep the rail's selected direction in sync so the
  // picked object's row reads as current. Stays on the map (selecting is not descending).
  const selectFromCanvas = useCallback((next: CanvasSelection) => {
    setSelection(next);
    if (!next?.betId) { setSelectedDirectionId(null); return; }
    const match = directions.find((direction) => direction.betIds.includes(next.betId!));
    setSelectedDirectionId(match?.id ?? null);
  }, [directions]);

  const selectBet = useCallback((betId: string) => { descend(targetBet(betId)); }, [descend]);

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
      if (mode === "work" && !selection) return;
      event.preventDefault();
      broaden();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, selection, broaden]);

  const scopeLabel = useMemo(() => {
    if (!selection?.betId || !lens) return null;
    const bet = lens.bets.find((candidate) => candidate.id === selection.betId);
    return bet ? bet.intent : null;
  }, [lens, selection]);

  return (
    <div className="venture-workspace" key={venture.id} data-mode={mode}>
      <WorkspaceIndex
        venture={venture}
        ventures={ventures}
        lens={lens}
        messages={messages}
        sections={railSections}
        selection={selection}
        selectedDirectionId={selectedDirectionId}
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
        onSwitchVenture={onOpenVenture}
        onSelectBet={selectBet}
        onClearScope={clearScope}
        onStopActiveWork={stop}
        onConfigurationChanged={onDriven}
        onOpenWall={refresh}
      />

      <main className="venture-workspace-center">
        {/* Stale/offline honesty on the center: the same FirmFreshness chip, so a frozen surface is never
            presented as live. Renders nothing when fresh; an aria-live "Reconnecting / Offline · changes are
            held" chip with a Retry otherwise. */}
        <div className="venture-workspace-freshness">
          <FirmFreshness connection={connection} onRetry={refresh} />
        </div>

        {mode === "map" ? (
          <VentureCanvasStage
            venture={venture}
            lens={lens}
            readOnly={readOnly}
            selection={selection}
            onSelect={selectFromCanvas}
            onDescend={descend}
            onLensChange={onLensChange}
            refresh={refresh}
          />
        ) : (
          <Workbench
            venture={venture}
            lens={lens}
            messages={messages}
            activeDrives={activeDrives}
            projection={null}
            cursor={cursor}
            selection={selection}
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
              readOnly={readOnly}
              readOnlyReason={readOnly ? readOnlyReason : null}
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
