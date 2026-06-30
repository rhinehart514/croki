import { useState } from "react";
import { Check, FolderGit2, FolderOpen, LoaderCircle, Plus } from "lucide-react";
import type { ProjectSummary } from "@/types";
import { pickFolder } from "@/api";

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
  const [picking, setPicking] = useState(false);
  const choose = async () => {
    setPicking(true);
    try { const r = await pickFolder(); if (r.path) setRepoPath(r.path); }
    finally { setPicking(false); }
  };

  return (
    <section className="project-picker" aria-labelledby="project-picker-title">
      <header className="project-picker-head">
        <div>
          <span className="studio-eyebrow">Your products</span>
          <h1 id="project-picker-title">Choose the product you're taking to market</h1>
          <p>Each product is a grounded codebase with its own pipelines, agents, and learning loop.</p>
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
            <strong>Add a product</strong>
            <span>Point it at the codebase. The scan is read-only. The win event is the real outcome this product should create.</span>
          </div>
          <label>
            Product name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional; defaults to repository name" />
          </label>
          <label>
            Product folder
            <button
              type="button"
              className={`project-folder-pick ${repoPath ? "chosen" : ""}`}
              disabled={picking}
              onClick={choose}
            >
              <FolderOpen size={15} />
              {repoPath
                ? <span className="project-folder-path">{repoPath}</span>
                : <span>{picking ? "Opening Finder…" : "Choose your product folder"}</span>}
            </button>
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
            <span className="project-choice-top">
              <span className="project-choice-icon"><FolderGit2 /></span>
              <span className="project-choice-name">
                <strong>{project.name}</strong>
                {project.id === activeProjectId ? <em><Check /> Active</em> : null}
              </span>
            </span>
            <span className="project-choice-repo">{project.repo || "Code not connected yet"}</span>
            <small className="project-choice-headline">{project.headline || "Not scanned yet — open to read its code."}</small>
            <span className="project-choice-meta">
              {project.channelCount} {project.channelCount === 1 ? "pipeline" : "pipelines"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
