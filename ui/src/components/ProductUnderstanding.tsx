import { AlertTriangle, ArrowRight, FileCode2, FileText, LoaderCircle, Lightbulb } from "lucide-react";
import type { GTMProject, OpportunityStudio } from "@/types";

export function ProductUnderstanding({
  project,
  studio,
  busy,
  onGenerate,
}: {
  project: GTMProject;
  studio: OpportunityStudio | null;
  busy: boolean;
  onGenerate: () => void | Promise<void>;
}) {
  const understanding = studio?.understanding;
  const repository = project.sharedContext.repository;
  return (
    <section className="understanding-surface" aria-labelledby="understanding-title">
      <header className="studio-page-head">
        <div>
          <span className="studio-eyebrow">Codebase understanding</span>
          <h1 id="understanding-title">{understanding?.productName || project.name}</h1>
          <p>{understanding?.headline || String(repository.headline || "Read this product as grounded reality, then ideate its channels — no shape assumed.")}</p>
        </div>
        <button className="studio-primary-action" disabled={busy || !repository.workspaceId} onClick={() => void onGenerate()} type="button">
          {busy ? <LoaderCircle className="spin" /> : <Lightbulb />}
          {studio?.generatedAt ? "Re-ideate channels" : "Ideate channels"}
        </button>
      </header>

      <div className="understanding-facts">
        <div><span>Repository</span><strong>{String(repository.repo || "Not connected")}</strong></div>
        <div><span>Win event</span><strong>{understanding?.winEvent?.name || String(repository.outcome || "Not defined")}</strong></div>
        <div><span>Production files</span><strong>{understanding?.filesScanned?.toLocaleString() || "—"}</strong></div>
        <div><span>Evidence cited</span><strong>{understanding?.evidence.length ?? "—"}</strong></div>
      </div>

      {understanding ? (
        <div className="understanding-columns">
          <section className="understanding-panel">
            <header><FileText /><strong>Grounded reality</strong></header>
            <p className="understanding-panel-note">
              What the code is, cited and reproducible. No go-to-market shape is read into it here — ideation decides the channels.
            </p>
            {understanding.evidence.length ? understanding.evidence.slice(0, 10).map((citation, index) => (
              <article className="evidence-row" key={`${citation.file}-${citation.line}-${index}`}>
                <span>{citation.label}</span>
                <code>{citation.file}:{citation.line}</code>
                <p>{citation.text}</p>
              </article>
            )) : (
              <div className="studio-empty">No cited evidence yet. The scan grounds the win event and attribution; ideation reads the repo for the rest.</div>
            )}
          </section>

          <section className="understanding-panel">
            <header><AlertTriangle /><strong>Blind spots</strong></header>
            {understanding.blindSpots.length ? understanding.blindSpots.map((gap) => (
              <article className="blind-spot-row" key={gap.id}>
                <AlertTriangle />
                <div><strong>{gap.title}</strong><p>{gap.summary}</p></div>
              </article>
            )) : (
              <div className="studio-empty">No proven attribution or instrumentation gaps in the current scan.</div>
            )}
            {studio?.ideation?.blank ? (
              <div className="studio-empty">Ideation has not run on a live subscription yet — sign in to Claude and re-ideate to propose channels from this grounding.</div>
            ) : null}
          </section>
        </div>
      ) : (
        <button className="understanding-empty" disabled={busy || !repository.workspaceId} onClick={() => void onGenerate()} type="button">
          <FileCode2 />
          <strong>Ideate this product's channels from grounded reality</strong>
          <span>Reads the win event, the cited evidence, and the repo, then proposes channels with no shape assumed.</span>
          <em>Ideate channels <ArrowRight /></em>
        </button>
      )}
    </section>
  );
}
