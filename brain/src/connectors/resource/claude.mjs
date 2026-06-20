export const meta = {
  id: "claude",
  name: "Claude (Anthropic)",
  category: "resource",
  description: "Anthropic Claude for generation, research, and reasoning.",
  envKey: "ANTHROPIC_API_KEY",
  stub: false,
  allowed: ["generate", "research", "classify"],
  blocked: ["send_without_approval"],
  approvalRequired: [],
};

export async function run() {
  return { ok: true, items: [], meta: { declaration: true } };
}
