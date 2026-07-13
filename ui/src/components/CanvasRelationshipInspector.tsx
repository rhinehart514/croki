import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getGoalRelation, getGoalRelationHistory, getWorkRelationship, getWorkRelationshipHistory,
  restoreGoalRelation, restoreWorkRelationship, retireGoalRelation, retireWorkRelationship,
  reviseGoalRelation, reviseWorkRelationship,
} from "@/api";
import { getIdentity } from "@/lib/identity";
import type { GoalRelation, JsonValue, WorkRelationshipRevision } from "@/openCanvasTypes";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type CanvasRelationshipSelection = {
  type: "goal-relation" | "work-relationship";
  id: string;
  source?: { type: string | null; id: string };
  target?: { type: string | null; id: string };
};

type RelationshipRecord = GoalRelation | WorkRelationshipRevision;

function writeKey(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `ui:${prefix}:${random}`;
}

function actor() {
  const identity = getIdentity();
  return { type: "founder", id: identity.userId, name: identity.name };
}

function basisLine(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as { type?: unknown; id?: unknown; statement?: unknown; reasoning?: unknown };
    if (typeof item.statement === "string") return item.statement;
    if (typeof item.reasoning === "string") return item.reasoning;
    if (typeof item.type === "string" && typeof item.id === "string") return `${item.type}:${item.id}`;
  }
  return JSON.stringify(value);
}

function basisText(record: RelationshipRecord): string {
  return (record.basis ?? []).map(basisLine).join("\n");
}

function changedBasis(record: RelationshipRecord, value: string): Array<string | JsonValue> {
  if (value === basisText(record)) return record.basis as Array<string | JsonValue>;
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function goalBasisValues(record: RelationshipRecord, value: string): GoalRelation["basis"] {
  if (value === basisText(record)) return (record as GoalRelation).basis;
  return value.split("\n").map((line) => line.trim()).filter(Boolean)
    .map((statement) => ({ type: "reasoning", statement }));
}

function isProposed(record: RelationshipRecord): boolean {
  return ["inferred", "speculative", "proposed"].includes(record.provenance.toLowerCase());
}

function actorLabel(record: RelationshipRecord): string {
  const value = "revisionAuthor" in record && record.revisionAuthor
    ? record.revisionAuthor
    : record.createdBy;
  if (typeof value === "string") return value;
  return String(value?.name ?? value?.id ?? value?.type ?? "unknown");
}

function RelationshipHistoryRow({ record }: { record: RelationshipRecord }) {
  return (
    <li>
      <div><b>Revision {record.revision}</b><time dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleString()}</time></div>
      <span>{record.retiredAt ? "Retired" : record.label || record.kind}</span>
      <small>{record.kind} · {record.provenance} · {actorLabel(record)}</small>
    </li>
  );
}

