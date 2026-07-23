// The exact founder decision, presented with the precision Cursor uses for applying a diff — but the
// outward-authority boundary stays binary and server-enforced. The founder reviews the produced thing
// first (a real diff or a preview), then decides. A deploy still requires two explicit acts: Authorize,
// then Send — the two-word invariant expressed as two deliberate clicks. Wires to decideWallItem; the
// note carries a hold/answer reason.
import { useMemo, useRef, useState } from "react";
import { decideWallItem, type WallDecision, type WallQueueItemView } from "@/api";
import { reviewContent } from "@/components/lens/wallReviewContent";
import { DiffView, FilesChanged, ArtifactPreview } from "@/components/review";
import { parseUnifiedDiff } from "@/components/review/parseDiff";
import { resolveEffectArtifact } from "./reviewArtifact";

function ExactDiffReview({ diff }: { diff: string }) {
  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const path = selectedPath && files.some((file) => file.path === selectedPath) ? selectedPath : files[0]?.path ?? null;
  return (
    <div className="now-review-changes">
      <FilesChanged diff={diff} selectedPath={path} onSelectFile={setSelectedPath} />
      <DiffView diff={diff} path={path} />
    </div>
  );
}

export function DecisionGate({
  ventureId,
  item,
  onDecided,
  onRevise,
  readOnlyReason = null,
  showArtifact = true,
  onReconnect,
}: {
  ventureId: string;
  item: WallQueueItemView;
  onDecided: () => void;
  onRevise?: () => void;
  readOnlyReason?: string | null;
  // When the exact change is already rendered prominently above (Exact changes), the gate suppresses
  // its own copy so the diff is shown once, not twice.
  showArtifact?: boolean;
  onReconnect?: () => void;
}) {
  const content = reviewContent(item);
  const artifact = showArtifact ? resolveEffectArtifact(item.effect) : null;
  const effectKind = String(item.effect.kind ?? "").toLowerCase();
  const isDeploy = effectKind === "deploy";
  const failureHeading = isDeploy ? "Nothing was deployed." : effectKind === "product-change" ? "Nothing was applied." : "Nothing was sent.";
  const [authorized, setAuthorized] = useState<boolean>(Boolean(item.deployAuthorizedAt));
  const [busy, setBusy] = useState<WallDecision | null>(null);
  const [note, setNote] = useState("");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  // A same-tick double-activation (a real double-click, or a stray duplicate dispatch) fires both click
  // handlers before React commits the `busy` state update, so the `disabled={decisionDisabled}` render guard
  // alone cannot stop the second call. This ref is set synchronously, in the same turn as the first call,
  // so it closes that gap without changing the founder-facing disabled/label behavior driven by `busy`.
  const inFlight = useRef(false);

  const decide = async (decision: WallDecision, noteValue?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(decision); setError(null);
    try {
      await decideWallItem(ventureId, item.id, { decision, note: noteValue ?? null });
      if (decision === "authorize-deploy") { setAuthorized(true); }
      else onDecided();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Croki could not record that decision.");
      if (decision === "release") onDecided();
    } finally { setBusy(null); inFlight.current = false; }
  };

  // A judgment request is presented as concise founder-facing language, not the raw agent question.
  const isAnswer = item.purpose === "answer";
  const isProviderPermission = effectKind === "provider-permission";
  const providerQuestions = Array.isArray(item.effect.questions)
    ? (item.effect.questions as Array<Record<string, unknown>>).flatMap((question, index) => {
        const prompt = typeof question.question === "string" ? question.question.trim() : "";
        if (!prompt) return [];
        const questionOptions = Array.isArray(question.options)
          ? (question.options as Array<Record<string, unknown>>).flatMap((option) => (
              typeof option.label === "string" && option.label.trim()
                ? [{
                    label: option.label.trim(),
                    description: typeof option.description === "string" ? option.description.trim() : "",
                    preview: typeof option.preview === "string" ? option.preview.trim() : "",
                  }]
                : []
            ))
          : [];
        return [{
          id: typeof question.id === "string" ? question.id : `question-${index + 1}`,
          header: typeof question.header === "string" ? question.header : `Question ${index + 1}`,
          question: prompt,
          options: questionOptions,
          multiSelect: question.multiSelect === true,
        }];
      })
    : [];
  const rawQuestion = isProviderPermission
    ? String(item.effect.exactAction ?? item.effect.description ?? "").trim() || null
    : typeof item.effect.question === "string" ? item.effect.question.trim() : null;
  const options = Array.isArray(item.effect.options)
    ? (item.effect.options as unknown[]).filter((option): option is string => typeof option === "string")
    : [];
  const decisionTitle = isProviderPermission
    ? String(item.effect.title ?? "Claude needs permission")
    : isAnswer ? "How should this work continue?" : content.title;
  const selectedAnswer = providerQuestions.map((question) => {
    const values = selectedAnswers[question.id] ?? [];
    return values.length ? `${question.header}: ${values.join(", ")}` : null;
  }).filter(Boolean).join("\n");
  const completeAnswer = [selectedAnswer, note.trim()].filter(Boolean).join("\n");
  const everyStructuredQuestionAnswered = providerQuestions.every(
    (question) => (selectedAnswers[question.id] ?? []).length > 0,
  );
  const canSendAnswer = Boolean(completeAnswer)
    && (!providerQuestions.length || everyStructuredQuestionAnswered || Boolean(note.trim()));
  const toggleAnswer = (questionId: string, label: string, multiSelect: boolean) => {
    setSelectedAnswers((current) => {
      const selected = current[questionId] ?? [];
      const next = multiSelect
        ? selected.includes(label) ? selected.filter((value) => value !== label) : [...selected, label]
        : [label];
      return { ...current, [questionId]: next };
    });
  };

  // Detail rows minus the raw-diff row (rendered visually) and, for a judgment request, minus the raw
  // question rows (surfaced as concise language + provenance instead).
  const rows = isAnswer ? [] : content.details.filter((detail) => detail.tone !== "artifact");
  const decisionDisabled = busy !== null || Boolean(readOnlyReason);

  return (
    <div className="now-gate">
      <div className="now-gate-head">
        <span className="now-gate-eyebrow">{isAnswer ? "Your judgment is needed" : content.eyebrow}</span>
        <span className="now-gate-title">{decisionTitle}</span>
        {isAnswer && rawQuestion && !providerQuestions.length ? <p className="now-gate-question">{rawQuestion}</p> : null}
      </div>
      {artifact?.kind === "diff" ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">What changed</span>
          <ExactDiffReview diff={artifact.diff} />
        </div>
      ) : artifact?.kind === "preview" ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">What was produced</span>
          <ArtifactPreview artifact={artifact.artifact} />
        </div>
      ) : null}

      {rows.length ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">Exactly what would happen</span>
          <ul className="now-detail-list">
            {rows.map((detail) => <li key={detail.label}><span>{detail.label}: {detail.value}</span></li>)}
          </ul>
        </div>
      ) : null}

      <div className="now-gate-note">
        Nothing changes until you decide here. Croki records the exact decision.
        {isDeploy ? " A deploy needs two acts: authorize it, then deploy." : ""}
      </div>

      {item.lastExecutionError ? <div className="now-gate-execution-failure" role="alert">
        <strong>{failureHeading}</strong>
        <p>{item.lastExecutionError}</p>
        {item.needsReconnect && onReconnect ? <button type="button" className="now-gate-btn" onClick={onReconnect}>Reconnect Gmail</button> : null}
      </div> : null}

      {item.purpose === "release" ? (
        <div className="now-gate-actions">
          {isDeploy && !authorized ? (
            <button type="button" className="now-gate-btn" data-intent="release" disabled={decisionDisabled || !content.releaseReady} onClick={() => decide("authorize-deploy")}>
              {busy === "authorize-deploy" ? "Arming…" : content.releaseReady ? "Authorize deploy" : "Deploy unavailable"}
            </button>
          ) : (
            <button
              type="button"
              className="now-gate-btn"
              data-intent="release"
              disabled={decisionDisabled || !content.releaseReady}
              onClick={() => decide("release", note.trim() || undefined)}
            >
              {busy === "release" ? (isDeploy ? "Deploying…" : "Sending…") : item.lastExecutionError ? (isDeploy ? "Retry deploy" : "Retry send") : isDeploy ? "Deploy" : "Approve & send"}
            </button>
          )}
          {onRevise ? <button type="button" className="now-gate-btn" onClick={onRevise}>Revise</button> : null}
          <button type="button" className="now-gate-btn" data-intent="reject" disabled={decisionDisabled} onClick={() => decide("reject", note.trim() || "Held by the founder for now.")}>
            {busy === "reject" ? "Holding…" : "Reject"}
          </button>
        </div>
      ) : isAnswer ? (
        <div className="now-detail-block">
          <p className="now-detail-why">Your answer steers this direction — Croki stopped rather than decide it for you.</p>
          {providerQuestions.length ? (
            <div className="now-provider-questions">
              {providerQuestions.map((question) => (
                <section key={question.id} className="now-provider-question">
                  <span>{question.header}</span>
                  <p>{question.question}</p>
                  <div className="now-provider-options">
                    {question.options.map((option) => {
                      const selected = (selectedAnswers[question.id] ?? []).includes(option.label);
                      return (
                        <button
                          key={option.label}
                          type="button"
                          className="now-provider-option"
                          aria-pressed={selected}
                          disabled={decisionDisabled}
                          onClick={() => toggleAnswer(question.id, option.label, question.multiSelect)}
                        >
                          <strong>{option.label}</strong>
                          {option.description ? <small>{option.description}</small> : null}
                          {selected && option.preview ? <pre>{option.preview}</pre> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : options.length ? (
            <div className="now-gate-actions">
              {options.map((option) => (
                <button key={option} type="button" className="now-gate-btn" data-intent="release" disabled={decisionDisabled} onClick={() => decide("answer", option)}>{option}</button>
              ))}
            </div>
          ) : null}
          <div className="now-gate-words">
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={options.length ? "…or answer in your own words" : "Your answer…"} aria-label="Your answer" />
            <button type="button" className="now-gate-btn" data-intent="release" disabled={decisionDisabled || !canSendAnswer} onClick={() => decide("answer", completeAnswer)}>Send answer</button>
          </div>
          <div className="now-gate-actions">
            <button type="button" className="now-gate-btn" data-intent="reject" disabled={decisionDisabled} onClick={() => decide("dismiss")}>Dismiss</button>
          </div>
        </div>
      ) : item.purpose === "end-bet" ? (
        <div className="now-gate-actions">
          <button type="button" className="now-gate-btn" data-intent="reject" disabled={decisionDisabled} onClick={() => decide("kill")}>End this work</button>
          <button type="button" className="now-gate-btn" disabled={decisionDisabled} onClick={() => decide("keep")}>Keep it going</button>
        </div>
      ) : (
        <div className="now-gate-actions">
          <button type="button" className="now-gate-btn" data-intent="release" disabled={decisionDisabled} onClick={() => decide("acknowledge")}>Acknowledge</button>
        </div>
      )}

      {isDeploy && authorized ? <p className="now-gate-hint">Deploy authorized. Deploy now, or reject to hold.</p> : null}
      {error ? (
        <p className="now-gate-error" role="alert">{error}</p>
      ) : readOnlyReason ? (
        <p className="now-gate-hint">{readOnlyReason}</p>
      ) : null}
    </div>
  );
}
