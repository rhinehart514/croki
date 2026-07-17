// The single floating intent handle — bottom-center glass. One plain-words ask materializes a working
// theory on the world; a scoped ask steers the selected effort/theory. Wires straight to driveTeammate
// (api.ts:498); the body is scoped by the current CanvasSelection exactly as the legacy composer does
// (betId / workRef / architectureTarget / theoryTarget). On an empty venture it offers suggested
// intents; once there is work, it invites steering. No new endpoint — the projection poll surfaces the
// resulting bloom, which useAtlasMaterialization sequences.
import { useRef, useState, type KeyboardEvent } from "react";
import { driveTeammate, type DriveTeammateResult } from "@/api";
import type { CanvasSelection } from "@/components/firm/directionTarget";

const EMPTY_SUGGESTIONS = ["Help this venture grow", "Find the first 20 customers", "Sharpen the pitch"];

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

export function Composer({
  ventureId,
  selection,
  hasWork,
  ventureName,
  readOnly = false,
  onDriven,
}: {
  ventureId: string;
  selection: CanvasSelection;
  hasWork: boolean;
  ventureName: string;
  readOnly?: boolean;
  onDriven?: (result: DriveTeammateResult) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const placeholder = hasWork
    ? "Steer the firm — “send them”, “try another angle for outreach”…"
    : `What should change for ${ventureName}?`;

  const submit = async (value: string) => {
    const goal = value.trim();
    if (!goal || busy || readOnly) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setDraft("");
    try {
      const response = await driveTeammate(ventureId, scopedBody(goal, selection));
      setResult("Direction received. The world will show what changed.");
      onDriven?.(response);
    } catch (cause) {
      setDraft(goal);
      setError(cause instanceof Error ? cause.message : "Drover could not take that direction.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit(draft);
    }
  };

  return (
    <section className="iw-composer" data-busy={busy ? "true" : "false"} aria-label="Say what you want">
      <form
        className="iw-composer-form"
        onSubmit={(event) => { event.preventDefault(); void submit(draft); }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setError(null); setResult(null); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Say what you want for this venture"
          disabled={readOnly}
        />
        <button
          type="submit"
          className="iw-composer-send"
          aria-label="Send to the firm"
          disabled={busy || readOnly || !draft.trim()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
      {!hasWork && !busy ? (
        <div className="iw-composer-chips">
          {EMPTY_SUGGESTIONS.map((intent) => (
            <button key={intent} type="button" className="iw-chip" onClick={() => void submit(intent)} disabled={readOnly}>
              {intent}
            </button>
          ))}
        </div>
      ) : null}
      <div className="iw-composer-feedback" aria-live="polite">
        {readOnly ? <span role="status">Reconnecting before changes can be sent…</span> : null}
        {busy ? <span role="status">Drawing a working theory…</span> : null}
        {result ? <span role="status">{result}</span> : null}
        {error ? <span role="alert">{error}</span> : null}
      </div>
    </section>
  );
}
