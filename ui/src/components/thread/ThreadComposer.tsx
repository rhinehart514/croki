import type { WorkIndexItem } from "@/api";
import type { FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { NowComposer } from "@/components/now/NowComposer";

export function ThreadComposer({ ventureId, ventureName, item, lens, draft, isHome, readOnly, readOnlyReason, subjectRefs = [], onDriven }: {
  ventureId: string; ventureName: string; item: WorkIndexItem | null; lens: FirmLens | null; draft: boolean; isHome: boolean;
  readOnly: boolean; readOnlyReason: string | null; subjectRefs?: string[]; onDriven: () => void;
}) {
  const betId = item?.subjectRefs.find((ref) => ref.startsWith("bet:"))?.replace(/^bet:/, "") ?? null;
  const selection: CanvasSelection = item && !isHome ? { betId, workRef: null, teammateRefs: [], ...(item.threadRef.startsWith("thread:legacy-") ? {} : { threadRef: item.threadRef }) } : null;
  return <div className="thread-composer"><NowComposer ventureId={ventureId} ventureName={ventureName} selection={selection} subjectRefs={subjectRefs} scopeLabel={draft || isHome ? null : item?.founderIntent ?? null} hasWork={Boolean(lens?.bets.length)} variant="dock" submissionMode="conversation" readOnly={readOnly} readOnlyReason={readOnlyReason} autoFocus={draft} placeholder={draft || isHome ? "Ask Drover…" : "Continue this thread…"} onDriven={onDriven} /></div>;
}
