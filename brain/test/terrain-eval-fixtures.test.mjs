import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { scanRepo } from "../src/scan.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SAMPLE = path.join(ROOT, "samples/acme-saas");
const FIXTURES = path.join(import.meta.dirname, "fixtures/terrain");

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

function resolveSourceLine(ref) {
  if (ref?.type !== "source-line") return true;
  const match = String(ref.id).match(/^(.+):(\d+)$/);
  if (!match) return false;
  const file = path.resolve(SAMPLE, match[1]);
  if (!file.startsWith(`${SAMPLE}${path.sep}`) || !fs.existsSync(file)) return false;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  return Number(match[2]) > 0 && Number(match[2]) <= lines.length && lines[Number(match[2]) - 1].trim().length > 0;
}

function everyRef(value, visit) {
  if (Array.isArray(value)) return value.every((item) => everyRef(item, visit));
  if (!value || typeof value !== "object") return true;
  if (typeof value.type === "string" && typeof value.id === "string" && !visit(value)) return false;
  return Object.values(value).every((item) => everyRef(item, visit));
}

describe("Gate A terrain fixtures", () => {
  it("provides every required deterministic terrain-read case", () => {
    const data = fixture("terrain-read-cases.json");
    const ids = new Set(data.cases.map((item) => item.id));
    assert.deepEqual(
      [...ids].sort(),
      [
        "empty-response",
        "fake-citation",
        "malformed-response",
        "outcome-changed-read",
        "provider-error",
        "speculative-opening",
        "tension-with-counterevidence",
        "valid-derived-opening",
      ],
    );
    assert.equal(data.disagreement.positions.length, 2);
    assert.notEqual(data.disagreement.positions[0].position, data.disagreement.positions[1].position);
    for (const position of data.disagreement.positions) {
      assert.ok(position.evidenceRefs.length > 0);
      assert.ok(position.uncertainty);
      assert.ok(position.recommendation);
      assert.ok(position.falsifier);
    }
  });

  it("keeps all real sample citations resolvable and isolates the deliberate fake", () => {
    const view = fixture("terrain-view.json");
    const cases = fixture("terrain-read-cases.json");
    assert.equal(everyRef(view, resolveSourceLine), true, "the deterministic terrain view contains an invalid source receipt");

    for (const item of cases.cases) {
      if (item.id === "fake-citation") {
        assert.equal(everyRef(item.response, resolveSourceLine), false, "the fake-citation case must remain fake");
      } else {
        assert.equal(everyRef(item.response, resolveSourceLine), true, `${item.id} contains an accidental invalid source receipt`);
      }
    }
    assert.equal(everyRef(cases.disagreement, resolveSourceLine), true);
  });

  it("defines a complete deterministic TerrainView without requiring hypotheses", () => {
    const view = fixture("terrain-view.json");
    assert.equal(view.schemaVersion, 1);
    assert.equal(view.projectId, "sample-acme");
    assert.equal(view.state.kind, "ready");
    assert.equal(view.hypotheses.length, 0);
    assert.ok(view.product.truths.length >= 3);
    for (const key of ["questions", "moves", "outcomes", "implications", "crew", "relationships"]) {
      assert.ok(Array.isArray(view[key]), `${key} must remain an array in the deterministic projection`);
    }
    assert.ok(view.geometry && typeof view.geometry === "object");
  });

  it("keeps the dense fixture useful for isolation, wall, outcome, and stale-read checks", () => {
    const dense = fixture("dense-operation.json");
    assert.equal(dense.products.length, 2);
    assert.ok(new Set(dense.pipelines.map((item) => item.shape.join(","))).size >= 3, "pipeline shapes must not collapse to one skeleton");
    assert.equal(dense.pendingGates.length, 2);
    assert.deepEqual(new Set(dense.outcomes.map((item) => item.kind)), new Set(["positive", "negative", "unmeasured", "signal"]));
    assert.ok(dense.outcomes.some((item) => item.pipelineId === null), "the dense fixture needs an unattributed signal");
    assert.ok(dense.terrain.some((item) => item.stale === true));
  });
});

describe("bundled sample terrain evidence", () => {
  it("supports the win event and proves the attribution gap", () => {
    const report = scanRepo(SAMPLE, { winEvent: "signup_completed" });
    assert.equal(report.winEvent.found, true);
    assert.equal(report.attribution.captured, true);
    assert.ok(report.gaps.some((gap) => gap.id === "attribution-not-carried"));
    assert.ok(report.winEvent.citations.some((citation) => citation.file === "src/app/signup/actions.ts"));
  });

  it("contains public synthetic invitation and share behavior for a product-shaped opening", () => {
    const invite = fs.readFileSync(path.join(SAMPLE, "src/app/w/invite/actions.ts"), "utf8");
    const share = fs.readFileSync(path.join(SAMPLE, "src/app/w/share/actions.ts"), "utf8");
    assert.match(invite, /invite_sent/);
    assert.match(share, /project_brief_shared/);
    assert.match(share, /project_brief_viewed/);
    assert.match(share, /read-only/);
    assert.doesNotMatch(share, /conversion_rate|testimonial|customer(Name|Id)|revenue\s*[:=]/i, "the public sample must not invent market proof");
  });
});
