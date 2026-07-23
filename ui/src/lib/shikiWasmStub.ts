// Build-time stand-in for "shiki/wasm". Croki always runs shiki's JavaScript regex engine
// (@pierre/diffs defaults to preferredHighlighter "shiki-js"), so the 622 KB inlined Oniguruma
// WASM binary would ship as dead weight in both the page and worker bundles. The alias in
// vite.config.ts points here instead. If a code path ever genuinely requests the WASM engine,
// this fails loudly rather than silently degrading highlighting.
export default function unavailableOnigurumaWasm(): never {
  throw new Error(
    "The Oniguruma WASM engine is not bundled. Croki highlights with shiki's JavaScript engine.",
  );
}
