// The one lifted surface (architecture §1, redesign §4). Selection is descent, not a panel: the node
// flies forward and opens into its reading via a motion shared-element morph (layoutId shared with the
// node card), the world dims + blurs behind it (a class the shell puts on the world), and Escape rises
// with the exact prior camera restored (useDescent → useAtlasCamera().broaden). This component owns the
// reading frame, the breadcrumb of the descent path, and the archetype router; each reading renders the
// exact staged payload carried on the descended node. No accept/reject chrome — Release/Hold is
// dialogue inside GateReading.
import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { WallQueueItemView } from "@/api";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import { useDescent } from "./useDescent";
import { EffortReading } from "./readings/EffortReading";
import { CampaignReading } from "./readings/CampaignReading";
import { TeammateReading } from "./readings/TeammateReading";
import { RecordReading } from "./readings/RecordReading";
import { GateReading } from "./readings/GateReading";
import { ContextReading } from "./readings/ContextReading";

// Resolve the wall item a descended node concerns: an explicit wall node carries its item id, and an
// effort at the gate matches by its bet id. Returns null when the node is not a gate reading.
function wallItemFor(node: AtlasNode | null, wallItems: WallQueueItemView[]): WallQueueItemView | null {
  if (!node) return null;
  const { id, data } = node;
  if (id.startsWith("wall:")) {
    const itemId = id.slice("wall:".length);
    return wallItems.find((item) => item.id === itemId) ?? null;
  }
  if (id === "atlas:wall") return wallItems.find((item) => item.decision === null) ?? null;
  if (data.atWall) {
    const betId = data.bet?.id ?? (id.startsWith("bet:") ? id.slice("bet:".length) : null);
    if (betId) return wallItems.find((item) => item.betId === betId && item.decision === null) ?? null;
  }
  return null;
}

function readingFor(
  node: AtlasNode,
  ventureId: string,
  wallItem: WallQueueItemView | null,
  onChanged: () => void,
) {
  if (wallItem) return <GateReading ventureId={ventureId} item={wallItem} onDecided={onChanged} />;
  const kind = node.data.kind;
  if (kind === "teammate") return <TeammateReading node={node} />;
  if (kind === "outcome") return <RecordReading node={node} />;
  if (kind === "campaign" || kind === "motion") return <CampaignReading ventureId={ventureId} node={node} onBranched={onChanged} />;
  // Structural world nodes are read, not steered — a capability (a port into the world), who-it-helps,
  // how-it-works, the venture's own question. They must not show steer/try-another controls.
  if (kind === "capability" || kind === "concept" || kind === "system" || kind === "product-loop"
    || kind === "theory" || kind === "intent" || kind === "group") {
    return <ContextReading node={node} />;
  }
  // Efforts (bets / live pushes) and anything else with a bet snapshot get the steerable effort reading.
  return <EffortReading ventureId={ventureId} node={node} onSteered={onChanged} />;
}

// The mono kicker at the top of the reading names the *real* archetype in founder language, derived
// from the descended node's kind (never a constant "Venture"). This is the reading-header twin of the
// per-node kicker on the canvas, so descending never mislabels what you clicked. An effort speaks its
// own live kicker ("Needs your read" / "Underway"); the gate is "The gate"; everything else names its
// noun. Kept plain — no internal ontology (bet/motion/stage) ever surfaces here.
function archetypeKicker(node: AtlasNode, wallItem: WallQueueItemView | null): string {
  if (wallItem) return "The gate";
  const { kind } = node.data;
  switch (kind) {
    case "teammate":
      return "Agent · current work";
    case "outcome":
      return "What the market said";
    case "capability":
      return "Capability";
    case "campaign":
      return "A live outreach effort";
    case "motion":
      return "A way to reach people";
    case "concept":
      return "Who it helps";
    case "system":
    case "product-loop":
      return "How it works";
    case "wall":
      return "The gate";
    case "bet":
    case "work":
      // An effort speaks its own live kicker (from betBand: "Needs your read" / "Underway" / "Finished").
      return node.data.effortKicker ?? "Effort";
    default:
      return node.data.effortKicker ?? "Effort";
  }
}

