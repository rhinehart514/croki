// Root of the immersive shell (architecture §1). Mounts the edge-to-edge VentureWorld and the single
// floating glass Composer, and provides ShellStateContext (UI mode only). Domain data flows from the
// existing hooks — useFirmConnection for the lens, useAtlasProjection for the polled projection,
// useCanvasCapabilities for the ports — exactly as the legacy triptych consumes them. This shell is
// additive: it mounts only behind ?shell=immersive (see FirmApp), never replacing the triptych in
// Phase 1.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { FirmVenture } from "@/api";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { useAtlasProjection } from "@/components/atlas/useAtlasProjection";
import { useCanvasCapabilities } from "@/components/lens/canvasCapabilities";
import { VentureWorld } from "./world/VentureWorld";
import { Composer } from "./chrome/Composer";
import { DescendReading } from "./descend/DescendReading";
import { ShellStateProvider } from "./state/ShellStateContext";
import { useShellState } from "./state/shellState";
import { VentureSigil } from "./chrome/VentureSigil";
import { FirmStatus } from "./chrome/FirmStatus";
import { NeedsYouPulse } from "./chrome/NeedsYouPulse";
import { Altimeter } from "./chrome/Altimeter";
import { Teleport } from "./chrome/Teleport";
import { SummonableThread } from "./conversation/SummonableThread";
import { getConversation, getWallQueue, type WallQueueItemView } from "@/api";
import type { FirmArchitectureProjection, FirmConversationMessage } from "@/types";
import "./immersive.css";

const FIRST_RUN_HINT =
  "One sentence draws the whole venture — who it helps, how it grows, and work already beginning.";

function ImmersiveShellBody({ venture }: { venture: FirmVenture }) {
  const { lens, connection, refresh } = useFirmConnection(venture.id);
  const { projection, reload } = useAtlasProjection(venture.id);
  const capabilities = useCanvasCapabilities();
  const { selection, descentOpen } = useShellState();
  const reducedMotion = useReducedMotion();

  const readOnly = connection.phase === "stale" || connection.phase === "offline";
  const hasWork = Boolean(lens?.bets.length);

  // The gate readings render the EXACT staged payload from the wall queue. The lens already carries the
  // polled wall items (REUSE #7); getWallQueue is the authoritative fallback so a descent into the gate
  // has the freshest queue even between lens refreshes.
  const [wallQueue, setWallQueue] = useState<WallQueueItemView[]>([]);
  const loadWall = useCallback(() => {
    getWallQueue(venture.id).then((result) => setWallQueue(result.queue)).catch(() => undefined);
  }, [venture.id]);
  useEffect(() => { loadWall(); }, [loadWall]);
  const wallItems = useMemo<WallQueueItemView[]>(
    () => (wallQueue.length ? wallQueue : ((lens?.wallItems ?? []) as WallQueueItemView[])),
    [lens?.wallItems, wallQueue],
  );

  // Ambient conversation (redesign §3): polled append-only transcript. In-world receipts + the summonable
  // thread read from it; there is NO permanent conversation column. The 2s poll matches the projection
  // cadence so a crew receipt and its node arrive together.
  const [conversation, setConversation] = useState<FirmConversationMessage[]>([]);
  useEffect(() => {
    let stopped = false;
    const pull = () => {
      getConversation(venture.id)
        .then((result) => { if (!stopped) setConversation(result.messages); })
        .catch(() => undefined);
    };
    pull();
    const timer = window.setInterval(pull, 2000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [venture.id]);

  const onDriven = useCallback(() => {
    // Surface the resulting bloom without waiting a full idle tick: refresh the lens and re-poll the
    // projection so useAtlasMaterialization sees the burst promptly.
    refresh();
    reload();
  }, [refresh, reload]);

  const onChanged = useCallback(() => {
    // A decision or steer at a reading changed the world: refresh the lens, re-poll the projection so
    // the bloom updates, and reload the wall queue so a released item leaves the gate.
    refresh();
    reload();
    loadWall();
  }, [loadWall, refresh, reload]);

  const capabilityList = useMemo(
    () => capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      description: capability.description,
      authority: capability.authority,
      connected: capability.connected,
    })),
    [capabilities],
  );

  return (
    <div
      className="immersive-shell"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-descent-open={descentOpen ? "true" : "false"}
    >
      {/* The world stays present behind a descent — it only dims + blurs, so the founder never loses
          the map (redesign §4). The blur class is on the world layer, not the reading. */}
      <div className="immersive-world-layer" data-blurred={descentOpen ? "true" : "false"} aria-hidden={descentOpen ? "true" : undefined}>
        {lens ? (
          <VentureWorld
            ventureId={venture.id}
            lens={lens}
            projection={projection}
            capabilities={capabilityList}
            conversation={conversation}
            onOpenWall={loadWall}
          />
        ) : (
          <div className="iw-overlay" role="status">Opening the venture world…</div>
        )}
      </div>
      {/* Floating glass chrome — dissolved from the old workbench bar into small ephemera over the world
          (redesign §2). Hidden during a descent so the reading is the one lifted surface. */}
      {lens && !descentOpen ? (
        <ShellChrome
          venture={venture}
          lens={lens}
          projection={projection}
          wallItems={wallItems}
          conversation={conversation}
        />
      ) : null}
      {!hasWork && lens && !descentOpen ? <div className="iw-runhint">{FIRST_RUN_HINT}</div> : null}
      {lens && !descentOpen ? (
        <Composer
          ventureId={venture.id}
          selection={selection}
          hasWork={hasWork}
          ventureName={venture.name}
          readOnly={readOnly}
          onDriven={onDriven}
        />
      ) : null}
      {lens ? <DescendReading ventureId={venture.id} wallItems={wallItems} onChanged={onChanged} /> : null}
    </div>
  );
}

