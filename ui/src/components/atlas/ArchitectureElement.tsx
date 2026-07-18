import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ArrowDownToLine, ArrowUpRight, BookOpenText, Database, FileDiff, FileText, Focus, Layers3, Link2, Play, ReceiptText, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { CrewFace } from "@/components/crew/CrewFace";
import { CampaignPressure } from "./CampaignPressure";
import { MotionRoute } from "./MotionRoute";
import { useAtlasDensity, type AtlasDensity } from "./atlasDensity";
import { ATLAS_EASE, ATLAS_MOTION } from "./atlasMotion";
import { EpistemicToken } from "./EpistemicToken";
import type { AtlasNode } from "./atlasTypes";

const ROLE_LABELS = {
  concept: "Open thought",
  "product-loop": "How the product creates value",
  system: "Shared capability",
  motion: "How people may reach value",
  campaign: "Work underway",
  bet: "Current work",
  work: "Concrete work",
  outcome: "Returned evidence",
  theory: "Drover’s current read",
  intent: "What should change",
  group: "Named area",
  wall: "Needs your hand",
  teammate: "Agent",
  capability: "Capability",
} as const;

function ElementMaterial({ data, density }: { data: AtlasNode["data"]; density: AtlasDensity }) {
  const element = data.element;
  const compact = density === "editorial" && data.kind !== "intent" && data.kind !== "theory";
  if (data.kind === "motion" && element) return <MotionRoute motion={element} compact={compact} active={Boolean(data.active)} />;
  if (data.kind === "campaign" && element) return <CampaignPressure campaign={element} pressure={data.pressure} compact={compact} active={Boolean(data.active)} teammates={data.teammates ?? []} continuation={data.continuation} />;
  if (data.kind === "system") return <span className="atlas-system-strata" aria-hidden="true"><Database /><span><i /><i /><i /></span></span>;
  if (data.kind === "teammate" && data.agentRef) return <span className="atlas-anchor-teammate" aria-hidden="true"><CrewFace agentRef={data.agentRef} size={34} /></span>;
  if (data.kind === "capability") return <span className="atlas-anchor-capability" aria-hidden="true"><Database /></span>;
  if (data.kind === "outcome") return <span className="atlas-outcome-receipt" aria-hidden="true"><ReceiptText /> Recorded return</span>;
  // A staged product change and a text draft render distinct material so the resting cards stop reading as
  // duplicate stickies: a diff glyph for a code change, a document glyph for prose.
  if (data.kind === "work") return data.workKind === "product-change"
    ? <span className="atlas-work-material" data-work-kind="product-change" aria-hidden="true"><FileDiff /> Product change</span>
    : <span className="atlas-work-material" data-work-kind="draft" aria-hidden="true"><FileText /> Draft</span>;
  if (data.kind === "theory") return <span className="atlas-theory-mark" aria-hidden="true"><BookOpenText /> Provisional</span>;
  if (data.kind === "bet") return <span className="atlas-bet-aperture" aria-hidden="true" />;
  if (data.kind === "product-loop") return <span className="atlas-loop-return" aria-hidden="true">↻</span>;
  return null;
}

// The eyebrow (kicker) — per-kind, and for staged work per its object kind, so a product change and a
// positioning draft carry different labels instead of a constant "Concrete work".
function eyebrowFor(data: AtlasNode["data"]): string {
  if (data.kind === "work") return data.workKind === "product-change" ? "Product change" : "Prepared draft";
  return ROLE_LABELS[data.kind];
}

function InstrumentReading({ data }: { data: AtlasNode["data"] }) {
  if (!data.stateLabel || !data.outputLabel || !data.verbLabel) return null;
  return (
    <span className="atlas-instrument-reading">
      <b>{data.stateLabel}</b>
      <span>{data.outputLabel}</span>
      <em>{data.verbLabel}<ArrowUpRight aria-hidden="true" /></em>
    </span>
  );
}

