// The direction composer — the primary object in the product. One plain-words ask starts real work.
// Scope is an attachment (the selected direction), not a mode; model/tools/agents are inferred and
// shown only as quiet provenance. Voice is equal to typing where the browser supports it. Two states:
// a centred `hero` when no direction is open, and a persistent `dock` anchored to the bottom of the
// active workspace. Freshness lives at the workspace level, never inside the field.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, ArrowUp, Mic, Paperclip, X } from "lucide-react";
import { driveTeammate, type DriveTeammateResult } from "@/api";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { readDriveReceipt, type DriveReceipt } from "./driveReceipt";
import { useSpeechInput } from "./useSpeechInput";

const EMPTY_SUGGESTIONS = [
  "Find the strongest next move",
  "Find the first 20 customers",
  "Sharpen the pitch",
  "Audit the first-run experience",
];

function scopedBody(goal: string, selection: CanvasSelection) {
  if (!selection) return { goal };
  return {
    goal,
    ...(selection.betId ? { betId: selection.betId } : {}),
    ...(selection.workRef ? { workRef: selection.workRef } : {}),
    ...(selection.architectureId && selection.architectureRevision != null
      ? { architectureTarget: { id: selection.architectureId, stepId: selection.architectureStepId ?? null, revision: selection.architectureRevision } }
      : {}),
    ...(selection.theoryId && selection.theorySubjectId
      ? { theoryTarget: { theoryId: selection.theoryId, subjectId: selection.theorySubjectId } }
      : {}),
  };
}

export function NowComposer({
  ventureId,
  ventureName,
  selection,
  scopeLabel,
  hasWork,
  variant = "hero",
  readOnly = false,
  autoFocus = false,
  placeholder: placeholderOverride,
  onClearScope,
  onDriven,
  onOpenResult,
}: {
  ventureId: string;
  ventureName: string;
  selection: CanvasSelection;
  scopeLabel: string | null;
  hasWork: boolean;
  variant?: "hero" | "dock";
  readOnly?: boolean;
  autoFocus?: boolean;
  // Optional placeholder override. The default (below) is unchanged, so every existing mount is
  // byte-identical; the venture canvas passes the spec's "Direct the venture".
  placeholder?: string;
  onClearScope?: () => void;
  onDriven?: (result: DriveTeammateResult) => void;
  // When provided (the home composer), the receipt offers a way into the direction the drive produced.
  onOpenResult?: (targetBetId: string | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DriveReceipt | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const speech = useSpeechInput((text) => {
    setDraft((current) => (current ? `${current} ${text}` : text));
    textareaRef.current?.focus();
  });

  useEffect(() => { if (autoFocus) textareaRef.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [draft]);

  const placeholder = placeholderOverride
    ?? (scopeLabel
      ? `Steer this direction — try another angle, send it, refine…`
      : `What should Drover accomplish for ${ventureName}?`);

  const submit = async (value: string) => {
    const goal = value.trim();
    if (!goal || busy || readOnly) return;
    setBusy(true); setError(null); setReceipt(null); setDraft("");
    try {
      const response = await driveTeammate(ventureId, scopedBody(goal, selection));
      setReceipt(readDriveReceipt(response));
      onDriven?.(response);
    } catch (cause) {
      setDraft(goal);
      setError(cause instanceof Error ? cause.message : "Drover could not take that direction.");
    } finally { setBusy(false); }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit(draft);
    }
  };

  const showChips = variant === "hero" && !hasWork && !busy && !scopeLabel;

  return (
    <section className="now-composer" data-variant={variant} data-busy={busy ? "true" : "false"} aria-label="Direct this venture">
      <div className="now-composer-shell">
        {scopeLabel ? (
          <span className="now-composer-scope">
            {scopeLabel}
            {onClearScope ? (
              <button type="button" aria-label="Clear scope — direct the whole venture" onClick={onClearScope}>
                <X aria-hidden="true" style={{ width: 13, height: 13 }} />
              </button>
            ) : null}
          </span>
        ) : null}
        <form className="now-composer-field" onSubmit={(event) => { event.preventDefault(); void submit(draft); }}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setError(null); setReceipt(null); }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Say what you want for this venture"
            disabled={readOnly}
          />
          <div className="now-composer-tools">
            <button type="button" className="now-icon-btn" aria-label="Attach context" disabled title="Attach context (coming soon)">
              <Paperclip aria-hidden="true" />
            </button>
            {speech.supported ? (
              <button
                type="button"
                className="now-icon-btn"
                data-recording={speech.recording ? "true" : undefined}
                aria-label={speech.recording ? "Stop dictation" : "Speak your direction"}
                aria-pressed={speech.recording}
                onClick={speech.toggle}
                disabled={readOnly}
              >
                <Mic aria-hidden="true" />
              </button>
            ) : null}
            <button type="submit" className="now-composer-send" aria-label="Start work" disabled={busy || readOnly || !draft.trim()}>
              <ArrowUp aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>

      <div className="now-composer-provenance" aria-hidden="true">
        Drover picks the agents, model, and tools. Nothing leaves without your decision.
      </div>

      {showChips ? (
        <div className="now-composer-chips">
          {EMPTY_SUGGESTIONS.map((intent) => (
            <button key={intent} type="button" className="now-chip" onClick={() => void submit(intent)} disabled={readOnly}>
              {intent}
            </button>
          ))}
        </div>
      ) : null}

      <div className="now-composer-feedback" aria-live="polite">
        {speech.recording ? <span role="status">Listening…</span> : null}
        {busy ? <span role="status">Starting work…</span> : null}
        {error ? <span role="alert">{error}</span> : null}
      </div>

      {receipt ? (
        <div className="now-drive-receipt" data-waiting={receipt.waiting ? "true" : "false"} role="status">
          <div className="now-drive-receipt-body">
            <span className="now-drive-receipt-headline">{receipt.headline}</span>
            {receipt.detail ? <span className="now-drive-receipt-detail">{receipt.detail}</span> : null}
          </div>
          {onOpenResult && receipt.targetBetId ? (
            <button type="button" className="now-drive-receipt-open" onClick={() => onOpenResult(receipt.targetBetId)}>
              {receipt.waiting ? "Make the decision" : "Open this direction"}
              <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
