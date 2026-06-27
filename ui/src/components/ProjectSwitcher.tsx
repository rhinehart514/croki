import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderGit2, LoaderCircle, Plus, Settings2 } from "lucide-react";
import { Reveal } from "@/lib/motion";
import type { ProjectSummary } from "@/types";
import "@/styles/menu.css";

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

      <Reveal open={open} className="menu project-switcher-menu" role="listbox" origin="top-left">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`menu-item ${project.id === activeProjectId ? "active" : ""}`}
              role="option"
              aria-selected={project.id === activeProjectId}
              type="button"
              onClick={() => {
                setOpen(false);
                if (project.id !== activeProjectId) void onSwitch(project.id);
              }}
            >
              <span className="menu-item-body">
                <span className="menu-item-label">{project.name}</span>
                <span className="menu-item-meta">{project.channelCount} channels · {project.opportunityCount} opportunities</span>
              </span>
              {project.id === activeProjectId ? <Check className="menu-item-check" /> : null}
            </button>
          ))}
          <div className="menu-sep" role="separator" />
          {onNewProduct ? (
            <button
              className="menu-item"
              type="button"
              onClick={() => { setOpen(false); onNewProduct(); }}
            >
              <Plus className="menu-item-icon" />
              <span className="menu-item-label">Point at a new product</span>
            </button>
          ) : null}
          <button
            className="menu-item"
            type="button"
            onClick={() => { setOpen(false); onManage(); }}
          >
            <Settings2 className="menu-item-icon" />
            <span className="menu-item-label">Manage products</span>
          </button>
      </Reveal>
    </div>
  );
}
