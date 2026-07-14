// The firm's agent-facing MCP tools share one shape and dispatch through
// the SAME brainPost/brainGet helpers mcp.mjs already owns (passed in, not re-implemented, so every
// mutating call carries mcp.mjs's own x-gtm-actor: agent stamp — the ONE place that header is set).
//
// THE AGENT DOOR NEVER DECIDES. Every founder-only write in the firm (wall.decide's release/kill/
// authorize-deploy, heat.setHeatSettings, product-change's review/apply/revert/discard) runs through
// authorizeFounderWriteForRequest, which refuses any request carrying x-gtm-actor: agent — see
// routes/session-guard.mjs:120-129. So there is no tool here for decide/release/kill/authorize-deploy/
// set_heat by construction: even a hand-crafted brainPost straight at those routes is rejected by the
// SAME guard every browser-only founder write already stands on. This file adds no new authority and
// no new bypass — it only reaches the reads and the two inward-only writes the wall already lets an
// unattended caller touch (forking a product-change worktree stages local isolated work only; driving a
// teammate stages bets/drafts and parks anything outward at the wall — it can never release it).
//
// FORBIDDEN_TOOL (tool-safety.mjs) screens the complete tool list — every name
// below is checked there exactly like every other tool; none matches approve/send/publish/deploy/charge.

export function createFirmTools({ brainGet, brainPost }) {
  async function listVentures() {
    return brainGet("/api/ventures");
  }

  async function getVenture({ ventureId }) {
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}`);
  }

  async function getVentureLens({ ventureId }) {
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/lens`);
  }

  async function listBets({ ventureId }) {
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/bets`);
  }

  async function getBet({ ventureId, betId }) {
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/bets/${encodeURIComponent(betId)}`);
  }

  async function readWall({ ventureId }) {
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/wall`);
  }

  // Stages an isolated local worktree diff only — never touches the source repo (that needs the
  // founder's own review + apply, product-routes.mjs's founder-gated routes). Safe for the agent door.
  async function forkProductBet({ ventureId, betId, intent }) {
    return brainPost(`/api/ventures/${encodeURIComponent(ventureId)}/bets/${encodeURIComponent(betId)}/product-changes/fork`, { intent });
  }

  // Starts/resumes one drive of a teammate — stages bets/drafts/evidence and parks anything outward at
  // the wall; it can never release what it parks. The one write this door has beyond staging, and it
  // stays inward by the wall's own construction (F3), not by anything this tool enforces itself.
  async function driveTeammate({ ventureId, teammateRef, goal, betId, model }) {
    return brainPost(`/api/ventures/${encodeURIComponent(ventureId)}/drive`, { teammateRef, goal, betId, model });
  }

  const VENTURE_ID = { type: "string", description: "The venture id." };
  const BET_ID = { type: "string", description: "The bet id, scoped to its venture." };

  return [
    {
      name: "list_ventures",
      description: "List every venture's manifest (id, name, created/updated). Read-only; the portfolio view. Use to find a ventureId before any venture-scoped call below.",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: listVentures,
    },
    {
      name: "get_venture",
      description: "Get one venture's manifest. Read-only.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID }, required: ["ventureId"] },
      handler: getVenture,
    },
    {
      name: "get_venture_lens",
      description: "Read the venture's lens: crew, bets, the wall, and the market's returns, as one live drawing of the firm. Read-only.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID }, required: ["ventureId"] },
      handler: getVentureLens,
    },
    {
      name: "list_bets",
      description: "List every bet in a venture. Read-only.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID }, required: ["ventureId"] },
      handler: listBets,
    },
    {
      name: "get_bet",
      description: "Get one bet's full record — intent, lineage, staged content, evidence (including any market voice). Read-only.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID, betId: BET_ID }, required: ["ventureId", "betId"] },
      handler: getBet,
    },
    {
      name: "read_wall",
      description: "Read the venture's wall queue — every item still awaiting the founder's decision. Read-only; this tool can never decide, release, kill, or authorize a deploy — those are founder-only acts the agent door structurally cannot reach.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID }, required: ["ventureId"] },
      handler: readWall,
    },
    {
      name: "fork_product_bet",
      description: "Fork an isolated local worktree for a bet's product change and stage a diff for founder review. Never touches the real source repository — that requires the founder's own separate review + apply. Safe to call unattended.",
      inputSchema: {
        type: "object",
        properties: { ventureId: VENTURE_ID, betId: BET_ID, intent: { type: "string", description: "What this product change is trying." } },
        required: ["ventureId", "betId", "intent"],
      },
      handler: forkProductBet,
    },
    {
      name: "drive_teammate",
      description: "Start or resume one drive of a teammate on a venture: it may fork divergent bets, stage drafts/evidence, and consult taste — anything that would touch the world parks at the wall for the founder to decide, and this tool cannot decide it. Omit betId to start fresh from a goal; pass betId to resume a specific bet's paused work.",
      inputSchema: {
        type: "object",
        properties: {
          ventureId: VENTURE_ID,
          teammateRef: { type: "string", description: "The teammate to drive." },
          goal: { type: "string", description: "The goal this drive works toward." },
          betId: { type: "string", description: "Optional. Resume this bet's paused work instead of starting fresh." },
          model: { type: "string", description: "Optional model override." },
        },
        required: ["ventureId", "teammateRef", "goal"],
      },
      handler: driveTeammate,
    },
  ];
}
