// Context node — product definition. Referenced by generate nodes for personalization context.
export const meta = {
  id: "product",
  name: "Product context",
  category: "context",
  description: "Product name, description, and value prop used in outreach generation.",
  envKey: null,
  stub: false,
};

export async function run(node) {
  const { name, description, valueProps = [] } = node.config;
  if (node.id === "ctx-learning") {
    return {
      ok: true,
      items: [{
        type: "context",
        id: "learning",
        repository: node.config.repository ?? {},
        product: node.config.product ?? {},
        positioning: node.config.positioning ?? {},
        icp: node.config.icp ?? {},
        founderTaste: node.config.founderTaste ?? {},
        outcomes: node.config.outcomes ?? [],
        experiments: node.config.experiments ?? [],
        productFeedback: node.config.productFeedback ?? [],
      }],
      meta: {
        type: "learning",
        observedOutcomes: node.config.outcomes?.filter?.((item) => item.observation === "observed").length ?? 0,
        founderDecisions: (node.config.founderTaste?.approvedPatterns?.length ?? 0)
          + (node.config.founderTaste?.rejectedPatterns?.length ?? 0),
      },
    };
  }
  return {
    ok: true,
    items: [{ type: "context", id: "product", name, description, valueProps }],
    meta: { type: "product" },
  };
}
