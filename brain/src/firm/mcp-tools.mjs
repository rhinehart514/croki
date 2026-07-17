// The firm's agent-facing MCP tools share one shape and dispatch through
// the SAME brainPost/brainGet helpers mcp.mjs already owns (passed in, not re-implemented, so every
// mutating call carries mcp.mjs's own x-gtm-actor: agent stamp — the ONE place that header is set).
//
// THE AGENT DOOR NEVER DECIDES. Every founder-only write in the firm (wall.decide's release/kill/
// authorize-deploy, heat.setHeatSettings, product-change's review/apply/revert/discard) runs through
// authorizeFounderWriteForRequest, which refuses any request carrying x-gtm-actor: agent — see
// routes/founder-authority.mjs. So there is no tool here for decide/release/kill/authorize-deploy/
// set_heat by construction: even a hand-crafted brainPost straight at those routes is rejected by the
// SAME guard every local-page founder write already stands on. This file adds no new authority and
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

  async function readVentureArchitecture({ ventureId }) {
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/architecture`);
  }

  async function readArchitectureContext({ ventureId, architectureId, stepId }) {
    const query = new URLSearchParams({ id: architectureId });
    if (stepId) query.set("stepId", stepId);
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/architecture/context?${query}`);
  }

  async function proposeArchitectureChange({ ventureId, baseRevision, intent, operations, evidenceRefs, expectedExecutionEffect, unresolvedAssumptions }) {
    return brainPost(`/api/ventures/${encodeURIComponent(ventureId)}/architecture/proposals`, {
      baseRevision, intent, operations, evidenceRefs, expectedExecutionEffect, unresolvedAssumptions,
    });
  }

  async function listArchitectureProposals({ ventureId }) {
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/architecture/proposals`);
  }

  async function explainArchitecturePressure({ ventureId, architectureId }) {
    const query = architectureId ? `?subjectId=${encodeURIComponent(architectureId)}` : "";
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/architecture/pressure${query}`);
  }

  // Stages an isolated local worktree diff only — never touches the source repo (that needs the
  // founder's own review + apply, product-routes.mjs's founder-gated routes). Safe for the agent door.
  async function forkProductBet({ ventureId, betId, intent }) {
    return brainPost(`/api/ventures/${encodeURIComponent(ventureId)}/bets/${encodeURIComponent(betId)}/product-changes/fork`, { intent });
  }

  // Continues or steers a teammate on EXISTING founder-authorized work — stages bets/drafts/evidence and
  // parks anything outward at the wall; it can never release what it parks. This door may only resume a
  // bet (betId) or diverge from one (branchFrom); it cannot start fresh work, because nothing begins
  // without founder direction (FIRM-SPEC rail #1). It stays inward by the wall's own construction (F3).
  async function driveTeammate({ ventureId, teammateRef, teammateRefs, goal, betId, branchFrom, workRef, model }) {
    return brainPost(`/api/ventures/${encodeURIComponent(ventureId)}/drive`, {
      teammateRef, teammateRefs, goal, betId, branchFrom, workRef, model,
    });
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
      name: "read_venture_architecture",
      description: "Read the founder-confirmed living venture architecture and its current revision. Read-only; open connections are not execution semantics.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID }, required: ["ventureId"] },
      handler: readVentureArchitecture,
    },
    {
      name: "read_architecture_context",
      description: "Read one bounded architecture context with its product/system/motion/campaign trace, evidence qualifications, pressure, live joins, and explicit omissions.",
      inputSchema: {
        type: "object",
        properties: { ventureId: VENTURE_ID, architectureId: { type: "string" }, stepId: { type: "string" } },
        required: ["ventureId", "architectureId"],
      },
      handler: readArchitectureContext,
    },
    {
      name: "propose_architecture_change",
      description: "Propose finite semantic architecture operations for founder review. This never changes current architecture and never grants tools or outward authority.",
      inputSchema: {
        type: "object",
        properties: {
          ventureId: VENTURE_ID,
          baseRevision: { type: "integer", minimum: 0 },
          intent: { type: "string" },
          operations: { type: "array", items: { type: "object" }, minItems: 1 },
          evidenceRefs: { type: "array", items: { type: "string" } },
          expectedExecutionEffect: { type: "string" },
          unresolvedAssumptions: { type: "array", items: { type: "string" } },
        },
        required: ["ventureId", "baseRevision", "intent", "operations"],
      },
      handler: proposeArchitectureChange,
    },
    {
      name: "list_architecture_proposals",
      description: "List architecture suggestions and their founder-decision state. Read-only.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID }, required: ["ventureId"] },
      handler: listArchitectureProposals,
    },
    {
      name: "explain_architecture_pressure",
      description: "Explain concrete pressure reasons without a health score. Optionally scope to one architecture element.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID, architectureId: { type: "string" } }, required: ["ventureId"] },
      handler: explainArchitecturePressure,
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
      description: "Continue or steer a teammate on EXISTING founder-authorized work: it may fork divergent bets, stage drafts/evidence, and consult taste — anything that would touch the world parks at the wall for the founder to decide, and this tool cannot decide it. It cannot start fresh work: pass betId to resume a specific bet's paused work, or branchFrom to diverge from a named parent bet. A goal with neither is refused, because only the founder can begin new work.",
      inputSchema: {
        type: "object",
        properties: {
          ventureId: VENTURE_ID,
          teammateRef: { type: "string", description: "The teammate to drive." },
          teammateRefs: { type: "array", items: { type: "string" }, description: "Optional additional configured teammates explicitly targeted by this direction." },
          goal: { type: "string", description: "The goal this drive works toward, scoped to the existing bet." },
          betId: { type: "string", description: "Resume this bet's paused work. Required unless branchFrom is given — an agent cannot start fresh work." },
          branchFrom: { type: "string", description: "Diverge from this existing parent bet's id, seeding a distinct child bet before the drive begins. Use instead of betId to try another approach." },
          workRef: { type: "string", description: "Optional durable work id inside betId. Keeps revisions, wall acts, and returns attached to the exact work." },
          model: { type: "string", description: "Optional model override." },
        },
        required: ["ventureId", "teammateRef", "goal"],
      },
      handler: driveTeammate,
    },
  ];
}
