// GTM pipeline runner — multi-channel, headless connector architecture.
// All channel branches run in parallel. Each channel's stages run sequentially.
// A failing stage stops that channel; other channels continue.

import { connectorsForType, defaultTemplate, getConnector, listConnectors } from "./connectors/registry.mjs";

async function runChannel(channel, icpItems, context) {
  const stageResults = [];
  let upstream = icpItems;

  for (const stage of channel.stages) {
    const connector = getConnector(stage.type, stage.connector || "default");

    if (!connector) {
      stageResults.push({
        stageId: stage.id, channelId: channel.id, type: stage.type,
        ok: false, items: [],
        error: `No connector "${stage.connector}" registered for type "${stage.type}".`,
      });
      break;
    }

    const configured = connector.meta.envKey ? !!process.env[connector.meta.envKey] : true;
    if (!configured && !connector.meta.stub) {
      stageResults.push({
        stageId: stage.id, channelId: channel.id, type: stage.type,
        ok: false, items: [],
        error: `${connector.meta.name} requires ${connector.meta.envKey}. Add it to your environment and restart.`,
      });
      break;
    }

    try {
      const result = await connector.run(stage, upstream, context);
      stageResults.push({
        stageId: stage.id, channelId: channel.id,
        type: stage.type, connector: stage.connector,
        ...result,
      });
      upstream = result.items;
    } catch (err) {
      stageResults.push({
        stageId: stage.id, channelId: channel.id, type: stage.type,
        ok: false, items: [],
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }

  return {
    channelId: channel.id,
    label: channel.label,
    ok: stageResults.length === channel.stages.length && stageResults.every((s) => s.ok),
    stages: stageResults,
  };
}

export async function runPipeline(pipeline) {
  const { icp = {}, channels = [], context = {} } = pipeline;
  const icpItems = [{ type: "icp", ...icp }];

  const channelResults = await Promise.all(
    channels.map((ch) => runChannel(ch, icpItems, context))
  );

  return {
    ok: channelResults.every((c) => c.ok),
    channels: channelResults,
  };
}

export { connectorsForType, defaultTemplate, listConnectors };
