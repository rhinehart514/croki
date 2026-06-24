import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderGit2, LoaderCircle, Plus, Settings2 } from "lucide-react";
import type { ProjectSummary } from "@/types";

/**
 * Top-left product switcher. Switching the active product re-scopes the whole
 * workspace — channels, opportunities, and the Claude session that loads with it.
 */
export function ProjectSwitcher({
  projects,
  activeProjectId,
  busy,
  onSwitch,
  onManage,
  onNewProduct,
}: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  busy: boolean;
  onSwitch: (projectId: string) => void | Promise<void>;
  onManage: () => void;
  onNewProduct?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onEsc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const active = projects.find((project) => project.id === activeProjectId) ?? null;

  return (
    <div className="project-switcher" ref={ref}>
      <button
        className="project-switcher-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={busy}
      >
        {busy ? <LoaderCircle className="spin" /> : <FolderGit2 />}
        <span className="project-switcher-name">{active?.name ?? "Choose product"}</span>
        <ChevronDown className="project-switcher-caret" />
      </button>

      {open ? (
        <div className="project-switcher-menu" role="listbox">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`project-switcher-item ${project.id === activeProjectId ? "active" : ""}`}
              role="option"
              aria-selected={project.id === activeProjectId}
              type="button"
              onClick={() => {
                setOpen(false);
                if (project.id !== activeProjectId) void onSwitch(project.id);
              }}
            >
              <span className="project-switcher-item-main">
                <strong>{project.name}</strong>
                <small>{project.channelCount} channels · {project.opportunityCount} opportunities</small>
              </span>
              {project.id === activeProjectId ? <Check className="project-switcher-check" /> : null}
            </button>
          ))}
          {onNewProduct ? (
            <button
              className="project-switcher-manage"
              type="button"
              onClick={() => { setOpen(false); onNewProduct(); }}
            >
              <Plus /> Point at a new product
            </button>
          ) : null}
          <button
            className="project-switcher-manage"
            type="button"
            onClick={() => { setOpen(false); onManage(); }}
          >
            <Settings2 /> Manage products
          </button>
        </div>
      ) : null}
    </div>
  );
}
