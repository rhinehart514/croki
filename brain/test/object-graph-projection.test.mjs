import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  productTruthStore,
  marketObjectStore,
  gtmPathStore,
  measurementContractStore,
} from "../src/gtm-store.mjs";
import { objectGraphForProject } from "../src/object-graph-projection.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "object-graph-projection-")) };
}

describe("object graph projection", () => {
  it("projects existing GTM records into a weak-labeled object graph with one highlighted path", () => {
    const options = freshRoot();
    const projectId = "drover";
    const truth = productTruthStore.create({
      projectId,
      statement: "Drover scans repositories for product evidence",
      evidence: [{ claim: "scan exists", source: "brain/src/scan.mjs:1", solidity: "observed" }],
      solidity: "observed",
    }, options);
    const buyer = marketObjectStore.create({
      projectId,
      kind: "buyer",
      statement: "Founders running more than one product",
      evidence: [{ claim: "researched buyer", source: "https://example.com", solidity: "researched" }],
      source: "research",
    }, options);
    const pathRecord = gtmPathStore.create({
      projectId,
      summary: "Reach multi-product founders with scan-backed GTM proof",
      restsOn: [{ type: "productTruth", id: truth.id }, { type: "marketObject", id: buyer.id }],
      bet: { buyer: "multi-product founders", channel: "founder communities", message: "use scan-backed proof" },
    }, options);
    const contract = measurementContractStore.create({
      projectId,
      pathId: pathRecord.id,
      outcomeKinds: ["reply"],
      sources: ["founder-entered"],
      joinKey: "email",
      successCriteria: "one reply",
    }, options);
    gtmPathStore.save({ ...pathRecord, measurementContractId: contract.id }, options);

    const { graph, recommendation } = objectGraphForProject(projectId, options);
    assert.ok(graph.nodes.some((node) => node.domain === "product"));
    assert.ok(graph.nodes.some((node) => node.domain === "market"));
    assert.ok(graph.nodes.some((node) => node.domain === "runs" && node.type === "path"));
    assert.ok(graph.edges.some((edge) => edge.type === "measured_by"));
    assert.equal(recommendation.highlighted.length, 1);
  });

  it("reports an honest empty recommendation when no records exist", () => {
    const { graph, recommendation } = objectGraphForProject("empty", freshRoot());
    assert.equal(graph.nodes.length, 0);
    assert.deepEqual(recommendation.highlighted, []);
    assert.match(recommendation.reason, /scan found no product truths/i);
  });
});
