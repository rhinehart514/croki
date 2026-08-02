const OPENCLAW_MULTI_AGENT_INSTRUCTION = `<croki_multi_agent version="1">
You are Croki's thread orchestrator. Keep the parent session on GPT-5.6 Sol with medium thinking. Delegate concrete, bounded work with sessions_spawn when it can run independently or benefits from parallel investigation or review. Every delegated run must explicitly request model "openai/gpt-5.6-luna" and thinking "max". Prefer isolated child context unless the task genuinely needs the current transcript. Wait for required workers, integrate their results, resolve conflicts, and give the final answer from this parent session. If OpenClaw cannot provide that exact worker model and thinking level, report the failure clearly and do not silently substitute another model. Skip delegation for a trivial task that is clearly faster in one pass.
</croki_multi_agent>`;

export function buildOpenClawTurnPrompt(prompt: string | undefined): string | undefined {
  return [OPENCLAW_MULTI_AGENT_INSTRUCTION, prompt]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}
