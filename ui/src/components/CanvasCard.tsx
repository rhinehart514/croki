import { motion, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { SPRING } from "@/lib/springs";
import "@/styles/canvas-card.css";

// CanvasCard — the unit of the agentic canvas. Nothing navigates to its own page; Claude (or the
// founder, via the composer +) SUMMONS a view and it pops up here as a card ON the canvas. You drag
// it by the head, flick it away with ×, and summon the next one beside it. Several can be open at
// once. This replaces the lens-tab taxonomy: you ask for what you want to see instead of choosing
// from a fixed menu of frozen projections.
//
// Opaque surface (read in, never glass). Drag only from the header handle so the body stays
// interactive (scroll, click). Spring pop-in via the shared SPRING so a summon reads as one motion.
export function CanvasCard({
  title, subtitle, onDismiss, children, initial, width = 460, height,
}: {
  title: string;
  subtitle?: string;
  onDismiss: () => void;
  children: React.ReactNode;
  initial: { x: number; y: number };
  width?: number;
  height?: number;
}) {
  const controls = useDragControls();
  return (
    <motion.section
      className="canvas-card"
      drag
      dragListener={false}
      dragControls={controls}
      dragMomentum={false}
      dragElastic={0}
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 6 }}
      transition={SPRING}
      style={{ left: initial.x, top: initial.y, width, height }}
      aria-label={title}
    >
      <header
        className="canvas-card-head"
        onPointerDown={(e) => controls.start(e)}
      >
        <div className="canvas-card-title">
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        <button className="canvas-card-dismiss" onClick={onDismiss} type="button" aria-label={`Dismiss ${title}`}>
          <X size={14} />
        </button>
      </header>
      <div className="canvas-card-body">{children}</div>
    </motion.section>
  );
}
