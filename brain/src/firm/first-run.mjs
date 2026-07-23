// first-run.mjs — the connect → read-back → offers sequence, assembled deterministically at repo bind.
//
// Contract §4A.5 / Phase 7. When a venture binds a real product repository, Drover must (1) read the
// product back on the canvas as a correctable working theory — what it does, who it's for, and what is
// still uncertain, with uncertainty explicitly LABELED rather than asserted — and (2) offer the founder
// two or three concrete, repository-derived directions in the conversation ("contact these buyers",
// "rewrite onboarding"), in ordinary language, not internal nouns.
//
// Truth discipline (FIRM-SPEC): a read-back is either CITED or LABELED INFERENCE, never asserted. This
// module derives the read-back from truth.mjs's bounded, cited repository scan and records it as a
// working theory whose grounded subjects carry real, digest-verified repository sources and whose
// interpretive subject is explicitly framed as Drover's guess for the founder to correct. It makes NO
// model call: the derivation is deterministic over cited facts, which keeps first-run offline-safe and
// reproducible. The interpretive step is intentionally injectable (see `deriveReadBack`) so a future
// model-backed product-model generator can replace the deterministic reader without moving this seam.
//
// This module never creates outward acts, campaigns, bets, or spend — the offers are conversation
// messages the founder picks from (routed through direction routing when chosen, Phase 4), not a plan
// to approve. Idea-stage ventures (a venture from a description with no repository) are out of scope
// (Phase 7 scope note: deferred-not-scheduled); first-run runs only for the repo-backed case.

import { readRepositoryTruth, readRepositoryExcerpt } from "./truth.mjs";
import { recordWorkingTheory } from "./architecture-proposals.mjs";
import { getArchitecture } from "./architecture.mjs";
import { appendConversationMessage } from "./conversation.mjs";
import { getSemanticModel, mutateSemanticModel } from "./semantic-model-store.mjs";

// The number of concrete directions first-run offers. Two or three per the contract; three when the
// scan gives us enough distinct, grounded footholds, two otherwise.
const MAX_OFFERS = 3;
const MIN_OFFERS = 2;

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

// End a fragment cleanly before concatenating another sentence onto it — a description that already
// ends in terminal punctuation must not produce a doubled period ("holding companies.. Who…").
function sentence(fragment) {
  return String(fragment ?? "").replace(/[.!?]+$/, "").trim();
}

// Internal compatibility-seam identifiers (contract §0) that must never surface as a founder-facing
// product name. Matched case-insensitively against the manifest name with any package scope stripped,
// so a repo whose package.json name is a seam slug (e.g. "gtm-ide" or "@drover/gtm-ide") never renders
// verbatim in read-back copy.
const SEAM_IDENTIFIERS = new Set([
  "gtm-ide", "bet", "bets", "motion", "motions", "fork", "forks",
  "outcome", "outcomes", "stage", "stages", "staged", "channel", "drifting",
]);

