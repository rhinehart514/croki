// The assembler — builds the base-layer context map from providers, instrumented.
//
// It does NOT pre-stuff detail. It composes the cheap, high-signal base layer and records a
// MANIFEST of exactly what went in: which providers contributed, their sizes, and their toggle
// state. Deep retrieval stays the model's job through its own tools — we own the map and the
// tools, not the pull.
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
