// The summonable glass thread (architecture §1, redesign §3/§7). The linear transcript is NEVER a
// structural column — it collapses to a glass pill (latest line + count) that the founder pulls up into a
// translucent ribbon over the world and dismisses. Built on Base UI Dialog in non-modal mode so the world
// behind it stays live (the ribbon floats, it does not trap). `/` summons it globally; the pill toggles
// it. Checkpoints (handoffs) render as sealed CheckpointCards inline; everything else is a flat receipt
// row — never a chat bubble.
import { useEffect, useMemo } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { FirmConversationMessage } from "@/types";
import { crewName, isCheckpoint } from "./conversationModel";
import { CheckpointCard } from "./CheckpointCard";
import { useShellState } from "../state/shellState";

export function SummonableThread({
  conversation,
  onDescend,
}: {
  conversation: FirmConversationMessage[];
  onDescend?: (nodeId: string) => void;
}) {
  const { threadOpen, setThreadOpen } = useShellState();

  // `/` summons the thread from anywhere except while typing in a field (the composer owns `/` there).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const active = document.activeElement;
      const typing = active instanceof HTMLElement
        && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
      if (typing) return;
      event.preventDefault();
      setThreadOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setThreadOpen]);

  const latest = conversation[conversation.length - 1] ?? null;
  const latestLine = latest ? `${crewName(latest.teammateRef)} · ${latest.content}` : "The firm is standing by";

  const rows = useMemo(() => conversation.slice(-40), [conversation]);

  return (
    <Dialog.Root open={threadOpen} onOpenChange={setThreadOpen} modal={false}>
      {/* The collapsed pill — always glanceable, never a column. */}
      <Dialog.Trigger
        className="iw-thread-pill"
        aria-label="Open the conversation with your venture"
      >
        <span className="iw-thread-pill-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span className="iw-thread-pill-line">{latestLine}</span>
        <span className="iw-thread-pill-count">{conversation.length}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Popup className="iw-thread-ribbon" aria-label="Conversation with your venture">
          <header className="iw-thread-head">
            <Dialog.Title className="iw-thread-title">Conversation with your venture</Dialog.Title>
            <Dialog.Close className="iw-thread-close" aria-label="Dismiss the conversation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </Dialog.Close>
          </header>
          <ol className="iw-thread-list">
            {rows.length ? rows.map((message: FirmConversationMessage) => {
              if (isCheckpoint(message)) {
                return (
                  <li key={message.id} className="iw-thread-checkpoint">
                    <CheckpointCard message={message} onDescend={onDescend} />
                  </li>
                );
              }
              const founder = message.role === "founder";
              return (
                <li key={message.id} className="iw-thread-row" data-founder={founder ? "true" : "false"}>
                  {founder ? (
                    <span className="iw-thread-founder">{message.content}</span>
                  ) : (
                    <>
                      <span className="iw-thread-crew">{crewName(message.teammateRef)}</span>
                      <span className="iw-thread-line">{message.content}</span>
                    </>
                  )}
                </li>
              );
            }) : (
              <li className="iw-thread-empty">Say what you want in the composer, and the crew starts a working theory.</li>
            )}
          </ol>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
