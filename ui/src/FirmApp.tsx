// Firm shell: pick or start a venture, then open the lens over crew, bets, outcomes, and the wall.
// This is the sole render root. Deliberately small:
// a venture picker, a persistent teammate rail, and FirmLens.
//
// Desktop only, no mobile layout (AGENTS.md). CrewFace is the only teammate portrait door (DESIGN.md).

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ImmersiveShell } from "@/components/immersive/ImmersiveShell";
import { NowShell } from "@/components/now/NowShell";
import { VentureCanvasShell } from "@/components/canvas/VentureCanvasShell";
import { InspectorEffort } from "@/components/firm/InspectorEffort";
import { inspectorHeader } from "@/components/firm/inspectorContent";
import { decisionBandForBet, effortStateLabel } from "@/components/atlas/betBand";
import { TeammateRail } from "@/components/firm/TeammateRail";
import { FirmWorkbenchCanvas } from "@/components/firm/FirmWorkbenchCanvas";
import "@/styles/firm-app.css";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { buildReturnBrief } from "@/lib/return-brief";
import { advanceReturnCursor, readReturnCursor } from "@/lib/return-cursor";
import { recordUxMetric, startReturnDecisionTimer } from "@/lib/ux-metrics";
import type { FirmArchitectureProjection } from "@/types";

function conversationKey(ventureId: string, field: "open") {
  return `drover:conversation:${ventureId}:${field}`;
}

// Cutover (Phase 5): the immersive warm-paper world is now the DEFAULT founder shell. The legacy
// triptych (workbench bar · conversation rail · inspector cell) is retired from the shipped surface;
// it survives only as an explicit `?shell=legacy` escape hatch for regression, never in the default
// DOM. Read once at module load so a reload picks up the flag.
function legacyShellRequested() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("shell") === "legacy";
}

// The immersive warm-paper world is now a reachable Map lens, not the home surface. `?shell=world`
// still opens it edge-to-edge for regression and for looking at the venture from altitude directly.
function worldShellRequested() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("shell") === "world";
}

