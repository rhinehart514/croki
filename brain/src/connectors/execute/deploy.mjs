// Microproduct deploy execute connector — the WALL GRADUATING, never the wall removed.
//
// `artifact.mjs` PREPARES a deployable microproduct and stops at the edge of the world
// (`staged: true`, `deployed: false`). This connector is the next leg: it actually SHIPS
// that microproduct — a git push / deploy hook (BYO, the primary path) or a hosted Vercel
// deploy (the fallback). Shipping touches the outside world, so it is the single most
// dangerous execute node in the system, and it is built so it can only ever fire as a
// founder-approved act.
//
// THE NON-NEGOTIABLE INVARIANT: a microproduct deploys ONLY after an explicit founder gate
// approval — NEVER from composition and NEVER from a run. This is the wall graduating per
// item (like the autonomy ladder graduates a channel), not the wall removed. The gate node
// stays structurally present upstream; the deploy fires only when the founder cleared it.
//
// Two independent founder authorizations must BOTH pass before a single byte ships. This is
// defense in depth, modeled on how the rest of the harness already guards a release:
//
//   1. THE GATE STAMP — `item.approved === true`. This is the UNFORGEABLE structural wall, the
//      real guard. Exactly like every other execute connector (`local`, `http`, `artifact`), only
//      items the founder gate released are acted on. The gate connector OVERWRITES `approved` on
//      every item it emits and sets it true solely under a founder decision; graph.mjs's
//      `authorizeRelease` guard refuses to honor any approval the actor is not allowed to make
//      (see operator-runtime `authorizeGateRelease`). Composition's only reach is `node.config` and
//      graph topology — it cannot write the `approved` stamp the gate stamps at run time — so an
//      item carrying `approved === true` is, by construction, one a founder released through the wall.
//
//   2. THE DEPLOY CONFIRMATION — an EXPLICIT founder deploy authorization, a secondary
//      defense-in-depth check ON TOP of GUARD 1. A deploy is heavier than a send, so an approved
//      item is still not deployed without a separate, explicit "yes, deploy this" act — the
//      connector mirror of `revision.mjs` `applyRevision(workspace, revision, confirmation)` refusing
//      to apply a patch unless `confirmation === true`. The connector reads it from EXACTLY ONE place:
//      `node.runtime.deployAuthorization`. graph.mjs rebuilds `node.runtime` from the founder's
//      approvals every run (`runGraph`'s `deployAuthorization` opt, set solely by `resolveOperatorGate`
//      from a founder `payload.deployConfirmed === true`), so it is the one writer composition cannot
//      reach — the typed graph-mutation path and a composed graph can only write `node.config` and the
//      graph topology. It is NEVER read from `node.config`, and — critically — NEVER from the run
//      context: `resolveContext` maps ANY upstream node's emitted `{ type:"context",
//      id:"deployAuthorization" }` item onto the context object, so a context fallback would let a
//      composed graph self-supply this confirmation and walk a normal approval straight past the wall.
//      Reading the runtime path alone makes GUARD 2 a real structural barrier, not just a guard resting
//      on GUARD 1. Even a channel promoted to `autonomous` (which auto-stamps `approved`) does NOT clear
//      this check: deploying still demands the explicit founder confirm, which only the host can write.
//
// With either authorization missing, the connector REFUSES: it ships nothing, marks every item
// `deployed: false` with a clear "refused — needs explicit founder gate approval" status, and
// returns `ok: false`. There is no silent send/deploy path.
//
// NOTE (status): the SHIP leg is now LIVE end-to-end (Area 5). The founder deploy confirmation is
// threaded — an explicit founder deploy confirm at the gate (`payload.deployConfirmed === true`) is
// built into a deploy authorization by `resolveOperatorGate` and carried through `runGraph` onto
// `node.runtime`, where this connector reads it. Both live runners are wired: the BYO git push (the
// primary alpha path — `config.repo` is set at compose time to the build worktree cut off the real
// repo, zero new credentials) and the hosted Vercel runner (`context.deployRunners.vercel`, populated
// beside `sendRunners` from an injected MCP deploy tool). With no worktree/remote configured (a
// standalone microproduct with no Vercel account) the connector still returns an honest blocked no-op,
// never a fake deploy. The safety contract — deploy is founder-only, needs BOTH authorizations, and is
// unforgeable by composition — is real and enforced now.

