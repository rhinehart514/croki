/**
 * One provider-neutral capability definition for every operator door.
 *
 * Transport changes the handler, never the actor/exposure/effect policy that
 * decides whether a model may invoke the capability.
 */
import { createCapabilityRegistry } from "./capability-registry.mjs";
import { filterSafeTools } from "./tool-safety.mjs";

const READ_ONLY_OPERATOR_CAPABILITIES = new Set([
  "inspect", "inspect_product", "inspect_shared_context", "inspect_graph",
  "inspect_problems", "inspect_run", "validate_graph",
]);

// Historical direct adapters can still emit this retired verb. It is never
// advertised; dispatching it reaches executeTool's durable rejection receipt.
export const DISPATCH_ONLY_OPERATOR_TOOLS = Object.freeze([{
  name: "patch_graph",
  description: "Retired graph mutation verb retained only to record a durable rejection for resumed sessions.",
  input_schema: { type: "object", properties: {} },
}]);

function inputSchema(tool) {
  return tool.input_schema ?? tool.inputSchema ?? {};
}

export function createOperatorCapabilityRegistry(tools, executor = null) {
  const safeTools = filterSafeTools(tools);
  return createCapabilityRegistry(safeTools.map((tool) => ({
    id: tool.name,
    description: tool.description,
    inputSchema: inputSchema(tool),
    allowedActors: ["model"],
    exposure: { operator: true, publicMcp: true },
    effects: READ_ONLY_OPERATOR_CAPABILITIES.has(tool.name)
      ? { readTargets: ["project"] }
      : { readTargets: ["project"], writeTargets: ["local-durable-state"] },
    approvalPolicy: { required: false, approvers: [], operation: "execute" },
    source: { owner: "drover", surface: "operator" },
    handler: async (input, context) => executor
      ? executor(tool, input, context)
      : tool.handler(input, context),
  })));
}

export function capabilityTools(registry, tools, { actor = "model", exposure = "operator" } = {}) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return registry.viewForActor(actor, exposure).map((capability) => {
    const tool = byName.get(capability.id);
    return {
      ...tool,
      description: capability.description,
      input_schema: capability.inputSchema,
      inputSchema: capability.inputSchema,
    };
  });
}
