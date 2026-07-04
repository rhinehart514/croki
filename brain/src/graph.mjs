// GTM Graph runner — DAG execution engine.
// Venture doctrine: complete structure, partial activation, local state.
//
// Execution model:
//   1. Topological sort on DATA edges only (context + feedback edges are non-blocking).
//   2. Resource nodes are skipped (visual declarations only).
//   3. Context nodes resolve first, injected as context into downstream nodes.
//   4. Gate nodes pause execution — runner returns pendingGates for founder review.
//   5. Feedback edges are preserved as explicit future-learning relationships.

import { getConnector, defaultGraphTemplate, listConnectors } from "./connectors/registry.mjs";
import { defaultStepRuntime, evaluateSwitchPredicate } from "./step-runners.mjs";
import { auditInput, auditOutput } from "./contracts.mjs";
import { relaxGateContracts, relaxPreGateContracts } from "./source-entry.mjs";
import { assertMoatConsulted } from "./consult-guard.mjs";

// ─── Topological sort (Kahn's algorithm on data edges) ───────────────────────

function topoSort(nodes, edges) {
  const dataEdges = edges.filter((e) => e.edgeType === "data");
  const nodeIds   = new Set(nodes.map((n) => n.id));
  const inDegree  = new Map(nodes.map((n) => [n.id, 0]));
  const adjOut    = new Map(nodes.map((n) => [n.id, []]));

  for (const e of dataEdges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    adjOut.get(e.source)?.push(e.target);
  }

  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of (adjOut.get(id) ?? [])) {
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  return order;
}

function relatedNodes(targetNodeId, nodes, edges) {
  if (!targetNodeId) return new Set(nodes.map((node) => node.id));
  const allowed = new Set([targetNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (edge.edgeType === "feedback") continue;
      if (allowed.has(edge.target) && !allowed.has(edge.source)) {
        allowed.add(edge.source);
        changed = true;
      }
    }
  }
  return allowed;
}

function descendants(nodeId, edges) {
  const found = new Set();
  const queue = [nodeId];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges) {
      if (edge.edgeType !== "data" || edge.source !== current || found.has(edge.target)) continue;
      found.add(edge.target);
      queue.push(edge.target);
    }
  }
  return found;
}

// Every node that feeds a gate along data edges — its direct upstream and everything upstream of
// that, bounded at the next gate so a second gate's drafters are checked at their own gate, not here.
function gateUpstream(gateId, edges, nodeMap) {
  const found = new Set();
  const queue = [];
  for (const edge of edges) {
    if (edge.edgeType === "data" && edge.target === gateId) queue.push(edge.source);
  }
  while (queue.length) {
    const current = queue.shift();
    if (found.has(current)) continue;
    found.add(current);
    for (const edge of edges) {
      if (edge.edgeType !== "data" || edge.target !== current) continue;
      // Stop at an upstream gate — its producers are that gate's responsibility.
      if (nodeMap.get(edge.source)?.category === "gate") continue;
      queue.push(edge.source);
    }
  }
  return found;
}

// What did this node produce, for the required-consult rule? Decide from the model the node already
// carries — never a guess: a UI/visual artifact needs taste AND design; a draft/message/outreach
// needs taste. Anything else (research, enrichment, discovery, planning) carries no moat requirement.
//
// outputKind is the open label the composer chose and is AUTHORITATIVE when set — a node the composer
// labelled a "signal" or "dataset" is research even if its agent ref happens to contain "draft". Only
// when outputKind is absent do we fall back to the node's category / ref / label as the signal.
const VISUAL_HINTS = ["ui", "visual", "design", "component", "mockup", "artifact"];
const DRAFT_HINTS = ["message", "draft", "outreach", "copy", "email", "post"];

function hintMatch(haystack) {
  const producedVisual = VISUAL_HINTS.some((h) => haystack.includes(h));
  // "artifact" is treated as visual above; a draft/message is the non-visual founder-reviewed output.
  const producedDraft = !producedVisual && DRAFT_HINTS.some((h) => haystack.includes(h));
  return { producedDraft, producedVisual };
}

