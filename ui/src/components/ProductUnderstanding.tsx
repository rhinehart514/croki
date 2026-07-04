import { ArrowRight, FileCode2, Lightbulb } from "lucide-react";
import type { GTMProject } from "@/types";
import { ProductReadout, type ProductEvidence } from "@/components/ProductReadout";

// The persisted "Product grounding" read-out, opened over the canvas. It renders the SAME read-out
// component the onboarding scan preview does, fed from the stored repository facts instead of a fresh
// scan — so there is one picture of "your product", never two that drift. The stored facts are
// thinner than a live scan (no stack or blind-attribution persisted), so those sections are hidden
// rather than faked. On top of the read-out it carries the one action this surface is for: ideating
// pipelines from the grounded product.
export function ProductUnderstanding({
  project,
  busy,
  onGenerate,
}: {
  project: GTMProject;
  busy: boolean;
  onGenerate: () => void | Promise<void>;
}) {
  const repo = project.sharedContext.repository as Record<string, unknown>;
  const evidence = (Array.isArray(repo.evidence) ? repo.evidence : []) as ProductEvidence[];
  const canGenerate = !busy && !!repo.workspaceId;

  return (
    <section className="understanding-surface" aria-labelledby="understanding-title">
      <header className="studio-page-head">
        <div>
          <span className="studio-eyebrow">Product grounding</span>
          <h1 id="understanding-title">{project.name}</h1>
        </div>
        <button className="studio-primary-action" disabled={!canGenerate} onClick={() => void onGenerate()} type="button">
          <Lightbulb />
          Ideate pipelines
        </button>
      </header>

      <ProductReadout
        data={{
          headline: String(repo.headline || "").trim() || null,
          repoPath: String(repo.repo || "").trim() || null,
          winEvent: String(repo.outcome || "").trim() || null,
          evidence,
          showStack: false,
          showBlind: false,
        }}
      />

      <button className="understanding-empty" disabled={!canGenerate} onClick={() => void onGenerate()} type="button">
        <FileCode2 />
        <strong>Ideate this product's pipelines from grounded reality</strong>
        <span>Reads the win event, the cited evidence, and the repo, then proposes pipelines with no shape assumed.</span>
        <em>Ideate pipelines <ArrowRight /></em>
      </button>
    </section>
  );
}
