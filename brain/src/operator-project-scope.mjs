import { loadFlow } from "./flow-store.mjs";
import { getProjectChannels, loadProject } from "./project-store.mjs";

// Resolve graph/pipeline references only through the owning project's channel registry. This is the
// shared guard used before a session binds a graph and before any operator path loads or executes it.
export function graphIdForRef(ref, options = {}) {
  if (!ref || (ref.type !== "graph" && ref.type !== "pipeline")) return null;
  if (!options.projectId) return ref.id;
  const project = loadProject(options);
  const channel = getProjectChannels(project, options).find((item) => item.id === ref.id || item.graphId === ref.id);
  if (!channel?.graphId) throw new Error(`${ref.type === "graph" ? "Graph" : "Pipeline"} ${ref.id} does not belong to project ${project.id}.`);
  const flow = loadFlow(channel.graphId, null, options);
  if (!flow.graph || flow.graph.id !== channel.graphId) throw new Error(`Graph ${channel.graphId} is not available for project ${project.id}.`);
  return channel.graphId;
}

export function assertSessionGraphProject(session, options = {}) {
  if (!session?.graphId || !session?.projectId) return session?.graphId ?? null;
  return graphIdForRef({ type: "graph", id: session.graphId }, { ...options, projectId: session.projectId });
}