function classifyProduction(node) {
  // Authoritative: the composer's explicit output label, when set. (Read into a local first so this
  // stays an open-output-kind read, not a hardcoded output-kind equality check.)
  const declared = node?.outputKind;
  const label = typeof declared === "string" ? declared.trim() : "";
  if (label) {
    return hintMatch(label.toLowerCase());
  }
  // Fallback: infer from what the node IS when no output label was set.
  const haystack = [node?.category, node?.ref, node?.kind, node?.label]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();
  return hintMatch(haystack);
}

// Run the required-consult guard for every drafting/UI-producing node feeding a gate. A violation is
// recorded on the gate result as a blocking issue the founder sees — never a thrown crash. Honest
// surfacing over silent failure: a draft that skipped the founder's own taste signal does not quietly
// proceed to review as if it were grounded.
function collectConsultViolations(gateId, edges, nodeMap, nodeResults) {
  const violations = [];
  for (const upstreamId of gateUpstream(gateId, edges, nodeMap)) {
    const node = nodeMap.get(upstreamId);
    if (!node) continue;
    // The moat-consult requirement applies only to rented-intelligence agent steps — the kind that
    // actually makes tool calls through the bridge and so CAN consult get_taste/get_design. A
    // deterministic tool/code connector has no tool-call surface to consult through, so subjecting it
    // would false-block every connector-drafted item. The agent is where taste must be honored.
    if (node.kind !== "agent") continue;
    const { producedDraft, producedVisual } = classifyProduction(node);
    if (!producedDraft && !producedVisual) continue;
    const result = nodeResults.get(upstreamId);
    const toolCalls = Array.isArray(result?.meta?.toolCalls) ? result.meta.toolCalls : [];
    const verdict = assertMoatConsulted({ toolCalls, producedDraft, producedVisual });
    if (!verdict.ok) {
      violations.push({
        nodeId: upstreamId,
        label: node.label ?? upstreamId,
        producedDraft,
        producedVisual,
        missing: verdict.missing,
        note: verdict.note,
      });
    }
  }
  return violations;
}

// Attach the producing agent's ref to each item it produced, without disturbing any other shape.
// First producer wins (an item that already carries an agentRef from an upstream agent keeps it), and
// only plain objects are stamped — a primitive or array item passes through untouched.
function stampAgentRef(items, agentRef) {
  if (!agentRef || !Array.isArray(items)) return items;
  return items.map((item) =>
    item && typeof item === "object" && !Array.isArray(item) && item.agentRef == null
      ? { ...item, agentRef }
      : item,
  );
}

// ─── Resolve context inputs for a node ───────────────────────────────────────

function resolveContext(nodeId, edges, nodeResults) {
  const contextEdges = edges.filter((e) => e.edgeType === "context" && e.target === nodeId);
  const ctx = {};
  for (const e of contextEdges) {
    const result = nodeResults.get(e.source);
    if (!result?.ok) continue;
    for (const item of result.items) {
      if (item.type === "context" && item.id) {
        ctx[item.id] = item;
      }
    }
  }
  return ctx;
}

// ─── Resolve upstream data items for a node ──────────────────────────────────

function resolveUpstream(nodeId, edges, nodeResults) {
  const dataEdges = edges.filter((e) => e.edgeType === "data" && e.target === nodeId);
  const items = [];
  for (const e of dataEdges) {
    const result = nodeResults.get(e.source);
    if (!result) continue;
    // Resource nodes produce no items — skip their output
    if (result.meta?.declaration) continue;
    const sourceItems = result.items ?? [];
    // A data edge MAY carry a predicate (the routing rule a `switch` node exposes). When present,
    // only items matching it cross this edge — that's how conditional branches split traffic. The
    // filter is deterministic (item fields, fixed op set), so a gate resume reuses the same routed
    // items rather than re-deciding behind the founder's back. No predicate = merge as before.
    if (e.predicate) {
      items.push(...sourceItems.filter((item) => evaluateSwitchPredicate(item, e.predicate)));
    } else {
      items.push(...sourceItems);
    }
  }
  return items;
}

