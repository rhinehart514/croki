import { LoaderCircle, MessageSquare, Settings, Square } from "lucide-react";
import type { FirmLens } from "@/types";
import type { FirmActiveWork } from "@/components/firm/ActiveWorkReceipt";

export function WorkspaceIndexFooter({
  lens,
  activeWork,
  readOnly,
  scoped,
  conversationCount,
  onClearScope,
  onStopActiveWork,
  onOpenSettings,
}: {
  lens: FirmLens | null;
  activeWork: readonly FirmActiveWork[];
  readOnly: boolean;
  scoped: boolean;
  conversationCount: number;
  onClearScope: () => void;
  onStopActiveWork: (workId: string) => void | Promise<void>;
  onOpenSettings: () => void;
}) {
  return (
    <div className="vw-index-footer">
      {activeWork.length ? (
        <div className="vw-index-active" aria-label="Active work">
          {activeWork.map((work) => {
            const bet = work.betId ? lens?.bets.find((candidate) => candidate.id === work.betId) : null;
            return (
              <div className="vw-index-active-row" key={work.id}>
                <LoaderCircle aria-hidden="true" />
                <span title={bet?.intent ?? "Work in progress"}>{bet?.intent ?? "Work in progress"}</span>
                {work.abortSupported ? (
                  <button
                    type="button"
                    onClick={() => void onStopActiveWork(work.id)}
                    disabled={readOnly || Boolean(work.abortRequestedAt)}
                    aria-label={`Stop ${bet?.intent ?? "current work"}`}
                  >
                    <Square aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="vw-index-context" data-scoped={scoped ? "true" : undefined}>
        <MessageSquare aria-hidden="true" />
        <span>{scoped ? "Work conversation" : "Venture conversation"}</span>
        <small>{conversationCount}</small>
        {scoped ? <button type="button" onClick={onClearScope}>Whole venture</button> : null}
      </div>

      <button type="button" className="vw-index-settings" onClick={onOpenSettings}>
        <Settings aria-hidden="true" />
        <span>Settings</span>
      </button>
    </div>
  );
}
