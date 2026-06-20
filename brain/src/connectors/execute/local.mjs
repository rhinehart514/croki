export const meta = {
  id: "local",
  name: "Local execution queue",
  category: "execute",
  description: "Stages founder-approved actions locally. It never sends, publishes, or contacts anyone.",
  envKey: null,
  stub: false,
  allowed: ["stage_approved_action", "export_for_manual_execution"],
  blocked: ["send", "publish", "deploy"],
  approvalRequired: ["continue_from_gate"],
};

export async function run(node, upstream) {
  const approved = upstream.filter((item) => item.approved === true);
  return {
    ok: true,
    items: approved.map((item) => ({
      ...item,
      executionStatus: "staged_locally",
      stagedAt: new Date().toISOString(),
      channel: node.config.channel || item.channel || "manual",
    })),
    meta: {
      staged: approved.length,
      note: "Approved actions were staged locally. No external action was taken.",
    },
  };
}
