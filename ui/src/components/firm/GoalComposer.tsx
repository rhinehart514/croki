import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ArrowUp, Check, FolderGit2, ShieldCheck } from "lucide-react";
import { driveTeammate, getRuntimeStatuses, type DriveTeammateResult, type FirmRuntimeStatus } from "@/api";
import type { FirmArchitectureElement, FirmBet, FirmConfiguration, FirmCrewMember } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RuntimePicker, type RuntimeChoice } from "./RuntimePicker";
import { COMPATIBLE_FIRM_CONFIGURATION } from "@/lib/firmConfiguration";
import { DirectionTargetChips } from "./DirectionTargetChips";
import { targetForComposer, type ComposerTarget } from "./goalComposerTarget";
import type { CanvasSelection } from "./directionTarget";

export type { CanvasSelection } from "./directionTarget";

function resizeComposer(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
}

export type DriveState = {
  teammateRef: string | null;
  teammateRefs: string[];
  teammateName: string;
  direction: string;
  betId: string | null;
  workRef: string | null;
};

function driveErrorMessage(cause: unknown) {
  const raw = cause instanceof Error ? cause.message : String(cause || "Drover could not take that direction.");
  try { return (JSON.parse(raw) as { error?: { message?: string } }).error?.message || raw; } catch { return raw; }
}

function commandForTarget(target: ComposerTarget, firstUse: boolean) {
  if (target.position === "ended") return { verb: "Ended", label: target.betLabel ?? "this direction" };
  if (target.theoryLabel) return { verb: "Correct", label: target.theoryLabel };
  if (target.workLabel) return { verb: "Refine", label: target.workLabel };
  if (target.architectureLabel) return {
    verb: target.architectureRole === "concept" ? "Refine" : "Direct",
    label: target.architectureLabel,
  };
  if (target.betLabel) return { verb: "Direct", label: target.betLabel };
  if (target.teammateNames.length) return { verb: "Direct", label: target.teammateNames.join(" + ") };
  if (firstUse) return { verb: "Explore", label: "this venture" };
  return { verb: "Direct", label: "the venture" };
}

