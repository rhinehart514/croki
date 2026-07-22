// The firm's agent-facing MCP tools share one shape and dispatch through
// the SAME brainPost/brainGet helpers mcp.mjs already owns (passed in, not re-implemented, so every
// mutating call carries mcp.mjs's own x-gtm-actor: agent stamp — the ONE place that header is set).
//
// THE AGENT DOOR NEVER DECIDES. Every founder-only write in the firm (wall.decide's release/kill/
// authorize-deploy and product-change review/apply/revert/discard run through
// authorizeFounderWriteForRequest, which refuses any request carrying x-gtm-actor: agent — see
// routes/founder-authority.mjs. So there is no tool here for decide/release/kill/authorize-deploy/
// set_heat by construction: even a hand-crafted brainPost straight at those routes is rejected by the
// SAME guard every local-page founder write already stands on. This file adds no new authority and
// no new bypass — it only reaches scoped inward work, provisional model changes, and prepared outward
// material. None of these operations can promote current truth or execute in the world.
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


  async function readCurrentModel({ ventureId }) {
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/model`);
  }

  async function createModelBranch({ ventureId, name, question, parentBranchRef, scopeRefs, threadRefs, sourceRefs }) {
    return brainPost(`/api/ventures/${encodeURIComponent(ventureId)}/model/branches`, { name, question, parentBranchRef, scopeRefs, threadRefs, sourceRefs });
  }

  async function readModelBranch({ ventureId, branchId }) {
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/model/branches/${encodeURIComponent(branchId)}`);
  }

  async function proposeModelChange({ ventureId, branchId, targetFamily, targetRef, operation, proposedRecord, patch, rationale, sourceRefs, supersedesRef }) {
    return brainPost(`/api/ventures/${encodeURIComponent(ventureId)}/model/branches/${encodeURIComponent(branchId)}/changes`, { targetFamily, targetRef, operation, proposedRecord, patch, rationale, sourceRefs, supersedesRef });
  }

  async function compareModelBranches({ ventureId, branchId, withBranchIds }) {
    const query = new URLSearchParams();
    for (const id of withBranchIds ?? []) query.append("with", id);
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/model/branches/${encodeURIComponent(branchId)}/compare?${query}`);
  }

  async function startScopedWork({ ventureId, workScopeId, participantRef, goal, subjectRefs, runtime, model }) {
    return brainPost(`/api/ventures/${encodeURIComponent(ventureId)}/drive`, { workScopeId, teammateRef: participantRef, goal, subjectRefs, runtime, model });
  }

  async function prepareOutwardAction({ ventureId, kind, subjectRefs, branchRefs, motionRefs, productDeltaRefs, workRefs, decisionRef, preparedMaterial, expectedReturn }) {
    return brainPost(`/api/ventures/${encodeURIComponent(ventureId)}/outward-actions`, { kind, subjectRefs, branchRefs, motionRefs, productDeltaRefs, workRefs, decisionRef, preparedMaterial, expectedReturn });
  }

  async function watchForReturn({ ventureId }) {
    return brainGet(`/api/ventures/${encodeURIComponent(ventureId)}/market-movement`);
  }

  const VENTURE_ID = { type: "string", description: "The venture id." };
  const BRANCH_ID = { type: "string", description: "The durable provisional Product model branch id." };
  const REF_LIST = { type: "array", items: { type: "string" } };

  return [
    {
      name: "read_current_model",
      description: "Read adopted Product/GTM truth, durable provisional alternatives, live work authority, outward actions, and evidence joins. Read-only.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID }, required: ["ventureId"] },
      handler: readCurrentModel,
    },
    {
      name: "create_model_branch",
      description: "Create a durable provisional Product/GTM alternative. It never changes adopted truth.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID, name: { type: "string" }, question: { type: "string" }, parentBranchRef: { type: "string" }, scopeRefs: REF_LIST, threadRefs: REF_LIST, sourceRefs: REF_LIST }, required: ["ventureId", "question"] },
      handler: createModelBranch,
    },
    {
      name: "read_model_branch",
      description: "Read one provisional Product/GTM alternative with its exact delta, sources, and current-truth conflicts.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID, branchId: BRANCH_ID }, required: ["ventureId", "branchId"] },
      handler: readModelBranch,
    },
    {
      name: "propose_model_change",
      description: "Add a source-bearing create, update, or removal to a provisional Product/GTM alternative. Founder review is still required before it becomes current.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID, branchId: BRANCH_ID, targetFamily: { type: "string", enum: ["objects", "relationships"] }, targetRef: { type: "string" }, operation: { type: "string", enum: ["create", "update", "remove"] }, proposedRecord: { type: "object" }, patch: { type: "object" }, rationale: { type: "string" }, sourceRefs: REF_LIST, supersedesRef: { type: "string" } }, required: ["ventureId", "branchId", "targetFamily", "operation", "rationale", "sourceRefs"] },
      handler: proposeModelChange,
    },
    {
      name: "compare_model_branches",
      description: "Compare two or more durable provisional Product/GTM alternatives without promoting either.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID, branchId: BRANCH_ID, withBranchIds: { ...REF_LIST, minItems: 1 } }, required: ["ventureId", "branchId", "withBranchIds"] },
      handler: compareModelBranches,
    },
    {
      name: "start_scoped_work",
      description: "Start exact inward work inside an existing founder-authorized continuing scope. This cannot widen the scope, act outward, or change adopted Product truth.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID, workScopeId: { type: "string" }, participantRef: { type: "string", description: "The configured Claude, Codex, or specialist participant for this exact Run." }, goal: { type: "string" }, subjectRefs: REF_LIST, runtime: { type: "string" }, model: { type: "string" } }, required: ["ventureId", "workScopeId", "participantRef", "goal"] },
      handler: startScopedWork,
    },
    {
      name: "prepare_outward_action",
      description: "Prepare one exact world-crossing act with its Product/GTM context and expected return. This never executes the act.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID, kind: { type: "string" }, subjectRefs: REF_LIST, branchRefs: REF_LIST, motionRefs: REF_LIST, productDeltaRefs: REF_LIST, workRefs: REF_LIST, decisionRef: { type: "string" }, preparedMaterial: { type: "object" }, expectedReturn: { type: "object" } }, required: ["ventureId", "kind", "decisionRef"] },
      handler: prepareOutwardAction,
    },
    {
      name: "watch_for_return",
      description: "Read what is moving, what needs founder judgment, and what evidence has returned to exact Product/GTM context. Read-only.",
      inputSchema: { type: "object", properties: { ventureId: VENTURE_ID }, required: ["ventureId"] },
      handler: watchForReturn,
    },
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
  ];
}
