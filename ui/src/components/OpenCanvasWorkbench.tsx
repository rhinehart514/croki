import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyCanvasProposal, changeGoalStatus, createGoal, createGoalRelation, createWorkArtifact, createWorkRelationship,
  getWorkArtifactHistory, listCanvasRegions, listGoalRelations, listGoals, listWorkArtifacts, listWorkRelationships,
  archiveCanvasRegion, reopenCanvasRegion, reviseCanvasRegion,
  retireGoal, retireWorkArtifact, restoreGoal, restoreWorkArtifact, reviseGoal, reviseWorkArtifact,
} from "@/api";
import { getIdentity } from "@/lib/identity";
import type { CanvasRegion, Goal, GoalRelation, GoalStatus, JsonValue, StableRef, WorkArtifactRevision, WorkRelationshipRevision } from "@/openCanvasTypes";
import { ArtifactContentRenderer } from "@/components/ArtifactContentRenderer";
import { ArtifactStructuredEditor } from "@/components/ArtifactStructuredEditor";
import { supportsStructuredArtifactEditing } from "@/lib/artifactStructuredEditing";
import { GoalConflictResolutionControl } from "@/components/GoalConflictResolutionControl";
import { ProductChangeReview } from "@/components/ProductChangeReview";
import { CanvasRelationshipInspector, type CanvasRelationshipSelection } from "@/components/CanvasRelationshipInspector";
import type { WovenGoalConflict } from "@/types";
import "@/styles/open-canvas-workbench.css";

type Mode = "closed" | "browse" | "create-goal" | "create-work" | "inspect" | "product-changes";
type CanvasRecord = { ref: StableRef; label: string };
const GOAL_STATUSES: GoalStatus[] = ["active", "needs-founder", "waiting", "paused", "completed", "abandoned", "failed", "stale"];

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

