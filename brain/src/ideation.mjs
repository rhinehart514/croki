// The ideation harness — rented intelligence, not a hardcoded taxonomy.
//
// Opportunity generation used to be hand-written .mjs judgment: a fixed list of GTM signal
// patterns, each mapped to a pre-written channel, plus three hardcoded speculative bets and
// four hardcoded agents. That is the cage — it pre-shapes every product into the same
// outbound-flavored mold no matter what the code actually is.
//
// Here the host stays the walls (truth, state, gate, validation) and rents the thinking.
// The ideator reads the grounded reality AND the real repository, then proposes channels for
// THIS product with zero shape baked in: outbound, loops, pull, in-product code changes — all
// equally available, none privileged. The model decides; the founder gates.
//
// The runtime is injectable, mirroring step-runners.mjs:
//   - a fake ideator in tests,
//   - createClaudeIdeator() live on the founder's subscription,
//   - an honest blank default (returns nothing) when no runtime is wired — never fabricates.

import { createClaudeAgentInvoker } from "./agent-bridge.mjs";

// The no-shape doctrine, passed to the ideation agent. Edit ~/.claude/agents/gtm-ideate-channels.md
// to change how it ideates — the instruction is a markdown artifact, not host code.
export const IDEATION_PROMPT = `You are ideating the go-to-market channels for ONE specific product. Go-to-market is about the OUTSIDE world — who buys, why now, where they are — not just what the code does.

You are given the product's grounded reality (win event, attribution, stack, blind spots, cited to file:line) AND, when available, its buyer/market context. The codebase tells you what the product IS; it does NOT tell you who the customer is, what triggers them to buy, where they spend attention, or what the competition does. That outside reality is most of go-to-market.

Do the outside product thinking FIRST. Before proposing channels:
- Figure out the real buyer: the specific person/role who pays, their job, their pressure, their season.
- Find the now-trigger: why this buyer would act now, not someday.
- Locate them: the actual places, communities, events, and relationships where they already are.
- Read the competition: what the buyer's alternatives are and how they currently solve this.
Use web search and fetch to research the live market when the buyer or trigger isn't already in context. Then read a few key repo files only to confirm what the product really delivers.

Then propose the channels. Critical rules:

- Channels are buyer-shaped, not code-shaped. The strongest channels start from where the buyer is and what moves them (a referral path, a community, a trigger-based outreach, a partnership, a content motion the buyer actually reads). An in-product or code-repair channel is valid ONLY when a real instrumentation/attribution gap blocks measuring a buyer-facing motion — it supports go-to-market, it is not the go-to-market. Do not let the codebase pull every proposal inward.
- ZERO predefined shape. Outbound, in-product loop, pull/inbound, content, partnership, community, code-repair — all equally available, none privileged. Let the buyer and the product decide.
- Label origin honestly. "derived" cites real file:line evidence OR concrete researched market evidence (a named community, a real competitor, a real trigger). "speculative" is a genuine bet with no support yet, clearly marked. Never blur them, and never invent a file, a buyer, a community, or a trigger.
- Propose the reusable agents each channel needs as their own items (buyer research, qualification, drafting, learning, code-repair — whatever the channels actually require). Don't force a fixed set.

Work efficiently: research the buyer/market where context is thin, sample a few key files, then return your proposals. Finish well under your turn budget.

Return ONLY a JSON array. Each item:
{
  "type": "channel" | "agent",
  "title": "short name",
  "objective": "what this channel/agent is for",
  "rationale": "why, grounded in this product",
  "origin": "derived" | "speculative",
  "confidence": "high" | "medium" | "low",
  "evidence": [ { "label": "...", "file": "path", "line": 0, "text": "the cited line" } ],
  "input": { "type": "manual" | "csv" | "api", "label": "..." },
  "output": { "type": "manual" | "api", "label": "..." },
  "provider": "claude" | "codex",
  "prompt": "for agent items: the agent's working instruction"
}
Channels use input/output; agents use provider/prompt. Omit fields that don't apply. Return [] if you genuinely cannot ground a single proposal.`;

// Live ideator: reads the repo on the founder's subscription and returns proposals.
// Ideation explores a real codebase, so it gets a larger turn budget than an item-transform
// step — but the prompt also tells it to read selectively, since it already holds grounding.
export function createClaudeIdeator({ cwd = process.cwd(), model, maxTurns = 30, onText } = {}) {
  const invoke = createClaudeAgentInvoker({ cwd, model, maxTurns, onText });
  return async function ideate({ grounding, market }) {
    return invoke({
      ref: "gtm-ideate-channels",
      prompt: IDEATION_PROMPT,
      items: [],
      // grounding → product provider (the code); market → market provider (the buyer/outside).
      context: { grounding, ...(market ? { market } : {}) },
      config: {},
    });
  };
}
