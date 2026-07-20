import { useCallback, useState } from "react";
import type { WorkIndexItem } from "@/api";
import type { FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { NowComposer } from "@/components/now/NowComposer";
import { WorkComposerBar, type WorkModelChoice } from "@/components/work-mode/WorkComposerBar";

export function ThreadComposer({ ventureId, ventureName, repository, surface = "context", item, lens, draft, isHome, readOnly, readOnlyReason, subjectRefs = [], scopeLabel, onDriven }: {
  ventureId: string; ventureName: string; item: WorkIndexItem | null; lens: FirmLens | null; draft: boolean; isHome: boolean;
  repository?: string; surface?: "work" | "context"; readOnly: boolean; readOnlyReason: string | null; subjectRefs?: string[]; scopeLabel?: string | null; onDriven: () => void;
}) {
  const [modelChoice, setModelChoice] = useState<WorkModelChoice>({ runtime: null, model: null });
  const chooseModel = useCallback((choice: WorkModelChoice) => setModelChoice((current) => current.runtime === choice.runtime && current.model === choice.model ? current : choice), []);
  const betId = item?.subjectRefs.find((ref) => ref.startsWith("bet:"))?.replace(/^bet:/, "") ?? null;
  const selection: CanvasSelection = item && !isHome ? { betId, workRef: null, teammateRefs: [], ...(item.threadRef.startsWith("thread:legacy-") ? {} : { threadRef: item.threadRef }) } : null;
  const threadKey = item?.threadRef ?? (subjectRefs.length ? `subjects:${subjectRefs.join("|")}` : "draft");
  const controls = surface === "work" && repository ? <WorkComposerBar key={threadKey} ventureId={ventureId} threadKey={threadKey} repository={repository} disabled={readOnly} onChange={chooseModel} /> : null;
  const placeholder = surface === "work" ? draft || isHome ? "Describe what you want to build…" : "Ask for a change…" : draft || isHome ? "Ask Drover…" : "Continue this thread…";
  return <div className="thread-composer"><NowComposer ventureId={ventureId} ventureName={ventureName} selection={selection} subjectRefs={subjectRefs} scopeLabel={scopeLabel ?? (draft || isHome ? null : item?.founderIntent ?? null)} hasWork={Boolean(lens?.bets.length)} variant="dock" submissionMode={surface === "work" ? "work" : "conversation"} readOnly={readOnly} readOnlyReason={readOnlyReason} autoFocus={draft} placeholder={placeholder} runtimeOverride={modelChoice.runtime} modelOverride={modelChoice.model} composerControls={controls} onDriven={onDriven} /></div>;
}
