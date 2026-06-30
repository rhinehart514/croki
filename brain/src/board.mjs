// The GTM Board — a PURE READ over real state.
//
// Nine belief layers, grouped into three phases:
//   Strategy (1 ICP · 2 Problem/Trigger · 3 Positioning · 4 Offer)
//   Motion   (5 Channels · 6 Staged work / Artifacts)
//   Loop     (7 People · 8 Measure · 9 Learn)
//
// Each layer is a LayerBelief: what the founder currently believes at that layer, HOW that belief is
// grounded (stated by the founder, produced behind the gate, or derived from run outcomes), how
// confident the real signal makes it, and whether it is still assumed / being tested / validated /
// blind. Every number is DERIVED from actual state — founder verdicts, approved gate items, citations,
// run counts, People, the feedback ledger. Nothing is seeded: a layer with no signal honestly reports
// belief=null, confidence=0, status="blind" instead of a confident fake.
//
// This module is read-only. It NEVER writes, NEVER triggers a run, and a belief's groundingMode/status
// is NEVER read by any run path to decide whether to run — the founder gate stays the only checkpoint.
// (anti-cage.test.mjs guards that.) It imports only pure readers: project-store, person-store,
// feedback-ledger, memory, engine, flow-store.

import { loadProject, getProjectChannels } from "./project-store.mjs";
import { listPeople } from "./person-store.mjs";
import { loadFeedbackLedger } from "./feedback-ledger.mjs";
import { extractDecisions } from "./memory.mjs";
import { deriveMeasure } from "./engine.mjs";
import { loadFlow } from "./flow-store.mjs";
import { normalizeExperiment } from "./experiment-derivation.mjs";

// Confidence is computed from the real signal behind a belief — never a seeded constant. A founder
// verdict is the strongest signal; approvals / runs / appearances are next; cited evidence adds a
// little; a bare founder-stated belief earns a small floor. Zero when there is nothing behind it.
function signalConfidence({ validated = 0, tested = 0, citations = 0, stated = false }) {
  let c = 0;
  c += Math.min(45, validated * 45);
  c += Math.min(30, tested * 10);
  c += Math.min(15, citations * 5);
  c += stated ? 10 : 0;
  return Math.min(100, c);
}

function beliefStatus(belief, validated, tested) {
  if (!belief) return "blind";
  if (validated > 0) return "validated";
  if (tested > 0) return "testing";
  return "assumed";
}

// Resolve the verdict signal for one layer's experiments: a keep / double-down verdict counts as
// validated; any other resolved or running experiment counts as a test in flight.
function verdictCounts(layerExperiments) {
  let validated = 0;
  let testing = 0;
  for (const e of layerExperiments) {
    const decision = e.verdict?.decision;
    if (decision === "keep" || decision === "double-down") validated += 1;
    else if (decision === "kill" || e.status === "running" || e.status === "complete") testing += 1;
  }
  return { validated, testing };
}

