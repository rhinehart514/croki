// Resource node — visual declaration only, not executed by the runner.
// Downstream source nodes resolve this connector when they run.
export const meta = {
  id: "exa",
  name: "Exa Search API",
  category: "resource",
  description: "Neural semantic search for companies, people, and content.",
  envKey: "EXA_API_KEY",
  stub: false,
  allowed: ["search"],
  blocked: [],
  approvalRequired: [],
};

export async function run() {
  return { ok: true, items: [], meta: { declaration: true } };
}
