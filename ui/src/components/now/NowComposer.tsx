// One plain-words ask starts real work; scope is an attachment rather than another mode.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, LoaderCircle, Mic, PencilLine, Square, X } from "lucide-react";
import { driveTeammate, replyInConversation, stopActiveDrive } from "@/api";
import { useDirections } from "./useDirections";
import { DirectionsTray } from "./DirectionsTray";
import { composerRoute, composerScopeKey, scopedBody } from "./composerScope";
import { readDriveReceipt, readReplyReceipt, type DriveReceipt } from "./driveReceipt";
import { useComposerDraft } from "./useScopedDraft";
import { useSpeechInput } from "./useSpeechInput";
import { expandFileMentions } from "./composerFileMentions";
import { ComposerMentionBackdrop } from "./ComposerMentionBackdrop";
import { ComposerImageInput } from "./ComposerImages";
import { useComposerImageIntake } from "./useComposerImages";
import { useAgentComposer } from "./useAgentComposer";
import { usePreviewAnnotationIntake } from "./usePreviewAnnotationIntake";
import { NowComposerFooter } from "./NowComposerFooter";
import { ComposerJourneyInput } from "./ComposerJourneyInput";
import { useJourneyImportIntake } from "./useJourneyImportIntake";
import type { NowComposerProps } from "./nowComposerTypes";

