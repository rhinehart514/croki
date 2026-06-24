import { useState } from "react";
import { Check, FolderGit2, LoaderCircle, Plus } from "lucide-react";
import type { ProjectSummary } from "@/types";

export function ProjectPicker({
  projects,
  activeProjectId,
  busy,
  onOpen,
  onCreate,
  onNewProduct,
}: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  busy: boolean;
  onOpen: (projectId: string) => void | Promise<void>;
  onCreate: (input: { name?: string; repoPath: string; outcome: string }) => void | Promise<void>;
  onNewProduct?: () => void;
}) {
  const [creating, setCreating] = useState(projects.length === 0);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [outcome, setOutcome] = useState("");

  return (
    <section className="project-picker" aria-labelledby="project-picker-title">
      <header className="project-picker-head">
        <div>
          <span className="studio-eyebrow">Products</span>
          <h1 id="project-picker-title">Choose the product you are taking to market</h1>
          <p>Each product keeps its own code evidence, opportunities, agents, channels, and learning loop.</p>
        </div>
        <button className="studio-primary-action" onClick={() => onNewProduct ? onNewProduct() : setCreating(true)} type="button">
          <Plus /> Add product
        </button>
      </header>

      {creating ? (
        <form
          className="project-create-panel"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!repoPath.trim() || !outcome.trim()) return;
            await onCreate({ name: name.trim() || undefined, repoPath: repoPath.trim(), outcome: outcome.trim() });
            setCreating(false);
            setName("");
            setRepoPath("");
            setOutcome("");
          }}
        >
          <div className="project-create-copy">
            <strong>Add a repository-backed product</strong>
            <span>The scan is read-only. The win event is the real outcome this product should create.</span>
          </div>
          <label>
            Product name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional; defaults to repository name" />
          </label>
          <label>
            Repository path
            <input required value={repoPath} onChange={(event) => setRepoPath(event.target.value)} placeholder="~/Projects/my-product" />
          </label>
          <label>
            Win event
            <input required value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="customer_activated" />
          </label>
          <div className="project-create-actions">
            <button className="studio-primary-action" disabled={busy} type="submit">
              {busy ? <LoaderCircle className="spin" /> : <FolderGit2 />}
              Scan and add
            </button>
            {projects.length ? <button onClick={() => setCreating(false)} type="button">Cancel</button> : null}
          </div>
        </form>
      ) : null}

      <div className="project-picker-grid">
        {projects.map((project) => (
          <button
            className={`project-choice ${project.id === activeProjectId ? "active" : ""}`}
            key={project.id}
            onClick={() => void onOpen(project.id)}
            type="button"
          >
            <span className="project-choice-icon"><FolderGit2 /></span>
            <span className="project-choice-main">
              <strong>{project.name}</strong>
              <span>{project.repo || "Repository not connected"}</span>
              <small>{project.headline || "No code understanding generated yet."}</small>
            </span>
            <span className="project-choice-meta">
              <span>{project.channelCount} channels</span>
              <span>{project.opportunityCount} opportunities</span>
              {project.id === activeProjectId ? <em><Check /> Active</em> : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
