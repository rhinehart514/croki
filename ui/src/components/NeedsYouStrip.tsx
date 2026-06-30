import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ShieldCheck, ArrowRight, ChevronDown } from "lucide-react";
import { SPRING } from "@/lib/springs";

// NeedsYouStrip — the one calm line that replaces panel-noise. The engine runs free up to the wall;
// the strip is the wall's quiet voice: "N need you", with the single most important move surfaced
// ready to act on. These are the flows paused at a founder gate — staged work waiting for the one
// thing the host can never do on its own, your approval. When nothing waits, the strip is silent
// (renders nothing) — the calm state is the default, not a zeroed counter.
//
// Presentational by design: App owns the fetch (getNeedsYou) and hands the items down, the same way
// the FloatingDock takes a pendingApprovals count. The strip never approves — it routes you to the
// gate (onOpen), where the act stays a founder act.

// One paused move waiting on the founder. `title` is the headline ("12 drafts staged at the gate"),
// `channelName` the where, `count` the volume, `detail` an optional one-line why.
export type NeedsYouItem = {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  // The kind of move waiting — a gate review, a microproduct ship, an input request. A free label,
  // not a closed enum, so a new kind of pause never needs a code change (matches the open-kind rule).
  kind: string;
  count?: number;
  detail?: string;
  runId?: string;
};

// The most-important move comes first; `total` is the full count across all paused flows.
export type NeedsYouFeed = { items: NeedsYouItem[]; total: number };

export function NeedsYouStrip({
  items,
  // Open a specific paused move at its gate (the founder act lives there, never here).
  onOpen,
  // Optional: open the full approvals surface (the "+N more" tail). Falls back to onOpen(top) if absent.
  onOpenAll,
}: {
  items: NeedsYouItem[];
  onOpen: (item: NeedsYouItem) => void;
  onOpenAll?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Quiet when nothing waits. No empty pill, no "0 need you" — the absence IS the message.
  if (!items.length) return null;

  const [top, ...rest] = items;
  const n = items.length;

  return (
    <AnimatePresence>
      <motion.div
        key="needs-you"
        className="needs-you-strip"
        initial={{ opacity: 0, y: -6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={SPRING}
        role="status"
        aria-label={`${n} ${n === 1 ? "flow needs" : "flows need"} you`}
        style={{
          position: "fixed",
          top: 62,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
          maxWidth: "min(560px, calc(100vw - 32px))",
          background: "var(--surface)",
          border: "1px solid var(--line-2)",
          borderRadius: 999,
          boxShadow: "var(--shadow-pop)",
          overflow: "hidden",
        }}
      >
        {/* The calm line — a single rationed amber dot (the gate's color), the count, the one move. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 8px 8px 14px",
            borderRadius: 999,
          }}
        >
          <span
            aria-hidden
            style={{
              flex: "0 0 auto",
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "var(--gap)",
              boxShadow: "0 0 0 4px var(--gap-soft)",
            }}
          />
          <span
            style={{
              flex: "0 0 auto",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            {n} need you
          </span>

          {/* The most important move, surfaced ready to act on. */}
          <button
            type="button"
            onClick={() => onOpen(top)}
            title={top.detail || `Review ${top.title} in ${top.channelName}`}
            style={{
              flex: "1 1 auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
              padding: "5px 8px 5px 11px",
              border: "1px solid var(--line)",
              borderRadius: 999,
              background: "var(--surface-2)",
              color: "var(--ink-2)",
              cursor: "pointer",
              transition: "background var(--dur-fast) var(--ease-out)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
          >
            <ShieldCheck size={13} style={{ flex: "0 0 auto", color: "var(--gap)" }} />
            <span
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                color: "var(--ink)",
              }}
            >
              {top.title}
            </span>
            <span
              style={{
                flex: "0 0 auto",
                fontSize: "var(--text-xs)",
                color: "var(--muted)",
                whiteSpace: "nowrap",
              }}
            >
              {top.channelName}
            </span>
            <ArrowRight size={13} style={{ flex: "0 0 auto", color: "var(--muted)" }} />
          </button>

          {/* The tail — the rest, folded. One quiet toggle, never a wall of rows by default. */}
          {rest.length ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              title={`${rest.length} more waiting`}
              style={{
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "5px 9px",
                border: "none",
                borderRadius: 999,
                background: "none",
                color: "var(--muted)",
                fontSize: "var(--text-xs)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              +{rest.length}
              <ChevronDown
                size={12}
                style={{
                  transform: expanded ? "rotate(180deg)" : "none",
                  transition: "transform var(--dur-base) var(--ease)",
                }}
              />
            </button>
          ) : null}
        </div>

        {/* The folded tail — the other paused moves, each a quiet routing row. */}
        <AnimatePresence initial={false}>
          {expanded && rest.length ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING}
              style={{ overflow: "hidden", borderTop: "1px solid var(--line)" }}
            >
              <div style={{ display: "flex", flexDirection: "column", padding: "4px 6px 6px" }}>
                {rest.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpen(item)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 10px",
                      border: "none",
                      borderRadius: "var(--r-md)",
                      background: "none",
                      color: "var(--ink-2)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background var(--dur-fast) var(--ease-out)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <span
                      style={{
                        flex: "1 1 auto",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: "var(--text-sm)",
                        color: "var(--ink)",
                      }}
                    >
                      {item.title}
                    </span>
                    <span
                      style={{ flex: "0 0 auto", fontSize: "var(--text-xs)", color: "var(--muted)" }}
                    >
                      {item.channelName}
                    </span>
                    <ArrowRight size={12} style={{ flex: "0 0 auto", color: "var(--faint)" }} />
                  </button>
                ))}
                {onOpenAll ? (
                  <button
                    type="button"
                    onClick={onOpenAll}
                    style={{
                      marginTop: 2,
                      padding: "7px 10px",
                      border: "none",
                      borderRadius: "var(--r-md)",
                      background: "none",
                      color: "var(--muted)",
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    Open all approvals
                  </button>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
