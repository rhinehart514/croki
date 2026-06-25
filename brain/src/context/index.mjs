// The context substrate — the layer that makes the rented model non-generic on GTM and product
// work. Compose providers over the real grounding sources (scan, ledger, taste, signal), assemble
// the base-layer map, and hand a model call context that is selected and instrumented rather than
// dumped. This is the spine: composition, vibe-edits, runs, and debugging are all the same
// operation — a model call wrapped in assembled context — so the substrate is built once and
// everything above it is a view or a verb over it.

export { assembleContext } from "./assembler.mjs";
export {
  createProductProvider,
  createProductModelProvider,
  createMarketProvider,
  createTasteProvider,
  createStateProvider,
  createSignalProvider,
} from "./providers.mjs";
