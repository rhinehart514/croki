// Pipeline (channel) routes: autonomy promote/revoke, the explicit ICP link, cross-channel feeds, and
// channel CRUD (create/duplicate/update/get/derive-feed/compare-runs). Moved verbatim out of server.mjs.
// Promotion and the ICP link are founder acts, never reachable from the agent (MCP) surface; the Wall
// stays present on every path.
import { json, readBody } from "./util.mjs";
import {
  applySharedContextToGraph,
  createChannel,
  duplicateChannel,
  getChannel,
  loadProject,
  promoteChannel,
  revokeChannel,
  setChannelIcp,
  updateChannel,
} from "../project-store.mjs";
import { loadFlow, saveFlow } from "../flow-store.mjs";
import { applyGraphOperations, validateGraph } from "../graph-operations.mjs";
import { deriveChannelFeeds, deriveDirectedFeeds } from "../cross-reference.mjs";
import { compareChannelRuns } from "../run-compare.mjs";
import { authorizeFounderWriteForRequest } from "./session-guard.mjs";

export default async function handle({ req, res, url }) {
  // Channel autonomy — PROMOTE a channel up the ladder (draft → trusted → autonomous). This is a FOUNDER
  // act and the standing form of a gate approval: from now on the channel's gate auto-approves the clean
  // items against the blessed pattern and holds only the exceptions. It is never reachable from the agent
  // (MCP) surface and never fired by a run. The Wall does NOT disappear — the gate node stays present on
  // every path, the promotion is itself an explicit founder click, and `revoke` drops it back in one call.
  // promoteChannel itself refuses a missing blessed pattern and refuses a promote-to-draft; we reject the
  // draft target here too, loudly, so the founder gets a clear message instead of a generic throw.
  const projectChannelPromoteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/channels\/([^/]+)\/promote$/);
  if (req.method === "POST" && projectChannelPromoteMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Promoting pipeline trust");
      const projectId = decodeURIComponent(projectChannelPromoteMatch[1]);
      const channelId = decodeURIComponent(projectChannelPromoteMatch[2]);
      const body = await readBody(req);
      const autonomy = String(body?.autonomy || "trusted").trim();
      if (autonomy === "draft") {
        json(res, 400, { error: "Promote targets trusted or autonomous. To drop a channel back to draft, use revoke." });
        return true;
      }
      if (!body?.blessedPattern) {
        json(res, 400, { error: "Promoting a channel requires a blessed pattern — the standing approval the gate applies." });
        return true;
      }
      const { channel } = promoteChannel(channelId, { autonomy, blessedPattern: body.blessedPattern }, { projectId });
      json(res, 200, { channel });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Channel autonomy — REVOKE: drop a channel back to "draft" in one call, instantly reverting to
  // hold-everything at the gate and clearing the standing pattern off its gate nodes. Always available;
  // the founder can revoke trust the moment a run surprises them. Also a founder act, never an agent path.
  const projectChannelRevokeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/channels\/([^/]+)\/revoke$/);
  if (req.method === "POST" && projectChannelRevokeMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Revoking pipeline trust");
      const projectId = decodeURIComponent(projectChannelRevokeMatch[1]);
      const channelId = decodeURIComponent(projectChannelRevokeMatch[2]);
      const { channel } = revokeChannel(channelId, { projectId });
      json(res, 200, { channel });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Explicit pipeline→ICP link — the founder-set counterpart to experiment-derived ICP grounds. POST
  // sets the link ({ key, label? }); DELETE (or POST with no/blank key) clears it back to the base ICP
  // ground. Typed and reversible; it writes ONLY the channel's `icp` link and NEVER autonomy/blessedPattern,
  // so linking an ICP can never move a pipeline up the wall.
  const projectChannelIcpMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/channels\/([^/]+)\/icp$/);
  if ((req.method === "POST" || req.method === "DELETE") && projectChannelIcpMatch) {
    try {
      authorizeFounderWriteForRequest(req, "Changing a pipeline audience link");
      const projectId = decodeURIComponent(projectChannelIcpMatch[1]);
      const channelId = decodeURIComponent(projectChannelIcpMatch[2]);
      const icp = req.method === "DELETE" ? null : await readBody(req);
      const { channel } = setChannelIcp(channelId, icp, { projectId });
      json(res, 200, { channel });
    } catch (err) {
      json(res, Number.isInteger(err?.status) ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Channel feeds — undirected linkage between channels that share the same people, claims, or
  // experiment variables. One feed per channel pair, sorted by total shared entities descending.
  const projectChannelFeedsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/channel-feeds$/);
  if (req.method === "GET" && projectChannelFeedsMatch) {
    try {
      const projectId = decodeURIComponent(projectChannelFeedsMatch[1]);
      const { feeds } = deriveChannelFeeds(projectId);
      json(res, 200, { feeds });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Directional feeds — the founder-drawn links where one channel pulls another channel's output.
  const projectDirectedFeedsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/directed-feeds$/);
  if (req.method === "GET" && projectDirectedFeedsMatch) {
    try {
      const projectId = decodeURIComponent(projectDirectedFeedsMatch[1]);
      const { feeds } = deriveDirectedFeeds(projectId, { projectId });
      json(res, 200, { feeds });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/channels") {
    try {
      const body = await readBody(req);
      json(res, 201, createChannel(body));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const duplicateChannelMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/duplicate$/);
  if (req.method === "POST" && duplicateChannelMatch) {
    try {
      const body = await readBody(req);
      json(res, 201, duplicateChannel(decodeURIComponent(duplicateChannelMatch[1]), body));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const updateChannelMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/update$/);
  if (req.method === "POST" && updateChannelMatch) {
    try {
      const body = await readBody(req);
      json(res, 200, updateChannel(decodeURIComponent(updateChannelMatch[1]), body));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const channelMatch = url.pathname.match(/^\/api\/channels\/([^/]+)$/);
  if (req.method === "GET" && channelMatch) {
    try {
      const project = loadProject();
      const channel = getChannel(project, decodeURIComponent(channelMatch[1]));
      const flow = loadFlow(channel.graphId, null);
      json(res, 200, {
        channel,
        graph: applySharedContextToGraph(flow.graph, project.sharedContext, { channelOffer: channel.offer ?? null }),
        runs: flow.runs.slice(-10).map((run) => run.result),
      });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Drag-to-connect: wire this channel's source to pull from ANOTHER channel's output. Sets the
  // source node's config.sourceChannelId (the "derived" mode), validates, and persists. Read-only at
  // run time and still behind the founder gate — it only declares where the channel's input comes from.
  const channelDeriveMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/derive$/);
  if (req.method === "POST" && channelDeriveMatch) {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const channel = getChannel(project, decodeURIComponent(channelDeriveMatch[1]));
      const sourceChannelId = typeof body.sourceChannelId === "string" ? body.sourceChannelId : "";
      if (!sourceChannelId) { json(res, 400, { error: "sourceChannelId is required." }); return true; }
      if (sourceChannelId === channel.id) { json(res, 400, { error: "A channel cannot feed itself." }); return true; }
      getChannel(project, sourceChannelId); // throws 404 below if the source channel doesn't exist
      const flow = loadFlow(channel.graphId, null);
      const source = (flow.graph?.nodes ?? []).find((n) => n.category === "source" && n.kind !== "agent");
      if (!source) { json(res, 400, { error: "This channel has no connector source to wire a feed into." }); return true; }
      const applied = applyGraphOperations(flow.graph, [
        { type: "update_node", nodeId: source.id, patch: { config: { ...source.config, sourceChannelId } } },
      ]);
      const validation = validateGraph(applied.graph);
      if (!validation.ok) { json(res, 400, { error: `Invalid after wiring the feed: ${validation.errors.join(" ")}` }); return true; }
      const saved = saveFlow(applied.graph);
      json(res, 200, { ok: true, channelId: channel.id, sourceChannelId, sourceNodeId: source.id, graph: saved.graph });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const compareRunsMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/runs\/compare$/);
  if (req.method === "GET" && compareRunsMatch) {
    try {
      const project = loadProject();
      const channel = getChannel(project, decodeURIComponent(compareRunsMatch[1]));
      const flow = loadFlow(channel.graphId, null);
      const beforeId = url.searchParams.get("before");
      const afterId = url.searchParams.get("after");
      const before = beforeId ? flow.runs.find((run) => run.id === beforeId) : flow.runs.at(-2);
      const after = afterId ? flow.runs.find((run) => run.id === afterId) : flow.runs.at(-1);
      json(res, 200, { diff: compareChannelRuns(before, after) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
