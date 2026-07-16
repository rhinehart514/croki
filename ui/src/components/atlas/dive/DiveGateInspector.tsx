import { useEffect, useRef } from "react";
import { ArrowUpRight, Pause, Shield, X } from "lucide-react";
import type { WallQueueItemView } from "@/api";
import { reviewContent } from "@/components/lens/wallReviewContent";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function missingConsequenceDetails(item: WallQueueItemView) {
  if (item.purpose !== "release") return [];
  const effect = item.effect;
  const kind = text(effect.kind)?.toLowerCase();
  const missing: string[] = [];
  if ((kind === "message" || kind === "send") && !text(effect.fromAddress)) {
    missing.push("Verified sender address was not supplied by this outward act.");
  }
  if ((kind === "product-change" || kind === "deploy") && !text(effect.destination)) {
    missing.push("Destination was not supplied by this outward act.");
  }
  if (effect.cost == null && effect.costUsd == null) missing.push("Run cost was not supplied by this outward act.");
  if (effect.reversible == null && !text(effect.reversibility)) missing.push("Reversibility was not supplied by this outward act.");
  return missing;
}

export function DiveGateInspector({ item, onClose, onReview, onHold }: {
  item: WallQueueItemView;
  onClose: () => void;
  onReview: (item: WallQueueItemView) => void;
  onHold: (item: WallQueueItemView) => void;
}) {
  const content = reviewContent(item);
  const gaps = missingConsequenceDetails(item);
  const inspectorRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const inspector = inspectorRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!inspector) return;
    const controls = [...inspector.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
      .filter((element) => !element.hasAttribute("disabled"));
    (controls[0] ?? inspector).focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    inspector.addEventListener("keydown", handleKeyDown);
    return () => {
      inspector.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, []);
  return (
    <aside ref={inspectorRef} className="atlas-dive-inspector" role="dialog" aria-modal="true" aria-labelledby="atlas-dive-gate-title" tabIndex={-1}>
      <header>
        <span><Shield aria-hidden="true" /> Needs your hand</span>
        <button type="button" onClick={onClose} aria-label="Close gate inspector"><X aria-hidden="true" /></button>
        <h2 id="atlas-dive-gate-title">{content.title}</h2>
        <p>{content.why}</p>
      </header>
      <div className="atlas-dive-inspector-body">
        <dl>
          {content.details.map((detail) => (
            <div key={`${detail.label}:${detail.value}`} data-tone={detail.tone}>
              <dt>{detail.label}</dt><dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
        {gaps.length ? <section className="atlas-dive-inspector-gaps" aria-labelledby="atlas-dive-consequence-gaps">
          <h3 id="atlas-dive-consequence-gaps">Gaps</h3>
          <ul>{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </section> : null}
      </div>
      <footer>
        <button type="button" className="atlas-dive-review" onClick={() => onReview(item)}><ArrowUpRight aria-hidden="true" /> Review this act</button>
        <button type="button" className="atlas-dive-hold" onClick={() => onHold(item)}><Pause aria-hidden="true" /> Hold here</button>
        <small>These actions open the existing review path or keep this act held. This inspector never releases directly.</small>
      </footer>
    </aside>
  );
}
