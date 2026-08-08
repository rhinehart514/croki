import { describe, expect, it } from "@effect/vitest";

import {
  initialCodexScanState,
  mightCarryUsage,
  parseClaudeLine,
  parseCodexLine,
  totalTokens,
  type UsageLineParseResult,
  type UsageRecord,
} from "./usageTranscripts.ts";

function recordOf(result: UsageLineParseResult): UsageRecord | null {
  return result.status === "record" ? result.record : null;
}

/** Shaped after a real Claude Code assistant record. */
function claudeLine(overrides: {
  messageId: string;
  contentType: string;
  model?: string;
  outputTokens?: number;
}): string {
  return JSON.stringify({
    type: "assistant",
    timestamp: "2026-08-07T04:05:13.944Z",
    sessionId: "5a128faa-8253-489e-b935-6c08e8e670c0",
    cwd: "/home/theo/project",
    message: {
      id: overrides.messageId,
      role: "assistant",
      model: overrides.model ?? "claude-fable-5",
      content: [{ type: overrides.contentType }],
      usage: {
        input_tokens: 2,
        cache_creation_input_tokens: 66818,
        cache_read_input_tokens: 1000,
        output_tokens: overrides.outputTokens ?? 286,
      },
    },
  });
}

describe("parseClaudeLine", () => {
  it("extracts token totals and a dedupe key", () => {
    const record = recordOf(
      parseClaudeLine(claudeLine({ messageId: "msg_1", contentType: "text" })),
    );

    expect(record).not.toBeNull();
    expect(record?.provider).toBe("claude");
    expect(record?.model).toBe("claude-fable-5");
    expect(record?.totals).toEqual({
      uncachedInputTokens: 2,
      cachedInputTokens: 1000,
      cacheCreationTokens: 66818,
      outputTokens: 286,
      reasoningTokens: 0,
    });
    expect(record?.dedupeKey).toBe("msg_1:");
  });

  it("gives every content block of one message the same dedupe key", () => {
    // T3 Code writes one record per content block, each repeating the parent
    // message's full usage. Summing them would overcount ~2.4x on real data.
    const text = recordOf(parseClaudeLine(claudeLine({ messageId: "msg_2", contentType: "text" })));
    const toolUse = recordOf(
      parseClaudeLine(claudeLine({ messageId: "msg_2", contentType: "tool_use" })),
    );

    expect(text?.dedupeKey).toBe(toolUse?.dedupeKey);
    expect(text?.totals).toEqual(toolUse?.totals);
  });

  it("leaves ordinary lines outside the usage gate and rejects malformed candidates", () => {
    const userLine = JSON.stringify({ type: "user", message: {} });
    expect(mightCarryUsage(userLine, "claude")).toBe(false);
    expect(parseClaudeLine(JSON.stringify({ type: "user", message: { usage: {} } }))).toEqual({
      status: "malformed",
    });
    expect(
      parseClaudeLine(
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-08-07T04:05:13.944Z",
          message: { model: "claude-fable-5", usage: {} },
        }),
      ),
    ).toEqual({ status: "malformed" });
    expect(parseClaudeLine('{"usage":')).toEqual({ status: "malformed" });
  });
});

describe("parseCodexLine", () => {
  const sessionMeta = JSON.stringify({
    type: "session_meta",
    timestamp: "2026-08-01T05:17:41.289Z",
    payload: { type: "session_meta", id: "019fbbc1-b12c-7360-a685-28c181f0025f" },
  });
  const turnContext = JSON.stringify({
    type: "turn_context",
    timestamp: "2026-08-01T05:17:42.694Z",
    payload: { type: "turn_context", model: "gpt-5.6-sol" },
  });
  const tokenCount = (inputTokens: number, cached: number, output: number, reasoning: number) =>
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-08-01T05:17:49.919Z",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: inputTokens,
            cached_input_tokens: cached,
            cache_write_input_tokens: 0,
            output_tokens: output,
            reasoning_output_tokens: reasoning,
          },
        },
      },
    });

  it("attributes usage to the model from the preceding turn context", () => {
    const state = initialCodexScanState();
    parseCodexLine(sessionMeta, state);
    parseCodexLine(turnContext, state);
    const record = recordOf(parseCodexLine(tokenCount(19239, 11008, 299, 116), state));

    expect(record?.provider).toBe("codex");
    expect(record?.model).toBe("gpt-5.6-sol");
    expect(record?.sessionId).toBe("019fbbc1-b12c-7360-a685-28c181f0025f");
    // Codex reports input_tokens inclusive of the cached portion.
    expect(record?.totals.uncachedInputTokens).toBe(19239 - 11008);
    expect(record?.totals.cachedInputTokens).toBe(11008);
    expect(record?.totals.reasoningTokens).toBe(116);
  });

  it("skips a repeated token_count so deltas are not double counted", () => {
    const state = initialCodexScanState();
    parseCodexLine(turnContext, state);
    const first = recordOf(parseCodexLine(tokenCount(100, 0, 10, 0), state));
    const repeat = parseCodexLine(tokenCount(100, 0, 10, 0), state);

    expect(first).not.toBeNull();
    expect(repeat).toEqual({ status: "ignored" });
  });

  it("counts identical usage deltas in consecutive turns", () => {
    const state = initialCodexScanState();
    parseCodexLine(turnContext, state);
    const firstTurn = recordOf(parseCodexLine(tokenCount(100, 0, 10, 0), state));
    const firstTurnRepeat = parseCodexLine(tokenCount(100, 0, 10, 0), state);

    parseCodexLine(turnContext, state);
    const secondTurn = recordOf(parseCodexLine(tokenCount(100, 0, 10, 0), state));
    const secondTurnRepeat = parseCodexLine(tokenCount(100, 0, 10, 0), state);

    expect(firstTurn).not.toBeNull();
    expect(firstTurnRepeat).toEqual({ status: "ignored" });
    expect(secondTurn).not.toBeNull();
    expect(secondTurnRepeat).toEqual({ status: "ignored" });
  });

  it("marks usage that arrives before any model is known as malformed", () => {
    const state = initialCodexScanState();
    expect(parseCodexLine(tokenCount(100, 0, 10, 0), state)).toEqual({ status: "malformed" });
  });

  it("does not let a pre-model event poison the duplicate signature", () => {
    // A token_count before its turn_context is dropped; the identical event
    // re-emitted once the model is known must still be counted.
    const state = initialCodexScanState();
    expect(parseCodexLine(tokenCount(100, 0, 10, 0), state)).toEqual({ status: "malformed" });
    parseCodexLine(turnContext, state);
    expect(recordOf(parseCodexLine(tokenCount(100, 0, 10, 0), state))).not.toBeNull();
  });

  it("distinguishes a valid zero delta from an unrecognized token payload", () => {
    const state = initialCodexScanState();
    parseCodexLine(turnContext, state);
    expect(parseCodexLine(tokenCount(0, 0, 0, 0), state)).toEqual({ status: "ignored" });
    expect(
      parseCodexLine(
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-08-01T05:17:49.919Z",
          payload: { type: "token_count", info: { last_token_usage: {} } },
        }),
        state,
      ),
    ).toEqual({ status: "malformed" });
  });
});

describe("totalTokens", () => {
  it("does not add reasoning on top of output", () => {
    expect(
      totalTokens({
        uncachedInputTokens: 10,
        cachedInputTokens: 20,
        cacheCreationTokens: 30,
        outputTokens: 40,
        reasoningTokens: 25,
      }),
    ).toBe(100);
  });
});
