import { ArrowUp, LoaderCircle, Mic, Square } from "lucide-react";

export function ComposerRunControls({
  speechSupported, recording, busy, readOnly, stoppable, draftReady, morphToStop, stopRequested,
  submissionMode, route, onToggleVoice, onInterrupt,
}: {
  speechSupported: boolean;
  recording: boolean;
  busy: boolean;
  readOnly: boolean;
  stoppable: boolean;
  draftReady: boolean;
  morphToStop: boolean;
  stopRequested: boolean;
  submissionMode: "auto" | "conversation" | "work";
  route: string;
  onToggleVoice: () => void;
  onInterrupt: () => void;
}) {
  const stopLabel = stopRequested ? "Stopping at the next safe point" : "Stop the current step";
  const sendLabel = busy
    ? "Working"
    : submissionMode === "conversation" || submissionMode === "work"
      ? "Send to this thread"
      : route === "steer"
        ? "Send to this direction"
        : route === "correct"
          ? "Correct this work"
          : "Start work";

  return (
    <>
      {speechSupported ? (
        <button type="button" className="now-icon-btn" data-recording={recording ? "true" : undefined}
          aria-label={recording ? "Stop dictation" : "Speak your direction"} aria-pressed={recording}
          title={recording ? "Stop listening" : "Speak into this draft"}
          onClick={onToggleVoice} disabled={readOnly || busy}>
          <Mic aria-hidden="true" />
        </button>
      ) : null}
      {stoppable && draftReady ? (
        <button type="button" className="now-composer-stop" data-requested={stopRequested ? "true" : undefined}
          aria-label={stopLabel}
          title={stopRequested ? stopLabel : "Stop the current step; your draft is kept so you can steer"}
          onClick={onInterrupt} disabled={stopRequested}>
          {stopRequested ? <LoaderCircle className="now-composer-spinner" aria-hidden="true" /> : <Square aria-hidden="true" />}
        </button>
      ) : null}
      {morphToStop ? (
        <button type="button" className="now-composer-send" data-stop="true"
          data-requested={stopRequested ? "true" : undefined} aria-label={stopLabel}
          title={stopRequested ? stopLabel : "Stop the current step; type to steer instead"}
          onClick={onInterrupt} disabled={stopRequested}>
          {stopRequested ? <LoaderCircle className="now-composer-spinner" aria-hidden="true" /> : <Square aria-hidden="true" />}
        </button>
      ) : (
        <button type="submit" className="now-composer-send" aria-label={sendLabel}
          disabled={busy || readOnly || !draftReady}>
          {busy ? <LoaderCircle className="now-composer-spinner" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
        </button>
      )}
    </>
  );
}
