// WorkspaceIndex — the left frame of the venture workspace. It ORGANISES ATTENTION; it is not a second
// venture tree (Exp Law 1). Two stacked, reused parts:
//   1. NowRail — the same venture switcher + universal search + Needs-you attention count + the folded
//      index of active directions, recent runs, and the decisions that require the founder.
//   2. ConversationFeed — the one venture conversation, scoped to the current selection so the branch of
//      the focused canvas object surfaces here without a details-page detour (Exp Law 2 + 3).
// No new fold and no reinvention: the rail sections come from directionModel, the conversation branch
// from focusedConversationMessages. This file only lays the two out as one calm index.

import type { FirmVenture } from "@/api";
import type { FirmConversationMessage, FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import type { Direction, DirectionSection } from "@/components/now/directionModel";
import type { FirmActiveWork } from "@/components/firm/ActiveWorkReceipt";
import { NowRail } from "@/components/now/NowRail";
import { ConversationFeed } from "@/components/firm/ConversationFeed";

export function WorkspaceIndex({
  venture,
  ventures,
  lens,
  messages,
  sections,
  selection,
  selectedDirectionId,
  needsYou,
  search,
  needsOnly,
  now,
  activeWork,
  readOnly,
  readOnlyReason,
  onSearch,
  onToggleNeeds,
  onNewDirection,
  onSelectDirection,
  onSwitchVenture,
  onSelectBet,
  onClearScope,
  onStopActiveWork,
  onConfigurationChanged,
  onOpenWall,
}: {
  venture: FirmVenture;
  ventures: FirmVenture[];
  lens: FirmLens | null;
  messages: FirmConversationMessage[];
  sections: DirectionSection[];
  selection: CanvasSelection;
  selectedDirectionId: string | null;
  needsYou: number;
  search: string;
  needsOnly: boolean;
  now: number;
  activeWork: readonly FirmActiveWork[];
  readOnly: boolean;
  readOnlyReason: string;
  onSearch: (value: string) => void;
  onToggleNeeds: () => void;
  onNewDirection: () => void;
  onSelectDirection: (direction: Direction) => void;
  onSwitchVenture: (venture: FirmVenture) => void;
  onSelectBet: (betId: string) => void;
  onClearScope: () => void;
  onStopActiveWork: (workId: string) => void | Promise<void>;
  onConfigurationChanged: () => void;
  onOpenWall: () => void;
}) {
  return (
    <div className="vw-index">
      <NowRail
        venture={venture}
        ventures={ventures}
        sections={sections}
        selectedId={selectedDirectionId}
        needsYou={needsYou}
        search={search}
        needsOnly={needsOnly}
        now={now}
        onSearch={onSearch}
        onToggleNeeds={onToggleNeeds}
        onNewDirection={onNewDirection}
        onSelectDirection={onSelectDirection}
        onSwitchVenture={onSwitchVenture}
      />
      <div className="vw-conversation" data-scoped={selection ? "true" : "false"}>
        <div className="vw-conversation-head">
          <span className="vw-conversation-title">
            {selection ? "This focus" : "Venture conversation"}
          </span>
          {selection ? (
            <button type="button" className="vw-conversation-broaden" onClick={onClearScope}>
              Whole venture
            </button>
          ) : null}
        </div>
        <div className="vw-conversation-scroll">
          {lens ? (
            <ConversationFeed
              lens={lens}
              messages={messages}
              selection={selection}
              driving={null}
              activeWork={activeWork}
              onStopActiveWork={onStopActiveWork}
              onSelectBet={onSelectBet}
              onOpenWall={onOpenWall}
              onConfigurationChanged={onConfigurationChanged}
              readOnly={readOnly}
              readOnlyReason={readOnlyReason}
            />
          ) : (
            <div className="vw-conversation-empty" role="status">Opening {venture.name}…</div>
          )}
        </div>
      </div>
    </div>
  );
}
