import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, LayoutGrid, Plus, Search } from "lucide-react";
import { Reveal } from "@/lib/motion";
import type { ChannelMeta, OutcomeProgram } from "@/types";
import { statusLabel, statusTone } from "@/lib/status";
import "@/styles/menu.css";
import "@/styles/outcome-switcher.css";

// The status dot color follows the shared status tone, so an outcome reads the same here as in the
// explorer tree and on its canvas pill. Kept in lockstep with GtmExplorer's TONE_DOT.
const OSW_TONE_DOT: Record<string, string> = {
  good: "var(--proven)",
  active: "var(--proven)",
  waiting: "var(--gap)",
  bad: "var(--danger)",
  idle: "var(--ghost)",
};

// A channel has no canonical status key, so its dot/meta derive from run signals the same way the
// explorer's channelDot/channelMeta do — keep these aligned with GtmExplorer.
const channelDot = (ch: ChannelMeta): string =>
  ch.pendingGates > 0 ? "var(--gap)" : ch.lastRunOk === false ? "var(--danger)" : ch.runCount > 0 ? "var(--proven)" : "var(--ghost)";
const channelMeta = (ch: ChannelMeta): string =>
  ch.pendingGates > 0 ? `${ch.pendingGates} gate${ch.pendingGates === 1 ? "" : "s"}`
    : ch.runCount > 0 ? `${ch.runCount} run${ch.runCount === 1 ? "" : "s"}` : "ready";

// One outcome's dot when it wraps several systems: the worst live state across them wins (a waiting
// gate beats a failure beats a success beats idle), so a row's color never hides a problem under it.
const aggregateDot = (chs: ChannelMeta[], program: OutcomeProgram): string => {
  if (chs.some((c) => c.pendingGates > 0)) return "var(--gap)";
  if (chs.some((c) => c.lastRunOk === false)) return "var(--danger)";
  if (chs.some((c) => c.runCount > 0)) return "var(--proven)";
  return OSW_TONE_DOT[statusTone(program.lastRunStatus ?? program.lifecycle)];
};

// Outcome names arrive as compound "Outcome — Channel" strings (e.g. "First PCO Signup — Trigger
// Outbound"). Split on a spaced dash so the outcome leads and the channel qualifier can ride quiet;
// an arrow ("Demo Console → Pilot Conversion") or an unspaced hyphen ("Dev-Tool") is left whole.
const DASH = /\s[—–-]\s/;
const splitName = (name: string): { base: string; qualifier: string | null } => {
  const m = name.match(DASH);
  if (!m || m.index === undefined) return { base: name, qualifier: null };
  return { base: name.slice(0, m.index).trim(), qualifier: name.slice(m.index + m[0].length).trim() || null };
};

// A system's label inside a multi-system outcome: drop the parent outcome's name so only what
// distinguishes this system remains ("WNY Pest Control Operator — First Paid Signup" → "First Paid
// Signup"). Falls back to the qualifier split, then the full name, so a row is never blank.
const childLabel = (channelName: string, programName: string): string => {
  if (channelName.startsWith(programName)) {
    const rest = channelName.slice(programName.length).replace(/^\s*[—–-]\s*/, "").trim();
    if (rest) return rest;
  }
  return splitName(channelName).qualifier ?? channelName;
};

// A label that shows the outcome name with its channel qualifier demoted to a quiet suffix.
function OutcomeLabel({ name }: { name: string }) {
  const { base, qualifier } = splitName(name);
  return (
    <span className="menu-item-label">
      {base}
      {qualifier ? <span className="osw-qual"> · {qualifier}</span> : null}
    </span>
  );
}

