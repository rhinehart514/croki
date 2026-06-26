import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Sparkles } from "lucide-react";
import { Reveal } from "@/lib/motion";
import type { ChannelMeta, OutcomeProgram } from "@/types";
import { statusLabel, statusTone } from "@/lib/status";
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

// The OutcomeSwitcher is the breadcrumb that replaces both the top-bar outcome label and the left
// rail's Outcomes tree. It shows the active outcome's name and opens a glass dropdown of every
// outcome — programs with their composed systems (channels) nested under them, then standalone
// channels — plus the two ways to start a new one. It is the navigation that survives the rail being
// removed, so it carries the same vocabulary and status helpers the rail used.
export function OutcomeSwitcher({
  programs, channels, activeProgramId, activeChannelId,
  onOpenProgram, onOpenChannel, onNewProgram, onIdeate,
}: {
  programs: OutcomeProgram[];
  channels: ChannelMeta[];
  activeProgramId: string | null;
  activeChannelId: string | null;
  onOpenProgram: (id: string) => void;
  onOpenChannel: (id: string) => void;
  onNewProgram: () => void;
  onIdeate: () => void;
}) {
  const [open, setOpen] = useState(false);
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

  // Channels the founder built that no program wraps yet — first-class outcomes in their own right,
  // listed at the top level after the programs. Mirrors the explorer's standalone-channel handling.
  const channelsForProgram = (programId: string) => channels.filter((ch) => ch.outcomeProgramId === programId);
  const linkedChannelIds = new Set(
    channels
      .filter((ch) => ch.outcomeProgramId && programs.some((p) => p.id === ch.outcomeProgramId))
      .map((ch) => ch.id),
  );
  const standaloneChannels = channels.filter((ch) => !linkedChannelIds.has(ch.id));

  // What the trigger says: the active program's name, else the active standalone channel's name, else
  // an invitation to pick one.
  const activeProgram = programs.find((p) => p.id === activeProgramId) ?? null;
  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const activeName = activeProgram?.name ?? activeChannel?.name ?? "Choose an outcome";
  const activeDotColor = activeProgram
    ? OSW_TONE_DOT[statusTone(activeProgram.lastRunStatus ?? activeProgram.lifecycle)]
    : activeChannel
      ? channelDot(activeChannel)
      : "var(--ghost)";

  const pick = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="osw-root" ref={rootRef}>
      <button
        className="osw-trigger"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch outcome"
      >
        <span className="osw-trigger-dot" style={{ background: activeDotColor }} />
        <span className="osw-trigger-name">{activeName}</span>
        <ChevronDown className={`osw-trigger-chevron ${open ? "open" : ""}`} size={14} />
      </button>

      <Reveal open={open} className="osw-popover" role="menu" origin="top-left">
          {programs.length === 0 && standaloneChannels.length === 0 ? (
            <p className="osw-empty">No outcomes yet. Start one below.</p>
          ) : (
            <div className="osw-list">
              {/* Programs — the compiled, rich form of an outcome — each with its systems nested. */}
              {programs.map((program) => (
                <div className="osw-group" key={program.id}>
                  <button
                    className={`osw-item ${program.id === activeProgramId ? "active" : ""}`}
                    onClick={pick(() => onOpenProgram(program.id))}
                    type="button"
                    role="menuitem"
                  >
                    <span
                      className="osw-dot"
                      style={{ background: OSW_TONE_DOT[statusTone(program.lastRunStatus ?? program.lifecycle)] }}
                    />
                    <span className="osw-item-name">{program.name}</span>
                    <span className="osw-item-meta">{statusLabel(program.lastRunStatus ?? program.lifecycle)}</span>
                  </button>
                  {channelsForProgram(program.id).length > 0 ? (
                    <div className="osw-subgroup">
                      <span className="osw-subgroup-label">Systems</span>
                      {channelsForProgram(program.id).map((ch) => (
                        <button
                          key={ch.id}
                          className={`osw-item osw-item-child ${ch.id === activeChannelId ? "active" : ""}`}
                          onClick={pick(() => onOpenChannel(ch.id))}
                          type="button"
                          role="menuitem"
                          title={ch.objective || ch.name}
                        >
                          <span className="osw-dot" style={{ background: channelDot(ch) }} />
                          <span className="osw-item-name">{ch.name}</span>
                          <span className="osw-item-meta">{channelMeta(ch)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}

              {/* Standalone systems — a channel no program wraps yet, the common case before a program
                  compiles. It is an outcome in its own right, so it sits at the top level. */}
              {standaloneChannels.map((ch) => (
                <button
                  key={ch.id}
                  className={`osw-item ${ch.id === activeChannelId ? "active" : ""}`}
                  onClick={pick(() => onOpenChannel(ch.id))}
                  type="button"
                  role="menuitem"
                  title={ch.objective || ch.name}
                >
                  <span className="osw-dot" style={{ background: channelDot(ch) }} />
                  <span className="osw-item-name">{ch.name}</span>
                  <span className="osw-item-meta">{channelMeta(ch)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="osw-actions">
            <button className="osw-action" onClick={pick(onNewProgram)} type="button" role="menuitem">
              <Plus size={13} />
              <span>New outcome</span>
            </button>
            <button className="osw-action" onClick={pick(onIdeate)} type="button" role="menuitem">
              <Sparkles size={13} />
              <span>Ideate outcomes for me</span>
            </button>
          </div>
      </Reveal>
    </div>
  );
}
