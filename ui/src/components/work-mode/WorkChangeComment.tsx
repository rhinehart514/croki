import { useEffect, useRef, useState } from "react";
import { Link2, MessageSquarePlus } from "lucide-react";
import {
  addCodingReviewComment,
  replyInConversation,
  type CodingWorkspace,
} from "@/api";
import {
  addComposerSourceReference,
} from "@/components/now/composerSourceReference";
import type { DiffLineSelection } from "@/components/review/DiffView";

function basename(path: string) {
  const cut = path.lastIndexOf("/");
  return cut >= 0 ? path.slice(cut + 1) : path;
}

function exactRef(workspaceId: string, line: DiffLineSelection) {
  return `diff:${workspaceId}:${line.path}#L${line.line}:${line.side}`;
}

export function WorkChangeComment({
  workspace,
  line,
  sourceScopeKey,
  readOnlyReason,
  onSteered,
}: {
  workspace: CodingWorkspace;
  line: DiffLineSelection | null;
  sourceScopeKey: string;
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

  if (!line) {
    return <p className="work-change-comment-held">Select a line number to reference or correct that exact line.</p>;
  }
  const checkpoint = workspace.checkpoints.at(-1);
  const sourceRef = exactRef(workspace.id, line);
  const label = `${basename(line.path)}:${line.line}`;

  const reference = () => addComposerSourceReference({
    scopeKey: sourceScopeKey,
    path: line.path,
    startLine: line.line,
    endLine: line.line,
    ref: sourceRef,
  });

  const send = async () => {
    const body = comment.trim();
    if (!body || sending || !checkpoint) return;
    setSending(true);
    setError(null);
    try {
      const reply = await replyInConversation(workspace.ventureId, {
        message: `Review correction for \`${line.path}:${line.line}\` (${line.side}):\n\n${body}`,
        threadRef: workspace.threadRef,
        betId: workspace.betId,
        workRef: workspace.id,
        mode: "work",
      });
      const rawMessageRef = reply.messageId ?? null;
      await addCodingReviewComment(workspace.ventureId, workspace.id, {
        checkpointId: checkpoint.id,
        path: line.path,
        startLine: line.line,
        endLine: line.line,
        selectedText: line.selectedText,
        sourceRef,
        body,
        messageRef: rawMessageRef
          ? `conversation:${String(rawMessageRef).replace(/^conversation:/, "")}`
          : null,
      });
      setComment("");
      setOpen(false);
      onSteered();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Croki could not attach that exact review correction.");
    } finally {
      setSending(false);
    }
  };

  if (readOnlyReason) {
    return <p className="work-change-comment-held" role="status">{readOnlyReason}</p>;
  }

  if (!open) {
    return <div className="work-change-comment-entry">
      <button type="button" className="work-change-comment-open" onClick={() => setOpen(true)}>
        <MessageSquarePlus aria-hidden="true" />
        <span>Comment on {label}</span>
      </button>
      <button type="button" className="work-change-comment-open" onClick={reference}>
        <Link2 aria-hidden="true" />
        <span>Reference {label}</span>
      </button>
    </div>;
  }

  return (
    <div className="work-change-comment">
      <strong>Correction on {label}</strong>
      <textarea
        ref={textareaRef}
        value={comment}
        rows={2}
        placeholder={`What should change at ${label}?`}
        onChange={(event) => { setComment(event.target.value); setError(null); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); setComment(""); setError(null); }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); }
        }}
      />
      <div className="work-change-comment-foot">
        <small>The correction continues this exact attempt and remains attached to this checkpoint.</small>
        <div className="work-change-comment-actions">
          <button type="button" className="work-change-comment-cancel" onClick={() => { setOpen(false); setComment(""); setError(null); }}>Cancel</button>
          <button type="button" className="work-change-comment-send" onClick={() => void send()} disabled={sending || !comment.trim() || !checkpoint}>
            {sending ? "Sending…" : "Send correction"}
          </button>
        </div>
      </div>
      {error ? <p className="work-change-comment-error" role="alert">{error}</p> : null}
    </div>
  );
}
