import { ArrowRight, FileCode2, Lightbulb } from "lucide-react";
import type { GTMProject } from "@/types";

export function ProductUnderstanding({
  project,
  busy,
  onGenerate,
}: {
  project: GTMProject;
  busy: boolean;
  onGenerate: () => void | Promise<void>;
}) {
  const repository = project.sharedContext.repository;
  return (
    <section className="understanding-surface" aria-labelledby="understanding-title">
      <header className="studio-page-head">
        <div>
          <span className="studio-eyebrow">Codebase understanding</span>
          <h1 id="understanding-title">{project.name}</h1>
          <p>{String(repository.headline || "Read this product as grounded reality, then ideate its pipelines — no shape assumed.")}</p>
        </div>
        <button className="studio-primary-action" disabled={busy || !repository.workspaceId} onClick={() => void onGenerate()} type="button">
          <Lightbulb />
          Ideate pipelines
        </button>
      </header>

      <div className="understanding-facts">
        <div><span>Repository</span><strong>{String(repository.repo || "Not connected")}</strong></div>
        <div><span>Win event</span><strong>{String(repository.outcome || "Not defined")}</strong></div>
      </div>

      <button className="understanding-empty" disabled={busy || !repository.workspaceId} onClick={() => void onGenerate()} type="button">
        <FileCode2 />
        <strong>Ideate this product's pipelines from grounded reality</strong>
        <span>Reads the win event, the cited evidence, and the repo, then proposes pipelines with no shape assumed.</span>
        <em>Ideate pipelines <ArrowRight /></em>
      </button>
    </section>
  );
}