// The clicked node's on-screen rect as a motion origin for the reading card (offset from viewport center
// plus a down-scale). Read-only DOM measurement; null when the node isn't on screen. The descend card is
// grid-centered in CSS, so viewport-center is its resting center.
function measureNodeOrigin(nodeId: string | null): { x: number; y: number; scale: number } | null {
  if (!nodeId || typeof document === "undefined") return null;
  const el = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: rect.left + rect.width / 2 - window.innerWidth / 2,
    y: rect.top + rect.height / 2 - window.innerHeight / 2,
    scale: Math.max(0.14, Math.min(0.62, rect.width / 560)),
  };
}

export function DescendReading({
  ventureId,
  wallItems,
  onChanged,
}: {
  ventureId: string;
  wallItems: WallQueueItemView[];
  onChanged: () => void;
}) {
  const { current, descentPath, descentOpen, rise, riseToRoot } = useDescent();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!descentOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); rise(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [descentOpen, rise]);

  const node = current?.node ?? null;
  const wallItem = wallItemFor(node, wallItems);
  const layoutId = current?.nodeId ? `iw-descend-${current.nodeId}` : undefined;

  // True node→reading morph: the reading grows out of the clicked node's on-screen position rather than
  // popping in centered. measureNodeOrigin reads the node's live rect off the canvas and expresses it as
  // the card's motion origin (offset from viewport center + a down-scale), so the card flies forward from
  // where the founder clicked and settles at rest. Only `initial`/`exit` consume it, so recomputing on a
  // re-render is harmless. Null under reduced motion or when the node isn't on screen (a modest lift then).
  const origin = reducedMotion || !descentOpen ? null : measureNodeOrigin(current?.nodeId ?? null);
  const kicker = node ? archetypeKicker(node, wallItem) : "Venture";
  // The breadcrumb shows only the *ancestry* of the descent — the current node is already the serif
  // headline below, so restating it here as a mono rung would duplicate the title. Show parent rungs
  // only; a top-level descent has none, leaving just the archetype kicker.
  const ancestors = descentPath.slice(0, -1);

  return (
    <AnimatePresence>
      {descentOpen && node ? (
        <motion.div
          className="iw-descend"
          role="dialog"
          aria-modal="false"
          aria-label={`Reading: ${node.data.title}`}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <button type="button" className="iw-descend-scrim" aria-label="Rise back to the world" onClick={rise} />
          <motion.article
            className="iw-descend-card"
            data-layout-id={layoutId}
            style={{ transformOrigin: "center center" }}
            initial={
              reducedMotion
                ? { opacity: 0 }
                : origin
                  ? { opacity: 0.35, x: origin.x, y: origin.y, scale: origin.scale }
                  : { opacity: 0, scale: 0.96, y: 12 }
            }
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : origin
                  ? { opacity: 0, x: origin.x, y: origin.y, scale: origin.scale }
                  : { opacity: 0, scale: 0.97, y: 8 }
            }
            transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.9 }}
          >
            <header className="iw-descend-head">
              <nav className="iw-breadcrumb" aria-label="Descent path">
                <button type="button" className="iw-breadcrumb-root" onClick={riseToRoot} aria-label="Rise to the venture">
                  {kicker}
                </button>
                {ancestors.map((entry, index) => (
                  <span key={`${entry.nodeId ?? "rung"}-${index}`} className="iw-breadcrumb-rung">
                    <span aria-hidden="true" className="iw-breadcrumb-sep">/</span>
                    {entry.node?.data.title ?? "Reading"}
                  </span>
                ))}
              </nav>
              <button type="button" className="iw-descend-rise" onClick={rise} aria-label="Rise back to the world">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </header>
            <div className="iw-descend-body">
              {readingFor(node, ventureId, wallItem, onChanged)}
            </div>
          </motion.article>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
