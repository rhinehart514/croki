import { useEffect, useState, type RefObject } from "react";
import { GitBranch, X } from "lucide-react";
import {
  WORK_ATTEMPT_TARGET_EVENT,
  type WorkAttemptTarget,
} from "@/components/work-mode/workAttemptTarget";

export function useWorkAttemptTarget({
  ventureId,
  threadRef,
  setDraft,
  textareaRef,
}: {
  ventureId: string;
  threadRef: string | null | undefined;
  setDraft: (value: string | ((current: string) => string)) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [target, setTarget] = useState<WorkAttemptTarget | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<WorkAttemptTarget>).detail;
      if (!detail || detail.ventureId !== ventureId || detail.threadRef !== threadRef) return;
      setTarget(detail);
      if (detail.carriedComment) {
        const line = `Review comment from ${detail.label}: ${detail.carriedComment}`;
        setDraft((current) => current.trim() ? `${line}\n${current}` : `${line}\n`);
      }
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    };
    window.addEventListener(WORK_ATTEMPT_TARGET_EVENT, receive);
    return () => window.removeEventListener(WORK_ATTEMPT_TARGET_EVENT, receive);
  }, [setDraft, textareaRef, threadRef, ventureId]);
  const chip = target ? (
    <div className="now-composer-artifact-target" data-kind="attempt">
      <span><GitBranch aria-hidden="true" /><strong>{target.label}</strong></span>
      <small>The next turn continues this exact isolated attempt.</small>
      <button type="button" aria-label="Clear attempt target" onClick={() => setTarget(null)}><X aria-hidden="true" /></button>
    </div>
  ) : null;
  return { target, clear: () => setTarget(null), chip };
}