// The founder-facing product name. The manifest name is a repository fact, not founder copy: a package
// name is frequently an internal seam slug ("gtm-ide") or an ugly kebab/identifier slug ("acme-saas")
// that has no place in a read-back the founder reads. When the manifest name is a seam or a bare slug,
// prefer the founder's own venture name; fall back to a neutral phrase only when neither is usable. The
// founder-given venture name always wins over a slug because it is the name the founder chose to see.
function deriveProductName(manifestName, ventureName) {
  const manifest = text(manifestName);
  const venture = text(ventureName);
  const bare = manifest ? manifest.replace(/^@[^/]+\//, "").toLowerCase() : null;
  const isSeam = bare ? SEAM_IDENTIFIERS.has(bare) : false;
  // A slug is a machine identifier, not a name a founder would write: lowercase, no spaces, joined by
  // hyphens/underscores/dots/slashes/scopes. Founder-facing copy shows the venture name instead.
  const isSlug = manifest ? /^[@a-z0-9]+(?:[-_./][a-z0-9]+)+$/.test(manifest) : false;
  if (manifest && !isSeam && !isSlug) return manifest;
  return venture ?? "this product";
}

// A repository excerpt captured as a durable, digest-verified working-theory source. readRepositoryExcerpt
// mints the ref/digest format recordWorkingTheory re-validates, so a source captured here is a real
// citation, not a fabricated one. Returns null when the file is absent — honest absence, never a faked cite.
function captureSource(repository, file, startLine, endLine) {
  try {
    return readRepositoryExcerpt(repository, { file, startLine, endLine });
  } catch {
    return null;
  }
}

// The first readable code file the scan found, used to ground the "who it's for / how value happens"
// read in something the product actually ships, not just its manifest.
function firstCodeFile(files) {
  return files.find((file) => /\.(m?[jt]sx?|py|rb|go|rs)$/.test(file) && !/\.(test|spec)\./.test(file)) ?? null;
}

// Derive the labeled read-back from the cited scan. Deterministic and injectable: the return shape is a
// small set of subjects (each grounded in captured sources or explicitly marked as inference) plus the
// concrete direction offers. A model-backed generator can implement the same contract later.
export function deriveReadBack(scan, sources, ventureName = null) {
  const manifest = scan.manifest ?? {};
  const productName = deriveProductName(manifest.name, ventureName);
  const description = text(manifest.description);
  const deps = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];

  const groundedRefs = sources.map((source) => source.ref);
  // Every read-back subject must carry a concrete anchor (recordWorkingTheory enforces this). With no
  // captured source the venture is blind — the caller falls back rather than fabricating an anchor.
  if (!groundedRefs.length) return null;

  const doesStatement = description
    ? `${productName} is: ${description}`
    : `${productName} is the product in this repository; its manifest and code are the read.`;

  // The "who it's for" read is genuine interpretation layered on cited facts — labeled so the founder
  // sees it as Drover's guess, correctable in dialogue, not an asserted fact.
  const audienceGuess = description
    ? `Drover's read (correct me): the people ${productName} helps are those the description points at — ${sentence(description)}. Who they really are is a guess until you say.`
    : `Drover's read (correct me): who ${productName} is for is not yet stated in the repository. Tell me who you're building for and I'll ground it.`;

  const stackNote = deps.length
    ? `Built on ${deps.slice(0, 4).join(", ")}${deps.length > 4 ? ", and more" : ""}.`
    : "The stack is not declared in the manifest.";

  const subjects = [
    {
      id: "read-what-it-does",
      name: "What it does",
      statement: `${doesStatement} ${stackNote}`,
      anchor: groundedRefs,
    },
    {
      id: "read-who-its-for",
      name: "Who it may help",
      statement: audienceGuess,
      anchor: groundedRefs,
    },
    {
      id: "read-uncertain",
      name: "What's uncertain",
      statement: `Uncertain, needs you: how ${productName} makes value happen and which of these people to reach first. This is Drover's inference from the repository, not a claim it proves — correct it and I'll re-ground.`,
      anchor: groundedRefs,
    },
  ];

  const offers = deriveOffers({ productName, description, deps, files: scan.files ?? [] });
  return { subjects, offers };
}

// Two or three concrete, repository-derived directions in ordinary language. Each is grounded in a real
// scan fact so the offer is honest ("contact these buyers" only when the product implies a buyer). These
// are picks, not a plan: the founder chooses one and it routes to a teammate (Phase 4).
function deriveOffers({ productName, description, deps, files }) {
  const offers = [];
  const has = (pattern) => files.some((file) => pattern.test(file));

  if (has(/signup|onboard|invite|register/i)) {
    offers.push(`Rewrite onboarding so a first-time ${productName} user reaches value faster.`);
  }
  if (has(/pricing|checkout|billing|plan/i)) {
    offers.push(`Sharpen the pricing page so the offer reads clearly to a buyer.`);
  }
  if (has(/landing|marketing|page\.(t|j)sx/i) || description) {
    offers.push(`Reach the first buyers for ${productName} with one grounded, specific invitation.`);
  }
  if (deps.some((dep) => /analytics|segment|posthog|mixpanel|amplitude/i.test(dep))) {
    offers.push(`Close the loop so every new ${productName} account can be traced back to what brought it in.`);
  }

  // Always ensure at least the minimum: a broad, always-valid grounded direction so first-run never
  // returns an empty offer set even for a sparse repository.
  if (offers.length < MIN_OFFERS) {
    offers.push(`Contact the first people ${productName} could help and learn which promise earns a reply.`);
  }
  if (offers.length < MIN_OFFERS) {
    offers.push(`Publish, in the buyers' own words, the problem ${productName} solves.`);
  }
  return [...new Set(offers)].slice(0, MAX_OFFERS);
}

