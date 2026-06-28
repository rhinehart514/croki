// GTM Engine OS — derived from real state, never seeded.
//
// Every subsystem's health, throughput, confidence, issues, and actions are
// computed from real signals:
//   - the active workspace's scanned win event   (code grounding)
//   - the default channel's run ledger            (what ran, what it produced)
//   - live connector readiness                    (wired vs stubbed vs unset)
//   - recorded founder gate decisions             (the only real pre-send signal)
//
// Nothing here is invented. A subsystem with no signal yet says so plainly
// instead of showing a confident fake number. Seeded mock data is gone.

import { extractDecisions } from "./memory.mjs";

// Display hints for known stage ids — NOT a fixed taxonomy. A motion's middle stages are
// whatever categories its graph actually contains (see motionStageMetas); an unknown category
// is title-cased, never forced into this outbound vocabulary. Only the four universals
// (context=Ground, gate, measure, learn) frame every motion; everything between Ground and Gate
// is the motion's own shape.
const STAGE_LABELS = {
  research: "Research", context: "Ground", source: "Source", enrich: "Enrich",
  filter: "Filter", generate: "Generate", gate: "Gate", execute: "Execute",
  measure: "Measure", learn: "Learn",
};
// The categories that frame EVERY motion (kept out of the emergent middle, derived specially).
const UNIVERSAL_STAGES = new Set(["context", "gate", "measure", "learn"]);
const SUBSYSTEM_IDS = new Set(Object.keys(STAGE_LABELS));

