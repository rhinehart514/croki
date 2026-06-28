// The assembler — the pre-pack path. Builds the base-layer context map from providers and
// staples it to the prompt before the agent runs.
//
// This is the legacy default, not the only path. The agentic path (retrieval-tools.mjs) is
// the inversion: the agent pulls grounding through tools on demand rather than eating a
// pre-packed block. Both reuse the same provider summarizers (providers.mjs), so neither path
// can disagree on what a source says. The pre-pack stays the proven default while the agentic
// path is validated per-provider (E1.5/E1.6); neither is "the spine" — both are real paths
// over the same sources, and the cut-over is per-provider once the agentic version wins the
// comparison.
//
// The manifest is the instrument. Flip a provider off in `toggles`, reassemble, and compare the
// downstream output: that ablation is how the recipe — which context actually moves the model
// off the generic mean — is learned by building, not guessed up front. Instrumentation is here
// from line one, not bolted on as a later study.

const LAYER_ORDER = ["base", "retrieved"];
const LAYER_HEADERS = {
  base: "Grounded context",
  retrieved: "Pulled detail",
};

export function assembleContext({ providers = [], intent = "", toggles = {} } = {}) {
  const layers = [];
  const manifest = {
    intent: intent || null,
    assembledAt: new Date().toISOString(),
    providers: [],
  };

  for (const provider of providers) {
    if (!provider || typeof provider.contribute !== "function") continue;
    const name = provider.name ?? "unnamed";

    if (toggles[name] === false) {
      manifest.providers.push({ name, enabled: false, contributed: false });
      continue;
    }

    let contribution = null;
    try {
      contribution = provider.contribute(intent);
    } catch (error) {
      manifest.providers.push({
        name,
        enabled: true,
        contributed: false,
        error: String(error?.message ?? error),
      });
      continue;
    }

    if (!contribution || !contribution.text) {
      manifest.providers.push({ name, enabled: true, contributed: false });
      continue;
    }

    const layer = provider.layer === "retrieved" ? "retrieved" : "base";
    layers.push({ name, layer, text: contribution.text });
    manifest.providers.push({
      name,
      enabled: true,
      contributed: true,
      layer,
      chars: contribution.text.length,
      ...(contribution.meta ? { meta: contribution.meta } : {}),
    });
  }

  const text = renderLayers(layers, intent);
  manifest.totalChars = text.length;
  manifest.contributingProviders = layers.length;
  return { text, layers, manifest };
}

function renderLayers(layers, intent) {
  if (!layers.length) return "";
  const blocks = [];
  if (intent) blocks.push(`Intent: ${intent}`);
  for (const layerName of LAYER_ORDER) {
    const inLayer = layers.filter((entry) => entry.layer === layerName);
    if (!inLayer.length) continue;
    const body = inLayer.map((entry) => `[${entry.name}]\n${entry.text}`).join("\n\n");
    blocks.push(`--- ${LAYER_HEADERS[layerName]} ---\n${body}`);
  }
  return blocks.join("\n\n");
}
