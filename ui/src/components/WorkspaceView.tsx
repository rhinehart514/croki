import { motion } from "motion/react";
import { LayoutGrid, Wrench, Bot, Plus, X, ArrowRight } from "lucide-react";
import { SPRING } from "@/lib/springs";
import { Stagger, StaggerItem } from "@/lib/motion";
import type { GtmLibrary } from "@/types";
import "@/styles/workspace-view.css";

// The workspace's on-disk library — skills and agents, the judgment every open step reaches for,
// listed side by side as one index. Pipelines moved to the always-present left rail (they're real
// project state you pick constantly), so this settings tab holds only the authored artifacts.
// Opening a skill or agent opens its markdown editor; "New" per lane is the authoring entry.
//
// Read-and-navigate only: nothing here sends, runs, or mutates the graph.
export function WorkspaceView({
  library,
  onOpenArtifact,
  onNewArtifact,
  onClose,
}: {
  library: GtmLibrary | null;
  onOpenArtifact: (type: "agent" | "skill", ref: string) => void;
  onNewArtifact: (type: "agent" | "skill") => void;
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
          <span className="wsv-head-sub">Every skill and agent in this product</span>
        </div>
        <button className="wsv-close" onClick={onClose} type="button" aria-label="Close workspace">
          <X size={15} />
        </button>
      </header>

      <div className="wsv-lanes">
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
