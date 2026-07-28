import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSupportedStagedArtifactContent,
  projectLegacyRelationshipMap,
  STAGED_ARTIFACT_CONTENT_SCHEMA,
} from "../../src/firm/staged-artifact-content.mjs";

describe("staged artifact content contract", () => {
  it("accepts only explicit founder-facing material shapes", () => {
    assert.equal(isSupportedStagedArtifactContent("## Repository notes"), true);
    assert.equal(isSupportedStagedArtifactContent({ kind: "document", format: "markdown", content: "## Repository notes" }), true);
    assert.equal(isSupportedStagedArtifactContent({ kind: "diff", diff: "diff --git a/a b/a" }), true);
    assert.equal(isSupportedStagedArtifactContent({ kind: "project-map", layers: [] }), false);
    assert.equal(isSupportedStagedArtifactContent({ summary: "arbitrary object" }), false);
    assert.equal(
      STAGED_ARTIFACT_CONTENT_SCHEMA.anyOf.some((variant) => Object.keys(variant).length === 0),
      false,
      "the tool schema has no arbitrary-object escape hatch",
    );
  });

  it("projects a stored project map into the existing provisional Canvas shape without inventing edges", () => {
    const stored = {
      kind: "project-map",
      summary: "A coding client with a coordinating server.",
      layers: [
        {
          layer: "Clients",
          nodes: [
            { name: "apps/web", role: "React client", source: "AGENTS.md#L19" },
            { name: "apps/desktop", role: "Electron shell", source: "package.json" },
          ],
        },
        {
          layer: "Server",
          nodes: [{ name: "apps/server", role: "Coordinator", source: "docs/architecture.md#L1" }],
        },
      ],
    };

    const projected = projectLegacyRelationshipMap(stored, { artifactId: "map-one", title: "Project map" });
    assert.equal(projected.kind, "model-view");
    assert.equal(projected.purpose, "product-gtm-local-model");
    assert.equal(projected.branchRef, "", "a legacy projection does not pretend an adoptable branch exists");
    assert.deepEqual(projected.nodes.map((node) => node.label), ["apps/web", "apps/desktop", "apps/server"]);
    assert.deepEqual(projected.nodes.map((node) => node.state), ["provisional", "provisional", "provisional"]);
    assert.deepEqual(projected.edges, [], "layer order alone is not evidence of a dependency");
    assert.deepEqual(stored.layers[0].nodes[0], { name: "apps/web", role: "React client", source: "AGENTS.md#L19" });
  });
});
