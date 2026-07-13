import { useId, useState } from "react";
import { listGoalConflictDecisions, recordGoalConflictDecision } from "@/api";
import type { GoalConflictResolution } from "@/openCanvasTypes";
import type { WovenGoalConflict } from "@/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import "./GoalConflictResolutionControl.css";

type Props = {
  projectId: string;
  conflict: WovenGoalConflict;
  founderId: string;
  goalLabels?: Record<string, string>;
  onResolved?: (result: Awaited<ReturnType<typeof recordGoalConflictDecision>>) => void;
};

const resolutionLabel: Record<GoalConflictResolution, string> = {
  "keep-separate": "Keep the work separate",
  "choose-goal": "Choose one goal for this object",
  "acknowledge-coexistence": "Let both goals use it",
};

function freshKey(conflictId: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `goal-conflict:${conflictId}:${suffix}`;
}

function GoalConflictResolutionControlInner({
  projectId, conflict, founderId, goalLabels = {}, onResolved,
}: Props) {
  const groupId = useId();
  const [current, setCurrent] = useState(conflict.resolution);
  const [editing, setEditing] = useState(!conflict.resolution);
  const [resolution, setResolution] = useState<GoalConflictResolution>(conflict.resolution?.resolution ?? "keep-separate");
  const [chosenGoalId, setChosenGoalId] = useState(conflict.resolution?.chosenGoalRef?.id ?? conflict.goalRefs[0]?.id ?? "");
  const [note, setNote] = useState(conflict.resolution?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (current && !editing) {
    const chosen = current.chosenGoalRef?.id;
    return (
      <section className="goal-conflict-resolution is-resolved" aria-label="Resolved shared work decision">
        <div>
          <p className="goal-conflict-resolution__eyebrow">Founder decision</p>
          <p className="goal-conflict-resolution__decision">
            {resolutionLabel[current.resolution]}
            {chosen ? `: ${goalLabels[chosen] ?? chosen}` : ""}
          </p>
          {current.note ? <p className="goal-conflict-resolution__note">{current.note}</p> : null}
          <p className="goal-conflict-resolution__receipt">
            Recorded by {current.decidedBy.id}, revision {current.revision + 1}
          </p>
        </div>
        <Button type="button" variant="outline" className="goal-conflict-resolution__quiet" onClick={() => setEditing(true)}>
          Change
        </Button>
      </section>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const authority = await listGoalConflictDecisions(projectId);
      const latest = authority.decisions.find((decision) => decision.conflictId === conflict.id);
      const visibleRevision = current?.revision ?? null;
      const latestRevision = latest?.revision ?? null;
      if (visibleRevision !== latestRevision) {
        throw new Error("This shared-work decision changed elsewhere. Refresh the canvas before recording another call.");
      }
      const result = await recordGoalConflictDecision(projectId, conflict.id, {
        idempotencyKey: freshKey(conflict.id),
        expectedStoreRevision: authority.storeRevision,
        ...(latest ? { expectedDecisionRevision: latest.revision } : {}),
        resolution,
        ...(resolution === "choose-goal" ? { chosenGoalRef: { type: "goal", id: chosenGoalId } } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        decidedBy: { type: "founder", id: founderId },
      });
      setCurrent(result.decision);
      setEditing(false);
      onResolved?.(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The decision could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="goal-conflict-resolution" onSubmit={submit} aria-busy={busy}>
      <div className="goal-conflict-resolution__heading">
        <div>
          <p className="goal-conflict-resolution__eyebrow">Shared work needs your call</p>
          <h3>{conflict.summary}</h3>
        </div>
        {current ? (
          <Button type="button" variant="outline" className="goal-conflict-resolution__quiet" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
      <p className="goal-conflict-resolution__context">
        These goals touch the same object. That alone does not mean their proposed changes conflict.
      </p>

      <fieldset className="goal-conflict-resolution__choices" disabled={busy} aria-describedby={`${groupId}-context`}>
        <legend className="sr-only">How should Drover treat this shared object?</legend>
        <span id={`${groupId}-context`} className="sr-only">This records a decision only. It does not change either goal or the shared object.</span>
        {(["keep-separate", "choose-goal", "acknowledge-coexistence"] as GoalConflictResolution[]).map((value) => (
          <label key={value} className="goal-conflict-resolution__choice">
            <input type="radio" name={`${groupId}-resolution`} value={value} checked={resolution === value} onChange={() => setResolution(value)} />
            <span>{resolutionLabel[value]}</span>
          </label>
        ))}
      </fieldset>

      {resolution === "choose-goal" ? (
        <label className="goal-conflict-resolution__field">
          Goal that owns changes to this object
          <Select value={chosenGoalId} onValueChange={(value) => setChosenGoalId(String(value ?? ""))} disabled={busy}>
            <SelectTrigger aria-label="Goal that owns changes to this object">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {conflict.goalRefs.map((goal) => <SelectItem key={goal.id} value={goal.id}>{goalLabels[goal.id] ?? goal.id}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      ) : null}

      <label className="goal-conflict-resolution__field">
        Note <span>(optional)</span>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={500} disabled={busy} />
      </label>

      {error ? <p className="goal-conflict-resolution__error" role="alert">{error}</p> : null}
      <div className="goal-conflict-resolution__footer">
        <p>This records your call. Nothing is changed or executed.</p>
        <Button type="submit" className="goal-conflict-resolution__save" disabled={busy || (resolution === "choose-goal" && !chosenGoalId)}>
          {busy ? "Recording…" : "Record decision"}
        </Button>
      </div>
    </form>
  );
}

export function GoalConflictResolutionControl(props: Props) {
  const revision = props.conflict.resolution?.revision ?? "open";
  return <GoalConflictResolutionControlInner key={`${props.conflict.id}:${revision}`} {...props} />;
}

export default GoalConflictResolutionControl;
