import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { replyInConversation, type CodingWorkspace } from "@/api";

function basename(path: string) {
  const cut = path.lastIndexOf("/");
  return cut >= 0 ? path.slice(cut + 1) : path;
}

/**
 * Anchor a written comment to the file open in the diff and send it as a correction into the same
 * Work Thread. When the workspace has a live drive (betId), the comment steers the current work and
 * lands on the next step; otherwise it opens the next direction. The comment is honest about that —
 * it never claims a token-level edit.
 */
export function WorkChangeComment({ workspace, path, readOnlyReason, onSteered }: {
  workspace: CodingWorkspace;
  path: string | null;
  readOnlyReason: string | null;
  onSteered: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  if (!path) return null;

  const steers = Boolean(workspace.betId);

  const send = async () => {
    const body = comment.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await replyInConversation(workspace.ventureId, {
        message: `Re \`${path}\`:\n\n${body}`,
        threadRef: workspace.threadRef,
        betId: workspace.betId,
        mode: "work",
      });
      setComment("");
      setOpen(false);
      onSteered();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Croki could not send that comment.");
    } finally {
      setSending(false);
    }
  };

  if (readOnlyReason) {
    return <p className="work-change-comment-held" role="status">{readOnlyReason}</p>;
  }

  if (!open) {
    return (
      <button type="button" className="work-change-comment-open" onClick={() => setOpen(true)}>
        <MessageSquarePlus aria-hidden="true" />
        <span>Comment on {basename(path)}</span>
      </button>
    );
  }

  return (
    <div className="work-change-comment">
      <textarea
        ref={textareaRef}
        value={comment}
        rows={2}
        placeholder={steers ? `Steer the work on ${basename(path)}…` : `Direct the next change to ${basename(path)}…`}
        onChange={(event) => { setComment(event.target.value); setError(null); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); setComment(""); setError(null); }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); }
        }}
      />
      <div className="work-change-comment-foot">
        <small>{steers ? "Lands as a correction on the next step." : "Opens the next direction in this Thread."}</small>
        <div className="work-change-comment-actions">
          <button type="button" className="work-change-comment-cancel" onClick={() => { setOpen(false); setComment(""); setError(null); }}>Cancel</button>
          <button type="button" className="work-change-comment-send" onClick={() => void send()} disabled={sending || !comment.trim()}>
            {sending ? "Sending…" : steers ? "Steer" : "Send"}
          </button>
        </div>
      </div>
      {error ? <p className="work-change-comment-error" role="alert">{error}</p> : null}
    </div>
  );
}