import { execFileSync } from "node:child_process";
import { isOrdinaryInRepoChange } from "./artifact.mjs";
import { hasOutwardRelease } from "../../graph.mjs";

export const meta = {
  id: "deploy",
  name: "Deploy microproduct",
  category: "execute",
  description:
    "Ships a founder-approved standalone microproduct through a configured deploy runner. Ordinary in-repo changes remain reviewed diffs and can never commit, push, open a pull request, merge, publish, or deploy here.",
  envKey: null,
  stub: false,
  outputKind: "artifact",
  allowed: ["deploy_standalone_microproduct_after_two_authorizations"],
  blocked: [
    "deploy_without_approval", "deploy_from_composition", "deploy_from_run", "go_live_unapproved",
    "commit_product_change", "push_product_change", "open_product_change_pr", "merge_product_change",
    "publish_product_change", "deploy_product_change",
  ],
  approvalRequired: ["continue_from_gate", "explicit_deploy_confirmation"],
};

// The explicit founder deploy confirmation, read ONLY from `node.runtime.deployAuthorization` — the
// one path graph.mjs rebuilds every run from the founder's approvals (runGraph's `deployAuthorization`
// opt, set solely by `resolveOperatorGate` from a founder `payload.deployConfirmed === true`). It is
// NEVER read from node.config (composition-controlled) and NEVER from the run context: `resolveContext`
// maps ANY upstream node's emitted `{ type:"context", id:"deployAuthorization" }` item onto the context,
// so a context fallback would let a composed graph self-supply this confirmation behind the wall. The
// runtime path is the only writer composition cannot reach, so it is the only one we trust.
function readDeployAuthorization(node) {
  const auth = node?.runtime?.deployAuthorization ?? null;
  if (!auth || typeof auth !== "object") return null;
  // Mirror revision.mjs's `confirmation !== true`: only an explicit confirmed flag authorizes.
  if (auth.confirmed !== true) return null;
  return auth;
}

// BYO primary path: a real git push to the founder's configured remote/branch (mirrors revision.mjs's
// execFileSync git helper). Only ever reached AFTER both authorizations pass. A custom deployImpl remains
// injectable; the built-in runner regression pushes only to a temporary local bare repository.
function defaultByoDeploy(node) {
  const repo = node.config?.repo;
  const remote = node.config?.remote || "origin";
  const branch = node.config?.branch || "main";
  if (!repo) {
    return { ok: false, error: "BYO deploy needs config.repo (a git worktree to push). None configured." };
  }
  try {
    execFileSync("git", ["-C", repo, "push", remote, branch], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, url: node.config?.deployUrl ?? null, runner: "byo", detail: `Pushed ${branch} to ${remote}.` };
  } catch (error) {
    const stderr = error?.stderr?.toString?.().trim();
    return { ok: false, error: stderr || `git push ${remote} ${branch} failed.` };
  }
}

// Hosted fallback: the Vercel MCP tool (mcp__claude_ai_Vercel__deploy_to_vercel). A headless connector
// cannot call an MCP tool directly, so the live runner is injected (context.deployRunners.vercel, the
// MCP-backed function). Absent a wired runner this returns an honest blocked no-op — never a fake deploy.
function resolveVercelRunner(node, context) {
  return node?.config?.vercelDeploy ?? context?.deployRunners?.vercel ?? null;
}