// ─── Run a single node ───────────────────────────────────────────────────────

// A generous wall-clock ceiling on any single node's execution. It exists so one hanging connector or
// stuck fetch fails HONESTLY instead of hanging the whole run forever — not to rush real work. Ten
// minutes is far past any legitimate step; callers can override via runGraph({ nodeTimeoutMs }), and a
// non-positive value disables the ceiling entirely (unbounded, the pre-watchdog behavior).
const DEFAULT_NODE_TIMEOUT_MS = 10 * 60 * 1000;

// Run one node under that ceiling. The node's own promise cannot be force-cancelled in JS, but the run
// stops WAITING on it: on timeout this resolves to an honest failure result (ok:false + timedOut + a
// plain note), which flows through exactly like any other node failure — downstream is blocked, the run
// finishes, and final `ok` is false. The timer is always cleared so a fast node never leaves one armed.
async function runNodeWithTimeout(node, upstream, context, store, opts, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return runNode(node, upstream, context, store, opts);
  }
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve({
        nodeId: node.id,
        category: node.category,
        kind: node.kind ?? "tool",
        ok: false,
        timedOut: true,
        items: [],
        error: `Step "${node.label ?? node.id}" ran longer than ${Math.round(timeoutMs / 1000)}s and was stopped so the run could finish instead of hanging.`,
      });
    }, timeoutMs);
    // Don't let a pending node-timeout timer keep the process alive on its own.
    if (typeof timer?.unref === "function") timer.unref();
  });
  try {
    return await Promise.race([runNode(node, upstream, context, store, opts), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runNode(node, upstream, context, store, opts = {}) {
  const { approvals = {}, decisions = {}, deployAuthorization = null } = opts;
  // Resource nodes: declaration only, no execution
  if (node.category === "resource") {
    return { nodeId: node.id, category: node.category, ok: true, items: [], meta: { declaration: true } };
  }

  // Open node kinds — the un-caging. A step that isn't a "tool" (a registered
  // connector) is an agent, skill, or code step the frontier agent composed. These
  // dispatch through the injectable step runtime, never the connector registry.
  const kind = node.kind ?? "tool";
  if (kind !== "tool") {
    const runner = opts.stepRuntime?.[kind];
    if (typeof runner !== "function") {
      return { nodeId: node.id, category: node.category, kind, ok: false, items: [], error: `No step runtime for kind "${kind}".` };
    }
    try {
      const result = await runner(node, upstream, context, store, opts);
      // Per-agent provenance: stamp each item an AGENT step produced with the producing agent's ref,
      // so it rides through downstream steps and the founder gate onto the run ledger. That link is what
      // lets taste memory be read back per agent (extractDecisionsForAgent / getAgentProfile) — the
      // agent face's "how it learned" signal. Additive: existing item shapes are untouched, the first
      // producer wins (a re-stamp never overwrites an upstream agent's ref), and only plain objects are
      // stamped. A tool/skill/code step is not an agent, so it is never stamped.
      if (kind === "agent" && result?.ok !== false && Array.isArray(result?.items)) {
        const agentRef = node.ref ?? node.config?.ref ?? null;
        if (agentRef) {
          const items = stampAgentRef(result.items, agentRef);
          return { nodeId: node.id, category: node.category, kind, ...result, items };
        }
      }
      return { nodeId: node.id, category: node.category, kind, ...result };
    } catch (err) {
      return { nodeId: node.id, category: node.category, kind, ok: false, items: [], error: err.message };
    }
  }

  // Derived source: a source the founder wired to ANOTHER channel's output (config.sourceChannelId).
  // Instead of a connector, it pulls that channel's last-run staged items. Read-only — it only reads
  // staged output and feeds it into this graph; the founder gate downstream still gates every send.
  if (node.category === "source" && node.config?.sourceChannelId) {
    const load = opts.loadLastRunItems;
    if (typeof load !== "function") {
      return { nodeId: node.id, category: node.category, mode: "derived", ok: false, items: [],
        error: "This source pulls from another channel, but the run was started without a cross-channel loader." };
    }
    try {
      const items = await load(node.config.sourceChannelId);
      return { nodeId: node.id, category: node.category, mode: "derived", ok: true, items,
        meta: { count: items.length, source: "derived", sourceChannelId: node.config.sourceChannelId } };
    } catch (err) {
      return { nodeId: node.id, category: node.category, mode: "derived", ok: false, items: [],
        error: `Could not pull from the source channel: ${err.message}` };
    }
  }

  const connectorId = node.connector || "default";
  // Category takes precedence; fall back to connector id for legacy compatibility
  const connector = getConnector(node.category, connectorId)
    ?? getConnector(connectorId, connectorId)
    ?? null;

  if (!connector) {
    return {
      nodeId: node.id, category: node.category, ok: false, items: [],
      error: `No connector "${connectorId}" registered for category "${node.category}".`,
    };
  }

  // Check key requirement (skip for stubs)
  if (connector.meta.envKey
    && !process.env[connector.meta.envKey]
    && !node.config?.endpoint
    && !connector.meta.stub) {
    return {
      nodeId: node.id, category: node.category, ok: false, items: [],
      error: `${connector.meta.name} requires ${connector.meta.envKey}. Set it in your environment and restart.`,
    };
  }

  // Context nodes receive the node definition, not upstream data
  if (node.category === "context") {
    try {
      const result = await connector.run(node, upstream, context, store);
      return { nodeId: node.id, category: node.category, connector: connectorId, ...result };
    } catch (err) {
      return { nodeId: node.id, category: node.category, ok: false, items: [], error: err.message };
    }
  }

  // Data flow nodes: pass (node, upstream, context, store)
  try {
    // Legacy connectors expect (stage, upstream, context) — node has the same shape as stage
    const runtimeNode = {
      ...node,
      runtime: {
        approved: approvals[node.id] === true,
        decisions: decisions[node.id] ?? null,
        // The founder's explicit deploy confirmation, host-supplied via runGraph opts. Lives on
        // node.runtime (rebuilt here every run from the founder's approvals), NEVER node.config, so the
        // microproduct deploy connector reads an authorization composition can't forge. Null on a normal
        // run — that is why an ordinary gate approval never deploys.
        deployAuthorization,
      },
    };
    const result = await connector.run(runtimeNode, upstream, context, store);
    return {
      nodeId: node.id,
      category: node.category,
      connector: connectorId,
      ...result,
    };
  } catch (err) {
    return { nodeId: node.id, category: node.category, ok: false, items: [], error: err.message };
  }
}

// ─── Main graph runner ────────────────────────────────────────────────────────

// Run-path contract normalization. NOT a topology rewrite — the graph the founder composed and
// persisted is the graph that runs. The founder gate is the ONLY contract checkpoint:
//   1. relaxGateContracts (always): the gate must not reject a real reviewed draft on a field-name
//      technicality, and a post-gate execute trusts the approval. Measure is left honestly blind.
//   2. relaxPreGateContracts (always): no node before the gate blocks the run on item count or field
//      names. The model composes the work freely and whatever it produces flows to the gate, where the
//      founder reviews it. Contracts stay ADVISORY (UI/validation) but never dead-end a run pre-gate.
// Deterministic and idempotent, so a fresh run and a later gate-resume see the identical graph.
function normalizeRunContracts(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return graph;
  let nodes = relaxGateContracts(graph.nodes, graph.edges);
  nodes = relaxPreGateContracts(nodes, graph.edges);
  return { ...graph, nodes };
}

export async function runGraph(graph, opts = {}) {
  graph = normalizeRunContracts(graph);
  const {
    store,
    targetNodeId,
    approvals = {},
    decisions = {},
    memory = null,
    grounding = null,
    designState = null,
    // The researched buyer picture (market-research.buildMarketContext output). Injected onto each
    // node's context as `context.market` so the market provider grounds an agent/skill step on who the
    // buyer really is — the same push as grounding/designState. Null (an honest blank) leaves it unset.
    market = null,
    runs = null,
    resumeResult = null,
    stepRuntime = defaultStepRuntime,
    loadLastRunItems = null,
    onEvent = null,
    authorizeRelease = null,
    // The explicit founder deploy confirmation, threaded from the founder's gate-release payload by the
    // host (resolveOperatorGate builds it from the authorized releaser + payload.deployConfirmed). It
    // rides each node's runtime — which graph.mjs rebuilds from these opts every run, so composition and
    // a model-driven run can never write it. Only the microproduct deploy connector reads it; null for a
    // normal run, which is why a normal gate approval never deploys (the deploy connector refuses).
    deployAuthorization = null,
    // BYO-credential resolution context: the project whose founder-pasted API keys a connector should
    // prefer over process.env, plus the persistence options (root) to read them from. Threaded onto each
    // node's context as `context.credentials` so a data connector (clay enrich, http send auth) resolves
    // a stored key first and falls back to env. Null projectId + {} options means "no stored creds" —
    // env-only, the prior behavior — so existing runs are unchanged.
    projectId = null,
    credentialOptions = {},
    // Per-node wall-clock ceiling (ms). A stuck connector/fetch fails honestly at this bound instead of
    // hanging the whole run. Generous by default; a non-positive value disables it (unbounded).
    nodeTimeoutMs = DEFAULT_NODE_TIMEOUT_MS,
  } = opts;
  const emit = typeof onEvent === "function" ? onEvent : () => {};
  const { nodes, edges, id: graphId } = graph;

  // The role-gated release wall, asserted at the gate point itself. When this run carries an approval
  // intent (a gate approval or an approve/release per-item decision) AND the caller supplied an
  // authorizeRelease guard, the guard must pass before any approval is honored. With no guard the
  // behavior is unchanged (a solo founder's local run), so this only tightens the team path; it never
  // weakens it. The gate connector still refuses to send without an approval — this refuses to apply
  // an approval the actor is not allowed to make.
  if (typeof authorizeRelease === "function") {
    const approvesAny = Object.values(approvals).some((v) => v === true)
      || Object.values(decisions).some((d) => d?.decision === "approve")
      || Object.values(decisions).some((d) => d?.pattern?.decision === "approve" || d?.decision === "approve");
    if (approvesAny) authorizeRelease();
  }

  const runId = `run-${Date.now()}`;
  const nodeMap   = new Map(nodes.map((n) => [n.id, n]));
  const execOrder = topoSort(nodes, edges);
  const allowedNodes = relatedNodes(targetNodeId, nodes, edges);
  const nodeResults = new Map();
  const pendingGates = [];

  // Shared skill-guidance accumulator for THIS run. A `skill` step appends its loaded SKILL.md
  // here (deduped by ref); a downstream `agent` step folds it into its prompt and acts under it.
  const skillGuidance = [];

  // A founder gate resumes the exact prepared artifacts that were reviewed.
  // Everything outside the pending gate and its descendants is restored from
  // the prior result, so live sources and generation do not silently rerun.
  if (resumeResult?.nodes && Array.isArray(resumeResult.pendingGates)) {
    const rerun = new Set(resumeResult.pendingGates);
    for (const gateId of resumeResult.pendingGates) {
      for (const descendantId of descendants(gateId, edges)) rerun.add(descendantId);
    }
    for (const [nodeId, result] of Object.entries(resumeResult.nodes)) {
      if (!nodeMap.has(nodeId) || rerun.has(nodeId) || !allowedNodes.has(nodeId)) continue;
      nodeResults.set(nodeId, result);
    }
  }

  if (execOrder.length !== nodes.length) {
    return {
      runId,
      graphId: graphId ?? "unknown",
      ok: false,
      nodes: {},
      executionOrder: execOrder,
      pendingGates: [],
      feedbackEdges: [],
      error: "The graph contains a data cycle and cannot run.",
    };
  }

  // Step 1: resolve and run context nodes first
  for (const nodeId of execOrder) {
    const node = nodeMap.get(nodeId);
    if (!node || node.category !== "context" || !allowedNodes.has(nodeId)) continue;
    if (nodeResults.has(nodeId)) continue;
    const result = await runNodeWithTimeout(node, [], {}, store, { approvals, decisions, stepRuntime, loadLastRunItems }, nodeTimeoutMs);
    nodeResults.set(nodeId, result);
  }

  // Step 2: execute data-flow nodes in topological order (skipping context)
  for (const nodeId of execOrder) {
    const node = nodeMap.get(nodeId);
    if (!node || node.category === "context" || !allowedNodes.has(nodeId)) continue;
    if (nodeResults.has(nodeId)) continue;

    const upstream = node.category === "gate" && resumeResult?.nodes?.[nodeId]?.items
      ? structuredClone(resumeResult.nodes[nodeId].items)
      : resolveUpstream(nodeId, edges, nodeResults);
    const context  = resolveContext(nodeId, edges, nodeResults);
    context.__skillGuidance = skillGuidance;
    // The BYO-credential lookup a data connector reads (clay enrich keys, http send auth). projectId +
    // persistence options only — never a secret. The connector calls resolveCredentialToken(projectId,
    // provider, options): stored founder key first, env var fallback.
    context.credentials = { projectId, options: credentialOptions };
    context.__run = {
      runId,
      originRunId: resumeResult?.runId ?? runId,
      graphId: graphId ?? "unknown",
    };
    // Inject loop memory (founder decisions from prior runs) for nodes that
    // generate reviewable artifacts. Connectors opt in by reading context.__memory.
    if (memory) context.__memory = memory;
    // Inject the founder's front-end DesignState (the "Warm Calm" house style + reference library)
    // so any agent/skill step that produces UI starts from the founder's captured taste instead of
    // the generic mean. The design provider in context/providers.mjs renders it into the base layer.
    if (designState) context.designState = designState;
    // Inject grounding and run-state so the context substrate (agent-bridge) can assemble a real
    // base layer for agent/skill steps. The assembler only renders a summary into the prompt, so
    // the full ledger never bloats the model call — just the cited product map and "what's tried".
    if (grounding) context.grounding = grounding;
    // The researched buyer picture, so the market provider renders who buys and where they gather (each
    // record labelled by how solid) into the base layer, instead of the run guessing the buyer.
    if (market) context.market = market;
    if (Array.isArray(runs)) context.__state = runs;

    // Stream the step lifecycle so the UI can animate the flow and reveal content
    // as each step succeeds (not one batch at the end).
    emit({ type: "node_start", nodeId, category: node.category, kind: node.kind ?? "tool", label: node.label, ref: node.ref });
    const inputAudit = auditInput(node, upstream);
    let result;
    if (inputAudit.state === "blocked" || inputAudit.state === "waiting") {
      result = {
        nodeId,
        category: node.category,
        kind: node.kind ?? "tool",
        ok: false,
        blocked: true,
        items: [],
        error: inputAudit.message,
        contractAudit: inputAudit,
      };
    } else if (inputAudit.state === "blind") {
      // Blind is honest, not fatal. Measurement that can't attribute (e.g. the win event carries no
      // source) is a real product gap, but it must not fail an otherwise-successful run — a fully
      // approved, staged run reads "completed", and Measure reports its gap separately. Let the node
      // run on what it has (it self-labels each item attributed/blind) and flag it blind, not blocked.
      result = await runNodeWithTimeout(node, upstream, context, store, { approvals, decisions, stepRuntime, loadLastRunItems, deployAuthorization }, nodeTimeoutMs);
      // A timeout is an honest failure, never "blind" — blind swallows into the run's ok, a stuck node
      // must not. Only a node that actually ran gets the blind (measurement-can't-attribute) treatment.
      result = result.timedOut
        ? { ...result, contractAudit: inputAudit }
        : { ...result, ok: result.ok !== false, blind: true, contractAudit: inputAudit };
    } else {
      result = await runNodeWithTimeout(node, upstream, context, store, { approvals, decisions, stepRuntime, loadLastRunItems, deployAuthorization }, nodeTimeoutMs);
      const outputAudit = result.ok ? auditOutput(node, result.items ?? []) : inputAudit;
      result = { ...result, contractAudit: outputAudit };
      if (result.ok && outputAudit.state === "blocked") {
        result = { ...result, ok: false, blocked: true, error: outputAudit.message };
      }
    }
    // Required-consult guard, asserted at the gate (the founder's review point). For every
    // drafting/UI-producing node feeding this gate, check the tool calls the agent actually made:
    // a draft must have called get_taste, a visual artifact get_taste AND get_design. A violation is
    // surfaced as a blocking issue ON the gate result the founder reads — never a thrown crash — so a
    // draft that bypassed the founder's own taste signal can't quietly pass as if it were grounded.
    if (node.category === "gate" && result.ok !== false) {
      const consultViolations = collectConsultViolations(nodeId, edges, nodeMap, nodeResults);
      if (consultViolations.length) {
        result = {
          ...result,
          consultViolations,
          consultBlocked: true,
          error: result.error
            ?? `Required-consult check failed: ${consultViolations.length} drafting step(s) skipped the moat. ${consultViolations.map((v) => `${v.label} missing ${v.missing.join(", ")}`).join("; ")}.`,
        };
      }
    }
    nodeResults.set(nodeId, result);
    emit({ type: "node_done", nodeId, result });

    // Gate node: record as pending and continue (don't stop other branches)
    if (result.pendingReview) {
      pendingGates.push(nodeId);
      for (const downstreamId of descendants(nodeId, edges)) {
        if (!allowedNodes.has(downstreamId) || nodeResults.has(downstreamId)) continue;
        nodeResults.set(downstreamId, {
          nodeId: downstreamId,
          category: nodeMap.get(downstreamId)?.category ?? "unknown",
          ok: false,
          blocked: true,
          items: [],
          error: `Waiting for approval at "${node.label}".`,
        });
      }
    }

    // Stop this branch if a non-gate node fails
    if (!result.ok && node.category !== "gate") {
      for (const downstreamId of descendants(nodeId, edges)) {
        if (!allowedNodes.has(downstreamId) || nodeResults.has(downstreamId)) continue;
        const downstreamNode = nodeMap.get(downstreamId);
        const directlyConnected = edges.some((edge) =>
          edge.edgeType === "data" && edge.source === nodeId && edge.target === downstreamId
        );
        const downstreamAudit = directlyConnected && downstreamNode
          ? auditInput(downstreamNode, result.items ?? [])
          : null;
        nodeResults.set(downstreamId, {
          nodeId: downstreamId,
          category: downstreamNode?.category ?? "unknown",
          ok: false,
          blocked: true,
          items: [],
          ...(downstreamAudit ? { contractAudit: downstreamAudit } : {}),
          error: downstreamAudit && downstreamAudit.state !== "ready" && downstreamAudit.state !== "satisfied"
            ? downstreamAudit.message
            : `Blocked because upstream node "${node.label}" failed.`,
        });
      }
    }
  }

  // Step 3: preserve feedback relationships without pretending to execute them
  const feedbackEdges = edges.filter((e) => e.edgeType === "feedback");

  const results = Object.fromEntries(nodeResults.entries());
  // A blind node (measurement that can't attribute yet) is an honest gap, not a failure — it never
  // counts against the run. A pending gate does (the run isn't done until the founder decides). A gate
  // carrying a required-consult violation also does: a draft that skipped the founder's taste signal
  // must not let the run read "clean", even after approval — the violation is a blocking issue.
  const ok = Array.from(nodeResults.values()).every(
    (r) => (r.ok || r.blind) && !r.pendingReview && !r.consultBlocked,
  );

  return {
    runId,
    graphId: graphId ?? "unknown",
    ok,
    nodes: results,
    executionOrder: execOrder,
    pendingGates,
    targetNodeId: targetNodeId ?? null,
    resumedFromRunId: resumeResult?.runId ?? null,
    feedbackEdges: feedbackEdges.map((e) => ({ source: e.source, target: e.target, label: e.label })),
    error: ok ? undefined : "One or more nodes failed. See individual node results.",
  };
}

export { defaultGraphTemplate, listConnectors };