function ArchitectureElementView({ data, id, selected }: NodeProps<AtlasNode>) {
  const element = data.element;
  const isSelected = Boolean(selected || data.selected);
  const isCanvasAnchor = data.kind === "teammate" || data.kind === "capability";
  // Live zoom tier (contract §3) drives how much the card renders, continuously as the wheel turns —
  // not the settled altitude, which only lands when a gesture ends. A selected card is always full.
  // editorial (zoomed out) quiets every non-anchor card to its title; standard/detailed re-detail as
  // the founder zooms in. Anchors (teammate/capability) also quiet one tier earlier so the zoomed-out
  // reading stays a legible constellation rather than a wall of instrument chrome.
  const density = useAtlasDensity();
  const compact = !isSelected && data.kind !== "theory" && (density === "editorial" || (density === "standard" && isCanvasAnchor));
  const canConnect = Boolean(element);
  const reducedMotion = useReducedMotion();
  const arrival = data.kind === "outcome" ? 16 : data.kind === "work" ? -12 : 0;
  const arrivesFromReceipt = Boolean(data.arrivalReceiptId) && !reducedMotion;
  return (
    <motion.article
      className="atlas-element"
      data-kind={data.kind}
      data-atlas-kind={data.kind}
      data-territory={data.territory ?? undefined}
      data-atlas-id={id}
      data-selected={isSelected ? "true" : "false"}
      data-focus-role={data.focusRole}
      data-resting-overflow={data.restingOverflow ? "true" : "false"}
      data-active={data.active ? "true" : "false"}
      data-at-wall={data.atWall ? "true" : "false"}
      data-provisional={data.provisional ? "true" : "false"}
      data-epi-state={data.epistemic ?? "empty"}
      data-arrival-receipt={data.arrivalReceiptId}
      initial={arrivesFromReceipt ? { opacity: 0, x: arrival, scale: 0.98 } : false}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: arrivesFromReceipt ? ATLAS_MOTION.settle : 0, ease: ATLAS_EASE }}
    >
      {/* The reserved epistemic corner slot (Law 11) — ALWAYS rendered, hollow when unfilled, at a fixed
          corner across every archetype and band; only its disclosure grows with the band. */}
      <EpistemicToken state={data.epistemic ?? null} />
      {canConnect ? <Handle className="atlas-relationship-handle" type="target" position={Position.Left} /> : null}
      <button
        type="button"
        className="atlas-element-main"
        aria-label={`${eyebrowFor(data)}: ${data.title}${data.pressure.length ? `, ${data.pressure.length} pressure reason` : ""}`}
        aria-pressed={isSelected}
        onClick={(event) => { event.stopPropagation(); data.onSelect(id); }}
        onDoubleClick={(event) => { event.stopPropagation(); data.onFocus(id); }}
      >
        <span className="atlas-element-eyebrow">{eyebrowFor(data)}</span>
        <ElementMaterial data={data} density={density} />
        <strong>{data.title}</strong>
        {!compact && data.statement ? <span className="atlas-element-statement">{data.statement}</span> : null}
        {data.kind === "theory" && !compact ? (
          <span className="atlas-theory-sources">
            {(data.sourceRefs?.length ?? 0) > 0
              ? `${data.sourceRefs?.length} concrete ${(data.sourceRefs?.length ?? 0) === 1 ? "source" : "sources"} attached`
              : "Inferred · no source attached yet"}
          </span>
        ) : null}
        {data.kind === "product-loop" && element?.steps?.length ? (
          compact ? (
            <span className="atlas-loop-silhouette">{element.steps.length}-step value loop</span>
          ) : (
            <span className="atlas-loop-steps">
              {element.steps.map((step, index) => (
                <span key={step.id}><i>{index + 1}</i><span>{step.label}</span></span>
              ))}
            </span>
          )
        ) : null}
        {data.kind === "work" && data.teammates?.length ? (
          <span className="atlas-work-team">
            <span>{data.teammates.slice(0, 3).map((teammate) => <CrewFace key={teammate.ref} agentRef={teammate.ref} size={24} />)}</span>
            <small>{data.teammates.map((teammate) => teammate.name).join(" + ")}</small>
          </span>
        ) : null}
        {/* Rank-and-reveal at rest (spec §3): the "PREPARED · DRAFT · Attached" instrument line is the
            chip that made every resting card read identically. At the far map read it surfaces ONLY on the
            cards that need the founder first — a card held at the wall, or the selected card — so the
            whole-venture read stays calm; every other card reveals its instrument line on approach as the
            band re-details. */}
        {!compact || data.atWall || isSelected ? <InstrumentReading data={data} /> : null}
        {data.pressure.length ? (
          <span className="atlas-pressure-mark">
            <ArrowDownToLine aria-hidden="true" /> {data.pressure[0].detail || data.pressure[0].reason.replaceAll("-", " ")}
          </span>
        ) : null}
        {data.kind === "outcome" ? <small className="atlas-outcome-basis">{String(data.join?.basis ?? data.join?.join?.basis ?? data.join?.join?.level ?? "unattributed")} join · not causality</small> : null}
      </button>
      {isSelected ? (
        <div className="atlas-element-actions nodrag" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          <Button type="button" variant="ghost" size="xs" aria-label="Trace" onClick={() => data.onFocus(id)}><Focus aria-hidden="true" /> Follow path</Button>
          {data.kind === "theory" ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => window.requestAnimationFrame(() => document.getElementById("firm-direction-composer")?.focus())}>Correct this</Button>
          ) : null}
          {data.kind === "concept" && element ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => data.onPromote(element)}><Sparkles aria-hidden="true" /> Use in Drover</Button>
          ) : null}
          {data.kind === "motion" && element ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => data.onActivateMotion(element)}><Play aria-hidden="true" /> Activate</Button>
          ) : null}
          {element ? <Button type="button" variant="ghost" size="xs" onClick={() => data.onBeginConnection(id)}><Link2 aria-hidden="true" /> Connect</Button> : null}
          {(element && element.role !== "concept") || data.kind === "bet" ? (
            <Button type="button" variant="ghost" size="xs" aria-label="How this runs" onClick={() => data.onRevealMachinery(id)}><Layers3 aria-hidden="true" /> Team &amp; execution</Button>
          ) : null}
        </div>
      ) : null}
      {canConnect ? <Handle className="atlas-relationship-handle" type="source" position={Position.Right} /> : null}
    </motion.article>
  );
}

export const ArchitectureElement = memo(ArchitectureElementView);
