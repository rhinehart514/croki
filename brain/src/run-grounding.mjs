// Product grounding for a run, so an agent step (especially a self-sourcing discovery entry) knows
// WHAT product it serves and WHO its ICP is — without it, a discovery agent has nothing to find. The
// headline carries the product description + positioning + ICP so the product provider conveys who
// to look for. Shared by every run path (the direct/streaming graph-run endpoints).
//
// `report` (optional) is the real scan report (workspace.report). When present, the grounding stops
// reporting a hardcoded BLIND win event and instead reflects what the scan actually proved: the win
// event with its cited emission, whether attribution is captured, the stack, and the top gaps with
// their file:line citations. Absent a report the grounding stays honestly blind — a run with no
// scanned workspace is ungrounded and says so, rather than inventing product facts.
import { getProductModel } from "./product-model-store.mjs";
import { dedupeAcrossChannels } from "./cross-reference.mjs";
import { getObjectTouch, listObjectTouches, resultStore } from "./gtm-store.mjs";
import { objectKey as computeObjectKey, inferKind } from "./object-identity.mjs";
import { bucketFor } from "./object-funnel.mjs";
import { learnedSignal, renderLearnedSignal } from "./reallocation.mjs";

// The compact slice of the derived product model that discovery/research/draft agents actually need:
// the core objects (things), how they relate, and what users are trying to do — NOT the whole raw
// aggregate (ia/workflows/interactions/transitions/pinnedSignals), so the run prompt does not bloat.
// Returns null when no model is derived yet (honest blank — never invented).
function compactProductModel(model) {
  if (!model || typeof model !== "object") return null;
  const things = (Array.isArray(model.things) ? model.things : []).map((t) => ({
    name: t?.name ?? null,
    kind: t?.kind || null,
    summary: t?.summary || null,
  })).filter((t) => t.name);
  const relationships = (Array.isArray(model.relationships) ? model.relationships : []).map((r) => ({
    from: r?.from ?? null,
    to: r?.to ?? null,
    label: r?.label ?? null,
  })).filter((r) => r.from && r.to && r.label);
  const userGoals = (Array.isArray(model.userGoals) ? model.userGoals : []).map((g) => ({
    actor: g?.actor || null,
    goal: g?.goal ?? null,
    outcome: g?.outcome || null,
  })).filter((g) => g.goal);
  const states = (Array.isArray(model.states) ? model.states : []).map((s) => ({
    thingId: s?.thingId || null,
    name: s?.name ?? null,
  })).filter((s) => s.name);
  return { things, relationships, userGoals, states };
}

// ── The dead-primitive revival: cross-motion suppression, advisory only ─────────────────────────────
// Wire dedupeAcrossChannels (built, tested, zero callers until now) into the compose/run entry and
// cross-check its identities against Area 1's durable touch ledger. This answers, for a batch of
// candidate entrants/objects a run is about to work: which are genuinely NEW work, which were already
// HANDLED (a founder set-aside is still in force, or an outcome already joined), and which are already
// IN FLIGHT (another motion touched them recently, unresolved). It is a STRONG STEER to the composing
// agent, NEVER a pre-run contract and NEVER a gate — the founder gate stays the only checkpoint. It reads
// the ledger; it never writes it and never blocks a run. Returns:
//   { work, skipHandled, skipInFlight, reasons, stats }
// where work/skipHandled/skipInFlight are the representative items (one per identity), and `reasons` maps
// an objectKey to a plain-words why ("already handled — set aside 'not a fit'"; "in flight — worked by
// another motion 2h ago"). Honest-empty for an empty batch; tolerant of junk (never throws).
export function deriveSuppression(projectId = "default", entrants = [], options = {}) {
  const asOf = new Date().toISOString();
  const { identities } = dedupeAcrossChannels(Array.isArray(entrants) ? entrants : []);
  const work = [];
  const skipHandled = [];
  const skipInFlight = [];
  const reasons = {};

  for (const identity of identities) {
    const item = identity.item;
    // Resolve the object's durable key. An identified person carries its identityKey directly; anything
    // else is keyed from the item's fields via its inferred (open) kind. Un-keyable items are always work.
    const kind = inferKind(item) || "person";
    const key = identity.key || computeObjectKey(kind, item);
    const record = key ? getObjectTouch(projectId, key, options) : null;

    if (!record) {
      work.push(item);
      continue;
    }

    const bucket = bucketFor(record, { convertedKeySet: null, asOf });
    if (bucket === "suppressed" || bucket === "handled") {
      skipHandled.push(item);
      const aside = (record.touches ?? []).find((t) => t.verb === "set-aside");
      reasons[key] = aside?.reason
        ? `already handled — set aside${aside.reason ? ` (${aside.reason})` : ""}`
        : "already handled — an outcome already joined this object";
    } else if (bucket === "in_flight") {
      skipInFlight.push(item);
      const otherMotions = new Set((record.touches ?? []).map((t) => t.motionId).filter(Boolean));
      reasons[key] = `in flight — already worked by ${otherMotions.size} ${otherMotions.size === 1 ? "motion" : "motions"}`;
    } else {
      // Seen once but not by another motion — still new work for THIS run, just previously observed.
      work.push(item);
    }
  }

  return {
    work,
    skipHandled,
    skipInFlight,
    reasons,
    stats: {
      candidateCount: identities.length,
      workCount: work.length,
      skipHandledCount: skipHandled.length,
      skipInFlightCount: skipInFlight.length,
    },
  };
}