export function CanvasRelationshipInspector({ projectId, selection, onChanged }: {
  projectId: string;
  selection: CanvasRelationshipSelection;
  onChanged: () => void | Promise<void>;
}) {
  const [record, setRecord] = useState<RelationshipRecord | null>(null);
  const [history, setHistory] = useState<RelationshipRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [kind, setKind] = useState("");
  const [label, setLabel] = useState("");
  const [basis, setBasis] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [head, revisions] = selection.type === "goal-relation"
        ? await Promise.all([
          getGoalRelation(projectId, selection.id, { includeRetired: true }),
          getGoalRelationHistory(projectId, selection.id),
        ])
        : await Promise.all([
          getWorkRelationship(projectId, selection.id, { includeRetired: true }),
          getWorkRelationshipHistory(projectId, selection.id, { includeRetired: true }),
        ]);
      const next = "relation" in head ? head.relation : head.relationship;
      setRecord(next);
      setHistory(revisions.history);
      setKind(next.kind);
      setLabel(next.label ?? "");
      setBasis(basisText(next));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The relationship could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId, selection.id, selection.type]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const basisValues = useMemo(() => record ? changedBasis(record, basis) : [], [basis, record]);

  const mutate = async (work: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await work();
      await load();
      await onChanged();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "The relationship could not be saved.";
      if (/stale|conflict|revision/i.test(detail)) await load();
      setError(detail);
    } finally {
      setSaving(false);
    }
  };

  const revise = (accept = false) => mutate(async () => {
    if (!record) return;
    if (!kind.trim()) throw new Error("Give this relationship a kind.");
    if (selection.type === "goal-relation") {
      const goalBasis = goalBasisValues(record, basis);
      if (!goalBasis.length) throw new Error("Keep at least one reason or receipt for a goal relationship.");
      await reviseGoalRelation(projectId, selection.id, {
        expectedRevision: record.revision,
        kind: kind.trim(), label: label.trim(), basis: goalBasis,
        ...(accept ? { provenance: "founder-stated" } : {}),
        revisionAuthor: getIdentity().userId,
        idempotencyKey: writeKey(accept ? "accept-goal-relation" : "revise-goal-relation"),
      });
    } else {
      await reviseWorkRelationship(projectId, selection.id, {
        expectedRelationshipRevision: record.revision,
        kind: kind.trim(), label: label.trim(), basis: basisValues as JsonValue[],
        ...(accept ? { provenance: "founder-stated" } : {}),
        createdBy: actor(),
        idempotencyKey: writeKey(accept ? "accept-work-relation" : "revise-work-relation"),
      });
    }
  });

  const toggleRetired = () => mutate(async () => {
    if (!record) return;
    if (selection.type === "goal-relation") {
      const input = {
        expectedRevision: record.revision,
        revisionAuthor: getIdentity().userId,
        idempotencyKey: writeKey(record.retiredAt ? "restore-goal-relation" : "retire-goal-relation"),
      };
      if (record.retiredAt) await restoreGoalRelation(projectId, selection.id, input);
      else await retireGoalRelation(projectId, selection.id, input);
    } else {
      const input = {
        expectedRelationshipRevision: record.revision,
        createdBy: actor(),
        idempotencyKey: writeKey(record.retiredAt ? "restore-work-relation" : "retire-work-relation"),
      };
      if (record.retiredAt) await restoreWorkRelationship(projectId, selection.id, input);
      else await retireWorkRelationship(projectId, selection.id, input);
    }
  });

  if (loading && !record) return <p className="open-canvas-muted">Loading relationship…</p>;
  if (!record) return <p className="open-canvas-error" role="alert">{error || "Relationship not found."}</p>;
  const proposed = isProposed(record);
  const retired = Boolean(record.retiredAt);

  return (
    <section className="canvas-relationship-inspector" aria-label="Relationship details">
      <div className="open-canvas-meta" aria-label="Relationship status">
        <span>{selection.type === "goal-relation" ? "Goal relationship" : "Work relationship"}</span>
        <span>Revision {record.revision}</span>
        <span>{retired ? "Retired" : proposed ? "Proposed" : "Founder accepted"}</span>
      </div>
      <p className="canvas-relationship-endpoints">
        <span>{record.sourceRef.type}: {record.sourceRef.id}</span>
        <b aria-hidden="true">→</b>
        <span>{record.targetRef.type}: {record.targetRef.id}</span>
      </p>
      {proposed && !retired ? (
        <div className="canvas-relationship-proposal">
          <div><strong>Model suggestion</strong><span>It stays proposed until you accept it.</span></div>
          <Button type="button" variant="outline" disabled={saving} onClick={() => void revise(true)}>{saving ? "Saving…" : "Accept relationship"}</Button>
        </div>
      ) : null}
      <form onSubmit={(event) => { event.preventDefault(); void revise(false); }}>
        <label>Relationship kind<Input value={kind} disabled={retired} onChange={(event) => setKind(event.target.value)} /></label>
        <label>Label<Input value={label} disabled={retired} onChange={(event) => setLabel(event.target.value)} placeholder="Optional words shown on the canvas" /></label>
        <label>Basis<Textarea rows={4} value={basis} disabled={retired} onChange={(event) => setBasis(event.target.value)} /><small>One reason or receipt per line.</small></label>
        {!retired ? <Button className="open-canvas-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save revision"}</Button> : null}
      </form>
      <details className="open-canvas-history" open={historyOpen} onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
        <summary>{history.length} immutable {history.length === 1 ? "revision" : "revisions"}</summary>
        <ol className="canvas-relationship-history">{[...history].reverse().map((revision) => <RelationshipHistoryRow key={`${revision.id}:${revision.revision}`} record={revision} />)}</ol>
      </details>
      <Button type="button" variant="outline" className="open-canvas-retire" disabled={saving} onClick={() => retired ? void toggleRetired() : setRetireOpen(true)}>
        {retired ? "Restore relationship" : "Retire relationship"}
      </Button>
      <AlertDialog open={retireOpen} onOpenChange={setRetireOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire this relationship?</AlertDialogTitle>
            <AlertDialogDescription>
              It will stop appearing as an active connection. Its immutable revision history remains available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRetireOpen(false)}>Keep relationship</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={() => { setRetireOpen(false); void toggleRetired(); }}
            >
              Retire relationship
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? <p className="open-canvas-error" role="alert">{error}</p> : null}
    </section>
  );
}
