import { useMemo, useState } from "react";
import { ChevronRight, Compass, FlaskConical, Play, ShieldQuestion, Target, Users } from "lucide-react";
import { CrewFace } from "@/components/crew/CrewFace";
import { channelOfferLine } from "@/lib/gateItem";
import { safetyFromConnectors, safetyFromItems, stagedGateItems, type SafetyClass } from "@/lib/pipelineSafety";
import type { ChannelMeta, ConnectorMeta, GTMGraph, GTMRunResult, OperatingLane } from "@/types";
import type { RunSummary } from "@/api";
import type { CanvasSelectionDescriptor } from "@/lib/canvasSelection";
import "@/styles/pipeline-readout.css";

// FocusedPipelineReadout — the ACTION-ALTITUDE brief (docs/production-direction/09 §Focused pipeline
// readout). When a single pipeline is focused in place, the founder should read what it MEANS
// before the graph machinery: the goal it serves, the crew on it, the intended effect, the measurement
// intent, what's known vs unknown, the EXACT gate consequence, and the safety class — reversible local
// build, staged external effect, or separately-authorized deploy.
//
// Everything here is derived from real records the canvas already holds — the channel meta, the composed
// graph, the connector inventory, the operating-view lane, and the run summary. No field is fabricated:
// a missing signal reads as an honest empty, and the gate consequence is stated from the real send/deploy
// shape and whether a transport is actually connected, never guessed optimistically.

// The safety class (reversible local build / staged external effect / separately-authorized deploy) is
// derived from AUTHORITATIVE signals in @/lib/pipelineSafety — the staged gate items' nature and the real
// connector capabilities — never from label substrings.
const SAFETY_CHIP: Record<SafetyClass, { label: string; cls: string }> = {
  local: { label: "Reversible local build", cls: "is-local" },
  external: { label: "Staged external effect", cls: "is-external" },
  deploy: { label: "Separately-authorized deploy", cls: "is-deploy" },
};

