import { loadProject, getProjectChannels } from "./project-store.mjs";
import { getPerson, listPeople, extractIdentity } from "./person-store.mjs";
import { loadFlow } from "./flow-store.mjs";
import { isSourceNode } from "./source-entry.mjs";
import { objectKey as computeObjectKey } from "./object-identity.mjs";
import { getObjectTouch } from "./gtm-store.mjs";

// Cross-reference index — "where does X appear across channels" as one real query. Simple and
// derived: Person references come straight from its promoted appearances (authoritative); ICP / Claim
// / Experiment references are derived by scanning the project's channels and shared context. Read-only
// — it answers a question, it never mutates and never sends. Powers focus-to-trace on the canvas and
// the portfolio Problems rail.

function flattenText(value, depth = 0) {
  if (value == null || depth > 6) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => flattenText(item, depth + 1)).join(" ");
  if (typeof value === "object") return Object.values(value).map((item) => flattenText(item, depth + 1)).join(" ");
  return "";
}

// One lowercased text haystack per channel: its name, objective, and kind. Enough surface for a
// "does this channel mention X" scan without loading every flow graph.
function channelHaystacks(projectId, options = {}) {
  const project = loadProject(options);
  return getProjectChannels(project, options).map((channel) => {
    const text = flattenText([
      channel.name,
      channel.objective,
      channel.kind,
    ]).toLowerCase();
    return { channelId: channel.id, channelName: channel.name, text };
  });
}

function personReferences(projectId, id, options = {}) {
  const person = getPerson(projectId, id, options);
  if (!person) return { references: [], person: null };
  const references = (person.appearances ?? []).map((appearance) => ({
    where: "appearance",
    channelId: appearance.channelId,
    runId: appearance.runId,
    role: appearance.role,
    trigger: appearance.trigger,
    at: appearance.at,
  }));
  return { references, person };
}

function experimentReferences(projectId, id, options = {}) {
  const project = loadProject(options);
  const experiments = project.sharedContext?.experiments ?? [];
  const target = experiments.find((experiment) => experiment.id === id);
  if (!target) return { references: [], experiment: null };
  // An experiment is bound to one channel; its cross-channel siblings share the same variable.
  const matches = experiments.filter(
    (experiment) => experiment.id === id || (target.variable && experiment.variable === target.variable),
  );
  const references = matches
    .filter((experiment) => experiment.channelId)
    .map((experiment) => ({
      where: "experiment",
      channelId: experiment.channelId,
      experimentId: experiment.id,
      variable: experiment.variable ?? null,
    }));
  return { references, experiment: target };
}

function claimReferences(projectId, id, options = {}) {
  const project = loadProject(options);
  const claims = project.sharedContext?.claims ?? [];
  // Claims are structured objects { id, text, ... }. A reference id may be the claim id, its index
  // in the claims array, or the claim text itself. Resolve to the structured claim, then scan the
  // channels for its text.
  const byId = claims.find((claim) => claim && claim.id === id) ?? null;
  const byIndex = (!byId && Number.isInteger(Number(id))) ? claims[Number(id)] ?? null : null;
  const target = byId ?? byIndex;
  const claimText = String((target && target.text) ?? id ?? "").trim();
  if (!claimText) return { references: [], claim: null };
  const needle = claimText.toLowerCase();
  const references = channelHaystacks(projectId, options)
    .filter((channel) => channel.text.includes(needle))
    .map((channel) => ({ where: "claim", channelId: channel.channelId, channelName: channel.channelName }));
  return { references, claim: claimText, claimId: target?.id ?? null };
}

function icpReferences(projectId, id, options = {}) {
  const project = loadProject(options);
  const icp = project.sharedContext?.icp ?? {};
  // The ICP is project-wide shared context, so the honest identifier is any of its descriptive
  // fields. Channels that name it reference it; an ICP with no usable identifier is referenced by
  // every channel (they all inherit the shared context).
  const identifier = String(id || icp.query || icp.industry || icp.description || "").trim().toLowerCase();
  const channels = channelHaystacks(projectId, options);
  if (!identifier) {
    return {
      references: channels.map((channel) => ({ where: "icp", channelId: channel.channelId, channelName: channel.channelName })),
      icp,
    };
  }
  const references = channels
    .filter((channel) => channel.text.includes(identifier))
    .map((channel) => ({ where: "icp", channelId: channel.channelId, channelName: channel.channelName }));
  return { references, icp };
}

