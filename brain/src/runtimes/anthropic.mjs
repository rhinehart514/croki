// Anthropic API teammate runtime — the direct-key runtime.
//
// This is the original in-process model/tool loop, moved behind the runtime
// interface (see ./index.mjs for the contract). It owns nothing durable: GTM
// Drover supplies every persistence, wall, and cancellation decision through the
// `ctx` callbacks. This adapter only turns the conversation into the next model
// turn and asks GTM IDE to execute the tool calls it produced.

import { Anthropic } from "@anthropic-ai/sdk";

export const anthropicRuntime = {
  id: "anthropic",
  label: "Anthropic API",

  // Available when a client is injected (tests / custom transport) or a key is set.
  isAvailable({ client, env = process.env } = {}) {
    if (client) return { ok: true, auth: "client" };
    if (env.ANTHROPIC_API_KEY) return { ok: true, auth: "api-key" };
    return { ok: false, reason: "ANTHROPIC_API_KEY is not set." };
  },

  // Drive the session to its next pause. Returns one of:
  //   { kind: "completed", summary }  — model stopped with no tool call
  //   { kind: "paused" }              — a tool reached the wall / founder input / completion
  //   { kind: "cancelled" }           — GTM IDE flagged a durable cancel mid-flight
  //   { kind: "budget" }              — exhausted the step budget without finishing
  async drive(ctx) {
    const client = ctx.client || new Anthropic();
    let messages = ctx.initialMessages?.length
      ? ctx.initialMessages
      : [{ role: "user", content: ctx.goal }];
    let steps = ctx.stepCount;

    // The system prompt (teammate doctrine) + tool list are the stable prefix of every turn in this
    // loop — identical bytes turn after turn. Cache them so each subsequent turn reads the prefix at
    // ~0.1x instead of re-billing it. cache_control rides on the last system block (tools render before
    // system, so the breakpoint caches tools + system together). Only when system is a plain string —
    // a test may inject a block array with its own control, which we leave untouched.
    const cachedSystem = typeof ctx.system === "string" && ctx.system.trim()
      ? [{ type: "text", text: ctx.system, cache_control: { type: "ephemeral" } }]
      : ctx.system;

    while (steps < ctx.maxSteps) {
      if (ctx.isCancelled()) return { kind: "cancelled" };

      const response = await client.messages.create({
        model: ctx.model,
        // Room for adaptive thinking + a real tool-call turn. Thinking counts toward max_tokens, so the
        // prior 4096 could truncate a reasoned turn; streaming isn't used here, so stay under the HTTP
        // timeout ceiling. The teammate loop is reasoning-heavy — this is where thinking earns its cost.
        max_tokens: 16000,
        // Adaptive thinking + high effort: the teammate plans multi-step GTM work across tool calls, the
        // reasoning-heavy creator case the harness wants to think hard. Opus 4.8 (the pinned default)
        // takes adaptive thinking; effort lives inside output_config. A founder-injected client in tests
        // ignores these, so they only shape the real subscription-billed run.
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: cachedSystem,
        tools: ctx.tools,
        messages,
      });

      if (ctx.isCancelled()) return { kind: "cancelled" };
      steps = ctx.onTurn();

      const content = response.content ?? [];
      messages = [...messages, { role: "assistant", content }];
      const text = content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      if (text) ctx.onText(text);

      const toolUses = content.filter((block) => block.type === "tool_use");
      if (!toolUses.length) {
        ctx.persistMessages(messages);
        return {
          kind: "completed",
          summary: text || "The teammate finished without a final summary.",
        };
      }

      const results = [];
      let paused = false;
      for (let index = 0; index < toolUses.length; index += 1) {
        const tool = toolUses[index];
        if (ctx.isCancelled()) return { kind: "cancelled" };
        ctx.onToolStart(tool.name);
        try {
          const { result, pause } = await ctx.runTool({
            id: tool.id,
            name: tool.name,
            input: tool.input ?? {},
          });
          results.push(toolResultBlock(tool.id, result));
          if (pause) {
            for (const skipped of toolUses.slice(index + 1)) {
              results.push(toolResultBlock(skipped.id, {
                paused: true,
                note: "Not executed because the session reached a founder wall or required founder input.",
              }));
            }
            paused = true;
            break;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.onToolError(tool.name, message);
          results.push(toolResultBlock(tool.id, { error: message }, true));
        }
      }
      messages = [...messages, { role: "user", content: results }];
      ctx.persistMessages(messages);
      if (paused) return { kind: "paused" };
    }

    ctx.persistMessages(messages);
    return { kind: "budget" };
  },
};

function toolResultBlock(toolUseId, result, isError = false) {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: JSON.stringify(result),
    is_error: isError,
  };
}
