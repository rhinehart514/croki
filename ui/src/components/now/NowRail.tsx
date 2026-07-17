// The rail — the whole permanent navigation. New work is the one loud action; Now, Needs you, Map, and
// Automations are the only destinations. Everything else (agents, evidence, settings, decisions) is a
// scope or a disclosure reached from the work itself, not a fixed door. Ventures switch here; search
// reaches everything.
import { Bell, Home, Plus, Search, Zap } from "lucide-react";
import type { FirmVenture } from "@/api";
import type { NowView } from "./NowShell";

export function NowRail({
  venture,
  ventures,
  view,
  needsYou,
  search,
  onSearch,
  onNewWork,
  onNavigate,
  onSwitchVenture,
}: {
  venture: FirmVenture;
  ventures: FirmVenture[];
  view: NowView;
  needsYou: number;
  search: string;
  onSearch: (value: string) => void;
  onNewWork: () => void;
  onNavigate: (view: NowView) => void;
  onSwitchVenture: (venture: FirmVenture) => void;
}) {
  const others = ventures.filter((entry) => entry.id !== venture.id);
  const repo = venture.repository.replace(/^https?:\/\/(www\.)?/, "");

  return (
    <nav className="now-rail" aria-label="Venture navigation">
      <div className="now-rail-venture">
        <span className="now-rail-name">{venture.name}</span>
        <span className="now-rail-repo" title={venture.repository}>{repo}</span>
      </div>

      <button type="button" className="now-rail-new" onClick={onNewWork}>
        <Plus aria-hidden="true" /> New work
      </button>

      <div className="now-rail-nav">
        <button type="button" className="now-nav-item" aria-current={view === "now"} onClick={() => onNavigate("now")}>
          <Home aria-hidden="true" /> Now
        </button>
        <button type="button" className="now-nav-item" aria-current={view === "needs"} onClick={() => onNavigate("needs")}>
          <Bell aria-hidden="true" /> Needs you
          {needsYou > 0 ? <span className="now-nav-badge" aria-label={`${needsYou} waiting`}>{needsYou}</span> : null}
        </button>
        <button type="button" className="now-nav-item" aria-current={view === "automations"} onClick={() => onNavigate("automations")}>
          <Zap aria-hidden="true" /> Automations
        </button>
      </div>

      {others.length ? (
        <div className="now-rail-ventures">
          <div className="now-rail-heading">Ventures</div>
          <div className="now-rail-nav">
            {others.map((entry) => (
              <button key={entry.id} type="button" className="now-nav-item" onClick={() => onSwitchVenture(entry)}>
                {entry.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="now-rail-search">
        <label className="sr-only" htmlFor="now-search">Search this venture</label>
        <div style={{ position: "relative" }}>
          <Search aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-5-warm)", pointerEvents: "none" }} />
          <input
            id="now-search"
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search"
            style={{ paddingLeft: 30 }}
          />
        </div>
      </div>
    </nav>
  );
}