// ── workedContext — Area 2's thin projection over Area 1's touch ledger ─────────────────────────────
// The always-on runtime needs the composing model to know, per object the machine has touched: how many
// times, when last, and whether anything came back. This is a THIN PROJECTION over Area 1's durable touch
// ledger — NOT a parallel person-store fold. Per touched object it returns:
//   { objectKey, kind, label, touchCount, lastSeenAt, lastOutcomeKind }
// lastOutcomeKind is READ from the Result ledger by the object's key (a Result's buyerRef/joinKey that
// equals the object key), taking the most-recent joined outcome's kind — no new field on the object, and
// null when nothing has joined back (honest blank). It is a STRONG STEER folded into the run grounding as
// a `worked` slice; it NEVER filters what runs and NEVER gates. Any failure yields an empty projection so
// composition is never blocked. Deterministic code (a fold over stored records), never a model call.
export function workedContext(projectId = "default", options = {}) {
  let records = [];
  try {
    records = listObjectTouches(projectId, options);
  } catch {
    records = [];
  }
  if (!Array.isArray(records) || !records.length) return { projectId, objects: [] };

  // The most-recent joined outcome kind per object key, read straight off the Result ledger. A Result
  // joins to an object when its buyerRef or joinKey equals the object's key (the same honest, narrow join
  // object-funnel uses). "Most recent" is by observedAt — the newest outcome wins.
  const lastOutcomeByKey = new Map();
  let results = [];
  try {
    results = resultStore.list({ ...options, projectId });
  } catch {
    results = [];
  }
  for (const result of Array.isArray(results) ? results : []) {
    if (!result) continue;
    const kind = String(result.outcomeKind ?? "").trim();
    if (!kind) continue;
    const at = String(result.observedAt ?? "");
    for (const rawKey of [result.buyerRef, result.joinKey]) {
      const key = String(rawKey ?? "").trim();
      if (!key) continue;
      const prior = lastOutcomeByKey.get(key);
      if (!prior || at > prior.at) lastOutcomeByKey.set(key, { kind, at });
    }
  }

  const objects = records.map((record) => {
    const touches = Array.isArray(record?.touches) ? record.touches : [];
    const last = lastOutcomeByKey.get(record.objectKey) ?? null;
    return {
      objectKey: record.objectKey,
      kind: record.kind ?? null,
      label: record.label ?? null,
      touchCount: touches.length,
      lastSeenAt: record.lastSeenAt ?? null,
      lastOutcomeKind: last?.kind ?? null,
    };
  });
  return { projectId, objects };
}

