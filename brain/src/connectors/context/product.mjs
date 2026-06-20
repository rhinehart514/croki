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
  return {
    ok: true,
    items: [{ type: "context", id: "product", name, description, valueProps }],
    meta: { type: "product" },
  };
}
