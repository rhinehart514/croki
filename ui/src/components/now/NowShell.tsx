// The Now shell — the default founder surface. One stable frame (rail + mutating centre) over the same
// backend the immersive world consumes. Home is an index of living founder directions; opening one
// focuses the same surface on that intent. Relationships surface as ordinary-language impact inside a
// direction, never as a graph the founder must operate. Two write verbs out; no new durable state.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  getWallQueue, listVentures, stopActiveDrive,
  type FirmVenture, type WallQueueItemView,
} from "@/api";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { useAtlasProjection } from "@/components/atlas/useAtlasProjection";
import { readReturnCursor } from "@/lib/return-cursor";
import { buildDirections, buildDirectionSections, directionsNeedingYou, type Direction } from "./directionModel";
import { NowRail } from "./NowRail";
import { NowComposer } from "./NowComposer";
import { NowStream } from "./NowStream";
import { WorkDetail } from "./WorkDetail";
import "./now.css";

export type NowView = "now" | "needs" | "automations" | "detail";

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

  const [view, setView] = useState<NowView>("now");
  const [selected, setSelected] = useState<Direction | null>(null);
  const [search, setSearch] = useState("");
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

  const visibleSections = useMemo(() => {
    let result = sections;
    if (view === "needs") result = result.filter((section) => section.key === "needs-you");
    const query = search.trim().toLowerCase();
    if (query) {
      result = result
        .map((section) => ({ ...section, directions: section.directions.filter((direction) => (
          `${direction.sentence} ${direction.understanding}`.toLowerCase().includes(query)
        )) }))
        .filter((section) => section.directions.length > 0);
    }
    return result;
  }, [sections, view, search]);

  // Keep the open direction in sync with fresh data so a decision or steer updates it in place.
  const openDirection = useMemo(
    () => (selected ? directions.find((direction) => direction.id === selected.id) ?? selected : null),
    [directions, selected],
  );

  const onDriven = useCallback(() => { refresh(); reload(); loadWall(); }, [refresh, reload, loadWall]);
  const newWork = useCallback(() => { setSelected(null); setView("now"); setFocusKey((key) => key + 1); }, []);
  const selectDirection = useCallback((direction: Direction) => { setSelected(direction); setView("detail"); }, []);
  const stop = useCallback(async (driveId: string) => { await stopActiveDrive(venture.id, driveId).catch(() => undefined); onDriven(); }, [venture.id, onDriven]);

  const composerVisible = view === "now" || view === "needs";

  return (
    <div className="now" data-reduced-motion={reducedMotion ? "true" : "false"}>
      <NowRail
        venture={venture}
        ventures={ventures}
        view={view}
        needsYou={needsYou}
        search={search}
        onSearch={setSearch}
        onNewWork={newWork}
        onNavigate={(next) => { setView(next); if (next !== "detail") setSelected(null); }}
        onSwitchVenture={onOpenVenture}
      />
      <main className="now-center">
        {view === "detail" && openDirection && lens ? (
          <div className="now-page">
            <WorkDetail
              ventureId={venture.id}
              ventureName={venture.name}
              direction={openDirection}
              lens={lens}
              wallItems={wallItems}
              activeDrives={activeDrives}
              projection={projection}
              onBack={() => { setView("now"); setSelected(null); }}
              onChanged={() => { onDriven(); setView("now"); setSelected(null); }}
              onSteered={onDriven}
              onStop={stop}
            />
          </div>
        ) : view === "automations" ? (
          <div className="now-page">
            <h1 className="now-detail-title">Automations</h1>
            <p className="now-detail-why">
              An automation is a direction with a trigger — the same as anything you ask, plus when to run it.
              It returns the same proof and stops at the same decisions. This surface is coming next.
            </p>
            <div className="now-automation-card" data-example="true" aria-label="Example automation, not yet active">
              <span className="now-automation-tag">Example · not yet active</span>
              <span className="now-automation-when">Every weekday morning</span>
              <span className="now-automation-do">Find the strongest next move for {venture.name} and prepare it for review.</span>
            </div>
          </div>
        ) : (
          <div className="now-page">
            {composerVisible && lens ? (
              <NowComposer
                ventureId={venture.id}
                ventureName={venture.name}
                selection={null}
                scopeLabel={null}
                hasWork={Boolean(lens.bets.length)}
                readOnly={readOnly}
                autoFocus={focusKey > 0}
                onDriven={onDriven}
              />
            ) : null}
            {lens ? (
              <NowStream sections={visibleSections} now={now} onSelect={selectDirection} />
            ) : (
              <div className="now-empty" role="status"><span>Opening {venture.name}…</span></div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
