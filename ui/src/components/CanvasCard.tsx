import { useState } from "react";
import { motion, useDragControls } from "motion/react";
import { X, Share2, Check } from "lucide-react";
import { SPRING } from "@/lib/springs";
import type { GtmExperiment } from "@/types";
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

// ExperimentArtifactCard — THE shareable atom. A resolved experiment told as a four-beat story in
// the proven/green state: the hypothesis, what ran, what happened, and what it tells you. It is the
// founder's log and the clip at once — the Share button copies the same four beats as plain text so
// posting the win is one click. Renders as a CanvasCard body, or inline in the experiment matrix.
export function ExperimentArtifactCard({
  exp, channelName,
}: {
  exp: GtmExperiment;
  channelName?: string;
}) {
  const [copied, setCopied] = useState(false);
  // A run-derived experiment carries no hypothesis (the founder never stated one — his typed goal is
  // never echoed back as learning); its variable names what was really tested, labeled honestly.
  const statedHypothesis = (exp.hypothesis || "").trim();
  const hypothesis = statedHypothesis || (exp.variable || "").trim();
  const hypothesisLabel = statedHypothesis ? "Hypothesis" : "What was tested";
  const ran: string[] = [];
  if (exp.variant && exp.control) ran.push(`${exp.variant} vs ${exp.control}`);
  else if (exp.variant) ran.push(exp.variant);
  if (exp.heldConstant) ran.push(`holding ${exp.heldConstant} constant`);
  if (channelName) ran.push(`in ${channelName}`);
  const ranLine = ran.join(" · ");
  const result = (exp.result || "").trim();
  const learned = (exp.successSignal || "").trim();

  const share = () => {
    const text = [
      hypothesis && `${hypothesisLabel}: ${hypothesis}`,
      ranLine && `What ran: ${ranLine}`,
      result && `Result: ${result}`,
      learned && `What it tells you: ${learned}`,
    ].filter(Boolean).join("\n");
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="exp-artifact">
      <div className="exp-artifact-head">
        <span className="exp-artifact-badge">Proven</span>
        <button className="exp-artifact-share" type="button" onClick={share} title="Copy this result to share">
          {copied ? <Check size={13} /> : <Share2 size={13} />}
          {copied ? "Copied" : "Share"}
        </button>
      </div>
      {hypothesis && (
        <section className="exp-artifact-section">
          <span className="exp-artifact-label">{hypothesisLabel}</span>
          <p className="exp-artifact-value exp-artifact-hypothesis">{hypothesis}</p>
        </section>
      )}
      {ranLine && (
        <section className="exp-artifact-section">
          <span className="exp-artifact-label">What ran</span>
          <p className="exp-artifact-value">{ranLine}</p>
        </section>
      )}
      {result && (
        <section className="exp-artifact-section exp-artifact-result">
          <span className="exp-artifact-label">What happened</span>
          <p className="exp-artifact-value">{result}</p>
        </section>
      )}
      {learned && (
        <section className="exp-artifact-section">
          <span className="exp-artifact-label">What it tells you</span>
          <p className="exp-artifact-value">{learned}</p>
        </section>
      )}
    </div>
  );
}
