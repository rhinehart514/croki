// first-run.mjs — bounded repository grounding and code-proven Product-page derivation.
//
// Binding a repository prepares source-backed context without inserting an unsolicited strategy exercise,
// Canvas theory, participant, or prompt into the founder's first coding Thread. The founder enters through
// ordinary native Work. Code-proven Product pages may still be derived silently so Canvas has useful context
// if and when the founder opens it.

import { readRepositoryTruth, readRepositoryExcerpt } from "./truth.mjs";
import { getSemanticModel, mutateSemanticModel } from "./semantic-model-store.mjs";

// A digest-verified repository source. Returns null when the file is absent.
function captureSource(repository, file, startLine, endLine) {
  try {
    return readRepositoryExcerpt(repository, { file, startLine, endLine });
  } catch {
    return null;
  }
}

// The first readable shipped code file, used only to establish that the repository is groundable.
function firstCodeFile(files) {
  return files.find((file) => /\.(m?[jt]sx?|py|rb|go|rs)$/.test(file) && !/\.(test|spec)\./.test(file)) ?? null;
}

// Canvas can project the product itself as the pages a user walks through. The functions below read a
// Next.js app-router repository back into
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
      file: typeof source.path === "string" && source.path.trim() ? source.path.trim() : file,
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

// Ground a freshly bound project without adding conversation or strategy work. A readable repository may
// populate only the source-backed page projection. Blind repositories stay honestly empty.
export function runFirstRun({ ventureId, repository }, options = {}) {
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

  if (!sources.length) return { grounded: false, theory: null, offers: [], pages: [] };

  // A page-mapping failure never fails project creation or manufactures a replacement interpretation.
  let pages = [];
  try {
    ({ pages } = syncProductPages({ ventureId, repository }, options));
  } catch {
    // Honest degradation: an unmappable repository leaves the Product territory without a page map.
  }

  return { grounded: true, theory: null, offers: [], pages };
}
