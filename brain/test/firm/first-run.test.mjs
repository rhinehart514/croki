import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createVenture } from "../../src/firm/venture-store.mjs";
import { runFirstRun, deriveReadBack } from "../../src/firm/first-run.mjs";
import { buildArchitectureProjection } from "../../src/firm/architecture-projection.mjs";
import { getCurrentWorkingTheory } from "../../src/firm/architecture-proposals.mjs";
import { listConversation } from "../../src/firm/conversation.mjs";
import { readRepositoryExcerpt } from "../../src/firm/truth.mjs";

function directory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// A repository with a manifest, a README, and shipped code — the repo-backed first-run case.
function groundedRepo() {
  const repository = directory("drover-firstrun-repo-");
  fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({
    name: "taskly",
    description: "A small team task tracker.",
    dependencies: { next: "^14", "@segment/analytics-next": "^1" },
  }, null, 2));
  fs.writeFileSync(path.join(repository, "README.md"), "# Taskly\n\nTrack who's doing what across a small team.\n");
  fs.mkdirSync(path.join(repository, "src", "app", "signup"), { recursive: true });
  fs.mkdirSync(path.join(repository, "src", "app", "pricing"), { recursive: true });
  fs.writeFileSync(path.join(repository, "src", "app", "signup", "actions.ts"), "export async function signup() {\n  return 'signup_completed';\n}\n");
  fs.writeFileSync(path.join(repository, "src", "app", "pricing", "page.tsx"), "export default function Pricing() {\n  return null;\n}\n");
  return repository;
}

