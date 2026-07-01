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

import { loadProject, getProjectChannels, getChannel } from "./project-store.mjs";
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

function makeLayer({ layer, phase, groundingMode, belief, stated = false, validated = 0, tested = 0, citations = 0, moving = false, experiments = [], evidence = [] }) {
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
    // Whether this layer is a run-derived layer that currently has live run signal behind it (vs a
    // static, never-run layer). Only ever true off real run activity — never seeded. Stated strategy
    // layers stay false. The board renders a subtle "moving" marker off this.
    moving: Boolean(moving),
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

  // Aggregate every channel's run ledger once — the real run-derived signal the Motion and Loop layers
  // read — AND tally each channel's staged/approved/rejected gate items so an experiment ARM bound to
  // that channel can race on its grounded result. Pure reads; a missing flow never throws the board.
  const allRuns = [];
  const channelTally = new Map();
  for (const channel of project.channels ?? []) {
    let runs = 0, staged = 0, approved = 0, rejected = 0;
    try {
      const { runs: chRuns } = loadFlow(channel.graphId, null, opts);
      for (const run of Array.isArray(chRuns) ? chRuns : []) {
        runs += 1;
        allRuns.push(run);
        const nodes = run?.result?.nodes ?? {};
        for (const node of Object.values(nodes)) {
          if (node?.category !== "gate" || !Array.isArray(node.items)) continue;
          for (const item of node.items) {
            staged += 1;
            if (item.approvalStatus === "approved") approved += 1;
            else if (item.approvalStatus === "rejected") rejected += 1;
          }
        }
      }
    } catch {
      // a channel without a stored flow contributes no runs
    }
    channelTally.set(channel.id, { runs, staged, approved, rejected });
  }

  // An experiment ARM bound to a channel carries that channel's real run tally, so the arm-comparison
  // diagram races the arms on grounded numbers, never invented ones.
  const enrichArms = (exp) => ({
    ...exp,
    arms: Array.isArray(exp.arms)
      ? exp.arms.map((arm) => (arm?.channelId && channelTally.has(arm.channelId)
          ? { ...arm, tally: channelTally.get(arm.channelId) }
          : arm))
      : exp.arms,
  });

  const experiments = (Array.isArray(sc.experiments) ? sc.experiments : []).map(normalizeExperiment).map(enrichArms);
  // The Market / ICP band reads BOTH "icp" and the alias "market" (a stated ICP grouping may target
  // either); every other band reads its own key verbatim. The targetLayer stays an OPEN string.
  const layerKeyOf = (e) => { const t = e.targetLayer || "channels"; return t === "market" ? "icp" : t; };
  const layerExp = (key) => experiments.filter((e) => layerKeyOf(e) === key);

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
  // The operational tiers each pipeline sits in right now, straight off its last-run status — so the
  // founder reads the live state of the fleet on the board without drilling in. NEEDS YOU = a failed /
  // errored last run (you must repair it); AT GATE = a run parked at the founder gate (you must review);
  // LIVE = a pipeline that has run clean and is moving. Honest-blank: null when there are no pipelines.
  const pipelineTiers = channels.length
    ? {
        needsYou: channels.filter((c) => c.status === "error").length,
        live: channels.filter((c) => c.status === "done" && (c.runCount ?? 0) > 0).length,
        atGate: channels.filter((c) => c.status === "waiting").length,
      }
    : null;
  const channelLayer = makeLayer({
    layer: "channels",
    phase: "Motion",
    groundingMode: "gated",
    belief: channels.length ? `${channels.length} pipeline(s) · ${ranChannels.length} with runs` : "",
    validated: channelVerdicts.validated,
    tested: channelVerdicts.testing + ranChannels.length,
    moving: ranChannels.length > 0,
    experiments: layerExp("channels"),
    evidence: ranChannels.slice(0, 4).map((c) => `${c.name}: ${c.runCount} run(s)`),
  });
  channelLayer.tiers = pipelineTiers;

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
    moving: stagedItems > 0,
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
    belief: people.length ? `${people.length} durable person/people across pipelines` : "",
    validated: peopleVerdicts.validated,
    tested: peopleVerdicts.testing + people.length,
    moving: people.length > 0,
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
    moving: measure.health > 0,
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
    moving: (decisionTotal + resolvedVerdicts + ledgerSignals) > 0,
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

// ─────────────────────────────────────────────────────────────────────────────
// L1 — the belief spine of ONE pipeline (channel). The same PURE-READ, never-seeded discipline as
// getBoard, but SCOPED to a single pipeline and folded down to five faces the founder reads at mid
// zoom: Who (the why-now trigger), What you say (positioning + offer), Who you reached (the People
// who entered THIS pipeline), Did it work (this pipeline's Measure health), Verdict (what this
// pipeline's runs banked). Every number is derived from this pipeline's real state; a face with no
// signal reports belief=null, confidence=0, status="blind" — never a confident fake.
// ─────────────────────────────────────────────────────────────────────────────
export function getPipelineBeliefSpine({ projectId, channelId } = {}, options = {}) {
  const opts = projectId ? { ...options, projectId } : options;
  const project = loadProject(opts);
  const sc = project.sharedContext ?? {};
  const channel = getChannel(project, channelId, opts);
  const people = listPeople(project.id, opts);

  // This pipeline's own run ledger + executable graph — the run-derived signal the reached/worked/
  // verdict faces read. A missing flow never throws; it just yields no runs.
  let runs = [];
  let graph = null;
  try {
    const flow = loadFlow(channel.graphId, null, opts);
    runs = Array.isArray(flow.runs) ? flow.runs : [];
    graph = flow.graph ?? null;
  } catch {
    runs = [];
    graph = null;
  }

  const experiments = (Array.isArray(sc.experiments) ? sc.experiments : []).map(normalizeExperiment);
  const layerKeyOf = (e) => { const t = e.targetLayer || "channels"; return t === "market" ? "icp" : t; };
  // An experiment belongs to THIS pipeline when it is bound to it directly or races it as an arm.
  const matchesChannel = (id) => id === channel.id || id === channel.graphId;
  const scopedToChannel = (e) =>
    matchesChannel(e.channelId) || (Array.isArray(e.arms) && e.arms.some((arm) => matchesChannel(arm?.channelId)));
  const faceExp = (...keys) => experiments.filter((e) => keys.includes(layerKeyOf(e)) && scopedToChannel(e));

  // People (and their why-now triggers) scoped to THIS pipeline's appearances only.
  const appearedHere = (p) => (p.appearances ?? []).filter((a) => matchesChannel(a.channelId));
  const scopedPeople = people.filter((p) => appearedHere(p).length > 0);
  const triggers = scopedPeople.flatMap((p) => appearedHere(p).map((a) => a.trigger).filter(Boolean));

  const citedClaims = (Array.isArray(sc.claims) ? sc.claims : []).filter((c) => (c?.evidence?.length ?? 0) > 0);

  // Face 1 — WHO: the why-now trigger observed on this pipeline's real entrants.
  const whoExp = faceExp("trigger");
  const whoV = verdictCounts(whoExp);
  const whoFace = makeLayer({
    layer: "who",
    phase: "Who",
    groundingMode: "derived",
    belief: triggers.length ? `${triggers.length} why-now trigger(s) observed in this pipeline` : "",
    validated: whoV.validated,
    tested: whoV.testing + triggers.length,
    moving: triggers.length > 0,
    experiments: whoExp,
    evidence: triggers.slice(0, 3),
  });

  // Face 2 — WHAT YOU SAY: the stated positioning + offer this pipeline carries, grounded by cited claims.
  const pos = sc.positioning ?? {};
  const offer = sc.offer ?? {};
  const posParts = [pos.category, pos.audience, pos.promise].map((v) => String(v ?? "").trim()).filter(Boolean);
  const offerParts = [offer.price, offer.unit, offer.terms].map((v) => String(v ?? "").trim()).filter(Boolean);
  const sayExp = faceExp("positioning", "offer");
  const sayV = verdictCounts(sayExp);
  const sayBelief = [posParts.join(" · "), offerParts.join(" / ")].filter(Boolean).join(" — ");
  const sayFace = makeLayer({
    layer: "say",
    phase: "What you say",
    groundingMode: "stated",
    belief: sayBelief,
    stated: pos.status === "stated" || posParts.length > 0 || offer.status === "stated" || offerParts.length > 0,
    validated: sayV.validated,
    tested: sayV.testing,
    citations: citedClaims.length,
    experiments: sayExp,
    evidence: citedClaims.slice(0, 3).map((c) => c.text),
  });

  // Face 3 — WHO YOU REACHED: the durable People who actually entered THIS pipeline.
  const reachedExp = faceExp("people");
  const reachedV = verdictCounts(reachedExp);
  const reachedFace = makeLayer({
    layer: "reached",
    phase: "Who you reached",
    groundingMode: "derived",
    belief: scopedPeople.length ? `${scopedPeople.length} person/people reached in this pipeline` : "",
    validated: reachedV.validated,
    tested: reachedV.testing + scopedPeople.length,
    moving: scopedPeople.length > 0,
    experiments: reachedExp,
    evidence: scopedPeople.slice(0, 3).map((p) => p.name || p.org || p.identityKey),
  });

  // Face 4 — DID IT WORK: this pipeline's Measure health, read straight off the engine derivation over
  // THIS pipeline's runs and graph.
  const measure = deriveMeasure(null, runs, [], graph);
  const measureTested = measure.health > 50 ? 2 : measure.health > 0 ? 1 : 0;
  const workedExp = faceExp("measure");
  const workedV = verdictCounts(workedExp);
  const workedFace = makeLayer({
    layer: "worked",
    phase: "Did it work",
    groundingMode: "derived",
    belief: measure.health > 0 ? (measure.activeIssues[0] || "Outcomes are observable") : "",
    validated: workedV.validated,
    tested: workedV.testing + measureTested,
    moving: measure.health > 0,
    experiments: workedExp,
    evidence: measure.activeIssues.slice(0, 2),
  });

  // Face 5 — VERDICT: what THIS pipeline's runs banked — founder gate decisions + resolved experiment
  // verdicts bound to this pipeline.
  const decisions = extractDecisions(runs);
  const decisionTotal = decisions.approved.length + decisions.rejected.length + decisions.edits.length;
  const verdictExp = faceExp("channels", "learn");
  const resolvedVerdicts = verdictExp.filter((e) => e.verdict?.decision).length;
  const verdictFace = makeLayer({
    layer: "verdict",
    phase: "Verdict",
    groundingMode: "derived",
    belief: (decisionTotal || resolvedVerdicts)
      ? `${decisionTotal} gate decision(s) · ${resolvedVerdicts} verdict(s)`
      : "",
    validated: resolvedVerdicts,
    tested: decisionTotal,
    moving: (decisionTotal + resolvedVerdicts) > 0,
    experiments: verdictExp,
    evidence: [
      decisions.approved.length ? `${decisions.approved.length} approved` : "",
      decisions.rejected.length ? `${decisions.rejected.length} rejected` : "",
      decisions.edits.length ? `${decisions.edits.length} edited` : "",
    ].filter(Boolean),
  });

  return {
    projectId: project.id,
    channelId: channel.id,
    channelName: channel.name,
    faces: {
      who: whoFace,
      say: sayFace,
      reached: reachedFace,
      worked: workedFace,
      verdict: verdictFace,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-arm measurement rollup — the cross-pipeline signal each ICP ground races its arms on. A PURE READ
// over one pipeline's real run ledger and the durable People who entered it. Honest-blind: a pipeline
// with no runs scores totalScore=null (no signal), never a fake 0 dressed up as a real score. The raw
// signals stay real integer counts (0 runs really is 0 items). totalScore is a derived composite — more
// runs, more People reached, and a higher gate-approval rate all raise it — used only COMPARATIVELY to
// surface the leading arm of a ground; it is not a calibrated absolute.
// ─────────────────────────────────────────────────────────────────────────────
function tallyChannelRuns(graphId, options = {}) {
  let runs = 0, staged = 0, approved = 0, rejected = 0;
  try {
    const { runs: chRuns } = loadFlow(graphId, null, options);
    for (const run of Array.isArray(chRuns) ? chRuns : []) {
      runs += 1;
      const nodes = run?.result?.nodes ?? {};
      for (const node of Object.values(nodes)) {
        if (node?.category !== "gate" || !Array.isArray(node.items)) continue;
        for (const item of node.items) {
          staged += 1;
          if (item.approvalStatus === "approved") approved += 1;
          else if (item.approvalStatus === "rejected") rejected += 1;
        }
      }
    }
  } catch {
    // a channel without a stored flow contributes no runs
  }
  return { runs, staged, approved, rejected };
}

function armSignal(channel, people, options = {}) {
  const tally = tallyChannelRuns(channel.graphId, options);
  const appearsHere = (p) => (p.appearances ?? []).some((a) => a.channelId === channel.id || a.channelId === channel.graphId);
  const reachedPeople = people.filter(appearsHere);
  const peopleReached = reachedPeople.length;
  // Fatigue: reached People who ALSO appear in another pipeline — the collision that means you would be
  // hitting the same human from two pipelines at once.
  const distinctChannelCount = (p) => new Set((p.appearances ?? []).map((a) => a.channelId).filter(Boolean)).size;
  const fatigueScore = reachedPeople.filter((p) => distinctChannelCount(p) > 1).length;

  const hasSignal = tally.runs > 0;
  const approvalRate = tally.staged > 0 ? tally.approved / tally.staged : 0;
  const totalScore = hasSignal
    ? Math.min(100, Math.round(Math.min(20, tally.runs * 4) + Math.min(40, peopleReached * 8) + approvalRate * 40))
    : null;

  return {
    channelId: channel.id,
    channelName: channel.name,
    signals: {
      peopleReached,
      itemsProduced: tally.staged,
      itemsApproved: tally.approved,
      itemsRejected: tally.rejected,
      runsCount: tally.runs,
      fatigueScore,
    },
    totalScore,
    isLeader: false,
  };
}

// Attach per-arm measurement to a ground and name its leader. The leader is the single arm with the
// strictly-highest real score; a tie at the top, or a ground where every arm is blind, names no leader
// (leader=null) rather than inventing a winner.
function withArmSignals(ground, channelRecordById, people, options = {}) {
  const arms = ground.channelIds
    .map((id) => channelRecordById.get(id))
    .filter(Boolean)
    .map((ch) => armSignal(ch, people, options));
  let leader = null;
  const scored = arms.filter((a) => a.totalScore != null);
  if (scored.length) {
    const max = Math.max(...scored.map((a) => a.totalScore));
    const top = scored.filter((a) => a.totalScore === max);
    if (top.length === 1) {
      top[0].isLeader = true;
      leader = top[0].channelId;
    }
  }
  return { ...ground, arms, leader };
}

// ─────────────────────────────────────────────────────────────────────────────
// L0 — the far-zoom ground: which ICP each pipeline tests. Channels are one-shot, so every pipeline
// tests the project's single stated ICP — that is the base ground, and it holds every pipeline (even
// when no ICP is stated, honest-blank: icpKey=null, grounded=false, but the pipelines still hang off
// it so the ground has somewhere to place them). A founder testing MULTIPLE ICPs does it two ways, both
// derived from real founder-owned state (never seeded): by GROUPING pipelines into an ICP-targeted
// EXPERIMENT (each experiment is a distinct ICP ground carrying the pipelines it races as arms), or by
// EXPLICITLY LINKING a pipeline to an ICP key (setChannelIcp) — pipelines sharing a linked key form one
// explicit-link ground. Extra grounds are additive: a pipeline still hangs off the base ground too.
// Every ground carries a per-arm measurement rollup (arms[] + leader) so the founder reads which arm is
// winning without drilling in.
// ─────────────────────────────────────────────────────────────────────────────
export function getPipelineIcpGrouping({ projectId } = {}, options = {}) {
  const opts = projectId ? { ...options, projectId } : options;
  const project = loadProject(opts);
  const sc = project.sharedContext ?? {};
  const channels = getProjectChannels(project, opts);
  const people = listPeople(project.id, opts);
  const experiments = (Array.isArray(sc.experiments) ? sc.experiments : []).map(normalizeExperiment);
  const layerKeyOf = (e) => { const t = e.targetLayer || "channels"; return t === "market" ? "icp" : t; };

  const icp = sc.icp ?? {};
  const icpKey = firstNonEmpty(icp.label, icp.query, icp.industry, icp.geography) || null;
  const icpBelief = icpKey ? `Target: ${icpKey}` : null;

  // The base ground: the project's stated ICP, holding every pipeline.
  const baseGround = {
    icpKey,
    icpBelief,
    grounded: Boolean(icpKey),
    source: "stated",
    channelIds: channels.map((c) => c.id),
    channelNames: channels.map((c) => c.name),
    channelCount: channels.length,
  };

  // Resolve an arm's channel record by id or graphId, for both experiment arms and the arm rollup.
  const channelById = new Map();
  for (const c of channels) {
    channelById.set(c.id, c);
    if (c.graphId) channelById.set(c.graphId, c);
  }

  // Extra grounds from ICP-targeted experiments: each groups the real pipelines it races as arms.
  const experimentGrounds = experiments
    .filter((e) => layerKeyOf(e) === "icp")
    .map((e) => {
      const armChannels = (Array.isArray(e.arms) ? e.arms : [])
        .map((arm) => channelById.get(arm?.channelId))
        .filter(Boolean);
      const uniq = [...new Map(armChannels.map((c) => [c.id, c])).values()];
      return {
        icpKey: firstNonEmpty(e.hypothesis, e.variable, e.id) || null,
        icpBelief: firstNonEmpty(e.hypothesis, e.variable) || null,
        grounded: true,
        source: "experiment",
        experimentId: e.id ?? null,
        channelIds: uniq.map((c) => c.id),
        channelNames: uniq.map((c) => c.name),
        channelCount: uniq.length,
      };
    })
    .filter((g) => g.channelCount > 0);

  // Extra grounds from EXPLICIT founder links (setChannelIcp): pipelines the founder directly bound to
  // an ICP key group under that key. One ground per distinct linked key. Additive — a linked pipeline
  // still hangs off the base ground too.
  const linkGroundsByKey = new Map();
  for (const c of channels) {
    const key = String(c.icp?.key ?? "").trim();
    if (!key) continue;
    const entry = linkGroundsByKey.get(key) ?? { key, label: null, channels: [] };
    if (!entry.label && c.icp?.label) entry.label = String(c.icp.label).trim();
    entry.channels.push(c);
    linkGroundsByKey.set(key, entry);
  }
  const linkGrounds = [...linkGroundsByKey.values()].map((entry) => ({
    icpKey: entry.key,
    icpBelief: entry.label || `Target: ${entry.key}`,
    grounded: true,
    source: "explicit-link",
    channelIds: entry.channels.map((c) => c.id),
    channelNames: entry.channels.map((c) => c.name),
    channelCount: entry.channels.length,
  }));

  // Race every ground's arms on their real run + People signal (honest-blind on no runs).
  const grounds = [baseGround, ...experimentGrounds, ...linkGrounds]
    .map((ground) => withArmSignals(ground, channelById, people, opts));

  return {
    projectId: project.id,
    // Top-level convenience: the project's stated ICP and its pipelines (the base ground), so a simple
    // consumer never has to walk `grounds`.
    icpKey,
    icpBelief,
    channelIds: baseGround.channelIds,
    channelNames: baseGround.channelNames,
    channelCount: baseGround.channelCount,
    grounds,
  };
}
