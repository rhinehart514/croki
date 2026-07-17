import { ArrowUpRight, MessageSquare, ShieldCheck } from "lucide-react";
import type { FirmVenture, PortfolioWallContext, PortfolioWallGroup, WallQueueItemView } from "@/api";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function accountFor(item: WallQueueItemView) {
  const effect = item.effect ?? {};
  if (item.purpose === "answer") return text(effect.question) ?? "An agent needs your answer.";
  if (item.purpose === "review-outcome") {
    const outcome = effect.outcome as Record<string, unknown> | undefined;
    return text(outcome?.body) ?? text(effect.body) ?? "The market spoke; review what returned.";
  }
  if (item.purpose === "end-bet") return text(effect.reason) ?? "An agent is asking whether this work should end.";
  if (effect.kind === "product-change") return text(effect.diffStat) ?? "A product change is ready for exact review.";
  if (effect.kind === "deploy") return text(effect.destination) ?? "A deploy is held for explicit authorization.";
  const message = text(effect.message);
  const recipients = Array.isArray(effect.recipients) ? effect.recipients.filter(text).join(", ") : null;
  return message && recipients ? `${message} — to ${recipients}` : message ?? "An outward act is waiting for your review.";
}

function purposeLabel(purpose: WallQueueItemView["purpose"]) {
  if (purpose === "answer") return "Needs your answer";
  if (purpose === "review-outcome") return "Market spoke";
  if (purpose === "end-bet") return "Ending decision";
  return "Held safely";
}

export function PortfolioWall({ groups, ventures, onOpen }: {
  groups: PortfolioWallGroup[];
  ventures: FirmVenture[];
  onOpen: (venture: FirmVenture, context: PortfolioWallContext) => void;
}) {
  const ventureById = new Map(ventures.map((venture) => [venture.id, venture]));
  if (!groups.length) return <p className="portfolio-wall-empty">Nothing across your ventures needs you right now.</p>;

  return (
    <div className="portfolio-wall" role="region" aria-label="Portfolio decisions">
      {groups.map((group) => {
        const venture = ventureById.get(group.venture.id);
        if (!venture) return null;
        return (
          <section key={venture.id} className="portfolio-wall-group" aria-labelledby={`portfolio-${venture.id}`}>
            <header><ShieldCheck aria-hidden="true" /><h3 id={`portfolio-${venture.id}`}>{venture.name}</h3></header>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => onOpen(venture, item.context)}>
                    <MessageSquare aria-hidden="true" />
                    <span><small>{purposeLabel(item.purpose)}</small><strong>{accountFor(item)}</strong></span>
                    <em>Open in venture <ArrowUpRight aria-hidden="true" /></em>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