// The generalized default: resolve ANY { kind, id } to its deterministic objectKey (Area 1) and return
// the object's touches from the durable touch ledger. This is what lets find_references answer "where has
// this geo / keyword / page / partner / change been touched" — every object kind, one index — without
// re-generalizing the four fast paths above. Honest-blank (references: []) for an object nothing has
// touched. `id` may be an already-composed objectKey (contains a ":") or the object's natural identifier.
function objectReferences(projectId, kind, id, options = {}) {
  const raw = String(id ?? "").trim();
  // An id that already looks like a composed key (kind:identifier) is used verbatim; otherwise compose one
  // from the kind + the id, offered to EVERY natural-identifier field the per-kind composers read (locality,
  // query, path, domain, …) so a bare natural identifier resolves regardless of which kind it is.
  const asFields = {
    id: raw, name: raw, label: raw, identifier: raw,
    locality: raw, query: raw, keyword: raw, term: raw,
    path: raw, route: raw, page: raw, url: raw, domain: raw, partner: raw,
  };
  const key = raw.includes(":") ? raw : computeObjectKey(kind, asFields);
  const record = getObjectTouch(projectId, key, options);
  if (!record) return { references: [], object: null };
  const references = (record.touches ?? []).map((touch) => ({
    where: "touch",
    motionId: touch.motionId ?? null,
    runId: touch.runId ?? null,
    verb: touch.verb ?? null,
    at: touch.at ?? null,
  }));
  return {
    references,
    object: { objectKey: record.objectKey, kind: record.kind ?? kind, label: record.label ?? null, firstSeenAt: record.firstSeenAt ?? null, lastSeenAt: record.lastSeenAt ?? null },
  };
}

// Answer "where does X appear across channels". `target` is { kind, id }:
// - person     → its durable appearances (authoritative, from person-store)
// - experiment → the channel it runs in, plus same-variable siblings
// - claim      → channels whose program/metadata text carries the claim
// - icp        → channels that name the ICP (or all, since ICP is shared)
// - any other kind (geo/keyword/page/partner/change/…) → its touches from Area 1's ledger, resolved by
//   objectKey. The four fast paths stay; the default is generalized rather than throwing (GTM-MACHINE.md
//   §Area 1). A run path never calls this to gate a run — it is a pure read.
export function findReferences(projectId = "default", target = {}, options = {}) {
  const kind = String(target.kind || "").trim();
  const id = target.id;
  let result;
  switch (kind) {
    case "person": result = personReferences(projectId, id, options); break;
    case "experiment": result = experimentReferences(projectId, id, options); break;
    case "claim": result = claimReferences(projectId, id, options); break;
    case "icp": result = icpReferences(projectId, id, options); break;
    default:
      if (!kind) throw new Error("A cross-reference target needs a kind.");
      result = objectReferences(projectId, kind, id, options);
      break;
  }
  const references = result.references ?? [];
  const channelIds = [...new Set(references.map((ref) => ref.channelId).filter(Boolean))];
  // The generalized touch path identifies by motion, not channel — surface the motions it touched too so a
  // consumer of the generic default gets the same "where has this been touched" answer the fast paths give.
  const motionIds = [...new Set(references.map((ref) => ref.motionId).filter(Boolean))];
  return {
    kind,
    id: id ?? null,
    references,
    referenceCount: references.length,
    channelIds,
    channelCount: channelIds.length,
    ...(motionIds.length ? { motionIds, motionCount: motionIds.length } : {}),
    ...(result.person !== undefined ? { person: result.person } : {}),
    ...(result.experiment !== undefined ? { experiment: result.experiment } : {}),
    ...(result.claim !== undefined ? { claim: result.claim } : {}),
    ...(result.claimId !== undefined ? { claimId: result.claimId } : {}),
    ...(result.icp !== undefined ? { icp: result.icp } : {}),
    ...(result.object !== undefined ? { object: result.object } : {}),
  };
}