// Product / GTM's Product territory is the product itself, mapped as its pages (AGENTS.md §Boundaries;
// docs/FIRM-SPEC.md, 2026-07-22). The functions below read a Next.js app-router repository back into
// "page" objects — each carrying the route a visitor reaches, a founder-facing name from the code's own
// component identifier, and an honest, cited summary of what the page shows now. The derivation is pure
// and injectable (it takes the bounded, digest-verified `readExcerpt` rather than importing the
// filesystem); the persistence adapter is `syncProductPages` below. A page read is CITED, never asserted:
// a page whose source cannot be captured is dropped rather than fabricated, and the shaped objects are
// tentative and source-bearing so they render provisionally in the model while reading cleanly at rest.

// The head window of a page file: enough to reach the default export's own name and a user-facing headline
// or the leading intent comment, bounded well under truth.mjs's excerpt ceiling.
const PAGE_HEAD_LINES = 48;

// A Next.js app-router page: a `page.{js,jsx,ts,tsx}` file somewhere under an `app` directory. The route
// is the path between `app` and the file, with route groups `(marketing)` removed and dynamic segments
// `[id]`/`[...slug]` rendered as `:id`/`:slug`. `app/page.tsx` is the root route "/".
function routeFromFile(file) {
  const parts = String(file).split("/");
  const base = parts[parts.length - 1];
  if (!/^page\.(?:jsx?|tsx?)$/.test(base)) return null;
  const appIndex = parts.lastIndexOf("app");
  if (appIndex === -1) return null;
  const segments = parts.slice(appIndex + 1, parts.length - 1)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => segment.replace(/^\[\.\.\.(.+)\]$/, ":$1").replace(/^\[(.+)\]$/, ":$1"));
  return `/${segments.join("/")}`;
}