describe("first run: connect, read-back, offers", () => {
  it("draws a correctable read-back on the canvas with grounded and inferred claims", () => {
    const options = { root: directory("drover-firstrun-store-") };
    const repository = groundedRepo();
    const venture = createVenture({ name: "Taskly", repository }, options);

    const result = runFirstRun({ ventureId: venture.id, repository }, options);
    assert.equal(result.grounded, true);

    // The read-back is a working theory on the canvas projection, not an asserted architecture change.
    const projection = buildArchitectureProjection(venture.id, options);
    assert.ok(projection.workingTheory, "read-back did not project onto the canvas");
    const names = projection.workingTheory.subjects.map((subject) => subject.name);
    assert.ok(names.includes("What it does"), "read-back missing what-it-does");
    assert.ok(names.includes("Who it may help"), "read-back missing who-it-helps");
    assert.ok(names.includes("What's uncertain"), "read-back missing the uncertainty claim");

    // Every subject carries a real, digest-verified repository source — cited, never asserted.
    for (const subject of projection.workingTheory.subjects) {
      assert.ok(subject.sourceRefs.length > 0, `subject ${subject.name} has no concrete source`);
    }
    // The uncertainty is LABELED as inference for the founder, not stated as fact.
    const uncertain = projection.workingTheory.subjects.find((subject) => subject.name === "What's uncertain");
    assert.match(uncertain.statement, /uncertain|inference|correct/i);

    // The theory is provisional (correctable by dialogue), never founder-confirmed architecture.
    const theory = getCurrentWorkingTheory(venture.id, options);
    assert.equal(theory.status, "current");
    assert.equal(theory.proposedBy.authority, "agent");
    // The durable architecture stays empty — a read-back changes no confirmed truth.
    assert.equal(projection.document.elements.length, 0);

    fs.rmSync(options.root, { recursive: true, force: true });
    fs.rmSync(repository, { recursive: true, force: true });
  });

  it("offers two to three concrete repo-derived directions in the conversation", () => {
    const options = { root: directory("drover-firstrun-store-") };
    const repository = groundedRepo();
    const venture = createVenture({ name: "Taskly", repository }, options);

    const result = runFirstRun({ ventureId: venture.id, repository }, options);
    assert.ok(result.offers.length >= 2 && result.offers.length <= 3, `expected 2-3 offers, got ${result.offers.length}`);

    // The offers speak ordinary language grounded in the scanned product.
    const joined = result.offers.join(" ");
    assert.match(joined, /onboarding|pricing|buyer|contact|reach/i);
    // No internal nouns leak into the offers.
    assert.doesNotMatch(joined, /\bbet\b|\bmotion\b|\bfork\b|\bstaged-/i);

    // The offers land in the conversation as an agent message the founder picks from.
    const conversation = listConversation(venture.id, options);
    const offerMessage = conversation.find((message) => message.id === result.messageId);
    assert.ok(offerMessage, "offer message did not reach the conversation");
    assert.equal(offerMessage.role, "agent");
    for (const offer of result.offers) {
      assert.ok(offerMessage.content.includes(offer), "an offer was not surfaced in the conversation");
    }

    fs.rmSync(options.root, { recursive: true, force: true });
    fs.rmSync(repository, { recursive: true, force: true });
  });

  it("stays honestly blind when the repository yields no citable source", () => {
    const options = { root: directory("drover-firstrun-store-") };
    const repository = directory("drover-firstrun-blind-");
    // A directory with nothing readable: no manifest, no README, no code.
    const venture = createVenture({ name: "Empty", repository }, options);

    const result = runFirstRun({ ventureId: venture.id, repository }, options);
    assert.equal(result.grounded, false);
    assert.equal(result.theory, null);
    assert.deepEqual(result.offers, []);

    // No read-back was asserted onto the canvas.
    const projection = buildArchitectureProjection(venture.id, options);
    assert.equal(projection.workingTheory, null);
    // No offer message was faked into the conversation.
    assert.equal(listConversation(venture.id, options).length, 0);

    fs.rmSync(options.root, { recursive: true, force: true });
    fs.rmSync(repository, { recursive: true, force: true });
  });

  // A repository whose package name is an internal compatibility seam ("gtm-ide") — the exact leak the
  // prior attempt shipped. The founder-given venture name must stand in; the seam slug must never reach
  // any rendered read-back subject, offer, or conversation line.
  function seamNamedRepo(packageName) {
    const repository = directory("drover-firstrun-seam-");
    fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({
      name: packageName,
      description: "The operating system for one-person holding companies.",
      dependencies: { next: "^14" },
    }, null, 2));
    fs.writeFileSync(path.join(repository, "README.md"), "# Product\n\nWhat it is.\n");
    fs.mkdirSync(path.join(repository, "src"), { recursive: true });
    fs.writeFileSync(path.join(repository, "src", "index.ts"), "export const x = 1;\n");
    return repository;
  }

  // Every internal identifier the six-noun contract bars from founder-facing copy (§0), plus the seam
  // slug forms a manifest name can take.
  const FOUNDER_FORBIDDEN = /\b(?:gtm-ide|bet|bets|motion|fork|forks|forked|outcome|outcomes|stage|staged|channel|drifting)\b|staged-\d/i;

  it("never renders an internal seam slug as the product name across canvas and conversation", () => {
    const options = { root: directory("drover-firstrun-store-") };
    const repository = seamNamedRepo("gtm-ide");
    const venture = createVenture({ name: "P7 Verify", repository }, options);

    const result = runFirstRun({ ventureId: venture.id, repository, ventureName: venture.name }, options);
    assert.equal(result.grounded, true);

    // The founder-given venture name stands in for the seam slug in the read-back subjects.
    const projection = buildArchitectureProjection(venture.id, options);
    for (const subject of projection.workingTheory.subjects) {
      assert.doesNotMatch(subject.statement, FOUNDER_FORBIDDEN, `subject "${subject.name}" leaked an internal identifier: ${subject.statement}`);
      assert.ok(subject.statement.includes("P7 Verify"), `subject "${subject.name}" did not use the founder-given venture name`);
    }
    // The offers and the conversation message carry the venture name, never the seam slug.
    for (const offer of result.offers) {
      assert.doesNotMatch(offer, FOUNDER_FORBIDDEN, `offer leaked an internal identifier: ${offer}`);
    }
    const conversation = listConversation(venture.id, options);
    const offerMessage = conversation.find((message) => message.id === result.messageId);
    assert.doesNotMatch(offerMessage.content, FOUNDER_FORBIDDEN, "conversation offer message leaked an internal identifier");

    fs.rmSync(options.root, { recursive: true, force: true });
    fs.rmSync(repository, { recursive: true, force: true });
  });

  it("prefers the founder-given venture name over an ugly kebab package slug", () => {
    const options = { root: directory("drover-firstrun-store-") };
    const repository = seamNamedRepo("acme-saas");
    const venture = createVenture({ name: "Acme", repository }, options);

    const result = runFirstRun({ ventureId: venture.id, repository, ventureName: venture.name }, options);
    const projection = buildArchitectureProjection(venture.id, options);
    const whatItDoes = projection.workingTheory.subjects.find((subject) => subject.name === "What it does");
    assert.ok(whatItDoes.statement.includes("Acme"), "did not use the founder-given venture name over the slug");
    assert.doesNotMatch(whatItDoes.statement, /acme-saas/, "rendered the raw package slug");

    // A description ending in a period must not produce a doubled period when a sentence is concatenated.
    const whoItHelps = projection.workingTheory.subjects.find((subject) => subject.name === "Who it may help");
    assert.doesNotMatch(whoItHelps.statement, /\.\.\s/, "produced a doubled period from concatenation");

    fs.rmSync(options.root, { recursive: true, force: true });
    fs.rmSync(repository, { recursive: true, force: true });
  });

  it("keeps a clean human package name when it is not a slug or seam", () => {
    // "taskly" is a bare human word, not a kebab slug — it stays as the product name.
    const scan = { manifest: { name: "taskly", description: "A tracker.", dependencies: [] }, files: ["package.json"] };
    const source = { ref: "repo:package.json#1-5" };
    const readBack = deriveReadBack(scan, [source], "Taskly Venture");
    const whatItDoes = readBack.subjects.find((subject) => subject.name === "What it does");
    assert.ok(whatItDoes.statement.startsWith("taskly is:"), "dropped a valid human package name");
  });

  it("deriveReadBack refuses to fabricate an anchor when there are no sources", () => {
    const scan = { manifest: { name: "x", description: "y", dependencies: [] }, files: [] };
    assert.equal(deriveReadBack(scan, []), null);
  });

  it("grounds subjects only in captured, digest-verified sources", () => {
    const repository = groundedRepo();
    const source = readRepositoryExcerpt(repository, { file: "package.json", startLine: 1, endLine: 5 });
    const scan = {
      manifest: { name: "taskly", description: "A small team task tracker.", dependencies: ["next"] },
      files: ["package.json", "src/app/signup/actions.ts"],
    };
    const readBack = deriveReadBack(scan, [source]);
    assert.ok(readBack.subjects.every((subject) => subject.anchor.includes(source.ref)));
    fs.rmSync(repository, { recursive: true, force: true });
  });
});
