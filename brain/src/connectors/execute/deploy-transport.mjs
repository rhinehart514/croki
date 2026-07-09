// The live deploy-runner map — the ship leg the deploy execute connector reaches to ACTUALLY go live.
//
// deploy.mjs is the WALL and the guardrails (the two founder authorizations, the gate stamp, the refuse
// path). It is deliberately transport-agnostic on HOW a byte reaches the world: the BYO git-push runner
// is implemented inline there (its zero-credential alpha default), and a HOSTED runner (Vercel) is read
// off `context.deployRunners.<runner>` — a function the host injects, exactly like `context.sendRunners`
// for a send. THIS module builds that map. It never reads the gate, never decides WHETHER to ship — the
// deploy connector already cleared BOTH authorizations before it ever calls a runner here. A runner just
// ships the one already-authorized artifact handed to it, or reports honestly why it could not.
//
// THE WALL IS UNTOUCHED BY THIS FILE. A runner in this map is only the HOW. The two founder
// authorizations (the gate stamp on the item + the explicit deploy confirmation on node.runtime) are the
// WHETHER, and deploy.mjs checks both BEFORE it reaches any runner. A missing runner degrades to an
// honest blocked no-op (deploy.mjs surfaces "no runner is wired"), never a fake ship.
//
// PRIMARY PATH (alpha): BYO git push. It needs ZERO new credentials — it uses the founder's own already-
// configured git remote — so it is deploy.mjs's built-in default runner, not one injected here. This map
// exists for the runners a headless connector CANNOT perform itself: the hosted Vercel deploy, which is
// an MCP tool call (mcp__claude_ai_Vercel__deploy_to_vercel) the connector process cannot make directly.

// The hosted Vercel runner. A headless execute connector cannot call an MCP tool, so the live MCP-backed
// deploy function is INJECTED (`deployToVercel`) and this wraps it into the runner shape deploy.mjs reads:
//   (node, item, context) => { ok, url?, runner, detail?, error? }
// The wrapper is pure plumbing — it hands the built artifact (the worktree or the artifact files) to the
// injected MCP function and normalizes its answer. It performs NO deploy of its own; absent an injected
// function it returns null so `defaultDeployRunners` omits the vercel slot entirely (honest-empty, never a
// fake runner). It never throws for an expected condition — a failed deploy is `{ ok:false, error }` so
// deploy.mjs records an honest `deploy_failed` item, never a fake "live".
export function createVercelRunner({ deployToVercel } = {}) {
  if (typeof deployToVercel !== "function") return null;
  return async function vercelRunner(node, item, context) {
    try {
      // The MCP deploy tool ships a built directory or artifact files. We pass the worktree the build leg
      // produced (config.repo / buildWorktree) and the artifact spec/files off the approved item, letting
      // the injected MCP function map them onto its own deploy_to_vercel call shape.
      const result = await deployToVercel({
        repo: node?.config?.repo ?? item?.buildWorktree ?? null,
        artifactSpec: item?.artifactSpec ?? null,
        artifactFiles: item?.artifactFiles ?? item?.files ?? null,
        target: node?.config?.target ?? null,
        context,
      });
      if (!result || result.ok === false) {
        return { ok: false, error: result?.error || "Vercel deploy returned no result." };
      }
      return {
        ok: true,
        url: result.url ?? result.deploymentUrl ?? null,
        runner: "vercel",
        detail: result.detail ?? "Deployed to Vercel via the injected MCP deploy tool.",
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
}

// The default live deploy-runner map the host injects into a run's context (the mirror of
// defaultSendRunners). BYO git push is deploy.mjs's OWN built-in default (zero new credentials — the
// primary alpha path), so it is NOT in this map; the map carries only the runners a headless connector
// cannot perform itself. Today that is the hosted Vercel runner, and ONLY when an MCP deploy function is
// wired (a Vercel account connected). With none wired the map is honestly empty and the deploy connector
// falls back to its BYO default — never a fabricated hosted deploy.
export function defaultDeployRunners(options = {}) {
  const runners = {};
  const vercel = createVercelRunner(options.vercel ?? {});
  if (vercel) runners.vercel = vercel;
  return runners;
}