export function buildRunGrounding(project, report = null) {
  const sc = project?.sharedContext ?? {};
  // The derived interpretive product model, read directly from its store (no signature change, no
  // caller change). This is what finally reaches the run when a founder never opened the picture
  // panel. If the store read fails or nothing is derived yet, stay honestly null.
  let productModel = null;
  try {
    productModel = project?.id ? compactProductModel(getProductModel(project.id)) : null;
  } catch {
    productModel = null;
  }
  const repo = sc.repository ?? {};
  const icpDesc = sc.icp?.description || sc.icp?.buyer || sc.icp?.summary || "";
  const posDesc = sc.positioning?.promise || sc.positioning?.category || sc.positioning?.summary || "";
  // The plain-words product description. NOTE: report.headline is the scan's TRACKING-GAP verdict
  // ("attribution captured but missing from project_created"), NOT a product description — so it must
  // never seed the product headline. The real product picture comes from the scan's productContext
  // (README prose / manifest description), then the founder's shared-context repository headline.
  const pc = report?.productContext ?? null;
  const productDescription =
    pc?.readme || pc?.pkg?.description || repo.headline || sc.product?.description || "";
  // The optional LEARN slice (Area 3): the plain-text "what's working / what drew nothing" block from
  // the machine's recorded outcomes, so a self-sourcing discovery agent leans toward the motion shapes
  // that earn wins. Strong steer only; null on a fresh project (nothing measured → no block, never faked).
  // Best-effort: a read failure yields no slice, never a broken grounding.
  let learn = null;
  try {
    learn = project?.id ? renderLearnedSignal(learnedSignal(project.id)) || null : null;
  } catch {
    learn = null;
  }
  // The optional WORKED slice (Area 2): a thin projection over Area 1's touch ledger — per object the
  // machine has touched, how many times, when last, and whether an outcome came back. It steers a
  // self-sourcing discovery agent away from re-working who's already handled or in-flight. Null on a
  // fresh project (nothing touched → no slice, never faked). Best-effort: a read failure yields no slice.
  let worked = null;
  try {
    const wc = project?.id ? workedContext(project.id) : null;
    worked = wc && wc.objects.length ? wc : null;
  } catch {
    worked = null;
  }
  const base = {
    productName: project?.name || sc.product?.name || pc?.pkg?.name || "product",
    headline: [productDescription, posDesc, icpDesc ? `Ideal customer: ${icpDesc}` : ""]
      .filter(Boolean).join(" — ") || project?.name || "",
    // The founder's own domain/keywords + sample-data shape, so a discovery agent can go read them.
    productContext: pc
      ? { keywords: pc.pkg?.keywords ?? [], sampleDataFiles: pc.sampleDataFiles ?? [] }
      : null,
    // The learn steer (null when nothing measured yet). Every return path carries it via base.
    learn,
    // The worked steer (null when nothing touched yet). Carried via base on every return path — so both
    // the direct-run and gate-resume grounding paths get the same suppression-aware slice.
    worked,
  };
  if (!report) {
    // No scanned workspace — stay honestly blind rather than implying proven attribution.
    return {
      ...base,
      productModel,
      winEvent: repo.outcome ? { name: repo.outcome } : null,
      evidenceState: "blind",
      evidence: [],
    };
  }
  // Real scan report: reflect what the code actually proved, with the cited evidence the gate renders.
  const win = report.winEvent ?? null;
  // "blind" only when attribution truly isn't captured for the win event; otherwise the scan proved it.
  const carried = Array.isArray(win?.attributionProperties) ? win.attributionProperties : [];
  const evidenceState = carried.length > 0 ? "proven" : "blind";
  // The cited lines the model can point a claim at: win-event emissions, then the gap citations.
  const evidence = [
    ...(Array.isArray(win?.citations) ? win.citations : []),
    ...(Array.isArray(report.gaps)
      ? report.gaps.flatMap((g) => (Array.isArray(g?.citations) ? g.citations : []))
      : []),
  ].filter(Boolean);
  return {
    ...base,
    productModel,
    stack: Array.isArray(report.stack) ? report.stack : [],
    winEvent: win ? { name: win.name, found: win.found ?? false, attributionProperties: carried } : (repo.outcome ? { name: repo.outcome } : null),
    // The scanned gaps become named blind spots the reading agent can act on (each with its citation).
    blindSpots: Array.isArray(report.gaps)
      ? report.gaps.filter((g) => g && g.title).map((g) => ({ title: g.title, summary: g.summary ?? null }))
      : [],
    funnel: report.funnel ?? null,
    evidenceState,
    evidence,
  };
}