// The OutcomeSwitcher is the breadcrumb that replaces both the top-bar outcome label and the left
// rail's Outcomes tree. It shows the active outcome's name and opens a dropdown of every outcome.
// Direction: a FLAT list — one row per outcome, the outcome name leading and the channel qualifier
// riding quiet. The list branches into indented system rows ONLY when an outcome wraps two or more
// systems (a single-system outcome IS its system, so it never duplicates itself under a "Systems"
// header). Multi-system rows carry health segments — one per system — so the switcher doubles as a
// glance at what's running, gated, or failing. A filter field appears once the list grows past a
// glanceable size.
export function OutcomeSwitcher({
  programs, channels, activeProgramId, activeChannelId,
  onOpenProgram, onOpenChannel, onNewProgram,
  onShowOverview, overviewActive = false,
}: {
  programs: OutcomeProgram[];
  channels: ChannelMeta[];
  activeProgramId: string | null;
  activeChannelId: string | null;
  onOpenProgram: (id: string) => void;
  onOpenChannel: (id: string) => void;
  onNewProgram: () => void;
  // Return to the one-canvas overview of every workflow. Absent → no overview affordance (a project
  // with a single workflow is already one canvas, so there's nothing to zoom back out to).
  onShowOverview?: () => void;
  overviewActive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape or a click outside the switcher — the dropdown is a transient popover, not a
  // pinned panel. Reset the filter each time it closes so it reopens clean.
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

  // Channels the founder built that no program wraps yet — first-class outcomes in their own right,
  // listed at the top level after the programs. Mirrors the explorer's standalone-channel handling.
  const channelsForProgram = (programId: string) => channels.filter((ch) => ch.outcomeProgramId === programId);
  const linkedChannelIds = new Set(
    channels
      .filter((ch) => ch.outcomeProgramId && programs.some((p) => p.id === ch.outcomeProgramId))
      .map((ch) => ch.id),
  );
  const standaloneChannels = channels.filter((ch) => !linkedChannelIds.has(ch.id));

  // Collapse duplicate programs that share a base outcome name (the compiler can leave a bare parent
  // draft beside its composed child, or two same-named programs). Keep the most-real one — the active
  // program wins, then the one with the most composed/run signal — so the list never shows confusing
  // twins. Order follows first appearance. Dedup is display-only; the active trigger still resolves
  // against the full list.
  const dedupedPrograms = useMemo(() => {
    const score = (p: OutcomeProgram) => {
      const chs = channels.filter((ch) => ch.outcomeProgramId === p.id);
      const composed = chs.reduce((s, c) => s + c.runCount + c.pendingGates + (c.nodeCount > 0 ? 3 : 0), 0);
      return (p.id === activeProgramId ? 100 : 0) + composed + (p.lifecycle === "active" ? 2 : 0);
    };
    const bestByBase = new Map<string, OutcomeProgram>();
    const order: string[] = [];
    for (const p of programs) {
      const key = splitName(p.name).base.toLowerCase().trim();
      const prior = bestByBase.get(key);
      if (!prior) order.push(key);
      if (!prior || score(p) > score(prior)) bestByBase.set(key, p);
    }
    return order.map((k) => bestByBase.get(k)!);
  }, [programs, channels, activeProgramId]);

  // The filter is a power affordance, not chrome — it only appears once the list is too long to scan.
  const showFilter = dedupedPrograms.length + standaloneChannels.length > 8;
  const q = query.trim().toLowerCase();
  const programsToShow = useMemo(
    () => dedupedPrograms.filter((p) => !q || p.name.toLowerCase().includes(q) || channelsForProgram(p.id).some((c) => c.name.toLowerCase().includes(q))),
    // channelsForProgram closes over `channels`; dedupedPrograms/channels/q are the real inputs.
    [dedupedPrograms, channels, q],
  );
  const standaloneToShow = standaloneChannels.filter((c) => !q || c.name.toLowerCase().includes(q));

  // What the trigger says: the active program's name, else the active standalone channel's name, else
  // an invitation to pick one.
  const activeProgram = programs.find((p) => p.id === activeProgramId) ?? null;
  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const activeName = overviewActive
    ? "All workflows"
    : activeProgram?.name ?? activeChannel?.name ?? "Choose an outcome";
  const activeDotColor = activeProgram
    ? OSW_TONE_DOT[statusTone(activeProgram.lastRunStatus ?? activeProgram.lifecycle)]
    : activeChannel
      ? channelDot(activeChannel)
      : "var(--ghost)";

  const pick = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="osw-root" ref={rootRef}>
      <button
        className="osw-trigger"
        onClick={() => { setOpen((v) => !v); setQuery(""); }}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch outcome"
      >
        <span className="osw-trigger-dot" style={{ background: activeDotColor }} />
        <OutcomeLabel name={activeName} />
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
              title="See every workflow on one canvas"
            >
              <LayoutGrid className="menu-item-icon" />
              <span className="menu-item-label">All workflows</span>
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
              placeholder="Find an outcome…"
              aria-label="Filter outcomes"
              autoFocus
            />
          </div>
        ) : null}

        {programs.length === 0 && standaloneChannels.length === 0 ? (
          <p className="osw-empty">No outcomes yet. Start one below.</p>
        ) : programsToShow.length === 0 && standaloneToShow.length === 0 ? (
          <p className="osw-empty">No outcomes match “{query.trim()}”.</p>
        ) : (
          <div className="osw-list">
            {programsToShow.map((program) => {
              const chs = channelsForProgram(program.id);

              // Two or more systems → the outcome is a group: a header row that toggles open and shows
              // a health segment per system, then the systems as indented rows. Never a duplicate of
              // the outcome's own name.
              if (chs.length > 1) {
                const isOpen = expanded.has(program.id) || chs.some((c) => c.id === activeChannelId);
                return (
                  <div className="osw-group" key={program.id}>
                    <button
                      className="menu-item osw-expander"
                      onClick={() => toggleExpand(program.id)}
                      type="button"
                      aria-expanded={isOpen}
                    >
                      <span className="osw-dot" style={{ background: aggregateDot(chs, program) }} />
                      <OutcomeLabel name={program.name} />
                      {!isOpen ? (
                        <span className="osw-segs" aria-hidden="true">
                          {chs.slice(0, 4).map((ch) => (
                            <span key={ch.id} className="osw-seg" style={{ background: channelDot(ch) }} />
                          ))}
                        </span>
                      ) : null}
                      <span className="osw-count">{chs.length}</span>
                      <ChevronRight className={`osw-expand-chev ${isOpen ? "open" : ""}`} size={13} />
                    </button>
                    {isOpen ? (
                      <div className="osw-children">
                        {chs.map((ch) => (
                          <button
                            key={ch.id}
                            className={`menu-item osw-child ${ch.id === activeChannelId ? "active" : ""}`}
                            onClick={pick(() => onOpenChannel(ch.id))}
                            type="button"
                            role="menuitem"
                            title={ch.objective || ch.name}
                          >
                            <span className="osw-dot" style={{ background: channelDot(ch) }} />
                            <span className="menu-item-label">{childLabel(ch.name, program.name)}</span>
                            {ch.id === activeChannelId
                              ? <Check className="menu-item-check" />
                              : <span className="menu-item-trail">{channelMeta(ch)}</span>}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }

              // Zero or one system → ONE flat row. With a system, its live run state leads (dot + run
              // meta); without one, the program's own lifecycle does. Opening it lands on its canvas.
              const single = chs[0] ?? null;
              const isActive = program.id === activeProgramId || (single?.id != null && single.id === activeChannelId);
              const dot = single ? channelDot(single) : OSW_TONE_DOT[statusTone(program.lastRunStatus ?? program.lifecycle)];
              const trail = single && (single.runCount > 0 || single.pendingGates > 0)
                ? channelMeta(single)
                : statusLabel(program.lastRunStatus ?? program.lifecycle);
              return (
                <button
                  key={program.id}
                  className={`menu-item ${isActive ? "active" : ""}`}
                  onClick={pick(() => onOpenProgram(program.id))}
                  type="button"
                  role="menuitem"
                  title={single?.objective || program.name}
                >
                  <span className="osw-dot" style={{ background: dot }} />
                  <OutcomeLabel name={program.name} />
                  {isActive ? <Check className="menu-item-check" /> : <span className="menu-item-trail">{trail}</span>}
                </button>
              );
            })}

            {/* Standalone systems — a channel no program wraps yet, the common case before a program
                compiles. It is an outcome in its own right, so it sits at the top level. */}
            {standaloneToShow.map((ch) => (
              <button
                key={ch.id}
                className={`menu-item ${ch.id === activeChannelId ? "active" : ""}`}
                onClick={pick(() => onOpenChannel(ch.id))}
                type="button"
                role="menuitem"
                title={ch.objective || ch.name}
              >
                <span className="osw-dot" style={{ background: channelDot(ch) }} />
                <OutcomeLabel name={ch.name} />
                {ch.id === activeChannelId
                  ? <Check className="menu-item-check" />
                  : <span className="menu-item-trail">{channelMeta(ch)}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="menu-sep" role="separator" />
        <button className="menu-item" onClick={pick(onNewProgram)} type="button" role="menuitem">
          <Plus className="menu-item-icon" />
          <span className="menu-item-label">New outcome</span>
        </button>
      </Reveal>
    </div>
  );
}
