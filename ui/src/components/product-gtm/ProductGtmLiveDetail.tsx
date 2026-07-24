import { useState } from "react";
import { Check, CircleDot, FileSearch, LoaderCircle } from "lucide-react";
import { useWorkDeltaStream } from "@/hooks/useFirmEventStream";
import { applyWorkDelta, emptyLiveDetail, formatLiveDuration, type LiveDetailState } from "./liveWorkDetail";

// Reshape decision 28: live detail renders only on the focused node — step labels, measured durations, and
// status, never chain-of-thought or raw model prose. Mounted only for the focused node while it is running,
// so the subscription exists nowhere else; nothing animates ambiently across the canvas.
export function ProductGtmLiveDetail({ ventureId, threadRef, detail }: {
  ventureId: string;
  threadRef: string;
  detail?: string;
}) {
  const [state, setState] = useState<LiveDetailState>(emptyLiveDetail);
  const [subject, setSubject] = useState(threadRef);
  // Reset during render (never in an effect) when the focused subject changes, so one node never inherits
  // another node's live steps.
  if (subject !== threadRef) {
    setSubject(threadRef);
    setState(emptyLiveDetail);
  }
  useWorkDeltaStream(ventureId, { threadRef }, (delta) => setState((current) => applyWorkDelta(current, delta)));
  return (
    <div className="product-gtm-live-detail">
      {detail ? <p>{detail}</p> : null}
      {state.status ? <p className="product-gtm-live-status" role="status">{state.status}</p> : null}
      {state.steps.length ? (
        <ol className="product-gtm-live-steps" aria-label="Live work activity">
          {state.steps.map((step) => (
            <li key={step.key} data-state={step.state} data-kind={step.kind}>
              {step.state === "running"
                ? <LoaderCircle className="is-spinner" aria-hidden="true" />
                : step.kind === "source"
                  ? <FileSearch aria-hidden="true" />
                  : step.status && step.status !== "ok"
                    ? <CircleDot aria-hidden="true" />
                    : <Check aria-hidden="true" />}
              <span>{step.label}</span>
              {step.state === "done" && step.kind === "step"
                ? <em>{formatLiveDuration(step.durationMs) ?? (step.status && step.status !== "ok" ? step.status : "done")}</em>
                : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="product-gtm-live-empty">Watching for live steps. Nothing has reported yet.</p>
      )}
    </div>
  );
}
