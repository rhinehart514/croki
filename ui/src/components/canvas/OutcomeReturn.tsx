import { ArrowRight, CornerLeftUp, GitBranch, HelpCircle, Package, X } from "lucide-react";
import { CrewFace } from "@/components/crew/CrewFace";
import { humanizeRef } from "@/lib/agentPersona";
import type { JoinedOutcome, ProductImplication } from "@/types";
import "@/styles/outcome-return.css";

// OutcomeReturn — the product-altitude rail where what came back from the market returns to the work that
// produced it (docs/production-direction/07 §Outcome return). A joined outcome routes toward its pipeline,
// question, product element, and crew; clicking a return chip is the spatial return — it focuses/opens
// that real object. Outcome-pending states stay honest and distinct: released, observed, no response, not
// measured (doc 09 state contract). A gate approval is never reported as market success.
//
// A product implication (doc 06 §Product implication) begins as a DASHED proposal. Accepting it only
// STAGES a founder-reviewable product-change pipeline — it never edits code or mutates product truth. The
// current server omits outcomes/implications, so the rail stays honestly empty until the projection lands.

// A plain, human "when" for the exposure line — the day it landed, not a live-ticking counter. Legibility,
// not a metric: it orients the response in time and nothing more. Falls back to the raw string if unparseable.
function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  const now = Date.now();
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const OUTCOME_BADGE: Record<JoinedOutcome["kind"], { label: string; cls: string }> = {
  "sent": { label: "Released", cls: "" },
  "observed-response": { label: "Observed", cls: "is-observed" },
  "product-activation": { label: "Activated", cls: "is-observed" },
  "business-outcome": { label: "Result", cls: "is-observed" },
  "founder-entered": { label: "Recorded", cls: "" },
  "unmeasured": { label: "Not measured", cls: "is-unmeasured" },
};

export type OutcomeReturnProps = {
  outcomes: JoinedOutcome[];
  implications: ProductImplication[];
  // The question ids that actually resolve to a focusable question — so the "question" return chip is only
  // offered when clicking it does something (no no-op affordance).
  resolvableQuestionIds?: ReadonlySet<string>;
  onClose: () => void;
  onOpenPipeline?: (channelId: string) => void;
  onFocusQuestion?: (questionId: string) => void;
  onOpenTeammate?: (ref: string) => void;
  onOpenProduct?: (productRef: string) => void;
  onAcceptImplication: (impl: ProductImplication) => void;
  onDismissImplication: (impl: ProductImplication) => void;
};

