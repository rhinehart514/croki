import { useState } from "react";
import { GitBranch, MessageCircle, PanelLeft, PanelLeftClose, ShieldCheck, X } from "lucide-react";
import type { DriveTeammateResult, FirmVenture } from "@/api";
import type { FirmArchitectureProjection, FirmConversationMessage, FirmLens } from "@/types";
import { Button } from "@/components/ui/button";
import { ConversationFeed } from "./ConversationFeed";
import { GoalComposer, type CanvasSelection, type DriveState } from "./GoalComposer";
import { configuredParticipantName } from "./teammateDisplay";
import { configurationForLens } from "@/lib/firmConfiguration";
import { ReturnBrief } from "./ReturnBrief";
import type { ReturnBriefProjection } from "./returnBriefProjection";
import type { FirmActiveWork } from "./ActiveWorkReceipt";

function threadFocus(selection: CanvasSelection, lens: FirmLens | null, architecture?: FirmArchitectureProjection | null) {
  if (!selection || !lens) return { eyebrow: "Firm conversation", title: "Direction, configuration, and work" };
  if (selection.theoryId && selection.theorySubjectId) {
    return { eyebrow: "Drover’s current read", title: selection.theoryLabel ?? "Selected provisional idea" };
  }
  if (selection.architectureId) {
    const element = architecture?.elements.find((candidate) => candidate.id === selection.architectureId);
    const step = element?.role === "product-loop" && selection.architectureStepId
      ? element.steps?.find((candidate) => candidate.id === selection.architectureStepId)
      : null;
    return {
      eyebrow: element?.role === "concept" ? "Venture thought" : `${element?.role.replace("-", " ") ?? "Architecture"} direction`,
      title: step?.label ?? element?.name ?? "Selected architecture",
    };
  }
  if (!selection.betId && selection.teammateRefs.length) {
    const configuration = configurationForLens(lens);
    const names = selection.teammateRefs.map((ref) => configuredParticipantName(
      configuration,
      ref,
      lens.crew.find((member) => member.ref === ref),
      ref,
    ));
    return {
      eyebrow: selection.teammateRefs.length === 1
        ? `${configuration.presentation.participantLabel} conversation`
        : "Selected teammates",
      title: names.join(" + "),
    };
  }
  const bet = lens.bets.find((candidate) => candidate.id === selection.betId);
  const work = selection.workRef
    ? bet?.staged.find((artifact) => artifact.id === selection.workRef)
    : null;
  const workTitle = String(work?.title ?? work?.summary ?? "").trim();
  return selection.workRef
    ? { eyebrow: "Exact work conversation", title: workTitle || bet?.intent || "Selected work" }
    : { eyebrow: "Focused conversation", title: bet?.intent ?? "Selected direction" };
}

