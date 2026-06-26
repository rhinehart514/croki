import { useMemo, useState } from "react";
import {
  Bot, CheckCircle2, ChevronDown, GitBranch, History, Play, TestTube2,
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

// Trim a hypothesis blob to its lead sentence for the hero focal. Splits on sentence-ending
// punctuation; falls back to the whole string if there's no clear break. The full text stays in
// the inspector, so nothing is lost — the hero just stops being a wall.
function leadSentence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0].trim() : trimmed;
}

// The program's headline status composes run + program state into one phrase; its tone comes from
// the shared toneForPhrase so it colors identically to every other status pill in the UI.
function programHeadline(program: OutcomeProgram, runResult: GTMRunResult | null, graph: GTMGraph | null) {
  if (runResult?.pendingGates?.length) return "paused at gate";
  if (runResult && !runResult.ok) return "blocked";
  if (runResult?.ok) return "completed";
  if (!graph) return "not composed";
  return canonicalStatus(program.lastRunStatus ?? program.lifecycle);
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
  // The debugger is a drawer you summon, not a permanent band — collapsed by default so the canvas
  // (the actual workspace) owns the vertical space. Toggling it bumps a nonce that re-fits the graph
  // into the reclaimed/relinquished height.
  const [debugOpen, setDebugOpen] = useState(false);
  const [refitNonce, setRefitNonce] = useState(0);
  const toggleDebug = () => { setDebugOpen((open) => !open); setRefitNonce((n) => n + 1); };
  // Opening a specific tab from collapsed should reveal the drawer, not silently switch a hidden tab.
  const openDebugTab = (tab: DebugTab) => { setDebugTab(tab); if (!debugOpen) toggleDebug(); };
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
    if (!debugOpen) { setDebugOpen(true); setRefitNonce((n) => n + 1); }
  }

  const selectedAgent = selectedAgentId ? programAgents.find((agent) => agent.id === selectedAgentId) ?? null : null;
  const selectedPolicy = selectedAgent ? programPolicies.find((policy) => policy.id === selectedAgent.creationPolicyId) ?? null : null;

  // The compounding, made into a causal thread: a founder decision drove a rule change, which built
  // a smarter agent. Each revised policy (one with a previous version) is one loop closing.
  const learningThreads = useMemo(() => programPolicies
    .filter((policy) => policy.previousPolicyId)
    .map((revised) => {
      const prev = programPolicies.find((policy) => policy.id === revised.previousPolicyId) ?? null;
      // Dedupe by summary: a repeated identical run failure ("Waiting for at least 1 input item")
      // banks one feedback signal per run, so without this the same line renders many times in one thread.
      const seenSummaries = new Set<string>();
      const drivingSignals = programFeedback.filter((signal) =>
        (revised.feedbackSignalIds ?? []).includes(signal.id)
        || (signal.policyIds ?? []).includes(revised.previousPolicyId ?? ""))
        .filter((signal) => {
          const key = `${signal.type}:${signal.summary}`;
          if (seenSummaries.has(key)) return false;
          seenSummaries.add(key);
          return true;
        });
      const newAgent = programAgents.find((agent) => agent.creationPolicyId === revised.id) ?? null;
      const addedNegative = revised.negativeRules.filter((rule) => !(prev?.negativeRules ?? []).includes(rule));
      const addedPositive = revised.positiveRules.filter((rule) => !(prev?.positiveRules ?? []).includes(rule));
      return { revised, drivingSignals, newAgent, addedNegative, addedPositive, mergedCount: 1 };
    })
    .reverse(), [programPolicies, programFeedback, programAgents]);

  // Collapse threads that tell the IDENTICAL story — same driving signals, same (often empty) rule
  // changes — into one card with a count. A graph stuck on "Waiting for at least 1 input item" banks
  // a revision every run; un-collapsed that floods the feed with 30 copies of one line. Distinct
  // learning (a real rule change) has a different key and is never merged. Most-recent representative
  // is kept (the array is already reversed to most-recent-first).
  const mergedLearningThreads = useMemo(() => {
    const byStory = new Map<string, LearningThreadData>();
    for (const thread of learningThreads) {
      const ruleChange = thread.addedNegative.length || thread.addedPositive.length;
      const key = [
        thread.drivingSignals.map((s) => `${s.type}:${s.summary}`).join("|"),
        thread.addedNegative.join("|"),
        thread.addedPositive.join("|"),
        thread.newAgent?.ref ?? "",
        ruleChange ? "" : (thread.revised.revisionReason ?? "no-change"),
      ].join("::");
      const existing = byStory.get(key);
      if (existing) existing.mergedCount += 1;
      else byStory.set(key, { ...thread });
    }
    return [...byStory.values()];
  }, [learningThreads]);

  const measurementBlind = !(program.measurementPlan?.joinKey && program.measurementPlan?.outcomeEvent);
  const hasGraph = !!graph && graph.nodes.length > 0;
  const pendingGate = runResult?.pendingGates?.[0] ?? null;

  const DEBUG_LABEL: Record<DebugTab, string> = {
    timeline: "Timeline", events: "Events", runLogs: "Run Logs",
    replay: "Replay", diff: "Diff", contracts: "Contracts",
  };

  return (
    <div className={`program-workbench${debugOpen ? "" : " debug-collapsed"}`}>
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
          {/* The primary run action lives once, in the global top bar (the shipped convention —
              Linear/StackAI/Lindy all anchor it top-right). The program header keeps only its mode
              tabs, so the founder never sees two "Run" buttons competing on the same screen. */}
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
          {/* Hero thesis band — the buyer bet was buried in the inspector gutter while the
              canvas top sat empty. Lift the most un-substitutable sentence on the surface into
              the dead zone as the one monumental focal, at the large type scale. Overlay, so the
              DAG layout and panning underneath are untouched. */}
          {(() => {
            if (!hasGraph || !graph) return null;
            const trigger = firstString(program.buyerHypothesis, ["nowTrigger", "trigger", "whyNow", "why_now"], "");
            const buyer = firstString(program.buyerHypothesis, ["description", "audience", "target"], "");
            const full = trigger || buyer;
            if (!full || full === "Not recorded") return null;
            // The hero is ONE monumental focal, not the whole hypothesis essay. Lift only the lead
            // sentence; the full text already lives in the inspector. Without this the buyer blob
            // (often a multi-sentence paragraph) renders at page-title size and walls off the canvas.
            const thesis = leadSentence(full);
            const outcome = firstString(program.desiredOutcome, ["description", "target", "type"], "");
            return (
              <div className="program-canvas-hero">
                <div className="hero-card">
                  <span className="hero-kicker">The bet</span>
                  <p className="hero-thesis">{thesis}</p>
                  {outcome && outcome !== "The program needs a stated outcome." ? (
                    <p className="hero-toward"><span>Toward</span>{outcome}</p>
                  ) : null}
                </div>
              </div>
            );
          })()}
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
              refitNonce={refitNonce}
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
            <div><dt>Status</dt><dd>{canonicalStatus(program.lastRunStatus ?? program.lifecycle)}</dd></div>
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

          {mode === "learning" || mergedLearningThreads.length ? (
            <div className="inspector-section">
              <h3>What your decisions changed</h3>
              {mergedLearningThreads.length ? (
                <>
                  {mergedLearningThreads.slice(0, 4).map((thread) => <LearningThread key={thread.revised.id} thread={thread} />)}
                  {mergedLearningThreads.length > 4 ? (
                    <p className="inspector-thread-overflow">+{mergedLearningThreads.length - 4} more distinct loop{mergedLearningThreads.length - 4 === 1 ? "" : "s"} — open the Diff tab for the full history.</p>
                  ) : null}
                </>
              ) : programFeedback.length ? (
                <p>{programFeedback.length} decision{programFeedback.length === 1 ? "" : "s"} recorded — run again so they revise an agent.</p>
              ) : (
                <p>No founder decisions yet. Approve, reject, or edit at a gate and the rules learn from it.</p>
              )}
            </div>
          ) : null}
        </aside>
      </div>

      <section className={`program-debugger${debugOpen ? "" : " collapsed"}`} aria-label="Program debugger">
        <div className="debugger-head">
          <button className="debugger-toggle" onClick={toggleDebug} type="button" aria-expanded={debugOpen}>
            <ChevronDown className={debugOpen ? "" : "rot"} size={14} />
            <span>Debugger</span>
          </button>
          {debugOpen ? (
            <div className="debugger-tabs">
              {(["timeline", "events", "runLogs", "replay", "diff", "contracts"] as DebugTab[]).map((tab) => (
                <button key={tab} className={debugTab === tab ? "active" : ""} onClick={() => setDebugTab(tab)} type="button">
                  {DEBUG_LABEL[tab]}
                </button>
              ))}
            </div>
          ) : (
            <button className="debugger-collapsed-hint" onClick={() => openDebugTab(debugTab)} type="button">
              {DEBUG_LABEL[debugTab]} · open to inspect
            </button>
          )}
        </div>
        {debugOpen ? (
        <div className="debugger-body">
          {debugTab === "timeline" ? <Timeline events={programEvents} feedback={programFeedback} /> : null}
          {debugTab === "events" ? <EventList events={programEvents} /> : null}
          {debugTab === "runLogs" ? <RunLogs runs={runs} /> : null}
          {debugTab === "replay" ? <ReplayPanel runResult={runResult} /> : null}
          {debugTab === "diff" ? <ThreadPanel threads={learningThreads} /> : null}
          {debugTab === "contracts" ? <ContractsPanel agents={programAgents} policies={programPolicies} evaluations={programEvaluations} /> : null}
        </div>
        ) : null}
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
  return <div className="timeline-list">{events.slice(-12).reverse().map((event) => (
    <DebugRow
      key={event.id}
      icon={<GitBranch />}
      title={event.type.replace(/([a-z0-9])([A-Z])/g, "$1 $2")}
      detail={event.aggregateType ?? ""}
      meta={new Date(event.createdAt).toLocaleString()}
    />
  ))}</div>;
}

function RunLogs({ runs }: { runs: GTMRunResult[] }) {
  if (!runs.length) return <div className="debugger-empty">No runs have been recorded yet.</div>;
  return <div className="timeline-list">{runs.slice(-8).reverse().map((run) => <DebugRow key={run.runId} icon={<Play />} title={run.runId} detail={run.pendingGates.length ? "Paused at gate" : run.ok ? "Completed" : run.error ?? "Needs attention"} meta={`${run.pendingGates.length} gates`} />)}</div>;
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
  // How many consecutive identical revisions collapsed into this one (≥1). A repeated run failure
  // banks one policy revision per run with no rule change, so without collapsing, the same card
  // renders many times — the learning feed reads as broken rather than as one recurring signal.
  mergedCount: number;
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
        <span className="learning-thread-label">
          You decided
          {thread.mergedCount > 1 ? <span className="learning-thread-count"> · {thread.mergedCount}×</span> : null}
        </span>
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
