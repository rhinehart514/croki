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
import { resultStore } from "./gtm-store.mjs";
import { experimentStatement, normalizeExperiment, outcomeCountsAsSuccess } from "./experiment-derivation.mjs";

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
  // hypothesis (or the variable it tests, for run-derived experiments that carry no stated hypothesis)
  // so a resolved/running experiment is never invisible (a verdict with no other signal would otherwise
  // read blind).
  const resolved = String(belief ?? "").trim()
    || String(experiments.map(experimentStatement).find(Boolean) ?? "").trim();
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

// Founder-facing count: "1 run", "3 runs" — real plural words, never the "(s)" shorthand.
function countOf(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}

// An experiment's board layer, read OPEN: whatever string the experiment carries ("market" aliases to
// the ICP band). No default — an experiment with no layer is NOT force-filed under channels; getBoard
// surfaces it on the Learn band so it stays visible instead of vanishing.
function layerKeyOf(e) {
  const t = String(e?.targetLayer ?? "").trim();
  return t === "market" ? "icp" : (t || null);
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
  // either); every other band reads its own key verbatim. The targetLayer stays an OPEN string, and an
  // experiment whose layer matches none of the nine bands (or that carries no layer at all) surfaces on
  // the Learn band below — visible somewhere, never vanished by an unknown key.
  const layerExp = (key) => experiments.filter((e) => layerKeyOf(e) === key);
  const bandKeys = new Set(["icp", "trigger", "positioning", "offer", "channels", "artifacts", "people", "measure", "learn"]);
  const strayExperiments = experiments.filter((e) => !bandKeys.has(layerKeyOf(e)));

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
    evidence: people.length ? [`${countOf(people.length, "real entrant")} matched this ICP`] : [],
  });

  // 2. Problem / Trigger — the stated problem, plus the why-now triggers People carry from real runs.
  const problem = firstNonEmpty(sc.positioning?.problem);
  const triggers = people.flatMap((p) => (p.appearances ?? []).map((a) => a.trigger).filter(Boolean));
  const triggerVerdicts = verdictCounts(layerExp("trigger"));
  const triggerBelief = problem
    ? `Problem: ${problem}`
    : (triggers.length ? `${countOf(triggers.length, "why-now trigger")} observed` : "");
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
    belief: channels.length ? `${countOf(channels.length, "pipeline")} · ${ranChannels.length} ${ranChannels.length === 1 ? "has" : "have"} run` : "",
    validated: channelVerdicts.validated,
    tested: channelVerdicts.testing + ranChannels.length,
    moving: ranChannels.length > 0,
    experiments: layerExp("channels"),
    evidence: ranChannels.slice(0, 4).map((c) => `${c.name}: ${countOf(c.runCount, "run")}`),
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
    belief: (stagedItems || artifactCount)
      ? [
          stagedItems ? `${countOf(stagedItems, "item")} staged for your review` : "",
          artifactCount ? countOf(artifactCount, "artifact") : "",
        ].filter(Boolean).join(" · ")
      : "",
    validated: artifactVerdicts.validated,
    tested: artifactVerdicts.testing + stagedItems + artifactCount,
    moving: stagedItems > 0,
    experiments: layerExp("artifacts"),
    evidence: stagedItems ? [`${countOf(stagedItems, "item")} reached your gate`] : [],
  });

  // ── Loop ──────────────────────────────────────────────────────────────────

  // 7. People — the durable identities promoted from real run entrants.
  const peopleVerdicts = verdictCounts(layerExp("people"));
  const peopleLayer = makeLayer({
    layer: "people",
    phase: "Loop",
    groundingMode: "derived",
    belief: people.length ? `${countOf(people.length, "person", "people")} reached across pipelines` : "",
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

  // 9. Learn — founder decisions, the feedback ledger, and resolved verdicts: what the loop has banked,
  // stated as what the founder actually did — never a bookkeeping tally. Experiments whose layer matches
  // no band also live here, so nothing the loop produced can vanish behind an unknown key.
  const decisions = extractDecisions(allRuns);
  const decisionTotal = decisions.approved.length + decisions.rejected.length + decisions.edits.length;
  const resolvedVerdicts = experiments.filter((e) => e.verdict?.decision).length;
  const ledgerSignals = Array.isArray(ledger.signals) ? ledger.signals.length : 0;
  const gateActs = [
    decisions.approved.length ? `approved ${decisions.approved.length}` : "",
    decisions.rejected.length ? `rejected ${decisions.rejected.length}` : "",
    decisions.edits.length ? `edited ${decisions.edits.length}` : "",
  ].filter(Boolean);
  const learnBelief = [
    gateActs.length ? `You ${gateActs.join(", ")} at your gate` : "",
    resolvedVerdicts ? `${countOf(resolvedVerdicts, "experiment")} settled` : "",
    ledgerSignals ? `${countOf(ledgerSignals, "piece", "pieces")} of feedback banked` : "",
  ].filter(Boolean).join(" · ");
  const learnLayer = makeLayer({
    layer: "learn",
    phase: "Loop",
    groundingMode: "derived",
    belief: learnBelief,
    validated: resolvedVerdicts,
    tested: decisionTotal + ledgerSignals,
    moving: (decisionTotal + resolvedVerdicts + ledgerSignals) > 0,
    experiments: [...layerExp("learn"), ...strayExperiments],
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
// The strip over ONE open pipeline — derived from that pipeline's OWN composed graph and its real
// run/gate state, never from a fixed face skeleton. One card per composed step, titled in the
// pipeline's own words (the labels the composition chose), each stating in plain words what actually
// happened there: what came in, what was drafted (plus the offer this pipeline carries, read
// defensively off channel.offer), what waits at the founder gate, what moved after approval, what came
// back. Honest-derivation discipline holds: a step where nothing has happened says so in plain words
// and names what would fill it — never a seeded signal. A closing "What you've decided" card appears
// ONLY when real conclusions exist (founder gate decisions, experiment verdicts bound to this
// pipeline) — result language, never the founder's goal echoed back, never a bookkeeping tally.
// ─────────────────────────────────────────────────────────────────────────────

function clipLine(value, max = 140) {
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// A short readable line out of whatever shape a run item took — a drafted post, an email, a reply, a
// person. Purely defensive over open item shapes; empty when nothing legible is there.
function itemExcerpt(item) {
  if (item == null) return "";
  if (typeof item === "string") return clipLine(item);
  if (typeof item !== "object") return "";
  for (const key of ["title", "subject", "headline", "text", "body", "content", "message", "draft", "summary", "preview", "name"]) {
    const v = item[key];
    if (typeof v === "string" && v.trim()) return clipLine(v);
  }
  return "";
}

// The offer THIS pipeline carries, read defensively — channel.offer is normally { statement } (see
// project-store normalizeChannelOffer) but may be a plain string from another writer, or absent
// entirely (honest: no offer line).
function channelOfferLine(channel) {
  const offer = channel?.offer;
  if (!offer) return "";
  if (typeof offer === "string") return offer.trim();
  if (typeof offer === "object") {
    const parts = [offer.price, offer.unit, offer.terms].map((v) => String(v ?? "").trim()).filter(Boolean);
    return firstNonEmpty(offer.statement, parts.join(" / "), offer.label, offer.name, offer.text, offer.summary);
  }
  return "";
}

// The graph's own steps in flow order (Kahn over its edges); nodes a cycle strands still come last
// rather than vanishing. Whatever categories and kinds the composition chose — no fixed list.
function flowOrder(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes.filter(Boolean) : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (!byId.has(edge?.source) || !byId.has(edge?.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source).push(edge.target);
  }
  const queue = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const seen = new Set();
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(byId.get(id));
    for (const target of outgoing.get(id) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
      if ((indegree.get(target) ?? 0) <= 0) queue.push(target);
    }
  }
  for (const n of nodes) if (!seen.has(n.id)) order.push(n);
  return order;
}

// One composed step → one strip card, in plain words about what really happened there. `res` is the
// step's node result from the pipeline's latest run (absent when it never ran or was skipped).
function cardForStep(node, res, { hasRun, isDraftStep, offerLine }) {
  const category = String(node.category ?? "").trim();
  const title = String(node.label ?? "").trim() || firstNonEmpty(category, node.kind, "step");
  const items = Array.isArray(res?.items) ? res.items : [];
  const card = { id: node.id, title, body: "", empty: false };

  if (res && (res.ok === false || res.blocked)) {
    card.body = "This step hit a problem on the last run — the run stopped here.";
    return card;
  }

  if (category === "gate") {
    const approved = items.filter((i) => i?.approvalStatus === "approved").length;
    const rejected = items.filter((i) => i?.approvalStatus === "rejected").length;
    const waiting = items.length - approved - rejected;
    const decidedBits = [approved ? `approved ${approved}` : "", rejected ? `rejected ${rejected}` : ""].filter(Boolean);
    if (waiting > 0) {
      card.needsYou = waiting;
      card.body = decidedBits.length
        ? `${waiting} waiting on your decision — you've ${decidedBits.join(" and ")} so far.`
        : `${waiting} waiting on your decision.`;
    } else if (decidedBits.length) {
      card.body = `You ${decidedBits.join(" and ")} on the last run.`;
    } else {
      card.empty = true;
      card.body = hasRun
        ? "Nothing reached your gate on the last run."
        : "Everything stops here for your say-so — nothing has reached it yet.";
    }
    return card;
  }

  if (category === "execute") {
    if (items.length > 0) {
      card.body = `${countOf(items.length, "item")} moved through here after your approval.`;
    } else {
      card.empty = true;
      card.body = "Nothing has gone out yet — approve what's at your gate and it moves from here.";
    }
    return card;
  }

  if (category === "measure") {
    if (items.length > 0) {
      card.body = `${countOf(items.length, "result")} came back.`;
      const excerpt = itemExcerpt(items[0]);
      if (excerpt) card.detail = excerpt;
    } else {
      card.empty = true;
      card.body = "Nothing has come back yet — once something goes out, what happens lands here.";
    }
    return card;
  }

  if (category === "source") {
    if (items.length > 0) {
      card.body = `${countOf(items.length, "item")} came in here on the last run.`;
      const excerpt = itemExcerpt(items[0]);
      if (excerpt) card.detail = excerpt;
    } else {
      card.empty = true;
      card.body = hasRun
        ? "Nothing came in here on the last run."
        : "Where this pipeline starts — nothing has come in yet.";
    }
    return card;
  }

  // Any other step the composition chose — generate, enrich, an agent, a skill, code, whatever.
  if (items.length > 0) {
    card.body = `Produced ${countOf(items.length, "item")} on the last run.`;
    const excerpt = itemExcerpt(items[0]);
    if (excerpt) card.detail = excerpt;
    if (isDraftStep && offerLine) card.body += ` It carries your offer: ${offerLine}.`;
  } else {
    card.empty = true;
    card.body = hasRun
      ? "This step hasn't produced anything yet."
      : "Nothing here yet — run the pipeline and this step's work shows up.";
    if (isDraftStep && offerLine) card.body += ` It will carry your offer: ${offerLine}.`;
  }
  return card;
}

function joinAnd(parts) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function getPipelineBeliefSpine({ projectId, channelId } = {}, options = {}) {
  const opts = projectId ? { ...options, projectId } : options;
  const project = loadProject(opts);
  const sc = project.sharedContext ?? {};
  const channel = getChannel(project, channelId, opts);

  // This pipeline's own run ledger + executable graph. A missing flow never throws; it just yields an
  // empty strip (the pipeline has no composed steps yet — the UI says so in plain words).
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

  const hasRun = runs.length > 0;
  const lastRun = hasRun ? runs[runs.length - 1] : null;
  const lastNodes = lastRun?.result?.nodes ?? {};

  // Context/declaration nodes carry project background into the run — they are not a stage of the
  // pipeline's motion, so the strip doesn't card them.
  const steps = flowOrder(graph).filter((n) => String(n.category ?? "") !== "context");
  // The pipeline's own offer leads; with none stated, the project-level offer (sharedContext.offer)
  // is the standing default this pipeline's drafts carry.
  const offerLine = channelOfferLine(channel) || channelOfferLine({ offer: sc.offer });
  // The drafting step — the last agent/skill/generate step in flow order — is where what this pipeline
  // actually says gets staged; the offer it carries rides on that card.
  const draftStep = [...steps].reverse().find((n) => n?.kind === "agent" || n?.kind === "skill" || n?.category === "generate") ?? null;

  const cards = steps.map((node) =>
    cardForStep(node, lastNodes[node.id], { hasRun, isDraftStep: node === draftStep, offerLine }));

  // The closing card: real conclusions only. Founder gate decisions across every run of this pipeline,
  // plus the verdicts the founder rendered on experiments bound to it — each stated as what was decided.
  // Rendered ONLY when something was actually decided; a fresh pipeline simply has no card here.
  const experiments = (Array.isArray(sc.experiments) ? sc.experiments : []).map(normalizeExperiment);
  const matchesChannel = (id) => id === channel.id || id === channel.graphId;
  const settled = experiments.filter((e) =>
    e.verdict?.decision
    && (matchesChannel(e.channelId) || (Array.isArray(e.arms) && e.arms.some((arm) => matchesChannel(arm?.channelId)))));
  let approvedAll = 0;
  let rejectedAll = 0;
  for (const run of runs) {
    for (const node of Object.values(run?.result?.nodes ?? {})) {
      if (node?.category !== "gate" || !Array.isArray(node.items)) continue;
      for (const item of node.items) {
        if (item?.approvalStatus === "approved") approvedAll += 1;
        else if (item?.approvalStatus === "rejected") rejectedAll += 1;
      }
    }
  }
  const conclusionLines = [];
  const gateActs = [
    approvedAll ? `approved ${approvedAll}` : "",
    rejectedAll ? `rejected ${rejectedAll}` : "",
  ].filter(Boolean);
  if (gateActs.length) {
    conclusionLines.push(`Across ${countOf(runs.length, "run")} you ${joinAnd(gateActs)}.`);
  }
  for (const exp of settled) {
    const decision = exp.verdict.decision;
    const word =
      decision === "keep" ? "kept"
      : decision === "kill" ? "killed"
      : decision === "double-down" ? "doubled down on"
      : decision;
    const name = firstNonEmpty(exp.hypothesis, exp.variable) || "an experiment on this pipeline";
    conclusionLines.push(`You ${word} “${name}”.`);
  }
  if (conclusionLines.length) {
    cards.push({ id: "decided", title: "What you've decided", body: conclusionLines.join(" "), empty: false });
  }

  return {
    projectId: project.id,
    channelId: channel.id,
    channelName: channel.name,
    cards,
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
  const pathIds = new Set();
  try {
    const { runs: chRuns } = loadFlow(graphId, null, options);
    for (const run of Array.isArray(chRuns) ? chRuns : []) {
      runs += 1;
      // Collect the run's pathId (the durable key real outcomes join back on), so we can count the real
      // market outcomes this channel actually produced — the only honest success signal.
      const pathId = run?.result?.pathId ?? run?.pathId ?? run?.graph?.id ?? null;
      if (pathId) pathIds.add(String(pathId));
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
  return { runs, staged, approved, rejected, pathIds };
}

// The count of REAL MARKET OUTCOMES a channel earned — a reply, meeting, signup, activation, purchase,
// retention, or any founder-recorded outcome joined back to one of this channel's runs. FIX 5: this is the
// ONLY success signal. A gate approval is NOT an outcome — it means the founder let something GO OUT, not
// that the market responded — so approval rate is deliberately excluded from any success/leader score. A
// "sent" delivery fact is likewise not a market outcome and is not counted. Pure read over the outcome
// ledger, matched to the channel by the channel slug OR one of its runs' pathIds (the motion ref).
function realOutcomeCountForChannel(channel, pathIds, options = {}) {
  const projectFilter = channel.projectId ?? options.projectId ?? null;
  const channelIds = new Set([channel.id, channel.graphId].filter(Boolean).map(String));
  let outcomes;
  try {
    outcomes = resultStore.list(projectFilter ? { ...options, projectId: projectFilter } : options);
  } catch {
    return 0;
  }
  let count = 0;
  for (const r of Array.isArray(outcomes) ? outcomes : []) {
    // Only positive market evidence raises an arm. Known negatives (ignored, objection, bounce, …),
    // neutral delivery receipts, and unknown labels remain visible in the ledger but never become wins.
    if (!outcomeCountsAsSuccess(r?.outcomeKind)) continue;
    const matchesChannel =
      (r.channel && channelIds.has(String(r.channel))) ||
      (r.pathId && pathIds.has(String(r.pathId))) ||
      (r.motionRef && pathIds.has(String(r.motionRef)));
    if (matchesChannel) count += 1;
  }
  return count;
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

  // FIX 5: success comes ONLY from real market outcomes. Approval rate is removed from the score entirely.
  const marketOutcomes = realOutcomeCountForChannel(channel, tally.pathIds, options);
  const hasSignal = tally.runs > 0;
  // A comparative composite (never a calibrated absolute) that surfaces the leading arm: more real market
  // outcomes dominate, with running the motion and reaching real people as secondary activity signals.
  // Nothing about how often the founder APPROVED at the gate raises the score.
  const totalScore = hasSignal
    ? Math.min(100, Math.round(Math.min(60, marketOutcomes * 20) + Math.min(20, peopleReached * 4) + Math.min(20, tally.runs * 4)))
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
      marketOutcomes,
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
