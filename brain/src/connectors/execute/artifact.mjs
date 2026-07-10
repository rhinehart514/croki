// Deployable-artifact execute connector — E3.3 (microproduct output).
//
// A go-to-market output is not always a message. The product's frontier is that
// an output can be a deployable MICROPRODUCT — a working artifact cut from the
// real product (a landing page, a scoped demo, a calculator, a one-off tool).
// This connector is the execute-family node that PREPARES such an artifact.
//
// It mirrors the local execute connector's discipline exactly: it stages the
// artifact and NEVER deploys, publishes, or pushes it anywhere on its own. It
// captures the artifact spec/files/target, marks it `staged: true` /
// `deployed: false`, and hands back a clear "awaiting founder approval to
// deploy" status. A founder gate upstream is what releases it — "vibe up to the
// gate, never past it." Deploying an artifact is touching the outside world, so
// it lives behind the same wall as a send.
//
// Like build.mjs (which creates an isolated worktree and STOPS before
// commit/push/deploy), this connector goes right up to the edge of the world
// and stops. Only items the gate marked `approved === true` are staged; every
// staged item is tagged outputKind "artifact" so the canvas and engine read it
// as a microproduct, not a message.

export const meta = {
  id: "artifact",
  name: "Deployable artifact",
  category: "execute",
  description:
    "Stages a deployable artifact (a microproduct cut from the product) for founder approval. It never deploys, publishes, or pushes anything.",
  envKey: null,
  stub: false,
  outputKind: "artifact",
  allowed: ["stage_artifact", "export_for_manual_deploy"],
  blocked: ["commit", "push", "pull_request", "merge", "deploy", "publish", "go_live"],
  approvalRequired: ["continue_from_gate"],
};

export function isOrdinaryInRepoChange(item) {
  return item?.effectBoundary === "reviewed_diff_only"
    || item?.artifactSpec?.inRepo === true
    || item?.artifactSpec?.target === "in-repo"
    || item?.kind === "change"
    || item?.kind === "patch"
    || Boolean(item?.repo && item?.path);
}

export async function run(node, upstream) {
  // Only founder-approved items are staged. Everything else is dropped, exactly
  // like the local execute connector — the gate is the release, not this node.
  const approved = upstream.filter((item) => item.approved === true);
  const target = node.config?.target || node.config?.deployTarget || "unset";
  const stagedAt = new Date().toISOString();

  const items = approved.map((item) => ({
    ...item,
    // The microproduct identity. "artifact" is the open output kind for a
    // deployable output (OUTPUT_KIND_HINTS in graph-operations.mjs).
    outputKind: "artifact",
    artifact: {
      // Whatever the upstream node produced as the artifact body — its spec,
      // its files, its scoped slice of the product. The connector captures it,
      // it does not invent it.
      spec: item.artifactSpec ?? item.spec ?? null,
      files: item.artifactFiles ?? item.files ?? null,
      target,
    },
    // The wall, made explicit on every item: prepared, never live.
    staged: true,
    deployed: false,
    live: false,
    ...(isOrdinaryInRepoChange(item)
      ? {
          executionStatus: "staged_for_review",
          deployStatus: "reviewed diff only — commit, push, pull request, merge, publish, and deploy remain blocked",
          effectBoundary: "reviewed_diff_only",
          externalEffectAuthorized: false,
        }
      : {
          executionStatus: "staged_for_deploy",
          deployStatus: "awaiting separate founder deploy confirmation",
        }),
    stagedAt,
  }));
  const ordinaryProductChanges = items.filter((item) => item.effectBoundary === "reviewed_diff_only").length;

  return {
    ok: true,
    items,
    meta: {
      staged: items.length,
      deployed: 0,
      ordinaryProductChanges,
      deployableArtifacts: items.length - ordinaryProductChanges,
      target,
      note: ordinaryProductChanges
        ? "Product changes were staged as reviewed local diffs. Nothing was committed, pushed, opened as a pull request, merged, published, or deployed."
        : "Artifacts were staged locally and are awaiting a separate founder deploy confirmation. Nothing was deployed or published.",
    },
  };
}
