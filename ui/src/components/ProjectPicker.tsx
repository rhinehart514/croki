import { useState } from "react";
import { Check, FolderGit2, FolderOpen, LoaderCircle, Plus } from "lucide-react";
import type { ProjectSummary } from "@/types";
import { pickFolder } from "@/api";

// The one operating signal per product, read straight from its real derived headline — never seeded.
// "Blind" means the win event can't be confirmed yet (an attribution gap); a proven gap or grounded
// read is the healthy state; no headline means it hasn't been scanned.
function projectState(headline: string | null): { key: "grounded" | "blind" | "new"; label: string } {
  const h = (headline || "").toLowerCase();
  if (!headline) return { key: "new", label: "not scanned" };
  if (h.startsWith("blind") || h.includes("could not be confirmed")) return { key: "blind", label: "attribution blind" };
  if (h.includes("proven") || h.includes("grounded") || h.includes("gap") || h.includes("confirmed")) return { key: "grounded", label: "grounded" };
  return { key: "new", label: "scanned" };
}

function sinceLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const OUTCOME_LABELS: Record<string, string> = {
  signup: "a signup", project_created: "a project created", customer_activated: "a customer activated",
};
function winLabel(outcome: string | null): string {
  if (!outcome) return "a win";
  return OUTCOME_LABELS[outcome] ?? outcome.replace(/_/g, " ");
}

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
          <span className="studio-eyebrow">Operating overview</span>
          <h1 id="project-picker-title">Every product you're taking to market</h1>
          <p>Where each one stands right now — the win it's chasing, whether it's grounded or blind, and how much go-to-market is live. Open one to work its map.</p>
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
        {projects.map((project) => {
          const state = projectState(project.headline);
          return (
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
                <span className={`project-state project-state-${state.key}`}>
                  <span className="dot" aria-hidden="true" />
                  {state.label}
                </span>
              </span>
              <span className="project-choice-chasing">Chasing <strong>{winLabel(project.outcome)}</strong></span>
              <small className="project-choice-headline">{project.headline || "Not scanned yet — open to read its code."}</small>
              <span className="project-choice-meta">
                <span>{project.channelCount} {project.channelCount === 1 ? "pipeline" : "pipelines"}</span>
                <span className="project-choice-since">{sinceLabel(project.updatedAt)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
