// The Now shell — a continuous direction workspace. One stable frame (rail + mutating centre) over
// the same backend the immersive world consumes. The rail is an index of continuing founder
// directions; the centre is either the home composer (no direction open) or one owned direction with
// a persistent composer docked at the bottom. Now survives as an internal aggregation and route, not
// as the founder's dominant mental model. Freshness is a workspace-level treatment; consequential
// actions are held while stale. Two write verbs out; no new durable state.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { RefreshCw, WifiOff } from "lucide-react";
import {
  getWallQueue, listVentures, stopActiveDrive,
  type FirmVenture, type WallQueueItemView,
} from "@/api";
import { useFirmConnection, type FirmConnectionState } from "@/hooks/use-firm-connection";
import { useAtlasProjection } from "@/components/atlas/useAtlasProjection";
import { targetBet, type CanvasSelection } from "@/components/firm/directionTarget";
import { readReturnCursor } from "@/lib/return-cursor";
import { buildDirections, buildDirectionSections, directionsNeedingYou, type Direction } from "./directionModel";
import { NowRail } from "./NowRail";
import { NowComposer } from "./NowComposer";
import { NowStream } from "./NowStream";
import { WorkbenchView } from "./WorkbenchView";
import "./now.css";

function verifiedAge(timestamp: number | null, now: number): string {
  if (timestamp === null) return "not verified yet";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1_000));
  if (seconds < 60) return "last verified moments ago";
  const minutes = Math.floor(seconds / 60);
  return `last verified ${minutes}m ago`;
}

