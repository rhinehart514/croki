import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderGit2, LoaderCircle, Plus, Settings2, Trash2 } from "lucide-react";
import { Reveal } from "@/lib/motion";
import type { ProjectSummary } from "@/types";
import "@/styles/menu.css";

/**
 * Top-left product switcher. Switching the active product re-scopes the whole
 * workspace — channels, goals, and the Claude session that loads with it.
 */
export function ProjectSwitcher({
  projects,
  activeProjectId,
  busy,
  onSwitch,
  onManage,
  onNewProduct,
  onDelete,
}: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  busy: boolean;
  onSwitch: (projectId: string) => void | Promise<void>;
  onManage: () => void;
  onNewProduct?: () => void;
  // Remove a duplicate product (one project per repo). Absent → no delete affordance.
  onDelete?: (projectId: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  // Inline two-step confirm: first click on the trash arms this row, second click removes. Closing
  // the menu or arming another row resets it, so a stray click never deletes a product.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) { setOpen(false); setConfirmId(null); }
    };
    const onEsc = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setConfirmId(null); } };
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
        onClick={() => { setOpen((value) => !value); setConfirmId(null); }}
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
            <div key={project.id} className="project-switcher-row">
              <button
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
                  <span className="menu-item-meta">{project.channelCount} {project.channelCount === 1 ? "channel" : "channels"}</span>
                </span>
                {project.id === activeProjectId ? <Check className="menu-item-check" /> : null}
              </button>
              {/* Delete only non-active products — the one you're in can't be pulled out from under you.
                  Two-step: trash arms the row, then "Remove" confirms. */}
              {onDelete && project.id !== activeProjectId ? (
                confirmId === project.id ? (
                  <button
                    className="project-switcher-delete confirm"
                    type="button"
                    title={`Remove ${project.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setConfirmId(null);
                      void onDelete(project.id);
                    }}
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    className="project-switcher-delete"
                    type="button"
                    aria-label={`Remove ${project.name}`}
                    title={`Remove ${project.name}`}
                    onClick={(event) => { event.stopPropagation(); setConfirmId(project.id); }}
                  >
                    <Trash2 />
                  </button>
                )
              ) : null}
            </div>
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
