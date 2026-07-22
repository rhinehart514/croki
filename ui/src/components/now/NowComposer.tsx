// One plain-words ask starts real work; scope is an attachment rather than another mode.
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, ArrowUp, LoaderCircle, Mic, PencilLine, X } from "lucide-react";
import { driveTeammate, replyInConversation, type DriveTeammateResult } from "@/api";
import { useDirections } from "./useDirections";
import { DirectionsTray } from "./DirectionsTray";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { composerRoute, composerScopeKey, scopedBody } from "./composerScope";
import { readDriveReceipt, readReplyReceipt, type DriveReceipt } from "./driveReceipt";
import { useScopedDraft } from "./useScopedDraft";
import { useSpeechInput } from "./useSpeechInput";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";
import { ComposerImageInput } from "./ComposerImages";
import { prepareComposerImages, type PendingComposerImage } from "./composerImageFiles";
import { useAgentComposer } from "./useAgentComposer";
import type { FirmConfiguration } from "@/types";
const EMPTY_SUGGESTIONS = [
  "Find the strongest next move",
  "Find the first 20 customers",
  "Sharpen the pitch",
  "Audit the first-run experience",
];

export function NowComposer({
  ventureId, ventureName, selection, scopeLabel, hasWork,
  variant = "hero", readOnly = false, readOnlyReason, autoFocus = false, focusRequest = 0,
  placeholder: placeholderOverride, submissionMode = "auto", onClearScope, onSubmitStart, onSubmitFailed,
  onDriven, onWorkRouted, onOpenResult, subjectRefs = [], runtimeOverride = null, modelOverride = null,
  effortOverride = null, composerControls = null, configuration = null, productGtmView = false, workflowSketch = false,
  modelBranchRef = null, artifactSection = null, onClearArtifactSection,
}: {
  ventureId: string; ventureName: string; selection: CanvasSelection; scopeLabel: string | null; hasWork: boolean;
  variant?: "hero" | "dock"; readOnly?: boolean;
  // Why the composer is held (stale/offline). Shown as a quiet honest line under the disabled field so a
  // founder never faces a dead input with no explanation (DESIGN.md: precise reason when blocked/stale).
  readOnlyReason?: string | null; autoFocus?: boolean; focusRequest?: number;
  // Optional placeholder override; the venture canvas passes the spec's "Direct the venture".
  placeholder?: string; submissionMode?: "auto" | "conversation" | "work" | "product-gtm";
  onClearScope?: () => void; onSubmitStart?: (message: string) => void; onSubmitFailed?: (message: string) => void;
  // Called after a turn lands so the frame re-polls. The result is present for a /drive (start work) and
  // omitted for a scoped conversation reply (steer/answer/approve), which returns no DriveTeammateResult.
  onDriven?: (result?: DriveTeammateResult) => void;
  // Contextual conversation may discover that the founder asked for real work. The server returns
  // the exact durable Thread; the owning surface decides how to reveal it.
  onWorkRouted?: (threadRef: string) => void;
  // When provided (the home composer), the receipt offers a way into the direction the drive produced.
  onOpenResult?: (targetBetId: string | null) => void; subjectRefs?: string[];
  runtimeOverride?: string | null; modelOverride?: string | null; effortOverride?: string | null; composerControls?: ReactNode;
  configuration?: FirmConfiguration | null;
  productGtmView?: boolean; workflowSketch?: boolean; modelBranchRef?: string | null;
  artifactSection?: ArtifactSectionFocus | null; onClearArtifactSection?: () => void;
}) {
  const route = composerRoute(selection);
  const contextualDraftRef = !selection && subjectRefs.length ? `:subjects:${[...subjectRefs].sort().join("|")}` : "";
  const [draft, setDraft] = useScopedDraft(`${composerScopeKey(ventureId, selection)}${contextualDraftRef}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DriveReceipt | null>(null);
  const [departingPrompt, setDepartingPrompt] = useState<{ id: number; text: string } | null>(null);
  const [sentArtifactSectionKey, setSentArtifactSectionKey] = useState<string | null>(null);
  const [images, setImages] = useState<PendingComposerImage[]>([]);
  const [draggingImages, setDraggingImages] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const agentComposer = useAgentComposer({ ventureId, draft, setDraft, textareaRef, configuration, readOnlyReason, onConfigurationChanged: () => onDriven?.() });
  // Intent options the founder deliberately summons: candidate directions grounded in venture truth + open
  // work. Picking one loads it into the composer; the actual turn still goes to the chosen SDK model.
  const directions = useDirections({ ventureId, mode: submissionMode, threadRef: selection?.threadRef ?? null });
  const speech = useSpeechInput((text) => {
    setDraft((current) => (current ? `${current} ${text}` : text));
    textareaRef.current?.focus();
  });
  useEffect(() => { if (autoFocus || focusRequest > 0) textareaRef.current?.focus(); }, [autoFocus, focusRequest]);
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [draft]);
  useEffect(() => {
    if (!departingPrompt) return undefined;
    const timer = window.setTimeout(() => setDepartingPrompt(null), 520);
    return () => window.clearTimeout(timer);
  }, [departingPrompt]);
  const artifactSectionKey = artifactSection ? `${artifactSection.artifactRef}\u0000${artifactSection.sectionId}\u0000${artifactSection.artifactAt ?? ""}` : null;
  const artifactRevisionSent = Boolean(artifactSectionKey && sentArtifactSectionKey === artifactSectionKey);
  const placeholder = placeholderOverride
    ?? (route === "correct"
      ? "Describe the correction to this exact work…"
      : route === "steer"
        ? "Continue this direction…"
        : scopeLabel
          ? "Direct work from this context…"
          : `What should Drover accomplish for ${ventureName}?`);

  // Contextual routing (the composer is operational, not a one-verb /drive box):
  //   • Scoped to a direction (a bet is selected) → the turn STEERS/answers/approves/continues that existing
  //     direction through the ONE venture conversation (replyInConversation). The brain classifies the act.
  //   • Unscoped, or scoped to a non-bet target (architecture/theory) → the turn DIRECTS the venture: /drive
  //     starts (or branches) work. /drive is only for starting or branching, never for steering.
  const submit = async (value: string) => {
    const goal = value.trim() || (images.length === 1 ? "Look at this image." : images.length ? "Look at these images." : "");
    if (!goal || busy || readOnly) return;
    const submittedImages = images;
    const imageBody = submittedImages.map(({ name, mediaType, data }) => ({ name, mediaType, data }));
    const teammateRefs = [...new Set([...(selection?.teammateRefs ?? []), ...agentComposer.mentionedAgentRefs])];
    onSubmitStart?.(goal);
    setDepartingPrompt({ id: Date.now(), text: goal });
    setBusy(true); setError(null); setReceipt(null); setDraft(""); setImages([]); directions.clear();
    try {
      if (submissionMode === "conversation" || submissionMode === "work" || submissionMode === "product-gtm" || route === "steer") {
        const reply = await replyInConversation(ventureId, {
          message: goal,
          ...(imageBody.length ? { images: imageBody } : {}),
          ...(selection?.betId ? { betId: selection.betId } : {}),
          ...(selection?.workRef ? { workRef: selection.workRef } : {}),
          ...(modelBranchRef ? { modelBranchRef } : {}),
          ...(selection?.threadRef ? { threadRef: selection.threadRef } : {}),
          ...(!selection?.threadRef && subjectRefs.length ? { subjectRefs } : {}),
          ...(agentComposer.mentionedAgentRefs.length ? { teammateRefs } : {}),
          ...(submissionMode === "work" ? { mode: "work" as const } : {}),
          ...(submissionMode === "conversation" || submissionMode === "product-gtm" ? { mode: "context" as const } : {}),
          ...(submissionMode === "work" && runtimeOverride ? { runtime: runtimeOverride } : {}),
          ...(submissionMode === "work" && modelOverride ? { model: modelOverride } : {}),
          ...(submissionMode === "work" && effortOverride ? { effort: effortOverride } : {}),
          ...(productGtmView ? { productGtmView: true } : workflowSketch ? { workflowSketch: true } : {}),
          ...(artifactSection ? { artifactSection: { title: artifactSection.sectionTitle, index: artifactSection.sectionIndex } } : {}),
        });
        if (artifactSectionKey) setSentArtifactSectionKey(artifactSectionKey);
        setReceipt(readReplyReceipt(reply));
        onDriven?.();
        if ((submissionMode === "conversation" || submissionMode === "product-gtm") && reply.act === "new-direction" && reply.threadRef) onWorkRouted?.(reply.threadRef);
      } else {
        const response = await driveTeammate(ventureId, {
          ...scopedBody(goal, selection),
          ...(agentComposer.mentionedAgentRefs.length ? { teammateRefs } : {}),
          ...(imageBody.length ? { images: imageBody } : {}),
          ...(runtimeOverride ? { runtime: runtimeOverride } : {}),
          ...(modelOverride ? { model: modelOverride } : {}),
          ...(effortOverride ? { effort: effortOverride } : {}),
        });
        setReceipt(readDriveReceipt(response));
        onDriven?.(response);
      }
      agentComposer.clearMentions();
    } catch (cause) {
      onSubmitFailed?.(goal);
      setSentArtifactSectionKey(null);
      setDraft(goal);
      setImages(submittedImages);
      setError(cause instanceof Error ? cause.message : "Drover could not take that direction.");
    } finally { setBusy(false); }
  };

  const addImages = async (files: File[]) => {
    try { setImages(await prepareComposerImages(files, images)); setError(null); setReceipt(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Drover could not attach those images."); }
  };

  const pastedImages = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
    if (files.length) void addImages(files);
  };

  const droppedImages = (event: DragEvent<HTMLElement>) => {
    event.preventDefault(); setDraggingImages(false);
    const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
    if (files.length) void addImages(files);
  };

  const pickDirection = (direction: string) => {
    setDraft(direction); directions.clear(); textareaRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (agentComposer.onKeyDown(event)) return;
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit(draft);
    }
  };

  // First-direction affordance: the empty-venture suggestion chips. Shown on the hero (the Now landing)
  // and, for the empty canvas, on the dock — an empty venture has nothing to click, so the dock offers the
  // first moves rather than a bare "Direct the venture" field over an empty plane. Never while a scope is
  // attached, mid-run, or held (read-only), on either variant.
  const showChips = !hasWork && !busy && !scopeLabel && !readOnly;

  return (
    <section className="now-composer" data-variant={variant} data-busy={busy ? "true" : "false"} data-dragging-images={draggingImages ? "true" : undefined} data-launching={departingPrompt ? "true" : undefined} data-intent={directions.loading ? "loading" : undefined} data-submission-mode={submissionMode} aria-label="Direct this venture" onDragOver={(event) => { if ([...event.dataTransfer.items].some((item) => item.type.startsWith("image/"))) { event.preventDefault(); setDraggingImages(true); } }} onDragLeave={() => setDraggingImages(false)} onDrop={droppedImages}>
      <div className="now-composer-shell">
        {departingPrompt ? <span key={departingPrompt.id} className="now-composer-flight" aria-hidden="true">{departingPrompt.text}</span> : null}
        {scopeLabel ? (
          <span className="now-composer-scope">
            <span className="now-composer-scope-label" title={scopeLabel}>{scopeLabel}</span>
            {onClearScope ? (
              <button type="button" aria-label="Clear scope — direct the whole venture" onClick={onClearScope}>
                <X aria-hidden="true" style={{ width: 13, height: 13 }} />
              </button>
            ) : null}
          </span>
        ) : null}
        {artifactSection ? (
          <div className="now-composer-artifact-target">
            <span><PencilLine aria-hidden="true" /><strong>{artifactSection.sectionTitle}</strong></span>
            <small>{busy ? "Sending revision…" : artifactRevisionSent ? "Revision sent to this Thread" : "Revise this section in the same Thread"}</small>
            {onClearArtifactSection ? <button type="button" aria-label="Clear artifact section" onClick={onClearArtifactSection}><X aria-hidden="true" /></button> : null}
          </div>
        ) : null}
        {images.length ? <div className="now-composer-image-tray"><ComposerImageInput images={images} disabled={readOnly || busy} onChoose={(files) => void addImages(files)} onRemove={(id) => setImages((current) => current.filter((image) => image.id !== id))} /></div> : null}
        <form className="now-composer-field" onSubmit={(event) => { event.preventDefault(); void submit(draft); }}>
          <div className="now-composer-input">
            {agentComposer.menu}
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(event) => { agentComposer.onDraftChange(event.target.value, event.target.selectionStart); setError(null); setReceipt(null); }}
              onClick={(event) => agentComposer.onCaretChange(event.currentTarget.selectionStart)}
              onKeyUp={(event) => agentComposer.onCaretChange(event.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
              onPaste={pastedImages}
              placeholder={placeholder}
              aria-label="Say what you want for this venture"
              {...agentComposer.inputAria}
              disabled={readOnly}
            />
          </div>
          <div className="now-composer-tools">
            {!images.length ? <ComposerImageInput images={images} disabled={readOnly || busy} onChoose={(files) => void addImages(files)} onRemove={() => undefined} /> : null}
            <button type="button" className="now-intent-orb" aria-label="Read my intent — suggest directions"
              onClick={() => directions.summon(draft)} disabled={readOnly || busy || directions.loading} />
            {speech.supported ? (
              <button
                type="button"
                className="now-icon-btn"
                data-recording={speech.recording ? "true" : undefined}
                aria-label={speech.recording ? "Stop dictation" : "Speak your direction"}
                aria-pressed={speech.recording}
                onClick={speech.toggle}
                disabled={readOnly}
              >
                <Mic aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="submit"
              className="now-composer-send"
              aria-label={busy ? "Working" : submissionMode === "conversation" || submissionMode === "work" || submissionMode === "product-gtm" ? "Send to this thread" : route === "steer" ? "Send to this direction" : route === "correct" ? "Correct this work" : "Start work"}
              disabled={busy || readOnly || (!draft.trim() && !images.length)}
            >
              {busy ? <LoaderCircle className="now-composer-spinner" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
            </button>
          </div>
        </form>
        <DirectionsTray options={directions.options} loading={directions.loading} onPick={pickDirection} />
        {composerControls}
      </div>

      <div className="now-composer-provenance" aria-hidden="true">
        Drover chooses how to do the work. Nothing leaves without your decision.
      </div>

      {showChips ? (
        <div className="now-composer-chips">
          {EMPTY_SUGGESTIONS.map((intent) => (
            <button key={intent} type="button" className="now-chip" onClick={() => void submit(intent)} disabled={readOnly}>
              {intent}
            </button>
          ))}
        </div>
      ) : null}

      <div className="now-composer-feedback" aria-live="polite">
        {speech.recording ? <span role="status">Listening…</span> : null}
        {busy ? <span role="status">{submissionMode === "work" ? "Starting coding work…" : submissionMode === "product-gtm" ? "Agents are shaping the workflow…" : submissionMode === "conversation" || route === "steer" ? "Sending…" : route === "correct" ? "Correcting…" : "Starting work…"}</span> : null}
        {error ? <span role="alert">{error}</span> : null}
        {readOnly && readOnlyReason && !error ? (
          <span className="now-composer-held" role="status">{readOnlyReason}</span>
        ) : null}
      </div>

      {receipt ? (
        <div className="now-drive-receipt" data-waiting={receipt.waiting ? "true" : "false"} role="status">
          <div className="now-drive-receipt-body">
            <span className="now-drive-receipt-headline">{receipt.headline}</span>
            {receipt.detail ? <span className="now-drive-receipt-detail">{receipt.detail}</span> : null}
          </div>
          {onOpenResult && receipt.targetBetId ? (
            <button type="button" className="now-drive-receipt-open" onClick={() => onOpenResult(receipt.targetBetId)}>
              {receipt.waiting ? "Make the decision" : "Open this direction"}
              <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      {agentComposer.dialog}
    </section>
  );
}