// ── Shared kernel — the project's real, cross-pipeline object model in one read ───────────────────
// The project owns ONE shared kernel (People, ICPs, Claims); pipelines are activations over it. This
// answers "who / what is real in this project, and which pipelines does each touch" as a single read,
// so a kernel view never has to fan out N find-references calls. Every entry is DERIVED from real state
// (durable People appearances, stated shared context, the claim→channel scan) and honest-blind: an
// empty project returns people:[], one base ICP entry, claims:[] — never a seeded object. Read-only.
//
// Returns { projectId, people[], icps[], claims[] } where:
//   people — one per durable Person: { id, identityKey, name|null, org|null, email|null, domain|null,
//            channelIds[], channelNames[], channelCount, appearanceCount, fatigue, firstSeenAt|null,
//            lastSeenAt|null }. fatigue = distinct pipeline count (cross-pipeline exposure).
//   icps   — the project's stated ICP (id:null, the base) plus one per distinct founder-linked ICP key
//            (setChannelIcp): { id, label|null, query|null, industry|null, geography|null, channelIds[],
//            channelNames[], channelCount }.
//   claims — one per structured Claim: { id, text, provenance, evidenceCount, channelIds[],
//            channelNames[], channelCount }.
export function listSharedKernel(projectId = "default", options = {}) {
  const project = loadProject({ ...options, projectId });
  const channels = getProjectChannels(project, options);
  const nameById = new Map();
  for (const c of channels) {
    nameById.set(c.id, c.name);
    if (c.graphId) nameById.set(c.graphId, c.name);
  }
  const namesFor = (ids) => ids.map((id) => nameById.get(id)).filter(Boolean);

  // People — durable identities and the pipelines they appeared in; fatigue = distinct pipeline count.
  const people = listPeople(projectId, options).map((person) => {
    const channelIds = [...new Set((person.appearances ?? []).map((a) => a.channelId).filter(Boolean))];
    return {
      id: person.id,
      identityKey: person.identityKey,
      name: person.name ?? null,
      org: person.org ?? null,
      email: person.email ?? null,
      domain: person.domain ?? null,
      channelIds,
      channelNames: namesFor(channelIds),
      channelCount: channelIds.length,
      appearanceCount: (person.appearances ?? []).length,
      fatigue: channelIds.length,
      firstSeenAt: person.firstSeenAt ?? null,
      lastSeenAt: person.lastSeenAt ?? null,
    };
  });

  // ICPs — the project's stated ICP (the base, id:null) plus any pipelines the founder explicitly
  // linked to a distinct ICP key (setChannelIcp). Each references the pipelines that carry it.
  const sc = project.sharedContext ?? {};
  const icpObj = sc.icp ?? {};
  const baseLabel = String(icpObj.label || icpObj.query || icpObj.industry || icpObj.geography || "").trim() || null;
  const baseRef = icpReferences(projectId, null, options);
  const baseChannelIds = [...new Set((baseRef.references ?? []).map((r) => r.channelId).filter(Boolean))];
  const icps = [{
    id: null,
    label: baseLabel,
    query: icpObj.query || null,
    industry: icpObj.industry || null,
    geography: icpObj.geography || null,
    channelIds: baseChannelIds,
    channelNames: namesFor(baseChannelIds),
    channelCount: baseChannelIds.length,
  }];
  const linkByKey = new Map();
  for (const c of channels) {
    const key = String(c.icp?.key ?? "").trim();
    if (!key) continue;
    const entry = linkByKey.get(key) ?? { key, label: null, channelIds: [] };
    if (!entry.label && c.icp?.label) entry.label = String(c.icp.label).trim();
    entry.channelIds.push(c.id);
    linkByKey.set(key, entry);
  }
  for (const entry of linkByKey.values()) {
    icps.push({
      id: entry.key,
      label: entry.label || entry.key,
      query: null,
      industry: null,
      geography: null,
      channelIds: entry.channelIds,
      channelNames: namesFor(entry.channelIds),
      channelCount: entry.channelIds.length,
    });
  }

  // Claims — structured shared-context claims and the pipelines whose metadata carries them.
  const claims = (Array.isArray(sc.claims) ? sc.claims : []).map((claim) => {
    const ref = claimReferences(projectId, claim.id, options);
    const channelIds = [...new Set((ref.references ?? []).map((r) => r.channelId).filter(Boolean))];
    return {
      id: claim.id,
      text: claim.text,
      provenance: claim.provenance ?? "speculative",
      evidenceCount: Array.isArray(claim.evidence) ? claim.evidence.length : 0,
      channelIds,
      channelNames: namesFor(channelIds),
      channelCount: channelIds.length,
    };
  });

  return { projectId: project.id, people, icps, claims };
}

