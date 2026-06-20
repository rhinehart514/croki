export const meta = {
  id: "apollo",
  name: "Apollo",
  type: "find",
  description: "Apollo.io people and company search.",
  envKey: "APOLLO_API_KEY",
  stub: true,
};

export async function run() {
  throw new Error("Apollo connector is not yet implemented. Switch to Exa or add APOLLO_API_KEY support.");
}