function displayStatus(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function contentText(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function parsedContent(value: string, contentType: string): JsonValue {
  if (contentType.includes("json")) return JSON.parse(value) as JsonValue;
  return value;
}

function ArtifactHistoryRevision({ revision, current, busy, onRestore }: { revision: WorkArtifactRevision; current: boolean; busy: boolean; onRestore: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="open-canvas-history-revision" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><b>Revision {revision.revision}</b><time>{new Date(revision.updatedAt).toLocaleString()}</time><span>{revision.summary || revision.title || "Saved revision"}</span></summary>
      {open ? <><ArtifactContentRenderer content={revision.content} contentType={revision.contentType} />{!current && !revision.retiredAt ? <button type="button" className="open-canvas-history-restore" disabled={busy} onClick={onRestore}>Restore as latest revision</button> : null}</> : null}
    </details>
  );
}

export function OpenCanvasWorkbench({ projectId, selectedRef, selectedRelationship, selectedConflict, onChanged, onCreated, onSelect, onSelectRelationship, onClose }: {
  projectId: string;
  selectedRef?: StableRef | null;
  selectedRelationship?: CanvasRelationshipSelection | null;
  selectedConflict?: WovenGoalConflict | null;
  onChanged: () => void | Promise<void>;
  onCreated?: (ref: StableRef) => void;
  onSelect?: (ref: StableRef) => void;
  onSelectRelationship?: (selection: CanvasRelationshipSelection) => void;
  onClose: () => void;
}) {
  const selectedType = selectedRef?.type ?? null;
  const selectedId = selectedRef?.id ?? null;
  const [mode, setMode] = useState<Mode>(selectedRef?.type === "product-change" ? "product-changes" : selectedRelationship || selectedRef?.type === "goal" || selectedRef?.type === "work-artifact" || selectedRef?.type === "work-region" ? "inspect" : "closed");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [artifacts, setArtifacts] = useState<WorkArtifactRevision[]>([]);
  const [regions, setRegions] = useState<CanvasRegion[]>([]);
  const [goalRelations, setGoalRelations] = useState<GoalRelation[]>([]);
  const [workRelationships, setWorkRelationships] = useState<WorkRelationshipRevision[]>([]);
  const [storeRevision, setStoreRevision] = useState(0);
  const [history, setHistory] = useState<WorkArtifactRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statement, setStatement] = useState("");
  const [desiredChange, setDesiredChange] = useState("");
  const [goalStatus, setGoalStatus] = useState<GoalStatus>("active");
  const [goalStatusReason, setGoalStatusReason] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("note");
  const [summary, setSummary] = useState("");
  const [contentType, setContentType] = useState("text/plain");
  const [content, setContent] = useState("");
  const [artifactView, setArtifactView] = useState<"read" | "edit">("read");
  const [artifactEditMode, setArtifactEditMode] = useState<"structured" | "source">("structured");
  const [relationTarget, setRelationTarget] = useState("");
  const [relationKind, setRelationKind] = useState("relates-to");
  const [relationBasis, setRelationBasis] = useState("");
  const [browseQuery, setBrowseQuery] = useState("");
  const [regionTitle, setRegionTitle] = useState("");
  const [regionPurpose, setRegionPurpose] = useState("");
  const [proposalApplyArmed, setProposalApplyArmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [goalResult, workResult, regionResult, goalRelationResult, workRelationshipResult] = await Promise.all([
        listGoals(projectId, { includeRetired: true }),
        listWorkArtifacts(projectId, { includeRetired: true }),
        listCanvasRegions(projectId, { includeRetired: true }),
        listGoalRelations(projectId, { includeRetired: true }),
        listWorkRelationships(projectId, { includeRetired: true }),
      ]);
      setGoals(goalResult.goals);
      setArtifacts(workResult.artifacts);
      setRegions(regionResult.regions);
      setGoalRelations(goalRelationResult.relations);
      setWorkRelationships(workRelationshipResult.relationships);
      setStoreRevision(workResult.storeRevision);
      const loadedGoal = selectedType === "goal" ? goalResult.goals.find((item) => item.id === selectedId) : null;
      const loadedArtifact = selectedType === "work-artifact"
        ? workResult.artifacts.find((item) => item.artifactId === selectedId || item.id === selectedId)
        : null;
      const loadedRegion = selectedType === "work-region"
        ? regionResult.regions.find((item) => item.id === selectedId)
        : null;
      if (loadedGoal) {
        setStatement(loadedGoal.statement);
        setDesiredChange(loadedGoal.desiredChange ?? "");
        setGoalStatus(loadedGoal.status);
        setGoalStatusReason(loadedGoal.statusReason ?? "");
      } else if (loadedArtifact) {
        setTitle(loadedArtifact.title ?? "");
        setKind(loadedArtifact.kind);
        setSummary(loadedArtifact.summary ?? "");
        setContentType(loadedArtifact.contentType);
        setContent(contentText(loadedArtifact.content));
        setArtifactView("read");
        setArtifactEditMode("structured");
        const revisions = await getWorkArtifactHistory(projectId, loadedArtifact.artifactId, { includeRetired: true }).catch(() => ({ history: [] }));
        setHistory(revisions.history);
      } else if (loadedRegion) {
        setRegionTitle(loadedRegion.title);
        setRegionPurpose(loadedRegion.purpose ?? "");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Canvas work could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedId, selectedType]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const selectedGoal = selectedRef?.type === "goal" ? goals.find((item) => item.id === selectedRef.id) ?? null : null;
  const selectedArtifact = selectedRef?.type === "work-artifact"
    ? artifacts.find((item) => item.artifactId === selectedRef.id || item.id === selectedRef.id) ?? null
    : null;
  const selectedRegion = selectedRef?.type === "work-region"
    ? regions.find((item) => item.id === selectedRef.id) ?? null
    : null;
  let parsedEditorContent: JsonValue | null = null;
  if (selectedArtifact && contentType.includes("json")) {
    try { parsedEditorContent = JSON.parse(content) as JsonValue; } catch { parsedEditorContent = null; }
  }
  const hasStructuredEditor = parsedEditorContent !== null
    && supportsStructuredArtifactEditing(parsedEditorContent, contentType);

  const records = useMemo<CanvasRecord[]>(() => [
    ...goals.filter((item) => !item.retiredAt).map((item) => ({ ref: { type: "goal", id: item.id }, label: `Goal: ${item.statement}` })),
    ...artifacts.filter((item) => !item.retiredAt).map((item) => ({ ref: { type: "work-artifact", id: item.artifactId }, label: `${item.kind}: ${item.title || item.summary || item.artifactId}` })),
    ...regions.map((item) => ({ ref: { type: "work-region", id: item.id }, label: `${item.archivedAt ? "Archived region" : "Region"}: ${item.title}` })),
  ], [artifacts, goals, regions]);
  const selectedKey = selectedRef ? `${selectedRef.type}:${selectedRef.id}` : "";
  const relationChoices = records.filter((item) => `${item.ref.type}:${item.ref.id}` !== selectedKey);
  const visibleRecords = useMemo(() => {
    const query = browseQuery.trim().toLowerCase();
    return query ? records.filter((item) => item.label.toLowerCase().includes(query)) : records;
  }, [browseQuery, records]);
  const visibleRelationships = useMemo(() => {
    const query = browseQuery.trim().toLowerCase();
    const rows = [
      ...goalRelations.map((relation) => ({
        selection: { type: "goal-relation", id: relation.id, source: relation.sourceRef, target: relation.targetRef } as const,
        label: relation.label || relation.kind,
        detail: `${relation.sourceRef.id} → ${relation.targetRef.id}`,
        retired: Boolean(relation.retiredAt),
      })),
      ...workRelationships.map((relationship) => ({
        selection: { type: "work-relationship", id: relationship.relationshipId, source: relationship.sourceRef, target: relationship.targetRef } as const,
        label: relationship.label || relationship.kind,
        detail: `${relationship.sourceRef.id} → ${relationship.targetRef.id}`,
        retired: Boolean(relationship.retiredAt),
      })),
    ];
    return query ? rows.filter((row) => `${row.label} ${row.detail}`.toLowerCase().includes(query)) : rows;
  }, [browseQuery, goalRelations, workRelationships]);

  const mutate = async (work: () => Promise<StableRef | void>) => {
    setSaving(true);
    setError(null);
    try {
      const createdRef = await work();
      await load();
      await onChanged();
      if (createdRef) onCreated?.(createdRef);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "The change could not be saved.";
      // A stale writer keeps the founder's draft on screen, but refreshes the authority snapshot so
      // the next save is based on the winning revision instead of repeatedly colliding with it.
      if (/stale|conflict|revision/i.test(detail)) await load();
      setError(detail);
    } finally {
      setSaving(false);
    }
  };

  const saveGoal = () => mutate(async () => {
    if (!statement.trim()) throw new Error("Write the goal in plain words first.");
    if (selectedGoal && mode === "inspect") {
      await reviseGoal(projectId, selectedGoal.id, {
        expectedRevision: selectedGoal.revision, statement: statement.trim(), desiredChange: desiredChange.trim(),
        revisionAuthor: getIdentity().userId, idempotencyKey: writeKey("revise-goal"),
      });
    } else {
      const created = await createGoal(projectId, {
        statement: statement.trim(), desiredChange: desiredChange.trim(), createdBy: getIdentity().userId,
        idempotencyKey: writeKey("create-goal"),
      });
      setStatement(""); setDesiredChange(""); setMode("closed");
      return { type: "goal", id: created.goal.id };
    }
  });

  const saveWork = () => mutate(async () => {
    if (!title.trim() && !content.trim()) throw new Error("Give this work a title or content.");
    const nextContent = parsedContent(content, contentType);
    if (selectedArtifact && mode === "inspect") {
      await reviseWorkArtifact(projectId, selectedArtifact.artifactId, {
        expectedArtifactRevision: selectedArtifact.revision, kind: kind.trim() || "note", title: title.trim(),
        summary: summary.trim(), contentType, format: contentType.includes("json") ? "json" : "text",
        content: nextContent, createdBy: actor(), idempotencyKey: writeKey("revise-work"),
      });
    } else {
      const created = await createWorkArtifact(projectId, {
        expectedStoreRevision: storeRevision, kind: kind.trim() || "note", title: title.trim(), summary: summary.trim(),
        contentType, format: contentType.includes("json") ? "json" : "text", content: nextContent,
        createdBy: actor(), idempotencyKey: writeKey("create-work"),
      });
      setTitle(""); setSummary(""); setContent(""); setMode("closed");
      return { type: "work-artifact", id: created.artifact.artifactId };
    }
  });

  const saveGoalStatus = () => mutate(async () => {
    if (!selectedGoal) throw new Error("Choose a goal before changing its status.");
    await changeGoalStatus(projectId, selectedGoal.id, {
      expectedRevision: selectedGoal.revision,
      status: goalStatus,
      statusReason: goalStatusReason.trim(),
      revisionAuthor: getIdentity().userId,
      idempotencyKey: writeKey("change-goal-status"),
    });
  });

  const saveRegion = () => mutate(async () => {
    if (!selectedRegion) throw new Error("Choose a region before changing it.");
    if (selectedRegion.archivedAt) throw new Error("Reopen this region before editing it.");
    if (!regionTitle.trim()) throw new Error("Give this region a name.");
    await reviseCanvasRegion(projectId, selectedRegion.id, {
      expectedRevision: selectedRegion.revision,
      revisionAuthor: getIdentity().userId,
      idempotencyKey: writeKey("revise-region"),
      title: regionTitle.trim(),
      purpose: regionPurpose.trim(),
      placementMode: "founder",
    });
  });

  const toggleRegionArchived = () => mutate(async () => {
    if (!selectedRegion) throw new Error("Choose a region first.");
    const common = {
      expectedRevision: selectedRegion.revision,
      revisionAuthor: getIdentity().userId,
      idempotencyKey: writeKey(selectedRegion.archivedAt ? "reopen-region" : "archive-region"),
    };
    if (selectedRegion.archivedAt) await reopenCanvasRegion(projectId, selectedRegion.id, common);
    else await archiveCanvasRegion(projectId, selectedRegion.id, common);
  });

  const toggleRetired = () => mutate(async () => {
    if (selectedGoal) {
      const common = {
        expectedRevision: selectedGoal.revision, revisionAuthor: getIdentity().userId,
        idempotencyKey: writeKey(selectedGoal.retiredAt ? "restore-goal" : "retire-goal"),
      };
      if (selectedGoal.retiredAt) await restoreGoal(projectId, selectedGoal.id, common);
      else await retireGoal(projectId, selectedGoal.id, common);
    } else if (selectedArtifact) {
      const common = { expectedArtifactRevision: selectedArtifact.revision, createdBy: actor(), idempotencyKey: writeKey(selectedArtifact.retiredAt ? "restore-work" : "retire-work") };
      if (selectedArtifact.retiredAt) await restoreWorkArtifact(projectId, selectedArtifact.artifactId, common);
      else await retireWorkArtifact(projectId, selectedArtifact.artifactId, common);
    }
  });

  const restoreArtifactRevision = (revision: WorkArtifactRevision) => mutate(async () => {
    if (!selectedArtifact) throw new Error("Choose a work artifact before restoring a revision.");
    await restoreWorkArtifact(projectId, selectedArtifact.artifactId, {
      expectedArtifactRevision: selectedArtifact.revision,
      revision: revision.revision,
      createdBy: actor(),
      idempotencyKey: writeKey("restore-work-revision"),
    });
  });

  const applySelectedCanvasProposal = () => mutate(async () => {
    if (!selectedArtifact || selectedArtifact.kind !== "canvas-change-proposal") throw new Error("Choose a canvas proposal first.");
    await applyCanvasProposal(projectId, selectedArtifact.artifactId, {
      expectedArtifactRevision: selectedArtifact.revision,
      idempotencyKey: writeKey("apply-canvas-proposal"),
    });
    setProposalApplyArmed(false);
  });

  const addRelation = () => mutate(async () => {
    if (!selectedRef || !relationTarget) throw new Error("Choose another canvas object.");
    const target = records.find((item) => `${item.ref.type}:${item.ref.id}` === relationTarget)?.ref;
    if (!target) throw new Error("That canvas object is no longer available.");
    const basis = relationBasis.trim() || "Founder connected these on the canvas.";
    if (selectedRef.type === "goal" && target.type === "goal") {
      await createGoalRelation(projectId, {
        sourceRef: selectedRef, targetRef: target, kind: relationKind.trim() || "relates-to", basis: [basis],
        provenance: "declared", createdBy: getIdentity().userId, idempotencyKey: writeKey("relate-goals"),
      });
    } else {
      const latest = await listWorkRelationships(projectId, { includeRetired: true });
      await createWorkRelationship(projectId, {
        expectedStoreRevision: latest.storeRevision, sourceRef: selectedRef, targetRef: target,
        kind: relationKind.trim() || "relates-to", basis: [basis], provenance: "declared",
        createdBy: actor(), idempotencyKey: writeKey("relate-work"),
      });
    }
    setRelationTarget(""); setRelationBasis("");
  });

  if (mode === "closed") {
    return (
      <div className="open-canvas-launcher" aria-label="Add canvas work">
        <button type="button" onClick={() => { setMode("create-goal"); setStatement(""); setDesiredChange(""); }}>New goal</button>
        <button type="button" onClick={() => { setMode("create-work"); setTitle(""); setSummary(""); setContent(""); }}>New work</button>
        <button type="button" onClick={() => { setMode("browse"); setBrowseQuery(""); }}>Open work</button>
        <button type="button" onClick={() => setMode("product-changes")}>Product changes</button>
      </div>
    );
  }

  const isGoalForm = mode === "create-goal" || !!selectedGoal;
  const isWorkForm = mode === "create-work" || !!selectedArtifact;
  const isRegionForm = !!selectedRegion;
  const isRelationshipForm = !!selectedRelationship;
  return (
    <aside className={`open-canvas-workbench${mode === "product-changes" ? " open-canvas-workbench--wide" : ""}`} aria-label="Canvas workbench">
      <header>
        <div><span>Canvas</span><h2>{mode === "browse" ? "Open work" : mode === "create-goal" ? "New goal" : mode === "create-work" ? "New work" : mode === "product-changes" ? "Product changes" : selectedRelationship ? "Relationship" : selectedGoal ? "Goal" : selectedRegion ? "Region" : "Work"}</h2></div>
        <button type="button" className="open-canvas-close" aria-label="Close canvas workbench" onClick={() => { setMode("closed"); onClose(); }}>×</button>
      </header>
      {loading && !isGoalForm && !isWorkForm && !isRegionForm && !isRelationshipForm ? <p className="open-canvas-muted">Loading canvas work…</p> : null}
      {mode === "product-changes" ? <ProductChangeReview projectId={projectId} /> : null}
      {mode === "browse" ? <section className="open-canvas-browser" aria-label="Find canvas work"><label>Find work<input autoFocus type="search" value={browseQuery} onChange={(event) => setBrowseQuery(event.target.value)} placeholder="Goal, work, region, or relationship" /></label><div className="open-canvas-browser-results">{visibleRecords.map((item) => <button type="button" key={`${item.ref.type}:${item.ref.id}`} onClick={() => onSelect?.(item.ref)}><span>{item.ref.type === "goal" ? "Goal" : item.ref.type === "work-region" ? item.label.startsWith("Archived") ? "Archived region" : "Region" : "Work"}</span>{item.label.replace(/^[^:]+:\s*/, "")}</button>)}{visibleRelationships.map((item) => <button type="button" key={`${item.selection.type}:${item.selection.id}`} onClick={() => onSelectRelationship?.(item.selection)}><span>{item.retired ? "Retired link" : "Link"}</span><span className="open-canvas-browser-relation"><b>{item.label}</b><small>{item.detail}</small></span></button>)}{!loading && visibleRecords.length === 0 && visibleRelationships.length === 0 ? <p className="open-canvas-muted">{browseQuery ? "No canvas work matches that search." : "No goals, work, regions, or relationships yet."}</p> : null}</div></section> : null}
      {isGoalForm ? (
        <form onSubmit={(event) => { event.preventDefault(); void saveGoal(); }}>
          <label>What do you want to change?<textarea autoFocus value={statement} onChange={(event) => setStatement(event.target.value)} rows={4} /></label>
          <label>What would be different?<textarea value={desiredChange} onChange={(event) => setDesiredChange(event.target.value)} rows={3} /></label>
          <button className="open-canvas-primary" type="submit" disabled={saving}>{saving ? "Saving…" : selectedGoal ? "Save goal" : "Place on canvas"}</button>
        </form>
      ) : null}
      {isWorkForm ? (
        <>
          {selectedArtifact ? <div className="open-canvas-view-switch" role="group" aria-label="Work view"><button type="button" aria-pressed={artifactView === "read"} onClick={() => setArtifactView("read")}>Read</button><button type="button" aria-pressed={artifactView === "edit"} onClick={() => setArtifactView("edit")}>Edit</button></div> : null}
          {selectedArtifact && artifactView === "read" ? (
            <div className="open-canvas-reading">
              {selectedArtifact.title ? <h3>{selectedArtifact.title}</h3> : null}
              {selectedArtifact.summary ? <p className="open-canvas-summary">{selectedArtifact.summary}</p> : null}
              <ArtifactContentRenderer content={selectedArtifact.content} contentType={selectedArtifact.contentType} />
            </div>
          ) : <form onSubmit={(event) => { event.preventDefault(); void saveWork(); }}>
          <div className="open-canvas-pair"><label>Kind<input value={kind} onChange={(event) => setKind(event.target.value)} /></label><label>Content type<input list="open-canvas-content-types" value={contentType} onChange={(event) => setContentType(event.target.value)} /><datalist id="open-canvas-content-types"><option value="text/plain" /><option value="text/markdown" /><option value="application/json" /><option value="application/vnd.drover.comparison+json" /><option value="application/vnd.drover.journey+json" /><option value="application/vnd.drover.wireframe+json" /><option value="text/x-diff" /></datalist></label></div>
          <label>Title<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Summary<textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} /></label>
          {hasStructuredEditor ? <div className="open-canvas-edit-switch" role="group" aria-label="Content editing mode"><button type="button" aria-pressed={artifactEditMode === "structured"} onClick={() => setArtifactEditMode("structured")}>Structured</button><button type="button" aria-pressed={artifactEditMode === "source"} onClick={() => setArtifactEditMode("source")}>Source</button></div> : null}
          {hasStructuredEditor && artifactEditMode === "structured" && parsedEditorContent !== null
            ? <ArtifactStructuredEditor content={parsedEditorContent} contentType={contentType} onChange={(next) => setContent(JSON.stringify(next, null, 2))} />
            : <label>Content<textarea className="open-canvas-content" value={content} onChange={(event) => setContent(event.target.value)} rows={9} spellCheck={!contentType.includes("json")} /></label>}
          <button className="open-canvas-primary" type="submit" disabled={saving}>{saving ? "Saving…" : selectedArtifact ? "Save revision" : "Place on canvas"}</button>
        </form>}
        </>
      ) : null}
      {isRegionForm ? <form onSubmit={(event) => { event.preventDefault(); void saveRegion(); }}>
        <label>Region name<input autoFocus value={regionTitle} disabled={Boolean(selectedRegion.archivedAt)} onChange={(event) => setRegionTitle(event.target.value)} /></label>
        <label>Purpose<textarea rows={3} value={regionPurpose} disabled={Boolean(selectedRegion.archivedAt)} onChange={(event) => setRegionPurpose(event.target.value)} /></label>
        {!selectedRegion.archivedAt ? <button className="open-canvas-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save region"}</button> : null}
      </form> : null}
      {isRelationshipForm ? <CanvasRelationshipInspector projectId={projectId} selection={selectedRelationship} onChanged={onChanged} /> : null}
      {mode === "inspect" && (selectedGoal || selectedArtifact || selectedRegion) ? (
        <>
          <section className="open-canvas-meta" aria-label="Record details"><span>{selectedGoal ? selectedGoal.status : selectedArtifact ? selectedArtifact.status : selectedRegion?.collapsed ? "Collapsed" : "Expanded"}</span>{selectedArtifact ? <span>{selectedArtifact.provenance}</span> : null}<span>Revision {selectedGoal?.revision ?? selectedArtifact?.revision ?? selectedRegion?.revision}</span><span>{selectedGoal?.retiredAt || selectedArtifact?.retiredAt || selectedRegion?.archivedAt ? "Archived" : "Live"}</span></section>
          {selectedGoal ? <form className="open-canvas-status" onSubmit={(event) => { event.preventDefault(); void saveGoalStatus(); }}><label>Goal status<select value={goalStatus} onChange={(event) => setGoalStatus(event.target.value as GoalStatus)}>{GOAL_STATUSES.map((status) => <option value={status} key={status}>{displayStatus(status)}</option>)}</select></label><label>Status note<input value={goalStatusReason} onChange={(event) => setGoalStatusReason(event.target.value)} placeholder="What changed?" /></label><button type="submit" disabled={saving || (goalStatus === selectedGoal.status && goalStatusReason.trim() === (selectedGoal.statusReason ?? ""))}>{saving ? "Saving…" : "Update status"}</button></form> : null}
          {selectedConflict ? <GoalConflictResolutionControl
            projectId={projectId}
            conflict={selectedConflict}
            founderId={getIdentity().userId}
            goalLabels={Object.fromEntries(goals.map((goal) => [goal.id, goal.statement]))}
            onResolved={() => { void load(); void onChanged(); }}
          /> : null}
          {selectedArtifact?.kind === "canvas-change-proposal" && selectedArtifact.status === "proposed" ? <section className="open-canvas-proposal" aria-label="Canvas proposal review">
            <strong>Canvas arrangement proposal</strong>
            <p>This applies the one bounded region or layout change shown above. It changes no goal or work content and nothing sends, publishes, or deploys.</p>
            {proposalApplyArmed ? <div><span>Apply this exact canvas change?</span><button type="button" disabled={saving} onClick={() => void applySelectedCanvasProposal()}>Yes, apply on canvas</button><button type="button" onClick={() => setProposalApplyArmed(false)}>Not yet</button></div>
              : <button type="button" onClick={() => setProposalApplyArmed(true)}>Review and apply…</button>}
          </section> : null}
          {!selectedRegion ? <details className="open-canvas-relation"><summary>Connect to another object</summary><label>Object<select value={relationTarget} onChange={(event) => setRelationTarget(event.target.value)}><option value="">Choose an object</option>{relationChoices.map((item) => <option key={`${item.ref.type}:${item.ref.id}`} value={`${item.ref.type}:${item.ref.id}`}>{item.label}</option>)}</select></label><label>Relationship<input value={relationKind} onChange={(event) => setRelationKind(event.target.value)} /></label><label>Why are they connected?<textarea rows={2} value={relationBasis} onChange={(event) => setRelationBasis(event.target.value)} /></label><button type="button" onClick={() => void addRelation()} disabled={saving || !relationTarget}>Connect</button></details> : null}
          {selectedArtifact && history.length > 1 ? <details className="open-canvas-history"><summary>{history.length} revisions</summary>{[...history].reverse().map((revision) => <ArtifactHistoryRevision revision={revision} current={revision.id === selectedArtifact.id} busy={saving} onRestore={() => void restoreArtifactRevision(revision)} key={revision.id} />)}</details> : null}
          <button type="button" className="open-canvas-retire" disabled={saving} onClick={() => void (selectedRegion ? toggleRegionArchived() : toggleRetired())}>{selectedRegion ? selectedRegion.archivedAt ? "Reopen region" : "Archive region" : selectedArtifact?.retiredAt ? "Restore work" : selectedGoal?.retiredAt ? "Restore goal" : selectedGoal ? "Retire goal" : "Retire work"}</button>
        </>
      ) : null}
      {error ? <p className="open-canvas-error" role="alert">{error}</p> : null}
    </aside>
  );
}
