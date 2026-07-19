// The stable left edge of the founder workspace. Like T3 Code's project/thread sidebar, this is a
// compact, resizable index of addressable work. It never hosts the work narrative itself: selecting a
// direction restores that work in the center, while this surface stays a quiet place to switch scope,
// notice status, stop a run, and reach venture configuration.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Bell,
  ChevronsUpDown,
  Plus,
  Search,
  SquarePen,
} from "lucide-react";
import type { FirmVenture } from "@/api";
import type { FirmConversationMessage, FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { conversationBetIds, focusedConversationMessages } from "@/components/firm/conversationProjection";
import type { Direction } from "@/components/now/directionModel";
import type { FirmActiveWork } from "@/components/firm/ActiveWorkReceipt";
import { FirmSettings } from "@/components/firm/FirmSettings";
import { VentureCreateDialog } from "@/components/firm/VentureCreateDialog";
import { WorkspaceIndexFooter } from "./WorkspaceIndexParts";
import { WorkspaceOutline } from "./WorkspaceOutline";
import type { OutlineObjectNode, VentureOutline } from "./ventureOutlineModel";
import { MAX_INDEX_WIDTH, MIN_INDEX_WIDTH, useWorkspaceIndexWidth } from "./useWorkspaceIndexWidth";
import "./workspace-index.css";

type WorkspaceIndexProps = {
  venture: FirmVenture;
  ventures: FirmVenture[];
  lens: FirmLens | null;
  messages: FirmConversationMessage[];
  outline: VentureOutline;
  workState: "loading" | "ready" | "failed";
  workError: string | null;
  selection: CanvasSelection;
  selectedDirectionId: string | null;
  selectedObjectId: string | null;
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
  onSelectObject: (object: OutlineObjectNode) => void;
  onSwitchVenture: (venture: FirmVenture) => void;
  onClearScope: () => void;
  onStopActiveWork: (workId: string) => void | Promise<void>;
  onConfigurationChanged: () => void;
  onRetry: () => void;
};

export function WorkspaceIndex({
  venture,
  ventures,
  lens,
  messages,
  outline,
  workState,
  workError,
  selection,
  selectedDirectionId,
  selectedObjectId,
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
  onSelectObject,
  onSwitchVenture,
  onClearScope,
  onStopActiveWork,
  onConfigurationChanged,
  onRetry,
}: WorkspaceIndexProps) {
  const [ventureMenuOpen, setVentureMenuOpen] = useState(false);
  const [ventureCreateOpen, setVentureCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ventureMenuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const { indexWidth, beginResize, resizeWithKeyboard } = useWorkspaceIndexWidth();
  const otherVentures = ventures.filter((candidate) => candidate.id !== venture.id);
  const repository = venture.repository.replace(/^https?:\/\/(www\.)?/, "");
  const scopedBetIds = lens ? conversationBetIds(lens, selection) : selection?.betId ? [selection.betId] : [];
  const scopedMessages = selection && lens
    ? focusedConversationMessages(messages, lens, selection, new Set(scopedBetIds))
    : messages;

  useEffect(() => {
    if (!ventureMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!ventureMenuRef.current?.contains(event.target as Node)) setVentureMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [ventureMenuOpen]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <aside
      className="vw-index"
      aria-label={`${venture.name} work`}
      style={{ "--vw-index-width": `${indexWidth}px` } as CSSProperties}
    >
      <div className="vw-index-chrome" aria-hidden="true">
        <span className="vw-index-mark">D</span>
        <span>Drover</span>
      </div>

      <div className="vw-index-actions">
        <label className="vw-index-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search work</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search"
          />
          <kbd aria-hidden="true">⌘K</kbd>
        </label>
        <button
          type="button"
          className="vw-index-quick"
          aria-pressed={needsOnly}
          data-attention={needsYou > 0 ? "true" : undefined}
          onClick={onToggleNeeds}
        >
          <Bell aria-hidden="true" />
          <span>Needs you</span>
          {needsYou > 0 ? <span className="vw-index-count">{needsYou}</span> : null}
        </button>
      </div>

      <div className="vw-index-project" ref={ventureMenuRef}>
        <div className="vw-index-project-row">
          <button
            type="button"
            className="vw-index-project-switcher"
            aria-expanded={ventureMenuOpen}
            aria-haspopup="menu"
            onClick={() => setVentureMenuOpen((open) => !open)}
          >
            <span className="vw-index-venture-glyph" aria-hidden="true">
              {venture.name.charAt(0).toUpperCase()}
            </span>
            <span className="vw-index-project-copy">
              <strong>{venture.name}</strong>
              <small title={venture.repository}>{repository}</small>
            </span>
            <ChevronsUpDown aria-hidden="true" />
          </button>
          <button type="button" className="vw-index-icon-action" onClick={onNewDirection} aria-label="New direction">
            <SquarePen aria-hidden="true" />
          </button>
        </div>

        {ventureMenuOpen ? (
          <div className="vw-index-venture-menu" role="menu">
            <button type="button" role="menuitemradio" aria-checked="true" onClick={() => setVentureMenuOpen(false)}>
              <span className="vw-index-venture-glyph" aria-hidden="true">{venture.name.charAt(0).toUpperCase()}</span>
              {venture.name}
            </button>
            {otherVentures.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                role="menuitemradio"
                aria-checked="false"
                onClick={() => {
                  setVentureMenuOpen(false);
                  onSwitchVenture(candidate);
                }}
              >
                <span className="vw-index-venture-glyph" aria-hidden="true">{candidate.name.charAt(0).toUpperCase()}</span>
                {candidate.name}
              </button>
            ))}
            <div className="vw-index-venture-menu-separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setVentureMenuOpen(false);
                setVentureCreateOpen(true);
              }}
            >
              <Plus aria-hidden="true" />
              Start another venture
            </button>
          </div>
        ) : null}
      </div>

      <WorkspaceOutline
        outline={outline}
        state={workState}
        error={workError}
        search={search}
        needsOnly={needsOnly}
        selectedObjectId={selectedObjectId}
        selectedDirectionId={selectedDirectionId}
        now={now}
        onSelectObject={onSelectObject}
        onSelectDirection={onSelectDirection}
        onRetry={onRetry}
      />

      <WorkspaceIndexFooter
        lens={lens}
        activeWork={activeWork}
        readOnly={readOnly}
        scoped={Boolean(selection || selectedDirectionId)}
        conversationCount={scopedMessages.length}
        onClearScope={onClearScope}
        onStopActiveWork={onStopActiveWork}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div
        className="vw-index-resizer"
        role="separator"
        aria-label="Resize work index"
        aria-orientation="vertical"
        aria-valuemin={MIN_INDEX_WIDTH}
        aria-valuemax={MAX_INDEX_WIDTH}
        aria-valuenow={indexWidth}
        tabIndex={0}
        onPointerDown={beginResize}
        onKeyDown={resizeWithKeyboard}
      />

      {settingsOpen ? (
        <FirmSettings
          venture={venture}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          onCapabilitiesChanged={onConfigurationChanged}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {ventureCreateOpen ? (
        <VentureCreateDialog
          ventures={ventures}
          onCreated={onSwitchVenture}
          onClose={() => setVentureCreateOpen(false)}
        />
      ) : null}
    </aside>
  );
}
