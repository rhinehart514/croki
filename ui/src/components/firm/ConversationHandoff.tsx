import { ArrowUpRight, GitBranch, ShieldCheck } from "lucide-react";
import type { FirmConversationMessage, FirmLens } from "@/types";

type ChangeKind = "opened" | "staged" | "wall";

function changedBets(message: FirmConversationMessage) {
  const ordered: Array<{ id: string; kind: ChangeKind }> = [];
  const seen = new Set<string>();
  const add = (ids: string[] | undefined, kind: ChangeKind) => {
    for (const id of ids ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push({ id, kind });
    }
  };
  add(message.changes?.wallBetIds, "wall");
  add(message.changes?.openedBetIds, "opened");
  add(message.changes?.stagedBetIds, "staged");
  return ordered;
}

const changeLabel: Record<ChangeKind, string> = {
  opened: "New direction",
  staged: "Work prepared",
  wall: "Needs your hand",
};

export function ConversationHandoff({
  message,
  lens,
  onSelectBet,
  onOpenWall,
}: {
  message: FirmConversationMessage;
  lens: FirmLens;
  onSelectBet: (betId: string) => void;
  onOpenWall: () => void;
}) {
  const changes = changedBets(message);
  const hasWall = (message.changes?.wallBetIds.length ?? 0) > 0;

  return (
    <article className="firm-app-handoff" aria-label="Work landed on the canvas">
      <header>
        <span aria-hidden="true"><GitBranch /></span>
        <div>
          <strong>Work landed on the canvas</strong>
          <small>{message.content.replace(/^Work landed on the canvas\s*[—-]\s*/i, "")}</small>
        </div>
      </header>
      {changes.length ? (
        <div className="firm-app-handoff-changes">
          {changes.map(({ id, kind }) => {
            const bet = lens.bets.find((candidate) => candidate.id === id);
            if (!bet) return null;
            return (
              <button type="button" key={id} onClick={() => onSelectBet(id)}>
                <span><small>{changeLabel[kind]}</small><strong>{bet.intent}</strong></span>
                <ArrowUpRight aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
      {hasWall ? (
        <button type="button" className="firm-app-handoff-wall" onClick={onOpenWall}>
          <ShieldCheck aria-hidden="true" /> Review what needs you
        </button>
      ) : null}
    </article>
  );
}
