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
  runStore,
  resultStore,
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

  it("projects compiled runs, inline gates, staged items, and founder-entered outcomes", () => {
    const options = freshRoot();
    const projectId = "drover";
    const pathRecord = gtmPathStore.create({
      projectId,
      summary: "Send proof-backed outreach to founders",
      restsOn: [],
      bet: { channel: "founder communities" },
    }, options);
    const run = runStore.create({
      projectId,
      pathId: pathRecord.id,
      gateState: { status: "pending" },
      gateBindings: [{ gateNodeId: "gate-send", protects: "send_emails", requiredApproval: "founder", reviewPayload: "copy" }],
      items: [{ kind: "email", subject: "Proof-backed GTM", body: "Hello", protects: "send_emails", reviewPayload: "copy", joinKey: "join-1" }],
      status: "staged",
    }, options);
    resultStore.create({
      projectId,
      runId: run.id,
      pathId: pathRecord.id,
      joinKey: "join-1",
      outcomeKind: "reply",
      source: "founder-entered",
      value: "interested",
    }, options);

    const { graph } = objectGraphForProject(projectId, options);
    const runNode = graph.nodes.find((node) => node.payload?.runId === run.id && node.type === "run");
    const gateNode = graph.nodes.find((node) => node.type === "gate" && node.payload?.protects === "send_emails");
    const itemNode = graph.nodes.find((node) => node.payload?.joinKey === "join-1" && node.domain === "assets");
    const outcomeNode = graph.nodes.find((node) => node.maturity === "outcome" && node.type === "reply");

    assert.ok(runNode, "the run ledger projects as a Runs.run card");
    assert.ok(gateNode, "the existing gate primitive projects as an inline gate card");
    assert.ok(itemNode, "staged review items project as action/assets cards");
    assert.ok(outcomeNode, "founder-entered outcomes project as truth cards");
    assert.ok(graph.edges.some((edge) => edge.source === `obj-${run.id}` && edge.target === gateNode.id && edge.type === "produced"));
    assert.ok(graph.edges.some((edge) => edge.source === gateNode.id && edge.target === itemNode.id && edge.type === "produced"));
    assert.ok(graph.edges.some((edge) => edge.source === `obj-${run.id}` && edge.target === outcomeNode.id && edge.type === "produced"));
  });
});
