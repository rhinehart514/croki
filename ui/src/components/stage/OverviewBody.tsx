// The guaranteed-last workspace body: the ResultBody when a direction ctx exists, else a read-only
// structural summary for architecture/theory/capability selections that carry no direction. This is the
// sane default the open-registry contract promises — an unknown selection degrades to a legible summary,
// never a blank or broken pane.
import { ResultBody } from "@/components/now/WorkDetail";
import type { StageContext } from "./projectStageContext";

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean).join(", ") || null;
  if (value && typeof value === "object") return Object.values(value).map((entry) => text(entry)).filter(Boolean).join(" · ") || null;
  return value == null ? null : String(value);
}

function objectFacts(ctx: StageContext) {
  const details = ctx.object?.details ?? {};
  const definitions = [
    ["does", "What it does"], ["actor", "For"], ["entry", "Starts when"], ["value", "Value"],
    ["intendedChange", "Intended change"], ["audience", "Audience"], ["objective", "Objective"],
    ["repeatabilityClaim", "Why it repeats"], ["measurement", "Evidence"],
  ] as const;
  return definitions.map(([key, label]) => ({ label, value: text(details[key]) })).filter((fact) => fact.value).slice(0, 4);
}

function objectSummary(ctx: StageContext) {
  if (!ctx.object) return "";
  if (ctx.object.statement.trim()) return ctx.object.statement;
  const details = ctx.object.details ?? {};
  return text(details.does) ?? text(details.value) ?? text(details.objective) ?? text(details.intendedChange)
    ?? "No durable understanding has been written yet.";
}

function selectionSummary(ctx: StageContext): string {
  const selection = ctx.selection;
  if (!selection) return "Select something on the canvas to open it here.";
  if (selection.theoryId) return selection.theoryLabel?.trim() || "Drover's current read of this venture.";
  if (selection.objectId) return "A part of the venture with no attached work yet.";
  if (selection.architectureId) return "A structural part of the venture architecture.";
  if (selection.teammateRefs.length) return "This part of the venture is scoped to your conversation.";
  return "This selection has no prepared result yet.";
}

export function OverviewBody({ ctx }: { ctx: StageContext }) {
  if (ctx.ctx) return <ResultBody ctx={ctx.ctx} />;
  if (ctx.object) {
    const facts = objectFacts(ctx);
    return (
      <div className="now-detail-block object-overview">
        <span className="now-detail-block-label">{ctx.object.territory === "gtm" ? "Go-to-market" : ctx.object.territory === "product" ? "Product" : "Venture context"}</span>
        <h2>{ctx.object.name}</h2>
        <p className="now-detail-why">{objectSummary(ctx)}</p>
        <dl>
          {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
          <div><dt>Confidence</dt><dd>{ctx.object.assertion === "founder-asserted" ? "Founder asserted" : "Working understanding"}</dd></div>
          <div><dt>Thoughts</dt><dd>{ctx.object.threadRefs.length}</dd></div>
        </dl>
      </div>
    );
  }
  return (
    <div className="now-detail-block">
      <span className="now-detail-block-label">Overview</span>
      <p className="now-detail-why">{selectionSummary(ctx)}</p>
    </div>
  );
}