function OutcomeCard({ o, resolvableQuestionIds, onOpenPipeline, onFocusQuestion, onOpenTeammate, onOpenProduct }: {
  o: JoinedOutcome;
  resolvableQuestionIds?: ReadonlySet<string>;
  onOpenPipeline?: (channelId: string) => void;
  onFocusQuestion?: (questionId: string) => void;
  onOpenTeammate?: (ref: string) => void;
  onOpenProduct?: (productRef: string) => void;
}) {
  const questionResolvable = !!o.questionId && (!resolvableQuestionIds || resolvableQuestionIds.has(o.questionId));
  const badge = OUTCOME_BADGE[o.kind] ?? OUTCOME_BADGE["unmeasured"];
  // "No response" is a distinct honest state: a released item with a measured zero return.
  const noResponse = o.kind === "observed-response" && (o.value ?? 0) === 0;
  // The inspectable ACCOUNT — pull-only. The card shows a one-line summary at rest; the founder OPENS this to
  // read the fuller account of what came back: the exposure line (its honest state + when it landed + any
  // value), and the response text itself when it carries more than the one-line summary already shows. Never
  // pushed, never a metric at rest — the account is here only when the founder chooses to look
  // (docs/EXPERIMENT-MACHINE-SPEC "not a scoreboard"). Offered only when there is something real to inspect.
  const observedWhen = o.observedAt ? formatWhen(o.observedAt) : null;
  const response = o.body?.trim() ?? "";
  // Only re-print the response when it is more than the summary label already shows (avoid a duplicate line).
  const responseAddsDetail = response.length > 0 && response !== o.label.trim();
  const hasAccount = Boolean(responseAddsDetail || observedWhen);
  return (
    <div className="oret-out" data-testid="joined-outcome">
      <div className="oret-out-top">
        <span className="oret-out-label">{o.label}{o.value != null && o.value !== 0 ? <> · {o.value}</> : null}</span>
        <span className={`oret-badge ${noResponse ? "is-none" : badge.cls}`}>{noResponse ? "No response" : badge.label}</span>
      </div>
      {hasAccount ? (
        <details className="oret-account">
          <summary className="oret-account-summary">What came back</summary>
          <div className="oret-account-body">
            {/* Exposure — the honest state + when it landed. A legible account, not a KPI: it says where this
                stands, it does not grade it. */}
            <p className="oret-account-exposure">
              {noResponse ? "No response" : badge.label}
              {observedWhen ? <> · {observedWhen}</> : null}
              {o.value != null && o.value !== 0 ? <> · {o.value}</> : null}
            </p>
            {/* The response itself, when it carries more than the summary line. */}
            {responseAddsDetail ? (
              <blockquote className="oret-account-response">{response}</blockquote>
            ) : null}
          </div>
        </details>
      ) : null}
      <div className="oret-returns">
        {o.channelId && onOpenPipeline ? (
          <button type="button" className="oret-return" onClick={() => onOpenPipeline(o.channelId!)}>
            <span className="ar"><ArrowRight size={11} /></span><GitBranch size={11} /> pipeline
          </button>
        ) : null}
        {questionResolvable && onFocusQuestion ? (
          <button type="button" className="oret-return" onClick={() => onFocusQuestion(o.questionId!)}>
            <span className="ar"><ArrowRight size={11} /></span><HelpCircle size={11} /> question
          </button>
        ) : null}
        {o.productRefs?.[0] && onOpenProduct ? (
          <button type="button" className="oret-return" onClick={() => onOpenProduct(o.productRefs![0])}>
            <span className="ar"><ArrowRight size={11} /></span><Package size={11} /> product
          </button>
        ) : null}
        {(o.crewRefs ?? []).slice(0, 4).map((ref) => (
          <button
            key={ref}
            type="button"
            className="oret-face"
            title={`Open ${humanizeRef(ref)}'s profile`}
            onClick={() => onOpenTeammate?.(ref)}
          >
            <CrewFace agentRef={ref} size={22} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function OutcomeReturn({
  outcomes, implications, resolvableQuestionIds, onClose,
  onOpenPipeline, onFocusQuestion, onOpenTeammate, onOpenProduct, onAcceptImplication, onDismissImplication,
}: OutcomeReturnProps) {
  const proposed = implications.filter((i) => !i.disposition || i.disposition === "proposed");

  return (
    <aside className="oret" role="complementary" aria-label="What came back">
      <div className="oret-head">
        <span className="oret-eyebrow"><CornerLeftUp size={12} /> What came back</span>
        <button type="button" className="oret-close" aria-label="Close outcome return" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <div className="oret-body">
        <section className="oret-sec">
          <div className="oret-slabel">Outcomes</div>
          {outcomes.length ? (
            outcomes.map((o) => (
              <OutcomeCard
                key={o.id}
                o={o}
                resolvableQuestionIds={resolvableQuestionIds}
                onOpenPipeline={onOpenPipeline}
                onFocusQuestion={onFocusQuestion}
                onOpenTeammate={onOpenTeammate}
                onOpenProduct={onOpenProduct}
              />
            ))
          ) : (
            <p className="oret-empty">No outcomes have returned yet. When a sent item gets a response — or you record what happened — it returns here toward the pipeline, question, and crew that earned it.</p>
          )}
        </section>

        {proposed.length ? (
          <section className="oret-sec">
            <div className="oret-slabel">Proposed product changes</div>
            {proposed.map((impl) => (
              <div className="oret-impl" key={impl.id}>
                <p className="oret-impl-text">{impl.text}</p>
                <p className="oret-impl-note">Accepting only stages a change for your review. Nothing edits your product until you approve it at the gate.</p>
                <div className="oret-impl-acts">
                  <button type="button" className="oret-impl-act is-accept" onClick={() => onAcceptImplication(impl)}>
                    Stage a change to review
                  </button>
                  <button type="button" className="oret-impl-act" onClick={() => onDismissImplication(impl)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
