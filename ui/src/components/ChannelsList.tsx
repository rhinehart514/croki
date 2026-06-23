import { useCallback, useEffect, useState } from "react";
import { Copy, FileText, LoaderCircle, Plus, X } from "lucide-react";
import {
  createWorkflow,
  createPortfolioBriefArtifact,
  duplicateWorkflow,
  getPortfolioBrief,
  getProject,
} from "@/api";
import type { ChannelMeta, PortfolioBrief } from "@/types";

function StatusDot({ status }: { status: ChannelMeta["status"] }) {
  const color =
    status === "done" ? "var(--proven)" :
    status === "waiting" ? "var(--gap)" :
    status === "error" ? "var(--danger)" :
    "var(--faint)";
  return (
    <span
      className="channel-card-status-dot"
      style={{ background: color }}
      title={status}
    />
  );
}

function formatLastRun(lastRunAt: string | null): string {
  if (!lastRunAt) return "Never run";
  const d = new Date(lastRunAt);
  if (isNaN(d.getTime())) return "Never run";
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString();
}

export function ChannelsList({
  onOpenChannel,
}: {
  onOpenChannel: (id: string) => void;
}) {
  const [projectName, setProjectName] = useState<string>("Q3 Launch");
  const [channels, setChannels] = useState<ChannelMeta[]>([]);
  const [brief, setBrief] = useState<PortfolioBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBrief, setSavingBrief] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newObjective, setNewObjective] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [{ project }, briefResponse] = await Promise.all([getProject(), getPortfolioBrief()]);
      setProjectName(project.name);
      setChannels(project.workflows ?? project.channels);
      setBrief(briefResponse.brief);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="channels-loading">
        <LoaderCircle className="spin" />
        <span>Loading workflows...</span>
      </div>
    );
  }

  return (
    <div className="channels-list-wrap">
      <div className="channels-list-header">
        <div>
          <h2 className="channels-list-title">{projectName}</h2>
          <p className="channels-list-subtitle">
            {channels.length} coordinated programs · shared context v{brief?.sharedContextVersion ?? "—"}
          </p>
        </div>
        <button
          className="channels-brief-btn"
          disabled={savingBrief}
          onClick={async () => {
            setSavingBrief(true);
            try {
              await createPortfolioBriefArtifact();
              const response = await getPortfolioBrief();
              setBrief(response.brief);
            } finally {
              setSavingBrief(false);
            }
          }}
          type="button"
        >
          {savingBrief ? <LoaderCircle className="spin" /> : <FileText />}
          Preserve brief
        </button>
        <button className="channels-brief-btn" onClick={() => setCreating(true)} type="button">
          <Plus />
          New workflow
        </button>
      </div>

      {creating ? (
        <form
          className="channel-create"
          onSubmit={async (event) => {
            event.preventDefault();
            const name = newName.trim();
            const objective = newObjective.trim();
            if (!name || !objective) return;
            const result = await createWorkflow({ name, objective });
            setNewName("");
            setNewObjective("");
            setCreating(false);
            await refresh();
            onOpenChannel(result.workflow.id);
          }}
        >
          <div>
            <strong>Define the motion</strong>
            <span>The graph starts blank. You or Claude shape how this workflow works.</span>
          </div>
          <input
            aria-label="Workflow name"
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Workflow name"
            value={newName}
          />
          <input
            aria-label="Workflow objective"
            onChange={(event) => setNewObjective(event.target.value)}
            placeholder="What outcome should this workflow produce?"
            value={newObjective}
          />
          <button className="channel-card-open" type="submit">Create</button>
          <button className="channel-create-close" onClick={() => setCreating(false)} type="button">
            <X />
          </button>
        </form>
      ) : null}

      <div className="portfolio-context-strip">
        <div>
          <span>Position</span>
          <strong>{String(brief?.positioning?.promise || brief?.positioning?.category || "Not decided yet")}</strong>
        </div>
        <div>
          <span>Observed outcomes</span>
          <strong>{brief?.observedOutcomes.length ?? 0}</strong>
        </div>
        <div>
          <span>Experiments</span>
          <strong>{brief?.experiments.length ?? 0}</strong>
        </div>
        <div>
          <span>Proof artifacts</span>
          <strong>{brief?.artifacts.length ?? 0}</strong>
        </div>
      </div>

      <div className="channels-grid">
        {channels.length === 0 ? (
          <div className="channels-empty">
            <strong>No workflows yet</strong>
            <span>Create the first workflow when you know what job it should do. GTM IDE will not choose the portfolio for you.</span>
            <button className="channel-card-open" onClick={() => setCreating(true)} type="button">Create first workflow</button>
          </div>
        ) : null}
        {channels.map((ch) => (
          <div className="channel-card" key={ch.id}>
            <div className="channel-card-top">
              <StatusDot status={ch.status} />
              <span className="channel-card-name">{ch.name}</span>
            </div>
            <div className="channel-card-meta">
              <span>{ch.nodeCount} nodes</span>
              <span className="channel-card-sep">·</span>
              <span>{ch.runCount} run{ch.runCount !== 1 ? "s" : ""}</span>
              <span className="channel-card-sep">·</span>
              <span>{formatLastRun(ch.lastRunAt)}</span>
            </div>
            <p className="channel-card-objective">{ch.objective}</p>
            {brief?.outcomeCounts[ch.id] && Object.keys(brief.outcomeCounts[ch.id]).length ? (
              <span className="channel-card-outcomes">
                {Object.entries(brief.outcomeCounts[ch.id]).map(([type, count]) => `${count} ${type}`).join(" · ")}
              </span>
            ) : null}
            {ch.pendingGates > 0 ? (
              <span className="channel-card-gate">{ch.pendingGates} waiting for review</span>
            ) : null}
            <button
              className="channel-card-open"
              onClick={() => onOpenChannel(ch.id)}
              type="button"
            >
              Open →
            </button>
            <button
              className="channel-card-copy"
              onClick={async () => {
                const result = await duplicateWorkflow(ch.id, { name: `${ch.name} copy` });
                await refresh();
                onOpenChannel(result.workflow.id);
              }}
              title="Duplicate workflow"
              type="button"
            >
              <Copy />
              Duplicate
            </button>
          </div>
        ))}
      </div>

      <div className="channels-list-footer">
        <strong>Operator recommendations</strong>
        {(brief?.recommendations ?? []).slice(0, 3).map((recommendation) => (
          <span key={recommendation}>{recommendation}</span>
        ))}
      </div>
    </div>
  );
}
