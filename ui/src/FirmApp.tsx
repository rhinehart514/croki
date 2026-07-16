// Firm shell: pick or start a venture, then open the lens over crew, bets, outcomes, and the wall.
// This is the sole render root. Deliberately small:
// a venture picker, a persistent teammate rail, and FirmLens.
//
// Desktop only, no mobile layout (AGENTS.md). CrewFace is the only teammate portrait door (DESIGN.md).

import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, GitBranch, MessageCircle, PanelLeftClose, Settings2 } from "lucide-react";
import {
  markFounderAway,
  markFounderPresent,
  stopActiveDrive,
} from "@/api";
import type { DriveTeammateResult, FirmVenture, PortfolioWallContext } from "@/api";
import { FirmSettings } from "@/components/firm/FirmSettings";
import { FirmFreshness } from "@/components/FirmFreshness";
import { Button } from "@/components/ui/button";
import type { CanvasSelection } from "@/components/firm/GoalComposer";
import { targetArchitecture, targetBet, targetTeammates } from "@/components/firm/directionTarget";
import { VenturePicker } from "@/components/firm/VenturePicker";
import { TeammateRail } from "@/components/firm/TeammateRail";
import { FirmWorkbenchCanvas } from "@/components/firm/FirmWorkbenchCanvas";
import "@/styles/firm-app.css";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { buildReturnBrief } from "@/lib/return-brief";
import { advanceReturnCursor, readReturnCursor } from "@/lib/return-cursor";
import { recordUxMetric, startReturnDecisionTimer } from "@/lib/ux-metrics";
import type { FirmArchitectureProjection } from "@/types";

const CONVERSATION_MIN_WIDTH = 360;
const CONVERSATION_MAX_WIDTH = 680;
const CONVERSATION_DEFAULT_WIDTH = 440;

function conversationKey(ventureId: string, field: "open" | "width") {
  return `drover:conversation:${ventureId}:${field}`;
}

function readConversationWidth(ventureId: string) {
  const stored = window.localStorage.getItem(conversationKey(ventureId, "width"));
  if (stored == null) return CONVERSATION_DEFAULT_WIDTH;
  const saved = Number(stored);
  return Number.isFinite(saved)
    ? Math.min(CONVERSATION_MAX_WIDTH, Math.max(CONVERSATION_MIN_WIDTH, saved))
    : CONVERSATION_DEFAULT_WIDTH;
}

function readConversationOpen(ventureId: string) {
  return window.localStorage.getItem(conversationKey(ventureId, "open")) !== "false";
}

