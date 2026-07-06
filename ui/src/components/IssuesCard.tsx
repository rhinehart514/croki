import { AlertTriangle, ArrowRight, Wrench } from "lucide-react";
import { Stagger, StaggerItem } from "@/lib/motion";
import { healthHex } from "@/lib/health";
import { areaLabel, fixProblemInstruction, fixStepInstruction } from "@/lib/operatorLanguage";
import type { GTMContractAudit, GTMGraph, GTMNode, Investigation } from "@/types";
import "@/styles/floating-dock.css";

// The Issues surface, summoned onto the canvas as a card instead of living as a permanent toolbar
// button. It merges engine investigations (Problems) and pipeline contract audits — both answer
// "what's broken across the system." The founder's bar: an issue you can't act on is noise, so every
// row's PRIMARY action hands the problem to Claude to fix (onFix → the operator works it behind the
// gate). Opening the offending node stays available as a secondary.
export function IssuesCard({
  problems, audits, graph, nodeForSubsystem, onFix, onJump,
}: {
  problems: Investigation[];
  audits: Record<string, GTMContractAudit>;
  graph: GTMGraph | null;
  nodeForSubsystem: (subsystem: string) => GTMNode | null;
  // Hand the problem to Claude to repair (the honest "auto-fix": rented intelligence fixes it, the
  // founder still gates anything outbound).
  onFix: (instruction: string) => void;
  // Jump to the node that owns the problem, for a hands-on edit.
  onJump: (nodeId: string) => void;
}) {
  const auditIssues = (graph?.nodes ?? [])
    .map((n) => ({ node: n, audit: audits[n.id] }))
    .filter((x): x is { node: GTMNode; audit: GTMContractAudit } =>
      !!x.audit && ["waiting", "blocked", "blind"].includes(x.audit.state));
  const issueCount = problems.length + auditIssues.length;
  // Fixing hands the problem to Claude, which works it against the pipeline you have open. From the
  // "All pipelines" overview no single pipeline is in focus, so there's nothing for the fix to target —
  // firing it there used to error mid-run and spin up a stray pipeline. When no pipeline is open we
  // point the founder to open one first instead of offering an action that can't land.
  const pipelineActive = !!graph;

  if (issueCount === 0) {
    return <p className="fdock-problems-empty">No issues — your system is healthy.</p>;
  }

  return (
    <div className="issues-card">
      <Stagger>
        {problems.map((p) => {
          const node = nodeForSubsystem(p.subsystem);
          return (
            <StaggerItem className="fdock-problems-item" key={`p-${p.id}`}>
              <div className="fdock-problems-head">
                <AlertTriangle size={13} />
                <p>{p.problem}</p>
              </div>
              <div className="fdock-problems-meta">
                <span className="fdock-problems-sub">{areaLabel(p.subsystem)}</span>
                <span
                  className="fdock-problems-health"
                  style={{ color: healthHex(p.health), borderColor: healthHex(p.health) }}
                  title={`Health ${p.health}`}
                >
                  {p.health}
                </span>
              </div>
              {pipelineActive ? (
                <div className="issues-card-actions">
                  <button
                    className="fdock-problems-fix primary"
                    onClick={() => onFix(fixProblemInstruction(p.subsystem, p.problem))}
                    type="button"
                  >
                    <Wrench size={12} /> Fix with Claude
                  </button>
                  {node ? (
                    <button className="fdock-problems-fix" onClick={() => onJump(node.id)} type="button">
                      Open {node.label}<ArrowRight size={12} />
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="fdock-problems-hint">Open a pipeline to fix this with Claude.</p>
              )}
            </StaggerItem>
          );
        })}
        {auditIssues.map(({ node, audit }) => (
          <StaggerItem className="fdock-problems-item" key={`a-${node.id}`}>
            <div className="fdock-problems-head"><AlertTriangle size={13} /><p>{node.label}</p></div>
            <p className="fdock-audit-msg">{audit.message}</p>
            <div className="issues-card-actions">
              <button
                className="fdock-problems-fix primary"
                onClick={() => onFix(fixStepInstruction(node.label, audit.message))}
                type="button"
              >
                <Wrench size={12} /> Fix with Claude
              </button>
              <button className="fdock-problems-fix" onClick={() => onJump(node.id)} type="button">
                Open {node.label}<ArrowRight size={12} />
              </button>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
