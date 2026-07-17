// The in-world checkpoint / first-theory seal (architecture §1, redesign §7/§10). A crew handoff — the
// moment a working theory is sealed or work is handed to the founder — renders as a sealed paper object,
// NOT a chat bubble. It carries the green living/connected signal (this is settled, not waiting) and,
// when the handoff points at an effort, a plain-words handle to descend into it. Consumed both in the
// summonable thread (inline) and, later, anchored in-world; the presentation is identical.
import type { FirmConversationMessage } from "@/types";
import { crewName } from "./conversationModel";

export function CheckpointCard({
  message,
  onDescend,
}: {
  message: FirmConversationMessage;
  onDescend?: (nodeId: string) => void;
}) {
  const openedBetId = message.changes?.openedBetIds?.[0] ?? message.betId ?? null;
  const kicker = message.changes?.openedBetIds?.length ? "First theory" : "Checkpoint";

  return (
    <article className="iw-checkpoint" aria-label={`${kicker} from ${crewName(message.teammateRef)}`}>
      <div className="iw-checkpoint-k">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
        </svg>
        {kicker}
      </div>
      <div className="iw-checkpoint-title">{crewName(message.teammateRef)} sealed a working theory</div>
      <p className="iw-checkpoint-desc">{message.content}</p>
      {openedBetId && onDescend ? (
        <div className="iw-checkpoint-actions">
          <button type="button" className="iw-checkpoint-btn" onClick={() => onDescend(`bet:${openedBetId}`)}>
            Open this work
          </button>
        </div>
      ) : null}
    </article>
  );
}