export function TeammateRail({
  venture,
  lens,
  messages,
  selection,
  wallOpen,
  onSelectCrew,
  onSelectBet,
  onClearSelection,
  onOpenWall,
  onCloseWall,
  onDriven,
  onConfigurationChanged,
  activeWork,
  onStopActiveWork,
  returnBrief,
  onOpenReturnProof,
  onViewReturnReceipt,
  onSelectArchitecture,
  onShowWiderFirm,
  onReviewReturnBrief,
  onCollapse,
  onExpand,
  transcriptOpen = true,
  railCollapsed = false,
  railAttention = false,
  readOnly = false,
  readOnlyReason = "Reconnecting before changes can be sent…",
  architecture,
}: {
  venture: FirmVenture;
  lens: FirmLens | null;
  messages: FirmConversationMessage[];
  selection: CanvasSelection;
  wallOpen: boolean;
  onSelectCrew: (ref: string) => void;
  onSelectBet: (betId: string) => void;
  onClearSelection: () => void;
  onOpenWall: () => void;
  onCloseWall: () => void;
  onDriven: (result: DriveTeammateResult) => void;
  onConfigurationChanged: () => void;
  activeWork?: readonly FirmActiveWork[];
  onStopActiveWork?: (workId: string) => void | Promise<void>;
  returnBrief?: ReturnBriefProjection | null;
  onOpenReturnProof?: () => void;
  onViewReturnReceipt?: (receiptId: string) => void;
  onSelectArchitecture?: (architectureId: string, architectureRevision: number) => void;
  onShowWiderFirm?: () => void;
  onReviewReturnBrief?: () => void;
  onCollapse?: () => void;
  onExpand?: () => void;
  transcriptOpen?: boolean;
  railCollapsed?: boolean;
  railAttention?: boolean;
  readOnly?: boolean;
  readOnlyReason?: string;
  architecture?: FirmArchitectureProjection | null;
}) {
  const [driving, setDriving] = useState<DriveState | null>(null);
  const [showWiderFirm, setShowWiderFirm] = useState(false);
  const [composerSuggestion, setComposerSuggestion] = useState<string | null>(null);
  const [composerReset, setComposerReset] = useState(0);
  const crew = lens?.crew ?? [];
  const bets = lens?.bets ?? [];
  const hasConversation = messages.length > 0 || bets.some((bet) => (
    bet.events?.some((event) => event.type === "speak" && event.detail?.trim())
  ));
  const showReturnBrief = Boolean(!selection && returnBrief?.records.length && !showWiderFirm);
  const focus = showReturnBrief
    ? { eyebrow: "Return briefing", title: "What changed, what needs you, and what returned" }
    : threadFocus(selection, lens, architecture);
  const configuration = configurationForLens(lens);
  const repositoryName = venture.repository.split("/").filter(Boolean).at(-1) ?? venture.name;
  const clearSelection = () => {
    setComposerSuggestion(null);
    setComposerReset((version) => version + 1);
    onClearSelection();
  };
  const readOnlyLabel = /desktop host/i.test(readOnlyReason) ? "Host required" : "Reconnecting";

  if (railCollapsed) {
    return (
      <aside className="firm-app-rail" aria-label={`${venture.name} conversation, collapsed`}>
        <div className="firm-app-rail-strip">
          <span className="firm-app-rail-mark" aria-hidden="true"><GitBranch /></span>
          <button type="button" aria-label="Open conversation" data-attention={railAttention || undefined} onClick={onExpand}>
            <PanelLeft aria-hidden="true" />
          </button>
          <button type="button" aria-label="Open conversation" onClick={onExpand}>
            <MessageCircle aria-hidden="true" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="firm-app-rail" aria-label={`${venture.name} ${transcriptOpen ? "firm conversation" : "exact work direction"}`}>
      {transcriptOpen ? <section className="firm-app-thread" aria-labelledby="teammate-thread-title">
        <h2 id="teammate-thread-title" className="sr-only">Conversation</h2>
        <div className="firm-app-thread-scope">
          <MessageCircle aria-hidden="true" />
          <span><small>{focus.eyebrow}</small><strong>{focus.title}</strong></span>
          {selection
            ? <Button type="button" variant="ghost" size="icon-sm" onClick={clearSelection} aria-label="Return to venture thread"><X aria-hidden="true" /></Button>
            : <em>{readOnly ? readOnlyLabel : showReturnBrief ? "Since last review" : hasConversation ? "History" : "Ready"}</em>}
          {onCollapse ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onCollapse} aria-label="Hide conversation">
              <PanelLeftClose aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <div className="firm-app-thread-scroll">
          {lens && showReturnBrief && returnBrief ? (
            <ReturnBrief
              projection={returnBrief}
              onOpenBet={(betId) => { setShowWiderFirm(false); onOpenReturnProof?.(); onSelectBet(betId); }}
              onOpenWall={onOpenWall}
              onViewReceipt={(receiptId) => { setShowWiderFirm(true); onViewReturnReceipt?.(receiptId); }}
              onContinueWithTeammate={(ref) => { setShowWiderFirm(false); onSelectCrew(ref); }}
              onOpenArchitecture={(architectureId, revision) => { setShowWiderFirm(false); onOpenReturnProof?.(); onSelectArchitecture?.(architectureId, revision); }}
              onShowWiderFirm={() => { setShowWiderFirm(true); onShowWiderFirm?.(); }}
              onFinishBriefing={onReviewReturnBrief}
            />
          ) : lens ? (
            <>
              {showWiderFirm && returnBrief ? (
                <div className="firm-app-return-continuation" role="status">
                  <span><strong>The wider firm is open</strong><small>You can finish this return briefing without retracing it.</small></span>
                  <div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowWiderFirm(false)}>Return to briefing</Button>
                    {onReviewReturnBrief ? <Button type="button" size="sm" onClick={onReviewReturnBrief}>Finish briefing</Button> : null}
                  </div>
                </div>
              ) : null}
              <ConversationFeed
              lens={lens}
              messages={messages}
              selection={selection}
              driving={driving}
              activeWork={activeWork}
              onStopActiveWork={onStopActiveWork}
              onSelectBet={onSelectBet}
              onOpenWall={onOpenWall}
              onConfigurationChanged={onConfigurationChanged}
              onRetryBet={(betId) => {
                onSelectBet(betId);
                setComposerSuggestion("Retry this move from its last durable step.");
              }}
              onRedirectBet={(betId) => {
                onSelectBet(betId);
                window.requestAnimationFrame(() => document.getElementById("firm-direction-composer")?.focus());
              }}
              readOnly={readOnly}
                readOnlyReason={readOnlyReason}
              />
            </>
          ) : <p className="firm-app-thread-loading">Opening the venture…</p>}
        </div>
      </section> : null}

      <div className="firm-app-composer-layer">
        {wallOpen ? (
          <div className="firm-app-rail-wall-open" role="status">
            <ShieldCheck aria-hidden="true" />
            <span><strong>Founder decisions are open</strong><small>Review exact consequences on the canvas; direction remains available here.</small></span>
            <Button type="button" variant="ghost" size="sm" onClick={onCloseWall}>Close review</Button>
          </div>
        ) : null}
        <GoalComposer
          key={composerReset}
          ventureId={venture.id}
          repositoryName={repositoryName}
          crew={crew}
          bets={bets}
          configuration={configuration}
          architectureElements={architecture?.elements}
          selection={selection}
          suggestion={composerSuggestion}
          onSuggestionConsumed={() => setComposerSuggestion(null)}
          onDriveStateChange={setDriving}
          onClearSelection={clearSelection}
          onOpenWall={onOpenWall}
          onDriven={onDriven}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
        />
      </div>
    </aside>
  );
}
