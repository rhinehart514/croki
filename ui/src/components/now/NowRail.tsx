// The rail — the whole permanent navigation, and an index of continuing founder directions rather
// than a menu of product modules. A compact venture switcher, one strong New direction action, a
// restrained Needs-you count, universal search, then the founder's recent and active directions with
// quiet state markers. Automations is a secondary utility at the foot. No Now / Map / Product / Work
// doors — everything reachable is a direction or a disclosure inside one.
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronsUpDown, Plus, Search, Zap } from "lucide-react";
import type { FirmVenture } from "@/api";
import { relativeAge, type Direction, type DirectionSection } from "./directionModel";

export function NowRail({
  venture,
  ventures,
  sections,
  selectedId,
  needsYou,
  search,
  needsOnly,
  automationsOpen,
  now,
  onSearch,
  onToggleNeeds,
  onNewDirection,
  onSelectDirection,
  onSwitchVenture,
  onOpenAutomations,
}: {
  venture: FirmVenture;
  ventures: FirmVenture[];
  sections: DirectionSection[];
  selectedId: string | null;
  needsYou: number;
  search: string;
  needsOnly: boolean;
  automationsOpen: boolean;
  now: number;
  onSearch: (value: string) => void;
  onToggleNeeds: () => void;
  onNewDirection: () => void;
  onSelectDirection: (direction: Direction) => void;
  onSwitchVenture: (venture: FirmVenture) => void;
  onOpenAutomations: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ventureRef = useRef<HTMLDivElement | null>(null);
  const others = ventures.filter((entry) => entry.id !== venture.id);
  const repo = venture.repository.replace(/^https?:\/\/(www\.)?/, "");

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!ventureRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <nav className="now-rail" aria-label="Directions">
      <div className="now-rail-venture" ref={ventureRef}>
        <button
          type="button"
          className="now-rail-venture-btn"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          disabled={others.length === 0}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="now-rail-venture-glyph" aria-hidden="true">{venture.name.charAt(0).toUpperCase()}</span>
          <span className="now-rail-venture-meta">
            <span className="now-rail-venture-name">{venture.name}</span>
            <span className="now-rail-venture-repo" title={venture.repository}>{repo}</span>
          </span>
          {others.length ? <ChevronsUpDown aria-hidden="true" /> : null}
        </button>
        {menuOpen && others.length ? (
          <div className="now-rail-venture-menu" role="menu">
            <button type="button" role="menuitemradio" aria-current="true" onClick={() => setMenuOpen(false)}>
              {venture.name}
            </button>
            {others.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="menuitemradio"
                aria-current="false"
                onClick={() => { setMenuOpen(false); onSwitchVenture(entry); }}
              >
                {entry.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button type="button" className="now-rail-new" onClick={onNewDirection}>
        <Plus aria-hidden="true" /> New direction
      </button>

      <div className="now-rail-quick">
        <button
          type="button"
          className="now-rail-needs"
          aria-pressed={needsOnly}
          data-attention={needsYou > 0 ? "true" : undefined}
          onClick={onToggleNeeds}
        >
          <Bell aria-hidden="true" /> Needs you
          {needsYou > 0 ? <span className="now-rail-needs-count">{needsYou}</span> : null}
        </button>
      </div>

      <div className="now-rail-search">
        <Search aria-hidden="true" />
        <label className="sr-only" htmlFor="now-search">Search directions</label>
        <input
          id="now-search"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search"
        />
      </div>

      <div className="now-rail-list">
        {sections.length === 0 ? (
          <div className="now-rail-group">
            <span className="now-rail-group-label">{search || needsOnly ? "Nothing matches" : "No directions yet"}</span>
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.key}>
              <div className="now-rail-group">
                <span className="now-rail-group-label">{section.label}</span>
              </div>
              {section.directions.map((direction) => (
                <button
                  key={direction.id}
                  type="button"
                  className="now-rail-dir"
                  data-state={direction.state}
                  aria-current={direction.id === selectedId}
                  onClick={() => onSelectDirection(direction)}
                >
                  <span className="now-rail-dir-mark" aria-hidden="true" />
                  <span className="now-rail-dir-title">{direction.sentence}</span>
                  <span className="now-rail-dir-age">{relativeAge(direction.updatedAt, now)}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="now-rail-foot">
        <button type="button" className="now-rail-auto" aria-current={automationsOpen} onClick={onOpenAutomations}>
          <Zap aria-hidden="true" /> Automations
        </button>
      </div>
    </nav>
  );
}