function titleCase(s) {
  return String(s).replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

// A stage's display label: a known id keeps its name, an arbitrary motion category is title-cased.
function stageLabel(id) {
  return STAGE_LABELS[id] ?? titleCase(id);
}

// ─── Ledger + connector helpers ───────────────────────────────────────────────

function lastRun(runs) {
  return runs.at(-1) ?? null;
}

function nodesOfCategory(runs, category) {
  const nodes = lastRun(runs)?.result?.nodes ?? null;
  if (!nodes) return [];
  return Object.values(nodes).filter((n) => n?.category === category);
}

function connectorsForCategory(connectors, category) {
  return connectors.filter((c) => c.category === category);
}

function categoryReady(connectors, category) {
  return connectorsForCategory(connectors, category).some((c) => c.configured && !c.stub);
}

// A connector actually sends only if it declares a send-class action. The
// default execute connector stages locally (allowed verbs are stage/export),
// so it never counts as a real send path.
const SEND_VERB = /send|publish|deploy/i;
function isRealSender(connector) {
  const verbs = [...(connector.allowed ?? []), ...(connector.approvalRequired ?? [])];
  return verbs.some((verb) => SEND_VERB.test(verb));
}

// Shape with honest defaults; each deriver overrides what it can prove.
function subsystem(id, fields) {
  return {
    id,
    label: stageLabel(id),
    derived: true,
    health: 0,
    throughput: 0,
    confidence: 0,
    agentStatus: "idle",
    activeIssues: [],
    suggestedActions: [],
    ...fields,
  };
}

// ─── Flow-mapped subsystems (source / enrich / filter / generate / execute) ────
//
// Each maps to a node category in the flow graph. Health reflects what the last
// run's node of that category actually did, plus whether a connector is wired.

function deriveFlowStage(id, runs, connectors, present = true, connectorBacked = true) {
  // A stage of the motion. `present` guards the legacy (no-graph) caller; the emergent path only
  // ever passes stages that ARE in the graph, so absent stages never reach here at all (they are
  // simply not built, not shown as 0). `connectorBacked` is false for agent/skill/code/mcp stages:
  // those have no connector to configure, so a missing connector is never their problem — health
  // comes purely from what the run did. Forcing a connector here is the old taxonomy leaking back.
  if (!present) {
    return subsystem(id, { health: 0, confidence: 0 });
  }
  const label = stageLabel(id);
  const lower = label.toLowerCase();
  const cats = connectorsForCategory(connectors, id);
  const ready = !connectorBacked || cats.some((c) => c.configured && !c.stub);
  const mine = nodesOfCategory(runs, id);
  const ran = mine.length > 0;
  const items = mine.reduce((sum, n) => sum + (Array.isArray(n.items) ? n.items.length : 0), 0);
  const errored = mine.find((n) => n.ok === false && !n.blocked && !n.pendingReview);
  const blocked = mine.some((n) => n.blocked);

  if (errored) {
    return subsystem(id, {
      health: 38, confidence: 50, agentStatus: "investigating", throughput: items,
      activeIssues: [errored.error || `${label} failed on the last run.`],
      suggestedActions: [`Fix the ${lower} error, then re-run the loop.`],
    });
  }
  if (!ready) {
    const names = cats.map((c) => c.name).filter(Boolean).join(", ");
    return subsystem(id, {
      health: cats.length ? 44 : 28, confidence: 40,
      activeIssues: [`No ${lower} connector is configured${names ? ` (${names} available)` : ""}.`],
      suggestedActions: [`Configure a ${lower} connector to activate this stage.`],
    });
  }
  if (blocked) {
    return subsystem(id, {
      health: 58, confidence: 55, throughput: items,
      activeIssues: ["Blocked on the last run — waiting on an upstream stage."],
      suggestedActions: ["Clear the upstream failure, then re-run the loop."],
    });
  }
  if (!ran) {
    return subsystem(id, {
      health: 64, confidence: 60,
      activeIssues: ["Ready, but this stage hasn't run yet."],
      suggestedActions: [`Run the loop to see ${lower} produce live output.`],
    });
  }
  if (items === 0) {
    return subsystem(id, {
      health: 66, confidence: 64, agentStatus: "monitoring",
      activeIssues: ["Ran clean but produced no items."],
      suggestedActions: [`Check the input feeding ${lower}.`],
    });
  }
  return subsystem(id, { health: 88, confidence: 82, agentStatus: "monitoring", throughput: items });
}

// ─── Gate: the founder review stage — measured by decisions, not throughput ────

function deriveGate(runs) {
  const mine = nodesOfCategory(runs, "gate");
  if (!mine.length) {
    return subsystem("gate", {
      health: 64, confidence: 60,
      activeIssues: ["No founder review has run yet."],
      suggestedActions: ["Run the loop to stage drafts for review."],
    });
  }
  const items = mine.flatMap((n) => (Array.isArray(n.items) ? n.items : []));
  const pending = items.filter((i) => i.approvalStatus === "pending").length;
  const approved = items.filter((i) => i.approvalStatus === "approved").length;
  const issues = [];
  const actions = [];
  if (pending > 0) {
    issues.push(`${pending} draft${pending > 1 ? "s" : ""} awaiting your review.`);
    actions.push(`Review ${pending} pending draft${pending > 1 ? "s" : ""} at the gate.`);
  }
  return subsystem("gate", {
    health: 100, confidence: 100, throughput: approved,
    agentStatus: pending > 0 ? "monitoring" : "idle",
    activeIssues: issues, suggestedActions: actions,
  });
}

// ─── Context: grounded in real product code when a workspace is open ───────────
//
// Health derives from the REAL scan state, never seeded. A ready context connector
// alone used to mint a constant 88 regardless of what the scan actually proved — that
// is the seeded value AGENTS.md forbids. The only admissible inputs are the truth-grade
// sources the citation rule names: the raw scan report and connector readiness. The
// founder-editable ProductModel (interpretation, holds speculative guesses) is NEVER an
// input here — wiring it in would let interpretation move a truth-layer number.
//
// The shape read is the RAW scan report (server.mjs passes getWorkspace(...).report),
// whose real keys are repo / filesScanned / stack / winEvent / analytics / attribution /
// gaps (scan.mjs:333-371). It has no productName, no flattened evidence[] — those live on
// the understanding object, not the raw report, so they are not read here.

function reportCitationCount(report) {
  const sections = [report.winEvent, report.analytics, report.attribution];
  return sections.reduce((sum, section) => {
    const cites = Array.isArray(section?.citations) ? section.citations.length : 0;
    return sum + cites;
  }, 0);
}

function deriveContext(connectors, report) {
  const ready = categoryReady(connectors, "context");

  // 1. No report at all — grounding never ran. Honest "open a workspace" blank.
  if (!report) {
    return subsystem("context", {
      health: 66, confidence: 60,
      activeIssues: ["No repository grounding — open a workspace to ground context in real product code."],
      suggestedActions: ["Open a workspace so context reflects the actual product."],
    });
  }

  if (!ready) {
    return subsystem("context", {
      health: 55, confidence: 50,
      activeIssues: ["Context connectors (ICP, product) are not configured."],
      suggestedActions: ["Define ICP and product context for this channel."],
    });
  }

  const gaps = Array.isArray(report.gaps) ? report.gaps : [];
  const gapIssues = gaps
    .map((g) => (typeof g === "string" ? g : g?.title || g?.summary))
    .filter(Boolean);

  // 2. Report present but read nothing — grounding ran over an empty/unreadable repo.
  if (report.filesScanned === 0 || !report.repo) {
    return subsystem("context", {
      health: 24, confidence: 30, agentStatus: "investigating",
      activeIssues: [
        "The scan read no product code — context cannot be grounded in a real product.",
        ...gapIssues,
      ],
      suggestedActions: ["Point the workspace at a repository that contains real product code."],
    });
  }

  const stack = Array.isArray(report.stack) ? report.stack : [];
  const citations = reportCitationCount(report);

  // 3. Scan read files but nothing is cited (or no stack detected) — context exists but
  // is ungrounded. This is the exact case that wrongly showed 88: a ready context
  // connector over a real-but-uncited report. Drop below the investigation threshold so
  // the Problems rail can route to Context.
  if (citations === 0 || stack.length === 0) {
    return subsystem("context", {
      health: 42, confidence: 45, agentStatus: "investigating",
      activeIssues: [
        "Context is ungrounded — the scan cited no product facts, so grounding is thin.",
        ...gapIssues,
      ],
      suggestedActions: ["Scan a repo with real product code so context grounds in cited facts."],
    });
  }

  // 4. Grounded, but blind on the win event (a proven hole) — cap in the mid band and
  // surface the blind spot, exactly as Measure does for blind attribution.
  if (report.winEvent && report.winEvent.found === false) {
    return subsystem("context", {
      health: 48, confidence: 55, agentStatus: "investigating",
      activeIssues: [
        `Context is blind on the win event "${report.winEvent.name || "the win event"}" — it is not proven in product code.`,
        ...gapIssues,
      ],
      suggestedActions: ["Emit the win event in production code so context can ground on the outcome."],
    });
  }

  // 5. Citations present, a stack detected, the win event proven, and context connectors
  // ready — the real high band, now earned by cited reality rather than seeded.
  return subsystem("context", {
    health: 88, confidence: 85, agentStatus: "monitoring",
    activeIssues: gapIssues,
    suggestedActions: gapIssues.length ? ["Close the scan gaps to deepen grounding."] : [],
  });
}

// ─── Research: no real signal source exists yet — say so, don't fake it ────────

function deriveResearch() {
  return subsystem("research", {
    health: 0, confidence: 0,
    activeIssues: ["No research agent is connected yet."],
    suggestedActions: ["Connect a research source to activate this subsystem."],
  });
}

// ─── Learn: scales with the founder decisions actually recorded in the ledger ──

function deriveLearn(runs) {
  const decisions = extractDecisions(runs);
  const total = decisions.approved.length + decisions.rejected.length + decisions.edits.length;
  if (total === 0) {
    return subsystem("learn", {
      health: 32, confidence: 40,
      activeIssues: ["No founder decisions recorded yet — the loop has nothing to learn from."],
      suggestedActions: ["Approve, reject, or edit drafts at a gate to start the learning loop."],
    });
  }
  return subsystem("learn", {
    health: Math.min(85, 55 + total * 5), confidence: 70, throughput: total,
    agentStatus: "monitoring",
  });
}

// ─── Measure: the seam where code-grounding and the GTM flow meet ──────────────
//
// Can the system connect a GTM send to the outcome it was chasing? Answerable
// from real state, never invented: the scanned win event (defined? carries a
// source?), the run ledger (anything reach execute?), and connector state (real
// send connector, or only the local stager?).

function countStagedSends(runs) {
  const nodes = lastRun(runs)?.result?.nodes ?? null;
  if (!nodes) return 0;
  return Object.values(nodes)
    .filter((node) => node?.category === "execute" && Array.isArray(node.items))
    .reduce((sum, node) => sum + node.items.length, 0);
}

// Observations a measure stage actually captured on the last run — the general, any-motion signal
// for "is this outcome observable", used when the motion is NOT conversion-attribution outbound.
function countMeasureObservations(runs) {
  const nodes = lastRun(runs)?.result?.nodes ?? null;
  if (!nodes) return 0;
  return Object.values(nodes)
    .filter((node) => node?.category === "measure" && Array.isArray(node.items))
    .reduce((sum, node) => sum + node.items.length, 0);
}

// A motion is conversion-attribution (the win-event logic below applies) only when it sources and
// sends — outbound. A content / community / product-led / partnerships motion has no source stage;
// its outcome is observed through its own measure stage, not attributed to a code-emitted win event,
// so "blind attribution" is the wrong frame for it. No graph (a project-wide read) keeps the
// conversion semantics for backward compatibility.
function isConversionMotion(graph) {
  if (!graph || !Array.isArray(graph.nodes)) return true;
  return graph.nodes.some((n) => n.category === "source");
}

// Observation-based measurement for any non-outbound motion. Grades on whether the motion's measure
// stage exists and is observing its outcome — never demands a product-code win event, so a content
// or community motion is honestly measurable instead of permanently "blind".
function deriveObservationMeasure(graph, runs) {
  const hasMeasureStage = graph.nodes.some((n) => n.category === "measure");
  const observations = countMeasureObservations(runs);
  if (!hasMeasureStage) {
    return subsystem("measure", {
      health: 40, confidence: 45, agentStatus: "investigating", throughput: 0,
      activeIssues: ["No measure stage — this motion has no way to observe whether its outcome moved."],
      suggestedActions: ["Add a measure step that captures this motion's real outcome (reach, activations, signups, members)."],
    });
  }
  if (observations > 0) {
    return subsystem("measure", {
      health: 84, confidence: 80, agentStatus: "monitoring", throughput: observations,
    });
  }
  return subsystem("measure", {
    health: 64, confidence: 60, throughput: 0,
    activeIssues: ["Ready to measure, but no outcome has been observed yet."],
    suggestedActions: ["Run the loop so the measure stage starts capturing this motion's outcome."],
  });
}

export function deriveMeasure(report = null, runs = [], connectors = [], graph = null) {
  // Non-outbound motions measure their own outcome through their measure stage — the general path
  // that makes the product work for any project, not just conversion-attribution outbound.
  if (!isConversionMotion(graph)) {
    return deriveObservationMeasure(graph, runs);
  }
  const sends = countStagedSends(runs);
  const sendReady = connectors.some(
    (c) => c.category === "execute" && c.configured && !c.stub && isRealSender(c),
  );

  const issues = [];
  const actions = [];
  let health;
  let confidence;
  let agentStatus;

  if (!report) {
    health = 0;
    confidence = 0;
    agentStatus = "idle";
    issues.push("No outcome defined — open a workspace and scan a repo to set the win event.");
    actions.push("Open a workspace: point at a repo and name the win event you sell on.");
  } else {
    const win = report.winEvent ?? {};
    const winName = win.name || "the win event";
    const winFound = win.found === true;
    const carries = Array.isArray(win.attributionProperties) && win.attributionProperties.length > 0;

    if (!winFound) {
      health = 18;
      confidence = 30;
      agentStatus = "investigating";
      issues.push(`Win event "${winName}" is not proven in production code — outcomes cannot be measured.`);
      actions.push(`Emit one canonical "${winName}" event where the outcome is committed.`);
    } else if (!carries) {
      // The Buffalo-Projects acceptance case: the win event fires, but with no
      // source on it, so a send can never be attributed to the outcome.
      health = 40;
      confidence = 72;
      agentStatus = "investigating";
      issues.push(`Attribution is blind — "${winName}" is emitted without a source, so sends cannot be connected to outcomes.`);
      actions.push(`Carry the captured source into "${winName}" so outcomes attribute back to a channel.`);
    } else if (sendReady && sends > 0) {
      // Substrate proven and real sends are flowing — outcomes are observable.
      health = 86;
      confidence = 88;
      agentStatus = "monitoring";
    } else {
      // Substrate proven, but either no real send connector is wired or nothing
      // has been sent yet — staged-locally items are not measured outcomes.
      health = 72;
      confidence = 88;
      agentStatus = "idle";
      if (sendReady) {
        issues.push("Measurement is ready, but nothing has run through the send connector yet.");
        actions.push("Run the loop end to end so outcomes begin flowing into measure.");
      }
    }
  }

  if (!sendReady) {
    issues.push("No send connector configured — outbound is staged locally, so real outcomes can't yet be observed.");
    actions.push("Connect a send connector (e.g. Gmail) to turn staged sends into observable outcomes.");
  }

  return subsystem("measure", {
    health,
    // Real outcomes captured. Stays 0 until a real send connector closes the
    // loop — staged-but-unsent items are not measured outcomes.
    throughput: 0,
    confidence,
    agentStatus,
    activeIssues: issues,
    suggestedActions: actions,
  });
}

// ─── Investigations / findings / recommendations — all derived ─────────────────

function measureEvidence(report) {
  const win = report.winEvent ?? {};
  const carried = win.attributionProperties?.length ? win.attributionProperties.join(", ") : "none";
  return [
    `Win event "${win.name ?? "?"}" — ${win.found ? "proven in production code" : "not found in production code"}.`,
    `Attribution carried on the win event: ${carried}.`,
    report.headline ?? "",
  ].filter(Boolean);
}

// Open an investigation for any subsystem in real trouble (health 1–49). A
// not-connected subsystem (health 0) is not an investigation — it's just unwired.
function deriveInvestigations(subsystems, report) {
  return subsystems
    .filter((s) => s.health > 0 && s.health < 50 && s.activeIssues.length)
    .sort((a, b) => a.health - b.health)
    .slice(0, 8)
    .map((s) => ({
      id: `inv-${s.id}`,
      subsystem: s.id,
      // The same derived health the canvas node badge shows — one number, rendered
      // everywhere. The rail must not invent a second figure (it used to show confidence).
      health: s.health,
      problem: s.activeIssues[0],
      evidence: s.id === "measure" && report ? measureEvidence(report) : [...s.activeIssues],
      confidence: s.confidence,
      impact: "high",
      recommendation: s.suggestedActions[0] ?? "Address the issue above.",
      nextActions: s.suggestedActions,
      status: "open",
    }));
}

// Findings come from real failures in the most recent run.
function deriveFindings(runs) {
  const run = lastRun(runs);
  const nodes = run?.result?.nodes;
  if (!nodes) return [];
  const createdAt = run.createdAt ?? new Date().toISOString();
  return Object.values(nodes)
    .filter((n) => n.ok === false && !n.blocked && n.error && SUBSYSTEM_IDS.has(n.category))
    .slice(0, 4)
    .map((n, i) => ({
      id: `find-${n.nodeId ?? i}`,
      type: "regression",
      summary: n.error,
      subsystem: n.category,
      priority: "high",
      createdAt,
    }));
}

function deriveTopRecommendations(subsystems) {
  return subsystems
    .filter((s) => s.health > 0 && s.health < 70 && s.suggestedActions.length)
    .sort((a, b) => a.health - b.health)
    .slice(0, 5)
    .map((s) => s.suggestedActions[0]);
}

// ─── Public: compose the engine state from real signals ────────────────────────

// The emergent middle: the distinct stage-categories THIS graph actually contains, in flow order
// (left to right by node position). The four universals never appear here — they frame the motion.
// Each meta carries whether the stage is connector-backed (a tool node) so its health derivation
// knows whether a missing connector is even a possible problem.
function motionStageMetas(graph) {
  const metas = new Map();
  const order = [];
  for (const node of graph.nodes) {
    const cat = node.category;
    if (!cat || UNIVERSAL_STAGES.has(cat)) continue;
    const x = node.position?.x ?? 0;
    const connectorBacked = (node.kind ?? "tool") === "tool";
    const prior = metas.get(cat);
    if (!prior) {
      metas.set(cat, { id: cat, minX: x, connectorBacked });
      order.push(cat);
    } else {
      prior.minX = Math.min(prior.minX, x);
      prior.connectorBacked = prior.connectorBacked || connectorBacked;
    }
  }
  return order.map((cat) => metas.get(cat)).sort((a, b) => a.minX - b.minX);
}

// The leftmost x of any node in a category, or null if the graph has none. Used to place the
// gate (the wall) in the health summary so post-gate stages (a send/publish) read after it.
function categoryMinX(graph, cat) {
  let min = null;
  for (const node of graph.nodes) {
    if (node.category !== cat) continue;
    const x = node.position?.x ?? 0;
    min = min === null ? x : Math.min(min, x);
  }
  return min;
}

// Name the motion by its SHAPE, never from a fixed enum — the un-caging. A descriptive label
// inferred from the stages actually present, so a content motion reads as a "Content loop" and an
// outbound one as an "Outbound loop" without any motion taxonomy being hardcoded anywhere. New
// shapes fall back to naming after their first stage ("Webinar loop"), never to "broken outbound".
function deriveMotionName(cats) {
  const set = new Set(cats);
  const has = (...c) => c.some((x) => set.has(x));
  // Most-specific non-outbound signatures first, so a content/PLG/community motion is never
  // mislabelled outbound just because it also sends something.
  if (has("content", "publish", "seo", "distribute")) return "Content loop";
  if (has("instrument", "segment", "activate", "onboard", "trigger")) return "Activation loop";
  if (has("community", "advocate", "event")) return "Community loop";
  if (has("partner", "integration", "ecosystem")) return "Partnerships loop";
  if (has("paid", "ad", "campaign")) return "Paid loop";
  if (has("referral", "invite", "viral")) return "Referral loop";
  // Outbound's defining stage is sourcing a list — source (alone or with enrich/filter) ⇒ outbound.
  if (has("source", "enrich", "filter")) return "Outbound loop";
  if (cats.length) return `${stageLabel(cats[0])} loop`;
  return "GTM loop";
}

function composeState(subsystems, report, runs, motion) {
  return {
    subsystems,
    // The motion's emergent identity: a shape-derived name + the real stages, so the UI can show
    // "what kind of go-to-market this is" without the host ever picking from a fixed list. Null on
    // the legacy (no-graph) path, which still derives the full registry pipeline below.
    motion,
    agents: [],
    topRecommendations: deriveTopRecommendations(subsystems),
    investigations: deriveInvestigations(subsystems, report),
    experiments: [],
    recentFindings: deriveFindings(runs),
  };
}

export function getEngineState({ report = null, runs = [], connectors = [], graph = null } = {}) {
  // Emergent path — a graph is supplied, so the motion declares its OWN stages. The four universals
  // (Ground · Gate · Measure · Learn) frame it; the middle is exactly the graph's stages, in flow
  // order, partitioned around the gate so the wall sits between the pre-gate work and any send.
  // A stage the motion doesn't have is simply absent — never a 0-health phantom that reads broken.
  if (graph && Array.isArray(graph.nodes)) {
    const metas = motionStageMetas(graph);
    const gateX = categoryMinX(graph, "gate");
    const toStage = (meta) =>
      deriveFlowStage(meta.id, runs, connectors, true, meta.connectorBacked);
    const preGate = metas.filter((m) => gateX === null || m.minX < gateX).map(toStage);
    const postGate = metas.filter((m) => gateX !== null && m.minX >= gateX).map(toStage);

    const subsystems = [
      deriveContext(connectors, report),
      ...preGate,
      deriveGate(runs),
      ...postGate,
      deriveMeasure(report, runs, connectors, graph),
      deriveLearn(runs),
    ];
    const stages = metas.map((m) => m.id);
    return composeState(subsystems, report, runs, {
      name: deriveMotionName(stages),
      stages,
    });
  }

  // Legacy path — no graph supplied (an engine query with no focused workflow). Derive the full
  // registry pipeline as before, so callers that ask for a project-wide engine read still get every
  // stage from the connector registry.
  const subsystems = [
    deriveResearch(),
    deriveContext(connectors, report),
    deriveFlowStage("source", runs, connectors, true),
    deriveFlowStage("enrich", runs, connectors, true),
    deriveFlowStage("filter", runs, connectors, true),
    deriveFlowStage("generate", runs, connectors, true),
    deriveGate(runs),
    deriveFlowStage("execute", runs, connectors, true),
    deriveMeasure(report, runs, connectors),
    deriveLearn(runs),
  ];
  return composeState(subsystems, report, runs, null);
}
