// Context providers — one interface over every grounding source.
//
// The context substrate's first principle (see docs/GOAL.md): you do NOT stuff a model with
// everything. Stuffing degrades output — context rot, lost-in-the-middle, the model averaging
// back toward the generic. Instead you assemble a cheap, high-signal BASE LAYER (the "map")
// and let the model pull detail through its own tools (Read/Grep/MCP). A provider owns one
// source and knows how to summarize it into that map.
//
// Contract — a provider is:
//   { name, layer, contribute(intent) -> { text, meta } | null }
// `contribute` returns null (an honest blank) when the source has nothing to add, exactly like
// the step-runtime defaults: a cold source reports the gap rather than fabricating a layer.
// `layer` is "base" (always-on map) or "retrieved" (deeper detail the model would otherwise
// pull). The host owns what's on the table; the rented intelligence owns the pull.

import { renderTasteProfile } from "../memory.mjs";

// Product provider — wraps the grounded scan (product-understanding.mjs). Cited reality only;
// it reports a BLIND win event honestly rather than implying attribution it cannot prove.
export function createProductProvider(understanding) {
  return {
    name: "product",
    layer: "base",
    contribute() {
      if (!understanding || !understanding.productName) return null;
      const lines = [`Product: ${understanding.productName}`];
      if (understanding.headline) lines.push(`What it is: ${understanding.headline}`);
      if (Array.isArray(understanding.stack) && understanding.stack.length) {
        lines.push(`Stack: ${understanding.stack.join(", ")}`);
      }
      const win = understanding.winEvent;
      if (win?.name) {
        const state = understanding.evidenceState === "blind"
          ? "attribution BLIND — its source is not found in the product code"
          : "attribution proven from product code";
        lines.push(`Win event: ${win.name} (${state})`);
      }
      const blind = (understanding.blindSpots ?? []).filter((b) => b && b.title);
      if (blind.length) {
        lines.push(`Known blind spots: ${blind.map((b) => b.title).join("; ")}`);
      }
      return {
        text: lines.join("\n"),
        meta: {
          evidenceState: understanding.evidenceState ?? null,
          blindSpots: blind.length,
          citations: (understanding.evidence ?? []).length,
        },
      };
    },
  };
}

// Taste provider — wraps the taste profile built from founder gate decisions. This is the
// compounding layer: the one thing raw Claude and competitors structurally cannot copy, because
// it is built from THIS founder's accumulated approvals, rejections, and edits.
export function createTasteProvider(profile) {
  return {
    name: "taste",
    layer: "base",
    contribute() {
      const text = renderTasteProfile(profile);
      if (!text) return null;
      return {
        text,
        meta: profile?.counts ?? {
          approved: profile?.approved?.length ?? 0,
          rejected: profile?.rejected?.length ?? 0,
          edits: profile?.edits?.length ?? 0,
        },
      };
    },
  };
}

// State provider — wraps the run ledger into a compact "what has been tried" summary so the
// model does not re-propose a move that already ran (or already failed). Derived from real
// recorded runs only; an empty ledger contributes nothing.
export function createStateProvider(runs = []) {
  return {
    name: "state",
    layer: "base",
    contribute() {
      if (!Array.isArray(runs) || !runs.length) return null;
      const recent = runs.slice(-5);
      const lines = recent.map((run) => {
        const when = typeof run.createdAt === "string" ? run.createdAt.slice(0, 10) : "?";
        const status = run.ok === false ? "failed" : "ok";
        const target = run.targetNodeId ? ` (target ${run.targetNodeId})` : "";
        const gates = Array.isArray(run.pendingGates) && run.pendingGates.length
          ? `, paused at gate ${run.pendingGates.join("/")}`
          : "";
        return `- ${when}: run ${status}${target}${gates}`;
      });
      return {
        text: `What has been tried (most recent ${recent.length} of ${runs.length} runs):\n${lines.join("\n")}`,
        meta: { totalRuns: runs.length, shown: recent.length },
      };
    },
  };
}

// Signal provider — external/market signal. Honest blank by default: until a real signal source
// is wired (web research, the leverage store), it contributes nothing rather than inventing a
// market read. A populated signal is a "retrieved" layer — detail the model would otherwise pull.
export function createSignalProvider(signal) {
  return {
    name: "signal",
    layer: "retrieved",
    contribute() {
      if (!signal || !signal.text) return null;
      return { text: signal.text, meta: { source: signal.source ?? "external" } };
    },
  };
}

// Market/buyer provider — the OUTSIDE-the-codebase grounding. The product provider reads the
// repo (what the product IS); this reads who the buyer is, their now-trigger, where they actually
// are, and the competitive reality — almost none of which lives in code, and most of what makes a
// go-to-market non-generic. Sourced from the founder's stored ICP/positioning when present; an
// honest blank otherwise (the ideator is told to research it live). This is a base layer because
// matching the real buyer is as load-bearing as matching the real product.
export function createMarketProvider(market) {
  return {
    name: "market",
    layer: "base",
    contribute() {
      if (!market || typeof market !== "object") return null;
      const lines = [];
      const buyer = market.buyer || market.icp?.buyer || market.icp?.description;
      if (buyer) lines.push(`Buyer: ${buyer}`);
      if (market.trigger || market.icp?.trigger) lines.push(`Now-trigger: ${market.trigger || market.icp.trigger}`);
      if (Array.isArray(market.channels) && market.channels.length) lines.push(`Where they are: ${market.channels.join(", ")}`);
      if (market.positioning?.category) lines.push(`Category: ${market.positioning.category}`);
      if (market.positioning?.promise) lines.push(`Promise: ${market.positioning.promise}`);
      if (Array.isArray(market.competitors) && market.competitors.length) lines.push(`Competing with: ${market.competitors.join(", ")}`);
      if (!lines.length) return null;
      return { text: lines.join("\n"), meta: { fields: lines.length } };
    },
  };
}

// Build providers from a live run's context object — the adapter that lets the assembler feed a
// real model call. The graph runner injects taste as `__memory`, grounding as `grounding`, the
// run ledger as `__state`, and buyer/market reality as `market`; each becomes a provider here.
// Unrecognized context keys (context-node output, `__run`) are left for the caller to pass through
// as-is. A provider whose source is absent simply isn't created, so the assembler stays an honest
// blank rather than a stub layer.
export function providersFromContext(context = {}) {
  const providers = [];
  if (context.grounding) providers.push(createProductProvider(context.grounding));
  if (context.market) providers.push(createMarketProvider(context.market));
  if (context.__memory) providers.push(createTasteProvider(context.__memory));
  if (Array.isArray(context.__state)) providers.push(createStateProvider(context.__state));
  if (context.signal) providers.push(createSignalProvider(context.signal));
  return providers;
}
