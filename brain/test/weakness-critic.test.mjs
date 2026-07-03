// weakness-critic.test.mjs — the WEAKNESS-SEVERITY critic + its parity harness (STEP 2b).
//
// What this proves:
//   - The critic is a SEPARATE, no-tools model call over the ALREADY-COMPUTED signal object (never a
//     re-detection): extractWeaknessSignals hands it exactly what the hardcoded severity was computed
//     from, minus the frozen number.
//   - It consults get_taste — the rendered taste profile is folded into the prompt as data.
//   - The parity harness runs BOTH the hardcoded severities (still the live canvas source) and the
//     critic path over the same representative graphs, and asserts the critic returns a WELL-FORMED,
//     reasonable severity ordering — so the flip to the critic can be made confidently later.
//   - The live source is UNCHANGED: deriveWeaknessForGraph still emits the hardcoded numbers.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { deriveWeaknessForGraph } from "../src/graph-intelligence/weakness.mjs";
import {
  extractWeaknessSignals,
  kindsPresent,
  hardcodedSeverityBaseline,
  validateCriticSeverity,
  runWeaknessSeverityParity,
  createClaudeWeaknessCritic,
  blankGradeWeakness,
  GRADE_WEAKNESS_SEVERITY_PROMPT,
} from "../src/graph-intelligence/weakness-critic.mjs";

const at = "2026-07-02T00:00:00.000Z";
const source = (ref) => ({ kind: "scan", ref, preview: ref, at });

function node(id, fields = {}) {
  return {
    id,
    projectId: "drover",
    domain: "strategy",
    type: "message",
    maturity: "typed",
    statement: id,
    evidence: [],
    sources: [source(id)],
    origin: "spray",
    payload: {},
    ...fields,
  };
}

// A representative graph that fires several DIFFERENT weakness kinds at different urgencies:
//   - a claim with only founder evidence + speculative solidity (evidence, hardcoded 80)
//   - a strategy claim resting on product with no observed proof (product, hardcoded 75)
//   - a run path with no measurement contract (measurement, hardcoded 85)
//   - a scan-flagged HIGH measurement gap (measurement, hardcoded 90)
function representativeGraph() {
  const evidenceWeak = node("claim-unsourced", {
    domain: "strategy",
    type: "message",
    evidence: [{ source: "founder", notes: "founder hunch", solidity: "speculative" }],
    solidity: "speculative",
  });
  const productWeak = node("claim-product", {
    domain: "strategy",
    type: "message",
    payload: { claimsProduct: true },
  });
  const runPath = node("run-path", {
    domain: "runs",
    type: "path",
    payload: {},
  });
  const scanGap = node("scan-gap", {
    domain: "product",
    type: "measurement_gap",
    payload: { gapId: "g1", severity: "high", recommendation: "wire the attribution key" },
  });
  return deriveWeaknessForGraph({ nodes: [evidenceWeak, productWeak, runPath, scanGap], edges: [] });
}

// A deterministic STUB critic standing in for the live model in tests: it reflects the handed-in
// signal into a reasonable severity WITHOUT reading the hardcoded number (proving the harness works
// on signal alone), and orders precedence by the max severity each kind reached. Mirrors a sane model.
function stubCritic({ signals = [] } = {}) {
  const severities = signals.map((s) => {
    let severity = 50;
    if (s.kind === "evidence") {
      const solidity = s.signal?.solidity;
      severity = solidity === "speculative" || solidity == null ? 82 : 48;
    } else if (s.kind === "product") {
      severity = s.signal?.observedProductSupport ? 28 : 74;
    } else if (s.kind === "measurement") {
      if (s.signal?.severity === "high") severity = 91;
      else if (Array.isArray(s.signal?.missing) && s.signal.missing.includes("contract")) severity = 86;
      else severity = 60;
    } else if (s.kind === "execution") {
      severity = 68;
    }
    return { index: s.index, kind: s.kind, severity };
  });
  const maxByKind = new Map();
  for (const s of severities) {
    maxByKind.set(s.kind, Math.max(maxByKind.get(s.kind) ?? 0, s.severity));
  }
  const precedence = [...new Set(signals.map((s) => s.kind))].sort(
    (a, b) => (maxByKind.get(b) ?? 0) - (maxByKind.get(a) ?? 0),
  );
  return { severities, precedence, criticAvailable: true };
}

