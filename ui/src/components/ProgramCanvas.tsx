import { useMemo, useState } from "react";
import {
  Bot, CheckCircle2, GitBranch, History, Play, TestTube2,
} from "lucide-react";
import { GraphCanvas } from "@/components/GraphCanvas";
import { statusLabel as canonicalStatus, toneForPhrase } from "@/lib/status";
import type {
  AgentCreationPolicy, AgentEvaluation, AgentInstance, ConnectorMeta, DomainEvent, FeedbackSignal,
  GTMContractAudit, GTMGraph, GTMNode, GTMRunResult, NodeSelection, OutcomeProgram,
} from "@/types";

export type ProgramCanvasMode = "design" | "simulation" | "run" | "review" | "learning";
export type DebugTab = "timeline" | "events" | "runLogs" | "replay" | "diff" | "contracts";

const MODE_LABEL: Record<ProgramCanvasMode, string> = {
  design: "Design",
  simulation: "Simulation",
  run: "Run",
  review: "Review",
  learning: "Learning",
};

// Each mode is a different question asked of the same program, not a different page. The mode
// re-skins the one graph (the lens, in GraphCanvas) and points the debugger at the matching tab —
// so Design, Simulation, Run, Review, and Learning each read as a distinct lens on one surface.
const MODE_INTENT: Record<ProgramCanvasMode, { question: string; debug: DebugTab }> = {
  design: { question: "What is this program trying to achieve, and what was built to do it?", debug: "contracts" },
  simulation: { question: "What will happen on the next run, and where does it stop for your judgment?", debug: "replay" },
  run: { question: "What happened step by step on the last run?", debug: "runLogs" },
  review: { question: "What is waiting for your approval before anything leaves the building?", debug: "timeline" },
  learning: { question: "What did your decisions change about how the next agent gets created?", debug: "diff" },
};

