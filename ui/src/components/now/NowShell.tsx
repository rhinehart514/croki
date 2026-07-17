// The Now shell — the default founder surface. One stable frame (rail + mutating centre) over the same
// backend the immersive world consumes: useFirmConnection for the lens, useAtlasProjection for the Map,
// two write verbs out. Home is the consequence stream; Map is a reachable secondary lens. Selecting a
// row transforms the centre into its detail. The composer is the primary action surface and stays
// scoped by the current selection.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  getWallQueue, listVentures, stopActiveDrive,
  type FirmVenture, type WallQueueItemView,
} from "@/api";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { useAtlasProjection } from "@/components/atlas/useAtlasProjection";
import { useCanvasCapabilities } from "@/components/lens/canvasCapabilities";
import { buildReturnBrief } from "@/lib/return-brief";
import { readReturnCursor } from "@/lib/return-cursor";
import { targetBet, type CanvasSelection } from "@/components/firm/directionTarget";
import { buildNowSections, needsYouCount, type NowRow } from "./nowModel";
import { NowRail } from "./NowRail";
import { NowComposer } from "./NowComposer";
import { NowStream } from "./NowStream";
import { WorkDetail } from "./WorkDetail";
import { MapLens } from "./MapLens";
import "./now.css";

export type NowView = "now" | "needs" | "map" | "automations" | "detail";

export function NowShell({
  venture,
  onOpenVenture,
}: {
  venture: FirmVenture;
  onOpenVenture: (venture: FirmVenture) => void;
}) {
  const { lens, messages, activeDrives, connection, refresh } = useFirmConnection(venture.id);
  const { projection, reload } = useAtlasProjection(venture.id);
  const capabilities = useCanvasCapabilities();
  const reducedMotion = useReducedMotion();

  const [view, setView] = useState<NowView>("now");
  const [selectedRow, setSelectedRow] = useState<NowRow | null>(null);
  const [scope, setScope] = useState<CanvasSelection>(null);
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

  const account = useMemo(
    () => (lens ? buildReturnBrief(lens, messages, cursor, projection, { limitPerGroup: 12, heading: "Now" }) : null),
    [lens, messages, cursor, projection],
  );
  const sections = useMemo(
    () => (lens ? buildNowSections({ records: account?.records ?? [], activeDrives, bets: lens.bets }) : []),
    [account?.records, activeDrives, lens],
  );
  const needsYou = needsYouCount(sections);

  const visibleSections = useMemo(() => {
    let result = sections;
    if (view === "needs") result = result.filter((section) => section.key === "needs-you");
    const query = search.trim().toLowerCase();
    if (query) {
      result = result
        .map((section) => ({ ...section, rows: section.rows.filter((row) => (
          `${row.title} ${row.detail ?? ""} ${row.attribution ?? ""}`.toLowerCase().includes(query)
        )) }))
        .filter((section) => section.rows.length > 0);
    }
    return result;
  }, [sections, view, search]);

  const scopeLabel = useMemo(() => {
    if (!scope?.betId || !lens) return null;
    return lens.bets.find((bet) => bet.id === scope.betId)?.intent ?? null;
  }, [scope, lens]);

  const onDriven = useCallback(() => { refresh(); reload(); loadWall(); }, [refresh, reload, loadWall]);
  const onChanged = useCallback(() => { refresh(); reload(); loadWall(); }, [refresh, reload, loadWall]);
  const newWork = useCallback(() => { setScope(null); setSelectedRow(null); setView("now"); setFocusKey((key) => key + 1); }, []);
  const selectRow = useCallback((row: NowRow) => { setSelectedRow(row); setView("detail"); }, []);
  const revise = useCallback((betId: string | null) => {
    setScope(betId ? targetBet(betId) : null); setSelectedRow(null); setView("now"); setFocusKey((key) => key + 1);
  }, []);
  const stop = useCallback(async (driveId: string) => { await stopActiveDrive(venture.id, driveId).catch(() => undefined); onChanged(); }, [venture.id, onChanged]);

  const capabilityList = useMemo(
    () => capabilities.map((capability) => ({
      id: capability.id, name: capability.name, description: capability.description,
      authority: capability.authority, connected: capability.connected,
    })),
    [capabilities],
  );

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
        onNavigate={(next) => { setView(next); if (next !== "detail") setSelectedRow(null); }}
        onSwitchVenture={onOpenVenture}
      />
      <main className="now-center">
        {view === "map" && lens ? (
          <MapLens ventureId={venture.id} lens={lens} projection={projection} capabilities={capabilityList} conversation={messages} />
        ) : view === "detail" && selectedRow && lens ? (
          <div className="now-page">
            <WorkDetail
              ventureId={venture.id}
              row={selectedRow}
              lens={lens}
              wallItems={wallItems}
              activeDrives={activeDrives}
              onBack={() => { setView("now"); setSelectedRow(null); }}
              onChanged={() => { onChanged(); setView("now"); setSelectedRow(null); }}
              onRevise={revise}
              onStop={stop}
              onOpenMap={() => setView("map")}
            />
          </div>
        ) : view === "automations" ? (
          <div className="now-page">
            <h1 className="now-detail-title">Automations</h1>
            <p className="now-detail-why">
              Tell Drover what to do and when — the same as any direction, plus a trigger. This surface is coming next.
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
                selection={scope}
                scopeLabel={scopeLabel}
                hasWork={Boolean(lens.bets.length)}
                readOnly={readOnly}
                autoFocus={focusKey > 0}
                onClearScope={scope ? () => setScope(null) : undefined}
                onDriven={onDriven}
              />
            ) : null}
            {lens ? (
              <NowStream sections={visibleSections} now={now} onSelectRow={selectRow} />
            ) : (
              <div className="now-empty" role="status"><span>Opening {venture.name}…</span></div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
