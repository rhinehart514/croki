import { motion } from "motion/react";
import { LayoutGrid, Workflow, Wrench, Bot, Plus, X, ArrowRight } from "lucide-react";
import { SPRING } from "@/lib/springs";
import { Stagger, StaggerItem } from "@/lib/motion";
import { healthHex } from "@/lib/health";
import type { ChannelMeta, GtmLibrary } from "@/types";
import "@/styles/workspace-view.css";

// The three-lane workspace: the real artifacts of GTM engineering — workflows, skills, agents —
// listed side by side as one index. Workflows are real project state (channels, with live health);
// skills and agents are the on-disk library every open step reaches for. Opening a workflow loads it
// on the canvas; opening a skill or agent opens its markdown editor. "New" per lane is the authoring
// entry (the canvas is still where you compose; this is where you SEE and pick what exists).
//
// Read-and-navigate only: nothing here sends, runs, or mutates the graph. It is the "open file"
// dialog for a GTM codebase, not a second canvas.
export function WorkspaceView({
  channels,
  library,
  activeChannelId,
  onOpenWorkflow,
  onOpenArtifact,
  onNewArtifact,
  onNewWorkflow,
  onClose,
}: {
  channels: ChannelMeta[];
  library: GtmLibrary | null;
  activeChannelId: string | null;
  onOpenWorkflow: (channelId: string) => void;
  onOpenArtifact: (type: "agent" | "skill", ref: string) => void;
  onNewArtifact: (type: "agent" | "skill") => void;
  onNewWorkflow: () => void;
  onClose: () => void;
}) {
  const agents = library?.agents ?? [];
  const skills = library?.skills ?? [];

  return (
    <motion.div
      className="wsv"
      role="dialog"
      aria-label="Workspace"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={SPRING}
    >
      <header className="wsv-head">
        <div className="wsv-head-title">
          <LayoutGrid size={15} />
          <strong>Workspace</strong>
          <span className="wsv-head-sub">Every pipeline, skill, and agent in this product</span>
        </div>
        <button className="wsv-close" onClick={onClose} type="button" aria-label="Close workspace">
          <X size={15} />
        </button>
      </header>

      <div className="wsv-lanes">
        {/* Workflows — real project state, with live health. */}
        <section className="wsv-lane">
          <div className="wsv-lane-head">
            <span className="wsv-lane-title"><Workflow size={13} /> Pipelines</span>
            <span className="wsv-lane-count">{channels.length}</span>
            <button className="wsv-new" onClick={onNewWorkflow} type="button" title="Ideate a new pipeline">
              <Plus size={13} />
            </button>
          </div>
          <div className="wsv-lane-body">
            {channels.length === 0 ? (
              <p className="wsv-empty">No pipelines yet. Ideate one to start.</p>
            ) : (
              <Stagger className="wsv-cards">
                {channels.map((ch) => (
                  <StaggerItem key={ch.id}>
                    <button
                      className={`wsv-card ${ch.id === activeChannelId ? "active" : ""}`}
                      onClick={() => onOpenWorkflow(ch.id)}
                      type="button"
                    >
                      <span className="wsv-dot" style={{ background: healthHex(ch.lastRunOk === false ? 0.3 : ch.lastRunOk ? 0.85 : 0.6) }} />
                      <span className="wsv-card-body">
                        <span className="wsv-card-name">{ch.name}</span>
                        <span className="wsv-card-sub">{ch.objective || "No objective set"}</span>
                        <span className="wsv-card-meta">
                          {ch.nodeCount} step{ch.nodeCount === 1 ? "" : "s"}
                          {ch.pendingGates > 0 ? ` · ${ch.pendingGates} at the gate` : ""}
                          {ch.runCount > 0 ? ` · ${ch.runCount} run${ch.runCount === 1 ? "" : "s"}` : " · never run"}
                        </span>
                      </span>
                      <ArrowRight className="wsv-card-go" size={14} />
                    </button>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </section>

        {/* Skills — judgment from disk. */}
        <section className="wsv-lane">
          <div className="wsv-lane-head">
            <span className="wsv-lane-title"><Wrench size={13} /> Skills</span>
            <span className="wsv-lane-count">{skills.length}</span>
            <button className="wsv-new" onClick={() => onNewArtifact("skill")} type="button" title="Author a new skill">
              <Plus size={13} />
            </button>
          </div>
          <div className="wsv-lane-body">
            {skills.length === 0 ? (
              <p className="wsv-empty">No skills on disk.</p>
            ) : (
              <Stagger className="wsv-cards">
                {skills.map((sk) => (
                  <StaggerItem key={sk.name}>
                    <button className="wsv-card" onClick={() => onOpenArtifact("skill", sk.name)} type="button">
                      <span className="wsv-card-body">
                        <span className="wsv-card-name">{sk.name}</span>
                        <span className="wsv-card-sub">{sk.description || "No description"}</span>
                      </span>
                      <ArrowRight className="wsv-card-go" size={14} />
                    </button>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </section>

        {/* Agents — personalized teammates, on disk. */}
        <section className="wsv-lane">
          <div className="wsv-lane-head">
            <span className="wsv-lane-title"><Bot size={13} /> Agents</span>
            <span className="wsv-lane-count">{agents.length}</span>
            <button className="wsv-new" onClick={() => onNewArtifact("agent")} type="button" title="Author a new agent">
              <Plus size={13} />
            </button>
          </div>
          <div className="wsv-lane-body">
            {agents.length === 0 ? (
              <p className="wsv-empty">No agents on disk.</p>
            ) : (
              <Stagger className="wsv-cards">
                {agents.map((ag) => (
                  <StaggerItem key={ag.ref}>
                    <button className="wsv-card" onClick={() => onOpenArtifact("agent", ag.ref)} type="button">
                      <span className="wsv-card-body">
                        <span className="wsv-card-name">{ag.ref}</span>
                        <span className="wsv-card-sub">{ag.description || "No description"}</span>
                      </span>
                      <ArrowRight className="wsv-card-go" size={14} />
                    </button>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </section>
      </div>
    </motion.div>
  );
}
