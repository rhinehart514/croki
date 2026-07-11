import { useMemo, useState } from "react";
import { ChevronRight, Compass, FlaskConical, ShieldQuestion, Target, Users } from "lucide-react";
import { CrewFace } from "@/components/crew/CrewFace";
import { channelOfferLine } from "@/lib/gateItem";
import { safetyFromConnectors, safetyFromItems, stagedGateItems, type SafetyClass } from "@/lib/pipelineSafety";
import type { ChannelMeta, ConnectorMeta, GTMGraph, GTMRunResult, OperatingLane } from "@/types";
import type { RunSummary } from "@/api";
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
  onOpenAgentProfile?: (ref: string) => void;
};

export function FocusedPipelineReadout({
  channel, graph, connectors, result, lane, runSummary, gateOffer, transportConnected = false, running = false, onOpenAgentProfile,
}: FocusedPipelineReadoutProps) {
  const [open, setOpen] = useState(true);

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
    const safety: SafetyClass = safetyFromItems(gateItems) ?? safetyFromConnectors(graph, connectors);
    const hasGate = graph.nodes.some((n) => n.category === "gate");
    // The canonical "what your yes does" — the SAME sentence GateReview shows, read off the staged items
    // (gateItem's allow-listed field). When present we surface it verbatim; we never invent a second one.
    const canonicalConsequence = gateItems.map((it) => (typeof it.whatYourYesDoes === "string" ? it.whatYourYesDoes.trim() : "")).find(Boolean) || null;

    // Intended effect — the motion class plus whether it reaches the market or stays local.
    const motion = humanizeKind(lane?.motionKind ?? channel?.kind);
    const reaches = safety === "local"
      ? "changes your own product or produces a local artifact"
      : safety === "deploy"
        ? "ships a change to your product, live"
        : "reaches people outside the product";
    const effect = motion ? `${motion} — it ${reaches}.` : `It ${reaches}.`;

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
      gateText = "This pipeline has no founder gate yet — one is required on every path before anything can leave.";
    } else if (safety === "deploy") {
      gateText = "Approving stages the change for your review. Shipping it live is a second, separate authorization at the gate.";
    } else if (safety === "external") {
      gateText = transportConnected
        ? "Approving releases the staged items through your connected sender — they reach real recipients."
        : "Approving stages the items for your review. Nothing sends until you connect a sender.";
    } else {
      gateText = "Approving stages this work locally for your review. Nothing leaves your machine.";
    }

    const offer = gateOffer?.trim() || channelOfferLine(channel) || null;

    return { goal, crewRefs, safety, effect, measurement, unknowns, groundedCount, gateText, hasGate, offer };
  }, [channel, graph, connectors, result, lane, runSummary, gateOffer, transportConnected]);

  const safetyChip = SAFETY_CHIP[view.safety];
  const pendingGates = channel?.pendingGates ?? 0;

  return (
    <div className={`pread ${open ? "is-open" : ""}`}>
      <button type="button" className="pread-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <div className="pread-headmain">
          <span className="pread-eyebrow"><Compass size={12} /> This pipeline</span>
          <p className={`pread-goal ${view.goal ? "" : "is-empty"}`}>
            {view.goal ?? "No goal stated for this pipeline yet — tell the crew what it should accomplish."}
          </p>
        </div>
        <div className="pread-chips">
          {running ? (
            <span className="pread-chip is-running"><span className="pread-chip-dot" />Running</span>
          ) : pendingGates > 0 ? (
            <span className="pread-chip is-gate"><span className="pread-chip-dot" />{pendingGates} waiting on you</span>
          ) : null}
          <span className={`pread-chip ${safetyChip.cls}`}>{safetyChip.label}</span>
          <span className="pread-caret"><ChevronRight size={16} /></span>
        </div>
      </button>

      {open ? (
        <div className="pread-body">
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
              <p className="pread-value is-empty">No outcomes joined yet — they attach here after the first run.</p>
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
            <span className="pread-gate-label">⛉ What your yes does</span>
            <p className="pread-gate-text">{view.gateText}</p>
            {view.offer ? <p className="pread-gate-offer">Offer: {view.offer}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
