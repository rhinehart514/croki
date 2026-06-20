export const meta = {
  id: "openai",
  name: "OpenAI",
  type: "draft",
  description: "GPT-powered outreach drafting.",
  envKey: "OPENAI_API_KEY",
  stub: true,
};

export async function run() {
  throw new Error("OpenAI connector is not yet implemented. Set OPENAI_API_KEY and wire the SDK.");
}