export function NowComposer({
  ventureId, ventureName, selection, scopeLabel, hasWork,
  variant = "hero", readOnly = false, readOnlyReason, autoFocus = false, focusRequest = 0,
  placeholder: placeholderOverride, submissionMode = "auto", onClearScope, onSubmitStart, onSubmitAccepted, onSubmitFailed,
  onDriven, onWorkRouted, onOpenResult, subjectRefs = [], runtimeOverride = null, modelOverride = null,
  effortOverride = null, composerControls = null, configuration = null, productGtmView = false, workflowSketch = false,
  modelBranchRef = null, artifactSection = null, onClearArtifactSection, workflowStep = null, repositoryFiles = [], activeDrive = null,
  journeyImportEnabled = false,
}: NowComposerProps) {
  const route = composerRoute(selection);
  const contextualDraftRef = !selection && subjectRefs.length ? `:subjects:${[...subjectRefs].sort().join("|")}` : "";
  // Draft text, attachments, and file chips live in per-scope presentation memory so an unsent thought
  // survives Thread switches and an app restart.
  const { draft, setDraft, images, setImages, fileMentions, setFileMentions, journeyImport, setJourneyImport } = useComposerDraft(`${composerScopeKey(ventureId, selection)}${contextualDraftRef}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DriveReceipt | null>(null);
  const [departingPrompt, setDepartingPrompt] = useState<{ id: number; text: string } | null>(null);
  const [sentArtifactSectionKey, setSentArtifactSectionKey] = useState<string | null>(null);
  const [interrupting, setInterrupting] = useState(false);
  const imageIntake = useComposerImageIntake({ images, setImages, onSettled: (issue) => { setError(issue); if (!issue) setReceipt(null); } });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const agentComposer = useAgentComposer({ ventureId, draft, setDraft, textareaRef, configuration, readOnlyReason, repositoryFiles, fileMentions, onFileMentions: setFileMentions, onConfigurationChanged: () => onDriven?.() });
  // Intent options the founder deliberately summons: candidate directions grounded in venture truth + open
  // work. Picking one loads it into the composer; the actual turn still goes to the chosen SDK model.
  const directions = useDirections({ ventureId, mode: submissionMode, threadRef: selection?.threadRef ?? null });
  const journeyIntake = useJourneyImportIntake({
    ventureId, enabled: journeyImportEnabled, readOnly, busy,
    attachment: journeyImport, setAttachment: setJourneyImport, textareaRef,
    onIssue: (issue) => { setError(issue); if (!issue) setReceipt(null); },
  });
  // An element picked in this Thread's preview pane arrives here as a context block + screenshot.
  usePreviewAnnotationIntake({ enabled: submissionMode === "work" && !readOnly, setDraft, setImages, focus: () => textareaRef.current?.focus() });
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
      ? "Describe the correction to this work…"
      : route === "steer"
        ? "Continue this direction…"
        : scopeLabel
          ? "Direct work from this context…"
          : `What should Croki accomplish for ${ventureName}?`);

  // Contextual routing (the composer is operational, not a one-verb /drive box):
  //   • Scoped to a direction (a bet is selected) → the turn STEERS/answers/approves/continues that existing
  //     direction through the ONE venture conversation (replyInConversation). The brain classifies the act.
  //   • Unscoped, or scoped to a non-bet target (architecture/theory) → the turn DIRECTS the venture: /drive
  //     starts (or branches) work. /drive is only for starting or branching, never for steering.
  const submit = async (value: string) => {
    const typed = value.trim() || (journeyImport ? "Map this observed journey source to the current Product walk." : images.length === 1 ? "Look at this image." : images.length ? "Look at these images." : "");
    if (!typed || busy || readOnly) return;
    // What the agent reads: every file chip expands to its exact repo-relative path. The transcript and
    // the immediate founder turn carry the same expanded text, so nothing shown differs from what was sent.
    const goal = expandFileMentions(typed, fileMentions);
    const submittedImages = images;
    const submittedJourneyImport = journeyImport;
    const imageBody = submittedImages.map(({ name, mediaType, data }) => ({ name, mediaType, data }));
    const teammateRefs = [...new Set([...(selection?.teammateRefs ?? []), ...agentComposer.mentionedAgentRefs])];
    onSubmitStart?.(goal);
    setDepartingPrompt({ id: Date.now(), text: goal });
    setBusy(true); setError(null); setReceipt(null); setDraft(""); setImages([]); setJourneyImport(null); directions.clear();
    try {
      if (submissionMode === "conversation" || submissionMode === "work" || submissionMode === "product-gtm" || route === "steer") {
        const reply = await replyInConversation(ventureId, {
          message: goal,
          ...(imageBody.length ? { images: imageBody } : {}),
          ...(submittedJourneyImport ? { journeyImportRef: submittedJourneyImport.importRef } : {}),
          ...(selection?.betId ? { betId: selection.betId } : {}),
          ...(selection?.workRef ? { workRef: selection.workRef } : {}),
          ...(modelBranchRef ? { modelBranchRef } : {}),
          ...(selection?.threadRef ? { threadRef: selection.threadRef } : {}),
          ...(!selection?.threadRef && subjectRefs.length ? { subjectRefs: workflowStep ? [...new Set([...subjectRefs, workflowStep.ref])] : subjectRefs } : {}),
          ...(workflowStep ? { workflowStep: { id: workflowStep.id, label: workflowStep.label, position: workflowStep.position } } : {}),
          ...(agentComposer.mentionedAgentRefs.length ? { teammateRefs } : {}),
          ...(submissionMode === "work" ? { mode: "work" as const } : {}),
          ...(submissionMode === "conversation" || submissionMode === "product-gtm" ? { mode: "context" as const } : {}),
          ...(submissionMode === "work" && runtimeOverride ? { runtime: runtimeOverride } : {}),
          ...(submissionMode === "work" && modelOverride ? { model: modelOverride } : {}),
          ...((submissionMode === "work" || submissionMode === "product-gtm") && effortOverride ? { effort: effortOverride } : {}),
          ...(workflowStep ? { workflowSketch: true } : productGtmView ? { productGtmView: true } : workflowSketch ? { workflowSketch: true } : {}),
          ...(artifactSection ? { artifactSection: { title: artifactSection.sectionTitle, index: artifactSection.sectionIndex } } : {}),
        });
        onSubmitAccepted?.(goal, reply);
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
      // Restore the founder's own token form (chips intact), not the expanded wire text.
      setDraft(typed);
      setImages(submittedImages);
      setJourneyImport(submittedJourneyImport);
      setError(cause instanceof Error ? cause.message : "Croki could not take that direction.");
    } finally { setBusy(false); }
  };

  // Honest interrupt: ask the running drive to stop at its next safe boundary. The typed draft is left
  // untouched, so the founder can send it as the corrected direction the moment the step ends.
  const interrupt = async () => {
    if (!activeDrive || interrupting || activeDrive.abortRequestedAt) return;
    setInterrupting(true); setError(null);
    try {
      await stopActiveDrive(ventureId, activeDrive.id);
      onDriven?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Croki could not stop the current step.");
    } finally { setInterrupting(false); }
  };
  const stoppable = Boolean(activeDrive?.abortSupported);
  const stopRequested = Boolean(activeDrive?.abortRequestedAt) || interrupting;

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
    <section className="now-composer" data-variant={variant} data-busy={busy ? "true" : "false"} data-dragging-images={imageIntake.dragging ? "true" : undefined} data-launching={departingPrompt ? "true" : undefined} data-intent={directions.loading ? "loading" : undefined} data-submission-mode={submissionMode} aria-label="Direct this venture" onDragOver={imageIntake.onDragOver} onDragLeave={imageIntake.onDragLeave} onDrop={imageIntake.onDrop}>
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
        {images.length ? <div className="now-composer-image-tray"><ComposerImageInput images={images} disabled={readOnly || busy} onChoose={(files) => void imageIntake.add(files)} onRemove={(id) => setImages((current) => current.filter((image) => image.id !== id))} /></div> : null}
        {journeyImport ? <ComposerJourneyInput attachment={journeyImport} disabled={readOnly || busy} staging={journeyIntake.staging} onChoose={(file) => void journeyIntake.choose(file)} onRemove={journeyIntake.remove} /> : null}
        <form className="now-composer-field" onSubmit={(event) => { event.preventDefault(); void submit(draft); }}>
          <div className="now-composer-input">
            {agentComposer.menu}
            <ComposerMentionBackdrop ref={backdropRef} draft={draft} mentions={fileMentions} />
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(event) => { agentComposer.onDraftChange(event.target.value, event.target.selectionStart); setError(null); setReceipt(null); }}
              onClick={(event) => agentComposer.onCaretChange(event.currentTarget.selectionStart)}
              onKeyUp={(event) => agentComposer.onCaretChange(event.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
              onPaste={imageIntake.onPaste}
              onScroll={(event) => { if (backdropRef.current) backdropRef.current.scrollTop = event.currentTarget.scrollTop; }}
              placeholder={placeholder}
              aria-label="Say what you want for this venture"
              {...agentComposer.inputAria}
              disabled={readOnly}
            />
          </div>
          <div className="now-composer-tools">
            {!images.length ? <ComposerImageInput images={images} disabled={readOnly || busy} onChoose={(files) => void imageIntake.add(files)} onRemove={() => undefined} /> : null}
            {journeyImportEnabled && !journeyImport ? <ComposerJourneyInput attachment={null} disabled={readOnly || busy} staging={journeyIntake.staging} onChoose={(file) => void journeyIntake.choose(file)} onRemove={() => undefined} /> : null}
            <button type="button" className="now-intent-orb" aria-label="Read my intent — suggest directions"
              onClick={() => directions.summon(draft)} disabled={readOnly || busy || directions.loading} />
            {speech.supported ? (
              <button type="button" className="now-icon-btn" data-recording={speech.recording ? "true" : undefined}
                aria-label={speech.recording ? "Stop dictation" : "Speak your direction"} aria-pressed={speech.recording}
                onClick={speech.toggle} disabled={readOnly}>
                <Mic aria-hidden="true" />
              </button>
            ) : null}
            {stoppable ? (
              <button
                type="button"
                className="now-composer-stop"
                data-requested={stopRequested ? "true" : undefined}
                aria-label={stopRequested ? "Stopping at the next safe point" : "Stop the current step"}
                title={stopRequested ? "Stopping at the next safe point" : "Stop the current step; your draft is kept so you can steer"}
                onClick={() => void interrupt()}
                disabled={stopRequested}
              >
                {stopRequested ? <LoaderCircle className="now-composer-spinner" aria-hidden="true" /> : <Square aria-hidden="true" />}
              </button>
            ) : null}
            <button
              type="submit"
              className="now-composer-send"
              aria-label={busy ? "Working" : submissionMode === "conversation" || submissionMode === "work" || submissionMode === "product-gtm" ? "Send to this thread" : route === "steer" ? "Send to this direction" : route === "correct" ? "Correct this work" : "Start work"}
              disabled={busy || readOnly || (!draft.trim() && !images.length && !journeyImport)}
            >
              {busy ? <LoaderCircle className="now-composer-spinner" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
            </button>
          </div>
        </form>
        <DirectionsTray options={directions.options} loading={directions.loading} onPick={pickDirection} />
        {composerControls}
      </div>

      <NowComposerFooter
        showChips={showChips} readOnly={readOnly} readOnlyReason={readOnlyReason} busy={busy} error={error}
        recording={speech.recording} submissionMode={submissionMode} route={route} activeDrive={activeDrive}
        stopRequested={stopRequested} hasDraft={Boolean(draft.trim())} receipt={receipt}
        onPickSuggestion={(intent) => void submit(intent)} onOpenResult={onOpenResult}
      />
      {agentComposer.dialog}
    </section>
  );
}
