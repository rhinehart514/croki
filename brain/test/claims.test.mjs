import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  addClaim,
  applySharedContextToGraph,
  claimTexts,
  listClaims,
  loadProject,
  removeClaim,
  updateClaim,
  updateSharedContext,
} from "../src/project-store.mjs";

describe("structured claims — first-class objects with a string[] projection", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-claims-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("structures a claim write and round-trips the object through durable storage", () => {
    updateSharedContext({
      claims: [{ text: "Grounded in your real product code.", provenance: "founder" }],
    }, options);
    const claims = listClaims(options);
    assert.equal(claims.length, 1);
    const [claim] = claims;
    assert.ok(claim.id.startsWith("claim-"));
    assert.equal(claim.text, "Grounded in your real product code.");
    assert.equal(claim.provenance, "founder");
    assert.equal(claim.version, 1);
    assert.ok(claim.createdAt);
    assert.ok(claim.updatedAt);
  });

  it("projects the structured claims down to a flat string[] every legacy reader expects", () => {
    updateSharedContext({
      claims: [{ text: "Reads your code." }, { text: "Stops at the gate." }],
    }, options);
    const project = loadProject(options);
    // product.claims stays a plain string[] — exactly what context injection consumes.
    assert.deepEqual(project.sharedContext.product.claims, ["Reads your code.", "Stops at the gate."]);
    assert.equal(project.sharedContext.product.claims.every((c) => typeof c === "string"), true);
    assert.deepEqual(claimTexts(project.sharedContext.claims), ["Reads your code.", "Stops at the gate."]);
    // The ctx-product node still receives strings, not objects.
    const graph = {
      nodes: [{ id: "ctx-product", category: "context", connector: "product", config: {} }],
    };
    const applied = applySharedContextToGraph(graph, project.sharedContext);
    assert.deepEqual(applied.nodes[0].config.claims, ["Reads your code.", "Stops at the gate."]);
  });

  it("accepts a legacy product.claims string[] write and structures it", () => {
    updateSharedContext({ product: { claims: ["Old flat claim."] } }, options);
    const claims = listClaims(options);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].text, "Old flat claim.");
    assert.equal(claims[0].provenance, "speculative"); // a bare string is an unproven guess
    assert.deepEqual(loadProject(options).sharedContext.product.claims, ["Old flat claim."]);
  });

  it("demotes an evidence-free derived claim to speculative, keeps a cited derived claim", () => {
    updateSharedContext({
      claims: [
        { text: "Claims to be derived but has no citation.", provenance: "derived" },
        { text: "Derived with real evidence.", provenance: "derived", evidence: [{ file: "src/scan.mjs", line: 42 }] },
        { text: "Founder assertion.", provenance: "founder" },
      ],
    }, options);
    const byText = Object.fromEntries(listClaims(options).map((c) => [c.text, c.provenance]));
    assert.equal(byText["Claims to be derived but has no citation."], "speculative");
    assert.equal(byText["Derived with real evidence."], "derived");
    assert.equal(byText["Founder assertion."], "founder");
  });

  it("adds, edits, and removes claims through the dedicated API, bumping version on a text edit", () => {
    const added = addClaim({ text: "First claim." }, options);
    const id = added.claim.id;
    assert.equal(added.claim.version, 1);

    const edited = updateClaim(id, { text: "First claim, refined." }, options);
    assert.equal(edited.claim.id, id, "id is stable across an edit");
    assert.equal(edited.claim.version, 2, "a text change bumps the version");
    assert.equal(edited.claim.createdAt, added.claim.createdAt, "createdAt lineage is preserved");

    const removed = removeClaim(id, options);
    assert.equal(removed.claims.length, 0);
    assert.deepEqual(loadProject(options).sharedContext.product.claims, []);
  });

  it("does not bump version or churn on an unchanged edit", () => {
    const added = addClaim({ text: "Stable claim." }, options);
    const again = updateClaim(added.claim.id, { provenance: "speculative" }, options);
    assert.equal(again.claim.version, 1);
    assert.equal(again.claim.updatedAt, added.claim.updatedAt);
  });
});