// ── Channel feeds — undirected linkage between channels ───────────────────────────────────────────
// There is no stored notion of one channel feeding another. The honest, derived linkage: two channels
// are LINKED when they share the same real entity — the same Person (appears in both), the same Claim
// (its text surfaces in both channels' metadata), or the same Experiment variable (run in both). For
// every entity present in 2+ real channels, each unordered channel PAIR gets a shared counter bumped;
// pairs aggregate to ONE ChannelFeed. This is undirected ("these channels touch the same prospects /
// claims"), never a directional A→B production claim. Powers the engine-view canvas feed edges.

function pairKey(a, b) {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

function shorten(text, max = 40) {
  const value = String(text ?? "").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

// Bump the shared counter for `kind` on every unordered pair drawn from one entity's channel set.
// `realChannels` keeps us honest: only channel ids that actually exist in the project are counted, and
// duplicates collapse so a single entity never double-counts a channel. `meta` carries the dominant
// entity's descriptive text (claim text, experiment variable) for the eventual label.
function accumulatePairs(pairs, channelIds, kind, realChannels, meta = null) {
  const distinct = [...new Set(channelIds.filter((cid) => cid && realChannels.has(cid)))];
  if (distinct.length < 2) return;
  for (let i = 0; i < distinct.length; i += 1) {
    for (let j = i + 1; j < distinct.length; j += 1) {
      const [from, to] = distinct[i] < distinct[j] ? [distinct[i], distinct[j]] : [distinct[j], distinct[i]];
      const key = pairKey(from, to);
      const entry = pairs.get(key) ?? {
        fromChannel: from,
        toChannel: to,
        sharedPeople: 0,
        sharedClaims: 0,
        sharedExperiments: 0,
        claimText: null,
        experimentVariable: null,
      };
      if (kind === "person") entry.sharedPeople += 1;
      else if (kind === "claim") { entry.sharedClaims += 1; if (meta && !entry.claimText) entry.claimText = meta; }
      else if (kind === "experiment") { entry.sharedExperiments += 1; if (meta && !entry.experimentVariable) entry.experimentVariable = meta; }
      pairs.set(key, entry);
    }
  }
}

// Pick the dominant kind for the pair label: whichever shared count is largest (people > claim >
// experiment on a tie, since shared prospects is the most concrete signal).
function feedLabel(entry) {
  const { sharedPeople, sharedClaims, sharedExperiments } = entry;
  if (sharedPeople >= sharedClaims && sharedPeople >= sharedExperiments && sharedPeople > 0) {
    return `${sharedPeople} shared ${sharedPeople === 1 ? "prospect" : "prospects"}`;
  }
  if (sharedClaims >= sharedExperiments && sharedClaims > 0) {
    return entry.claimText ? `shared claim: ${shorten(entry.claimText)}` : `${sharedClaims} shared claims`;
  }
  if (sharedExperiments > 0) {
    return entry.experimentVariable ? `shared test: ${shorten(entry.experimentVariable)}` : `${sharedExperiments} shared tests`;
  }
  return "shared entities";
}

// Derive the undirected channel-to-channel feeds for a project: one ChannelFeed per linked channel
// pair, aggregating shared people, claims, and experiment variables, sorted by total descending.
// Defensive about missing/empty data — returns { feeds: [] } cleanly when there is nothing to link.
export function deriveChannelFeeds(projectId = "default", options = {}) {
  let project;
  try {
    project = loadProject({ ...options, projectId });
  } catch {
    return { feeds: [] };
  }
  const realChannels = new Set(getProjectChannels(project, { ...options, projectId }).map((channel) => channel.id));
  if (realChannels.size < 2) return { feeds: [] };

  const pairs = new Map();

  // People: each durable Person's appearances name the channels it touched.
  for (const person of listPeople(projectId, options)) {
    const channelIds = (person?.appearances ?? []).map((appearance) => appearance.channelId);
    accumulatePairs(pairs, channelIds, "person", realChannels);
  }

  // Claims: a structured claim links the channels whose metadata text carries it.
  for (const claim of project.sharedContext?.claims ?? []) {
    if (!claim?.id) continue;
    const ref = claimReferences(projectId, claim.id, options);
    const channelIds = (ref.references ?? []).map((reference) => reference.channelId);
    accumulatePairs(pairs, channelIds, "claim", realChannels, claim.text ?? ref.claim ?? null);
  }

  // Experiments: a variable run in multiple channels links them. Group experiments by variable so one
  // shared variable is counted once across its sibling channels, not once per sibling experiment.
  const byVariable = new Map();
  for (const experiment of project.sharedContext?.experiments ?? []) {
    const variable = String(experiment?.variable ?? "").trim();
    if (!variable || !experiment.channelId) continue;
    const set = byVariable.get(variable) ?? new Set();
    set.add(experiment.channelId);
    byVariable.set(variable, set);
  }
  for (const [variable, channelSet] of byVariable) {
    accumulatePairs(pairs, [...channelSet], "experiment", realChannels, variable);
  }

  const feeds = [...pairs.values()]
    .map((entry) => {
      const total = entry.sharedPeople + entry.sharedClaims + entry.sharedExperiments;
      return {
        fromChannel: entry.fromChannel,
        toChannel: entry.toChannel,
        sharedPeople: entry.sharedPeople,
        sharedClaims: entry.sharedClaims,
        sharedExperiments: entry.sharedExperiments,
        total,
        label: feedLabel(entry),
      };
    })
    .filter((feed) => feed.total > 0)
    .sort((a, b) => b.total - a.total
      || a.fromChannel.localeCompare(b.fromChannel)
      || a.toChannel.localeCompare(b.toChannel));

  return { feeds };
}

// ─── Directional feeds — channels the founder wired to pull from another channel's output ──────
// Unlike the undirected shared-entity feeds above, these are DECLARED: the founder dragged a feed on
// the engine canvas, which set a source node's config.sourceChannelId. We read them back by scanning
// each channel's graph for a derived source. The arrow points FROM the channel that produces TO the
// channel that consumes. A feed whose source channel no longer exists is dropped (never drawn broken).
export function deriveDirectedFeeds(projectId = "default", options = {}) {
  const project = loadProject(options);
  const channels = getProjectChannels(project, options);
  const realChannelIds = new Set(channels.map((ch) => ch.id));
  const feeds = [];
  for (const channel of channels) {
    if (!channel.graphId) continue;
    let graph;
    try { ({ graph } = loadFlow(channel.graphId, null, options)); } catch { continue; }
    for (const node of graph?.nodes ?? []) {
      const sourceChannelId = node?.config?.sourceChannelId;
      if (!isSourceNode(node) || !sourceChannelId) continue;
      if (!realChannelIds.has(sourceChannelId) || sourceChannelId === channel.id) continue;
      feeds.push({ fromChannel: sourceChannelId, toChannel: channel.id, sourceNodeId: node.id });
    }
  }
  feeds.sort((a, b) => a.fromChannel.localeCompare(b.fromChannel) || a.toChannel.localeCompare(b.toChannel));
  return { feeds };
}

// The cross-channel loader the run path injects: given a source channel id, return its last run's
// output items — the items at its last data-producing node (skipping context/resource). Read-only.
// Built once per run with the project's channel→graph map so a derived source pulls the real output.
export function createDerivedSourceLoader(options = {}) {
  const project = loadProject(options);
  const graphByChannel = new Map(getProjectChannels(project, options).map((ch) => [ch.id, ch.graphId]));
  return async (sourceChannelId) => {
    if (!sourceChannelId) return [];
    const graphId = graphByChannel.get(sourceChannelId) ?? sourceChannelId;
    let runs;
    try { ({ runs } = loadFlow(graphId, null, options)); } catch { return []; }
    const result = runs?.at(-1)?.result;
    if (!result?.ok || !result.nodes) return [];
    const order = Array.isArray(result.executionOrder) ? result.executionOrder : Object.keys(result.nodes);
    for (let i = order.length - 1; i >= 0; i--) {
      const r = result.nodes[order[i]];
      if (r && r.category !== "context" && r.category !== "resource" && Array.isArray(r.items) && r.items.length) {
        return r.items;
      }
    }
    return [];
  };
}

// ─── Cross-channel dedup — one person, many channels, before the gate (E5.2) ──────────────────────
// Many channels run at volume with different import sources; the same human can surface in several of
// them. Before a consolidated approval queue, collapse those duplicates so the founder reviews ONE
// item per person, and FLAG anyone who appeared in more than one channel — that overlap is the fatigue
// signal (you'd be hitting the same person from two channels at once).
//
// Pure and derived: it operates only on the entrants/items the caller passes in (real run output), it
// reuses the SAME strongest-identifier rule the durable Person uses (extractIdentity in
// person-store.mjs) so a deduped identity and a stored Person collapse to the same key, and it NEVER
// loads, mutates, or sends. Items with no stable identifier are kept as-is (each its own identity) —
// they can't be proven duplicates, so dropping them would silently lose real entrants.

// Read the channel an entrant belongs to from any of the conventional tags. A bare untagged item is
// allowed (channel = null) but then can never count as a cross-channel collision.
function channelOf(item) {
  const raw = item?.channelId ?? item?.channel ?? item?.channelName ?? item?.source ?? null;
  const value = String(raw ?? "").trim();
  return value || null;
}

// The per-appearance why-now trigger, read with the same precedence promoteEntrants uses.
function triggerOf(item) {
  return String(item?.nowTrigger || item?.trigger || item?.personalFact || "").trim() || null;
}

// Collapse the same person across channels into one identity carrying every per-channel appearance,
// and report who appears in more than one channel (the fatigue signal). Deterministic, order-stable,
// never seeded, never sends.
//
//   entrants — run items/entrants, each tagged with its channel (channelId / channel / source / …)
//   keyOf    — optional override for the identity key of an item; defaults to the durable Person rule
//              (extractIdentity). Pass your own only when an item's identity is decided elsewhere.
//
// Returns:
//   identities — one entry per distinct person: { key, channels[], appearances[], item, multiChannel }
//                where `item` is the first-seen entrant (gaps are not its job to fill — that's the
//                durable store) and `appearances` carries { channel, trigger, item } per surfacing.
//   collisions — the subset of identities with channels.length > 1, each { key, channels, ... } — the
//                people you'd hit from multiple channels at once. This is the fatigue report.
//   deduped    — the representative items, one per identity, in first-seen order — what a consolidated
//                approval queue shows instead of N copies of the same human.
//   stats      — { entrantCount, identityCount, collisionCount, duplicateCount }.
export function dedupeAcrossChannels(entrants = [], { keyOf } = {}) {
  const list = Array.isArray(entrants) ? entrants : [];
  const identityOf = typeof keyOf === "function"
    ? keyOf
    : (item) => extractIdentity(item)?.identityKey ?? null;

  const byKey = new Map();
  const order = [];
  let unidentified = 0;

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const channel = channelOf(item);
    const appearance = { channel, trigger: triggerOf(item), item };
    let key = identityOf(item);
    // An item with no stable identifier can't be proven a duplicate of anything. Give it a unique,
    // private key so it survives as its own identity rather than colliding with other anonymous items.
    if (!key) {
      key = `unidentified:${unidentified++}`;
      const entry = { key, item, channels: [], channelSet: new Set(), appearances: [], identified: false };
      entry.appearances.push(appearance);
      if (channel) { entry.channels.push(channel); entry.channelSet.add(channel); }
      byKey.set(key, entry);
      order.push(key);
      continue;
    }
    let entry = byKey.get(key);
    if (!entry) {
      entry = { key, item, channels: [], channelSet: new Set(), appearances: [], identified: true };
      byKey.set(key, entry);
      order.push(key);
    }
    entry.appearances.push(appearance);
    if (channel && !entry.channelSet.has(channel)) {
      entry.channelSet.add(channel);
      entry.channels.push(channel);
    }
  }

  const identities = order.map((key) => {
    const entry = byKey.get(key);
    return {
      key: entry.identified ? entry.key : null,
      item: entry.item,
      channels: entry.channels,
      appearances: entry.appearances,
      identified: entry.identified,
      multiChannel: entry.channels.length > 1,
    };
  });
  const collisions = identities.filter((identity) => identity.multiChannel);
  const deduped = identities.map((identity) => identity.item);

  return {
    identities,
    collisions,
    deduped,
    stats: {
      entrantCount: list.filter((item) => item && typeof item === "object").length,
      identityCount: identities.length,
      collisionCount: collisions.length,
      duplicateCount: list.filter((item) => item && typeof item === "object").length - identities.length,
    },
  };
}
