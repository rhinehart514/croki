export const meta = {
  id: "gmail",
  name: "Gmail",
  category: "resource",
  description: "Gmail for sending founder-approved outreach. Send is always approval-required.",
  envKey: "GMAIL_OAUTH_TOKEN",
  stub: true,
  allowed: ["read_sent", "create_draft"],
  blocked: ["send_without_approval"],
  approvalRequired: ["send_email"],
};

export async function run() {
  return { ok: true, items: [], meta: { declaration: true } };
}