function titleize(identifier) {
  const spaced = String(identifier).replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// A stable, unique object id per route. The root page reads as "home"; other routes slugify their path.
function slugFromRoute(route) {
  if (route === "/") return "home";
  const slug = route.replace(/^\//, "").replace(/[/:]+/g, "-").replace(/[^a-z0-9-]/gi, "").toLowerCase();
  return slug || "home";
}

// The founder-facing page name, taken from the code's own default-export identifier ("SignupPage" →
// "Signup") so the map uses the developer's word, not an invented one. Falls back to the route when the
// export is anonymous.
function nameFromExcerpt(excerpt, route) {
  const match = excerpt.match(/export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/);
  const identifier = match ? match[1].replace(/Page$/, "") : null;
  if (identifier) return titleize(identifier);
  if (route === "/") return "Home";
  const segment = route.split("/").filter(Boolean).pop() ?? "Home";
  return titleize(segment.replace(/^:/, ""));
}

function stripTags(fragment) {
  return String(fragment).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// The first sentence of the file's leading intent comment (block or line run), used as an honest summary
// when a page ships no user-facing headline. A very short first sentence pulls in the next one so the read
// is not a bare fragment.
function leadingComment(excerpt) {
  const block = excerpt.match(/\/\*+([\s\S]*?)\*\//);
  const lineRun = excerpt.match(/(?:^|\n)[ \t]*\/\/[^\n]*(?:\n[ \t]*\/\/[^\n]*)*/);
  const raw = block ? block[1] : lineRun ? lineRun[0] : null;
  if (!raw) return null;
  const body = raw.replace(/^[ \t]*\/\/+/gm, "").replace(/^[ \t]*\*+/gm, "").replace(/\s+/g, " ").trim();
  if (!body) return null;
  const sentences = body.split(/(?<=[.!?])\s+/);
  let summary = sentences[0] ?? body;
  if (summary.length < 40 && sentences[1]) summary = `${summary} ${sentences[1]}`;
  return summary.trim() || null;
}

// The honest read of what the page shows now: prefer the headline a visitor actually reads, then the
// code's leading intent comment, then a plain acknowledgement that only the code speaks for it.
function summaryFromExcerpt(excerpt, name) {
  const headline = excerpt.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (headline) {
    const rendered = stripTags(headline[1]);
    if (rendered && !rendered.includes("{")) return rendered;
  }
  const comment = leadingComment(excerpt);
  if (comment) return comment;
  return `${name} is a page in this product; its code is the read.`;
}

// Derive the ordered pages from a repository scan. `readExcerpt(file, startLine, endLine)` must return the
// truth.mjs excerpt shape ({ ref, excerpt }) or null when the file cannot be read. Pages without a citable
// source are dropped — honest absence, never a fabricated citation.
export function deriveProductPages(scan, { readExcerpt } = {}) {
  if (typeof readExcerpt !== "function") throw new Error("deriveProductPages needs an injected readExcerpt.");
  const files = Array.isArray(scan?.files) ? scan.files : [];
  const pages = [];
  const seen = new Set();
  for (const file of [...files].sort()) {
    const route = routeFromFile(file);
    if (route === null) continue;
    const id = `page-${slugFromRoute(route)}`;
    if (seen.has(id)) continue;
    const source = readExcerpt(file, 1, PAGE_HEAD_LINES);
    if (!source?.ref) continue;
    const excerpt = String(source.excerpt ?? "");
    const name = nameFromExcerpt(excerpt, route);
    pages.push({
      id,
      route,
      name,
      file: text(source.path) ?? file,
      statement: summaryFromExcerpt(excerpt, name),
      sourceRef: source.ref,
    });
    seen.add(id);
  }
  return pages;
}

// Shape derived pages into tentative, source-bearing "page" semantic objects on the product territory. The
// open `type` is the literal "page"; territory is a facet on properties, so no schema change is needed.
// Assertion stays tentative and provenance carries the repository citation so the model treats these as a
// correctable agent read, never asserted truth.
export function productPageObjects(pages) {
  return (Array.isArray(pages) ? pages : []).map((page) => ({
    id: page.id,
    type: "page",
    name: page.name,
    statement: page.statement,
    assertion: "tentative",
    provenance: { kind: "repository-page", sourceRef: page.sourceRef, actor: "page-map" },
    properties: {
      territory: "product",
      page: { route: page.route, file: page.file, sourceRef: page.sourceRef },
    },
  }));
}

// The Product territory is a proper map: the pages laid out left to right in walk order, connected only
// where the code proves a page-to-page link (docs/FIRM-SPEC.md, 2026-07-22). The walk-order POSITION is a
// layout concern the UI derives; this module's job is to extract the proven links and store them as
// ordinary source-cited relationships the layout consumes. A connection is drawn only from a link,
// redirect, or navigation the code actually contains — never fabricated.

// The head window scanned for a page's outbound links, bounded like every other repository read. A page's
// links usually live in its JSX return, past the name/summary head, so this window is wider; a link past
// it is honestly not captured rather than guessed.
const PAGE_LINK_SCAN_LINES = 120;

// Normalize a link target to a comparable route: drop any query/hash and trailing slash so "/pricing/?x"
// and "/pricing" resolve to the same mapped page. The site root stays "/". Non-absolute targets (external
// URLs, anchors) return null and are ignored.
function normalizeLinkRoute(href) {
  const bare = String(href).split(/[?#]/)[0].trim();
  if (!bare.startsWith("/")) return null;
  return bare.replace(/\/+$/, "") || "/";
}

// The internal routes a page navigates to: Next.js <Link href>/plain href, redirect()/permanentRedirect(),
// and router.push()/replace(). Only same-origin paths (leading "/") count; the caller drops any target
// that is not itself a mapped page.
function pageLinkRoutes(excerpt) {
  const routes = new Set();
  const pattern = /(?:href|redirect|permanentRedirect|push|replace)\s*[=(]\s*\{?\s*["'`](\/[A-Za-z0-9\-_./]*)["'`]/g;
  for (let match = pattern.exec(String(excerpt)); match !== null; match = pattern.exec(String(excerpt))) {
    const route = normalizeLinkRoute(match[1]);
    if (route) routes.add(route);
  }
  return [...routes];
}

// Derive the proven page-to-page links among the mapped pages. Each link cites the source page file it was
// read from. A link to a route with no mapped page is dropped (never fabricate a target); a deeper page's
// link back to the site root is a return-home navigation, not a walk step, so it is left out — the map
// deepens left to right and does not draw a backward home edge.
export function deriveProductPageLinks(pages, { readExcerpt } = {}) {
  if (typeof readExcerpt !== "function") throw new Error("deriveProductPageLinks needs an injected readExcerpt.");
  const idByRoute = new Map((Array.isArray(pages) ? pages : []).map((page) => [page.route, page.id]));
  const links = [];
  const seen = new Set();
  for (const page of Array.isArray(pages) ? pages : []) {
    const source = readExcerpt(page.file, 1, PAGE_LINK_SCAN_LINES);
    if (!source?.ref) continue;
    for (const route of pageLinkRoutes(source.excerpt ?? "")) {
      if (route === page.route) continue;
      const toId = idByRoute.get(route);
      if (!toId) continue;
      if (route === "/" && page.route !== "/") continue;
      const id = `page-link-${page.id.replace(/^page-/, "")}-${toId.replace(/^page-/, "")}`;
      if (seen.has(id)) continue;
      links.push({ id, fromId: page.id, toId, route, sourceRef: source.ref });
      seen.add(id);
    }
  }
  return links;
}

// Shape proven page links into tentative, source-bearing "links to" relationships on the product
// territory. Agent authorship keeps them tentative and cited; the citation is the source page file the
// link was read from, so the connection is proven, never asserted.
export function productPageLinkRelationships(links) {
  return (Array.isArray(links) ? links : []).map((link) => ({
    id: link.id,
    fromRef: `object:${link.fromId}`,
    toRef: `object:${link.toId}`,
    label: "links to",
    type: "page-link",
    assertion: "tentative",
    provenance: { kind: "repository-link", sourceRef: link.sourceRef, actor: "page-map" },
    sourceRefs: [link.sourceRef],
    properties: { territory: "product" },
  }));
}

// The store operations for one derived family. An unchanged record produces NO write: rewriting an
// identical page would bump its revision and updatedAt, and new model material must not make unrelated
// canvas nodes move. A still-tentative record this adapter authored (matching provenance kind) that no
// longer derives is retracted; a record the founder adopted or re-authored is never rewritten or removed.
function syncFamilyOperations(existing, derived, family, kind) {
  const stored = new Map(existing.map((record) => [record.id, record]));
  const derivedIds = new Set(derived.map((record) => record.id));
  const ours = (record) => record?.provenance?.kind === kind && record?.assertion === "tentative";
  const operations = derived.filter((record) => {
    const current = stored.get(record.id);
    return !current || (ours(current) && !Object.keys(record).every((key) => JSON.stringify(current[key]) === JSON.stringify(record[key])));
  }).map((record) => ({ op: stored.has(record.id) ? "update-record" : "create-record", family, record }));
  for (const record of existing) {
    if (ours(record) && !derivedIds.has(record.id)) operations.push({ op: "remove-record", family, id: record.id });
  }
  return operations;
}

// Read the product's pages and their proven links back onto the Product territory as correctable "page"
// objects and "links to" relationships, reconciled into the canonical semantic model: a re-run (repo
// re-bind, the founder's Map product action, or a founder-confirmed source apply) refreshes changed pages
// in place, retracts pages the code no longer proves, and writes nothing when nothing page-relevant
// changed. A derivation yielding no pages leaves the existing map alone — an unreadable or empty scan
// must not wipe a previously proven map. Returns the derived pages and links (possibly empty).
export function syncProductPages({ ventureId, repository }, options = {}) {
  const scan = readRepositoryTruth(repository);
  const readExcerpt = (file, startLine, endLine) => captureSource(repository, file, startLine, endLine);
  const pages = deriveProductPages(scan, { readExcerpt });
  if (!pages.length) return { pages: [], links: [] };
  const links = deriveProductPageLinks(pages, { readExcerpt });
  const model = getSemanticModel(ventureId, options);
  const operations = [...syncFamilyOperations(model.objects, productPageObjects(pages), "objects", "repository-page"),
    ...syncFamilyOperations(model.relationships, productPageLinkRelationships(links), "relationships", "repository-link")];
  // A no-longer-derived page that other venture truth still references (a founder join, insight, or
  // work subject) keeps its object — removing it would orphan that truth. Its stale links still retract.
  const removedIds = new Set(operations.filter((operation) => operation.op === "remove-record").map((operation) => operation.id));
  const surviving = JSON.stringify({ ...model, relationships: model.relationships.filter((relationship) => !removedIds.has(relationship.id)) });
  const kept = operations.filter((operation) => operation.op !== "remove-record" || operation.family !== "objects" || !(surviving.includes(`"object:${operation.id}"`) || surviving.includes(`"object:${operation.id}#`)));
  if (kept.length) mutateSemanticModel({ ventureId, baseRevision: model.revision, operations: kept, actor: { authority: "agent", id: "page-map" } }, options);
  return { pages, links };
}

// Run the first-run sequence for a freshly bound venture: capture cited sources from the repository,
// record the correctable read-back as a working theory (rendered on the canvas), and append the concrete
// direction offers to the conversation. Idempotent-safe against a re-run only in that the caller decides
// when to invoke it (once, right after createVenture); this module performs the sequence it is given.
//
// Returns { theory, offers, grounded } on success, or { grounded: false } when the repository yields no
// citable source (a blind scan) — in which case first-run honestly does nothing rather than assert a
// read it cannot ground.
export function runFirstRun({ ventureId, repository, ventureName = null }, options = {}) {
  const scan = readRepositoryTruth(repository);

  // Capture real, digest-verified sources: the manifest and the primary context file, plus the first
  // shipped code file so the read is grounded in what the product actually is.
  const sources = [];
  const manifestSource = captureSource(repository, "package.json", 1, 40);
  if (manifestSource) sources.push(manifestSource);
  for (const contextFile of ["README.md", "docs/STATE.md"]) {
    const source = captureSource(repository, contextFile, 1, 20);
    if (source) { sources.push(source); break; }
  }
  const code = firstCodeFile(scan.files ?? []);
  if (code) {
    const source = captureSource(repository, code, 1, 24);
    if (source) sources.push(source);
  }

  const readBack = deriveReadBack(scan, sources, ventureName);
  if (!readBack) {
    // Blind repository: no citable source. Honest absence — no read-back, no fabricated offers.
    return { grounded: false, theory: null, offers: [] };
  }

  const architecture = getArchitecture(ventureId, options);
  const operations = readBack.subjects.map((subject) => ({
    op: "upsert-subject",
    id: subject.id,
    value: { id: subject.id, name: subject.name, statement: subject.statement },
  }));
  const anchors = readBack.subjects.map((subject) => ({
    subjectRef: `theory:${subject.id}`,
    sourceRefs: subject.anchor,
  }));

  const { theory } = recordWorkingTheory({
    ventureId,
    baseRevision: architecture.revision,
    intent: "Drover's first read of the connected product — correct anything and I'll re-ground it.",
    supersedes: null,
    operations,
    anchors,
    sources,
    proposedBy: { authority: "agent", id: "first-run" },
  }, options);

  // The direction offers land in the conversation as an agent message the founder picks from. Ordinary
  // language, concrete actions — not internal nouns, not a plan to approve.
  const offerLines = readBack.offers.map((offer, index) => `${index + 1}. ${offer}`).join("\n");
  const message = appendConversationMessage({
    ventureId,
    role: "agent",
    kind: "message",
    content: `I read the connected product and drew a first working theory on the canvas — what it does, who it may help, and what's still uncertain. Correct anything there and I'll re-ground it.\n\nA few concrete directions I can take from here — pick one and I'll route it to the right teammate:\n\n${offerLines}`,
    teammateRef: null,
  }, options);

  // Read the product's pages onto the Product territory. A page-mapping failure must not fail the
  // read-back — the working theory and offers still land; the page map is an addition the founder can
  // trigger by re-binding, not a gate on first run.
  let pages = [];
  try {
    ({ pages } = syncProductPages({ ventureId, repository }, options));
  } catch {
    // Honest degradation: an unmappable repository leaves the Product territory without a page map.
  }

  return { grounded: true, theory, offers: readBack.offers, messageId: message.id, pages };
}