// One restrained workspace-level freshness treatment — ordinary language, held actions. Absent when
// the surface is live (the web harness's read-only phase is not a founder-facing degraded state).
function NowFreshness({ connection, now, onRetry }: { connection: FirmConnectionState; now: number; onRetry: () => void }) {
  if (connection.phase !== "stale" && connection.phase !== "offline") return null;
  const offline = connection.phase === "offline";
  return (
    <div className="now-fresh" data-tone={offline ? "offline" : "stale"} role="status" aria-live="polite">
      {offline ? <WifiOff aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
      <strong>{offline ? "Offline" : "Reconnecting"}</strong>
      <span className="now-fresh-detail">
        {verifiedAge(connection.lastUpdatedAt, now)} · decisions that change the world are paused until this is current
      </span>
      <button type="button" className="now-fresh-retry" onClick={onRetry}>Retry</button>
    </div>
  );
}

export function NowShell({
  venture,
  onOpenVenture,
}: {
  venture: FirmVenture;
  onOpenVenture: (venture: FirmVenture) => void;
}) {
  const { lens, messages, activeDrives, connection, refresh } = useFirmConnection(venture.id);
  const { projection, reload } = useAtlasProjection(venture.id);
  const reducedMotion = useReducedMotion();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A just-driven direction is opened by the bet the drive landed on, resolved during render — the fold that
  // turns that bet into a direction only settles once the post-drive refresh lands, so this bridges the gap
  // without an effect. Cleared on any explicit navigation.
  const [pendingOpenBet, setPendingOpenBet] = useState<string | null>(null);
  const [needsOnly, setNeedsOnly] = useState(false);
  const [search, setSearch] = useState("");
  // A representation selection can narrow the composer's scope to one file or one sibling attempt. This is
  // pure intent, non-durable, and reset to the whole direction whenever the selection changes.
  const [composerSelection, setComposerSelection] = useState<CanvasSelection>(null);
  const [ventures, setVentures] = useState<FirmVenture[]>([venture]);
  const [focusKey, setFocusKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [wallQueue, setWallQueue] = useState<WallQueueItemView[]>([]);

  const readOnly = connection.phase === "stale" || connection.phase === "offline";
  const cursor = useMemo(() => readReturnCursor(venture.id), [venture.id]);

  useEffect(() => { listVentures().then((result) => setVentures(result.ventures)).catch(() => undefined); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  const loadWall = useCallback(() => {
    getWallQueue(venture.id).then((result) => setWallQueue(result.queue)).catch(() => undefined);
  }, [venture.id]);
  useEffect(() => { loadWall(); }, [loadWall]);
  const wallItems = useMemo<WallQueueItemView[]>(
    () => (wallQueue.length ? wallQueue : ((lens?.wallItems ?? []) as WallQueueItemView[])),
    [lens?.wallItems, wallQueue],
  );

  const directions = useMemo(
    () => (lens ? buildDirections({ lens, messages, activeDrives }, cursor) : []),
    [lens, messages, activeDrives, cursor],
  );
  const sections = useMemo(() => buildDirectionSections(directions, cursor), [directions, cursor]);
  const needsYou = directionsNeedingYou(sections);

  // The rail index: sections filtered by the Needs-you toggle and the search query.
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

  // The home recent list: the most recently touched directions, honouring the same filters.
  const recent = useMemo(() => {
    let result = directions;
    if (needsOnly) result = result.filter((direction) => direction.needsYou);
    const query = search.trim().toLowerCase();
    if (query) result = result.filter((direction) => `${direction.sentence} ${direction.understanding}`.toLowerCase().includes(query));
    return [...result].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, 6);
  }, [directions, needsOnly, search]);

  // Keep the open direction in sync with fresh data so a decision or steer updates it in place. An explicit
  // selection wins; otherwise a pending just-driven bet opens its direction the moment the fold produces it.
  const openDirection = useMemo(() => {
    if (selectedId) return directions.find((direction) => direction.id === selectedId) ?? null;
    if (pendingOpenBet) return directions.find((direction) => direction.betIds.includes(pendingOpenBet)) ?? null;
    return null;
  }, [directions, selectedId, pendingOpenBet]);

  const onDriven = useCallback(() => { refresh(); reload(); loadWall(); }, [refresh, reload, loadWall]);
  const newDirection = useCallback(() => { setSelectedId(null); setPendingOpenBet(null); setNeedsOnly(false); setComposerSelection(null); setFocusKey((key) => key + 1); }, []);
  const selectDirection = useCallback((direction: Direction) => { setSelectedId(direction.id); setPendingOpenBet(null); setComposerSelection(null); }, []);
  // The home receipt's way into the direction the drive just produced — the bet resolves to its direction in
  // the openDirection memo above, whether the refresh has landed yet or not.
  const openDrivenDirection = useCallback((targetBetId: string | null) => {
    if (!targetBetId) return;
    setSelectedId(null); setPendingOpenBet(targetBetId); setComposerSelection(null);
  }, []);
  const stop = useCallback(async (driveId: string) => { await stopActiveDrive(venture.id, driveId).catch(() => undefined); onDriven(); }, [venture.id, onDriven]);

  // The composer's scope: a representation pick narrows it (a file or one sibling attempt); otherwise it
  // is the whole direction via its primary bet. Non-durable and consequential only when the founder sends.
  const composerScope = useMemo<CanvasSelection>(
    () => composerSelection ?? (openDirection?.primaryBetId ? targetBet(openDirection.primaryBetId) : null),
    [composerSelection, openDirection],
  );
  const clearScope = useCallback(() => setComposerSelection(null), []);
  // Name the exact narrowed scope so the founder sees WHICH attempt/change is targeted before sending —
  // a representation pick carries the sibling bet (its intent) or a specific work reference.
  const scopePickLabel = useMemo<string | null>(() => {
    if (!composerSelection) return null;
    if (composerSelection.betId) {
      const intent = lens?.bets.find((bet) => bet.id === composerSelection.betId)?.intent?.trim();
      if (intent) return intent.length > 44 ? `${intent.slice(0, 44).trimEnd()}…` : intent;
    }
    if (composerSelection.workRef) return "One change in this direction";
    return "This attempt";
  }, [composerSelection, lens]);
  const scopeLabel = openDirection
    ? (composerSelection
        ? scopePickLabel
        : (openDirection.sentence.length > 52 ? `${openDirection.sentence.slice(0, 52).trimEnd()}…` : openDirection.sentence))
    : null;

  return (
    <div className="now" data-reduced-motion={reducedMotion ? "true" : "false"}>
      <NowRail
        venture={venture}
        ventures={ventures}
        sections={railSections}
        selectedId={selectedId}
        needsYou={needsYou}
        search={search}
        needsOnly={needsOnly}
        now={now}
        onSearch={setSearch}
        onToggleNeeds={() => setNeedsOnly((value) => !value)}
        onNewDirection={newDirection}
        onSelectDirection={selectDirection}
        onSwitchVenture={onOpenVenture}
      />

      <main className="now-main">
        <NowFreshness connection={connection} now={now} onRetry={refresh} />

        {openDirection && lens ? (
          <div className="now-workspace">
            <div className="now-workspace-scroll">
              <WorkbenchView
                key={openDirection.id}
                ventureId={venture.id}
                direction={openDirection}
                lens={lens}
                wallItems={wallItems}
                activeDrives={activeDrives}
                projection={projection}
                onBack={newDirection}
                onChanged={onDriven}
                onStop={stop}
                onScopePick={setComposerSelection}
              />
            </div>
            <div className="now-dock">
              <div className="now-dock-inner">
                <NowComposer
                  ventureId={venture.id}
                  ventureName={venture.name}
                  selection={composerScope}
                  scopeLabel={scopeLabel}
                  hasWork
                  variant="dock"
                  readOnly={readOnly}
                  onClearScope={composerSelection ? clearScope : undefined}
                  onDriven={onDriven}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="now-home">
            <div className="now-home-inner">
              <div className="now-home-head">
                <span className="now-home-title">What should Drover accomplish for {venture.name}?</span>
                <span className="now-home-sub">Say one plain sentence. Drover starts real work and stops at every decision that's yours.</span>
              </div>
              {lens ? (
                <NowComposer
                  ventureId={venture.id}
                  ventureName={venture.name}
                  selection={null}
                  scopeLabel={null}
                  hasWork={Boolean(lens.bets.length)}
                  variant="hero"
                  readOnly={readOnly}
                  autoFocus={focusKey > 0}
                  onDriven={onDriven}
                  onOpenResult={openDrivenDirection}
                />
              ) : null}
              {lens ? (
                <NowStream directions={recent} now={now} onSelect={selectDirection} />
              ) : (
                <div className="now-empty" role="status"><span>Opening {venture.name}…</span></div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
