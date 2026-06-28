// Context grounding — two paths, one source of truth.
//
// The job is the same: make the rented model non-generic on GTM and product work by grounding it in
// the real scan, ledger, taste, and market. What changed (E1) is HOW the grounding reaches the
// model. The original path PRE-PACKS: `assembleContext` composes the providers into one base-layer
// block stapled to the prompt. The agentic path (retrieval-tools.mjs) inverts that — each source
// becomes a TOOL the agent calls when it decides it needs that source, so it grounds itself live
// and on-demand instead of eating a packed lunch. Both reuse the same provider summarizers, so the
// two paths can never disagree on what a source says; they differ only in who decides to read it.
//
// The pre-pack is the proven default; the agentic path runs in parallel behind a flag and is cut
// over per-provider once it wins the comparison (E1.5/E1.6). The host owns the sources, the tools,
// and the wall — never the pull.

export { assembleContext } from "./assembler.mjs";
export {
  createProductProvider,
  createProductModelProvider,
  createMarketProvider,
  createTasteProvider,
  createStateProvider,
  createSignalProvider,
} from "./providers.mjs";
