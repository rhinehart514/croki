import { Anthropic } from "@anthropic-ai/sdk";
import { renderDraftMemory } from "../../memory.mjs";

export const meta = {
  id: "claude",
  name: "Claude",
  type: "draft",
  description: "Claude-powered personalized outreach drafting.",
  envKey: "ANTHROPIC_API_KEY",
};

const DEFAULT_PROMPT = `Write a short, warm, personalized cold outreach message.

Sender: {senderName}
Product: {productContext}
Prospect: {prospectName}
What I know about them: {prospectSummary}
Their site: {prospectUrl}

Rules:
- Under 100 words
- Open with something specific to them — not a compliment, something real
- One clear reason they would care
- Sign as {senderName}
- No subject line, no em-dashes, no bullet points, no corporate speak
- Plain and human

Return only the message body.`;

function fillPrompt(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

export async function run(stage, upstream, context) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it to your environment and restart.");
  }

  // Loop memory: founder decisions from prior runs, injected by the runner.
  const memory = context?.__memory ?? null;
  const memoryMeta = {
    approved: memory?.approved?.length ?? 0,
    rejected: memory?.rejected?.length ?? 0,
    edits: memory?.edits?.length ?? 0,
  };
  const memoryBlock = renderDraftMemory(memory);

  const prospects = upstream.filter((i) => i.type === "prospect");
  if (prospects.length === 0) return { ok: true, items: [], meta: { count: 0, memory: memoryMeta } };

  const client = new Anthropic();
  const senderName = stage.config.senderName || context?.senderName || "Jacob";
  const product = context?.product;
  const productContext = stage.config.productContext
    || product?.description
    || product?.name
    || context?.productContext
    || "GTM IDE";
  const promptTemplate = stage.agentPrompt || DEFAULT_PROMPT;
  const model = stage.config.model || "claude-haiku-4-5-20251001";

  const drafted = await Promise.all(
    prospects.map(async (p) => {
      try {
        const filledPrompt = fillPrompt(promptTemplate, {
          senderName,
          productContext,
          prospectName: p.name,
          prospectSummary: p.summary?.slice(0, 300) || "limited public info",
          prospectUrl: p.url || "unknown",
        }) + memoryBlock;
        const message = await client.messages.create({
          model,
          max_tokens: 350,
          messages: [{ role: "user", content: filledPrompt }],
        });
        const draft = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
        return { ...p, draft };
      } catch {
        return { ...p, draft: null };
      }
    })
  );

  return { ok: true, items: drafted, meta: { count: drafted.length, memory: memoryMeta } };
}