function makeLayer({ layer, phase, groundingMode, belief, stated = false, validated = 0, tested = 0, citations = 0, experiments = [], evidence = [] }) {
  // A live experiment IS a belief at this layer even when nothing else is stated yet — fall back to its
  // hypothesis so a resolved/running experiment is never invisible (a verdict with no other signal would
  // otherwise read blind).
  const resolved = String(belief ?? "").trim() || String(experiments.find((e) => e?.hypothesis)?.hypothesis ?? "").trim();
  const confidence = resolved ? signalConfidence({ validated, tested, citations, stated }) : 0;
  return {
    layer,
    phase,
    belief: resolved || null,
    groundingMode,
    confidence,
    status: beliefStatus(resolved, validated, tested),
    experiments,
    evidence,
  };
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export function getBoard({ projectId } = {}, options = {}) {
  const opts = projectId ? { ...options, projectId } : options;
  const project = loadProject(opts);
  const sc = project.sharedContext ?? {};
  const channels = getProjectChannels(project, opts);
  const people = listPeople(project.id, opts);
  const ledger = loadFeedbackLedger(project.id, opts);

  const experiments = (Array.isArray(sc.experiments) ? sc.experiments : []).map(normalizeExperiment);
  const layerExp = (key) => experiments.filter((e) => (e.targetLayer || "channels") === key);

  // Aggregate every channel's run ledger once — the real run-derived signal the Motion and Loop layers
  // read. Pure reads; a missing flow never throws the board.
  const allRuns = [];
  for (const channel of project.channels ?? []) {
    try {
      const { runs } = loadFlow(channel.graphId, null, opts);
      if (Array.isArray(runs)) allRuns.push(...runs);
    } catch {
      // a channel without a stored flow contributes no runs
    }
  }

  // The active channel's graph frames the Measure derivation (its shape decides conversion vs
  // observation measurement).
  let activeGraph = null;
  try {
    const active = (project.channels ?? []).find((c) => c.id === project.activeChannelId) ?? (project.channels ?? [])[0];
    if (active) activeGraph = loadFlow(active.graphId, null, opts).graph ?? null;
  } catch {
    activeGraph = null;
  }

  const repoEvidence = Array.isArray(sc.repository?.evidence) ? sc.repository.evidence : [];
  const citedClaims = (Array.isArray(sc.claims) ? sc.claims : []).filter((c) => (c?.evidence?.length ?? 0) > 0);

  // ── Strategy ──────────────────────────────────────────────────────────────

  // 1. ICP — the founder's stated audience, tested by who actually entered the runs.
  const icp = sc.icp ?? {};
  const icpBelief = firstNonEmpty(icp.label, icp.query, icp.industry, icp.geography);
  const icpVerdicts = verdictCounts(layerExp("icp"));
  const icpLayer = makeLayer({
    layer: "icp",
    phase: "Strategy",
    groundingMode: "stated",
    belief: icpBelief && `Target: ${icpBelief}`,
    stated: Boolean(icpBelief),
    validated: icpVerdicts.validated,
    tested: icpVerdicts.testing + (people.length ? 1 : 0),
    experiments: layerExp("icp"),
    evidence: people.length ? [`${people.length} real entrant(s) matched this ICP`] : [],
  });

  // 2. Problem / Trigger — the stated problem, plus the why-now triggers People carry from real runs.
  const problem = firstNonEmpty(sc.positioning?.problem);
  const triggers = people.flatMap((p) => (p.appearances ?? []).map((a) => a.trigger).filter(Boolean));
  const triggerVerdicts = verdictCounts(layerExp("trigger"));
  const triggerBelief = problem
    ? `Problem: ${problem}`
    : (triggers.length ? `${triggers.length} why-now trigger(s) observed` : "");
  const triggerLayer = makeLayer({
    layer: "trigger",
    phase: "Strategy",
    groundingMode: "stated",
    belief: triggerBelief,
    stated: Boolean(problem),
    validated: triggerVerdicts.validated,
    tested: triggerVerdicts.testing + triggers.length,
    experiments: layerExp("trigger"),
    evidence: triggers.slice(0, 3),
  });

  // 3. Positioning — category / audience / promise, grounded by cited claims.
  const pos = sc.positioning ?? {};
  const posParts = [pos.category, pos.audience, pos.promise].map((v) => String(v ?? "").trim()).filter(Boolean);
  const posVerdicts = verdictCounts(layerExp("positioning"));
  const positioningLayer = makeLayer({
    layer: "positioning",
    phase: "Strategy",
    groundingMode: "stated",
    belief: posParts.length ? posParts.join(" · ") : "",
    stated: pos.status === "stated" || posParts.length > 0,
    validated: posVerdicts.validated,
    tested: posVerdicts.testing,
    citations: citedClaims.length,
    experiments: layerExp("positioning"),
    evidence: citedClaims.slice(0, 3).map((c) => c.text),
  });

  // 4. Offer — the stated price / unit / terms and the alternatives it competes against.
  const offer = sc.offer ?? {};
  const offerParts = [offer.price, offer.unit, offer.terms].map((v) => String(v ?? "").trim()).filter(Boolean);
  const offerVerdicts = verdictCounts(layerExp("offer"));
  const offerBelief = offerParts.length
    ? offerParts.join(" / ")
    : (Array.isArray(offer.alternatives) && offer.alternatives.length ? `Competes with ${offer.alternatives.join(", ")}` : "");
  const offerLayer = makeLayer({
    layer: "offer",
    phase: "Strategy",
    groundingMode: "stated",
    belief: offerBelief,
    stated: offer.status === "stated" || offerParts.length > 0,
    validated: offerVerdicts.validated,
    tested: offerVerdicts.testing,
    experiments: layerExp("offer"),
    evidence: Array.isArray(offer.alternatives) ? offer.alternatives.slice(0, 3) : [],
  });

  // ── Motion ────────────────────────────────────────────────────────────────

  // 5. Channels — the run ledger: which motions exist and which have actually run behind the gate.
  const ranChannels = channels.filter((c) => (c.runCount ?? 0) > 0);
  const channelVerdicts = verdictCounts(layerExp("channels"));
  const channelLayer = makeLayer({
    layer: "channels",
    phase: "Motion",
    groundingMode: "gated",
    belief: channels.length ? `${channels.length} channel(s) · ${ranChannels.length} with runs` : "",
    validated: channelVerdicts.validated,
    tested: channelVerdicts.testing + ranChannels.length,
    experiments: layerExp("channels"),
    evidence: ranChannels.slice(0, 4).map((c) => `${c.name}: ${c.runCount} run(s)`),
  });

  // 6. Staged work / Artifacts — what the runs prepared behind the gate, awaiting or past founder review.
  const stagedItems = allRuns.reduce((sum, run) => {
    const nodes = run?.result?.nodes ?? {};
    return sum + Object.values(nodes)
      .filter((n) => n?.category === "gate" && Array.isArray(n.items))
      .reduce((s, n) => s + n.items.length, 0);
  }, 0);
  const artifactCount = Array.isArray(sc.artifacts) ? sc.artifacts.length : 0;
  const artifactVerdicts = verdictCounts(layerExp("artifacts"));
  const artifactLayer = makeLayer({
    layer: "artifacts",
    phase: "Motion",
    groundingMode: "gated",
    belief: (stagedItems || artifactCount) ? `${stagedItems} staged item(s) · ${artifactCount} artifact(s)` : "",
    validated: artifactVerdicts.validated,
    tested: artifactVerdicts.testing + stagedItems + artifactCount,
    experiments: layerExp("artifacts"),
    evidence: stagedItems ? [`${stagedItems} item(s) reached a founder gate`] : [],
  });

  // ── Loop ──────────────────────────────────────────────────────────────────

  // 7. People — the durable identities promoted from real run entrants.
  const peopleVerdicts = verdictCounts(layerExp("people"));
  const peopleLayer = makeLayer({
    layer: "people",
    phase: "Loop",
    groundingMode: "derived",
    belief: people.length ? `${people.length} durable person/people across channels` : "",
    validated: peopleVerdicts.validated,
    tested: peopleVerdicts.testing + people.length,
    experiments: layerExp("people"),
    evidence: people.slice(0, 3).map((p) => p.name || p.org || p.identityKey),
  });

  // 8. Measure — is the outcome observable? Read straight from the engine's real derivation.
  const measure = deriveMeasure(null, allRuns, [], activeGraph);
  const measureTested = measure.health > 50 ? 2 : measure.health > 0 ? 1 : 0;
  const measureVerdicts = verdictCounts(layerExp("measure"));
  const measureLayer = makeLayer({
    layer: "measure",
    phase: "Loop",
    groundingMode: "derived",
    belief: measure.health > 0 ? (measure.activeIssues[0] || "Outcomes are observable") : "",
    validated: measureVerdicts.validated,
    tested: measureVerdicts.testing + measureTested,
    experiments: layerExp("measure"),
    evidence: measure.activeIssues.slice(0, 2),
  });

  // 9. Learn — founder decisions, the feedback ledger, and resolved verdicts: what the loop has banked.
  const decisions = extractDecisions(allRuns);
  const decisionTotal = decisions.approved.length + decisions.rejected.length + decisions.edits.length;
  const resolvedVerdicts = experiments.filter((e) => e.verdict?.decision).length;
  const ledgerSignals = Array.isArray(ledger.signals) ? ledger.signals.length : 0;
  const learnBelief = (decisionTotal || resolvedVerdicts || ledgerSignals)
    ? `${decisionTotal} gate decision(s) · ${resolvedVerdicts} verdict(s) · ${ledgerSignals} signal(s)`
    : "";
  const learnLayer = makeLayer({
    layer: "learn",
    phase: "Loop",
    groundingMode: "derived",
    belief: learnBelief,
    validated: resolvedVerdicts,
    tested: decisionTotal + ledgerSignals,
    experiments: layerExp("learn"),
    evidence: [
      decisions.approved.length ? `${decisions.approved.length} approved` : "",
      decisions.rejected.length ? `${decisions.rejected.length} rejected` : "",
      decisions.edits.length ? `${decisions.edits.length} edited` : "",
    ].filter(Boolean),
  });

  const layers = [
    icpLayer, triggerLayer, positioningLayer, offerLayer,
    channelLayer, artifactLayer,
    peopleLayer, measureLayer, learnLayer,
  ];

  return {
    projectId: project.id,
    layers,
    groups: {
      Strategy: layers.filter((l) => l.phase === "Strategy"),
      Motion: layers.filter((l) => l.phase === "Motion"),
      Loop: layers.filter((l) => l.phase === "Loop"),
    },
  };
}