// The floating glass chrome layer. Reads the world snapshot (altitude, placed nodes, selectNode) the
// world publishes into shell state so Altimeter/Teleport/NeedsYouPulse work without living inside the
// ReactFlow store. Sigil + FirmStatus are pure props. Everything here is ambient ephemera over the world;
// none of it is a structural panel.
function ShellChrome({
  venture,
  lens,
  projection,
  wallItems,
  conversation,
}: {
  venture: FirmVenture;
  lens: NonNullable<ReturnType<typeof useFirmConnection>["lens"]>;
  projection: FirmArchitectureProjection | null;
  wallItems: WallQueueItemView[];
  conversation: FirmConversationMessage[];
}) {
  const { world } = useShellState();
  const altitude = world?.altitude ?? "venture";
  const nodes = useMemo(() => world?.nodes ?? [], [world?.nodes]);
  const selectNode = useMemo(() => world?.selectNode ?? (() => undefined), [world?.selectNode]);

  // The pulse descends to the waiting gate item's own world node when there is one, else the aggregate
  // wall node, so the exact staged payload opens.
  const descendToGate = useCallback(() => {
    const waiting = wallItems.find((item) => item.decision === null) ?? null;
    const wallNodeId = waiting?.betId ? `bet:${waiting.betId}` : "atlas:wall";
    const target = nodes.some((node) => node.id === wallNodeId) ? wallNodeId : "atlas:wall";
    selectNode(target);
  }, [nodes, selectNode, wallItems]);

  return (
    <>
      <div className="iw-chrome iw-chrome-topleft">
        <VentureSigil venture={venture} />
        <FirmStatus lens={lens} projection={projection} />
      </div>
      <div className="iw-chrome iw-chrome-topright">
        <NeedsYouPulse wallItems={wallItems} onDescendToGate={descendToGate} />
      </div>
      <div className="iw-chrome iw-chrome-botright">
        <Altimeter altitude={altitude} />
      </div>
      <Teleport nodes={nodes} onReveal={selectNode} />
      <SummonableThread conversation={conversation} onDescend={selectNode} />
    </>
  );
}

export function ImmersiveShell({ venture }: { venture: FirmVenture }) {
  return (
    <ShellStateProvider>
      <ImmersiveShellBody venture={venture} />
    </ShellStateProvider>
  );
}