export async function run(node, upstream, context) {
  const deployedAt = new Date().toISOString();
  const approved = upstream.filter((item) => item.approved === true);
  const ordinaryProductChanges = approved.filter((item) => isOrdinaryInRepoChange(item));
  const deployable = approved.filter((item) => !isOrdinaryInRepoChange(item));
  const heldChanges = ordinaryProductChanges.map((item) => ({
    ...item,
    outputKind: "artifact",
    staged: true,
    deployed: false,
    live: false,
    executionStatus: "staged_for_review",
    deployStatus: "reviewed diff only — commit, push, pull request, merge, publish, and deploy remain blocked",
    effectBoundary: "reviewed_diff_only",
    externalEffectAuthorized: false,
  }));
  if (deployable.length === 0) {
    return {
      ok: true,
      items: heldChanges,
      meta: {
        deployed: 0,
        failed: 0,
        staged: heldChanges.length,
        reason: heldChanges.length ? "ordinary_product_change_boundary" : "no_gate_approved_items",
        note: heldChanges.length
          ? "Ordinary in-repo changes remain reviewed local diffs. No commit, push, pull request, merge, publish, or deploy was attempted."
          : "No gate-approved microproducts were present to deploy.",
      },
    };
  }

  // COMMON OUTWARD WALL — deploy shares the same host-issued release capability as every real sender.
  // A gate-approved item plus the deploy-specific confirmation is still insufficient if this run did not
  // originate from the founder's outward-release path. Greenlight and ambient runs never carry the token,
  // so a deployable artifact routed here stays held and the runner is never touched.
  if (!hasOutwardRelease(node)) {
    return {
      ok: false,
      blocked: true,
      blockedReason: "needs_release",
      items: [
        ...heldChanges,
        ...deployable.map((item) => ({
          ...item,
          outputKind: "artifact",
          deployed: false,
          live: false,
          executionStatus: "held_without_release",
          deployStatus: "held — outward release requires an explicit founder approval through the release wall.",
        })),
      ],
      error: "Deploy held: this run does not carry the founder outward-release capability.",
      meta: { deployed: 0, staged: heldChanges.length, refused: deployable.length, reason: "missing_outward_release" },
    };
  }

  // GUARD 2 — deploy's additional explicit founder confirmation. The common release capability above says
  // this run may cross the outward wall; this second authorization says this specific deploy may ship.
  const authorization = readDeployAuthorization(node);
  if (!authorization) {
    return {
      ok: false,
      items: [
        ...heldChanges,
        ...deployable.map((item) => ({
          ...item,
          outputKind: "artifact",
          deployed: false,
          live: false,
          executionStatus: "deploy_refused",
          deployStatus: "refused — a standalone microproduct deploys only after an explicit founder gate approval and a separate deploy confirmation; the confirmation was not supplied.",
        })),
      ],
      error:
        "Deploy refused: no explicit founder deploy authorization. A microproduct deploys only after the founder explicitly approves the deploy at the gate — never from composition and never from a run.",
      meta: { deployed: 0, staged: heldChanges.length, refused: deployable.length, reason: "missing_founder_deploy_authorization" },
    };
  }

  // GUARD 1 — the gate stamp. Only founder-approved items ship; everything else is dropped, exactly
  // like local/http/artifact. The gate is the release, not this node.
  const runner = node.config?.deployImpl
    ? "custom"
    : (node.config?.runner || "byo"); // "byo" (git push/hook) | "vercel" (hosted fallback)
  const vercelRunner = runner === "vercel" ? resolveVercelRunner(node, context) : null;

  const items = [...heldChanges];
  let deployed = 0;
  let failed = 0;
  for (const item of deployable) {
    let outcome;
    if (typeof node.config?.deployImpl === "function") {
      // Injectable runner (tests, or a founder's custom deploy command).
      outcome = await node.config.deployImpl(node, item, context);
    } else if (runner === "vercel") {
      outcome = vercelRunner
        ? await vercelRunner(node, item, context)
        : { ok: false, error: "Hosted Vercel deploy is the fallback, but no Vercel MCP runner is wired (context.deployRunners.vercel). Nothing shipped." };
    } else {
      outcome = defaultByoDeploy(node);
    }

    if (outcome?.ok) {
      deployed += 1;
      items.push({
        ...item,
        outputKind: "artifact",
        deployed: true,
        live: true,
        executionStatus: "deployed",
        deploymentUrl: outcome.url ?? null,
        deployRunner: outcome.runner ?? runner,
        deployedAt,
        deployedBy: authorization.releasedBy ?? authorization.userId ?? null,
        deployDetail: outcome.detail ?? null,
      });
    } else {
      failed += 1;
      items.push({
        ...item,
        outputKind: "artifact",
        deployed: false,
        live: false,
        executionStatus: "deploy_failed",
        deployedAt,
        error: outcome?.error ?? "Deploy failed.",
      });
    }
  }

  return {
    ok: failed === 0,
    items,
    meta: {
      deployed,
      failed,
      staged: heldChanges.length,
      runner: typeof node.config?.deployImpl === "function" ? "custom" : runner,
      authorizedBy: authorization.releasedBy ?? authorization.userId ?? "founder",
      note: `${deployed} of ${deployable.length} founder-approved standalone microproduct${deployable.length === 1 ? "" : "s"} deployed via ${runner}; ${heldChanges.length} ordinary product change${heldChanges.length === 1 ? " remains" : "s remain"} staged as reviewed diffs.`,
    },
    ...(failed ? { error: `${failed} deploy${failed === 1 ? "" : "s"} failed.` } : {}),
  };
}