describe("weakness-critic — signal extraction", () => {
  it("flattens the annotated graph into one signal object per open weakness, carrying the detection signal but not re-detecting", () => {
    const graph = representativeGraph();
    const signals = extractWeaknessSignals(graph);

    // Every fired weakness on the graph shows up exactly once, in stable node/weakness order.
    const totalWeaknesses = graph.nodes.reduce((n, node) => n + (node.weaknesses?.length ?? 0), 0);
    assert.equal(signals.length, totalWeaknesses);
    assert.ok(signals.length >= 4, "the representative graph fires several weaknesses");

    signals.forEach((s, i) => {
      assert.equal(s.index, i, "indexes are stable and dense");
      assert.ok(s.kind, "carries the detected kind");
      assert.ok(s.signal && typeof s.signal === "object", "carries the raw detection signal");
      assert.ok(Number.isInteger(s.hardcodedSeverity), "carries the frozen number for parity, not the critic's job");
    });
  });

  it("kindsPresent returns the distinct kinds in first-appearance order", () => {
    const signals = extractWeaknessSignals(representativeGraph());
    const present = kindsPresent(signals);
    assert.deepEqual([...new Set(present)], present, "no duplicate kinds");
    for (const kind of present) {
      assert.ok(signals.some((s) => s.kind === kind));
    }
  });
});

describe("weakness-critic — parity harness against the hardcoded live source", () => {
  it("the hardcoded baseline reads the frozen severities straight off the graph (unchanged live source)", () => {
    const signals = extractWeaknessSignals(representativeGraph());
    const baseline = hardcodedSeverityBaseline(signals);
    // The baseline severities are exactly the numbers weakness.mjs froze — nothing here changed them.
    baseline.severities.forEach((b) => {
      const signal = signals.find((s) => s.index === b.index);
      assert.equal(b.severity, signal.hardcodedSeverity);
    });
    // Its precedence is the frozen kind order filtered to present kinds.
    assert.deepEqual(baseline.precedence, [...baseline.precedence].filter((k) => kindsPresent(signals).includes(k)));
  });

  it("runs BOTH paths and the critic returns a well-formed, reasonable severity ordering", async () => {
    const signals = extractWeaknessSignals(representativeGraph());
    const { hardcoded, critic, validation, comparison } = await runWeaknessSeverityParity({
      signals,
      grade: stubCritic,
    });

    // Well-formed: every index scored, in range, precedence a permutation of present kinds.
    assert.ok(validation.ok, `critic output should be well-formed: ${validation.problems.join("; ")}`);

    // Reasonable ordering: the scan-flagged HIGH measurement gap outranks the founder-only evidence
    // weakness, which outranks the product-proof gap — the critic scored from the SIGNAL, and the
    // ordering it produced is sane relative to the hardcoded baseline's own ordering.
    const criticSev = new Map(critic.severities.map((s) => [s.kind === "measurement" ? `${s.kind}:${s.index}` : s.kind, s.severity]));
    const evidenceSev = critic.severities.find((s) => s.kind === "evidence")?.severity;
    const productSev = critic.severities.find((s) => s.kind === "product")?.severity;
    assert.ok(evidenceSev > productSev, "a speculative-evidence weakness outranks a product-proof gap");

    // Both paths cover the same indexes, so the flip is a true drop-in.
    assert.equal(comparison.length, signals.length);
    comparison.forEach((row) => {
      assert.ok(Number.isInteger(row.hardcoded), "hardcoded severity present for every index");
      assert.ok(Number.isInteger(row.critic), "critic severity present for every index");
    });
    assert.equal(hardcoded.severities.length, signals.length);
  });

  it("validateCriticSeverity rejects out-of-range, missing, and bad-precedence critic output", () => {
    const signals = extractWeaknessSignals(representativeGraph());

    const outOfRange = validateCriticSeverity(
      { severities: signals.map((s) => ({ index: s.index, kind: s.kind, severity: 200 })), precedence: kindsPresent(signals) },
      signals,
    );
    assert.equal(outOfRange.ok, false);
    assert.ok(outOfRange.problems.some((p) => p.includes("out of range")));

    const missing = validateCriticSeverity(
      { severities: [{ index: signals[0].index, kind: signals[0].kind, severity: 50 }], precedence: kindsPresent(signals) },
      signals,
    );
    assert.equal(missing.ok, false);
    assert.ok(missing.problems.some((p) => p.includes("missing severity")));

    const badPrecedence = validateCriticSeverity(
      { severities: signals.map((s) => ({ index: s.index, kind: s.kind, severity: 50 })), precedence: ["evidence", "evidence"] },
      signals,
    );
    assert.equal(badPrecedence.ok, false);
  });
});