function text(value: unknown, fallback = "Not defined yet") {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function firstString(record: Record<string, unknown> | undefined, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

// The program's headline status composes run + program state into one phrase; its tone comes from
// the shared toneForPhrase so it colors identically to every other status pill in the UI.
function programHeadline(program: OutcomeProgram, runResult: GTMRunResult | null, graph: GTMGraph | null) {
  if (runResult?.pendingGates?.length) return "paused at gate";
  if (runResult && !runResult.ok) return "blocked";
  if (runResult?.ok) return "completed";
  if (!graph) return "not composed";
  return canonicalStatus(program.status);
}

export function ProgramCanvas({
  program,
  graph,
  mode,
  onModeChange,
  runResult,
  runs,
  agents,
  policies,
  evaluations,
  feedback,
  events,
  running,
  runningNodeId = null,
  selection,
  connectors,
  subsystemHealth = {},
  contractAudits = {},
  onRunProgram,
  onBuildAgents,
  onSelectNode,
  onNodePositionChange,
  onConnectNodes,
  onDeleteEdges,
  onAddNode,
  onLoadRecipe,
  proposedNodeIds,
  proposedEdgeIds,
  focusDebug,
}: {
  program: OutcomeProgram;
  graph: GTMGraph | null;
  mode: ProgramCanvasMode;
  onModeChange: (mode: ProgramCanvasMode) => void;
  runResult: GTMRunResult | null;
  runs: GTMRunResult[];
  agents: AgentInstance[];
  policies: AgentCreationPolicy[];
  evaluations: AgentEvaluation[];
  feedback: FeedbackSignal[];
  events: DomainEvent[];
  running: boolean;
  runningNodeId?: string | null;
  selection: NodeSelection;
  connectors: ConnectorMeta[];
  subsystemHealth?: Record<string, { health: number; issue?: string }>;
  contractAudits?: Record<string, GTMContractAudit>;
  onRunProgram: () => void;
  // Fires the operator to derive agent needs and build this program's agents — the canvas
  // describes the next move, so it must also perform it. Design-time and reversible (the gate
  // still holds), so it auto-runs rather than making the founder retype the ask.
  onBuildAgents: () => void;
  // A real graph node was clicked — opens the shared node editor (the canvas-first IDE behavior).
  onSelectNode: (id: string) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectNodes?: (source: string, target: string) => void;
  onDeleteEdges?: (edgeIds: string[]) => void;
  onAddNode?: (spec: Partial<GTMNode> & { label: string }) => void;
  onLoadRecipe?: () => void;
  // Operator-staged nodes/edges to ghost on the canvas for founder review (the proposal layer).
  proposedNodeIds?: Set<string>;
  proposedEdgeIds?: Set<string>;
  // Lets the explorer deep-link the bottom debugger to a specific tab (e.g. clicking a Run opens
  // Run Logs). The nonce makes repeat clicks of the same tab re-fire.
  focusDebug?: { tab: DebugTab; nonce: number } | null;
}) {
  const programAgents = useMemo(() => agents.filter((agent) => agent.programId === program.id), [agents, program.id]);
  const programPolicies = useMemo(() => policies.filter((policy) => policy.programId === program.id), [policies, program.id]);
  const policyIds = useMemo(() => new Set(programPolicies.map((policy) => policy.id)), [programPolicies]);
  const programFeedback = useMemo(() => feedback.filter((signal) =>
    signal.graphId === program.graphId || (signal.policyIds ?? []).some((policyId) => policyIds.has(policyId))
  ), [feedback, policyIds, program.graphId]);
  const programEvents = useMemo(() => events.filter((event) =>
    event.aggregateId === program.id
    || programAgents.some((agent) => agent.id === event.aggregateId)
    || programPolicies.some((policy) => policy.id === event.aggregateId)
  ), [events, program.id, programAgents, programPolicies]);
  const programEvaluations = useMemo(() => evaluations.filter((evaluation) => evaluation.programId === program.id), [evaluations, program.id]);
  const latestEvaluationByAgent = useMemo(() => {
    const map = new Map<string, AgentEvaluation>();
    for (const evaluation of programEvaluations) map.set(evaluation.agentInstanceId, evaluation);
    return map;
  }, [programEvaluations]);

  const intent = MODE_INTENT[mode];
  const [debugTab, setDebugTab] = useState<DebugTab>(MODE_INTENT.design.debug);
  // Which agent's policy + rules the inspector is expanded on. Independent of the canvas node
  // selection: the graph carries the execution plan, the inspector carries the program framing.
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Changing mode re-aims the debugger to the tab that mode is about. React's sanctioned
  // adjust-state-during-render pattern — no effect, no cascading render.
  const [trackedMode, setTrackedMode] = useState(mode);
  if (trackedMode !== mode) {
    setTrackedMode(mode);
    setDebugTab(intent.debug);
  }

  // An explorer deep-link to a debugger tab wins over the mode default.
  const [trackedDebugNonce, setTrackedDebugNonce] = useState(focusDebug?.nonce ?? 0);
  if (focusDebug && focusDebug.nonce !== trackedDebugNonce) {
    setTrackedDebugNonce(focusDebug.nonce);
    setDebugTab(focusDebug.tab);
  }

  const selectedAgent = selectedAgentId ? programAgents.find((agent) => agent.id === selectedAgentId) ?? null : null;
  const selectedPolicy = selectedAgent ? programPolicies.find((policy) => policy.id === selectedAgent.creationPolicyId) ?? null : null;

  // The compounding, made into a causal thread: a founder decision drove a rule change, which built
  // a smarter agent. Each revised policy (one with a previous version) is one loop closing.
  const learningThreads = useMemo(() => programPolicies
    .filter((policy) => policy.previousPolicyId)
    .map((revised) => {
      const prev = programPolicies.find((policy) => policy.id === revised.previousPolicyId) ?? null;
      const drivingSignals = programFeedback.filter((signal) =>
        (revised.feedbackSignalIds ?? []).includes(signal.id)
        || (signal.policyIds ?? []).includes(revised.previousPolicyId ?? ""));
      const newAgent = programAgents.find((agent) => agent.creationPolicyId === revised.id) ?? null;
      const addedNegative = revised.negativeRules.filter((rule) => !(prev?.negativeRules ?? []).includes(rule));
      const addedPositive = revised.positiveRules.filter((rule) => !(prev?.positiveRules ?? []).includes(rule));
      return { revised, drivingSignals, newAgent, addedNegative, addedPositive };
    })
    .reverse(), [programPolicies, programFeedback, programAgents]);

  const measurementBlind = !(program.measurementPlan?.joinKey && program.measurementPlan?.outcomeEvent);
  const hasGraph = !!graph && graph.nodes.length > 0;
  const pendingGate = runResult?.pendingGates?.[0] ?? null;

  return (
    <div className="program-workbench">
      <header className="program-topbar">
        <div className="program-title-block">
          <span className="program-path">Outcome Program</span>
          <h1>{program.name}</h1>
          <div className="program-status-line">
            <span className={`program-status-pill ${toneForPhrase(programHeadline(program, runResult, graph))}`}>{programHeadline(program, runResult, graph)}</span>
            <span>{graph ? `${graph.nodes.length} execution steps` : "No execution graph"}</span>
            <span>{programAgents.length} agent{programAgents.length === 1 ? "" : "s"} built for it</span>
          </div>
        </div>
        <div className="program-actions">
          <div className="program-mode-tabs" aria-label="Canvas mode">
            {(Object.keys(MODE_LABEL) as ProgramCanvasMode[]).map((nextMode) => (
              <button
                key={nextMode}
                className={mode === nextMode ? "active" : ""}
                onClick={() => onModeChange(nextMode)}
                type="button"
              >
                {MODE_LABEL[nextMode]}
              </button>
            ))}
          </div>
          <button className="program-primary-action" disabled={running || !graph} onClick={onRunProgram} type="button">
            {running ? "Running..." : "Run Program"}
          </button>
        </div>
      </header>

      <div className="program-mode-intent">
        <span className="program-mode-intent-label">{MODE_LABEL[mode]}</span>
        <span className="program-mode-intent-q">{intent.question}</span>
        {mode === "review" && pendingGate ? (
          <button className="program-mode-intent-action" onClick={() => onSelectNode(pendingGate)} type="button">
            Review the gate →
          </button>
        ) : null}
      </div>

      <div className={`program-canvas-grid mode-${mode}`}>
        <section className="program-canvas-plane program-canvas-graph" aria-label="Outcome program canvas">
          {hasGraph && graph ? (
            <GraphCanvas
              mode={mode}
              graph={graph}
              result={runResult}
              running={running}
              runningNodeId={runningNodeId}
              selection={selection}
              connectors={connectors}
              subsystemHealth={subsystemHealth}
              contractAudits={contractAudits}
              proposedNodeIds={proposedNodeIds}
              proposedEdgeIds={proposedEdgeIds}
              onSelect={onSelectNode}
              onNodePositionChange={onNodePositionChange}
              onConnectNodes={onConnectNodes}
              onDeleteEdges={onDeleteEdges}
              onAddNode={onAddNode}
              onLoadRecipe={onLoadRecipe}
              panelOpen={false}
            />
          ) : (
            <div className="program-empty-agents">
              <Bot />
              <strong>No workflow composed yet</strong>
              <span>This program needs agents and a workflow to chase its outcome. Claude reads your product and builds the first one.</span>
              <button className="program-build-agents" onClick={onBuildAgents} disabled={running} type="button">
                <Bot size={14} /> Build the first agent
              </button>
            </div>
          )}
        </section>

        <aside className="program-inspector">
          <span className="inspector-kicker">Program</span>
          <h2>{program.name}</h2>
          <p>{firstString(program.desiredOutcome, ["description", "target", "type"], "The program needs a stated outcome.")}</p>
          <dl className="inspector-facts">
            <div><dt>Status</dt><dd>{canonicalStatus(program.status)}</dd></div>
            <div><dt>Buyer</dt><dd>{firstString(program.buyerHypothesis, ["description", "audience", "target"], "Not recorded")}</dd></div>
            <div><dt>Channel</dt><dd>{firstString(program.channelHypothesis, ["objective", "motion", "description"], "Not recorded")}</dd></div>
            <div><dt>Outcome event</dt><dd>{text(program.measurementPlan?.outcomeEvent, "missing")}</dd></div>
            <div><dt>Join key</dt><dd>{text(program.measurementPlan?.joinKey, "missing")}</dd></div>
          </dl>
          {measurementBlind ? (
            <div className="inspector-section">
              <span className={`program-status-pill ${toneForPhrase("blind")}`}>blind attribution</span>
              <p>No attribution join key and outcome event yet — scaled runs are gated until measurement is defined.</p>
            </div>
          ) : null}

          <div className="inspector-section">
            <h3>Agents ({programAgents.length})</h3>
            {programAgents.length ? (
              <div className="inspector-agent-chips">
                {programAgents.map((agent) => (
                  <button
                    key={agent.id}
                    className={`inspector-agent-chip ${selectedAgentId === agent.id ? "selected" : ""}`}
                    onClick={() => setSelectedAgentId((current) => current === agent.id ? null : agent.id)}
                    type="button"
                  >
                    <Bot size={12} />
                    {agent.ref} v{agent.version}
                  </button>
                ))}
              </div>
            ) : (
              <p>No agents built yet. <button className="inspector-inline-action" onClick={onBuildAgents} disabled={running} type="button">Build the first agent</button>.</p>
            )}
          </div>

          {selectedAgent ? (
            <div className="inspector-section">
              <h3>{selectedAgent.ref} v{selectedAgent.version}</h3>
              <p>{selectedAgent.job}</p>
              <p className="inspector-contract">Accepts: {selectedAgent.inputContract.join(", ") || "none"}</p>
              <p className="inspector-contract">Emits: {selectedAgent.outputContract.join(", ") || "none"}</p>
              {selectedPolicy ? (
                <>
                  <RuleList title="Positive" items={selectedPolicy.positiveRules} />
                  <RuleList title="Negative" items={selectedPolicy.negativeRules} />
                  <RuleList title="Evidence" items={selectedPolicy.evidenceRequirements} />
                  <RuleList title="Safety" items={selectedPolicy.safetyRules} />
                </>
              ) : null}
              {latestEvaluationByAgent.get(selectedAgent.id) ? (
                <p className="inspector-eval">{latestEvaluationByAgent.get(selectedAgent.id)?.recommendations[0] ?? "No recommendation recorded."}</p>
              ) : null}
            </div>
          ) : null}

          {mode === "learning" || learningThreads.length ? (
            <div className="inspector-section">
              <h3>What your decisions changed</h3>
              {learningThreads.length ? (
                learningThreads.map((thread) => <LearningThread key={thread.revised.id} thread={thread} />)
              ) : programFeedback.length ? (
                <p>{programFeedback.length} decision{programFeedback.length === 1 ? "" : "s"} recorded — run again so they revise an agent.</p>
              ) : (
                <p>No founder decisions yet. Approve, reject, or edit at a gate and the rules learn from it.</p>
              )}
            </div>
          ) : null}
        </aside>
      </div>

      <section className="program-debugger" aria-label="Program debugger">
        <div className="debugger-tabs">
          {(["timeline", "events", "runLogs", "replay", "diff", "contracts"] as DebugTab[]).map((tab) => (
            <button key={tab} className={debugTab === tab ? "active" : ""} onClick={() => setDebugTab(tab)} type="button">
              {tab === "runLogs" ? "Run Logs" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="debugger-body">
          {debugTab === "timeline" ? <Timeline events={programEvents} feedback={programFeedback} /> : null}
          {debugTab === "events" ? <EventList events={programEvents} /> : null}
          {debugTab === "runLogs" ? <RunLogs runs={runs} /> : null}
          {debugTab === "replay" ? <ReplayPanel runResult={runResult} /> : null}
          {debugTab === "diff" ? <ThreadPanel threads={learningThreads} /> : null}
          {debugTab === "contracts" ? <ContractsPanel agents={programAgents} policies={programPolicies} evaluations={programEvaluations} /> : null}
        </div>
      </section>
    </div>
  );
}

function RuleList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rule-list">
      <strong>{title}</strong>
      {items.length ? items.slice(0, 5).map((item) => <span key={item}>{item}</span>) : <span>None recorded.</span>}
    </div>
  );
}

function Timeline({ events, feedback }: { events: DomainEvent[]; feedback: FeedbackSignal[] }) {
  const rows = [
    ...events.map((event) => ({ id: event.id, type: event.type, detail: event.aggregateType ?? "", at: event.createdAt })),
    ...feedback.map((signal) => ({ id: signal.id, type: signal.type, detail: signal.summary, at: signal.observedAt })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
  if (!rows.length) return <div className="debugger-empty">No events yet. Run the program to create a timeline.</div>;
  return <div className="timeline-list">{rows.map((row) => <DebugRow key={row.id} icon={<History />} title={row.type} detail={row.detail} meta={new Date(row.at).toLocaleString()} />)}</div>;
}

function EventList({ events }: { events: DomainEvent[] }) {
  if (!events.length) return <div className="debugger-empty">No domain events recorded for this program yet.</div>;
  return <div className="timeline-list">{events.slice(-12).reverse().map((event) => <DebugRow key={event.id} icon={<GitBranch />} title={event.type} detail={event.aggregateId ?? ""} meta={event.createdAt} />)}</div>;
}

function RunLogs({ runs }: { runs: GTMRunResult[] }) {
  if (!runs.length) return <div className="debugger-empty">No runs have been recorded yet.</div>;
  return <div className="timeline-list">{runs.slice(-8).reverse().map((run) => <DebugRow key={run.runId} icon={<Play />} title={run.runId} detail={run.ok ? "Completed" : run.error ?? "Needs attention"} meta={`${run.pendingGates.length} gates`} />)}</div>;
}

function ReplayPanel({ runResult }: { runResult: GTMRunResult | null }) {
  if (!runResult) return <div className="debugger-empty">No active run to replay.</div>;
  return <div className="timeline-list">{Object.values(runResult.nodes).map((node) => <DebugRow key={node.nodeId} icon={<TestTube2 />} title={node.nodeId} detail={node.ok ? `${node.items.length} items` : node.error ?? "Failed"} meta={node.pendingReview ? "gate opened" : node.ok ? "ok" : "blocked"} />)}</div>;
}

type LearningThreadData = {
  revised: AgentCreationPolicy;
  drivingSignals: FeedbackSignal[];
  newAgent: AgentInstance | null;
  addedNegative: string[];
  addedPositive: string[];
};

function decisionVerb(type: string) {
  if (type.includes("Reject")) return "Rejected";
  if (type.includes("Edit")) return "Edited";
  if (type.includes("Approval") || type.includes("Approved")) return "Approved";
  if (type.includes("Failure")) return "Hit a failure";
  return type;
}

// One closed loop, as a vertical causal thread: your decision → the rule it changed → the smarter
// agent it built. This is the product thesis made legible.
function LearningThread({ thread }: { thread: LearningThreadData }) {
  const { revised, drivingSignals, newAgent, addedNegative, addedPositive } = thread;
  return (
    <div className="learning-thread">
      <div className="learning-thread-step">
        <span className="learning-thread-label">You decided</span>
        {drivingSignals.length
          ? drivingSignals.slice(0, 2).map((signal) => (
            <p key={signal.id} className="learning-thread-signal">{decisionVerb(signal.type)}: {signal.summary}</p>
          ))
          : <p className="learning-thread-signal">A gate decision or run failure on this policy.</p>}
      </div>
      <div className="learning-thread-arrow">changed the rules</div>
      <div className="learning-thread-step">
        {addedNegative.slice(0, 3).map((rule) => <p key={rule} className="learning-thread-rule neg">− {rule}</p>)}
        {addedPositive.slice(0, 3).map((rule) => <p key={rule} className="learning-thread-rule pos">+ {rule}</p>)}
        {!addedNegative.length && !addedPositive.length
          ? <p className="learning-thread-rule">{revised.revisionReason ?? "Policy revised from feedback."}</p>
          : null}
      </div>
      {newAgent ? (
        <>
          <div className="learning-thread-arrow">built a smarter agent</div>
          <div className="learning-thread-step">
            <p className="learning-thread-agent">{newAgent.ref} v{newAgent.version}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ThreadPanel({ threads }: { threads: LearningThreadData[] }) {
  if (!threads.length) {
    return <div className="debugger-empty">No loop has closed yet. When a founder decision revises a policy and builds a v2 agent, it appears here as a decision → rule → agent thread.</div>;
  }
  return <div className="thread-list">{threads.map((thread) => <LearningThread key={thread.revised.id} thread={thread} />)}</div>;
}

function ContractsPanel({ agents, policies, evaluations }: { agents: AgentInstance[]; policies: AgentCreationPolicy[]; evaluations: AgentEvaluation[] }) {
  if (!agents.length) return <div className="debugger-empty">No agent contracts yet.</div>;
  return <div className="timeline-list">{agents.map((agent) => {
    const policy = policies.find((item) => item.id === agent.creationPolicyId);
    const evaluation = evaluations.filter((item) => item.agentInstanceId === agent.id).at(-1);
    return <DebugRow key={agent.id} icon={<CheckCircle2 />} title={`${agent.ref} v${agent.version}`} detail={`Accepts ${agent.inputContract.length} · Emits ${agent.outputContract.length}`} meta={evaluation?.status ?? policy?.purpose ?? "not evaluated"} />;
  })}</div>;
}

function DebugRow({ icon, title, detail, meta }: { icon: React.ReactNode; title: string; detail: string; meta: string }) {
  return (
    <div className="debug-row">
      <span>{icon}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
      <em>{meta}</em>
    </div>
  );
}
