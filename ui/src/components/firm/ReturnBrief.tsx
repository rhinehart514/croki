import { ArrowRight, CirclePause, MessageSquareText, ShieldCheck, Sparkles, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RETURN_BRIEF_GROUPS,
  type ReturnBriefGroup,
  type ReturnBriefProjection,
  type ReturnBriefRecord,
  type ReturnBriefTarget,
} from "./returnBriefProjection";

const GROUP_PRESENTATION: Record<ReturnBriefGroup, { label: string; icon: typeof ShieldCheck }> = {
  "needs-you": { label: "Needs you", icon: CirclePause },
  "market-spoke": { label: "The market spoke", icon: MessageSquareText },
  "architecture-shift": { label: "Architecture under pressure", icon: Waves },
  "kept-moving": { label: "Kept moving", icon: Sparkles },
  "held-safely": { label: "Held safely", icon: ShieldCheck },
};

const RETURN_TIME = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function returnTimeLabel(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : RETURN_TIME.format(date);
}

type ReturnBriefHandlers = {
  onOpenBet: (betId: string) => void;
  onOpenWall: () => void;
  onViewReceipt?: (receiptId: string) => void;
  onContinueWithTeammate?: (teammateRef: string) => void;
  onOpenArchitecture?: (architectureId: string, architectureRevision: number) => void;
  onShowWiderFirm: () => void;
  onFinishBriefing?: () => void;
};

function handlerFor(target: ReturnBriefTarget, handlers: ReturnBriefHandlers) {
  if (target.kind === "bet") return () => handlers.onOpenBet(target.betId);
  if (target.kind === "wall") return handlers.onOpenWall;
  if (target.kind === "receipt" && handlers.onViewReceipt) return () => handlers.onViewReceipt?.(target.receiptId);
  if (target.kind === "teammate" && handlers.onContinueWithTeammate) {
    return () => handlers.onContinueWithTeammate?.(target.teammateRef);
  }
  if (target.kind === "architecture" && handlers.onOpenArchitecture) {
    return () => handlers.onOpenArchitecture?.(target.architectureId, target.architectureRevision);
  }
  return null;
}

function BriefRecord({ record, handlers }: { record: ReturnBriefRecord; handlers: ReturnBriefHandlers }) {
  const activate = handlerFor(record.target, handlers);
  const occurredAt = returnTimeLabel(record.occurredAt);
  return (
    <li className="firm-app-return-record">
      <div>
        <strong>{record.truth}</strong>
        {record.whyNow ? <p>{record.whyNow}</p> : null}
      </div>
      {record.attribution || record.occurredAt || record.provenance ? (
        <small>
          {record.attribution ? <span>{record.attribution}</span> : null}
          {occurredAt ? <time dateTime={record.occurredAt ?? undefined}>{record.attribution ? " · " : ""}{occurredAt}</time> : null}
          {record.provenance ? <span>{record.attribution || occurredAt ? " · " : ""}{record.provenance}</span> : null}
        </small>
      ) : null}
      {activate ? (
        <button type="button" onClick={activate}>
          {record.actionLabel}<ArrowRight aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}

/**
 * Presentation-only return account. The shell supplies records projected from canonical venture
 * data and canonical navigation handlers; this component never marks work seen or resolved.
 */
export function ReturnBrief({
  projection,
  onOpenBet,
  onOpenWall,
  onViewReceipt,
  onContinueWithTeammate,
  onOpenArchitecture,
  onShowWiderFirm,
  onFinishBriefing,
}: { projection: ReturnBriefProjection } & ReturnBriefHandlers) {
  const handlers = { onOpenBet, onOpenWall, onViewReceipt, onContinueWithTeammate, onOpenArchitecture, onShowWiderFirm, onFinishBriefing };
  const groupCounts = RETURN_BRIEF_GROUPS.map((group) => ({
    group,
    count: projection.records.filter((record) => record.group === group).length,
    label: GROUP_PRESENTATION[group].label,
  })).filter(({ count }) => count > 0);
  return (
    <section className="firm-app-return" aria-labelledby="firm-return-heading">
      <header>
        <span>Since your last review</span>
        <h2 id="firm-return-heading">{projection.heading}</h2>
        <ul className="firm-app-return-summary" aria-label="Return briefing summary">
          {groupCounts.map(({ group, count, label }) => <li key={group}><strong>{count}</strong> {label}</li>)}
        </ul>
      </header>

      <div className="firm-app-return-groups">
        {RETURN_BRIEF_GROUPS.map((group) => {
          const records = projection.records.filter((record) => record.group === group);
          if (!records.length) return null;
          const presentation = GROUP_PRESENTATION[group];
          const Icon = presentation.icon;
          return (
            <section key={group} className="firm-app-return-group" aria-labelledby={`return-${group}`}>
              <h3 id={`return-${group}`}><Icon aria-hidden="true" />{presentation.label}</h3>
              <ol>{records.map((record) => <BriefRecord key={record.id} record={record} handlers={handlers} />)}</ol>
            </section>
          );
        })}
      </div>

      <footer>
        <p>{projection.omission}</p>
        <div className="firm-app-return-actions">
          <Button type="button" variant="ghost" size="sm" onClick={onShowWiderFirm}>
            Show the wider firm<ArrowRight aria-hidden="true" />
          </Button>
          {onFinishBriefing && projection.reviewableCount > 0 ? (
            <Button type="button" size="sm" onClick={onFinishBriefing}>
              Finish briefing
            </Button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
