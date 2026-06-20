import {
  AlertTriangle, Check, Circle, GitBranch, History, LoaderCircle,
  Play, RotateCcw, SearchCode,
} from "lucide-react";
import type {
  GTMRevision, GTMWorkspace, WorkspaceStep, WorkspaceSummary,
} from "@/types";

function StepIcon({ step }: { step: WorkspaceStep }) {
  if (step.status === "complete") return <Check aria-hidden="true" />;
  if (step.status === "failed" || step.status === "blocked") return <AlertTriangle aria-hidden="true" />;
  if (step.status === "ready") return <Play aria-hidden="true" />;
  return <Circle aria-hidden="true" />;
}

function revisionLabel(revision: GTMRevision) {
  return revision.summary || revision.diffStat || revision.id;
}

export function WorkspaceRail({
  workspace,
  workspaces,
  selected,
  busy,
  onSelectStep,
  onSelectRevision,
  onOpenWorkspace,
}: {
  workspace: GTMWorkspace | null;
  workspaces: WorkspaceSummary[];
  selected: string;
  busy: boolean;
  onSelectStep: (stepId: string) => void;
  onSelectRevision: (revisionId: string) => void;
  onOpenWorkspace: (workspaceId: string) => void;
}) {
  return (
    <>
      {workspace ? (
        <div className="workspace-identity">
          <SearchCode aria-hidden="true" />
          <div>
            <strong>{workspace.name}</strong>
            <span>{workspace.repo}</span>
          </div>
          {busy ? <LoaderCircle className="spin" aria-label="Workspace action running" /> : null}
        </div>
      ) : null}

      {workspace ? (
        <div className="workflow-list" aria-label="GTM debugging workflow">
          {workspace.workflow.map((step, index) => (
            <button
              className={`workflow-step workflow-${step.status} ${selected === `step:${step.id}` ? "selected" : ""}`}
              key={step.id}
              onClick={() => onSelectStep(step.id)}
              type="button"
            >
              <span className="workflow-index">{index + 1}</span>
              <span className="workflow-step-copy">
                <strong>{step.label}</strong>
                <small>{step.description}</small>
              </span>
              <span className="workflow-step-status" aria-label={step.status}>
                <StepIcon step={step} />
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {workspace?.revisions.length ? (
        <section className="rail-section">
          <div className="rail-section-title"><GitBranch aria-hidden="true" />Change sets</div>
          <div className="revision-list">
            {[...workspace.revisions].reverse().map((revision) => (
              <button
                className={`revision-row ${selected === `revision:${revision.id}` ? "selected" : ""}`}
                key={revision.id}
                onClick={() => onSelectRevision(revision.id)}
                type="button"
              >
                <span className={`revision-status revision-${revision.status}`}>{revision.status}</span>
                <span>{revisionLabel(revision)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {workspaces.length > 1 ? (
        <section className="rail-section">
          <div className="rail-section-title"><History aria-hidden="true" />Recent workspaces</div>
          <div className="recent-workspaces">
            {workspaces
              .filter((item) => item.id !== workspace?.id)
              .slice(0, 5)
              .map((item) => (
                <button key={item.id} onClick={() => onOpenWorkspace(item.id)} type="button">
                  <strong>{item.name}</strong>
                  <span>{item.headline}</span>
                </button>
              ))}
          </div>
        </section>
      ) : null}

      {workspace?.runs.length && workspace.runs.length > 1 ? (
        <div className="rail-footnote">
          <RotateCcw aria-hidden="true" />
          {workspace.runs.length} repository proofs preserved
        </div>
      ) : null}
    </>
  );
}