function humanizeKind(kind: string | null | undefined): string {
  const k = (kind ?? "").trim();
  if (!k) return "";
  return k.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// A pipeline goal is usually written as a briefing to the crew — a one-line intent followed by
// numbered or bulleted phases and a pile of guardrails ("Stop at the founder gate. Do NOT invent…").
// Read cold, that whole paragraph reads as a wall of text. This turns it into a scannable shape: the
// intent as a headline, the phases as compact step chips, and the full prose kept intact behind a
// disclosure. Everything is sliced from the real goal string — nothing is invented; a goal with no
// obvious phases just keeps its headline and shows the full text.
type ParsedGoal = {
  headline: string;
  steps: string[];
  hasMore: boolean; // is there prose beyond the headline worth revealing
};

function firstSentence(s: string): string {
  const m = s.match(/^[\s\S]*?[.!?](?:\s|$)/);
  return (m ? m[0] : s).trim().replace(/[.!?]+$/, "");
}

// Pull the short verb-y name of each phase from a briefing. Handles "(1) Research — …", "1. Qualify: …",
// and "- Draft …" shapes; keeps just the phase name (the word before the dash/colon), title-cased.
function extractSteps(s: string): string[] {
  const steps: string[] = [];
  const re = /(?:^|\s)(?:\(?\d+\)?[.)]\s*|[-•]\s+)([A-Za-z][A-Za-z /&]{1,28}?)\s*(?:[—–:-]|\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const name = m[1].trim().replace(/\s+/g, " ");
    // Guard against swallowing a whole sentence when there's no delimiter — a phase name is 1–3 words.
    if (name && name.split(" ").length <= 3 && !steps.includes(name)) {
      steps.push(name.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
    if (steps.length >= 6) break;
  }
  return steps;
}

function parseGoal(goal: string | null): ParsedGoal | null {
  if (!goal) return null;
  const clean = goal.trim();
  const headline = firstSentence(clean);
  const steps = extractSteps(clean);
  const hasMore = clean.length > headline.length + 2;
  return { headline, steps, hasMore };
}

export type FocusedPipelineReadoutProps = {
  channel: ChannelMeta | null;
  graph: GTMGraph;
  connectors: ConnectorMeta[];
  result: GTMRunResult | null;
  lane: OperatingLane | null;
  runSummary: RunSummary | null;
  gateOffer?: string | null;
  transportConnected?: boolean;
  running?: boolean;
  selection?: CanvasSelectionDescriptor;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRun?: () => void;
  onOpenAgentProfile?: (ref: string) => void;
};

export function FocusedPipelineReadout({
  channel, graph, connectors, result, lane, runSummary, gateOffer, transportConnected = false, running = false, selection = { kind: "none" }, open: controlledOpen, onOpenChange, onRun, onOpenAgentProfile,
}: FocusedPipelineReadoutProps) {
  // Pipeline focus should reveal the work, not replace it with a briefing sheet. The compact row keeps
  // intent and consequence in view; the founder opens the full read only when they need it.
  const [internalOpen, setInternalOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const changeOpen = (next: boolean) => {
    if (controlledOpen == null) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const view = useMemo(() => {
    const goal = channel?.objective?.trim() || null;
    // Relevant crew — the teammates composed onto this pipeline. Faces mean authorship: each opens its
    // profile. Derived from the real graph, deduped, honest empty when nothing agentic is wired yet.
    const crewRefs: string[] = [];
    for (const n of graph.nodes) {
      if (n.kind === "agent" && n.ref && !crewRefs.includes(n.ref)) crewRefs.push(n.ref);
    }

    // Safety class — backend-authoritative item nature first (the staged gate items decide), then the real
    // connector-capability rule pre-run. Never a label substring.
    const gateItems = stagedGateItems(graph, result);
    const releasedCount = gateItems.filter((item) => item.approved === true || item.approvalStatus === "approved").length;
    const safety: SafetyClass = safetyFromItems(gateItems) ?? safetyFromConnectors(graph, connectors);
    const hasGate = graph.nodes.some((n) => n.category === "gate");
    // The canonical "what your yes does" — the SAME sentence GateReview shows, read off the staged items
    // (gateItem's allow-listed field). When present we surface it verbatim; we never invent a second one.
    const canonicalConsequence = gateItems.map((it) => (typeof it.whatYourYesDoes === "string" ? it.whatYourYesDoes.trim() : "")).find(Boolean) || null;

    // Intended effect — where this pipeline's work lands, in plain founder terms. The motion kind is a
    // quiet prefix only when it's a real named motion (not the generic "Custom" fallback), never
    // engineer-speak like "produces a local artifact".
    const rawMotion = humanizeKind(lane?.motionKind ?? channel?.kind);
    const motion = rawMotion && rawMotion.toLowerCase() !== "custom" ? rawMotion : "";
    const reaches = safety === "local"
      ? "Stays on your side. It changes your product or builds something for you to review."
      : safety === "deploy"
        ? "Goes live on your product once you approve it."
        : "Reaches people outside the product once you approve it.";
    const effect = motion ? `${motion}. ${reaches}` : reaches;

    // Measurement intent — advisory, from the lane's efficiency signal. Honest empty pre-run.
    const eff = lane?.efficiency ?? null;
    let measurement: string | null = null;
    if (eff) {
      const bits: string[] = [];
      if (eff.staged > 0) bits.push(`${eff.staged} staged`);
      if (eff.measured > 0) bits.push(`${eff.measured} measured`);
      if (eff.coverage != null) bits.push(`${Math.round(eff.coverage * 100)}% joined to outcomes`);
      measurement = bits.length ? bits.join(" · ") : null;
    }
    if (!measurement && runSummary?.note) measurement = runSummary.note;

    // Unknowns — the lane stages the run can't yet see (blind), sitting beyond current evidence.
    const unknowns = (lane?.stages ?? []).filter((s) => s.state === "blind").map((s) => s.label);
    // A light "known" signal: how many shared objects this lane is grounded on.
    const groundedCount = lane?.objectKeys?.length ?? 0;

    // The exact gate consequence. Prefer the CANONICAL whatYourYesDoes GateReview surfaces (no second,
    // conflicting sentence). Only when the run hasn't staged one do we state the honest shape-derived line.
    let gateText: string;
    if (canonicalConsequence) {
      gateText = canonicalConsequence;
    } else if (!hasGate) {
      gateText = "This pipeline has no founder gate yet. Every path needs one before anything can leave.";
    } else if (safety === "deploy") {
      gateText = "Approving stages the change for your review. Shipping it live is a second, separate authorization at the gate.";
    } else if (safety === "external") {
      gateText = transportConnected
        ? "Approving releases the staged items through your connected sender. They reach real recipients."
        : "Approving stages the items for your review. Nothing sends until you connect a sender.";
    } else {
      gateText = "Approving stages this work locally for your review. Nothing leaves your machine.";
    }

    const offer = gateOffer?.trim() || channelOfferLine(channel) || null;

    const parsedGoal = parseGoal(goal);
    return { goal, parsedGoal, crewRefs, safety, effect, measurement, unknowns, groundedCount, gateText, hasGate, offer, releasedCount };
  }, [channel, graph, connectors, result, lane, runSummary, gateOffer, transportConnected]);

  const safetyChip = SAFETY_CHIP[view.safety];
  // A live run result is the immediate authority. Project/channel metadata refreshes after it and can
  // lag by a request, which previously left the expanded briefing above the founder's decision room.
  const pendingGates = result?.pendingGates?.length ?? channel?.pendingGates ?? 0;
  const showRun = selection.kind === "lane" && selection.source === "focus" && selection.channelId === channel?.id && !!onRun;
  const toggleOpen = () => {
    if (pendingGates < 1) changeOpen(!open);
  };
  const startRun = () => {
    changeOpen(false);
    setBriefOpen(false);
    onRun?.();
  };

  // The gate is the primary moment. A run launched here closes the informational brief before work
  // starts; an externally-arriving paused result also suppresses it without a state-setting effect.
  const visibleOpen = open && pendingGates < 1;

  return (
    <div className={`pread ${visibleOpen ? "is-open" : ""}`}>
      <div className="pread-topline">
      <button
        type="button"
        className="pread-head"
        aria-expanded={visibleOpen}
        aria-label={`${visibleOpen ? "Close" : "Open"} pipeline brief`}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          // React Flow and the canvas both own keyboard shortcuts. Handle the disclosure at its button
          // boundary so Enter/Space cannot be swallowed by a parent during async pipeline hydration.
          event.preventDefault();
          toggleOpen();
        }}
      >
        <div className="pread-headmain">
          <span className="pread-eyebrow"><Compass size={12} /> This pipeline</span>
          <p className={`pread-goal ${view.goal ? "" : "is-empty"}`}>
            {view.parsedGoal?.headline ?? "No goal yet. Tell the crew what it should accomplish."}
          </p>
        </div>
        <div className="pread-chips">
          {running ? (
            <span className="pread-chip is-running"><span className="pread-chip-dot" />Running</span>
          ) : pendingGates > 0 ? (
            <span className="pread-chip is-gate"><span className="pread-chip-dot" />{pendingGates} waiting on you</span>
          ) : view.releasedCount > 0 ? (
            <span className="pread-chip is-gate" data-testid="gate-approved-receipt">{view.releasedCount} approved</span>
          ) : null}
          <span className={`pread-chip ${safetyChip.cls}`}>{safetyChip.label}</span>
          <span className="pread-caret"><ChevronRight size={16} /></span>
        </div>
      </button>
      {showRun ? (
        <button
          type="button"
          className="pread-run"
          data-testid="pipeline-run"
          disabled={running}
          onClick={startRun}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            startRun();
          }}
        >
          <Play size={13} aria-hidden="true" /> {running ? "Running…" : "Run this work"}
        </button>
      ) : null}
      </div>

      {visibleOpen ? (
        <div className="pread-body">
          {view.parsedGoal && (view.parsedGoal.steps.length > 0 || view.parsedGoal.hasMore) ? (
            <div className="pread-cell is-wide pread-brief">
              {view.parsedGoal.steps.length > 0 ? (
                <ol className="pread-steps">
                  {view.parsedGoal.steps.map((s, i) => (
                    <li key={`step-${i}`} className="pread-step">
                      <span className="pread-step-n">{i + 1}</span>{s}
                    </li>
                  ))}
                </ol>
              ) : null}
              {view.parsedGoal.hasMore ? (
                <>
                  <button type="button" className="pread-brief-toggle" aria-expanded={briefOpen} onClick={() => setBriefOpen((b) => !b)}>
                    {briefOpen ? "Hide full brief" : "Show full brief"}
                  </button>
                  {briefOpen ? <p className="pread-brief-full">{view.goal}</p> : null}
                </>
              ) : null}
            </div>
          ) : null}

          <div className="pread-cell">
            <div className="pread-label"><Users size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />Relevant crew</div>
            {view.crewRefs.length ? (
              <div className="pread-crew">
                {view.crewRefs.map((ref) => (
                  <button
                    key={ref}
                    type="button"
                    className="pread-face"
                    title={`Open ${ref}'s profile`}
                    onClick={() => onOpenAgentProfile?.(ref)}
                  >
                    <CrewFace agentRef={ref} size={28} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="pread-value is-empty">The crew is composed as this pipeline takes shape.</p>
            )}
          </div>

          <div className="pread-cell">
            <div className="pread-label"><Target size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />Intended effect</div>
            <p className="pread-value">{view.effect}</p>
          </div>

          <div className="pread-cell">
            <div className="pread-label"><FlaskConical size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />Measurement</div>
            {view.measurement ? (
              <p className="pread-value">{view.measurement}</p>
            ) : (
              <p className="pread-value is-empty">No outcomes yet. They attach here after the first run.</p>
            )}
          </div>

          <div className="pread-cell">
            <div className="pread-label"><ShieldQuestion size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />Evidence &amp; unknowns</div>
            {view.unknowns.length ? (
              <ul className="pread-list">
                {view.unknowns.map((u, i) => (
                  <li key={`unknown-${i}`}><span className="mk">?</span>{u}</li>
                ))}
              </ul>
            ) : view.groundedCount > 0 ? (
              <p className="pread-value">Grounded on {view.groundedCount} shared object{view.groundedCount === 1 ? "" : "s"}; no open unknowns flagged.</p>
            ) : (
              <p className="pread-value is-empty">Evidence and unknowns appear once this pipeline has run.</p>
            )}
          </div>

          <div className="pread-gate">
            <span className="pread-gate-label">⛉ At the gate · what your yes does</span>
            <p className="pread-gate-text">{view.gateText}</p>
            {view.offer ? <p className="pread-gate-offer">Offer: {view.offer}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