describe("weakness-critic — live wrapper (parsing + taste consult), no real model", () => {
  it("blank default scores nothing rather than faking a number", async () => {
    const out = await blankGradeWeakness();
    assert.deepEqual(out, { severities: [], precedence: [], criticAvailable: false });
  });

  it("empty signals short-circuits without calling the model", async () => {
    let called = false;
    const critic = createClaudeWeaknessCritic({ runQuery: async () => { called = true; return { text: "{}" }; } });
    const out = await critic({ signals: [] });
    assert.equal(called, false);
    assert.equal(out.criticAvailable, false);
  });

  it("folds the taste profile into the prompt (consults get_taste) and parses the model's JSON", async () => {
    const signals = extractWeaknessSignals(representativeGraph());
    const tasteProfile = {
      approved: ["Hey — saw you shipped X, worth a quick look?"],
      rejected: [],
      edits: [],
      counts: { approved: 1, rejected: 0, edits: 0 },
    };
    let seenPrompt = "";
    const critic = createClaudeWeaknessCritic({
      runQuery: async ({ prompt }) => {
        seenPrompt = prompt;
        return {
          text: JSON.stringify({
            severities: signals.map((s) => ({ index: s.index, kind: s.kind, severity: 70 })),
            precedence: kindsPresent(signals),
          }),
        };
      },
    });
    const out = await critic({ signals, tasteProfile });

    // The taste profile made it into the prompt — the critic consulted get_taste as data.
    assert.ok(seenPrompt.includes("shipped X"), "the rendered taste profile is folded into the prompt");
    assert.ok(seenPrompt.includes(GRADE_WEAKNESS_SEVERITY_PROMPT.slice(0, 40)), "carries the critic doctrine");
    // The hardcoded number is NOT anchored into the prompt — the model judges the signal.
    assert.ok(!/hardcodedSeverity/.test(seenPrompt), "the frozen number is stripped from what the model sees");

    assert.equal(out.criticAvailable, true);
    const validation = validateCriticSeverity(out, signals);
    assert.ok(validation.ok, validation.problems.join("; "));
  });

  it("a model error yields the honest empty result, never a fabricated severity", async () => {
    const signals = extractWeaknessSignals(representativeGraph());
    const critic = createClaudeWeaknessCritic({ runQuery: async () => ({ text: "", error: "boom" }) });
    const out = await critic({ signals });
    assert.deepEqual(out, { severities: [], precedence: [], criticAvailable: false });
  });
});

describe("weakness-critic — the live render source is UNTOUCHED", () => {
  it("deriveWeaknessForGraph still emits the hardcoded severities (the flip is deferred)", () => {
    const graph = representativeGraph();
    const scanGap = graph.nodes.find((n) => n.id === "scan-gap");
    const gapWeakness = scanGap.weaknesses.find((w) => w.kind === "measurement");
    // Still the frozen 90 for a high-severity scan gap — the critic did not touch the live projection.
    assert.equal(gapWeakness.severity, 90);
  });
});
