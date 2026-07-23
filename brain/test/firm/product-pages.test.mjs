import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { createVenture } from "../../src/firm/venture-store.mjs";
import { readRepositoryTruth, readRepositoryExcerpt } from "../../src/firm/truth.mjs";
import { deriveProductPages, deriveProductPageLinks, productPageLinkRelationships, productPageObjects, syncProductPages } from "../../src/firm/first-run.mjs";
import { getSemanticModel, mutateSemanticModel } from "../../src/firm/semantic-model-store.mjs";

function directory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function boundReader(repository) {
  return (file, startLine, endLine) => {
    try {
      return readRepositoryExcerpt(repository, { file, startLine, endLine });
    } catch {
      return null;
    }
  };
}

// The real acme-saas sample: the finish-line case. The map must be the pages a user actually walks
// through, and only the pages the code proves.
const ACME = fileURLToPath(new URL("../../../samples/acme-saas", import.meta.url));

describe("product pages: map the pages a user walks through", () => {
  it("derives exactly the app-router pages acme-saas proves, each with a cited source", () => {
    const scan = readRepositoryTruth(ACME);
    const pages = deriveProductPages(scan, { readExcerpt: boundReader(ACME) });

    const routes = pages.map((page) => page.route).sort();
    assert.deepEqual(routes, ["/", "/pricing", "/settings", "/signup"], "did not map exactly the pages the code proves");

    const byRoute = new Map(pages.map((page) => [page.route, page]));
    // Names come from the code's own default-export identifier, not an invented word.
    assert.equal(byRoute.get("/").name, "Landing");
    assert.equal(byRoute.get("/pricing").name, "Pricing");
    assert.equal(byRoute.get("/signup").name, "Signup");
    assert.equal(byRoute.get("/settings").name, "Settings");

    // The summary is an honest read of what the page shows now — the visitor's own headline where one
    // exists, the code's leading intent comment otherwise.
    assert.match(byRoute.get("/").statement, /same page/i);
    assert.match(byRoute.get("/signup").statement, /Create your Acme workspace/i);
    assert.match(byRoute.get("/pricing").statement, /pricing/i);

    // Every page carries a real, digest-verified repository citation — cited, never asserted.
    for (const page of pages) {
      assert.match(page.sourceRef, /^repository:.+#L1-L\d+:[0-9a-f]{12}$/, `page ${page.route} has no digest-verified source`);
    }

    // invite and share are server actions, not pages — the map must not fabricate a page the code cannot
    // support.
    assert.ok(!pages.some((page) => /invite|share/i.test(page.route)), "fabricated a page from a server action");
  });

  it("shapes pages into tentative, source-bearing product-territory objects", () => {
    const scan = readRepositoryTruth(ACME);
    const objects = productPageObjects(deriveProductPages(scan, { readExcerpt: boundReader(ACME) }));
    assert.ok(objects.length >= 4);
    for (const object of objects) {
      assert.equal(object.type, "page");
      assert.equal(object.assertion, "tentative", "a page read must stay provisional until adopted");
      assert.equal(object.properties.territory, "product");
      assert.ok(object.provenance.sourceRef, "a page object must be source-bearing");
      assert.ok(object.properties.page.route, "a page object must keep its route");
    }
  });

  it("reads pages back onto the canonical model and refreshes them in place on re-run", () => {
    const options = { root: directory("drover-pages-store-") };
    const venture = createVenture({ name: "Acme", repository: ACME }, options);

    const first = syncProductPages({ ventureId: venture.id, repository: ACME }, options);
    assert.ok(first.pages.length >= 4);

    const afterFirst = getSemanticModel(venture.id, options);
    const pageObjects = afterFirst.objects.filter((object) => object.type === "page");
    assert.equal(pageObjects.length, first.pages.length, "pages did not reach the canonical model");
    // Agent-authored page reads are tentative and source-bearing, per the model's authorization rules.
    for (const object of pageObjects) {
      assert.equal(object.assertion, "tentative");
      assert.ok(object.provenance?.sourceRef);
    }

    // Re-binding refreshes the same page objects rather than duplicating them.
    syncProductPages({ ventureId: venture.id, repository: ACME }, options);
    const afterSecond = getSemanticModel(venture.id, options);
    assert.equal(
      afterSecond.objects.filter((object) => object.type === "page").length,
      pageObjects.length,
      "a re-run duplicated the page objects",
    );

    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("writes nothing on a re-run when nothing page-relevant changed", () => {
    const options = { root: directory("drover-pages-quiet-") };
    const venture = createVenture({ name: "Acme", repository: ACME }, options);

    syncProductPages({ ventureId: venture.id, repository: ACME }, options);
    const before = getSemanticModel(venture.id, options);
    syncProductPages({ ventureId: venture.id, repository: ACME }, options);
    const after = getSemanticModel(venture.id, options);

    // Zero semantic-store writes: an unchanged page must not bump the model revision or any record's
    // updatedAt — identical rewrites would make unrelated canvas nodes move.
    assert.equal(after.revision, before.revision, "an unchanged re-run advanced the model revision");
    assert.deepEqual(after.objects, before.objects, "an unchanged re-run rewrote page objects");
    assert.deepEqual(after.relationships, before.relationships, "an unchanged re-run rewrote link relationships");

    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("retracts a page the code no longer proves without rewriting the rest of the map", () => {
    const repository = directory("drover-pages-removal-repo-");
    fs.mkdirSync(path.join(repository, "src", "app", "pricing"), { recursive: true });
    fs.writeFileSync(path.join(repository, "src", "app", "page.tsx"), 'export default function HomePage() {\n  return <a href="/pricing">See pricing</a>;\n}\n');
    fs.writeFileSync(path.join(repository, "src", "app", "pricing", "page.tsx"), "export default function PricingPage() {\n  return <h1>Pricing</h1>;\n}\n");
    const options = { root: directory("drover-pages-removal-store-") };
    const venture = createVenture({ name: "Acme", repository }, options);

    syncProductPages({ ventureId: venture.id, repository }, options);
    const before = getSemanticModel(venture.id, options);
    assert.ok(before.objects.some((object) => object.id === "page-pricing"));
    assert.ok(before.relationships.some((relationship) => relationship.id === "page-link-home-pricing"));

    fs.rmSync(path.join(repository, "src", "app", "pricing"), { recursive: true, force: true });
    syncProductPages({ ventureId: venture.id, repository }, options);
    const after = getSemanticModel(venture.id, options);
    assert.equal(after.objects.some((object) => object.id === "page-pricing"), false, "a page the code no longer proves must leave the resting map");
    assert.equal(after.relationships.some((relationship) => relationship.id === "page-link-home-pricing"), false, "a link to a retracted page must retract with it");
    // The surviving page is untouched — no revision churn on an unrelated node.
    assert.deepEqual(after.objects.find((object) => object.id === "page-home"), before.objects.find((object) => object.id === "page-home"), "a removal rewrote an unrelated page");

    fs.rmSync(repository, { recursive: true, force: true });
    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("keeps a no-longer-derived page that founder truth still references, and never rewrites a founder-corrected page", () => {
    const repository = directory("drover-pages-founder-repo-");
    fs.mkdirSync(path.join(repository, "src", "app", "pricing"), { recursive: true });
    fs.writeFileSync(path.join(repository, "src", "app", "page.tsx"), 'export default function HomePage() {\n  return <a href="/pricing">See pricing</a>;\n}\n');
    fs.writeFileSync(path.join(repository, "src", "app", "pricing", "page.tsx"), "export default function PricingPage() {\n  return <h1>Pricing</h1>;\n}\n");
    const options = { root: directory("drover-pages-founder-store-") };
    const venture = createVenture({ name: "Acme", repository }, options);

    syncProductPages({ ventureId: venture.id, repository }, options);
    // The founder corrects the pricing page and attaches their own thinking to it.
    const model = getSemanticModel(venture.id, options);
    mutateSemanticModel({
      ventureId: venture.id, baseRevision: model.revision, actor: { authority: "founder", id: "founder" },
      operations: [
        { op: "update-record", family: "objects", id: "page-pricing", record: { name: "Plans", assertion: "founder-asserted" } },
        { op: "create-record", family: "objects", record: { id: "note-one", type: "open", name: "Price test", statement: "Try the annual plan first.", properties: {}, assertion: "founder-asserted", provenance: {} } },
        { op: "create-record", family: "relationships", record: { id: "note-one-about", fromRef: "object:note-one", toRef: "object:page-pricing", label: "is about", type: "founder-connection", properties: {}, assertion: "founder-asserted", sourceRefs: [] } },
      ],
    }, options);

    // A re-derivation must not clobber the founder's correction with the code-derived name.
    syncProductPages({ ventureId: venture.id, repository }, options);
    assert.equal(getSemanticModel(venture.id, options).objects.find((object) => object.id === "page-pricing").name, "Plans", "a re-derivation overwrote a founder correction");

    // Even when the code stops proving the page, the founder-held object and join survive; only the
    // adapter's own derived link retracts.
    fs.rmSync(path.join(repository, "src", "app", "pricing"), { recursive: true, force: true });
    syncProductPages({ ventureId: venture.id, repository }, options);
    const after = getSemanticModel(venture.id, options);
    assert.ok(after.objects.some((object) => object.id === "page-pricing"), "removed a page the founder made their own");
    assert.ok(after.relationships.some((relationship) => relationship.id === "note-one-about"), "lost the founder's join");
    assert.equal(after.relationships.some((relationship) => relationship.id === "page-link-home-pricing"), false, "kept a derived link the code no longer proves");

    fs.rmSync(repository, { recursive: true, force: true });
    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("maps nested and grouped routes and ignores non-page files", () => {
    const repository = directory("drover-pages-repo-");
    fs.mkdirSync(path.join(repository, "src", "app", "(marketing)", "about"), { recursive: true });
    fs.mkdirSync(path.join(repository, "src", "app", "docs", "[slug]"), { recursive: true });
    fs.writeFileSync(path.join(repository, "src", "app", "page.tsx"), "export default function HomePage() {\n  return <h1>Welcome home</h1>;\n}\n");
    fs.writeFileSync(path.join(repository, "src", "app", "(marketing)", "about", "page.tsx"), "// The about page tells the story.\nexport default function AboutPage() {\n  return null;\n}\n");
    fs.writeFileSync(path.join(repository, "src", "app", "docs", "[slug]", "page.tsx"), "export default function DocPage() {\n  return <h1>A doc</h1>;\n}\n");
    fs.writeFileSync(path.join(repository, "src", "app", "layout.tsx"), "export default function Layout() {\n  return null;\n}\n");

    const scan = readRepositoryTruth(repository);
    const pages = deriveProductPages(scan, { readExcerpt: boundReader(repository) });
    const routes = pages.map((page) => page.route).sort();
    // Route group "(marketing)" drops out of the path; the dynamic segment renders as ":slug"; layout.tsx
    // is not a page.
    assert.deepEqual(routes, ["/", "/about", "/docs/:slug"]);
    assert.equal(pages.find((page) => page.route === "/about").statement, "The about page tells the story.");

    fs.rmSync(repository, { recursive: true, force: true });
  });

  it("drops a page whose source cannot be captured rather than fabricating a citation", () => {
    const scan = { files: ["src/app/ghost/page.tsx"] };
    const pages = deriveProductPages(scan, { readExcerpt: () => null });
    assert.deepEqual(pages, []);
  });

  it("draws page-to-page links only where acme-saas proves them, and never a backward home edge", () => {
    const scan = readRepositoryTruth(ACME);
    const pages = deriveProductPages(scan, { readExcerpt: boundReader(ACME) });
    const links = deriveProductPageLinks(pages, { readExcerpt: boundReader(ACME) });

    const idByRoute = new Map(pages.map((page) => [page.route, page.id]));
    const walked = links.map((link) => `${link.fromId}->${link.toId}`).sort();
    // Landing links to signup and pricing; pricing links to signup. Settings' only link is back to the
    // site root — a return-home navigation, which the walk map does not draw. No other proven links exist.
    assert.deepEqual(walked, [
      `${idByRoute.get("/")}->${idByRoute.get("/pricing")}`,
      `${idByRoute.get("/")}->${idByRoute.get("/signup")}`,
      `${idByRoute.get("/pricing")}->${idByRoute.get("/signup")}`,
    ].sort(), "did not draw exactly the forward walk links the code proves");
    assert.ok(!links.some((link) => link.toId === idByRoute.get("/")), "drew a backward link to the home page");

    // Every link carries a real, digest-verified citation to the source page file it was read from.
    for (const link of links) {
      assert.match(link.sourceRef, /^repository:.+#L1-L\d+:[0-9a-f]{12}$/, `link ${link.id} has no digest-verified source`);
    }
  });

  it("drops a link whose target route has no mapped page rather than inventing a connection", () => {
    const pages = [
      { id: "page-home", route: "/", name: "Home", file: "src/app/page.tsx", statement: "", sourceRef: "repository:src/app/page.tsx#L1-L40:aaaaaaaaaaaa" },
      { id: "page-signup", route: "/signup", name: "Signup", file: "src/app/signup/page.tsx", statement: "", sourceRef: "repository:src/app/signup/page.tsx#L1-L40:bbbbbbbbbbbb" },
    ];
    // The home page links to /signup (mapped) and /docs (no page.tsx — not a mapped page).
    const excerpts = new Map([
      ["src/app/page.tsx", '<Link href="/signup">go</Link><Link href="/docs">docs</Link>'],
      ["src/app/signup/page.tsx", "no links here"],
    ]);
    const readExcerpt = (file) => ({ ref: `repository:${file}#L1-L1:cccccccccccc`, excerpt: excerpts.get(file) ?? "" });
    const links = deriveProductPageLinks(pages, { readExcerpt });

    assert.deepEqual(links.map((link) => link.toId), ["page-signup"], "invented a link to an unmapped route");
  });

  it("shapes proven links into tentative, source-bearing relationships", () => {
    const relationships = productPageLinkRelationships([
      { id: "page-link-home-signup", fromId: "page-home", toId: "page-signup", route: "/signup", sourceRef: "repository:src/app/page.tsx#L1-L40:dddddddddddd" },
    ]);
    const [relationship] = relationships;
    assert.equal(relationship.fromRef, "object:page-home");
    assert.equal(relationship.toRef, "object:page-signup");
    assert.equal(relationship.label, "links to");
    assert.equal(relationship.assertion, "tentative", "an agent-authored link must stay provisional until adopted");
    assert.ok(relationship.sourceRefs.length && relationship.provenance.sourceRef, "a link relationship must be source-bearing");
  });

  it("stores proven links as canonical relationships and refreshes them in place on re-run", () => {
    const options = { root: directory("drover-links-store-") };
    const venture = createVenture({ name: "Acme", repository: ACME }, options);

    const first = syncProductPages({ ventureId: venture.id, repository: ACME }, options);
    assert.equal(first.links.length, 3, "the three proven acme-saas walk links did not derive");

    const afterFirst = getSemanticModel(venture.id, options);
    const linkRelationships = afterFirst.relationships.filter((relationship) => relationship.type === "page-link");
    assert.equal(linkRelationships.length, 3, "proven links did not reach the canonical model");
    for (const relationship of linkRelationships) {
      assert.equal(relationship.assertion, "tentative");
      assert.ok((relationship.sourceRefs ?? []).length || relationship.provenance?.sourceRef, "a stored link must be source-bearing");
    }

    syncProductPages({ ventureId: venture.id, repository: ACME }, options);
    const afterSecond = getSemanticModel(venture.id, options);
    assert.equal(
      afterSecond.relationships.filter((relationship) => relationship.type === "page-link").length,
      linkRelationships.length,
      "a re-run duplicated the link relationships",
    );

    fs.rmSync(options.root, { recursive: true, force: true });
  });
});
