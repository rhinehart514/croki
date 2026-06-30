import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LayoutGrid, Plus, Search } from "lucide-react";
import { Reveal } from "@/lib/motion";
import type { ChannelMeta } from "@/types";
import "@/styles/menu.css";
import "@/styles/outcome-switcher.css";

// A channel has no canonical status key, so its dot/meta derive from run signals: a pending gate
// leads (amber), then a failed last run (red), then a proven run (green), then idle.
const channelDot = (ch: ChannelMeta): string =>
  ch.pendingGates > 0 ? "var(--gap)" : ch.lastRunOk === false ? "var(--danger)" : ch.runCount > 0 ? "var(--proven)" : "var(--ghost)";
const channelMeta = (ch: ChannelMeta): string =>
  ch.pendingGates > 0 ? `${ch.pendingGates} gate${ch.pendingGates === 1 ? "" : "s"}`
    : ch.runCount > 0 ? `${ch.runCount} run${ch.runCount === 1 ? "" : "s"}` : "ready";

// The ChannelSwitcher is the breadcrumb that names the active channel and opens a flat dropdown of
// every channel in the project (channels are plain flows now — there is no separate program surface).
// A filter field appears once the list grows past a glanceable size.
export function ChannelSwitcher({
  channels, activeChannelId, onOpenChannel, onNewChannel,
  onShowOverview, overviewActive = false,
}: {
  channels: ChannelMeta[];
  activeChannelId: string | null;
  onOpenChannel: (id: string) => void;
  onNewChannel: () => void;
  // Return to the one-canvas overview of every channel. Absent → no overview affordance (a project
  // with a single channel is already one canvas, so there's nothing to zoom back out to).
  onShowOverview?: () => void;
  overviewActive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape or a click outside the switcher — the dropdown is a transient popover, not a
  // pinned panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const showFilter = channels.length > 8;
  const q = query.trim().toLowerCase();
  const channelsToShow = useMemo(
    () => channels.filter((c) => !q || c.name.toLowerCase().includes(q)),
    [channels, q],
  );

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const activeName = overviewActive ? "All pipelines" : activeChannel?.name ?? "Choose a pipeline";
  const activeDotColor = activeChannel ? channelDot(activeChannel) : "var(--ghost)";

  const pick = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="osw-root" ref={rootRef}>
      <button
        className="osw-trigger"
        onClick={() => { setOpen((v) => !v); setQuery(""); }}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch pipeline"
      >
        <span className="osw-trigger-dot" style={{ background: activeDotColor }} />
        <span className="menu-item-label">{activeName}</span>
        <ChevronDown className={`osw-trigger-chevron ${open ? "open" : ""}`} size={14} />
      </button>

      <Reveal open={open} className="menu osw-popover" role="menu" origin="top-left">
        {onShowOverview ? (
          <>
            <button
              className={`menu-item ${overviewActive ? "active" : ""}`}
              onClick={pick(onShowOverview)}
              type="button"
              role="menuitem"
              title="See every pipeline on one canvas"
            >
              <LayoutGrid className="menu-item-icon" />
              <span className="menu-item-label">All pipelines</span>
              {overviewActive ? <Check className="menu-item-check" /> : null}
            </button>
            <div className="menu-sep" role="separator" />
          </>
        ) : null}

        {showFilter ? (
          <div className="osw-filter">
            <Search size={13} />
            <input
              className="osw-filter-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a pipeline…"
              aria-label="Filter pipelines"
              autoFocus
            />
          </div>
        ) : null}

        {channels.length === 0 ? (
          <p className="osw-empty">No pipelines yet. Start one below.</p>
        ) : channelsToShow.length === 0 ? (
          <p className="osw-empty">No pipelines match “{query.trim()}”.</p>
        ) : (
          <div className="osw-list">
            {channelsToShow.map((ch) => (
              <button
                key={ch.id}
                className={`menu-item ${ch.id === activeChannelId ? "active" : ""}`}
                onClick={pick(() => onOpenChannel(ch.id))}
                type="button"
                role="menuitem"
                title={ch.objective || ch.name}
              >
                <span className="osw-dot" style={{ background: channelDot(ch) }} />
                <span className="menu-item-label">{ch.name}</span>
                {ch.id === activeChannelId
                  ? <Check className="menu-item-check" />
                  : <span className="menu-item-trail">{channelMeta(ch)}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="menu-sep" role="separator" />
        <button className="menu-item" onClick={pick(onNewChannel)} type="button" role="menuitem">
          <Plus className="menu-item-icon" />
          <span className="menu-item-label">New pipeline</span>
        </button>
      </Reveal>
    </div>
  );
}