// The unified venture canvas (Phase 4/5). `?shell=canvas` opens the flag-gated VentureCanvasShell — one
// React Flow plane over the single atlas scene with rendered Product / Go-to-market territories and
// founder-final drag placement. Additive and behind the flag; the NowShell default stays untouched.
function canvasShellRequested() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("shell") === "canvas";
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
  const [capabilityRefreshKey, setCapabilityRefreshKey] = useState(0);
  const [architecture, setArchitecture] = useState<FirmArchitectureProjection | null>(null);
  const { lens, messages, activeDrives, connection, refresh, setLens } = useFirmConnection(venture?.id ?? null);
  const stale = connection.phase === "stale" || connection.phase === "offline";
  // "read-only" is the web dev/test harness's expected phase (no founder host to sign writes). It is
  // NOT a founder-facing degraded state (contract §2.8): the founder surface renders live, the
  // composer stays enabled, no degraded chrome. A write still fails server-side without the host
  // capability — the authority model is untouched — but the UI never pre-disables on the harness's
  // account. Only a genuine stale/offline connection holds the surface read-only.
  const readOnly = connection.phase === "stale" || connection.phase === "offline";
  const [returnCursor, setReturnCursor] = useState<string | null>(null);
  const returnAccount = useMemo(
    () => lens ? buildReturnBrief(lens, messages, returnCursor, architecture) : null,
    [architecture, lens, messages, returnCursor],
  );
  const returnReviewedThrough = returnAccount?.reviewedThrough ?? null;

  // The inspector is one docked cell that swaps content on selection — never a second overlay.
  // It opens when the founder selects something on the stage and closes to give the stage full
  // width. Copy is ordinary founder language; the deep content views (payload, record) are Phase 2.
  const inspectorOpen = Boolean(canvasSelection) && !wallOpen;
  // The selected effort, when the selection is an effort (not a draft/theory/architecture). Its full
  // detail — the draft's actual content, who's on it, the staged-… id under a disclosure — renders in
  // the docked inspector, never by ballooning the card inline on the stage (composite §9).
  const selectedEffort = useMemo(() => {
    if (!canvasSelection?.betId || canvasSelection.workRef || !lens) return null;
    return lens.bets.find((candidate) => candidate.id === canvasSelection.betId) ?? null;
  }, [canvasSelection, lens]);
  const crewNameByRef = useMemo(
    () => new Map((lens?.crew ?? []).map((member) => [member.ref, member.soul?.name?.trim() || member.ref])),
    [lens],
  );
  const inspectorContent = useMemo(
    () => inspectorHeader(canvasSelection, lens, architecture),
    [architecture, canvasSelection, lens],
  );

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
    setVenture(nextVenture);
    setArchitecture(null);
  }, []);

  useEffect(() => {
    if (!venture) return;
    window.localStorage.setItem(conversationKey(venture.id, "open"), String(conversationOpen));
  }, [conversationOpen, venture]);

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

  // Default shell: the Now workspace — direction composer + consequence stream + artifact-first review,
  // with the world available as a Map lens. `?shell=world` opens the immersive world directly; the
  // legacy triptych below renders only under the explicit `?shell=legacy` opt-out.
  // `key={venture.id}` forces a full remount on venture switch, so no shell keeps the prior venture's
  // selection, composer draft, or wall queue — a stale draft can never submit against the new venture
  // (venture isolation + founder authority).
  if (!legacyShellRequested()) {
    if (canvasShellRequested()) return <VentureCanvasShell key={venture.id} venture={venture} />;
    if (worldShellRequested()) return <ImmersiveShell key={venture.id} venture={venture} />;
    return <NowShell key={venture.id} venture={venture} onOpenVenture={openVenture} />;
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
          <strong>{lens
            ? lens.wall.count
              ? `${lens.wall.count} ${lens.wall.count === 1 ? "decision needs" : "decisions need"} you`
              : lens.bets.some((bet) => bet.position === "live")
                ? `${lens.bets.filter((bet) => bet.position === "live").length} ${lens.bets.filter((bet) => bet.position === "live").length === 1 ? "effort" : "efforts"} underway · nothing needs you`
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
      <div
        className="firm-app-body"
        data-rail={conversationOpen ? "expanded" : "collapsed"}
        data-inspector={inspectorOpen ? "open" : "closed"}
      >
        <TeammateRail
          venture={venture}
          lens={lens}
          messages={messages}
          selection={canvasSelection}
          wallOpen={wallOpen}
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
          onExpand={conversationOpen ? undefined : () => setConversationOpen(true)}
          onCollapse={conversationOpen ? () => setConversationOpen(false) : undefined}
          transcriptOpen={conversationOpen}
          railCollapsed={!conversationOpen}
          railAttention={Boolean(lens?.wall.count)}
          readOnly={readOnly}
          readOnlyReason={connection.message ?? "Reconnecting before changes can be sent…"}
          architecture={architecture}
        />
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
        {inspectorOpen ? (
          <aside className="firm-app-inspector" aria-label="Selection inspector">
            <div className="firm-app-inspector-head">
              <span className="firm-app-inspector-kicker">{inspectorContent.kicker}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close inspector"
                onClick={() => setCanvasSelection(null)}
              >
                <ArrowLeft aria-hidden="true" />
              </Button>
            </div>
            <div className="firm-app-inspector-body">
              <h2 className="firm-app-inspector-title">{inspectorContent.title}</h2>
              {selectedEffort && lens ? (
                <InspectorEffort
                  bet={selectedEffort}
                  stateLabel={effortStateLabel(selectedEffort, decisionBandForBet(selectedEffort, lens))}
                  crewNameByRef={crewNameByRef}
                />
              ) : (
                <p className="firm-app-inspector-note">{inspectorContent.note}</p>
              )}
            </div>
          </aside>
        ) : null}
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
