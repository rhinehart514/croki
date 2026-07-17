// VentureWorkspace — the Cursor-like frame around the venture canvas (mounted at ?shell=canvas).
// It composes existing parts into one calm IDE-like surface (DESIGN.md Experience Laws 1–3):
//   LEFT   — WorkspaceIndex: NowRail's search + Needs-you attention + folded directions, docked with
//            the ONE venture conversation (ConversationFeed) scoped to the current selection.
//   CENTER — VentureCanvasStage: the visual venture model, the same plane the bare shell shipped.
//   DOCK   — NowComposer scoped to the current selection: unscoped it directs the venture; with a
//            selection it steers that object.
// One selection state drives everything (Exp Law 3): clicking a canvas node focuses it, scopes the
// composer, and surfaces its conversation branch — the canvas stays visible, never a details page.
// The frame owns the single lens connection and reproduces NowShell's pure direction fold, so the rail
// and conversation add no second poll.

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
import { VentureCanvasStage } from "@/components/canvas/VentureCanvasStage";
import { StageWorkspace } from "@/components/stage/StageWorkspace";
import { WorkspaceIndex } from "./WorkspaceIndex";
import "./venture-workspace.css";

export function VentureWorkspace({
  venture,
  onOpenVenture,
}: {
  venture: FirmVenture;
  onOpenVenture: (venture: FirmVenture) => void;
}) {
  const { lens, messages, activeDrives, connection, refresh, setLens } = useFirmConnection(venture.id);
  const readOnly = connection.phase === "stale" || connection.phase === "offline";
  const readOnlyReason = connection.message ?? "Reconnecting before changes can be sent…";

  // One selection drives the whole frame: the canvas node, the composer scope, and the conversation
  // branch (Exp Law 3). A rail direction resolves to its primary bet so a rail pick focuses the canvas.
  const [selection, setSelection] = useState<CanvasSelection>(null);
  // The single new bit of view state beside the selection: whether the adaptive workspace is open OVER the
  // still-mounted canvas. Every scoped surface reads `selection`, not `descended`, so orientation, composer
  // scope, and conversation branch persist across the swap for free.
  const [descended, setDescended] = useState(false);
  const [selectedDirectionId, setSelectedDirectionId] = useState<string | null>(null);
  const [needsOnly, setNeedsOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [ventures, setVentures] = useState<FirmVenture[]>([venture]);
  const [now, setNow] = useState(() => Date.now());

  const cursor = useMemo(() => readReturnCursor(venture.id), [venture.id]);

  useEffect(() => { listVentures().then((result) => setVentures(result.ventures)).catch(() => undefined); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  // The needs-you fold reads lens.wallItems, which the single useFirmConnection poll keeps current; there
  // is no separate wall fetch to run here. A settled drive just re-polls the lens.
  // The same fold NowShell runs: bets + conversation spines + drives + wall waits + outcomes → directions.
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

  const clearScope = useCallback(() => { setSelection(null); setSelectedDirectionId(null); setDescended(false); }, []);
  const newDirection = useCallback(() => { setSelection(null); setSelectedDirectionId(null); setDescended(false); setNeedsOnly(false); setSearch(""); }, []);

  // DESCEND: set the selection (scoping composer + conversation) AND open the adaptive workspace over the
  // still-mounted canvas. Descending DEEPER (a row inside the body) is the same call with a finer target.
  const descend = useCallback((next: CanvasSelection) => {
    setSelection(next);
    if (next?.betId) {
      const match = directions.find((direction) => direction.betIds.includes(next.betId!));
      setSelectedDirectionId(match?.id ?? null);
    }
    setDescended(true);
  }, [directions]);

  // RETURN + BROADEN — the reversible Escape ladder, owned here because this frame owns the state:
  //   1. workspace open → close it; the selection SURVIVES (still selected, still scoped). If the descent
  //      was deep (workRef), also broaden workRef→betId in the same step.
  //   2. next → broaden bet→null (clear selection), keeping the canvas whole.
  const returnFromDescent = useCallback(() => {
    if (descended) {
      setDescended(false);
      setSelection((current) => (current?.workRef ? targetBet(current.betId!) : current));
      return;
    }
    if (selection) { setSelection(null); setSelectedDirectionId(null); }
  }, [descended, selection]);

  // Rail → canvas bridge: a picked direction focuses its primary bet, which scopes the composer and the
  // conversation branch in the same state change. A direction with no bet yet still highlights in the rail.
  const selectDirection = useCallback((direction: Direction) => {
    setSelectedDirectionId(direction.id);
    setSelection(direction.primaryBetId ? targetBet(direction.primaryBetId) : null);
  }, []);

  // Canvas → rail bridge: a canvas node scopes everything; keep the rail's selected direction in sync so
  // the picked object's row reads as current.
  const selectFromCanvas = useCallback((next: CanvasSelection) => {
    setSelection(next);
    if (!next?.betId) { setSelectedDirectionId(null); return; }
    const match = directions.find((direction) => direction.betIds.includes(next.betId!));
    setSelectedDirectionId(match?.id ?? null);
  }, [directions]);

  const selectBet = useCallback((betId: string) => { selectFromCanvas(targetBet(betId)); }, [selectFromCanvas]);

  const stop = useCallback(async (driveId: string) => {
    await stopActiveDrive(venture.id, driveId).catch(() => undefined);
    onDriven();
  }, [venture.id, onDriven]);

  // Escape BROADENS from a scoped selection back to whole-venture (interaction rule 14 / Exp Law 3): today
  // only a button broadened. The ladder is the same one returnFromDescent runs, so a key and the Close
  // control behave identically. Skipped while typing in the composer.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof Element && target.matches("input, textarea, [contenteditable='true']")) return;
      if (!descended && !selection) return;
      event.preventDefault();
      returnFromDescent();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [descended, selection, returnFromDescent]);

  const scopeLabel = useMemo(() => {
    if (!selection?.betId || !lens) return null;
    const bet = lens.bets.find((candidate) => candidate.id === selection.betId);
    return bet ? bet.intent : null;
  }, [lens, selection]);

  return (
    <div className="venture-workspace" key={venture.id}>
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

      <main className="venture-workspace-canvas">
        <VentureCanvasStage
          venture={venture}
          lens={lens}
          readOnly={readOnly}
          selection={selection}
          onSelect={selectFromCanvas}
          onDescend={descend}
          onLensChange={onLensChange}
          refresh={refresh}
          dimmed={descended}
        />
        {descended ? (
          <StageWorkspace
            venture={venture}
            lens={lens}
            messages={messages}
            activeDrives={activeDrives}
            projection={null}
            cursor={cursor}
            selection={selection}
            onDescend={descend}
            onReturn={returnFromDescent}
            onScopePick={descend}
            onStop={stop}
            onChanged={onDriven}
          />
        ) : null}
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
