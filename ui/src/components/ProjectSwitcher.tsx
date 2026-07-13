import { useState } from "react";
import { ChevronDown, FolderGit2, LoaderCircle, Plus, Settings2, Trash2 } from "lucide-react";
import type { ProjectSummary } from "@/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [deleteProject, setDeleteProject] = useState<ProjectSummary | null>(null);

  const active = projects.find((project) => project.id === activeProjectId) ?? null;

  return (
    <div className="project-switcher">
      <DropdownMenu open={open} onOpenChange={setOpen} disabled={busy}>
        <DropdownMenuTrigger
          className="project-switcher-trigger"
          aria-label={active ? `Switch product. Current product: ${active.name}` : "Choose product"}
        >
          {busy ? <LoaderCircle className="spin" /> : <FolderGit2 />}
          <span className="project-switcher-name">{active?.name ?? "Choose product"}</span>
          <ChevronDown className="project-switcher-caret" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="menu min-w-[264px]">
          <DropdownMenuRadioGroup
            value={activeProjectId ?? ""}
            onValueChange={(projectId) => {
              if (projectId !== activeProjectId) void onSwitch(String(projectId));
            }}
          >
            {projects.map((project) => (
              <DropdownMenuRadioItem
                key={project.id}
                value={project.id}
                closeOnClick
                className={`menu-item ${project.id === activeProjectId ? "active" : ""}`}
              >
                <span className="menu-item-body">
                  <span className="menu-item-label">{project.name}</span>
                  <span className="menu-item-meta">{project.channelCount} {project.channelCount === 1 ? "pipeline" : "pipelines"}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator className="menu-sep" />
          {onNewProduct ? (
            <DropdownMenuItem
              className="menu-item"
              onClick={onNewProduct}
            >
              <Plus className="menu-item-icon" />
              <span className="menu-item-label">Point at a new product</span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className="menu-item"
            onClick={onManage}
          >
            <Settings2 className="menu-item-icon" />
            <span className="menu-item-label">Manage products</span>
          </DropdownMenuItem>
          {onDelete && projects.some((project) => project.id !== activeProjectId) ? (
            <>
              <DropdownMenuSeparator className="menu-sep" />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="menu-label">Remove product</DropdownMenuLabel>
                {projects.filter((project) => project.id !== activeProjectId).map((project) => (
                  <DropdownMenuItem
                    key={`remove:${project.id}`}
                    variant="destructive"
                    className="menu-item destructive"
                    onClick={() => setDeleteProject(project)}
                  >
                    <Trash2 className="menu-item-icon" />
                    <span className="menu-item-label">{project.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleteProject !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setDeleteProject(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteProject?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the product from Drover. The active product cannot be removed here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteProject(null)}>Keep product</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteProject && onDelete) void onDelete(deleteProject.id);
                setDeleteProject(null);
              }}
            >
              Remove product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