export default function FirmApp() {
  const [venture, setVenture] = useState<FirmVenture | null>(null);
  const [canvasSelection, setCanvasSelection] = useState<CanvasSelection>(null);
  const [wallOpen, setWallOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(true);
  const [conversationWidth, setConversationWidth] = useState(CONVERSATION_DEFAULT_WIDTH);
  const [capabilityRefreshKey, setCapabilityRefreshKey] = useState(0);
  const [architecture, setArchitecture] = useState<FirmArchitectureProjection | null>(null);
  const { lens, messages, activeDrives, connection, refresh, setLens } = useFirmConnection(venture?.id ?? null);
  const stale = connection.phase === "stale" || connection.phase === "offline";
  const readOnly = connection.phase !== "fresh";
  const [returnCursor, setReturnCursor] = useState<string | null>(null);
  const returnAccount = useMemo(
    () => lens ? buildReturnBrief(lens, messages, returnCursor, architecture) : null,
    [architecture, lens, messages, returnCursor],
  );
  const returnReviewedThrough = returnAccount?.reviewedThrough ?? null;

  useEffect(() => {
    const heartbeat = () => { void markFounderPresent().catch(() => undefined); };
    heartbeat();
    const timer = window.setInterval(heartbeat, 15_000);
    const markAway = () => { void markFounderAway().catch(() => undefined); };
    window.addEventListener("pagehide", markAway);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", markAway);
      markAway();
    };
  }, []);

  const openVenture = useCallback((nextVenture: FirmVenture, context?: PortfolioWallContext) => {
    setReturnCursor(readReturnCursor(nextVenture.id));
    setCanvasSelection(context?.betId ? targetBet(context.betId) : null);
    setWallOpen(Boolean(context));
    setConversationOpen(readConversationOpen(nextVenture.id));
    setConversationWidth(readConversationWidth(nextVenture.id));
    setVenture(nextVenture);
    setArchitecture(null);
  }, []);

  useEffect(() => {
    if (!venture) return;
    window.localStorage.setItem(conversationKey(venture.id, "open"), String(conversationOpen));
    window.localStorage.setItem(conversationKey(venture.id, "width"), String(conversationWidth));
  }, [conversationOpen, conversationWidth, venture]);

  useEffect(() => {
    if (venture && returnAccount?.projection?.records.some((record) => (
      record.group === "needs-you" || record.group === "held-safely"
    ))) startReturnDecisionTimer(venture.id);
  }, [returnAccount?.projection, venture]);

  useEffect(() => {
    if (!venture || !lens?.wall.count) return;
    const recordPending = () => recordUxMetric("wall_left_pending", venture.id);
    window.addEventListener("pagehide", recordPending);
    return () => window.removeEventListener("pagehide", recordPending);
  }, [lens?.wall.count, venture]);

  // Refresh both founder surfaces once a drive settles. FirmLens and the conversation poll otherwise
  // carry them independently; this avoids waiting out a full idle tick for the result.
  const refreshVenture = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleDriven = useCallback((result: DriveTeammateResult) => {
    refreshVenture();
    const opened = result.handoff?.changes?.openedBetIds ?? [];
    if (opened.length === 1) setCanvasSelection(targetBet(opened[0]));
  }, [refreshVenture]);

  const returnToConversation = useCallback(() => {
    setWallOpen(false);
    setConversationOpen(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".firm-app-composer textarea")?.focus());
    });
  }, []);

  const beginConversationResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = event.clientX;
    const startWidth = conversationWidth;
    const move = (next: PointerEvent) => {
      setConversationWidth(Math.min(
        CONVERSATION_MAX_WIDTH,
        Math.max(CONVERSATION_MIN_WIDTH, startWidth + next.clientX - startX),
      ));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, [conversationWidth]);

  const reviewReturnBrief = useCallback(() => {
    if (!venture || !returnReviewedThrough) return;
    advanceReturnCursor(venture.id, returnReviewedThrough);
    setReturnCursor(returnReviewedThrough);
  }, [returnReviewedThrough, venture]);

  const stopDrive = useCallback(async (driveId: string) => {
    if (!venture) return;
    await stopActiveDrive(venture.id, driveId);
    refreshVenture();
  }, [refreshVenture, venture]);

  const viewReturnReceipt = useCallback((receiptId: string) => {
    if (venture) recordUxMetric("proof_opened", venture.id);
    window.requestAnimationFrame(() => {
      const receipt = document.getElementById(`firm-message:${receiptId}`);
      receipt?.scrollIntoView({ block: "center" });
      receipt?.focus({ preventScroll: true });
    });
  }, [venture]);

  const recordReturnProofOpen = useCallback(() => {
    if (venture) recordUxMetric("proof_opened", venture.id);
  }, [venture]);

  if (!venture) {
    return (
      <div className="firm-app">
        <VenturePicker onOpen={openVenture} />
      </div>
    );
  }

  return (
    <div className="firm-app firm-app-open">
      <header className="firm-app-workbench-bar">
        <div className="firm-app-workbench-identity">
          <span className="firm-app-rail-mark" aria-hidden="true"><GitBranch /></span>
          <span><strong>Drover</strong><small>{venture.name}</small></span>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setVenture(null); setArchitecture(null); setReturnCursor(null); setCanvasSelection(null); setWallOpen(false); setSettingsOpen(false); }}>
            <ArrowLeft aria-hidden="true" /> Ventures
          </Button>
        </div>
        <div className="firm-app-workbench-status" data-attention={lens?.wall.count ? "true" : "false"}>
          <FirmFreshness connection={connection} onRetry={refresh} />
          <strong>{lens && connection.phase !== "fresh"
            ? `Last known: ${lens.bets.filter((bet) => bet.position === "live").length} ${lens.bets.filter((bet) => bet.position === "live").length === 1 ? "line" : "lines"} underway · pending decisions not current`
            : lens
            ? lens.wall.count
              ? `${lens.wall.count} ${lens.wall.count === 1 ? "decision needs" : "decisions need"} you`
              : lens.bets.some((bet) => bet.position === "live")
                ? `${lens.bets.filter((bet) => bet.position === "live").length} ${lens.bets.filter((bet) => bet.position === "live").length === 1 ? "line" : "lines"} underway · nothing needs you`
                : "Ready for the first direction"
            : "Opening the venture…"}</strong>
        </div>
        <div className="firm-app-workbench-actions">
          <Button type="button" variant="ghost" size="sm" aria-pressed={conversationOpen} onClick={() => setConversationOpen((open) => !open)}>
            {conversationOpen ? <PanelLeftClose aria-hidden="true" /> : <MessageCircle aria-hidden="true" />}
            {conversationOpen ? "Conversation" : "Open conversation"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 aria-hidden="true" /> Settings
          </Button>
        </div>
      </header>
      <div className="firm-app-body">
        {(
          <>
            <TeammateRail
              venture={venture}
              lens={lens}
              messages={messages}
              selection={canvasSelection}
              wallOpen={wallOpen}
              width={conversationOpen ? conversationWidth : CONVERSATION_MIN_WIDTH}
              onSelectCrew={(ref) => setCanvasSelection(targetTeammates([ref]))}
              onSelectBet={(betId) => setCanvasSelection(targetBet(betId))}
              onClearSelection={() => setCanvasSelection(null)}
              onOpenWall={() => setWallOpen(true)}
              onCloseWall={() => setWallOpen(false)}
              onDriven={handleDriven}
              onConfigurationChanged={refreshVenture}
              activeWork={activeDrives}
              onStopActiveWork={stopDrive}
              returnBrief={returnAccount?.projection}
              onOpenReturnProof={recordReturnProofOpen}
              onReviewReturnBrief={reviewReturnBrief}
              onViewReturnReceipt={viewReturnReceipt}
              onSelectArchitecture={(architectureId, revision) => setCanvasSelection(targetArchitecture(architectureId, revision))}
              onCollapse={conversationOpen ? () => setConversationOpen(false) : undefined}
              transcriptOpen={conversationOpen}
              readOnly={readOnly}
              readOnlyReason={connection.message ?? "Reconnecting before changes can be sent…"}
              architecture={architecture}
            />
            {conversationOpen ? <div
              className="firm-app-conversation-resizer"
              role="separator"
              aria-label="Resize conversation"
              aria-orientation="vertical"
              aria-valuemin={CONVERSATION_MIN_WIDTH}
              aria-valuemax={CONVERSATION_MAX_WIDTH}
              aria-valuenow={conversationWidth}
              tabIndex={0}
              onPointerDown={beginConversationResize}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                setConversationWidth((width) => Math.min(
                  CONVERSATION_MAX_WIDTH,
                  Math.max(CONVERSATION_MIN_WIDTH, width + (event.key === "ArrowRight" ? 24 : -24)),
                ));
              }}
            /> : null}
          </>
        )}
        <FirmWorkbenchCanvas
          venture={venture}
          lens={lens}
          selection={canvasSelection}
          wallOpen={wallOpen}
          stale={stale}
          readOnly={readOnly}
          capabilityRefreshKey={capabilityRefreshKey}
          connectionPhase={connection.phase}
          showReturnBand={!conversationOpen || Boolean(canvasSelection)}
          onSelectionChange={setCanvasSelection}
          onWallOpenChange={setWallOpen}
          onLensChange={setLens}
          onArchitectureChange={setArchitecture}
          onRefresh={refreshVenture}
          onReturnToConversation={returnToConversation}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
      {settingsOpen ? (
        <FirmSettings
          venture={venture}
          readOnly={readOnly}
          readOnlyReason={connection.message ?? "Reconnecting before settings can change…"}
          onCapabilitiesChanged={() => setCapabilityRefreshKey((key) => key + 1)}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
