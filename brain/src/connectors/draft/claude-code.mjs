// Generate connector — drafts outreach via the Claude Code subscription.
//
// Unlike draft/claude.mjs (which calls the Anthropic API and needs a raw
// ANTHROPIC_API_KEY), this connector drafts through the bundled Claude Code
// Agent SDK using the founder's existing Claude Code login — no key, billed to
// the subscription. That matches the product's "local harness on your own
// subscription" stance and lets the full loop run keyless.
//
// Auth (important): the Agent SDK resolves credentials first-match-wins —
// ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN win and bill via the API; with
// neither set it uses the Claude Code OAuth login (CLAUDE_CODE_OAUTH_TOKEN from
// `claude setup-token`, or the on-disk `claude /login` session). To force the
// subscription, this connector strips the API-key vars from the SDK's env. Set
// GTM_IDE_DRAFT_USE_API_KEY=1 to opt back into API-key billing.

import { query as agentQuery } from "@anthropic-ai/claude-agent-sdk";
import { renderDraftMemory } from "../../memory.mjs";

export const meta = {
  id: "claude-code",
  name: "Claude Code (subscription)",
  category: "generate",
  type: "draft",
  description: "Drafts personalized outreach via the Claude Code subscription. No API key.",
  envKey: null,
  stub: false,
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

// Force subscription auth unless the founder explicitly opts into API billing.
function subscriptionEnv() {
  const env = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "gtm-ide/0.3.0" };
  if (!process.env.GTM_IDE_DRAFT_USE_API_KEY) {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }
  return env;
}

// Single-shot generation: one turn, no tools, read the assistant text back.
async function draftOnce(runQuery, prompt, model) {
  let text = "";
  let resultText = null;
  const stream = runQuery({
    prompt,
    options: {
      ...(model ? { model } : {}),
      maxTurns: 1,
      tools: [],
      allowedTools: [],
      permissionMode: "bypassPermissions",
      settingSources: [],
      persistSession: false,
      env: subscriptionEnv(),
    },
  });
  for await (const message of stream) {
    if (message.type === "assistant" && Array.isArray(message.message?.content)) {
      for (const block of message.message.content) {
        if (block.type === "text" && typeof block.text === "string") text += block.text;
      }
    }
    if (message.type === "result" && typeof message.result === "string") resultText = message.result;
  }
  return (text.trim() || resultText || "").trim();
}

export async function run(stage, upstream, context) {
  const runQuery = stage.config?.queryImpl || agentQuery;

  const memory = context?.__memory ?? null;
  const memoryMeta = {
    approved: memory?.approved?.length ?? 0,
    rejected: memory?.rejected?.length ?? 0,
    edits: memory?.edits?.length ?? 0,
  };
  const memoryBlock = renderDraftMemory(memory);

  const prospects = upstream.filter((item) => item.type === "prospect");
  if (prospects.length === 0) return { ok: true, items: [], meta: { count: 0, memory: memoryMeta, runtime: "claude-code" } };

  const senderName = stage.config?.senderName || context?.senderName || "Jacob";
  const product = context?.product;
  const productContext = stage.config?.productContext
    || product?.description
    || product?.name
    || context?.productContext
    || "GTM IDE";
  const promptTemplate = stage.agentPrompt || DEFAULT_PROMPT;
  const model = stage.config?.model;

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
        const draft = await draftOnce(runQuery, filledPrompt, model);
        return { ...p, draft: draft || null };
      } catch (error) {
        return { ...p, draft: null, draftError: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  const failed = drafted.filter((p) => !p.draft).length;
  return {
    ok: failed === 0,
    items: drafted,
    meta: { count: drafted.length, drafted: drafted.length - failed, failed, memory: memoryMeta, runtime: "claude-code" },
    ...(failed ? { error: `${failed} draft${failed === 1 ? "" : "s"} could not be generated (check your Claude Code login).` } : {}),
  };
}