export function GoalComposer({
  ventureId, repositoryName, crew, bets, configuration, selection, suggestion, onSuggestionConsumed,
  onDriveStateChange, onOpenWall, onDriven, architectureElements = [], readOnly = false,
  onClearSelection,
  readOnlyReason = "Reconnecting before changes can be sent…",
}: {
  ventureId: string;
  repositoryName?: string;
  crew: FirmCrewMember[];
  bets: FirmBet[];
  configuration?: FirmConfiguration;
  architectureElements?: FirmArchitectureElement[];
  selection: CanvasSelection;
  suggestion?: string | null;
  onSuggestionConsumed?: () => void;
  onDriveStateChange?: (state: DriveState | null) => void;
  onOpenWall?: () => void;
  onClearSelection?: () => void;
  onDriven: (result: DriveTeammateResult) => void;
  readOnly?: boolean;
  readOnlyReason?: string;
}) {
  const firmConfiguration = configuration ?? COMPATIBLE_FIRM_CONFIGURATION;
  const firstUse = !selection && bets.length === 0;
  const currentTarget = useMemo(
    () => targetForComposer(crew, bets, selection, firmConfiguration, firstUse, architectureElements),
    [architectureElements, bets, firmConfiguration, crew, firstUse, selection],
  );
  const [lockedTarget, setLockedTarget] = useState<ComposerTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [runtimes, setRuntimes] = useState<FirmRuntimeStatus[]>([]);
  const [runtime, setRuntime] = useState<RuntimeChoice>((firmConfiguration.defaults.runtime as RuntimeChoice) ?? "auto");
  const [statusReady, setStatusReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftRef = useRef("");
  const target = lockedTarget ?? currentTarget;
  const command = commandForTarget(target, firstUse);
  const visibleDraft = suggestion ?? draft;
  const blockedByPosition = target.position === "ended";
  const selectedRuntime = runtime === "auto" ? null : runtimes.find((entry) => entry.id === runtime);
  const runtimeConnected = runtime === "auto" ? runtimes.some((entry) => entry.connected) : selectedRuntime?.connected === true;
  const showRuntimePicker = !firstUse || (statusReady && !runtimeConnected);

  useEffect(() => {
    let live = true;
    getRuntimeStatuses().then(({ runtimes: available }) => {
      if (!live) return;
      setRuntimes(available);
      setStatusReady(true);
    }).catch(() => { if (live) setStatusReady(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!suggestion) return;
    window.requestAnimationFrame(() => { textareaRef.current?.focus(); if (textareaRef.current) resizeComposer(textareaRef.current); });
  }, [suggestion]);

  useEffect(() => {
    const receiveProposalAdjustment = (event: Event) => {
      const next = (event as CustomEvent<{ draft?: unknown }>).detail?.draft;
      if (typeof next !== "string" || !next.trim()) return;
      draftRef.current = next;
      setDraft(next);
      setLockedTarget(currentTarget);
      setError(null);
      setResult(null);
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        if (textareaRef.current) resizeComposer(textareaRef.current);
      });
    };
    window.addEventListener("drover:proposal-adjustment", receiveProposalAdjustment);
    return () => window.removeEventListener("drover:proposal-adjustment", receiveProposalAdjustment);
  }, [currentTarget]);

  useEffect(() => {
    if (!firstUse || crew.length === 0 || visibleDraft) return;
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [crew.length, firstUse, visibleDraft]);

  const changeDraft = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    if (suggestion) onSuggestionConsumed?.();
    if (next && !visibleDraft) setLockedTarget(currentTarget);
    else if (next && suggestion) setLockedTarget(currentTarget);
    if (!next) setLockedTarget(null);
    draftRef.current = next;
    setDraft(next); setError(null); setResult(null); resizeComposer(event.target);
  };

  const submit = async () => {
    const direction = visibleDraft.trim();
    if (!direction || busy || readOnly || blockedByPosition || !runtimeConnected) return;
    const submittedTarget = target;
    setBusy(true);
    onDriveStateChange?.({
      teammateRef: target.teammateRef,
      teammateRefs: target.teammateRefs,
      teammateName: target.teammateName,
      direction,
      betId: target.betId,
      workRef: target.workRef,
    });
    setError(null); setResult(null);
    draftRef.current = "";
    setDraft(""); onSuggestionConsumed?.(); setLockedTarget(null);
    if (textareaRef.current) textareaRef.current.style.height = "0px";
    try {
      const body = {
        ...(target.teammateRef ? { teammateRef: target.teammateRef } : {}),
        ...(target.teammateRefs.length ? { teammateRefs: target.teammateRefs } : {}),
        ...(target.betId ? { betId: target.betId } : {}),
        ...(target.workRef ? { workRef: target.workRef } : {}),
        ...(target.architectureId && target.architectureRevision != null ? {
          architectureTarget: {
            id: target.architectureId,
            stepId: target.architectureStepId ?? null,
            revision: target.architectureRevision,
          },
        } : {}),
        ...(target.theoryId && target.theorySubjectId ? {
          theoryTarget: { theoryId: target.theoryId, subjectId: target.theorySubjectId },
        } : {}),
        ...(runtime !== "auto" ? { runtime } : {}),
        goal: direction,
      };
      const response = await driveTeammate(ventureId, body);
      setResult(response.completion?.state === "partial"
        ? `Useful progress is saved. Still needed: ${response.completion.missing.join(" · ") || "one more inward turn"}.`
        : "Direction received. The conversation and canvas will show what changed.");
      onDriven(response);
    } catch (cause) {
      if (!draftRef.current) {
        draftRef.current = direction;
        setDraft(direction);
        setLockedTarget(submittedTarget);
      }
      setError(driveErrorMessage(cause));
    }
    finally { setBusy(false); onDriveStateChange?.(null); }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); return; }
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (visibleDraft) {
      setDraft(""); onSuggestionConsumed?.(); setLockedTarget(null); setError(null); setResult(null);
      if (textareaRef.current) textareaRef.current.style.height = "0px";
      draftRef.current = "";
      return;
    }
    onClearSelection?.();
  };

  return (
    <section
      className="firm-app-composer"
      aria-label={`Direction composer: ${target.title}`}
      data-dispatching={busy ? "true" : "false"}
      data-locked={lockedTarget || suggestion ? "true" : "false"}
    >
      {blockedByPosition ? (
        <div className="firm-app-composer-blocked" role="status">
          <strong>{command.verb} · {command.label}</strong><span>{target.consequence}</span>
          {target.position === "at-wall" ? <button type="button" onClick={onOpenWall}><ShieldCheck aria-hidden="true" /> Review what needs you</button> : null}
        </div>
      ) : (
        <form aria-label="Direction composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="firm-app-composer-command">
            <span><small>{command.verb}</small><strong>{command.label}</strong></span>
            <p title={target.consequence}>{target.consequence}</p>
          </div>
          {firstUse && !lockedTarget ? (
            <div className="firm-app-composer-first-use">
              <FolderGit2 aria-hidden="true" />
              <span><strong>{repositoryName || "Bound product repository"}</strong><small>Nothing leaves without your hand.</small></span>
            </div>
          ) : null}
          <div key={target.key} className="firm-app-composer-scope-arrival" data-selected={selection ? "true" : "false"}>
            <DirectionTargetChips target={target} locked={Boolean(lockedTarget || suggestion)} />
          </div>
          {target.position === "at-wall" && onOpenWall ? (
            <button type="button" className="firm-app-composer-held" onClick={onOpenWall}>
              <ShieldCheck aria-hidden="true" /> This outward action needs your hand · Review it
            </button>
          ) : null}
          <Textarea
            ref={textareaRef}
            id="firm-direction-composer"
            value={visibleDraft}
            onChange={changeDraft}
            onKeyDown={onKeyDown}
            placeholder={busy ? "Draft a correction while this work continues…" : target.prompt}
            aria-label={busy ? "Draft a correction while this work continues" : target.prompt}
            rows={1}
          />
          <div className="firm-app-composer-send">
            {showRuntimePicker ? <RuntimePicker runtimes={runtimes} value={runtime} onChange={setRuntime} disabled={busy || readOnly} /> : null}
            <Button type="submit" size="icon-lg" aria-label={`${command.verb} ${command.label}`} disabled={busy || readOnly || !visibleDraft.trim() || !statusReady || !runtimeConnected}>
              <ArrowUp aria-hidden="true" />
            </Button>
          </div>
        </form>
      )}
      <div className="firm-app-composer-feedback" aria-live="polite">
        {!statusReady ? <span>Checking local runtimes…</span> : null}
        {readOnly ? <span role="status">{readOnlyReason}</span> : null}
        {statusReady && !runtimeConnected ? <span role="alert">Choose a connected Claude or Codex runtime.</span> : null}
        {busy ? <span role="status">Work is active. Draft a correction now; send it when this move returns.</span> : null}
        {result ? <span role="status"><Check aria-hidden="true" /> {result}</span> : null}
        {error ? <span role="alert">{error}</span> : null}
      </div>
    </section>
  );
}
